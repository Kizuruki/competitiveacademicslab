// Shared pieces for study methods. A method gets a context:
//   ctx.clues        clues to teach, in order
//   ctx.stage        element to draw in
//   ctx.wait(p)      resolves like p, or with STOP when the student presses "Stop here"
//   ctx.expose(c)    log that a clue was shown with its answer (once per session)
//   ctx.answer(c, correct, ms, extra)   log a graded attempt
//   ctx.check(text, c)                  is this answer right?
//   ctx.timer        active-time tracker (setIdle for reading screens)
// and resolves with { finished } — true when every clue has been through the method.
import { h, mount, answerBox } from '../ui.js';
import { answerOf, shownAnswer } from '../content.js';

export const STOP = Symbol('stop');

export function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
// Batches where no answer repeats (matching boards need distinct answers).
export function distinctBatches(clues, n) {
  const batches = [];
  for (const c of clues) {
    let b = batches.find((x) => x.length < n && !x.some((y) => y.answer === c.answer));
    if (!b) { b = []; batches.push(b); }
    b.push(c);
  }
  return batches;
}
export function groupByAnswer(clues) {
  const map = new Map();
  for (const c of clues) { if (!map.has(c.answer)) map.set(c.answer, []); map.get(c.answer).push(c); }
  return [...map.entries()].map(([answer, cs]) => ({ answer, clues: cs }));
}

export const kindTag = (c) => {
  const a = answerOf(c);
  return h('span', { class: 'tag' }, a?.type || c.sub || c.category || 'clue');
};

// Ask one clue and show feedback. Resolves { correct, given, ms } (or STOP).
export async function askClue(ctx, c, { wording = 'study', format = 'flashcard', label = '', extra = {}, feedback = true } = {}) {
  const box = answerBox();
  const fb = h('div', { class: 'feedback', 'aria-live': 'polite' });
  mount(ctx.stage, h('div', { class: 'card' },
    h('div', { class: 'card-top' }, kindTag(c), label ? h('span', { class: 'muted' }, label) : null),
    h('p', { class: 'prompt' }, wording === 'test' ? c.test : c.study),
    box.el, fb));
  const r = await ctx.wait(box.promise);
  if (r === STOP) return STOP;
  let correct = ctx.check(r.text, c);
  const ev = ctx.answer(c, correct, r.ms, { format, ...extra });
  if (!feedback) return { correct, given: r.text, ms: r.ms, ev };
  const a = { name: shownAnswer(c) };
  const next = h('button', { class: 'btn primary', type: 'button' }, 'Continue');
  const fix = r.text && !correct ? h('button', { class: 'btn ghost small', type: 'button', onclick: () => {
    ctx.fix(ev); correct = true;
    mount(fb, h('div', { class: 'ok' }, '✓ Counted as right: ', a.name), next);
    next.focus();
  } }, 'I was right') : null;
  mount(fb, correct
    ? h('div', { class: 'ok' }, '✓ ', a.name)
    : h('div', { class: 'no' }, r.text ? `✗ You said “${r.text}”. ` : '✗ ', 'Answer: ', h('strong', {}, a.name)), h('div', { class: 'row' }, next, fix));
  const go = enterOrClick(next, correct ? 900 : 0);
  next.focus();
  const w = await ctx.wait(go);
  if (w === STOP) return STOP;
  return { correct, given: r.text, ms: r.ms, ev };
}

// Resolves when the button is clicked, Enter is pressed (outside a text box), or after autoMs.
// Cleans up its key listener however it resolves, so a stale listener never eats a later Enter.
export function enterOrClick(btn, autoMs = 0) {
  return new Promise((res) => {
    let done = false;
    const key = (e) => { if (e.key === 'Enter' && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); finish(); } };
    function finish() { if (done) return; done = true; window.removeEventListener('keydown', key); res(); }
    btn.addEventListener('click', finish, { once: true });
    setTimeout(() => { if (!done) window.addEventListener('keydown', key); }, 150);
    if (autoMs) setTimeout(finish, autoMs);
  });
}

export function continueButton(label = 'Next') {
  const b = h('button', { class: 'btn primary', type: 'button' }, label);
  const p = enterOrClick(b);
  setTimeout(() => b.focus(), 30);
  return { el: b, promise: p };
}
