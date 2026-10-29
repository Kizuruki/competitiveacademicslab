import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMemory, applyEvent, ratingFor, Rating, tossupCredit, dueClues, forecast, recallAt, status } from '../js/engine/memory.js';
import { fitRetention, stepMetrics, studyEvidence } from '../js/engine/metrics.js';
import { posteriors, chanceBest, pickMethod, DEFAULT_BLUEPRINT, calibrationEngagement, blueprintFromRows } from '../js/engine/personalize.js';
import { adjustPace, PACE_LEVELS } from '../js/engine/pace.js';
import { planWeek, planSession } from '../js/engine/planner.js';
import { assign, METHODS, nextCheckin, participantIndex, COMBOS, redoStep, canRedoFresh, CIVS } from '../js/engine/calibration.js';
import { makeRng, DAY_MS } from '../js/engine/util.js';
import { forgetting_curve } from '../vendor/ts-fsrs/index.mjs';
import { PARAMS } from '../js/engine/memory.js';

const T0 = new Date('2026-11-02T15:00:00').getTime();
const ans = (clue, t, correct, extra = {}) => ({ type: 'answer', clue, t, correct, ms: 4000, format: 'question', phase: 'review', ...extra });

test('rating rules', () => {
  assert.equal(ratingFor({ correct: false }), Rating.Again);
  assert.equal(ratingFor({ correct: true, ms: 3000 }), Rating.Good);
  assert.equal(ratingFor({ correct: true, ms: 20000 }), Rating.Hard);
  assert.equal(ratingFor({ correct: true, credit: 'trigger', cluesRead: 1 }), Rating.Easy);
  assert.equal(ratingFor({ correct: true, credit: 'trigger', cluesRead: 3, ms: 2000 }), Rating.Good);
});

test('only the first graded attempt of a day changes memory', () => {
  const mem = {};
  applyEvent(mem, ans('c1', T0, true));
  const s1 = mem.c1.card.stability;
  applyEvent(mem, ans('c1', T0 + 60000, false));          // same day: practice, no change
  assert.equal(mem.c1.card.stability, s1);
  applyEvent(mem, ans('c1', T0 + 3 * DAY_MS, true));       // later day: grows
  assert.ok(mem.c1.card.stability > s1);
  const before = mem.c1.card.stability;
  applyEvent(mem, ans('c1', T0 + 10 * DAY_MS, false));     // a miss drops it
  assert.ok(mem.c1.card.stability < before);
});

test('tossup credit: trigger counts, earlier clues get a standalone check, unread untouched', () => {
  const credit = tossupCredit({ order: ['a', 'b', 'c', 'd'], cluesRead: 3, correct: true });
  assert.deepEqual(credit.map((c) => c.credit), ['read-before', 'read-before', 'trigger', 'unread']);
  const wrong = tossupCredit({ order: ['a', 'b', 'c', 'd'], cluesRead: 2, correct: false });
  assert.deepEqual(wrong.map((c) => c.credit), ['read', 'read', 'unread', 'unread']);
  const mem = {};
  for (const c of credit) applyEvent(mem, { type: 'answer', clue: c.clue, t: T0, correct: !!c.correct, credit: c.credit, cluesRead: 3, format: 'tossup', phase: 'practice' });
  assert.equal(mem.a.needsCheck, true);
  assert.equal(mem.a.card, null);                 // not graded
  assert.ok(mem.c.card);                          // the trigger is graded
  assert.equal(mem.d, undefined);                 // never read
  const due = dueClues(mem, T0 + DAY_MS).map((d) => d.clue);
  assert.ok(due.includes('a') && due.includes('b'));
  applyEvent(mem, ans('a', T0 + DAY_MS, true));   // asked on its own and right → check cleared
  assert.equal(mem.a.needsCheck, false);
});

test('forecast counts due reviews by day', () => {
  const mem = buildMemory([ans('x', T0, true), ans('y', T0, false), ans('z', T0, true)]);
  const f = forecast(mem, 14, T0);
  assert.equal(f.reduce((s, x) => s + x, 0), 3);
});

test('retention fit recovers the curve it was drawn from', () => {
  const p0 = 0.9, S = 12;
  const pts = [0, 1, 3, 7, 14].map((t) => ({ t, n: 4000, k: Math.round(4000 * p0 * (t ? forgetting_curve(PARAMS.w, t, S) : 1)) }));
  const fit = fitRetention(pts);
  assert.ok(Math.abs(fit.p0 - p0) < 0.02, `p0 ${fit.p0}`);
  assert.ok(Math.abs(fit.S - S) / S < 0.15, `S ${fit.S}`);
  assert.equal(fitRetention([{ t: 0, n: 10, k: 9 }]), null);   // no check-ins yet → no curve
});

test('step metrics from an event log', () => {
  const sid = 's1', start = T0;
  const ev = [{ type: 'session', sessionId: sid, kind: 'calibration', method: 'story', civ: 'ombrel', activeMs: 30 * 60000, t: start, enjoy: 4 }];
  for (let i = 0; i < 60; i++) ev.push({ type: 'expose', sessionId: sid, clue: `c${i}`, t: start });
  for (let i = 0; i < 60; i++) ev.push({ type: 'answer', phase: 'immediate', calib: sid, clue: `c${i}`, correct: i < 48, t: start + 1000 });
  for (let i = 0; i < 60; i++) ev.push({ type: 'answer', phase: 'checkin', checkinDay: 7, calib: sid, clue: `c${i}`, correct: i < 36, t: start + 7 * DAY_MS });
  const m = stepMetrics({ method: 'story', civ: 'ombrel', sessionId: sid, finishedAt: start }, ev, 30);
  assert.equal(m.introduced, 60);
  assert.equal(m.immediate.p, 0.8);
  assert.ok(Math.abs(m.learnedPerHour - 96) < 0.01);       // 60 × 0.8 ÷ 0.5 h
  assert.ok(m.keptAtH < 0.6 && m.keptAtH > 0.2, `kept ${m.keptAtH}`);
  assert.ok(m.durablePerHour < m.learnedPerHour);
});

test('no data → blueprint; lots of data → the student\'s own numbers', () => {
  const none = posteriors([], {}, DEFAULT_BLUEPRINT, 30);
  for (const m of METHODS) { assert.equal(none[m].learn.mean, 100); assert.equal(none[m].kept.mean, 0.5); assert.equal(none[m].engage.mean, 1); }
  const step = { method: 'flashcards', activeHours: 4, learnedPerHour: 180, keptAtH: 0.7, lastCheckin: 14, checkins: { 14: { n: 60 } }, engagement: { enjoy: 5, extraMin: 0 } };
  const p = posteriors([step], {}, DEFAULT_BLUEPRINT, 30);
  assert.ok(p.flashcards.learn.mean > 165, `learn ${p.flashcards.learn.mean}`);
  assert.ok(p.flashcards.kept.mean > 0.62, `kept ${p.flashcards.kept.mean}`);
  assert.ok(p.flashcards.learn.sd < none.flashcards.learn.sd);
});

test('the clearly better method is almost always best; uncertainty spreads the chances', () => {
  const rng = makeRng(7);
  const mk = (learn, kept, hours, items) => ({ method: '', activeHours: hours, learnedPerHour: learn, keptAtH: kept, lastCheckin: 14, checkins: { 14: { n: items } }, engagement: { enjoy: 3 } });
  const strong = posteriors([{ ...mk(200, 0.8, 3, 60), method: 'flashcards' }, { ...mk(80, 0.4, 3, 60), method: 'tossups' }, { ...mk(90, 0.4, 3, 60), method: 'story' }, { ...mk(85, 0.4, 3, 60), method: 'matching' }], {}, DEFAULT_BLUEPRINT, 30);
  const four = ['flashcards', 'tossups', 'story', 'matching'];
  const pb = chanceBest(strong, 2, rng, 3000, four);
  assert.ok(pb.flashcards > 0.95, JSON.stringify(pb));
  assert.ok(Math.abs(Object.values(pb).reduce((s, x) => s + x, 0) - 1) < 1e-9);
  // methods never tried keep a small chance, so they still get tried now and then
  const all = chanceBest(strong, 2, rng, 3000);
  assert.ok(all.flashcards > 0.6 && METHODS.filter((m) => !four.includes(m)).every((m) => all[m] > 0.005 && all[m] < 0.1), JSON.stringify(all));
  const even = chanceBest(posteriors([], {}, DEFAULT_BLUEPRINT, 30), 2, rng, 6000);
  for (const m of METHODS) assert.ok(even[m] > 0.5 / METHODS.length && even[m] < 1.6 / METHODS.length, JSON.stringify(even));
  let picks = 0; for (let i = 0; i < 500; i++) if (pickMethod(strong, 2, rng, four) === 'flashcards') picks++;
  assert.ok(picks > 470);
});

test('engagement evidence', () => {
  assert.equal(calibrationEngagement({ enjoy: 1 }), 0.75);
  assert.equal(calibrationEngagement({ enjoy: 5 }), 1.25);
  assert.ok(calibrationEngagement({ enjoy: 3, extraMin: 10 }) > calibrationEngagement({ enjoy: 3 }));
  assert.ok(calibrationEngagement({ enjoy: 3, stoppedEarly: true }) < calibrationEngagement({ enjoy: 3 }));
});

test('blueprint needs enough participants', () => {
  const rows = [];
  for (let p = 0; p < 6; p++) rows.push({ participant: `p${p}`, method: 'story', learnedPerHour: 60 + p, keptAtH: 0.7, engagement: { enjoy: 4 } });
  const bp = blueprintFromRows(rows);
  assert.equal(bp.story.source, 'survey');
  assert.equal(bp.story.learn, 63);
  assert.equal(bp.flashcards.source, 'default');
});

test('pace rules', () => {
  const ok = { reviewN: 40, reviewP: 0.9, overdueShare: 0.05, weekMinutes: 120, plannedWeekMinutes: 120 };
  assert.equal(adjustPace(2, ok).level, 3);
  assert.equal(adjustPace(2, { ...ok, weekMinutes: 50 }).level, 2);          // not putting in the time
  assert.equal(adjustPace(2, { ...ok, reviewP: 0.6 }).level, 1);
  assert.equal(adjustPace(2, { ...ok, overdueShare: 0.4 }).level, 1);
  assert.equal(adjustPace(2, { ...ok, reviewN: 10 }).level, 2);               // too little evidence
  assert.equal(adjustPace(PACE_LEVELS.length - 1, ok).level, PACE_LEVELS.length - 1);
});

test('weekly plan: time-based stays in budget, target-based scales with speed and cap', () => {
  const w = planWeek({ weeklyMinutes: 120, studyDays: 5, forecast: [10, 4, 6, 0, 8, 3, 2], secPerReview: 15, pace: 100 });
  assert.ok(w.totalMinutes <= 120.01, `total ${w.totalMinutes}`);
  assert.ok(w.newClues > 150);
  const slow = planWeek({ weeklyMinutes: 120, forecast: [5, 5, 5, 5, 5, 0, 0], pace: 50, keptShare: 0.6, target: 60, capMinutes: 300 });
  const fast = planWeek({ weeklyMinutes: 120, forecast: [5, 5, 5, 5, 5, 0, 0], pace: 200, keptShare: 0.6, target: 60, capMinutes: 300 });
  assert.ok(slow.totalMinutes > fast.totalMinutes);
  const capped = planWeek({ weeklyMinutes: 60, forecast: [5, 5, 5, 5, 5, 0, 0], pace: 50, keptShare: 0.5, target: 500, capMinutes: 90 });
  assert.ok(capped.target < 500 && capped.note);
  assert.deepEqual(planSession({ minutes: 20, due: 40, secPerReview: 15, pace: 100 }), { reviews: 40, newClues: 16 });
});

test('counterbalancing: every method meets every civilization and every position equally', () => {
  const civs = ['a', 'b', 'c', 'd'];
  const pair = {}, pos = {}, seen = {};
  for (let p = 0; p < COMBOS; p++) for (const s of assign(p, civs, 'full')) {
    pair[`${s.method}-${s.civ}`] = (pair[`${s.method}-${s.civ}`] || 0) + 1;
    pos[`${s.method}-${s.order}`] = (pos[`${s.method}-${s.order}`] || 0) + 1;
    seen[s.method] = (seen[s.method] || 0) + 1;
  }
  assert.equal(Object.keys(seen).length, METHODS.length);
  assert.ok(Object.values(seen).every((n) => n === seen.flashcards), 'every method calibrated equally often');
  assert.ok(Object.values(pair).every((n) => n === pair['flashcards-a']) && Object.keys(pair).length === 4 * METHODS.length);
  assert.ok(Object.values(pos).every((n) => n === pos['flashcards-0']) && Object.keys(pos).length === 4 * METHODS.length);
  // the first eleven students between them calibrate every method
  const first = new Set(); for (let p = 0; p < METHODS.length; p++) assign(p, civs, 'full').forEach((s) => first.add(s.method));
  assert.equal(first.size, METHODS.length);
  const quick = assign(5, civs, 'quick');
  assert.equal(quick.length, 3);
  assert.deepEqual(assign(0, civs, 'full', ['duel', 'hints', 'story', 'guess']).map((s) => s.method).sort(), ['duel', 'guess', 'hints', 'story']);
  assert.ok(participantIndex('someone') >= 0 && participantIndex('someone') < COMBOS);
});

test('hints and guesses are practice; picking from choices counts as Hard', () => {
  const mem = buildMemory([{ type: 'expose', clue: 'g:1', t: T0 }, ans('g:1', T0, false, { pretest: true }), ans('g:1', T0 + 1000, true, { cue: 'initials' })]);
  assert.equal(mem['g:1'].card, null);
  assert.equal(ratingFor({ correct: true, format: 'choice', ms: 2000 }), Rating.Hard);
  assert.equal(ratingFor({ correct: true, format: 'match', ms: 2000 }), Rating.Hard);
});

test('missed until a later day says otherwise; imports can be spread out', () => {
  const mem = buildMemory([ans('m:1', T0, false)]);
  assert.equal(status(mem['m:1']), 'missed');
  assert.equal(dueClues(mem, T0 + 3600000).length, 0, 'not again the same day');
  assert.equal(dueClues(mem, T0 + DAY_MS)[0].reason, 'missed');
  applyEvent(mem, ans('m:1', T0 + DAY_MS, true));
  assert.equal(status(mem['m:1']), 'mastered');
  const imp = buildMemory([{ ...ans('i:1', T0 - 40 * DAY_MS, true, { phase: 'import' }), spreadDue: T0 + 9 * DAY_MS }]);
  assert.equal(imp['i:1'].card.due, T0 + 9 * DAY_MS);
});

test('real study counts as evidence for every method', () => {
  const ev = [];
  let t = T0;
  for (const [m, right] of [['lightning', 0.9], ['guess', 0.5]]) {
    ev.push({ type: 'session-start', kind: 'study', sessionId: m, method: m, t });
    for (let i = 0; i < 20; i++) {
      const c = `x:${m}${i}`;
      ev.push({ type: 'expose', clue: c, sessionId: m, method: m, t: t + i });
      ev.push(ans(c, t + i + 1, true, { sessionId: m, phase: 'study' }));
      ev.push(ans(c, t + 7 * DAY_MS + i, i < right * 20, { sessionId: 'later' }));
    }
    ev.push({ type: 'session', kind: 'study', sessionId: m, method: m, studyMs: 600000, extraMs: 0, t: t + 100 });
    t += 1000;
  }
  ev.sort((a, b) => a.t - b.t);
  const se = studyEvidence(ev, 30);
  const L = se.find((x) => x.method === 'lightning'), G = se.find((x) => x.method === 'guess');
  assert.equal(L.introduced, 20);
  assert.equal(L.checkins[7].n, 20);
  assert.ok(L.keptAtH > G.keptAtH);
  const post = posteriors(se, {}, DEFAULT_BLUEPRINT, 30);
  assert.ok(post.lightning.kept.mean > post.guess.kept.mean);
  assert.ok(post.lightning.evidence.study && !post.flashcards.evidence.study);
});

test('check-ins: the latest open one is offered, earlier ones skipped', () => {
  const step = { finishedAt: T0 };
  assert.equal(nextCheckin(step, [], T0 + 2 * 3600000), null);   // later the same day
  assert.equal(nextCheckin(step, [], T0 + DAY_MS).day, 1);
  const late = nextCheckin(step, [], T0 + 4 * DAY_MS);
  assert.equal(late.day, 3);
  assert.deepEqual(late.skipped, [1]);
  assert.equal(nextCheckin(step, [1, 3], T0 + 5 * DAY_MS), null);
});

test('recall curve sanity', () => {
  assert.ok(Math.abs(recallAt(10, 10) - 0.9) < 0.005);   // FSRS: 90% at t = stability
  assert.ok(recallAt(10, 30) < recallAt(10, 5));
});

test('a test taken long after studying counts as a delayed test', () => {
  const mk = (gapMs, withCheckins) => {
    const ev = [];
    for (let i = 0; i < 20; i++) { ev.push({ type: 'expose', clue: `f${i}`, sessionId: 's', t: T0 + i * 1000 }); ev.push({ type: 'answer', clue: `f${i}`, sessionId: 's', phase: 'study', correct: true, t: T0 + i * 1000 + 500 }); }
    ev.push({ type: 'session', sessionId: 's', activeMs: 600000, t: T0 + 30000 });
    const testAt = T0 + 30000 + gapMs;
    for (let i = 0; i < 20; i++) ev.push({ type: 'answer', clue: `f${i}`, phase: 'immediate', calib: 's', correct: i < 12, t: testAt + i });
    if (withCheckins) for (const [d, k] of [[1, 11], [7, 8]]) for (let i = 0; i < 20; i++) ev.push({ type: 'answer', clue: `f${i}`, phase: 'checkin', calib: 's', checkinDay: d, correct: i < k, t: testAt + d * DAY_MS + i });
    return stepMetrics({ method: 'flashcards', civ: 'a', sessionId: 's', finishedAt: testAt + 100 }, ev, 30);
  };
  const onTime = mk(60000, true), late = mk(6 * 3600000, true), lateOnly = mk(6 * 3600000, false);
  assert.equal(onTime.immediate.delayHours, 0);
  assert.equal(onTime.immediate.p, 0.6);
  assert.ok(Math.abs(late.immediate.delayHours - 6) < 0.01);
  assert.ok(late.immediate.p > 0.6, `learned is read off the curve at zero: ${late.immediate.p}`);
  assert.equal(late.immediate.raw, 0.6);
  assert.equal(lateOnly.immediate.p, 0.6, 'without check-ins there is no curve yet: the raw score stands');
});

test('redoing one method sets the attempt aside and uses an unused civilization', () => {
  const cal = { protocol: 'quick', steps: assign(0, CIVS, 'quick').map((s) => ({ ...s, sessionId: `sid-${s.method}`, finishedAt: T0, doneDays: [1] })) };
  const used = cal.steps.map((s) => s.civ);
  assert.ok(canRedoFresh(cal, 0));
  const r = redoStep(cal, 0, CIVS, 'interrupted', T0);
  assert.ok(r.civ && !used.includes(r.civ));
  assert.equal(cal.steps[0].finishedAt, null);
  assert.equal(cal.steps[0].discarded[0].sessionId, `sid-${cal.steps[0].method}`);
  assert.ok(!canRedoFresh(cal, 1), 'all four used now');
  const r2 = redoStep(cal, 1, CIVS, '', T0);
  assert.equal(r2.civ, null);
  assert.equal(cal.steps[1].skipped, true);
});
