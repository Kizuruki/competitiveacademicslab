// Turns the event log into per-method results: how fast clues were learned, how many were still
// remembered at each check-in, and the yield that implies.
//
//   learned per hour  = clues introduced × immediate accuracy ÷ active hours
//   kept at day H     = immediate accuracy × FSRS forgetting curve at H (curve fitted to check-ins)
//   durable per hour  = clues introduced × kept at H ÷ active hours
//
// Check-ins show the answers afterwards, like a real review, so later check-ins measure memory after
// relearning. The fitted curve is a summary of that, the same for every method.
import { forgetting_curve } from '../../vendor/ts-fsrs/index.mjs';
import { PARAMS } from './memory.js';
import { CHECKIN_DAYS } from './calibration.js';
import { daysBetween } from './util.js';

const curve = (t, S) => (t <= 0 ? 1 : forgetting_curve(PARAMS.w, t, S));
const S_GRID = Array.from({ length: 120 }, (_, i) => 0.2 * Math.pow(1.08, i));   // 0.2 … ~1800 days
const P_GRID = Array.from({ length: 96 }, (_, i) => 0.05 + i * 0.01);           // 0.05 … 1.00

// points: [{ t (days), n, k }] with t = 0 for the immediate test. Maximum-likelihood p0 and S.
export function fitRetention(points) {
  const usable = points.filter((p) => p.n > 0);
  if (!usable.some((p) => p.t > 0)) return null;
  let best = null;
  for (const S of S_GRID) {
    for (const p0 of P_GRID) {
      let ll = 0;
      for (const { t, n, k } of usable) {
        const p = Math.min(0.999, Math.max(0.001, p0 * curve(t, S)));
        ll += k * Math.log(p) + (n - k) * Math.log(1 - p);
      }
      if (!best || ll > best.ll) best = { p0, S, ll };
    }
  }
  return { p0: best.p0, S: best.S, at: (t) => best.p0 * curve(t, best.S) };
}

// One calibration step (a method on its civilization) → its results.
export function stepMetrics(step, events, horizonDays = 30) {
  const sid = step.sessionId;
  const session = events.find((e) => e.type === 'session' && e.sessionId === sid);
  const introduced = new Set(events.filter((e) => e.type === 'expose' && e.sessionId === sid).map((e) => e.clue)).size;
  const imm = events.filter((e) => e.type === 'answer' && e.phase === 'immediate' && e.calib === sid);
  const checkins = {};
  for (const d of CHECKIN_DAYS) {
    const a = events.filter((e) => e.type === 'answer' && e.phase === 'checkin' && e.calib === sid && e.checkinDay === d);
    if (a.length) checkins[d] = { n: a.length, k: a.filter((e) => e.correct).length, t: a.reduce((s, e) => s + daysBetween(step.finishedAt, e.t), 0) / a.length };
  }
  const activeHours = session ? session.activeMs / 3600000 : 0;
  const immN = imm.length, immK = imm.filter((e) => e.correct).length;
  const points = [{ t: 0, n: immN, k: immK }, ...Object.values(checkins)];
  const fit = fitRetention(points);
  const p0 = immN ? immK / immN : null;
  const keptAtH = fit ? fit.at(horizonDays) : null;
  const lastCheckin = Math.max(0, ...Object.keys(checkins).map(Number));
  return {
    method: step.method, civ: step.civ, sessionId: sid, finishedAt: step.finishedAt,
    activeHours, introduced, immediate: { n: immN, k: immK, p: p0 }, checkins, fit, lastCheckin,
    learnedPerHour: activeHours > 0 && p0 !== null ? (introduced * p0) / activeHours : null,
    keptAtH, horizonDays,
    durablePerHour: activeHours > 0 && keptAtH !== null ? (introduced * keptAtH) / activeHours : null,
    engagement: session ? { enjoy: session.enjoy ?? null, demand: session.demand ?? null, extraMin: (session.extraMs || 0) / 60000, stoppedEarly: !!session.stoppedEarly, finished: !!session.finished } : null,
  };
}

// Study-mode sessions by method: how far students keep going when they choose to (engagement).
// Sessions log engageRatio — share of the planned new clues done, plus extra time past the plan as a
// share of the planned time — which isn't confounded by how fast a method is. Older sessions
// without it fall back to minutes.
export function studySessionsByMethod(events) {
  const out = {};
  for (const e of events) {
    if (e.type !== 'session' || e.kind !== 'study' || !e.method) continue;
    const v = e.engageRatio ?? (e.engageRatio === null ? null : e.activeMs / 60000);
    if (v === null || !Number.isFinite(v)) continue;
    (out[e.method] = out[e.method] || []).push(v);
  }
  return out;
}

// Accuracy on scheduled reviews in a time window (pace rules use this).
export function reviewAccuracy(events, sinceT) {
  const a = events.filter((e) => e.type === 'answer' && (e.phase === 'review' || e.phase === 'checkin') && e.t >= sinceT && e.credit !== 'read-before' && e.credit !== 'unread');
  return { n: a.length, k: a.filter((e) => e.correct).length, p: a.length ? a.filter((e) => e.correct).length / a.length : null };
}

export function activeMinutesSince(events, sinceT) {
  return events.filter((e) => e.type === 'session' && e.t >= sinceT).reduce((s, e) => s + (e.totalMs ?? e.activeMs ?? 0), 0) / 60000;
}
