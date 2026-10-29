// Results: what each method did for this student, and what the model now believes.
import { h, mount, pct, num } from '../ui.js';
import * as store from '../store.js';
import * as model from '../model.js';
import { world } from '../content.js';
import { METHODS, METHOD_INFO, CHECKIN_DAYS } from '../engine/calibration.js';
import { calibrationEngagement } from '../engine/personalize.js';
import { studySessionsByMethod } from '../engine/metrics.js';
import { mean } from '../engine/util.js';

const COLORS = { flashcards: 'var(--c1)', tossups: 'var(--c2)', story: 'var(--c3)', matching: 'var(--c4)' };
const civName = (id) => world().civs.find((c) => c.id === id)?.name || id;

export function renderResults(root) {
  const d = store.current();
  const steps = model.stepResults();
  const H = d.settings.horizonDays;
  const posts = model.estimates();
  const chance = model.chances();
  const yields = model.yields();
  const study = studySessionsByMethod(d.events);
  const best = METHODS.reduce((a, m) => (chance[m] > chance[a] ? m : a), METHODS[0]);
  const bpSource = d.blueprint ? `the school blueprint (${Object.values(d.blueprint)[0]?.participants ?? '?'}+ students)` : 'neutral starting guesses';

  const stepRows = steps.map((r) => h('tr', {},
    h('td', {}, h('span', { class: 'dot', style: { background: COLORS[r.method] } }), METHOD_INFO[r.method].label),
    h('td', {}, civName(r.civ)),
    h('td', { class: 'num' }, num(r.activeHours * 60)),
    h('td', { class: 'num' }, String(r.introduced)),
    h('td', { class: 'num' }, pct(r.immediate.p)),
    CHECKIN_DAYS.map((day) => h('td', { class: 'num' }, r.checkins[day] ? pct(r.checkins[day].k / r.checkins[day].n) : '—')),
    h('td', { class: 'num' }, num(r.learnedPerHour)),
    h('td', { class: 'num' }, r.keptAtH === null ? '—' : pct(r.keptAtH)),
    h('td', { class: 'num' }, num(r.durablePerHour)),
    h('td', { class: 'num' }, r.engagement?.enjoy ? `${r.engagement.enjoy}/5` : '—'),
    h('td', { class: 'num' }, r.engagement ? num(r.engagement.extraMin, 1) : '—')));

  const estRows = METHODS.map((m) => {
    const p = posts[m];
    return h('tr', { class: m === best ? 'best' : '' },
      h('td', {}, h('span', { class: 'dot', style: { background: COLORS[m] } }), METHOD_INFO[m].label),
      h('td', { class: 'num' }, `${num(p.learn.mean)} ± ${num(p.learn.sd)}`),
      h('td', { class: 'num' }, pct(p.kept.mean)),
      h('td', { class: 'num' }, `×${num(p.engage.mean, 2)}`),
      h('td', { class: 'num' }, num(yields[m])),
      h('td', { class: 'num' }, h('div', { class: 'bar' }, h('span', { style: { width: `${Math.round(chance[m] * 100)}%`, background: COLORS[m] } }), h('em', {}, pct(chance[m])))),
      h('td', { class: 'muted small' }, `${num(p.evidence.hours * 60)} min · ${Math.round(p.evidence.keptItems)} check-in answers · ${p.engage.n} sessions`));
  });

  mount(root, h('section', {},
    h('h1', {}, 'Results'),
    steps.length ? null : h('div', { class: 'callout' }, 'No calibration results yet. Until there are, recommendations come from ', bpSource, '. ', h('a', { href: '#/calibrate' }, 'Start calibration')),
    h('h2', {}, 'What the model thinks now'),
    h('p', { class: 'muted' }, `Weekly durable yield = clues learned per hour × share kept at ${H} days × your weekly hours (${num(model.weeklyHours(), 1)}) × how much more you study with that method. It starts from ${bpSource} and moves toward your own numbers as they come in. “Chance best” is how often each method comes out on top when the uncertainty is drawn at random; study sessions use the same draw, so a method that might still be best gets tried now and then.`),
    h('div', { class: 'table-wrap' }, h('table', { class: 'grid' },
      h('thead', {}, h('tr', {}, ['Method', 'Learned / hr', `Kept at ${H} d`, 'Engagement', 'Kept / week', 'Chance best', 'Evidence'].map((x) => h('th', {}, x)))),
      h('tbody', {}, estRows))),
    steps.length ? [
      h('h2', {}, 'Calibration'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'grid' },
        h('thead', {}, h('tr', {}, ['Method', 'Civilization', 'Active min', 'Clues', 'Right away', ...CHECKIN_DAYS.map((x) => `Day ${x}`), 'Learned / hr', `Kept at ${H} d`, 'Durable / hr', 'Enjoyed', 'Extra min'].map((x) => h('th', {}, x)))),
        h('tbody', {}, stepRows))),
      h('p', { class: 'muted small' }, 'Kept at the horizon comes from fitting a forgetting curve (the same FSRS curve the scheduler uses) to the test and check-ins; with only early check-ins it is an extrapolation, and the model weights it less. Check-ins show the answers afterwards, so later ones measure memory after a review — the same for every method.'),
      retentionChart(steps, H),
    ] : null,
    Object.keys(study).length ? [
      h('h2', {}, 'Study sessions'),
      h('p', { class: 'muted small' }, 'How long you keep going when you study for real, by method. Longer-than-usual sessions raise a method’s engagement number.'),
      h('ul', { class: 'plain-list' }, Object.entries(study).map(([m, mins]) => h('li', {}, h('strong', {}, METHOD_INFO[m]?.label || m), `: ${mins.length} session${mins.length > 1 ? 's' : ''}, average ${num(mean(mins))} min`))),
    ] : null,
    h('h2', {}, 'Engagement from calibration'),
    h('p', { class: 'muted small' }, 'Enjoyment 1–5 maps to ×0.75–×1.25, extra practice after finishing adds up to ×0.25, stopping early takes off 0.15. Time spent during calibration isn’t used: everyone studies the same clues, so time there mostly reflects speed.'),
    h('ul', { class: 'plain-list' }, steps.map((r) => h('li', {}, `${METHOD_INFO[r.method].label}: ×${num(calibrationEngagement(r.engagement), 2)}`)))));
}

function retentionChart(steps, H) {
  const W = 560, Ht = 240, pad = { l: 40, r: 12, t: 12, b: 30 };
  const maxT = Math.max(H, 14);
  const x = (t) => pad.l + (t / maxT) * (W - pad.l - pad.r);
  const y = (p) => pad.t + (1 - p) * (Ht - pad.t - pad.b);
  const ns = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, text) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text) e.textContent = text; return e; };
  const svg = el('svg', { viewBox: `0 0 ${W} ${Ht}`, class: 'chart', role: 'img', 'aria-label': 'Share remembered over days since studying, by method' });
  for (const p of [0, 0.25, 0.5, 0.75, 1]) {
    svg.append(el('line', { x1: pad.l, x2: W - pad.r, y1: y(p), y2: y(p), class: 'gridline' }));
    svg.append(el('text', { x: pad.l - 6, y: y(p) + 4, 'text-anchor': 'end', class: 'axis' }, `${p * 100}%`));
  }
  for (const t of [0, 1, 3, 7, 14, H].filter((v, i, a) => a.indexOf(v) === i && v <= maxT)) svg.append(el('text', { x: x(t), y: Ht - 10, 'text-anchor': 'middle', class: 'axis' }, `d${t}`));
  for (const r of steps) {
    const color = COLORS[r.method];
    if (r.fit) {
      let dPath = '';
      for (let t = 0; t <= maxT; t += maxT / 80) dPath += `${dPath ? 'L' : 'M'}${x(t).toFixed(1)},${y(r.fit.at(t)).toFixed(1)}`;
      svg.append(el('path', { d: dPath, fill: 'none', stroke: color, 'stroke-width': 2 }));
    }
    const pts = [[0, r.immediate.p], ...Object.values(r.checkins).map((c) => [c.t, c.k / c.n])];
    for (const [t, p] of pts) if (p !== null) svg.append(el('circle', { cx: x(Math.min(t, maxT)), cy: y(p), r: 4, fill: color }));
  }
  const legend = h('div', { class: 'legend' }, steps.map((r) => h('span', {}, h('span', { class: 'dot', style: { background: COLORS[r.method] } }), METHOD_INFO[r.method].label)));
  return h('figure', { class: 'chart-box' }, svg, legend, h('figcaption', { class: 'muted small' }, 'Dots: share right at each test. Lines: fitted forgetting curves.'));
}
