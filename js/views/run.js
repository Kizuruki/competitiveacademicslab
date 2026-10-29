// Runs a study method or a test inside a frame with a header and a "Stop here" button, and turns
// what the method reports into events in the log.
//
// Leaving partway (another page, closing the tab) pauses the run: what was done is already logged
// answer by answer, and a session-pause event records the active time so far, so the session shows
// as unfinished and can be picked up later.
import { h, mount, activeTimer } from '../ui.js';
import * as store from '../store.js';
import * as sitesync from '../sitesync.js';
import { check, world } from '../content.js';
import { STOP } from '../methods/common.js';
import * as flashcards from '../methods/flashcards.js';
import * as tossups from '../methods/tossup.js';
import * as story from '../methods/story.js';
import * as matching from '../methods/matching.js';
import * as guess from '../methods/guess.js';
import * as hints from '../methods/hints.js';
import * as choice from '../methods/choice.js';
import * as lightning from '../methods/lightning.js';
import * as confidence from '../methods/confidence.js';
import * as connect from '../methods/connect.js';
import * as duel from '../methods/duel.js';
import { quiz } from '../methods/quiz.js';
import { METHOD_INFO } from '../engine/calibration.js';

export const METHOD_MODULES = { flashcards, tossups, story, matching, guess, hints, choice, lightning, confidence, connect, duel };

let active = null;
export const activeRun = () => (active && !active.ended && active.stage.isConnected ? active : null);

// A frame: header, stage, stop button. segment() gives a fresh stop signal (so "Stop here" during
// study and "I'm done practicing" afterwards are separate). onPause(fn) registers what to record
// if the student leaves; abort() records it and freezes the run so nothing more happens.
export function frame(root, { title, note = '' }) {
  const stopBtn = h('button', { class: 'btn ghost small', type: 'button' }, 'Stop here');
  const clock = h('span', { class: 'muted small clock' });
  const heading = h('h1', { class: 'run-title' }, title);
  const noteEl = h('div', { class: 'muted small' }, note);
  const stage = h('div', { class: 'stage' });
  mount(root, h('section', { class: 'run' }, h('header', { class: 'run-head' }, h('div', {}, heading, noteEl), h('div', { class: 'row' }, clock, stopBtn)), stage));
  let stopResolve = () => {}, dead = false, pauseFns = [], paused = false;
  stopBtn.addEventListener('click', () => stopResolve(STOP));
  const fr = {
    stage, ended: false,
    end() { fr.ended = true; stopBtn.hidden = true; pauseFns = []; },
    onPause(fn) { pauseFns.push(fn); return () => { pauseFns = pauseFns.filter((x) => x !== fn); }; },
    // record what was done so far (once), e.g. when the tab is closing
    pause() { if (paused || fr.ended) return; paused = true; for (const fn of pauseFns) { try { fn(); } catch (err) { console.error(err); } } },
    abort() { fr.pause(); dead = true; fr.ended = true; stopResolve(STOP); },
    setTitle(t, n) { heading.textContent = t; if (n !== undefined) noteEl.textContent = n; },
    setStop(label, visible = true) { stopBtn.textContent = label; stopBtn.hidden = !visible; },
    showClock(timer, baseMs = 0) {
      const iv = setInterval(() => { if (!clock.isConnected) return clearInterval(iv); clock.textContent = `${Math.floor((baseMs + timer.ms()) / 60000)} min active`; }, 5000);
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
  const notes = new Map();
  for (const e of d.events) if (e.type === 'note') notes.set(e.clue, e.text);
  return {
    clues, stage: fr.stage, wait, timer, world: world(), settings: d.settings, check, records: d.records,
    saveRecords: () => store.save(),
    expose(c) {
      if (exposed.has(c.id)) return;
      exposed.add(c.id);
      store.log({ type: 'expose', clue: c.id, answer: c.answer, pack: c.pack, method, sessionId });
    },
    answer(c, correct, ms, extra = {}) {
      timer.poke();
      const ev = store.log({ type: 'answer', clue: c.id, answer: c.answer, pack: c.pack, correct: !!correct, ms, method, sessionId, phase, ...extraFields, ...extra });
      sitesync.onAnswer(ev);
      return ev;
    },
    // "I was right": the answer checker missed an acceptable answer
    fix(ev) { if (!ev || ev.correct) return; ev.correct = true; ev.override = true; store.touch(ev); sitesync.onAnswer(ev); },
    note(c, text) { notes.set(c.id, text); store.log({ type: 'note', clue: c.id, text: String(text).slice(0, 500), sessionId }); },
    noteOf: (c) => notes.get(c.id) || null,
    exposedCount: () => exposed.size,
    exposedIds: () => [...exposed],
  };
}

// Study a set of clues with a method; then, if they finished, optional extra practice.
// → { finished, stoppedEarly, activeMs, extraMs, exposed: [clueIds] }
// onPause({ activeMs, extraMs, exposed }) is called if the student leaves partway.
export async function studyWithMethod(fr, { method, clues, sessionId, phase = 'study', allowExtra = true, extraFields = {}, onPause = null, baseMs = 0 }) {
  const mod = METHOD_MODULES[method];
  const timer = activeTimer(60000);
  timer.start();
  fr.showClock(timer, baseMs);
  fr.setStop('Stop here');
  const ctx = methodContext({ fr, wait: fr.segment(), clues, method, phase, sessionId, timer, extraFields });
  let studyMs = null;
  const off = onPause ? fr.onPause(() => { const now = timer.ms(); onPause(studyMs === null ? { activeMs: now, extraMs: 0, exposed: ctx.exposedIds() } : { activeMs: studyMs, extraMs: now - studyMs, exposed: ctx.exposedIds() }); }) : () => {};
  let result;
  try { result = await mod.run(ctx); } catch (err) { console.error(err); result = { finished: false, error: String(err) }; }
  studyMs = timer.ms();
  let extraMs = 0;
  if (result.finished && allowExtra) {
    const choiceMade = await offerExtra(fr);
    if (choiceMade === 'extra') {
      fr.setStop("I'm done practicing");
      ctx.wait = fr.segment();
      await mod.extra(ctx);
      extraMs = timer.ms() - studyMs;
    }
  }
  off();
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
export async function testClues(fr, { clues, title, phase, sessionId, method = null, feedback = 'each', extraFields = {}, format = 'question', onPause = null }) {
  const timer = activeTimer(120000); timer.start();
  fr.setStop('Stop here');
  const off = onPause ? fr.onPause(() => onPause({ activeMs: timer.ms() })) : () => {};
  const ctx = methodContext({ fr, wait: fr.segment(), clues, method, phase, sessionId, timer, extraFields });
  const r = await quiz(ctx, clues, { title, feedback, format });
  off();
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
