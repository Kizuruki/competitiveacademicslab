// Runs a study method or a test inside a frame with a header and a "Stop here" button, and turns
// what the method reports into events in the log.
import { h, mount, activeTimer } from '../ui.js';
import * as store from '../store.js';
import { check, world } from '../content.js';
import { STOP } from '../methods/common.js';
import * as flashcards from '../methods/flashcards.js';
import * as tossups from '../methods/tossup.js';
import * as story from '../methods/story.js';
import * as matching from '../methods/matching.js';
import { quiz } from '../methods/quiz.js';
import { METHOD_INFO } from '../engine/calibration.js';

export const METHOD_MODULES = { flashcards, tossups, story, matching };

// The run on screen, if any. Leaving the page mid-run asks first, then abort() freezes the run so
// nothing more is logged from it.
let active = null;
export const activeRun = () => (active && !active.ended && active.stage.isConnected ? active : null);

// A frame: header, stage, stop button. segment() gives a fresh stop signal (so "Stop here" during
// study and "I'm done practicing" afterwards are separate).
export function frame(root, { title, note = '' }) {
  const stopBtn = h('button', { class: 'btn ghost small', type: 'button' }, 'Stop here');
  const clock = h('span', { class: 'muted small clock' });
  const heading = h('h1', { class: 'run-title' }, title);
  const noteEl = h('div', { class: 'muted small' }, note);
  const stage = h('div', { class: 'stage' });
  mount(root, h('section', { class: 'run' }, h('header', { class: 'run-head' }, h('div', {}, heading, noteEl), h('div', { class: 'row' }, clock, stopBtn)), stage));
  let stopResolve = () => {}, dead = false;
  stopBtn.addEventListener('click', () => stopResolve(STOP));
  const fr = {
    stage, ended: false,
    end() { fr.ended = true; stopBtn.hidden = true; },
    abort() { dead = true; fr.ended = true; stopResolve(STOP); },
    setTitle(t, n) { heading.textContent = t; if (n !== undefined) noteEl.textContent = n; },
    setStop(label, visible = true) { stopBtn.textContent = label; stopBtn.hidden = !visible; },
    showClock(timer) {
      const iv = setInterval(() => { if (!clock.isConnected) return clearInterval(iv); clock.textContent = `${Math.floor(timer.ms() / 60000)} min active`; }, 5000);
    },
    segment() {
      const p = new Promise((r) => { stopResolve = r; });
      return (x) => (dead ? new Promise(() => {}) : Promise.race([x, p]).then((v) => (dead ? new Promise(() => {}) : v)));
    },
  };
  active = fr;
  return fr;
}

// The context a method runs with (see methods/common.js).
export function methodContext({ fr, wait, clues, method, phase, sessionId, timer, extraFields = {} }) {
  const exposed = new Set();
  const d = store.current();
  return {
    clues, stage: fr.stage, wait, timer, world: world(), settings: d.settings, check,
    expose(c) {
      if (exposed.has(c.id)) return;
      exposed.add(c.id);
      store.log({ type: 'expose', clue: c.id, answer: c.answer, pack: c.pack, method, sessionId });
    },
    answer(c, correct, ms, extra = {}) {
      timer.poke();
      return store.log({ type: 'answer', clue: c.id, answer: c.answer, pack: c.pack, correct: !!correct, ms, method, sessionId, phase, ...extraFields, ...extra });
    },
    // "I was right": the answer checker missed an acceptable answer
    fix(ev) { if (!ev || ev.correct) return; ev.correct = true; ev.override = true; store.touch(); },
    exposedCount: () => exposed.size,
    exposedIds: () => [...exposed],
  };
}

// Study a set of clues with a method; then, if they finished, optional extra practice.
// → { finished, stoppedEarly, activeMs, extraMs, exposed: [clueIds] }
export async function studyWithMethod(fr, { method, clues, sessionId, phase = 'study', allowExtra = true, extraFields = {} }) {
  const mod = METHOD_MODULES[method];
  const timer = activeTimer(60000);
  timer.start();
  fr.showClock(timer);
  fr.setStop('Stop here');
  const ctx = methodContext({ fr, wait: fr.segment(), clues, method, phase, sessionId, timer, extraFields });
  let result;
  try { result = await mod.run(ctx); } catch (err) { console.error(err); result = { finished: false, error: String(err) }; }
  const studyMs = timer.ms();
  let extraMs = 0;
  if (result.finished && allowExtra) {
    const choice = await offerExtra(fr);
    if (choice === 'extra') {
      fr.setStop("I'm done practicing");
      ctx.wait = fr.segment();
      await mod.extra(ctx);
      extraMs = timer.ms() - studyMs;
    }
  }
  timer.stop();
  fr.setStop('', false);
  return { finished: !!result.finished, stoppedEarly: !result.finished, activeMs: studyMs, extraMs, exposed: ctx.exposedIds() };
}

function offerExtra(fr) {
  return new Promise((resolve) => {
    fr.setStop('', false);
    const more = h('button', { class: 'btn', type: 'button', onclick: () => resolve('extra') }, 'Keep practicing (optional)');
    const done = h('button', { class: 'btn primary', type: 'button', onclick: () => resolve('done') }, 'Done');
    mount(fr.stage, h('div', { class: 'card center' }, h('h2', {}, 'That’s every clue.'), h('p', { class: 'muted' }, 'You can keep practicing with this method as long as you like, or move on.'), h('div', { class: 'row center' }, more, done)));
    setTimeout(() => done.focus(), 30);
  });
}

// Typed test over clues (test wording). feedback: 'each' or 'end'.
export async function testClues(fr, { clues, title, phase, sessionId, method = null, feedback = 'each', extraFields = {}, format = 'question' }) {
  const timer = activeTimer(120000); timer.start();
  fr.setStop('Stop here');
  const ctx = methodContext({ fr, wait: fr.segment(), clues, method, phase, sessionId, timer, extraFields });
  const r = await quiz(ctx, clues, { title, feedback, format });
  const ms = timer.stop();
  fr.setStop('', false);
  return { ...r, activeMs: ms };
}

// 1–5 ratings after a calibration session.
export function rateSession(fr, method) {
  return new Promise((resolve) => {
    const vals = { enjoy: null, demand: null };
    const scale = (key, low, high) => {
      const btns = [1, 2, 3, 4, 5].map((v) => h('button', { class: 'scale-btn', type: 'button', 'aria-pressed': 'false', onclick: () => {
        vals[key] = v; btns.forEach((b, i) => b.setAttribute('aria-pressed', String(i + 1 === v))); go.disabled = !(vals.enjoy && vals.demand);
      } }, String(v)));
      return h('div', { class: 'scale' }, h('span', { class: 'muted small' }, low), h('div', { class: 'scale-row' }, btns), h('span', { class: 'muted small' }, high));
    };
    const go = h('button', { class: 'btn primary', type: 'button', disabled: true, onclick: () => resolve(vals) }, 'Continue to the test');
    mount(fr.stage, h('div', { class: 'card' },
      h('h2', {}, `How was ${METHOD_INFO[method].label.toLowerCase()}?`),
      h('p', {}, 'How much did you enjoy studying this way?'), scale('enjoy', 'Not at all', 'A lot'),
      h('p', {}, 'How much effort did it take?'), scale('demand', 'Very little', 'A lot'),
      h('p', { class: 'muted small' }, 'Next is a short test on what you just studied, with the clues worded differently. Results are shown at the end.'),
      go));
  });
}
