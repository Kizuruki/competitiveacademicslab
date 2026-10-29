// Everything a student does is an event in one append-only log, saved in this browser
// (localStorage). Memory, results and recommendations are all recomputed from the log, so it can be
// exported, imported, or uploaded to the lab worker as-is.
import { uid } from './engine/util.js';
import { START_LEVEL } from './engine/pace.js';
import { participantIndex } from './engine/calibration.js';

const CURRENT = 'studylab:current';
const key = (id) => `studylab:v1:${id}`;
export const DEFAULTS = {
  weeklyMinutes: 120, studyDays: 5, horizonDays: 30, tournamentDate: '', msPerChar: 54, sessionMinutes: 0,
  target: 0, capMinutes: 0, packs: [], shareSiteAnswers: true,
  mainUrl: 'https://patient-base-c952.javalutionization.workers.dev', labUrl: '',
};

let data = null, saveTimer = null, rev = 0;
// Bumped whenever the log changes (a new event, or an answer corrected with "I was right").
export const revision = () => rev;
export function touch() { rev++; save(); }
const safe = (fn, fallback) => { try { return fn(); } catch (_) { return fallback; } };

export function profiles() {
  return safe(() => JSON.parse(localStorage.getItem('studylab:profiles') || '[]'), []);
}
export function current() { return data; }

export function open(id) {
  rev++;
  data = safe(() => JSON.parse(localStorage.getItem(key(id)) || 'null'), null);
  if (!data) return null;
  data.settings = { ...DEFAULTS, ...(data.settings || {}) };
  safe(() => localStorage.setItem(CURRENT, id));
  return data;
}
export function openLast() {
  const id = safe(() => localStorage.getItem(CURRENT), null);
  return id ? open(id) : null;
}
export function create(name) {
  const id = uid();
  data = {
    version: 1, id,
    profile: { name: name.trim() || 'Student', username: null, deviceId: uid() + uid(), created: Date.now() },
    settings: { ...DEFAULTS },
    calibration: null,
    pace: { level: START_LEVEL, since: Date.now(), history: [] },
    blueprint: null,
    events: [],
    sync: { sentEvents: 0, lastUpload: null },
  };
  data.profile.participant = participantIndex(data.profile.deviceId);
  const list = profiles().filter((p) => p.id !== id);
  list.push({ id, name: data.profile.name });
  safe(() => localStorage.setItem('studylab:profiles', JSON.stringify(list)));
  saveNow();
  safe(() => localStorage.setItem(CURRENT, id));
  return data;
}

export function log(ev) {
  const e = { id: uid(), t: Date.now(), ...ev };
  data.events.push(e);
  rev++;
  save();
  return e;
}
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 250);
}
export function saveNow() {
  clearTimeout(saveTimer);
  if (!data) return;
  safe(() => localStorage.setItem(key(data.id), JSON.stringify(data)));
}
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
}

export function exportJSON() { saveNow(); return JSON.stringify(data, null, 1); }
export function importJSON(text) {
  const incoming = JSON.parse(text);
  rev++;
  if (!incoming || incoming.version !== 1 || !Array.isArray(incoming.events)) throw new Error('Not a Study Lab export.');
  data = incoming;
  data.settings = { ...DEFAULTS, ...(data.settings || {}) };
  const list = profiles().filter((p) => p.id !== data.id);
  list.push({ id: data.id, name: data.profile.name });
  safe(() => localStorage.setItem('studylab:profiles', JSON.stringify(list)));
  saveNow();
  safe(() => localStorage.setItem(CURRENT, data.id));
  return data;
}
export function remove(id) {
  safe(() => localStorage.removeItem(key(id)));
  safe(() => localStorage.setItem('studylab:profiles', JSON.stringify(profiles().filter((p) => p.id !== id))));
  if (data && data.id === id) data = null;
}
