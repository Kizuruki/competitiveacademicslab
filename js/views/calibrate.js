// Calibration: one method per invented civilization, an immediate test, then check-ins.
// A step can be left and picked up later: the clues already studied stay studied, the active time
// adds up, and it carries on from where it was (studying, rating or the test).
import { h, mount, toast, pct, dateLabel } from '../ui.js';
import * as store from '../store.js';
import * as model from '../model.js';
import { world, clue as clueById } from '../content.js';
import { METHODS, METHOD_INFO, PROTOCOLS, CHECKIN_DAYS, clueSet, nextCheckinDate, methodSet, canRedoFresh } from '../engine/calibration.js';
import { shuffle, uid, DAY_MS } from '../engine/util.js';
import { frame, studyWithMethod, testClues, rateSession } from './run.js';

const civName = (id) => world().civs.find((c) => c.id === id)?.name || id;
const exposedIn = (sid) => [...new Set(store.current().events.filter((e) => e.type === 'expose' && e.sessionId === sid).map((e) => e.clue))];

export function renderCalibrate(root) {
  const d = store.current();
  if (!d.calibration) return renderChooser(root);
  const admin = store.isAdmin();
  const steps = model.calibrationSteps();
  const due = model.checkinsDue();
  const next = model.nextStep();
  const rows = steps.map((s, i) => {
    const r = s.finishedAt ? model.stepResults().find((x) => x.sessionId === s.sessionId) : null;
    const nd = s.finishedAt ? nextCheckinDate(s, s.doneDays) : null;
    const dueHere = due.find((x) => x.index === i);
    const started = !s.finishedAt && s.sessionId;
    const late = r?.immediate.delayHours;
    if (s.skipped) {
      return h('tr', { class: 'rest' }, h('td', {}, String(i + 1)), h('td', {}, h('strong', {}, METHOD_INFO[s.method].label)), h('td', {}, '—'),
        h('td', { colspan: 4 }, 'Set aside. No unused civilization was left to redo it fairly, so this method is measured from your real study instead.'));
    }
    return h('tr', {},
      h('td', {}, String(i + 1)),
      h('td', {}, h('strong', {}, METHOD_INFO[s.method].label), s.discarded?.length ? h('div', { class: 'muted small' }, `redone ×${s.discarded.length}`) : null),
      h('td', {}, civName(s.civ)),
      h('td', {}, s.finishedAt ? `done ${dateLabel(s.finishedAt)}` : s === next ? h('a', { class: 'btn primary small', href: `#/calibrate/step/${i}` }, started ? 'Continue' : 'Start') : 'waiting',
        admin && (s.finishedAt || s.sessionId) ? h('button', { class: 'btn ghost small', type: 'button', onclick: () => redo(root, i) }, 'Redo') : null),
      h('td', {}, r ? pct(r.immediate.p) : started ? `${exposedIn(s.sessionId).length} clues so far` : '—',
        late ? h('div', { class: 'muted small', title: 'The test came well after studying, so it counts as a delayed test; “right away” is estimated from the forgetting curve.' }, `test ${late < 1 ? `${Math.round(late * 60)} min` : `${late.toFixed(1)} h`} late`) : null),
      h('td', {}, s.finishedAt ? CHECKIN_DAYS.map((day) => {
        const done = r?.checkins[day];
        const skipped = s.doneDays.includes(day) && !done;
        return h('span', { class: `chip ${done ? 'ok' : skipped ? 'skip' : ''}`, title: done ? `${done.k}/${done.n}` : skipped ? 'skipped' : 'not yet' }, `d${day}${done ? ' ' + pct(done.k / done.n) : ''}`);
      }) : '—'),
      h('td', {}, dueHere ? h('a', { class: 'btn primary small', href: `#/checkin/${i}` }, `Day-${dueHere.due.day} check-in`) : nd ? `next: day ${nd.day}, ${dateLabel(nd.at)}` : s.finishedAt ? 'all done' : ''));
  });
  const proto = PROTOCOLS[d.calibration.protocol];
  mount(root,
    h('section', {},
      h('h1', {}, 'Calibration'),
      h('p', { class: 'lede' }, `${proto.label}: ${proto.about} Each method teaches a different invented civilization, so nothing you already know helps, and what you learn with one method can't leak into another.`),
      due.length ? h('div', { class: 'callout' }, `${due.length} check-in${due.length > 1 ? 's are' : ' is'} ready. Check-ins take a few minutes and are what show how much each method's clues stick.`) : null,
      h('div', { class: 'table-wrap' }, h('table', { class: 'grid' },
        h('thead', {}, h('tr', {}, ['#', 'Method', 'Civilization', 'Status', 'Right away', 'Check-ins', 'Next'].map((x) => h('th', {}, x)))),
        h('tbody', {}, rows))),
      h('p', { class: 'muted small' }, 'Do one method per sitting if you can (a day apart is ideal). Check-ins open 1, 3, 7 and 14 days after each method; if you miss one, the next one still counts. You can leave a method partway and come back to it; if the test ends up more than 30 minutes after the studying, it counts as a delayed test. Methods you don’t calibrate here are measured while you study for real.'),
      h('div', { class: 'row' }, h('a', { class: 'btn', href: '#/results' }, 'See results'),
        store.isAdmin() ? h('button', { class: 'btn ghost small', type: 'button', onclick: () => {
          if (!confirm('Start calibration over? Your answers stay in the log, but the steps reset.')) return;
          d.calibration = null; store.saveNow(); renderCalibrate(root);
        } }, 'Start over') : null)));
}

// Redo one method: the attempt is set aside and the method starts again on an unused civilization
// (or, with none left, is measured in real study instead).
function redo(root, i) {
  const d = store.current();
  const s = d.calibration.steps[i];
  const fresh = canRedoFresh(d.calibration, i, world().civs.map((c) => c.id));
  const msg = fresh
    ? `Redo ${METHOD_INFO[s.method].label}? This attempt is set aside (kept in your log but not counted), and you'll do the method again with a civilization you haven't studied, so what you learned this time can't help.`
    : `Set ${METHOD_INFO[s.method].label} aside? Every civilization has been used, so it can't be redone fairly here — the method will be measured from your real study instead. (A test taken late is already counted as a delayed test, so you may not need this.)`;
  if (!confirm(msg)) return;
  model.redoStep(i, world().civs.map((c) => c.id), 'redo');
  toast(fresh ? 'Ready to redo' : 'Set aside');
  renderCalibrate(root);
}

function renderChooser(root) {
  const admin = store.isAdmin();
  const picked = new Set();
  const status = h('p', { class: 'muted small' });
  const pick = async (protocol) => {
    if (admin && picked.size && picked.size !== 4) { status.textContent = 'Pick exactly four methods, or none to use the usual rotation.'; return; }
    status.textContent = 'Starting…';
    try { await model.startCalibration(protocol, world().civs.map((c) => c.id), admin && picked.size === 4 ? [...picked] : null); }
    catch (err) { status.textContent = err.message; return; }
    location.hash = '#/calibrate'; renderCalibrate(root);
  };
  const p = store.current().profile.participant;
  mount(root, h('section', {},
    h('h1', {}, 'Calibration'),
    h('p', { class: 'lede' }, 'Find out which way of studying works best for you. You learn facts about invented civilizations, one study method per civilization, then get tested right away and again over the next two weeks. Because the facts are made up, everyone starts from zero and every method gets a fair test.'),
    h('div', { class: 'cards' },
      Object.entries(PROTOCOLS).map(([id, pr]) => h('div', { class: 'card choice' },
        h('h2', {}, pr.label), h('p', {}, pr.about),
        h('p', { class: 'muted small' }, id === 'full' ? 'Four methods, the full story of each civilization.' : 'Three methods, the first two chapters.'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => pick(id) }, `Start the ${pr.label.toLowerCase()}`)))),
    status,
    h('p', { class: 'muted small' }, `There are ${METHODS.length} methods and four civilizations, so each student calibrates four (the set rotates between students, so the class covers all of them). The others are measured while you study for real.`, p !== null && p !== undefined ? ` Your set: ${methodSet(p).map((m) => METHOD_INFO[m].label).join(', ')}.` : ''),
    admin ? h('details', { class: 'card' }, h('summary', {}, 'Coach: choose the four methods yourself'),
      h('div', { class: 'method-pick' }, METHODS.map((m) => {
        const b = h('button', { type: 'button', class: 'method-btn', 'aria-pressed': 'false', onclick: () => { if (picked.has(m)) picked.delete(m); else picked.add(m); b.setAttribute('aria-pressed', String(picked.has(m))); } }, h('strong', {}, METHOD_INFO[m].label));
        return b;
      }))) : null,
    h('h2', {}, 'The methods'),
    h('ul', { class: 'plain-list' }, METHODS.map((m) => h('li', {}, h('strong', {}, METHOD_INFO[m].label), ' — ', METHOD_INFO[m].blurb, h('div', { class: 'muted small' }, METHOD_INFO[m].why))))));
}

export async function runStep(root, i) {
  const d = store.current();
  const step = d.calibration?.steps[i];
  if (!step || step.finishedAt || step !== model.nextStep()) { location.hash = '#/calibrate'; return; }
  const all = clueSet(world(), step.civ, d.calibration.protocol).map((c) => clueById(c.id));
  const info = METHOD_INFO[step.method];
  const civ = world().civs.find((c) => c.id === step.civ);
  const resuming = !!step.sessionId;
  const go = await intro(root, {
    title: `${info.label}: ${civ.name}`,
    body: resuming
      ? [h('p', {}, `Picking up where you left off: ${exposedIn(step.sessionId).length} of ${all.length} clues studied so far.`)]
      : [h('p', {}, info.blurb), h('p', {}, civ.blurb), h('p', { class: 'muted small' }, `${all.length} clues about ${new Set(all.map((c) => c.answer)).size} answers. Study at your own pace; time only counts while you're active. When you've been through every clue there's an optional chance to keep practicing, then a short test. You can leave and come back.`)],
    button: resuming ? 'Continue' : 'Start',
  });
  if (!go) return;
  if (!resuming) {
    step.sessionId = uid(); step.startedAt = Date.now(); step.stage = 'study'; step.activeMs = 0; step.extraMs = 0;
    store.log({ type: 'session-start', kind: 'calibration', sessionId: step.sessionId, method: step.method, civ: step.civ, step: i });
  }
  step.stage = step.stage || 'study';
  store.saveNow();
  const sid = step.sessionId;
  const fr = frame(root, { title: `${info.label} · ${civ.name}`, note: 'Calibration' });
  const pause = (part) => { store.log({ type: 'session-pause', sessionId: sid, stage: step.stage, ...part }); store.saveNow(); };
  if (step.stage === 'study') {
    const done = new Set(exposedIn(sid));
    const left = all.filter((c) => !done.has(c.id));
    const r = left.length
      ? await studyWithMethod(fr, { method: step.method, clues: left, sessionId: sid, phase: 'study', extraFields: { calib: sid }, baseMs: step.activeMs,
        onPause: (p) => { step.activeMs += p.activeMs; step.extraMs += p.extraMs; pause({ activeMs: p.activeMs, extraMs: p.extraMs }); } })
      : { activeMs: 0, extraMs: 0, finished: true, stoppedEarly: false };
    step.activeMs += r.activeMs; step.extraMs += r.extraMs;
    step.finishedStudy = r.finished; step.stage = 'rate';
    store.saveNow();
  }
  if (step.stage === 'rate') {
    const rating = await rateSession(fr, step.method);
    const exposed = exposedIn(sid);
    store.log({ type: 'session', kind: 'calibration', sessionId: sid, method: step.method, civ: step.civ, activeMs: step.activeMs, extraMs: step.extraMs, finished: !!step.finishedStudy, stoppedEarly: !step.finishedStudy, enjoy: rating.enjoy, demand: rating.demand, introduced: exposed.length, resumed: resuming || undefined });
    step.stage = 'test';
    store.saveNow();
  }
  if (step.stage === 'test') {
    const answered = new Set(d.events.filter((e) => e.type === 'answer' && e.phase === 'immediate' && e.calib === sid).map((e) => e.clue));
    const tested = shuffle(exposedIn(sid).filter((id) => !answered.has(id)).map(clueById));
    fr.setTitle(`Test · ${civ.name}`, 'Right after studying');
    if (tested.length) {
      const r = await testClues(fr, { clues: tested, title: 'Test', phase: 'immediate', sessionId: uid(), method: step.method, feedback: 'end', extraFields: { calib: sid }, onPause: () => store.saveNow() });
      if (r.n < tested.length && fr.ended) return;   // left during the test: carry on next time
    }
    step.finishedAt = Date.now(); step.stage = 'done';
    store.saveNow();
  }
  fr.end();
  const res = model.stepResults().find((x) => x.sessionId === sid);
  const nextS = model.nextStep();
  mount(fr.stage, h('div', { class: 'card' },
    h('h2', {}, `${info.label} done`),
    res ? h('p', {}, `You studied ${res.introduced} clues in ${res.activeHours * 60 < 1.5 ? 'about a minute' : `${Math.round(res.activeHours * 60)} active minutes`} and got ${pct(res.immediate.p)} right on the test — about ${Math.round(res.learnedPerHour || 0)} clues learned per hour.`) : null,
    h('p', {}, `Your first check-in for ${civ.name} opens ${dateLabel(step.finishedAt + DAY_MS)}. `, nextS ? `Next method: ${METHOD_INFO[nextS.method].label} (best on another day).` : 'That was the last method — check-ins will finish the picture.'),
    h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '#/calibrate' }, 'Back to calibration'), h('a', { class: 'btn', href: '#/' }, 'Home'))));
}

export async function runCheckin(root, i) {
  const d = store.current();
  const step = d.calibration?.steps[i];
  const due = step && model.checkinsDue().find((x) => x.index === i);
  if (!due) { location.hash = '#/calibrate'; return; }
  const day = due.due.day;
  // a check-in left partway carries on with the clues not yet asked
  const asked = new Set(d.events.filter((e) => e.type === 'answer' && e.phase === 'checkin' && e.calib === step.sessionId && e.checkinDay === day).map((e) => e.clue));
  const clues = shuffle(exposedIn(step.sessionId).filter((id) => !asked.has(id)).map(clueById).filter(Boolean));
  const civ = world().civs.find((c) => c.id === step.civ);
  const go = await intro(root, {
    title: `Day-${day} check-in: ${civ.name}`,
    body: [h('p', {}, asked.size ? `${clues.length} questions left (you did ${asked.size} already).` : `${clues.length} questions on what you studied with ${METHOD_INFO[step.method].label.toLowerCase()}. Answer from memory; you'll see each answer afterwards.`),
      due.due.skipped.length ? h('p', { class: 'muted small' }, `The day-${due.due.skipped.join(' and day-')} check-in was missed; that's fine, this one still counts.`) : null],
    button: asked.size ? 'Continue' : 'Start',
  });
  if (!go) return;
  const fr = frame(root, { title: `Check-in · ${civ.name}`, note: `Day ${day}` });
  const r = clues.length ? await testClues(fr, { clues, title: `Day ${day}`, phase: 'checkin', sessionId: uid(), method: step.method, feedback: 'each', extraFields: { calib: step.sessionId, checkinDay: day }, onPause: () => store.saveNow() }) : { n: 0, k: 0 };
  if (fr.ended) return;
  const total = asked.size + r.n;
  if (total) {
    step.doneDays = [...new Set([...step.doneDays, ...due.due.skipped, day])];
    store.log({ type: 'checkin', calib: step.sessionId, day, skipped: due.due.skipped, n: total });
    store.saveNow();
  }
  fr.end();
  const k = d.events.filter((e) => e.type === 'answer' && e.phase === 'checkin' && e.calib === step.sessionId && e.checkinDay === day && e.correct).length;
  mount(fr.stage, h('div', { class: 'card' },
    h('h2', {}, `Check-in done: ${k} of ${total}`),
    h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '#/calibrate' }, 'Back to calibration'), h('a', { class: 'btn', href: '#/results' }, 'See results'))));
  if (total) toast('Check-in saved');
}

export function intro(root, { title, body, button = 'Start' }) {
  return new Promise((resolve) => {
    const start = h('button', { class: 'btn primary', type: 'button', onclick: () => resolve(true) }, button);
    mount(root, h('section', { class: 'card intro' }, h('h1', {}, title), body, h('div', { class: 'row' }, start, h('a', { class: 'btn ghost', href: '#/calibrate', onclick: () => resolve(false) }, 'Not now'))));
    setTimeout(() => start.focus(), 30);
  });
}
