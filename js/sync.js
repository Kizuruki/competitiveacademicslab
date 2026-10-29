// Talking to servers. Two of them:
//  • the bowl sites' worker (settings.mainUrl): log in with the same account, bring in what you've
//    already answered on the Geography site, send lab answers back so they count on that site (team
//    assignments, spaced review, mastery), and read your team assignments;
//  • the lab worker (settings.labUrl, worker/lab-worker.js): upload calibration results for the
//    school survey and download the blueprint built from everyone's results.
// Nothing is sent anywhere unless a URL is set and you're logged in or press a button.
import * as store from './store.js';
import * as model from './model.js';
import { clue as clueById, packOf } from './content.js';
import { blueprintFromRows } from './engine/personalize.js';
import { SLOW_MS } from './engine/memory.js';
import { dayKey } from './engine/util.js';

const s = () => store.current().settings;
const trim = (u) => String(u || '').replace(/\/+$/, '');
async function json(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`);
  return body;
}

// ---- account (same as the History and Geography sites) ----
export async function login(username, password) {
  const r = await json(`${trim(s().mainUrl)}/auth/login`, { method: 'POST', body: JSON.stringify({ username, password }) });
  if (!r.success) throw new Error(r.message || 'Login failed');
  store.current().profile.username = r.username;
  store.saveNow();
  return r.username;
}
export function logout() { store.current().profile.username = null; store.saveNow(); }
export const username = () => store.current().profile.username;

// ---- Geography site → lab ----
// GET /review-pool gives, per question, when it was last answered right and how often it was missed.
// Each becomes one answer in the lab's log at that time (rated Hard if it was ever missed), so those
// clues count as learned and come back as reviews instead of as new clues. Only site activity newer
// than anything the lab already has for that clue is brought in (answers the lab sent are skipped).
export async function importSiteHistory() {
  const user = username();
  if (!user) throw new Error('Log in first.');
  const r = await json(`${trim(s().mainUrl)}/review-pool/${encodeURIComponent(user)}?site=geo`);
  const d = store.current();
  const latest = new Map();
  for (const e of d.events) if (e.clue && e.clue.startsWith('geo:')) latest.set(e.clue, Math.max(latest.get(e.clue) || 0, e.t));
  const seen = d.sync.siteImported || (d.sync.siteImported = {});
  let added = 0;
  for (const [key, ts, wrong] of r.items || []) {
    const id = `geo:${key}`, t = Number(ts) || 0;
    if (!t || t <= (latest.get(id) || 0) + 15 * 60000) continue;
    const prevWrong = seen[key]?.wrong ?? 0;
    store.log({ type: 'answer', t, clue: id, pack: clueById(id)?.pack || null, correct: true, ms: Number(wrong) > prevWrong ? SLOW_MS + 1000 : 5000, phase: 'import', format: 'site', source: 'geo-site', timesWrong: Number(wrong) || 0 });
    seen[key] = { ts: t, wrong: Number(wrong) || 0 };
    added++;
  }
  d.sync.lastSiteImport = Date.now();
  store.saveNow();
  return { added, total: (r.items || []).length };
}

// ---- lab → Geography site ----
// The first graded answer to each Geography clue per day goes to POST /events (mode "lab"), the same
// record the site makes, so it counts for assignments, spaced review and mastery there too.
export async function sendSiteAnswers(events) {
  const user = username();
  if (!user || s().shareSiteAnswers === false || !s().mainUrl) return 0;
  const d = store.current();
  const sent = d.sync.siteSent || (d.sync.siteSent = {});
  const out = [];
  for (const e of events) {
    if (e.type !== 'answer' || !['study', 'review'].includes(e.phase) || e.credit === 'unread' || e.credit === 'read-before') continue;
    const c = clueById(e.clue);
    if (!c || !c.siteKey || packOf(c.pack)?.site !== 'geo') continue;
    const k = `${c.siteKey}|${dayKey(e.t)}`;
    if (sent[k]) continue;
    sent[k] = 1;
    out.push({ username: user, site: 'geo', mode: 'lab', category: c.category, subcategory: c.sub || null, questionKey: c.siteKey, correct: !!e.correct, responseMs: e.ms ?? null });
  }
  for (let i = 0; i < out.length; i += 50) await json(`${trim(s().mainUrl)}/events`, { method: 'POST', body: JSON.stringify({ events: out.slice(i, i + 50) }) });
  // only today's and yesterday's entries matter
  const keep = [dayKey(Date.now()), dayKey(Date.now() - 86400000)];
  for (const k of Object.keys(sent)) if (!keep.some((day) => k.endsWith(`|${day}`))) delete sent[k];
  store.saveNow();
  return out.length;
}

// Team assignments from the bowl sites (read-only here).
export async function teamAssignments() {
  const user = username();
  if (!user) return [];
  const out = [];
  for (const site of ['geo', 'history']) {
    try {
      const r = await json(`${trim(s().mainUrl)}/me/team/${encodeURIComponent(user)}?site=${site}`);
      for (const a of r.assignments || []) out.push({ ...a, site, categories: r.categories || [] });
    } catch (_) { /* offline or older worker */ }
  }
  return out;
}

// ---- lab worker ----
function stepRow(r) {
  const { fit, ...rest } = r;
  return { ...rest, fitP0: fit?.p0 ?? null, fitS: fit?.S ?? null };
}
export async function uploadLab() {
  const url = trim(s().labUrl);
  if (!url) throw new Error('Set the lab server address in Settings first.');
  const d = store.current();
  const base = {
    participant: d.profile.deviceId, participantIndex: d.profile.participant, name: d.profile.name, username: d.profile.username || null,
    protocol: d.calibration?.protocol || null, pace: d.pace.level,
    settings: { weeklyMinutes: d.settings.weeklyMinutes, studyDays: d.settings.studyDays, horizonDays: d.settings.horizonDays },
  };
  const steps = model.stepResults().map(stepRow);
  const from = d.sync.sentEvents || 0;
  const events = d.events.slice(from);
  let sent = 0;
  for (let i = 0; i < Math.max(1, events.length); i += 1000) {
    await json(`${url}/lab/upload`, { method: 'POST', body: JSON.stringify({ ...base, steps: i === 0 ? steps : [], events: events.slice(i, i + 1000) }) });
    sent = Math.min(events.length, i + 1000);
    d.sync.sentEvents = from + sent;
    store.saveNow();
  }
  d.sync.lastUpload = Date.now();
  store.saveNow();
  return { steps: steps.length, events: sent };
}

// The school blueprint: everyone's calibration results, combined (personalize.blueprintFromRows).
export async function fetchBlueprint() {
  const url = trim(s().labUrl);
  if (!url) throw new Error('Set the lab server address in Settings first.');
  const r = await json(`${url}/lab/blueprint`);
  const bp = blueprintFromRows(r.rows || []);
  const d = store.current();
  const anySurvey = Object.values(bp).some((m) => m.source === 'survey');
  d.blueprint = anySurvey ? bp : null;
  d.sync.blueprintAt = Date.now();
  store.touch();
  store.saveNow();
  return { participants: r.participants || 0, used: anySurvey, bp };
}

export async function teacherExport(key) {
  const url = trim(s().labUrl);
  if (!url) throw new Error('Set the lab server address first.');
  return json(`${url}/lab/export`, { headers: { 'X-Admin-Key': key } });
}
