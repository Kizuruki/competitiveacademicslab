// Connect it (elaborative interrogation): see each clue with its answer and write one thing it
// connects to — why it makes sense, a place, a date, something it reminds you of. Then recall the
// batch. Your notes come back with the answer whenever you review the clue.
import { h } from '../ui.js';
import { shuffle } from '../engine/util.js';
import { STOP, distinctBatches, learnCard, recallUntilRight, mixedReview, askClue } from './common.js';

export const id = 'connect';
const PROMPTS = ['Why might this be true?', 'What does this connect to?', 'What else do you know about it?', 'What does it remind you of?'];

export async function run(ctx) {
  const batches = distinctBatches(shuffle(ctx.clues), 6), seen = [];
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    for (let i = 0; i < batch.length; i++) {
      const c = batch[i];
      const ta = h('textarea', { class: 'note-input', rows: 2, placeholder: 'Optional — a few words is plenty', 'aria-label': 'Your note' });
      ta.value = ctx.noteOf(c) || '';
      ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ta.closest('.card')?.querySelector('.btn.primary')?.click(); } });
      setTimeout(() => ta.focus(), 50);
      const r = await learnCard(ctx, c, `New clue ${i + 1} of ${batch.length}`, h('label', { class: 'field' }, h('span', {}, PROMPTS[i % PROMPTS.length]), ta));
      if (r === STOP) return { finished: false };
      if (ta.value.trim()) ctx.note(c, ta.value.trim());
    }
    if ((await recallUntilRight(ctx, batch, { format: 'connect' })) === STOP) return { finished: false };
    if ((await mixedReview(ctx, seen, b, 4, 'connect')) === STOP) return { finished: false };
    seen.push(...batch);
  }
  return { finished: true };
}

export async function extra(ctx) {
  for (;;) for (const c of shuffle(ctx.clues)) if ((await askClue(ctx, c, { format: 'connect', label: 'Extra practice' })) === STOP) return;
}
