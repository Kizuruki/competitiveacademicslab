// Home: log in (with the bowl-site account), then today's picture.
import { h, mount, pct, dateLabel } from '../ui.js';
import * as store from '../store.js';
import * as model from '../model.js';
import { METHOD_INFO, PROTOCOLS } from '../engine/calibration.js';
import { selectedPacks } from './study.js';

export function renderLogin(root, message = '') {
  const u = h('input', { type: 'text', autocomplete: 'username', autocapitalize: 'off', spellcheck: 'false' });
  const p = h('input', { type: 'password', autocomplete: 'current-password' });
  const err = h('div', { class: 'no small', 'aria-live': 'polite' }, message);
  let register = false;
  const title = h('h2', {}, 'Log in');
  const submit = h('button', { class: 'btn primary', type: 'submit' }, 'Log in');
  const toggle = h('button', { class: 'btn ghost', type: 'button', onclick: () => {
    register = !register;
    title.textContent = register ? 'Create an account' : 'Log in';
    submit.textContent = register ? 'Create account' : 'Log in';
    toggle.textContent = register ? 'I have an account' : 'New here? Create an account';
    p.autocomplete = register ? 'new-password' : 'current-password';
  } }, 'New here? Create an account');
  mount(root, h('section', { class: 'welcome' },
    h('h1', {}, 'Study Lab'),
    h('p', { class: 'lede' }, 'Find the way of studying that works best for you, then study History Bowl and Geography Bowl questions with it: the right number of new clues, reviews right before you’d forget, and a plan that fits your week.'),
    h('form', { class: 'card form', onsubmit: async (e) => {
      e.preventDefault(); err.textContent = ''; submit.disabled = true;
      try { await store.login(u.value.trim(), p.value, { register }); location.hash = '#/'; location.reload(); }
      catch (x) { err.textContent = x.message; submit.disabled = false; }
    } }, title,
    h('p', { class: 'muted small' }, 'Use your History Bowl / Geography Bowl account. Your progress is saved online and shows up on those sites too.'),
    h('label', { class: 'field' }, h('span', {}, 'Username'), u),
    h('label', { class: 'field' }, h('span', {}, 'Password'), p),
    err, h('div', { class: 'row' }, submit, toggle))));
  u.focus();   // right away: a delayed focus could pull typing out of the password box
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
  const open = model.unfinished();

  const calibCard = !d.calibration
    ? h('div', { class: 'card' }, h('h2', {}, 'Calibration'), h('p', {}, 'Learn invented facts with different methods to find out which works best for you.'), h('a', { class: 'btn primary', href: '#/calibrate' }, 'Start'))
    : h('div', { class: 'card' }, h('h2', {}, 'Calibration'),
      checkins.length ? h('p', {}, `${checkins.length} check-in${checkins.length > 1 ? 's' : ''} ready.`) : null,
      next ? h('p', {}, `${next.sessionId ? 'In progress' : 'Next'}: ${METHOD_INFO[next.method].label}.`) : h('p', {}, `All ${d.calibration.steps.length} methods done${checkins.length ? '' : '; check-ins continue'}.`),
      h('p', { class: 'muted small' }, PROTOCOLS[d.calibration.protocol].label, ` · ${steps.length} of ${d.calibration.steps.length} methods finished`),
      checkins.length ? h('a', { class: 'btn primary', href: `#/checkin/${checkins[0].index}` }, 'Do a check-in') : next ? h('a', { class: 'btn primary', href: `#/calibrate/step/${d.calibration.steps.indexOf(next)}` }, next.sessionId ? 'Continue' : 'Start next') : h('a', { class: 'btn', href: '#/calibrate' }, 'Open'));

  const studyOpen = open.find((x) => x.kind === 'study');
  mount(root, h('section', {},
    h('h1', {}, `Hi, ${d.profile.name}`),
    studyOpen ? h('div', { class: 'callout' }, `You left a study session unfinished ${dateLabel(studyOpen.start.t)} — ${studyOpen.answers.length} answers saved so far. `, h('a', { href: '#/study' }, 'Continue or end it')) : null,
    h('div', { class: 'cards' },
      today,
      calibCard,
      h('div', { class: 'card' }, h('h2', {}, 'Your best method so far'),
        anyEvidence ? h('p', {}, h('strong', {}, METHOD_INFO[top[0]].label), ` — ${pct(top[1])} chance it’s your best.`) : h('p', {}, 'No results yet: every method starts even.'),
        h('p', { class: 'muted small' }, steps.length ? `From ${steps.length} calibration result${steps.length > 1 ? 's' : ''}${d.blueprint ? ' and the school blueprint' : ''}, plus your study sessions.` : d.blueprint ? 'From the school blueprint until your own results come in.' : 'A guess until results come in.'),
        h('a', { class: 'btn ghost', href: '#/results' }, 'Results')))));
  // the packs can take a moment the first time; the rest of the page doesn't wait for them
  const packs = await selectedPacks().catch(() => []);
  if (!today.isConnected) return;
  const due = model.due(packs);
  const missed = due.filter((x) => x.reason === 'missed').length;
  mount(today, h('h2', {}, 'Today'), packs.length ? [
    h('p', {}, `${due.length} review${due.length === 1 ? '' : 's'} due${missed ? ` (${missed} missed)` : ''}. Pace: ${model.pace()} new clues per hour.`),
    d.coach?.target ? h('p', { class: 'muted small' }, `Your coach’s weekly target: ${d.coach.target} clues remembered.`) : null,
    h('a', { class: 'btn primary', href: '#/study' }, 'Study now'), ' ', h('a', { class: 'btn ghost', href: '#/plan' }, 'This week')]
    : h('p', { class: 'muted' }, 'No question packs installed yet.'));
}
