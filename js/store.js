// Everything a student does is an event in one append-only log, kept on the lab server under their
// bowl-site account, so it follows them to any device. This browser keeps only the login and the
// events not yet sent (the "outbox"), so nothing is lost if the connection drops or the tab closes.
// Memory, results and recommendations are all recomputed from the log.
import { uid } from './engine/util.js';
import { START_LEVEL } from './engine/pace.js';
import { LAB_URL, ADMIN_USERS } from './config.js';

const SESSION = 'studylab:session';
const outboxKey = (u) => `studylab:outbox:${u}`;
export const DEFAULTS = {
  weeklyMinutes: 120, studyDays: 5, horizonDays: 30, tournamentDate: '', msPerChar: 54, sessionMinutes: 0, packs: [],
};

let data = null, rev = 0, flushTimer = null, flushing = null, stateDirty = false, stepsProvider = () => [];
const safe = (fn, fallback) => { try { return fn(); } catch (_) { return fallback; } };

// Bumped whenever the log changes (a new event, or an answer corrected with "I was right").
export const revision = () => rev;
export const current = () => data;
export const isAdmin = () => !!data && (data.admin || ADMIN_USERS.includes(String(data.profile.username).toLowerCase()));
export function setStepsProvider(fn) { stepsProvider = fn; }

export function session() { return safe(() => JSON.parse(localStorage.getItem(SESSION) || 'null'), null); }
async function api(path, { method = 'GET', body, token = session()?.token, keepalive = false } = {}) {
  const res = await fetch(`${LAB_URL}${path}`, {
    method, keepalive,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/lab/login') { const err = new Error(out.error || 'Please log in again.'); err.login = true; throw err; }
  if (!res.ok) throw new Error(out.error || `Server error ${res.status}`);
  return out;
}
export { api };

export async function login(username, password, { register = false } = {}) {
  const r = await api(register ? '/lab/register' : '/lab/login', { method: 'POST', body: { username, password }, token: null });
  safe(() => localStorage.setItem(SESSION, JSON.stringify({ token: r.token, username: r.username, admin: !!r.admin })));
  return load();
}
export async function logout() {
  try { await flush(); } catch (_) { /* the outbox stays for next time */ }
  safe(() => localStorage.removeItem(SESSION));
  data = null; rev++;
}

const outbox = (u) => safe(() => JSON.parse(localStorage.getItem(outboxKey(u)) || '[]'), []);
const setOutbox = (u, list) => safe(() => localStorage.setItem(outboxKey(u), JSON.stringify(list)));

// Load this student's progress from the server (plus anything still waiting in the outbox).
export async function load() {
  const s = session();
  if (!s) return null;
  const me = await api('/lab/me');
  const events = [];
  for (let after = 0; ;) {
    const page = await api(`/lab/log?after=${after}`);
    events.push(...page.events);
    if (!page.next) break;
    after = page.next;
  }
  const user = String(me.username).toLowerCase();
  const pending = outbox(user);
  const byId = new Map(events.map((e, i) => [e.id, i]));
  for (const e of pending) { if (byId.has(e.id)) events[byId.get(e.id)] = e; else events.push(e); }
  const st = me.state || {};
  data = {
    version: 2, id: user, admin: !!me.admin,
    profile: { name: me.username, username: me.username, participant: me.participant },
    coach: me.coach || { target: 0, capMinutes: 0 },
    settings: { ...DEFAULTS, ...(st.settings || {}) },
    calibration: st.calibration || null,
    pace: st.pace || { level: START_LEVEL, since: Date.now(), history: [] },
    blueprint: st.blueprint || null,
    sync: st.sync || {},
    records: st.records || {},
    loadedAt: me.now || Date.now(),   // server time: a coach's reset after this wins over this copy
    events,
  };
  rev++;
  if (pending.length) scheduleFlush(500);
  return data;
}

export function log(ev) {
  const e = { id: uid(), t: Date.now(), ...ev };
  data.events.push(e);
  setOutbox(data.id, [...outbox(data.id), e]);
  rev++;
  scheduleFlush();
  return e;
}
// Changed an event already logged (e.g. "I was right"): send it again so the server copy matches.
export function touch(ev) {
  rev++;
  if (ev && data) setOutbox(data.id, [...outbox(data.id).filter((x) => x.id !== ev.id), ev]);
  save();
}
// The state (settings, calibration, pace, …) changed.
export function save() { stateDirty = true; scheduleFlush(); }
export function saveNow() { stateDirty = true; return flush().catch(() => {}); }

function scheduleFlush(ms = 4000) {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => flush().catch(() => scheduleFlush(15000)), ms);
}
const stateOf = (d, summary) => ({ settings: d.settings, calibration: d.calibration, pace: d.pace, blueprint: d.blueprint, sync: d.sync, records: d.records, summary });
let summaryProvider = () => null;
export function setSummaryProvider(fn) { summaryProvider = fn; }

export function flush({ keepalive = false } = {}) {
  if (!data || !session()) return Promise.resolve();
  // the tab is closing: send now even if a send is in flight (the server ignores repeats)
  if (flushing && !keepalive) return flushing.then(() => (outbox(data.id).length || stateDirty ? flush({ keepalive }) : undefined));
  const user = data.id;
  const pending = outbox(user);
  // keepalive requests (the tab is closing) must stay under 64 KB
  let batch = pending.slice(0, 1000);
  if (keepalive) { let size = 0; batch = []; for (const e of pending) { size += JSON.stringify(e).length + 1; if (size > 50000) break; batch.push(e); } }
  if (!batch.length && !stateDirty) return Promise.resolve();
  const body = { events: batch };
  const sendState = stateDirty;
  if (sendState) {
    body.state = stateOf(data, safe(summaryProvider, null)); body.loadedAt = data.loadedAt;
    const steps = safe(stepsProvider, null);
    if (steps) { body.steps = steps; body.stepsAll = true; }   // the full list: results no longer in it are dropped
    stateDirty = false;
  }
  if (keepalive && JSON.stringify(body).length > 60000) { delete body.steps; delete body.stepsAll; }
  const req = api('/lab/log', { method: 'POST', body, keepalive })
    .then(async (res) => {
      // the coach reset or redid part of this calibration since we loaded: take the server's copy
      if (res && res.stale && !keepalive) {
        try { const me = await api('/lab/me'); data.calibration = me.state?.calibration ?? null; data.loadedAt = me.now; rev++; } catch (_) { /* next time */ }
      }
      // drop what was sent, unless it changed again while sending
      const sent = new Map(batch.map((e) => [e.id, JSON.stringify(e)]));
      setOutbox(user, outbox(user).filter((e) => sent.get(e.id) !== JSON.stringify(e)));
      if (outbox(user).length) scheduleFlush(300);
    })
    .catch((err) => { if (sendState) stateDirty = true; throw err; })
    .finally(() => { if (flushing === req) flushing = null; });
  flushing = req;
  return req;
}
// (main.js sends the outbox when the tab closes, after recording any session left partway)
if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && data) { stateDirty = true; flush({ keepalive: true }).catch(() => {}); } });
}

// Calibration participant number, handed out in order by the server (see engine/calibration.js).
export async function participant() {
  if (data.profile.participant !== null && data.profile.participant !== undefined) return data.profile.participant;
  const r = await api('/lab/participant', { method: 'POST' });
  data.profile.participant = r.participant;
  return r.participant;
}

export function exportJSON() {
  return JSON.stringify({ username: data.profile.username, exported: new Date().toISOString(), state: stateOf(data), events: data.events }, null, 1);
}
