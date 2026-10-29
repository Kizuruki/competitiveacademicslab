// Bringing things in from the servers: what you've already done on the bowl sites, your team
// assignments, the school blueprint, and the coach's admin calls. (Sending your lab answers to the
// sites is sitesync.js; your own progress is saved by store.js.)
import * as store from './store.js';
import { MAIN_URL } from './config.js';
import { clue as clueById, cluesOfSite, packOf } from './content.js';
import { blueprintFromRows } from './engine/personalize.js';
import { SLOW_MS } from './engine/memory.js';
import { DAY_MS } from './engine/util.js';
import { siteKeyOf } from './sitesync.js';

const main = async (path) => {
  const res = await fetch(`${MAIN_URL}${path}`, { headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
};

// ---- the bowl sites → the lab ----
// Questions answered right on a site (GET /review-pool) count as learned here: each becomes one
// answer at the time it was last answered right (rated Hard if it was ever missed). So a big
// history doesn't all fall due at once, they're spread over the next weeks (about 25 a day).
// Questions on a site's Missed list that the lab hasn't seen come in as missed. Only site
// activity newer than what the lab already has for a clue is brought in, so the lab's own answers
// (which also go to the sites) aren't counted twice.
export async function importSiteHistory({ quiet = false } = {}) {
  const d = store.current();
  const user = encodeURIComponent(d.profile.username);
  const latest = new Map();
  for (const e of d.events) if (e.clue && String(e.clue).includes(':')) latest.set(e.clue, Math.max(latest.get(e.clue) || 0, e.t));
  const now = Date.now();
  let added = 0, missed = 0, total = 0;
  const rights = [];
  const sources = [
    ['geo', (key) => [clueById(`geo:${key}`)].filter(Boolean)],
    ['history', (key) => cluesOfSite(key)],
  ];
  for (const [site, toClues] of sources) {
    let pool = [];
    try { pool = (await main(`/review-pool/${user}?site=${site}`)).items || []; } catch (_) { if (!quiet) throw new Error('Could not reach the bowl sites.'); }
    total += pool.length;
    for (const [key, ts, wrong] of pool) {
      const t = Number(ts) || 0;
      for (const c of toClues(key)) {
        if (!t || t <= (latest.get(c.id) || 0) + 15 * 60000) continue;
        rights.push({ c, t, wrong: Number(wrong) || 0, site });
      }
    }
    // the site's Missed list
    try {
      const blob = (await main(`/user-blob/${user}/${site === 'geo' ? 'geo-missed' : 'history-missed'}`)).data;
      const keys = [];
      if (Array.isArray(blob)) for (const x of blob) {
        if (site === 'geo' && typeof x === 'string') keys.push(x);
        else if (x && x.quarter === 3) for (const q of x.questions || []) keys.push(siteKeyOf(3, `${x.category || ''} :: ${q.question}`));
        else if (x && x.question) keys.push(siteKeyOf(x.quarter || 1, x.question));
      }
      for (const key of keys) for (const c of toClues(key)) {
        if (latest.has(c.id)) continue;
        store.log({ type: 'answer', t: now, clue: c.id, answer: c.answer, pack: c.pack, correct: false, ms: null, phase: 'import', format: 'site', source: `${site}-missed` });
        latest.set(c.id, now); missed++;
      }
    } catch (_) { /* no list */ }
  }
  // oldest first, about 25 a day
  rights.sort((a, b) => a.t - b.t);
  rights.forEach((r, i) => {
    store.log({ type: 'answer', t: r.t, clue: r.c.id, answer: r.c.answer, pack: r.c.pack, correct: true, ms: r.wrong ? SLOW_MS + 1000 : 5000, phase: 'import', format: 'site', source: `${r.site}-site`, timesWrong: r.wrong, spreadDue: now + Math.floor(i / 25) * DAY_MS });
    added++;
  });
  d.sync.lastSiteImport = now;
  store.save();
  return { added, missed, total };
}

// Team assignments from the bowl sites (read-only here).
export async function teamAssignments() {
  const user = encodeURIComponent(store.current().profile.username);
  const out = [];
  for (const site of ['geo', 'history']) {
    try {
      const r = await main(`/me/team/${user}?site=${site}`);
      for (const a of r.assignments || []) out.push({ ...a, site, categories: r.categories || [] });
    } catch (_) { /* offline or older worker */ }
  }
  return out;
}

// The school blueprint: everyone's calibration results combined (personalize.blueprintFromRows).
// Refreshed at most once a day.
export async function refreshBlueprint({ force = false } = {}) {
  const d = store.current();
  if (!force && d.sync.blueprintAt && Date.now() - d.sync.blueprintAt < DAY_MS) return null;
  const r = await store.api('/lab/blueprint');
  const bp = blueprintFromRows(r.rows || []);
  d.blueprint = Object.values(bp).some((m) => m.source === 'survey') ? bp : null;
  d.sync.blueprintAt = Date.now();
  store.touch();
  return { participants: r.participants || 0, used: !!d.blueprint };
}

// ---- coach ----
export const admin = {
  students: () => store.api('/lab/admin/students'),
  events: async (user) => {
    const out = [];
    for (let after = 0; ;) { const p = await store.api(`/lab/admin/events?user=${encodeURIComponent(user)}&after=${after}`); out.push(...p.events); if (!p.next) break; after = p.next; }
    return out;
  },
  setConfig: (cfg) => store.api('/lab/admin/config', { method: 'PUT', body: cfg }),
  reset: (user) => store.api(`/lab/admin/reset/${encodeURIComponent(user)}`, { method: 'POST' }),
  redo: (user, step) => store.api(`/lab/admin/redo/${encodeURIComponent(user)}`, { method: 'POST', body: { step } }),
  remove: (user) => store.api(`/lab/admin/student/${encodeURIComponent(user)}`, { method: 'DELETE' }),
};
export { packOf };
