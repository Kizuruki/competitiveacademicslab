// Everything derived from the event log, recomputed when the log changes: memory, calibration
// results, the student's per-method estimates, what's due, sessions left unfinished, and the pace
// check.
import * as store from './store.js';
import { buildMemory, dueClues, forecast, status } from './engine/memory.js';
import { stepMetrics, studySessionsByMethod, reviewAccuracy, activeMinutesSince, studyEvidence } from './engine/metrics.js';
import { posteriors, chanceBest, pickMethod, expectedYield, DEFAULT_BLUEPRINT } from './engine/personalize.js';
import { adjustPace, PACE_LEVELS } from './engine/pace.js';
import { assign, nextCheckin, METHODS, redoStep as redoCalibrationStep } from './engine/calibration.js';
import { makeRng, DAY_MS } from './engine/util.js';
import { clue as clueById, allClues, packOf } from './content.js';

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
// Reviews for today: missed clues first, then the ones FSRS says are due.
export function due(packs = null, now = Date.now()) {
  const mem = realMemory();
  return dueClues(mem, now).filter((x) => { const c = clueById(x.clue); return c && (!packs || packs.includes(c.pack)); });
}
export const weekForecast = () => forecast(realMemory(), 7);

// Mastered / missed / not yet studied, per site, over the loaded packs (like the sites count them).
export function counts(packs) {
  return memo('counts:' + (packs || []).join(','), () => {
    const mem = realMemory();
    const out = {};
    for (const c of allClues()) {
      if (packs && !packs.includes(c.pack)) continue;
      const site = packOf(c.pack)?.site || 'other';
      const o = out[site] || (out[site] = { new: 0, learning: 0, missed: 0, mastered: 0, total: 0 });
      o[status(mem[c.id])]++; o.total++;
    }
    return out;
  });
}

// ---- sessions ----
// A session logs session-start when it begins and session when it ends; session-pause records
// what was done before leaving. A start with no end is unfinished and can be resumed.
export function unfinished() {
  return memo('unfinished', (d) => {
    const open = new Map();
    for (const e of d.events) {
      if (e.type === 'session-start') open.set(e.sessionId, { start: e, pauses: [] });
      else if (e.type === 'session-pause' && open.has(e.sessionId)) open.get(e.sessionId).pauses.push(e);
      else if ((e.type === 'session' || e.type === 'session-discard') && open.has(e.sessionId)) open.delete(e.sessionId);
    }
    return [...open.values()].map((x) => ({
      ...x, sessionId: x.start.sessionId, kind: x.start.kind,
      activeMs: x.pauses.reduce((s, p) => s + (p.activeMs || 0), 0),
      answers: d.events.filter((e) => e.type === 'answer' && e.sessionId === x.start.sessionId && e.credit !== 'unread' && !e.pretest && !e.cue),
      exposed: new Set(d.events.filter((e) => e.type === 'expose' && e.sessionId === x.start.sessionId).map((e) => e.clue)),
    })).sort((a, b) => b.start.t - a.start.t);
  });
}
export function pausedMs(sessionId) {
  return store.current().events.filter((e) => e.type === 'session-pause' && e.sessionId === sessionId).reduce((s, e) => s + (e.activeMs || 0), 0);
}

// ---- calibration ----
export async function startCalibration(protocol, civIds, chosen = null) {
  const d = store.current();
  const p = await store.participant();
  d.calibration = {
    protocol, participant: p, started: Date.now(), chosen: chosen || null,
    steps: assign(p, civIds, protocol, chosen).map((s) => ({ ...s, sessionId: null, startedAt: null, finishedAt: null, doneDays: [], stage: null, activeMs: 0, extraMs: 0 })),
  };
  store.log({ type: 'calibration-start', protocol, participant: p, steps: d.calibration.steps.map((s) => [s.method, s.civ]) });
  store.saveNow();
}
export function calibrationSteps() { return store.current().calibration?.steps || []; }
export function nextStep() { return calibrationSteps().find((s) => !s.finishedAt && !s.skipped) || null; }
export function checkinsDue(now = Date.now()) {
  return calibrationSteps().map((s, i) => ({ step: s, index: i, due: s.skipped ? null : nextCheckin(s, s.doneDays, now) })).filter((x) => x.due);
}
export function stepResults() {
  return memo('steps', (d) => calibrationSteps().filter((s) => s.finishedAt && !s.skipped).map((s) => stepMetrics(s, d.events, d.settings.horizonDays)));
}
// Set a method's calibration attempt aside and start it again (see engine/calibration.js).
export function redoStep(i, civIds, reason = '') {
  const d = store.current();
  const old = d.calibration.steps[i].sessionId;
  const r = redoCalibrationStep(d.calibration, i, civIds, reason);
  store.log({ type: 'calibration-redo', step: i, method: d.calibration.steps[i].method, old, civ: r?.civ || null, reason });
  store.touch();
  store.saveNow();
  return r;
}
export const studyResults = () => memo('study', (d) => studyEvidence(d.events, d.settings.horizonDays));

// ---- personalization ----
export const blueprint = () => store.current().blueprint || DEFAULT_BLUEPRINT;
export function estimates() {
  return memo('posts', (d) => posteriors([...stepResults(), ...studyResults()], studySessionsByMethod(d.events), blueprint(), d.settings.horizonDays));
}
export const weeklyHours = () => store.current().settings.weeklyMinutes / 60;
export function chances(methods = METHODS) {
  return memo('chance:' + methods.join(','), () => chanceBest(estimates(), weeklyHours(), makeRng(store.current().events.length + 7), 3000, methods));
}
export function recommend(methods = METHODS) {
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
    store.save();
  }
  return { ...r, inputs };
}

// What the lab server keeps for the coach: calibration results go with every save, plus a summary.
store.setStepsProvider(() => stepResults().map(({ fit, ...r }) => r));
store.setSummaryProvider(() => {
  const c = counts(null);
  const p = estimates();
  const d = store.current();
  const evidence = stepResults().length || studyResults().length || d.blueprint || d.events.some((e) => e.type === 'session' && e.kind === 'study');
  const top = evidence ? Object.entries(chances()).sort((a, b) => b[1] - a[1])[0] : null;
  return { counts: c, pace: pace(), best: top ? { method: top[0], chance: top[1] } : null, kept: Object.fromEntries(METHODS.map((m) => [m, +p[m].kept.mean.toFixed(3)])), updated: Date.now() };
});
