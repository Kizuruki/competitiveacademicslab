// Guess first (pretesting): for each new clue, guess the answer before seeing it — a wrong guess is
// expected and fine — then see the answer. After a batch of 6, recall each until right.
// The guesses are practice only (they don't count as missed anywhere); the recall afterwards counts.
import { h, mount, answerBox } from '../ui.js';
import { shuffle } from '../engine/util.js';
import { shownAnswer } from '../content.js';
import { STOP, distinctBatches, kindTag, continueButton, recallUntilRight, mixedReview, askClue } from './common.js';

export const id = 'guess';

async function guess(ctx, c, i, n) {
  const box = answerBox({ placeholder: 'Your best guess' });
  mount(ctx.stage, h('div', { class: 'card' },
    h('div', { class: 'card-top' }, kindTag(c), h('span', { class: 'muted' }, `Guess ${i + 1} of ${n}`)),
    h('p', { class: 'prompt' }, c.study),
    h('p', { class: 'muted small' }, 'You haven’t seen this one yet. Guess anyway — trying first helps you remember the answer, even when the guess is wrong.'),
    box.el));
  const r = await ctx.wait(box.promise);
  if (r === STOP) return STOP;
  const right = ctx.check(r.text, c);
  ctx.answer(c, right, r.ms, { format: 'guess', pretest: true, given: r.text || undefined });
  ctx.expose(c);
  const next = continueButton('Next');
  mount(ctx.stage, h('div', { class: 'card learn' },
    h('div', { class: 'card-top' }, kindTag(c), h('span', { class: 'muted' }, `Guess ${i + 1} of ${n}`)),
    h('p', { class: 'prompt' }, c.study),
    h('p', { class: right ? 'ok' : 'muted' }, right ? '✓ Good guess!' : r.text ? `You guessed “${r.text}”.` : 'No guess.'),
    h('p', { class: 'reveal' }, 'Answer: ', h('strong', {}, shownAnswer(c))),
    next.el));
  return ctx.wait(next.promise);
}

export async function run(ctx) {
  const batches = distinctBatches(shuffle(ctx.clues), 6), seen = [];
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    for (let i = 0; i < batch.length; i++) if ((await guess(ctx, batch[i], i, batch.length)) === STOP) return { finished: false };
    if ((await recallUntilRight(ctx, batch, { format: 'guess' })) === STOP) return { finished: false };
    if ((await mixedReview(ctx, seen, b, 4, 'guess')) === STOP) return { finished: false };
    seen.push(...batch);
  }
  return { finished: true };
}

export async function extra(ctx) {
  for (;;) for (const c of shuffle(ctx.clues)) if ((await askClue(ctx, c, { format: 'guess', label: 'Extra practice' })) === STOP) return;
}
