// Matching: boards of up to 6 clues and their answers (topped up to 6 answers with other answers from
// the session, so a small board isn't a giveaway). Pick a clue, then its answer. Each board is played
// twice (shuffled the second time); every other batch adds a board of earlier clues. A clue counts as
// right on a board if its first pick was right.
import { h, mount } from '../ui.js';
import { shuffle } from '../engine/util.js';
import { answerOf } from '../content.js';
import { STOP, distinctBatches, continueButton } from './common.js';

export const id = 'matching';

function board(ctx, clues, label, pool = []) {
  return new Promise((resolve) => {
    const left = h('div', { class: 'match-col' }), right = h('div', { class: 'match-col' });
    const msg = h('div', { class: 'muted small', 'aria-live': 'polite' }, 'Pick a clue, then its answer.');
    mount(ctx.stage, h('div', { class: 'card' }, h('div', { class: 'card-top' }, h('span', { class: 'tag' }, 'Matching'), h('span', { class: 'muted' }, label)), msg, h('div', { class: 'match' }, left, right)));
    const missed = new Set(), done = new Set();
    let lastAt = performance.now();   // response time = time since the previous match
    let picked = null;
    const clueBtns = shuffle(clues).map((c) => {
      const b = h('button', { class: 'match-item clue', type: 'button' }, c.study);
      b.addEventListener('click', () => { if (done.has(c.id)) return; picked = c; clueBtns.forEach((x) => x.el.classList.toggle('picked', x.c === c)); });
      left.append(b);
      return { c, el: b };
    });
    const own = [...new Set(clues.map((c) => c.answer))];
    const fill = shuffle(pool.filter((x) => !own.includes(x))).slice(0, Math.max(0, 6 - own.length));
    const names = shuffle([...own, ...fill]);
    names.forEach((ansId) => {
      const b = h('button', { class: 'match-item ans', type: 'button' }, answerOf({ answer: ansId }).name);
      b.addEventListener('click', () => {
        if (!picked) { msg.textContent = 'Pick a clue first.'; return; }
        const c = picked;
        if (c.answer === ansId) {
          done.add(c.id);
          ctx.answer(c, !missed.has(c.id), Math.round(performance.now() - lastAt), { format: 'match' });
          lastAt = performance.now();
          clueBtns.find((x) => x.c === c).el.classList.add('matched');
          clueBtns.find((x) => x.c === c).el.classList.remove('picked');
          if (clues.filter((x) => x.answer === ansId).every((x) => done.has(x.id))) b.classList.add('matched');
          picked = null;
          msg.textContent = `✓ ${answerOf(c).name}`;
          if (done.size === clues.length) finish();
        } else {
          missed.add(c.id);
          b.classList.add('wrong');
          setTimeout(() => b.classList.remove('wrong'), 450);
          msg.textContent = '✗ Not that one.';
        }
      });
      right.append(b);
    });
    ctx.wait(new Promise(() => {})).then((r) => { if (r === STOP) resolve(STOP); });
    async function finish() {
      const next = continueButton('Next board');
      ctx.stage.querySelector('.card').append(h('div', { class: 'feedback' }, h('div', { class: missed.size ? 'no' : 'ok' }, missed.size ? `${clues.length - missed.size} of ${clues.length} right first time.` : 'All right first time!'), next.el));
      const w = await ctx.wait(next.promise);
      resolve(w === STOP ? STOP : { missed: missed.size });
    }
  });
}

export async function run(ctx) {
  const batches = distinctBatches(ctx.clues, 6), seen = [];
  const pool = [...new Set(ctx.clues.map((c) => c.answer))];
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    batch.forEach((c) => ctx.expose(c));
    if ((await board(ctx, batch, `Board ${b + 1} of ${batches.length}`, pool)) === STOP) return { finished: false };
    if ((await board(ctx, batch, `Board ${b + 1} again`, pool)) === STOP) return { finished: false };
    if (b % 2 === 1 && seen.length >= 6) {
      const mix = distinctBatches(shuffle(seen), 6)[0];
      if ((await board(ctx, mix, 'Mixed review', pool)) === STOP) return { finished: false };
    }
    seen.push(...batch);
  }
  return { finished: true };
}

export async function extra(ctx) {
  const pool = [...new Set(ctx.clues.map((c) => c.answer))];
  for (;;) for (const b of distinctBatches(shuffle(ctx.clues), 6)) if ((await board(ctx, b, 'Extra practice', pool)) === STOP) return;
}
