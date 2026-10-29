// Calibration: one method per invented civilization, an immediate test, then check-ins.
import { h, mount, toast, pct, dateLabel } from '../ui.js';
import * as store from '../store.js';
import * as model from '../model.js';
import { world, clue as clueById } from '../content.js';
import { METHOD_INFO, PROTOCOLS, CHECKIN_DAYS, clueSet, nextCheckinDate } from '../engine/calibration.js';
import { shuffle, uid, DAY_MS } from '../engine/util.js';
import { frame, studyWithMethod, testClues, rateSession } from './run.js';

const civName = (id) => world().civs.find((c) => c.id === id)?.name || id;

export function renderCalibrate(root) {
  const d = store.current();
  if (!d.calibration) return renderChooser(root);
  const steps = model.calibrationSteps();
  const due = model.checkinsDue();
  const next = model.nextStep();
  const rows = steps.map((s, i) => {
    const r = s.finishedAt ? model.stepResults().find((x) => x.sessionId === s.sessionId) : null;
    const nd = s.finishedAt ? nextCheckinDate(s, s.doneDays) : null;
    const dueHere = due.find((x) => x.index === i);
    return h('tr', {},
      h('td', {}, String(i + 1)),
      h('td', {}, h('strong', {}, METHOD_INFO[s.method].label)),
      h('td', {}, civName(s.civ)),
      h('td', {}, s.finishedAt ? `done ${dateLabel(s.finishedAt)}` : s === next ? h('a', { class: 'btn primary small', href: `#/calibrate/step/${i}` }, 'Start') : 'waiting'),
      h('td', {}, r ? pct(r.immediate.p) : '—'),
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
      h('p', { class: 'muted small' }, 'Do one method per sitting if you can (a day apart is ideal). Check-ins open 1, 3, 7 and 14 days after each method; if you miss one, the next one still counts. Your participant number is ', String(d.calibration.participant), ', which sets the order of methods and which civilization goes with which method.'),
      h('div', { class: 'row' }, h('a', { class: 'btn', href: '#/results' }, 'See results'),
        h('button', { class: 'btn ghost small', type: 'button', onclick: () => {
          if (!confirm('Start calibration over? Your answers stay in the log, but the steps reset.')) return;
          d.calibration = null; store.saveNow(); renderCalibrate(root);
        } }, 'Start over'))));
}

function renderChooser(root) {
  const pick = (protocol) => { model.startCalibration(protocol, world().civs.map((c) => c.id)); location.hash = '#/calibrate'; renderCalibrate(root); };
  mount(root, h('section', {},
    h('h1', {}, 'Calibration'),
    h('p', { class: 'lede' }, 'Find out which way of studying works best for you. You learn facts about invented civilizations, one study method per civilization, then get tested right away and again over the next two weeks. Because the facts are made up, everyone starts from zero and every method gets a fair test.'),
    h('div', { class: 'cards' },
      Object.entries(PROTOCOLS).map(([id, p]) => h('div', { class: 'card choice' },
        h('h2', {}, p.label), h('p', {}, p.about),
        h('p', { class: 'muted small' }, id === 'full' ? 'Best for training your own model: all four methods, the full story.' : 'Good for a class survey: three of the four methods (rotated between students), the first two chapters.'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => pick(id) }, `Start the ${p.label.toLowerCase()}`)))),
    h('h2', {}, 'The methods'),
    h('ul', { class: 'plain-list' }, Object.values(METHOD_INFO).map((m) => h('li', {}, h('strong', {}, m.label), ' — ', m.blurb)))));
}

export async function runStep(root, i) {
  const d = store.current();
  const step = d.calibration?.steps[i];
  if (!step || step.finishedAt || step !== model.nextStep()) { location.hash = '#/calibrate'; return; }
  const clues = clueSet(world(), step.civ, d.calibration.protocol).map((c) => clueById(c.id));
  const info = METHOD_INFO[step.method];
  const civ = world().civs.find((c) => c.id === step.civ);
  const go = await intro(root, {
    title: `${info.label}: ${civ.name}`,
    body: [h('p', {}, info.blurb), h('p', {}, civ.blurb), h('p', { class: 'muted small' }, `${clues.length} clues about ${new Set(clues.map((c) => c.answer)).size} answers. Study at your own pace; time only counts while you're active. When you've been through every clue there's an optional chance to keep practicing, then a short test.`)],
  });
  if (!go) return;
  // A fresh id each attempt: an attempt abandoned partway doesn't count toward this one.
  step.sessionId = uid();
  step.attempts = (step.attempts || 0) + 1;
  step.startedAt = Date.now();
  store.saveNow();
  const fr = frame(root, { title: `${info.label} · ${civ.name}`, note: 'Calibration' });
  const r = await studyWithMethod(fr, { method: step.method, clues, sessionId: step.sessionId, phase: 'study', extraFields: { calib: step.sessionId } });
  const rating = await rateSession(fr, step.method);
  store.log({ type: 'session', kind: 'calibration', sessionId: step.sessionId, method: step.method, civ: step.civ, activeMs: r.activeMs, extraMs: r.extraMs, finished: r.finished, stoppedEarly: r.stoppedEarly, enjoy: rating.enjoy, demand: rating.demand, introduced: r.exposed.length });
  const tested = shuffle(r.exposed.map(clueById));
  fr.setTitle(`Test · ${civ.name}`, 'Right after studying');
  if (tested.length) await testClues(fr, { clues: tested, title: 'Test', phase: 'immediate', sessionId: step.sessionId, method: step.method, feedback: 'end', extraFields: { calib: step.sessionId } });
  step.finishedAt = Date.now();
  store.saveNow();
  fr.end();
  const res = model.stepResults().find((x) => x.sessionId === step.sessionId);
  const nextS = model.nextStep();
  mount(fr.stage, h('div', { class: 'card' },
    h('h2', {}, `${info.label} done`),
    h('p', {}, `You studied ${res.introduced} clues in ${res.activeHours * 60 < 1.5 ? 'about a minute' : `${Math.round(res.activeHours * 60)} active minutes`} and got ${pct(res.immediate.p)} right on the test — about ${Math.round(res.learnedPerHour || 0)} clues learned per hour.`),
    h('p', {}, `Your first check-in for ${civ.name} opens ${dateLabel(step.finishedAt + DAY_MS)}. `, nextS ? `Next method: ${METHOD_INFO[nextS.method].label} (best on another day).` : 'That was the last method — check-ins will finish the picture.'),
    h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '#/calibrate' }, 'Back to calibration'), h('a', { class: 'btn', href: '#/' }, 'Home'))));
}

export async function runCheckin(root, i) {
  const d = store.current();
  const step = d.calibration?.steps[i];
  const due = step && model.checkinsDue().find((x) => x.index === i);
  if (!due) { location.hash = '#/calibrate'; return; }
  const exposed = [...new Set(d.events.filter((e) => e.type === 'expose' && e.sessionId === step.sessionId).map((e) => e.clue))];
  const clues = shuffle(exposed.map(clueById).filter(Boolean));
  const civ = world().civs.find((c) => c.id === step.civ);
  const go = await intro(root, {
    title: `Day-${due.due.day} check-in: ${civ.name}`,
    body: [h('p', {}, `${clues.length} questions on what you studied with ${METHOD_INFO[step.method].label.toLowerCase()}. Answer from memory; you'll see each answer afterwards.`),
      due.due.skipped.length ? h('p', { class: 'muted small' }, `The day-${due.due.skipped.join(' and day-')} check-in was missed; that's fine, this one still counts.`) : null],
  });
  if (!go) return;
  const fr = frame(root, { title: `Check-in · ${civ.name}`, note: `Day ${due.due.day}` });
  const r = await testClues(fr, { clues, title: `Day ${due.due.day}`, phase: 'checkin', sessionId: uid(), method: step.method, feedback: 'each', extraFields: { calib: step.sessionId, checkinDay: due.due.day } });
  if (r.n) {
    step.doneDays = [...new Set([...step.doneDays, ...due.due.skipped, due.due.day])];
    store.log({ type: 'checkin', calib: step.sessionId, day: due.due.day, skipped: due.due.skipped, n: r.n, k: r.k });
    store.saveNow();
  }
  fr.end();
  mount(fr.stage, h('div', { class: 'card' },
    h('h2', {}, `Check-in done: ${r.k} of ${r.n}`),
    h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '#/calibrate' }, 'Back to calibration'), h('a', { class: 'btn', href: '#/results' }, 'See results'))));
  if (r.n) toast('Check-in saved');
}

export function intro(root, { title, body }) {
  return new Promise((resolve) => {
    const start = h('button', { class: 'btn primary', type: 'button', onclick: () => resolve(true) }, 'Start');
    mount(root, h('section', { class: 'card intro' }, h('h1', {}, title), body, h('div', { class: 'row' }, start, h('a', { class: 'btn ghost', href: '#/calibrate', onclick: () => resolve(false) }, 'Not now'))));
    setTimeout(() => start.focus(), 30);
  });
}
