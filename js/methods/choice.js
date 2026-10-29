// Quiz show (multiple choice): study a batch of 6 clues with their answers, then pick each answer
// from four close choices (the other three are answers of the same kind). Misses come back until
// each is picked right. Picking is easier than recalling, so a right pick counts as Hard for the
// schedule and doesn't count as mastered on the bowl sites.
import { h, mount } from '../ui.js';
import { shuffle } from '../engine/util.js';
import { answerOf, distractors } from '../content.js';
import { STOP, distinctBatches, kindTag, studyList, enterOrClick } from './common.js';

export const id = 'choice';

function ask(ctx, c, label) {
  return new Promise((resolve) => {
    const options = shuffle([c.answer, ...distractors(c, 3)]);
    const started = performance.now();
    const fb = h('div', { class: 'feedback', 'aria-live': 'polite' });
    const btns = options.map((id, i) => h('button', { class: 'choice-btn', type: 'button', onclick: () => pick(id) }, h('kbd', {}, String(i + 1)), answerOf({ answer: id })?.name || id));
    mount(ctx.stage, h('div', { class: 'card' },
      h('div', { class: 'card-top' }, kindTag(c), h('span', { class: 'muted' }, label)),
      h('p', { class: 'prompt' }, c.study),
      h('div', { class: 'choices' }, btns), fb));
    const key = (e) => { const n = Number(e.key); if (n >= 1 && n <= options.length) { e.preventDefault(); pick(options[n - 1]); } };
    window.addEventListener('keydown', key);
    ctx.wait(new Promise(() => {})).then((r) => { if (r === STOP) { window.removeEventListener('keydown', key); resolve(STOP); } });
    let done = false;
    async function pick(id) {
      if (done) return;
      done = true;
      window.removeEventListener('keydown', key);
      const correct = id === c.answer;
      ctx.answer(c, correct, Math.round(performance.now() - started), { format: 'choice', given: answerOf({ answer: id })?.name });
      btns.forEach((b, i) => { b.disabled = true; if (options[i] === c.answer) b.classList.add('right'); else if (options[i] === id) b.classList.add('wrong'); });
      const next = h('button', { class: 'btn primary', type: 'button' }, 'Continue');
      mount(fb, h('div', { class: correct ? 'ok' : 'no' }, correct ? '✓ Right' : `✗ It's ${answerOf(c).name}`), h('div', { class: 'row' }, next));
      next.focus();
      const w = await ctx.wait(enterOrClick(next, correct ? 800 : 0));
      resolve(w === STOP ? STOP : { correct });
    }
  });
}

async function quizBatch(ctx, batch, label) {
  let queue = shuffle(batch), tries = 0;
  while (queue.length && tries < batch.length * 3) {
    const c = queue.shift(); tries++;
    const r = await ask(ctx, c, label);
    if (r === STOP) return STOP;
    if (!r.correct) queue.splice(Math.min(2, queue.length), 0, c);
  }
  return true;
}

export async function run(ctx) {
  const batches = distinctBatches(shuffle(ctx.clues), 6), seen = [];
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    if ((await studyList(ctx, batch, `Study these ${batch.length}`, 'Start the quiz')) === STOP) return { finished: false };
    if ((await quizBatch(ctx, batch, `Quiz ${b + 1} of ${batches.length}`)) === STOP) return { finished: false };
    if (b % 2 === 1 && seen.length) for (const c of shuffle(seen).slice(0, 4)) if ((await ask(ctx, c, 'Mixed review')) === STOP) return { finished: false };
    seen.push(...batch);
  }
  return { finished: true };
}

export async function extra(ctx) {
  for (;;) for (const c of shuffle(ctx.clues)) if ((await ask(ctx, c, 'Extra practice')) === STOP) return;
}
