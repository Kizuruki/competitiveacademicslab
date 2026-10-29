// Flashcards: one card per clue (never a whole tossup), in batches of 6 with no answer twice in a
// batch. See each clue with its answer, then recall each answer from its clue until you've gotten
// every one right once (misses come back two cards later). Every other batch ends with a quick mixed
// recall of earlier clues.
import { h, mount } from '../ui.js';
import { shuffle } from '../engine/util.js';
import { shownAnswer } from '../content.js';
import { STOP, distinctBatches, askClue, kindTag, continueButton } from './common.js';

export const id = 'flashcards';

async function learnCard(ctx, c, i, n) {
  ctx.expose(c);
  const next = continueButton('Next');
  mount(ctx.stage, h('div', { class: 'card learn' },
    h('div', { class: 'card-top' }, kindTag(c), h('span', { class: 'muted' }, `New clue ${i + 1} of ${n}`)),
    h('p', { class: 'prompt' }, c.study),
    h('p', { class: 'reveal' }, 'Answer: ', h('strong', {}, shownAnswer(c))),
    next.el));
  return ctx.wait(next.promise);
}

async function recallUntilRight(ctx, batch) {
  let queue = shuffle(batch), tries = 0;
  while (queue.length && tries < batch.length * 4) {
    const c = queue.shift(); tries++;
    const r = await askClue(ctx, c, { format: 'flashcard', label: 'Recall' });
    if (r === STOP) return STOP;
    if (!r.correct) queue.splice(Math.min(2, queue.length), 0, c);
  }
  return true;
}

export async function run(ctx) {
  const batches = distinctBatches(shuffle(ctx.clues), 6), seen = [];
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    for (let i = 0; i < batch.length; i++) if ((await learnCard(ctx, batch[i], i, batch.length)) === STOP) return { finished: false };
    if ((await recallUntilRight(ctx, batch)) === STOP) return { finished: false };
    if (b % 2 === 1 && seen.length) {
      for (const c of shuffle(seen).slice(0, 4)) if ((await askClue(ctx, c, { format: 'flashcard', label: 'Mixed review' })) === STOP) return { finished: false };
    }
    seen.push(...batch);
  }
  return { finished: true };
}

// After finishing: keep going with mixed recall of everything in the session.
export async function extra(ctx) {
  for (;;) for (const c of shuffle(ctx.clues)) if ((await askClue(ctx, c, { format: 'flashcard', label: 'Extra practice' })) === STOP) return;
}
