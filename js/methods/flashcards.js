// Flashcards: one card per clue (never a whole tossup), in batches of 6 with no answer twice in a
// batch. See each clue with its answer, then recall each answer from its clue until you've gotten
// every one right once (misses come back two cards later). Every other batch ends with a quick mixed
// recall of earlier clues.
import { shuffle } from '../engine/util.js';
import { STOP, distinctBatches, askClue, learnCard, recallUntilRight, mixedReview } from './common.js';

export const id = 'flashcards';

export async function run(ctx) {
  const batches = distinctBatches(shuffle(ctx.clues), 6), seen = [];
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    for (let i = 0; i < batch.length; i++) if ((await learnCard(ctx, batch[i], `New clue ${i + 1} of ${batch.length}`)) === STOP) return { finished: false };
    if ((await recallUntilRight(ctx, batch)) === STOP) return { finished: false };
    if ((await mixedReview(ctx, seen, b)) === STOP) return { finished: false };
    seen.push(...batch);
  }
  return { finished: true };
}

// After finishing: keep going with mixed recall of everything in the session.
export async function extra(ctx) {
  for (;;) for (const c of shuffle(ctx.clues)) if ((await askClue(ctx, c, { format: 'flashcard', label: 'Extra practice' })) === STOP) return;
}
