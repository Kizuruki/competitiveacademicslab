// End to end on a simulated student: true learning speed, memory and engagement per method →
// calibration events → metrics → personalization. The recommendation should find the true best method.
import test from 'node:test';
import assert from 'node:assert/strict';
import { stepMetrics } from '../js/engine/metrics.js';
import { posteriors, chanceBest, DEFAULT_BLUEPRINT, expectedYield } from '../js/engine/personalize.js';
import { CHECKIN_DAYS } from '../js/engine/calibration.js';
import { makeRng, DAY_MS } from '../js/engine/util.js';
import { forgetting_curve } from '../vendor/ts-fsrs/index.mjs';
import { PARAMS } from '../js/engine/memory.js';

const T0 = new Date('2026-11-02T16:00:00').getTime();

function simulate(truth, rng, clues = 60) {
  const events = [], steps = [];
  Object.entries(truth).forEach(([method, tr], i) => {
    const sid = `cal-${method}`, start = T0 + i * DAY_MS;
    const activeMs = (clues / tr.rate) * 3600000;   // time to get through the clues at this speed
    events.push({ type: 'session', kind: 'calibration', sessionId: sid, method, civ: `civ${i}`, activeMs, t: start, enjoy: tr.enjoy, extraMs: 0, finished: true });
    for (let c = 0; c < clues; c++) events.push({ type: 'expose', sessionId: sid, clue: `${method}.${c}`, t: start });
    for (let c = 0; c < clues; c++) events.push({ type: 'answer', phase: 'immediate', calib: sid, clue: `${method}.${c}`, correct: rng() < tr.p0, t: start + 60000 });
    for (const d of CHECKIN_DAYS) for (let c = 0; c < clues; c++) {
      const p = tr.p0 * forgetting_curve(PARAMS.w, d, tr.S);
      events.push({ type: 'answer', phase: 'checkin', checkinDay: d, calib: sid, clue: `${method}.${c}`, correct: rng() < p, t: start + d * DAY_MS });
    }
    steps.push({ method, civ: `civ${i}`, sessionId: sid, finishedAt: start });
  });
  return { events, steps };
}

test('calibration finds the method with the best durable yield', () => {
  const rng = makeRng(11);
  // story learns slower but sticks far better; flashcards are fast but fade
  const truth = {
    flashcards: { rate: 140, p0: 0.8, S: 0.5, enjoy: 3 },
    tossups: { rate: 110, p0: 0.8, S: 6, enjoy: 3 },
    story: { rate: 90, p0: 0.9, S: 60, enjoy: 3 },
    matching: { rate: 120, p0: 0.75, S: 2, enjoy: 3 },
  };
  const { events, steps } = simulate(truth, rng);
  const metrics = steps.map((s) => stepMetrics(s, events, 30));
  const posts = posteriors(metrics, {}, DEFAULT_BLUEPRINT, 30);
  const pb = chanceBest(posts, 2, rng, 3000);
  const trueYield = (t) => t.rate * t.p0 * forgetting_curve(PARAMS.w, 30, t.S);
  const best = Object.entries(truth).sort((a, b) => trueYield(b[1]) - trueYield(a[1]))[0][0];
  assert.equal(best, 'story');
  // one session per method can't fully separate a ~14% difference, but story should already rank first
  assert.ok(pb.story === Math.max(...Object.values(pb)), JSON.stringify(pb));
  // measured rates are close to the truth
  const fc = metrics.find((m) => m.method === 'flashcards');
  assert.ok(Math.abs(fc.learnedPerHour - 140 * 0.8) / (140 * 0.8) < 0.15, `fc rate ${fc.learnedPerHour}`);
  assert.ok(fc.keptAtH < metrics.find((m) => m.method === 'story').keptAtH);
});

test('a method you keep doing for longer can win even at a lower rate', () => {
  const rng = makeRng(5);
  // same memory everywhere; flashcards twice as fast, but tossups enjoyed far more
  const truth = {
    flashcards: { rate: 200, p0: 0.85, S: 15, enjoy: 1 },
    tossups: { rate: 100, p0: 0.85, S: 15, enjoy: 5 },
    story: { rate: 100, p0: 0.85, S: 15, enjoy: 2 },
    matching: { rate: 100, p0: 0.85, S: 15, enjoy: 2 },
  };
  const { events, steps } = simulate(truth, rng);
  const metrics = steps.map((s) => stepMetrics(s, events, 30));
  // study-mode history: tossup sessions run 50 minutes, flashcard sessions 10 (the 10 h vs 2 h idea)
  const study = { tossups: [50, 55, 45, 50, 52, 48], flashcards: [10, 12, 9, 11, 10, 8] };
  const posts = posteriors(metrics, study, DEFAULT_BLUEPRINT, 30);
  assert.ok(posts.flashcards.learn.mean > posts.tossups.learn.mean * 1.4);   // faster per hour…
  assert.ok(expectedYield(posts.tossups, 2) > expectedYield(posts.flashcards, 2));   // …but less total
  const pb = chanceBest(posts, 2, rng, 3000);
  assert.ok(pb.tossups > pb.flashcards, JSON.stringify(pb));
});
