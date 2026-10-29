// Settings, account, data.
import { h, mount, toast, dateLabel } from '../ui.js';
import * as store from '../store.js';
import * as sync from '../sync.js';
import { PACE_LEVELS } from '../engine/pace.js';

const field = (label, input, help) => h('label', { class: 'field' }, h('span', {}, label), input, help ? h('small', { class: 'muted' }, help) : null);

export function renderSettings(root) {
  const d = store.current();
  const st = d.settings;
  const num = (key, attrs = {}) => h('input', { type: 'number', value: st[key], ...attrs, onchange: (e) => { st[key] = Number(e.target.value) || 0; store.touch(); store.saveNow(); toast('Saved'); } });
  const text = (key, attrs = {}) => h('input', { type: 'text', value: st[key] || '', ...attrs, onchange: (e) => { st[key] = e.target.value.trim(); store.touch(); store.saveNow(); toast('Saved'); } });

  mount(root, h('section', {},
    h('h1', {}, 'Settings'),
    h('div', { class: 'card form' },
      h('h2', {}, 'Your week'),
      field('Name', h('input', { type: 'text', value: d.profile.name, onchange: (e) => { d.profile.name = e.target.value.trim() || d.profile.name; store.saveNow(); toast('Saved'); } })),
      field('Minutes a week', num('weeklyMinutes', { min: 10, max: 2000, step: 10 }), 'The plan spreads these over your study days; reviews come first.'),
      field('Study days a week', num('studyDays', { min: 1, max: 7 })),
      field('Session length (minutes)', num('sessionMinutes', { min: 0, max: 240, step: 5 }), '0 = minutes a week ÷ study days.'),
      field('Tournament date', h('input', { type: 'date', value: st.tournamentDate || '', onchange: (e) => { st.tournamentDate = e.target.value; store.saveNow(); toast('Saved'); } }), 'Optional. The plan shows how many weeks are left.'),
      field('Remember-by horizon (days)', num('horizonDays', { min: 7, max: 365 }), 'Yield counts clues still remembered this many days after studying.'),
      field('Tossup reading speed (ms per letter)', num('msPerChar', { min: 20, max: 150 }), 'Lower is faster. 54 is close to the bowl sites.')),
    h('div', { class: 'card form' },
      h('h2', {}, 'Assignment'),
      h('p', { class: 'muted small' }, 'For a weekly target set by a coach: clues to still know at the horizon. Faster learners need fewer minutes for the same target; if it would take more than the cap, the target is lowered instead.'),
      field('Weekly target (clues remembered)', num('target', { min: 0, max: 5000, step: 10 }), '0 = no target; the plan uses your minutes.'),
      field('Most minutes a week', num('capMinutes', { min: 0, max: 3000, step: 10 }), '0 = 1.5 × your minutes a week.')),
    h('div', { class: 'card form' },
      h('h2', {}, 'Pace'),
      h('p', {}, `Now ${PACE_LEVELS[d.pace.level]} new clues per hour of new-clue time. It moves by itself (see the plan page); history:`),
      d.pace.history.length ? h('ul', { class: 'plain-list small' }, d.pace.history.slice(-8).map((x) => h('li', {}, `${dateLabel(x.t)}: ${PACE_LEVELS[x.from]} → ${PACE_LEVELS[x.to]} (${x.reason})`))) : h('p', { class: 'muted small' }, 'No changes yet.')),
    accountCard(root),
    h('div', { class: 'card form' },
      h('h2', {}, 'Servers'),
      field('Bowl sites worker', text('mainUrl'), 'Used for logging in, Geography site history and team assignments.'),
      field('Lab server', text('labUrl', { placeholder: 'https://…workers.dev' }), 'worker/lab-worker.js — for the school survey. Leave empty to keep everything on this device.'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.shareSiteAnswers !== false, onchange: (e) => { st.shareSiteAnswers = e.target.checked; store.saveNow(); } }), 'Count my Geography answers here on the Geography site too (assignments, spaced review, mastery)')),
    labCard(),
    dataCard(root)));
}

function accountCard(root) {
  const d = store.current();
  if (d.profile.username) {
    return h('div', { class: 'card form' }, h('h2', {}, 'Account'),
      h('p', {}, 'Logged in as ', h('strong', {}, d.profile.username), ' (your History Bowl / Geography Bowl account).'),
      h('button', { class: 'btn ghost small', type: 'button', onclick: () => { sync.logout(); renderSettings(root); } }, 'Log out'));
  }
  const u = h('input', { type: 'text', autocomplete: 'username' }), p = h('input', { type: 'password', autocomplete: 'current-password' });
  const err = h('div', { class: 'no small' });
  const form = h('form', { class: 'card form', onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    try { await sync.login(u.value.trim(), p.value); toast('Logged in'); renderSettings(root); } catch (x) { err.textContent = x.message; }
  } }, h('h2', {}, 'Account'), h('p', { class: 'muted small' }, 'Log in with your History Bowl / Geography Bowl account to link this profile to it.'),
  field('Username', u), field('Password', p), err, h('button', { class: 'btn primary', type: 'submit' }, 'Log in'));
  return form;
}

function labCard() {
  const d = store.current();
  const out = h('div', { class: 'small' });
  const run = (fn) => async () => { out.textContent = 'Working…'; try { out.textContent = await fn(); } catch (e) { out.textContent = e.message; } };
  return h('div', { class: 'card form' },
    h('h2', {}, 'School survey'),
    h('p', { class: 'muted small' }, 'Upload sends your calibration results and study log to the lab server so your coach can build a blueprint from everyone. Getting the blueprint makes your starting estimates the group’s instead of neutral guesses; your own results still take over as they come in.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn', type: 'button', onclick: run(async () => { const r = await sync.uploadLab(); return `Uploaded ${r.steps} calibration results and ${r.events} events.`; }) }, 'Upload my results'),
      h('button', { class: 'btn', type: 'button', onclick: run(async () => { const r = await sync.fetchBlueprint(); return r.used ? `Blueprint from ${r.participants} students is now your starting point.` : `Only ${r.participants} students so far; at least 5 per method are needed. Keeping neutral guesses.`; }) }, 'Get the school blueprint')),
    d.sync.lastUpload ? h('p', { class: 'muted small' }, `Last upload ${dateLabel(d.sync.lastUpload)}.`) : null,
    out);
}

function dataCard(root) {
  const d = store.current();
  const file = h('input', { type: 'file', accept: 'application/json', hidden: true, onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { store.importJSON(await f.text()); toast('Imported'); location.hash = '#/'; location.reload(); } catch (x) { toast(x.message, 'error'); }
  } });
  return h('div', { class: 'card form' },
    h('h2', {}, 'Your data'),
    h('p', { class: 'muted small' }, `${d.events.length} events in this browser. Everything is recomputed from them, so an export is a complete backup.`),
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn', type: 'button', onclick: () => {
        const blob = new Blob([store.exportJSON()], { type: 'application/json' });
        const a = h('a', { href: URL.createObjectURL(blob), download: `study-lab-${d.profile.name.replace(/\W+/g, '-')}-${new Date().toISOString().slice(0, 10)}.json` });
        document.body.append(a); a.click(); a.remove();
      } }, 'Export'),
      h('button', { class: 'btn', type: 'button', onclick: () => file.click() }, 'Import'), file,
      h('a', { class: 'btn', href: '#/profiles' }, 'Switch profile'),
      h('button', { class: 'btn danger', type: 'button', onclick: () => {
        if (prompt(`Type DELETE to remove ${d.profile.name}'s profile from this browser.`) !== 'DELETE') return;
        store.remove(d.id); location.hash = '#/'; location.reload();
      } }, 'Delete profile')));
}

// Box shown on the study page: link to the Geography site.
export function renderSiteBox() {
  const d = store.current();
  if (!d.profile.username) return h('div', { class: 'card muted small' }, 'Log in (Settings) with your bowl-site account to bring in what you’ve already answered on the Geography site and have answers here count there too.');
  const out = h('span', { class: 'small' });
  return h('div', { class: 'card' },
    h('h3', {}, 'Geography site'),
    h('p', { class: 'muted small' }, 'Questions you’ve answered right on the Geography site count as learned here and come back as reviews. ',
      d.sync.lastSiteImport ? `Last brought in ${dateLabel(d.sync.lastSiteImport)}.` : 'Not brought in yet.'),
    h('div', { class: 'row' }, h('button', { class: 'btn small', type: 'button', onclick: async (e) => {
      e.target.disabled = true; out.textContent = 'Working…';
      try { const r = await sync.importSiteHistory(); out.textContent = `${r.added} new of ${r.total} questions.`; } catch (x) { out.textContent = x.message; }
      e.target.disabled = false;
    } }, 'Bring in my Geography site history'), out));
}
