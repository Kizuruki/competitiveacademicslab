// Coach view (kizuruki only; the lab server checks too): every student's progress and results,
// weekly targets, and the blueprint the class's calibration results make.
import { h, mount, num, pct, dateLabel, toast } from '../ui.js';
import * as store from '../store.js';
import { admin } from '../sync.js';
import { METHODS, METHOD_INFO } from '../engine/calibration.js';
import { blueprintFromRows, calibrationEngagement } from '../engine/personalize.js';

export async function renderTeacher(root) {
  if (!store.isAdmin()) { mount(root, h('section', {}, h('h1', {}, 'Coach view'), h('p', {}, 'Only the coach account can open this page.'))); return; }
  mount(root, h('p', { class: 'muted' }, 'Loading the class…'));
  let data;
  try { data = await admin.students(); } catch (err) { mount(root, h('div', { class: 'callout error' }, err.message)); return; }
  const results = data.results || [];
  const bp = blueprintFromRows(results.map((r) => ({ ...r, participant: r.username })));
  const cfg = data.config || { defaultTarget: 0, capMinutes: 0, students: {} };
  const byUser = new Map(data.students.map((s) => [s.username, { ...s, results: {} }]));
  for (const r of results) { const s = byUser.get(r.username); if (s) s.results[r.method] = r; }

  const defTarget = h('input', { type: 'number', min: 0, step: 10, value: cfg.defaultTarget || 0, class: 'num-input' });
  const defCap = h('input', { type: 'number', min: 0, step: 10, value: cfg.capMinutes || 0, class: 'num-input' });
  const perStudent = new Map();
  const saveCfg = async () => {
    const students = {};
    for (const [u, inp] of perStudent) if (Number(inp.t.value) || Number(inp.c.value)) students[u] = { target: Number(inp.t.value) || 0, capMinutes: Number(inp.c.value) || 0 };
    try { await admin.setConfig({ defaultTarget: Number(defTarget.value) || 0, capMinutes: Number(defCap.value) || 0, students }); toast('Targets saved'); } catch (err) { toast(err.message, 'error'); }
  };

  const csv = () => {
    const head = ['username', 'method', 'civ', 'active_min', 'introduced', 'immediate', 'learned_per_hour', 'kept_at_h', 'durable_per_hour', 'enjoy', 'extra_min', 'last_checkin'];
    const lines = [head.join(',')];
    for (const r of results) lines.push([r.username, r.method, r.civ, num(r.activeHours * 60, 1), r.introduced, r.immediate?.p, r.learnedPerHour, r.keptAtH, r.durablePerHour, r.engagement?.enjoy, r.engagement?.extraMin, r.lastCheckin].map((v) => (v === null || v === undefined ? '' : `"${String(v).replace(/"/g, '""')}"`)).join(','));
    const a = h('a', { href: URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' })), download: `study-lab-results-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.append(a); a.click(); a.remove();
  };

  const rows = [...byUser.values()].map((s) => {
    const mine = cfg.students[s.username] || {};
    const t = h('input', { type: 'number', min: 0, step: 10, value: mine.target || '', placeholder: String(cfg.defaultTarget || '—'), class: 'num-input' });
    const c = h('input', { type: 'number', min: 0, step: 10, value: mine.capMinutes || '', placeholder: String(cfg.capMinutes || '—'), class: 'num-input' });
    perStudent.set(s.username, { t, c });
    const sum = s.summary || {};
    const geo = sum.counts?.geo, hist = sum.counts?.history;
    const calib = s.calibration ? `${s.calibration.steps.filter((x) => x.finishedAt).length}/${s.calibration.steps.length}` : '—';
    return h('tr', {},
      h('td', {}, h('strong', {}, s.display || s.username)),
      h('td', {}, s.lastEvent ? dateLabel(s.lastEvent) : '—'),
      h('td', { class: 'num' }, sum.pace ? `${sum.pace}/hr` : '—'),
      h('td', { class: 'num' }, geo ? `${geo.mastered} · ${geo.missed}` : '—'),
      h('td', { class: 'num' }, hist ? `${hist.mastered} · ${hist.missed}` : '—'),
      h('td', {}, sum.best ? `${METHOD_INFO[sum.best.method]?.label} (${pct(sum.best.chance)})` : '—'),
      h('td', { class: 'num' }, calib),
      h('td', {}, t), h('td', {}, c),
      h('td', {}, s.calibration ? h('div', { class: 'row tight' },
        h('select', { 'aria-label': 'Method to redo', class: 'small' }, s.calibration.steps.map((x, i) => h('option', { value: i }, `${METHOD_INFO[x.method]?.label || x.method}${x.finishedAt ? '' : ' (not done)'}`))),
        h('button', { class: 'btn ghost small', type: 'button', onclick: async (e) => {
          const i = Number(e.target.previousSibling.value), m = METHOD_INFO[s.calibration.steps[i].method]?.label;
          if (!confirm(`Redo ${m} for ${s.display || s.username}? That attempt is set aside; they redo it on an unused civilization if one is left, otherwise it's measured from their real study.`)) return;
          try { const r = await admin.redo(s.username, i); toast(r.civ ? 'Ready for them to redo' : 'Set aside: measured in real study'); } catch (err) { toast(err.message, 'error'); }
        } }, 'Redo one'),
        h('button', { class: 'btn ghost small', type: 'button', onclick: async () => {
          if (!confirm(`Clear ${s.display || s.username}'s whole calibration so they can start it again? Their answers stay.`)) return;
          try { await admin.reset(s.username); toast('Calibration cleared'); } catch (err) { toast(err.message, 'error'); }
        } }, 'Reset all')) : null));
  });

  mount(root, h('section', {},
    h('h1', {}, 'Coach view'),
    h('h2', {}, `Students (${byUser.size})`),
    h('p', { class: 'muted small' }, 'Mastered · missed are clue counts in the lab (each History tossup is several clues). Targets are clues still known 30 days later per week; a student’s plan works out how many minutes that takes them. Leave a student’s boxes empty to use the class default.'),
    h('div', { class: 'row' }, h('label', {}, 'Class target ', defTarget), h('label', {}, 'Most minutes a week ', defCap), h('button', { class: 'btn primary small', type: 'button', onclick: saveCfg }, 'Save targets')),
    h('div', { class: 'table-wrap' }, h('table', { class: 'grid' },
      h('thead', {}, h('tr', {}, ['Student', 'Last active', 'Pace', 'Geography', 'History', 'Best method so far', 'Calibration', 'Target', 'Max min', ''].map((x) => h('th', {}, x)))),
      h('tbody', {}, rows))),
    h('h2', {}, 'Blueprint'),
    h('p', { class: 'muted small' }, 'Median learned per hour, mean share kept, mean engagement per method, from calibration. A method needs results from at least 5 students before it replaces the neutral starting guess. Every student’s lab picks it up once a day.'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'grid' },
      h('thead', {}, h('tr', {}, ['Method', 'Students', 'Learned / hr', 'Kept', 'Engagement', 'Source'].map((x) => h('th', {}, x)))),
      h('tbody', {}, METHODS.map((m) => h('tr', {}, h('td', {}, METHOD_INFO[m].label), h('td', { class: 'num' }, String(bp[m].participants ?? 0)), h('td', { class: 'num' }, num(bp[m].learn)), h('td', { class: 'num' }, pct(bp[m].kept)), h('td', { class: 'num' }, `×${num(bp[m].engage, 2)}`), h('td', {}, bp[m].source)))))),
    h('h2', {}, 'Calibration results'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'grid' },
      h('thead', {}, h('tr', {}, ['Student', 'Method', 'Clues', 'Right away', 'Kept at 30 d', 'Durable / hr', 'Enjoyed'].map((x) => h('th', {}, x)))),
      h('tbody', {}, results.map((r) => h('tr', {}, h('td', {}, byUser.get(r.username)?.display || r.username), h('td', {}, METHOD_INFO[r.method]?.label || r.method), h('td', { class: 'num' }, String(r.introduced ?? '—')), h('td', { class: 'num' }, pct(r.immediate?.p)), h('td', { class: 'num' }, r.keptAtH === null ? '—' : pct(r.keptAtH)), h('td', { class: 'num' }, num(r.durablePerHour)), h('td', { class: 'num' }, r.engagement?.enjoy ? `${r.engagement.enjoy}/5 (×${num(calibrationEngagement(r.engagement), 2)})` : '—')))))),
    h('button', { class: 'btn', type: 'button', onclick: csv }, 'Download results (CSV)')));
}
