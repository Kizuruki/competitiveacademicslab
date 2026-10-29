// Everything derived from the event log, recomputed when the log grows: memory, calibration
// results, the student's per-method estimates, what's due, and the pace check.
import * as store from './store.js';
import { buildMemory, dueClues, forecast } from './engine/memory.js';
import { stepMetrics, studySessionsByMethod, reviewAccuracy, activeMinutesSince } from './engine/metrics.js';
import { posteriors, chanceBest, pickMethod, expectedYield, DEFAULT_BLUEPRINT } from './engine/personalize.js';
import { adjustPace, PACE_LEVELS } from './engine/pace.js';
import { assign, nextCheckin, METHODS } from './engine/calibration.js';
import { makeRng, DAY_MS } from './engine/util.js';
import { clue as clueById } from './content.js';

let cache = { rev: -1, id: null };
function fresh() {
  const d = store.current();
  if (cache.id === d.id && cache.rev === store.revision()) return cache;
  cache = { id: d.id, rev: store.revision() };
  return cache;
}
const memo = (key, fn) => { const c = fresh(); if (!(key in c)) c[key] = fn(store.current()); return c[key]; };

export const memory = () => memo('mem', (d) => buildMemory(d.events));

// Calibration clues (the invented world) are only ever asked in check-ins, so ordinary reviews
// don't change what the check-ins measure. Real clue ids carry their pack ("geo:…", "hist:…");
// calibration ids don't ("ostrevan.ruler.1").
export const isReal = (clueId) => String(clueId).includes(':');
export function realMemory() {
  return memo('realMem', () => Object.fromEntries(Object.entries(memory()).filter(([id]) => isReal(id))));
}
export function due(packs = null, now = Date.now()) {
  const mem = realMemory();
  return dueClues(mem, now).filter((x) => { const c = clueById(x.clue); return c && (!packs || packs.includes(c.pack)); });
}
export const weekForecast = () => forecast(realMemory(), 7);

// ---- calibration ----
export function startCalibration(protocol, civIds) {
  const d = store.current();
  d.calibration = {
    protocol, participant: d.profile.participant, started: Date.now(),
    steps: assign(d.profile.participant, civIds, protocol).map((s) => ({ ...s, sessionId: null, startedAt: null, finishedAt: null, doneDays: [] })),
  };
  store.log({ type: 'calibration-start', protocol, participant: d.profile.participant, steps: d.calibration.steps.map((s) => [s.method, s.civ]) });
  store.saveNow();
}
export function calibrationSteps() { return store.current().calibration?.steps || []; }
export function nextStep() { return calibrationSteps().find((s) => !s.finishedAt) || null; }
export function checkinsDue(now = Date.now()) {
  return calibrationSteps().map((s, i) => ({ step: s, index: i, due: nextCheckin(s, s.doneDays, now) })).filter((x) => x.due);
}
export function stepResults() {
  return memo('steps', (d) => calibrationSteps().filter((s) => s.finishedAt).map((s) => stepMetrics(s, d.events, d.settings.horizonDays)));
}

// ---- personalization ----
export const blueprint = () => store.current().blueprint || DEFAULT_BLUEPRINT;
export function estimates() {
  return memo('posts', (d) => posteriors(stepResults(), studySessionsByMethod(d.events), blueprint(), d.settings.horizonDays));
}
export const weeklyHours = () => store.current().settings.weeklyMinutes / 60;
export function chances(methods = METHODS) {
  return memo('chance:' + methods.join(','), () => chanceBest(estimates(), weeklyHours(), makeRng(store.current().events.length + 7), 3000, methods));
}
export function recommend(methods) {
  return pickMethod(estimates(), weeklyHours(), makeRng(Date.now() & 0xffffffff), methods);
}
export function yields(methods = METHODS) {
  const p = estimates();
  return Object.fromEntries(methods.map((m) => [m, expectedYield(p[m], weeklyHours())]));
}
// Share of new clues the student keeps at the horizon, weighted toward the methods they use.
export function keptShare(methods = METHODS) {
  const p = estimates(), c = chances(methods);
  return methods.reduce((s, m) => s + c[m] * p[m].kept.mean, 0);
}

// ---- pace ----
export const paceLevel = () => store.current().pace.level;
export const pace = () => PACE_LEVELS[paceLevel()];
export function paceInputs(now = Date.now()) {
  const d = store.current();
  const since = d.pace.since;
  const r = reviewAccuracy(d.events.filter((e) => !e.clue || isReal(e.clue)), since);
  const mem = realMemory();
  const overdue = Object.values(mem).filter((e) => e.card && now - e.card.due >= 2 * DAY_MS).length;
  const reviewedWeek = new Set(d.events.filter((e) => e.type === 'answer' && e.phase === 'review' && e.t >= now - 7 * DAY_MS).map((e) => e.clue)).size;
  return {
    reviewN: r.n, reviewP: r.p,
    overdueShare: overdue / Math.max(1, overdue + reviewedWeek),
    weekMinutes: activeMinutesSince(d.events, now - 7 * DAY_MS),
    plannedWeekMinutes: d.settings.weeklyMinutes,
  };
}
export function checkPace(now = Date.now()) {
  const d = store.current();
  const inputs = paceInputs(now);
  const r = adjustPace(d.pace.level, inputs);
  if (r.change) {
    d.pace.history.push({ t: now, from: d.pace.level, to: r.level, reason: r.reason });
    d.pace.level = r.level; d.pace.since = now;
    store.log({ type: 'pace', level: r.level, rate: PACE_LEVELS[r.level], reason: r.reason });
  }
  return { ...r, inputs };
}
