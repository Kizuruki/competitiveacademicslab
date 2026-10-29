// Study: a real session on History or Geography packs. Due reviews first (in a different format
// from how the clue was studied), then new clues with the method the model picks, at the student's
// pace. When the planned clues are done the student can keep going with more; how far past (or
// short of) the plan they go is the engagement signal for that method.
import { h, mount, toast, pct, num } from '../ui.js';
import * as store from '../store.js';
import * as model from '../model.js';
import * as sync from '../sync.js';
import { packIndex, loadPack, packOf, allClues, answerOf, clue as clueById } from '../content.js';
import { METHOD_INFO } from '../engine/calibration.js';
import { planSession } from '../engine/planner.js';
import { PACE_LEVELS } from '../engine/pace.js';
import { shuffle, uid, makeRng } from '../engine/util.js';
import { frame, studyWithMethod, testClues } from './run.js';
import { renderSiteBox } from './settings.js';

const PER_ANSWER = 4;           // most new clues for one answer in one session
const SPREAD = 1.5;             // priority = frequency ÷ (1 + clues of it already learned)^SPREAD

export async function selectedPacks() {
  const idx = await packIndex();
  const d = store.current();
  const ids = (d.settings.packs && d.settings.packs.length ? d.settings.packs : idx.packs.map((p) => p.id)).filter((id) => idx.packs.some((p) => p.id === id));
  await Promise.all(ids.map((id) => loadPack(id)));
  return ids;
}

// New clues: answers asked most often first, but each clue already learned for an answer makes the
// next one worth less, so the most common answers get several clues and the rest still get covered.
// With both History and Geography packs selected, new clues alternate between the two (their
// frequencies come from different banks and can't be compared).
export function pickNewClues(packIds, n, rng = Math.random) {
  if (n <= 0) return [];
  const mem = model.memory();
  const bySite = new Map();
  for (const c of allClues()) {
    if (!packIds.includes(c.pack)) continue;
    const siteId = packOf(c.pack).site;
    if (!bySite.has(siteId)) bySite.set(siteId, new Map());
    const byAnswer = bySite.get(siteId);
    let g = byAnswer.get(c.answer);
    if (!g) byAnswer.set(c.answer, (g = { freq: answerOf(c).freq || 1, known: 0, fresh: [] }));
    if (mem[c.id]?.introducedAt) g.known++; else g.fresh.push(c);
  }
  const sites = [...bySite.entries()].map(([id, m]) => ({ id, taken: 0, groups: [...m.values()].filter((g) => g.fresh.length) }));
  for (const st of sites) for (const g of st.groups) { g.fresh = shuffle(g.fresh, rng); g.taken = 0; }
  const score = (g) => g.freq / Math.pow(1 + g.known + g.taken, SPREAD);
  const out = [];
  while (out.length < n) {
    const open = sites.filter((st) => st.groups.some((g) => g.taken < PER_ANSWER && g.fresh.length));
    if (!open.length) break;
    const st = open.reduce((a, b) => (b.taken < a.taken ? b : a));
    let best = null, bestS = -1;
    for (const g of st.groups) if (g.taken < PER_ANSWER && g.fresh.length) { const sc = score(g); if (sc > bestS) { bestS = sc; best = g; } }
    out.push(best.fresh.shift()); best.taken++; st.taken++;
  }
  return shuffle(out, rng);
}

export async function renderStudy(root) {
  mount(root, h('p', { class: 'muted' }, 'Loading question packs…'));
  const idx = await packIndex();
  if (!idx.packs.length) {
    mount(root, h('section', {}, h('h1', {}, 'Study'), h('div', { class: 'callout' }, 'No question packs are installed. Run ', h('code', {}, 'node scripts/import-packs.mjs --geo … --history …'), ' (see the README).')));
    return;
  }
  const packs = await selectedPacks();
  const d = store.current();
  const methods = ['flashcards', 'tossups', 'matching'].filter((m) => packs.every((p) => (packOf(p).methods || []).includes(m)));
  const due = model.due(packs);
  const defaultMin = d.settings.sessionMinutes || Math.max(10, Math.round(d.settings.weeklyMinutes / d.settings.studyDays));
  const chance = model.chances(methods);
  let method = model.recommend(methods);
  const recommended = method;
  let minutes = defaultMin;

  const summary = h('div', { class: 'plan-box' });
  const update = () => {
    const plan = planSession({ minutes, due: due.length, pace: model.pace() });
    mount(summary,
      h('div', { class: 'stat' }, h('b', {}, String(plan.reviews)), h('span', {}, `review${plan.reviews === 1 ? '' : 's'} due${due.length > plan.reviews ? ` (of ${due.length})` : ''}`)),
      h('div', { class: 'stat' }, h('b', {}, String(plan.newClues)), h('span', {}, 'new clues')),
      h('div', { class: 'stat' }, h('b', {}, `${model.pace()}/hr`), h('span', {}, 'your pace')));
    return plan;
  };
  const minInput = h('input', { type: 'number', min: 5, max: 180, step: 5, value: minutes, class: 'num-input', 'aria-label': 'Minutes', oninput: (e) => { minutes = Math.max(5, Number(e.target.value) || defaultMin); update(); } });
  const methodSel = h('div', { class: 'method-pick' }, methods.map((m) => {
    const b = h('button', { type: 'button', class: 'method-btn', 'aria-pressed': String(m === method), onclick: () => { method = m; methodSel.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); } },
      h('strong', {}, METHOD_INFO[m].label), h('span', { class: 'muted small' }, `${pct(chance[m])} chance best`));
    return b;
  }));
  const packBoxes = h('div', { class: 'pack-list' }, idx.packs.map((p) => h('label', { class: 'check' },
    h('input', { type: 'checkbox', value: p.id, checked: packs.includes(p.id), onchange: async () => {
      d.settings.packs = [...packBoxes.querySelectorAll('input:checked')].map((x) => x.value);
      store.saveNow();
      renderStudy(root);
    } }), `${p.title} `, h('span', { class: 'muted small' }, `${p.answers} answers`))));

  update();
  mount(root, h('section', {},
    h('h1', {}, 'Study'),
    h('div', { class: 'card' },
      h('div', { class: 'row wrap' }, h('label', {}, 'Minutes ', minInput), summary),
      h('h3', {}, 'Method for new clues'),
      h('p', { class: 'muted small' }, `Picked for you: `, h('strong', {}, METHOD_INFO[method].label), '. The pick is drawn from how likely each method is to be your best (see Results), so it changes now and then while the model is still unsure. You can choose another.'),
      methodSel,
      h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: () => runSession(root, { packs, method, minutes, due, chosen: method === recommended ? 'recommended' : 'own' }) }, 'Start'))),
    h('details', { class: 'card' }, h('summary', {}, `Question packs (${packs.length} of ${idx.packs.length})`), packBoxes,
      h('p', { class: 'muted small' }, 'New clues come from the answers asked most often first. With both History and Geography packs selected, new clues are split evenly between them.')),
    renderSiteBox()));
}

async function runSession(root, { packs, method, minutes, due, chosen }) {
  const d = store.current();
  const sessionId = uid();
  const plan = planSession({ minutes, due: due.length, pace: model.pace() });
  const fr = frame(root, { title: 'Study session', note: `${plan.reviews} reviews, then ${plan.newClues} new clues with ${METHOD_INFO[method].label.toLowerCase()}` });
  const startEvents = d.events.length;
  let reviewMs = 0, reviewN = 0, reviewK = 0, stopped = false;

  // 1. Reviews: the same clues, asked on their own as typed questions.
  const reviews = due.slice(0, plan.reviews).map((x) => clueById(x.clue)).filter(Boolean);
  if (reviews.length) {
    fr.setTitle('Review', `${reviews.length} due`);
    const r = await testClues(fr, { clues: reviews, title: 'Review', phase: 'review', sessionId, feedback: 'each' });
    reviewMs = r.activeMs; reviewN = r.n; reviewK = r.k;
    stopped = r.n < reviews.length;
  }

  // 2. New clues with the method; afterwards, more if they want.
  let studyMs = 0, extraMs = 0, exposed = [], planned = plan.newClues, finished = false, rounds = 0;
  if (!stopped && planned > 0) {
    let batch = pickNewClues(packs, planned);
    while (batch.length) {
      rounds++;
      fr.setTitle(`New clues · ${METHOD_INFO[method].label}`, rounds === 1 ? `${batch.length} new clues` : `${batch.length} more (extra)`);
      const r = await studyWithMethod(fr, { method, clues: batch, sessionId, phase: 'study', allowExtra: false });
      exposed.push(...r.exposed);
      if (rounds === 1) { studyMs = r.activeMs; finished = r.finished; } else extraMs += r.activeMs;
      if (!r.finished) break;
      const more = await offerMore(fr, model.pace());
      if (!more) break;
      batch = pickNewClues(packs, Math.max(5, Math.round(model.pace() / 6)));   // about ten more minutes' worth
    }
  }
  const plannedMs = (planned / model.pace()) * 3600000;
  // past the plan: extra time as a share of the planned time, or extra clues as a share of the
  // planned clues, whichever is more; short of it: the share of planned clues reached
  const extraClues = Math.max(0, exposed.length - planned);
  const engageRatio = planned ? (finished ? 1 + Math.max(extraMs / Math.max(60000, plannedMs), extraClues / planned) : Math.min(1, exposed.length / planned)) : null;
  store.log({ type: 'session', kind: 'study', sessionId, method, chosen, packs, activeMs: studyMs + extraMs, totalMs: reviewMs + studyMs + extraMs, reviewMs, studyMs, extraMs,
    planned, introduced: exposed.length, finished, stoppedEarly: !finished && planned > 0, reviews: reviewN, reviewRight: reviewK, engageRatio, minutes });
  const pace = model.checkPace();
  store.saveNow();
  fr.end();
  const sent = await sync.sendSiteAnswers(d.events.slice(startEvents)).catch(() => 0);

  mount(fr.stage, h('div', { class: 'card' },
    h('h2', {}, 'Session done'),
    h('ul', { class: 'plain-list' },
      reviewN ? h('li', {}, `Reviews: ${reviewK} of ${reviewN} right.`) : null,
      exposed.length ? h('li', {}, `New clues: ${exposed.length}${extraMs ? ` (${exposed.length - Math.min(planned, exposed.length)} beyond the plan)` : ''}.`) : null,
      h('li', {}, `Active time: ${minutesText(reviewMs + studyMs + extraMs)}.`),
      pace.change ? h('li', { class: pace.change > 0 ? 'ok' : 'no' }, `Pace ${pace.change > 0 ? 'up' : 'down'} to ${PACE_LEVELS[pace.level]} new clues per hour: ${pace.reason}.`) : h('li', { class: 'muted' }, `Pace stays at ${model.pace()} new clues per hour (${pace.reason}).`),
      sent ? h('li', { class: 'muted' }, `${sent} answers also counted on the Geography site.`) : null),
    h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '#/' }, 'Home'), h('a', { class: 'btn', href: '#/plan' }, 'This week’s plan'))));
}

const minutesText = (ms) => (ms < 60000 ? 'under a minute' : `${Math.round(ms / 60000)} min`);

function offerMore(fr, pace) {
  return new Promise((resolve) => {
    const more = h('button', { class: 'btn', type: 'button', onclick: () => resolve(true) }, `Keep going: ${Math.max(5, Math.round(pace / 6))} more new clues`);
    const done = h('button', { class: 'btn primary', type: 'button', onclick: () => resolve(false) }, 'Finish');
    mount(fr.stage, h('div', { class: 'card center' }, h('h2', {}, 'Planned clues done.'), h('p', { class: 'muted' }, 'Keep going if you like — they’ll come back in reviews like the rest.'), h('div', { class: 'row center' }, more, done)));
    setTimeout(() => done.focus(), 30);
  });
}
