// Home: profile gate, then today's picture.
import { h, mount, pct, dateLabel } from '../ui.js';
import * as store from '../store.js';
import * as model from '../model.js';
import { METHOD_INFO, PROTOCOLS } from '../engine/calibration.js';
import { selectedPacks } from './study.js';

export function renderWelcome(root) {
  const list = store.profiles();
  const name = h('input', { type: 'text', placeholder: 'Your name', autocomplete: 'name' });
  const file = h('input', { type: 'file', accept: 'application/json', hidden: true, onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { store.importJSON(await f.text()); location.hash = '#/'; location.reload(); } catch (x) { alert(x.message); }
  } });
  mount(root, h('section', { class: 'welcome' },
    h('h1', {}, 'Study Lab'),
    h('p', { class: 'lede' }, 'Find the way of studying that works best for you, then study History Bowl and Geography Bowl questions with it: the right number of new clues, reviews right before you’d forget, and a plan that fits your week.'),
    h('form', { class: 'card form', onsubmit: (e) => { e.preventDefault(); store.create(name.value); location.hash = '#/'; location.reload(); } },
      h('h2', {}, 'New profile'), h('label', { class: 'field' }, h('span', {}, 'Name'), name),
      h('p', { class: 'muted small' }, 'Profiles live in this browser. Log in with your bowl-site account later (Settings) to link them.'),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'submit' }, 'Create'), h('button', { class: 'btn ghost', type: 'button', onclick: () => file.click() }, 'Import a backup'), file)),
    list.length ? h('div', { class: 'card' }, h('h2', {}, 'Profiles on this device'),
      h('ul', { class: 'plain-list' }, list.map((p) => h('li', {}, h('button', { class: 'btn small', type: 'button', onclick: () => { store.open(p.id); location.hash = '#/'; location.reload(); } }, p.name))))) : null));
  setTimeout(() => name.focus(), 30);
}

export async function renderHome(root) {
  const d = store.current();
  const today = h('div', { class: 'card' }, h('h2', {}, 'Today'), h('p', { class: 'muted' }, 'Loading question packs…'));
  const checkins = model.checkinsDue();
  const next = model.nextStep();
  const steps = model.stepResults();
  const chance = model.chances();
  const top = Object.entries(chance).sort((a, b) => b[1] - a[1])[0];
  const anyEvidence = steps.length || d.blueprint || d.events.some((e) => e.type === 'session' && e.kind === 'study');

  const calibCard = !d.calibration
    ? h('div', { class: 'card' }, h('h2', {}, 'Calibration'), h('p', {}, 'Learn invented facts four different ways to find out which method works best for you.'), h('a', { class: 'btn primary', href: '#/calibrate' }, 'Start'))
    : h('div', { class: 'card' }, h('h2', {}, 'Calibration'),
      checkins.length ? h('p', {}, `${checkins.length} check-in${checkins.length > 1 ? 's' : ''} ready.`) : null,
      next ? h('p', {}, `Next: ${METHOD_INFO[next.method].label}.`) : h('p', {}, `All ${d.calibration.steps.length} methods done${checkins.length ? '' : '; check-ins continue'}.`),
      h('p', { class: 'muted small' }, PROTOCOLS[d.calibration.protocol].label, ` · ${steps.length} of ${d.calibration.steps.length} methods finished`),
      checkins.length ? h('a', { class: 'btn primary', href: `#/checkin/${checkins[0].index}` }, 'Do a check-in') : next ? h('a', { class: 'btn primary', href: `#/calibrate/step/${d.calibration.steps.indexOf(next)}` }, 'Continue') : h('a', { class: 'btn', href: '#/calibrate' }, 'Open'));

  mount(root, h('section', {},
    h('h1', {}, `Hi, ${d.profile.name}`),
    h('div', { class: 'cards' },
      today,
      calibCard,
      h('div', { class: 'card' }, h('h2', {}, 'Your best method so far'),
        anyEvidence ? h('p', {}, h('strong', {}, METHOD_INFO[top[0]].label), ` — ${pct(top[1])} chance it’s your best.`) : h('p', {}, 'No results yet: all four methods start even.'),
        h('p', { class: 'muted small' }, steps.length ? `From ${steps.length} calibration result${steps.length > 1 ? 's' : ''}${d.blueprint ? ' and the school blueprint' : ''}, plus your study sessions.` : d.blueprint ? 'From the school blueprint until your own results come in.' : 'A guess until calibration results come in.'),
        h('a', { class: 'btn ghost', href: '#/results' }, 'Results'))),
    d.events.length ? h('p', { class: 'muted small' }, `${d.events.length} events logged · last activity ${dateLabel(d.events[d.events.length - 1].t)}`) : null));
  // the packs can take a moment the first time; the rest of the page doesn't wait for them
  const packs = await selectedPacks().catch(() => []);
  if (!today.isConnected) return;
  const due = model.due(packs);
  mount(today, h('h2', {}, 'Today'), packs.length ? [
    h('p', {}, `${due.length} review${due.length === 1 ? '' : 's'} due. Pace: ${model.pace()} new clues per hour.`),
    h('a', { class: 'btn primary', href: '#/study' }, 'Study now'), ' ', h('a', { class: 'btn ghost', href: '#/plan' }, 'This week')]
    : h('p', { class: 'muted' }, 'No question packs installed yet.'));
}
