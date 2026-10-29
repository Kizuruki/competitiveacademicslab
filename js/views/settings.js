// Settings. Students see their week, their account and their data; the coach also sees the
// research settings and where the servers are.
import { h, mount, toast, dateLabel } from '../ui.js';
import * as store from '../store.js';
import * as sync from '../sync.js';
import * as sitesync from '../sitesync.js';
import { PACE_LEVELS } from '../engine/pace.js';
import { MAIN_URL, LAB_URL } from '../config.js';

const field = (label, input, help) => h('label', { class: 'field' }, h('span', {}, label), input, help ? h('small', { class: 'muted' }, help) : null);

export function renderSettings(root) {
  const d = store.current();
  const st = d.settings;
  const admin = store.isAdmin();
  const num = (key, attrs = {}) => h('input', { type: 'number', value: st[key], ...attrs, onchange: (e) => { st[key] = Number(e.target.value) || 0; store.touch(); toast('Saved'); } });

  mount(root, h('section', {},
    h('h1', {}, 'Settings'),
    h('div', { class: 'card form' },
      h('h2', {}, 'Your week'),
      field('Minutes a week', num('weeklyMinutes', { min: 10, max: 2000, step: 10 }), 'The plan spreads these over your study days; reviews come first.'),
      field('Study days a week', num('studyDays', { min: 1, max: 7 })),
      field('Session length (minutes)', num('sessionMinutes', { min: 0, max: 240, step: 5 }), '0 = minutes a week ÷ study days.'),
      field('Tournament date', h('input', { type: 'date', value: st.tournamentDate || '', onchange: (e) => { st.tournamentDate = e.target.value; store.save(); toast('Saved'); } }), 'Optional. The plan shows how many weeks are left.'),
      field('Tossup reading speed (ms per letter)', num('msPerChar', { min: 20, max: 150 }), 'Lower is faster. 54 is close to the bowl sites.')),
    h('div', { class: 'card form' },
      h('h2', {}, 'Pace'),
      h('p', {}, `Now ${PACE_LEVELS[d.pace.level]} new clues per hour of new-clue time. It moves by itself (see the plan page).`),
      d.pace.history.length ? h('ul', { class: 'plain-list small' }, d.pace.history.slice(-8).map((x) => h('li', {}, `${dateLabel(x.t)}: ${PACE_LEVELS[x.from]} → ${PACE_LEVELS[x.to]} (${x.reason})`))) : h('p', { class: 'muted small' }, 'No changes yet.')),
    h('div', { class: 'card form' },
      h('h2', {}, 'Account'),
      h('p', {}, 'Logged in as ', h('strong', {}, d.profile.username), ' — your History Bowl / Geography Bowl account. Your progress is saved online, so you can study from any device.'),
      h('button', { class: 'btn ghost small', type: 'button', onclick: async () => { await sitesync.flush().catch(() => {}); await store.logout(); location.hash = '#/'; location.reload(); } }, 'Log out')),
    renderSiteBox(),
    h('div', { class: 'card form' },
      h('h2', {}, 'Your data'),
      h('p', { class: 'muted small' }, `${d.events.length} things you've done in the lab, saved online.`),
      h('button', { class: 'btn', type: 'button', onclick: () => {
        const blob = new Blob([store.exportJSON()], { type: 'application/json' });
        const a = h('a', { href: URL.createObjectURL(blob), download: `study-lab-${d.profile.username}-${new Date().toISOString().slice(0, 10)}.json` });
        document.body.append(a); a.click(); a.remove();
      } }, 'Download my data')),
    admin ? h('div', { class: 'card form' },
      h('h2', {}, 'Research settings (coach)'),
      field('Remember-by horizon (days)', num('horizonDays', { min: 7, max: 365 }), 'Yield counts clues still remembered this many days after studying. This is your own setting; each student has theirs (30 by default).'),
      field('Lightning round length (seconds)', num('lightningSeconds', { min: 15, max: 300, step: 5 })),
      h('p', { class: 'muted small' }, 'Bowl sites worker: ', h('code', {}, MAIN_URL), h('br'), 'Lab server: ', h('code', {}, LAB_URL), h('br'), 'To change them, edit js/config.js.'),
      h('a', { class: 'btn', href: '#/coach' }, 'Open the coach view')) : null));
}

// Box on the study and settings pages: what's been brought in from the bowl sites.
export function renderSiteBox() {
  const d = store.current();
  const out = h('span', { class: 'small' });
  return h('div', { class: 'card' },
    h('h3', {}, 'History and Geography sites'),
    h('p', { class: 'muted small' }, 'The lab works like each site’s practice mode: a question you get right is mastered there and goes into its spaced review; one you miss goes to Missed Questions until you get it right on a later day. Questions you’ve already done on the sites are brought in when you log in, so they come back here as reviews, not as new clues. ',
      d.sync.lastSiteImport ? `Last brought in ${dateLabel(d.sync.lastSiteImport)}.` : ''),
    h('div', { class: 'row' }, h('button', { class: 'btn small', type: 'button', onclick: async (e) => {
      e.target.disabled = true; out.textContent = 'Working…';
      try { const r = await sync.importSiteHistory(); out.textContent = `${r.added} learned and ${r.missed} missed questions brought in.`; } catch (x) { out.textContent = x.message; }
      e.target.disabled = false;
    } }, 'Bring in my site history now'), out));
}
