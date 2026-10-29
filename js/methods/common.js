// Shared pieces for study methods. A method gets a context:
//   ctx.clues        clues to teach, in order
//   ctx.stage        element to draw in
//   ctx.wait(p)      resolves like p, or with STOP when the student presses "Stop here"
//   ctx.expose(c)    log that a clue was shown with its answer (once per session)
//   ctx.answer(c, correct, ms, extra)   log a graded attempt → the event
//   ctx.fix(ev)      "I was right": the answer checker missed an acceptable answer
//   ctx.check(text, c)                  is this answer right?
//   ctx.timer        active-time tracker (setIdle for reading screens)
//   ctx.note(c, text) / ctx.noteOf(c)   the student's own note on a clue (Connect it)
//   ctx.records      personal bests (Lightning round, Tossup duel)
// and resolves with { finished } — true when every clue has been through the method.
import { h, mount, answerBox } from '../ui.js';
import { answerOf, shownAnswer } from '../content.js';
import { shuffle } from '../engine/util.js';

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

// Letter hints: "half" keeps every other letter, "initials" only the first letter of each word.
export function hintFor(text, level) {
  return String(text).split(/(\s+)/).map((w) => {
    if (/^\s+$/.test(w)) return w;
    let n = 0;
    return [...w].map((ch, i) => {
      if (!/\p{L}|\d/u.test(ch)) return ch;
      const keep = level === 'half' ? n % 2 === 0 : n === 0;
      n++;
      return keep ? ch : '_';
    }).join('');
  }).join('');
}

// Ask one clue and show feedback. Resolves { correct, given, ms, ev } (or STOP).
//   cue: show a letter hint (the answer is then practice, not graded)
export async function askClue(ctx, c, { wording = 'study', format = 'flashcard', label = '', extra = {}, feedback = true, cue = null } = {}) {
  const box = answerBox();
  const fb = h('div', { class: 'feedback', 'aria-live': 'polite' });
  mount(ctx.stage, h('div', { class: 'card' },
    h('div', { class: 'card-top' }, kindTag(c), label ? h('span', { class: 'muted' }, label) : null),
    h('p', { class: 'prompt' }, wording === 'test' ? c.test : c.study),
    cue ? h('p', { class: 'cue', 'aria-label': 'Letter hint' }, hintFor(shownAnswer(c), cue)) : null,
    box.el, fb));
  const r = await ctx.wait(box.promise);
  if (r === STOP) return STOP;
  let correct = ctx.check(r.text, c);
  const ev = ctx.answer(c, correct, r.ms, { format, ...(cue ? { cue } : {}), ...extra });
  if (!feedback) return { correct, given: r.text, ms: r.ms, ev };
  const a = { name: shownAnswer(c) };
  const note = ctx.noteOf ? ctx.noteOf(c) : null;
  const next = h('button', { class: 'btn primary', type: 'button' }, 'Continue');
  const fix = r.text && !correct ? h('button', { class: 'btn ghost small', type: 'button', onclick: () => {
    ctx.fix(ev); correct = true;
    mount(fb, h('div', { class: 'ok' }, '✓ Counted as right: ', a.name), h('div', { class: 'row' }, next));
    next.focus();
  } }, 'I was right') : null;
  mount(fb, correct
    ? h('div', { class: 'ok' }, '✓ ', a.name)
    : h('div', { class: 'no' }, r.text ? `✗ You said “${r.text}”. ` : '✗ ', 'Answer: ', h('strong', {}, a.name)),
  note ? h('div', { class: 'note' }, 'Your note: ', note) : null,
  h('div', { class: 'row' }, next, fix));
  const go = enterOrClick(next, correct && !note ? 900 : 0);
  next.focus();
  const w = await ctx.wait(go);
  if (w === STOP) return STOP;
  return { correct, given: r.text, ms: r.ms, ev };
}

// Recall each clue of a batch until each has been right once (misses come back two cards later).
export async function recallUntilRight(ctx, batch, { format = 'flashcard', label = 'Recall', cue = null } = {}) {
  let queue = shuffle(batch), tries = 0;
  while (queue.length && tries < batch.length * 4) {
    const c = queue.shift(); tries++;
    const r = await askClue(ctx, c, { format, label, cue });
    if (r === STOP) return STOP;
    if (!r.correct) queue.splice(Math.min(2, queue.length), 0, c);
  }
  return true;
}

// See a clue with its answer.
export async function learnCard(ctx, c, label, extraEl = null) {
  ctx.expose(c);
  const next = continueButton('Next');
  mount(ctx.stage, h('div', { class: 'card learn' },
    h('div', { class: 'card-top' }, kindTag(c), h('span', { class: 'muted' }, label)),
    h('p', { class: 'prompt' }, c.study),
    h('p', { class: 'reveal' }, 'Answer: ', h('strong', {}, shownAnswer(c))),
    extraEl, next.el));
  return ctx.wait(next.promise);
}

// A batch of clues with their answers on one screen.
export async function studyList(ctx, batch, title, button = 'Start') {
  batch.forEach((c) => ctx.expose(c));
  const go = continueButton(button);
  mount(ctx.stage, h('div', { class: 'card' },
    h('h2', {}, title),
    h('ul', { class: 'pairs' }, batch.map((c) => h('li', {}, h('span', {}, c.study), h('strong', {}, shownAnswer(c))))),
    go.el));
  ctx.timer.setIdle(3 * 60000);
  const r = await ctx.wait(go.promise);
  ctx.timer.setIdle(60000);
  return r;
}

// Mixed review of a few earlier clues, every other batch.
export async function mixedReview(ctx, seen, b, n = 4, format = 'flashcard') {
  if (b % 2 !== 1 || !seen.length) return true;
  for (const c of shuffle(seen).slice(0, n)) if ((await askClue(ctx, c, { format, label: 'Mixed review' })) === STOP) return STOP;
  return true;
}

// Resolves when the button is clicked, Enter is pressed (outside a text box), or after autoMs.
// Cleans up its key listener however it resolves, so a stale listener never eats a later Enter.
export function enterOrClick(btn, autoMs = 0) {
  return new Promise((res) => {
    let done = false;
    const key = (e) => { if (e.key === 'Enter' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) { e.preventDefault(); finish(); } };
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
