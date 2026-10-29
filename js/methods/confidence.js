// Sure or not? See each clue with its answer, then recall it — and before you find out whether you
// were right, say how sure you are. A mistake you were sure about is pointed out and comes back
// first; those are the mistakes feedback fixes best.
import { h, mount, answerBox } from '../ui.js';
import { shuffle } from '../engine/util.js';
import { shownAnswer } from '../content.js';
import { STOP, distinctBatches, kindTag, learnCard, enterOrClick } from './common.js';

export const id = 'confidence';
const LEVELS = [['sure', 'Sure'], ['think', 'I think so'], ['guess', 'Guessing']];

async function ask(ctx, c, label) {
  const box = answerBox();
  const area = h('div', { class: 'feedback', 'aria-live': 'polite' });
  mount(ctx.stage, h('div', { class: 'card' },
    h('div', { class: 'card-top' }, kindTag(c), h('span', { class: 'muted' }, label)),
    h('p', { class: 'prompt' }, c.study), box.el, area));
  const r = await ctx.wait(box.promise);
  if (r === STOP) return STOP;
  let sure = 'guess';
  if (r.text) {
    const pick = new Promise((res) => mount(area, h('p', {}, 'How sure are you?'), h('div', { class: 'row' }, LEVELS.map(([v, l], i) => {
      const b = h('button', { class: 'btn', type: 'button', onclick: () => res(v) }, `${i + 1}. ${l}`);
      if (i === 0) setTimeout(() => b.focus(), 30);
      return b;
    }))));
    const keys = new Promise((res) => { const k = (e) => { const n = Number(e.key); if (n >= 1 && n <= 3) { window.removeEventListener('keydown', k); res(LEVELS[n - 1][0]); } }; window.addEventListener('keydown', k); pick.then(() => window.removeEventListener('keydown', k)); });
    const s = await ctx.wait(Promise.race([pick, keys]));
    if (s === STOP) return STOP;
    sure = s;
  }
  let correct = ctx.check(r.text, c);
  const ev = ctx.answer(c, correct, r.ms, { format: 'confidence', confidence: sure, given: r.text || undefined });
  const next = h('button', { class: 'btn primary', type: 'button' }, 'Continue');
  const fix = r.text && !correct ? h('button', { class: 'btn ghost small', type: 'button', onclick: () => { ctx.fix(ev); correct = true; mount(area, h('div', { class: 'ok' }, '✓ Counted as right: ', shownAnswer(c)), h('div', { class: 'row' }, next)); next.focus(); } }, 'I was right') : null;
  const surprise = !correct && sure === 'sure';
  mount(area,
    correct ? h('div', { class: 'ok' }, '✓ ', shownAnswer(c), sure === 'guess' ? h('span', { class: 'muted' }, ' — a lucky guess? It’ll come back to check.') : null)
      : h('div', { class: 'no' }, r.text ? `✗ You said “${r.text}”. ` : '✗ ', 'Answer: ', h('strong', {}, shownAnswer(c))),
    surprise ? h('div', { class: 'callout' }, 'You were sure about that one. Take a second look at the answer — confident mistakes are the easiest to fix right now.') : null,
    h('div', { class: 'row' }, next, fix));
  next.focus();
  const w = await ctx.wait(enterOrClick(next, correct && sure !== 'guess' ? 900 : 0));
  if (w === STOP) return STOP;
  return { correct, sure };
}

export async function run(ctx) {
  const batches = distinctBatches(shuffle(ctx.clues), 6);
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    for (let i = 0; i < batch.length; i++) if ((await learnCard(ctx, batch[i], `New clue ${i + 1} of ${batch.length}`)) === STOP) return { finished: false };
    let queue = shuffle(batch), tries = 0;
    while (queue.length && tries < batch.length * 4) {
      const c = queue.shift(); tries++;
      const r = await ask(ctx, c, 'Recall');
      if (r === STOP) return { finished: false };
      if (!r.correct) queue.splice(r.sure === 'sure' ? 0 : Math.min(2, queue.length), 0, c);   // a confident miss comes straight back
      else if (r.sure === 'guess') queue.push(c);                                            // a lucky guess gets checked once more
    }
  }
  return { finished: true };
}

export async function extra(ctx) {
  for (;;) for (const c of shuffle(ctx.clues)) if ((await ask(ctx, c, 'Extra practice')) === STOP) return;
}
