// Router and page shell.
import { h, mount, $ } from './ui.js';
import * as store from './store.js';
import * as sync from './sync.js';
import * as sitesync from './sitesync.js';
import { loadWorld } from './content.js';
import { renderLogin, renderHome } from './views/home.js';
import { renderCalibrate, runStep, runCheckin } from './views/calibrate.js';
import { renderResults } from './views/results.js';
import { renderStudy, selectedPacks } from './views/study.js';
import { renderPlan } from './views/plan.js';
import { renderSettings } from './views/settings.js';
import { renderTeacher } from './views/teacher.js';
import { activeRun } from './views/run.js';

const NAV = [['#/', 'Home'], ['#/study', 'Study'], ['#/plan', 'Plan'], ['#/calibrate', 'Calibration'], ['#/results', 'Results'], ['#/settings', 'Settings']];
const root = () => $('#app');

function nav() {
  const here = location.hash.split('/').slice(0, 2).join('/') || '#/';
  const d = store.current();
  const items = d ? [...NAV, ...(store.isAdmin() ? [['#/coach', 'Coach']] : [])] : [];
  // clicking the page you're on (e.g. Study after a session) reloads it
  mount($('#nav'), items.map(([href, label]) => h('a', { href, class: (href === here || (href === '#/' && here === '#')) ? 'active' : '', onclick: () => { if (location.hash === href) setTimeout(route, 0); } }, label)));
  mount($('#who'), d ? h('span', {}, d.profile.name) : null);
}

let lastHash = location.hash, ignoreNext = false;
async function route() {
  // A study run owns the page until it ends; leaving it asks first, then pauses it.
  if (ignoreNext) { ignoreNext = false; return; }
  const run = activeRun();
  if (run) {
    if (!confirm('Leave this session? Everything you’ve done so far is saved, and you can continue it later.')) { ignoreNext = true; location.hash = lastHash; return; }
    run.abort();
  }
  lastHash = location.hash;
  const d = store.current();
  const [, page, a, b] = (location.hash || '#/').split('/');
  nav();
  window.scrollTo(0, 0);
  if (!d) return renderLogin(root());
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
      case 'coach': return await renderTeacher(root());
      default: location.hash = '#/';
    }
  } catch (err) {
    console.error(err);
    if (err.login) { await store.logout(); return renderLogin(root(), err.message); }
    mount(root(), h('div', { class: 'callout error' }, 'Something went wrong: ', String(err.message || err)));
  }
}

// After logging in: the school blueprint (daily), what's new on the bowl sites (every few hours),
// and anything not yet sent to them.
async function background() {
  const d = store.current();
  try { await sync.refreshBlueprint(); } catch (_) { /* lab server busy: try next time */ }
  try {
    if (!d.sync.lastSiteImport || Date.now() - d.sync.lastSiteImport > 6 * 3600000) { await selectedPacks(); await sync.importSiteHistory({ quiet: true }); }
  } catch (_) { /* bowl sites offline */ }
  sitesync.flush().catch(() => {});
}

async function start() {
  try { await loadWorld('.'); } catch (err) { mount(root(), h('div', { class: 'callout error' }, err.message)); return; }
  window.addEventListener('hashchange', route);
  // closing the tab mid-session records what was done (store.js sends it on the way out)
  window.addEventListener('pagehide', () => { activeRun()?.pause(); store.flush({ keepalive: true }).catch(() => {}); });
  window.addEventListener('beforeunload', (e) => { if (activeRun()) { e.preventDefault(); e.returnValue = ''; } });
  if (store.session()) {
    mount(root(), h('p', { class: 'muted' }, 'Loading your progress…'));
    try { await store.load(); }
    catch (err) {
      if (err.login) await store.logout();
      else { mount(root(), h('div', { class: 'callout error' }, 'Couldn’t reach the lab server: ', err.message, ' ', h('button', { class: 'btn small', type: 'button', onclick: () => location.reload() }, 'Try again'))); return; }
    }
  }
  route();
  if (store.current()) background();
}
start();
