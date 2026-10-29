// Tests and reviews: typed answers to each clue, in its test wording (different from how it was
// studied). The immediate test shows results only at the end; check-ins and reviews show the answer
// after each question, like normal review.
import { h, mount } from '../ui.js';
import { shownAnswer } from '../content.js';
import { STOP, askClue, continueButton } from './common.js';

export async function quiz(ctx, clues, { title, feedback = 'each', wording = 'test', format = 'question', extra = {} } = {}) {
  const results = [];
  for (let i = 0; i < clues.length; i++) {
    const c = clues[i];
    const r = await askClue(ctx, c, { wording, format, label: `${title} · ${i + 1} of ${clues.length}`, extra, feedback: feedback === 'each' });
    if (r === STOP) break;
    results.push({ clue: c, ...r });
  }
  const k = results.filter((r) => r.correct).length;
  if (feedback === 'end' && results.length) {
    const misses = results.filter((r) => !r.correct);
    const next = continueButton('Continue');
    const head = h('h2', {}, `${title}: ${k} of ${results.length}`);
    mount(ctx.stage, h('div', { class: 'card' },
      head,
      misses.length ? h('details', { class: 'misses', open: true }, h('summary', {}, `See the ${misses.length} you missed`),
        h('ul', { class: 'miss-list' }, misses.map((m) => {
          const li = h('li', {}, m.clue.test, ' — ', h('strong', {}, shownAnswer(m.clue)), m.given ? h('span', { class: 'muted' }, ` (you said “${m.given}”) `) : null);
          if (m.given) li.append(h('button', { class: 'btn ghost small', type: 'button', onclick: (e) => { ctx.fix(m.ev); m.correct = true; head.textContent = `${title}: ${results.filter((x) => x.correct).length} of ${results.length}`; e.target.replaceWith(h('span', { class: 'ok small' }, ' counted as right')); } }, 'I was right'));
          return li;
        }))) : h('p', {}, 'Every one right.'),
      next.el));
    await next.promise;
  }
  const kFinal = results.filter((r) => r.correct).length;
  return { n: results.length, k: kFinal, results };
}
