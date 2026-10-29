// Router and page shell.
import { h, mount, $ } from './ui.js';
import * as store from './store.js';
import { loadWorld } from './content.js';
import { renderWelcome, renderHome } from './views/home.js';
import { renderCalibrate, runStep, runCheckin } from './views/calibrate.js';
import { renderResults } from './views/results.js';
import { renderStudy } from './views/study.js';
import { renderPlan } from './views/plan.js';
import { renderSettings } from './views/settings.js';
import { renderTeacher } from './views/teacher.js';
import { activeRun } from './views/run.js';

const NAV = [['#/', 'Home'], ['#/study', 'Study'], ['#/plan', 'Plan'], ['#/calibrate', 'Calibration'], ['#/results', 'Results'], ['#/settings', 'Settings']];
const root = () => $('#app');

function nav() {
  const here = location.hash.split('/').slice(0, 2).join('/') || '#/';
  // clicking the page you're on (e.g. Study after a session) reloads it
  mount($('#nav'), NAV.map(([href, label]) => h('a', { href, class: (href === here || (href === '#/' && here === '#')) ? 'active' : '', onclick: () => { if (location.hash === href) setTimeout(route, 0); } }, label)));
  const d = store.current();
  const u = d?.profile.username;
  mount($('#who'), d ? h('span', {}, d.profile.name, u && u.toLowerCase() !== d.profile.name.toLowerCase() ? h('span', { class: 'muted' }, ` · ${u}`) : null) : null);
}

let lastHash = location.hash, ignoreNext = false;
async function route() {
  // A study run owns the page until it ends; navigating away mid-run asks first.
  if (ignoreNext) { ignoreNext = false; return; }
  const run = activeRun();
  if (run) {
    if (!confirm('Leave this session? What you’ve done so far is saved, but the session ends here.')) { ignoreNext = true; location.hash = lastHash; return; }
    run.abort();
  }
  lastHash = location.hash;
  const d = store.current();
  const [, page, a, b] = (location.hash || '#/').split('/');
  nav();
  window.scrollTo(0, 0);
  if (!d && page !== 'teacher') return renderWelcome(root());
  try {
    switch (page || '') {
      case '': return await renderHome(root());
      case 'study': return await renderStudy(root());
      case 'plan': return await renderPlan(root());
      case 'calibrate':
        if (a === 'step') return await runStep(root(), Number(b));
        return renderCalibrate(root());
      case 'checkin': return await runCheckin(root(), Number(a));
      case 'results': return renderResults(root());
      case 'settings': return renderSettings(root());
      case 'profiles': return renderWelcome(root());
      case 'teacher': return renderTeacher(root());
      default: location.hash = '#/';
    }
  } catch (err) {
    console.error(err);
    mount(root(), h('div', { class: 'callout error' }, 'Something went wrong: ', String(err.message || err)));
  }
}

async function start() {
  try { await loadWorld('.'); } catch (err) { mount(root(), h('div', { class: 'callout error' }, err.message)); return; }
  store.openLast();
  window.addEventListener('hashchange', route);
  window.addEventListener('beforeunload', (e) => { store.saveNow(); if (activeRun()) { e.preventDefault(); e.returnValue = ''; } });
  route();
}
start();
