// Lightning round: study a batch of 8 clues with their answers, then 60 seconds to answer as many
// as you can (they come round again until time runs out). A point for each right answer, a bonus
// point for every 5 in a row, and your best score is kept. A final round mixes everything.
import { h, mount, answerBox } from '../ui.js';
import { shuffle } from '../engine/util.js';
import { shownAnswer } from '../content.js';
import { STOP, chunk, kindTag, studyList, continueButton } from './common.js';

export const id = 'lightning';

async function round(ctx, clues, label) {
  const ROUND_MS = (ctx.settings.lightningSeconds || 60) * 1000;
  const start = continueButton('Go!');
  mount(ctx.stage, h('div', { class: 'card center' }, h('h2', {}, label), h('p', { class: 'muted' }, `${ROUND_MS / 1000} seconds. Type the answer and press Enter; “Don't know” skips.`), start.el));
  if ((await ctx.wait(start.promise)) === STOP) return STOP;
  const t0 = performance.now();
  let score = 0, streak = 0, best = 0, queue = [];
  const missed = new Map();
  const clock = h('span', { class: 'clock big' });
  const scoreEl = h('span', { class: 'score' }, '0');
  const tick = setInterval(() => { clock.textContent = `${Math.max(0, Math.ceil((ROUND_MS - (performance.now() - t0)) / 1000))}s`; }, 200);
  const timeUp = new Promise((r) => setTimeout(() => r('time'), ROUND_MS));
  try {
    for (;;) {
      if (!queue.length) queue = shuffle(clues);   // round again until time runs out
      const c = queue.shift();
      const box = answerBox({ placeholder: 'Answer…' });
      const flash = h('div', { class: 'flash', 'aria-live': 'polite' });
      mount(ctx.stage, h('div', { class: 'card' },
        h('div', { class: 'card-top' }, kindTag(c), h('span', {}, clock, ' · ', h('strong', {}, scoreEl), ' pts', streak >= 2 ? ` · streak ${streak}` : '')),
        h('p', { class: 'prompt' }, c.study), box.el, flash));
      const r = await ctx.wait(Promise.race([box.promise, timeUp]));
      if (r === STOP) return STOP;
      if (r === 'time') break;
      const correct = !!r.text && ctx.check(r.text, c);
      ctx.answer(c, correct, r.ms, { format: 'lightning', given: r.text || undefined });
      if (correct) { streak++; score += 1 + (streak % 5 === 0 ? 1 : 0); best = Math.max(best, streak); }
      else { streak = 0; missed.set(c.id, c); }
      scoreEl.textContent = String(score);
      if (!correct) {
        mount(flash, h('div', { class: 'no' }, '✗ ', shownAnswer(c)));
        const w = await ctx.wait(Promise.race([new Promise((res) => setTimeout(res, 1100)), timeUp]));
        if (w === STOP) return STOP;
        if (w === 'time') break;
      }
    }
  } finally { clearInterval(tick); }
  const rec = ctx.records.lightning || (ctx.records.lightning = { best: 0 });
  const isBest = score > rec.best;
  if (isBest) rec.best = score;
  ctx.saveRecords?.();
  const next = continueButton('Next');
  mount(ctx.stage, h('div', { class: 'card' },
    h('h2', {}, `${score} point${score === 1 ? '' : 's'}${isBest ? ' — a new best!' : ''}`),
    h('p', { class: 'muted' }, `Best streak ${best}. Your best round: ${rec.best}.`),
    missed.size ? [h('h3', {}, 'Worth another look'), h('ul', { class: 'pairs' }, [...missed.values()].map((c) => h('li', {}, h('span', {}, c.study), h('strong', {}, shownAnswer(c)))))] : null,
    next.el));
  return ctx.wait(next.promise);
}

export async function run(ctx) {
  const batches = chunk(shuffle(ctx.clues), 8);
  for (let b = 0; b < batches.length; b++) {
    if ((await studyList(ctx, batches[b], `Study these ${batches[b].length}`, 'Ready')) === STOP) return { finished: false };
    if ((await round(ctx, batches[b], `Round ${b + 1} of ${batches.length}`)) === STOP) return { finished: false };
  }
  if (batches.length > 1 && (await round(ctx, ctx.clues, 'Final round: everything')) === STOP) return { finished: false };
  return { finished: true };
}

export async function extra(ctx) {
  for (;;) if ((await round(ctx, ctx.clues, 'Extra round')) === STOP) return;
}
