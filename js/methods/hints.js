// Letter hints (diminishing cues): see each clue with its answer, then recall it three times with
// less help each time: every other letter shown, then first letters only, then nothing. Only the
// last round, with no hint, counts; the hinted rounds are practice.
import { shuffle } from '../engine/util.js';
import { STOP, distinctBatches, askClue, learnCard, recallUntilRight, mixedReview } from './common.js';

export const id = 'hints';

export async function run(ctx) {
  const batches = distinctBatches(shuffle(ctx.clues), 6), seen = [];
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    for (let i = 0; i < batch.length; i++) if ((await learnCard(ctx, batch[i], `New clue ${i + 1} of ${batch.length}`)) === STOP) return { finished: false };
    for (const [cue, label] of [['half', 'Hint: every other letter'], ['initials', 'Hint: first letters']]) {
      for (const c of shuffle(batch)) if ((await askClue(ctx, c, { format: 'hint', label, cue })) === STOP) return { finished: false };
    }
    if ((await recallUntilRight(ctx, batch, { format: 'hint', label: 'No hint' })) === STOP) return { finished: false };
    if ((await mixedReview(ctx, seen, b, 4, 'hint')) === STOP) return { finished: false };
    seen.push(...batch);
  }
  return { finished: true };
}

export async function extra(ctx) {
  for (;;) for (const c of shuffle(ctx.clues)) if ((await askClue(ctx, c, { format: 'hint', label: 'Extra practice' })) === STOP) return;
}
