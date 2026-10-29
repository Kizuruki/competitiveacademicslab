// Tossup duel: tossups against an AI opponent. The AI buzzes partway through some tossups — usually
// right, sometimes wrong (then it's your turn). If it beats you, you still answer, for practice.
// It gets quicker as you win and slower as you lose, so games stay close. Clue credit works as in
// Tossups: the clue you buzzed on counts, clues read before it get asked on their own later.
import { h, mount } from '../ui.js';
import { shuffle } from '../engine/util.js';
import { answerOf, distractors } from '../content.js';
import { STOP, chunk, groupByAnswer, continueButton } from './common.js';
import { playTossup } from './tossup.js';

export const id = 'duel';

// level 0–6: how early and how often the AI buzzes
function opponentFor(group, level, rng = Math.random) {
  const n = group.clues.length;
  const pBuzz = 0.45 + level * 0.07;           // chance it buzzes at all
  if (rng() > pBuzz) return { clue: Infinity, word: 0, correct: false };
  const clue = Math.min(n - 1, Math.floor(rng() * n * (1 - level * 0.08)));
  const words = group.clues[0].study.split(/\s+/).length;
  const word = Math.max(2, Math.floor(words * (0.35 + rng() * 0.6)));
  const wrong = distractors(group.clues[0], 1)[0];
  return { clue, word, correct: rng() < 0.75 + level * 0.03, wrongName: wrong ? answerOf({ answer: wrong }).name : 'something else' };
}

async function game(ctx, groups, label, graded = true) {
  const rec = ctx.records.duel || (ctx.records.duel = { level: 2, wins: 0, losses: 0 });
  let you = 0, ai = 0;
  for (let i = 0; i < groups.length; i++) {
    const r = await playTossup(ctx, groups[i], { graded, label: `${label} · tossup ${i + 1} of ${groups.length} · you ${you}, AI ${ai}`, opponent: graded ? opponentFor(groups[i], rec.level) : null });
    if (r === STOP) return STOP;
    if (r.aiWon) ai++; else if (r.correct) you++;
  }
  if (!graded) return true;
  const won = you > ai;
  if (you !== ai) { if (won) { rec.wins++; rec.level = Math.min(6, rec.level + 1); } else { rec.losses++; rec.level = Math.max(0, rec.level - 1); } }
  ctx.saveRecords?.();
  const next = continueButton('Next');
  mount(ctx.stage, h('div', { class: 'card center' },
    h('h2', {}, you === ai ? `A tie, ${you}–${ai}` : won ? `You win, ${you}–${ai}!` : `The AI wins, ${ai}–${you}`),
    h('p', { class: 'muted' }, `Games won ${rec.wins}, lost ${rec.losses}. The AI is now at level ${rec.level} of 6.`),
    next.el));
  return ctx.wait(next.promise);
}

export async function run(ctx) {
  const batches = chunk(groupByAnswer(shuffle(ctx.clues)), 3);
  for (let b = 0; b < batches.length; b++) {
    // first time through new answers: read without the AI
    if ((await game(ctx, batches[b], 'First reading', false)) === STOP) return { finished: false };
    if ((await game(ctx, shuffle(batches[b]), `Game ${b + 1} of ${batches.length}`)) === STOP) return { finished: false };
  }
  return { finished: true };
}

export async function extra(ctx) {
  for (;;) for (const batch of chunk(shuffle(groupByAnswer(ctx.clues)), 4)) if ((await game(ctx, batch, 'Rematch')) === STOP) return;
}
