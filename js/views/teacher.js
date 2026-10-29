// Coach view: everyone's calibration results from the lab server, and the blueprint they make.
import { h, mount, num, pct, dateLabel } from '../ui.js';
import * as store from '../store.js';
import * as sync from '../sync.js';
import { METHODS, METHOD_INFO } from '../engine/calibration.js';
import { blueprintFromRows, calibrationEngagement } from '../engine/personalize.js';

export function renderTeacher(root) {
  const key = h('input', { type: 'password', placeholder: 'ADMIN_KEY', autocomplete: 'off' });
  const out = h('div', {});
  const load = async (e) => {
    e?.preventDefault();
    mount(out, h('p', { class: 'muted' }, 'Loading…'));
    try { show(out, await sync.teacherExport(key.value)); } catch (x) { mount(out, h('p', { class: 'no' }, x.message)); }
  };
  mount(root, h('section', {},
    h('h1', {}, 'Coach view'),
    h('p', { class: 'muted' }, `Calibration results uploaded to ${store.current().settings.labUrl || '(no lab server set — see Settings)'}.`),
    h('form', { class: 'row', onsubmit: load }, key, h('button', { class: 'btn primary', type: 'submit' }, 'Load')),
    out));
}

function show(out, data) {
  const rows = data.steps || [];
  const people = data.participants || [];
  const bp = blueprintFromRows(rows);
  const byP = new Map(people.map((p) => [p.participant, { ...p, steps: {} }]));
  for (const r of rows) { const p = byP.get(r.participant) || { participant: r.participant, steps: {} }; p.steps[r.method] = r; byP.set(r.participant, p); }
  const csv = () => {
    const head = ['participant', 'name', 'username', 'method', 'civ', 'active_min', 'introduced', 'immediate', 'learned_per_hour', 'kept_at_h', 'durable_per_hour', 'enjoy', 'extra_min', 'last_checkin'];
    const lines = [head.join(',')];
    for (const r of rows) {
      const p = byP.get(r.participant) || {};
      lines.push([r.participant, p.name, p.username, r.method, r.civ, num(r.activeHours * 60, 1), r.introduced, r.immediate?.p, r.learnedPerHour, r.keptAtH, r.durablePerHour, r.engagement?.enjoy, r.engagement?.extraMin, r.lastCheckin].map((v) => (v === null || v === undefined ? '' : `"${String(v).replace(/"/g, '""')}"`)).join(','));
    }
    const a = h('a', { href: URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' })), download: `study-lab-survey-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.append(a); a.click(); a.remove();
  };
  mount(out,
    h('h2', {}, 'Blueprint'),
    h('p', { class: 'muted small' }, 'Median learned per hour, mean share kept, mean engagement, per method. A method needs results from at least 5 students before it replaces the neutral starting guess. Students get it with “Get the school blueprint”.'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'grid' },
      h('thead', {}, h('tr', {}, ['Method', 'Students', 'Learned / hr', 'Kept', 'Engagement', 'Source'].map((x) => h('th', {}, x)))),
      h('tbody', {}, METHODS.map((m) => h('tr', {}, h('td', {}, METHOD_INFO[m].label), h('td', { class: 'num' }, String(bp[m].participants ?? 0)), h('td', { class: 'num' }, num(bp[m].learn)), h('td', { class: 'num' }, pct(bp[m].kept)), h('td', { class: 'num' }, `×${num(bp[m].engage, 2)}`), h('td', {}, bp[m].source)))))),
    h('h2', {}, `Students (${byP.size})`),
    h('div', { class: 'table-wrap' }, h('table', { class: 'grid' },
      h('thead', {}, h('tr', {}, ['Student', 'Last upload', 'Pace', ...METHODS.map((m) => `${METHOD_INFO[m].label}: durable/hr · kept · enjoy`)].map((x) => h('th', {}, x)))),
      h('tbody', {}, [...byP.values()].map((p) => h('tr', {},
        h('td', {}, p.name || '—', p.username ? h('span', { class: 'muted small' }, ` (${p.username})`) : null),
        h('td', {}, p.updated ? dateLabel(p.updated) : '—'),
        h('td', { class: 'num' }, p.pace !== undefined && p.pace !== null ? String([50, 75, 100, 150, 200][p.pace]) : '—'),
        METHODS.map((m) => { const r = p.steps[m]; return h('td', { class: 'num' }, r ? `${num(r.durablePerHour)} · ${r.keptAtH === null ? '—' : pct(r.keptAtH)} · ${r.engagement?.enjoy ?? '—'} (×${num(calibrationEngagement(r.engagement), 2)})` : '—'); })))))),
    h('button', { class: 'btn', type: 'button', onclick: csv }, 'Download CSV'));
}
