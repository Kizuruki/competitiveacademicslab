// Study: a real session on History or Geography packs, working like each site's practice mode
// (see sitesync.js). Missed and due reviews first, asked on their own as typed questions; then new
// clues with the method the model picks, at the student's pace. When the planned clues are done the
// student can keep going with more; how far past (or short of) the plan they go is the engagement
// signal for that method. Leaving partway keeps everything done so far; the session shows as
// unfinished and can be continued or ended.
import { h, mount, toast, pct, dateLabel } from '../ui.js';
import * as store from '../store.js';
import * as model from '../model.js';
import * as sync from '../sync.js';
import * as sitesync from '../sitesync.js';
import { packIndex, loadPack, packOf, allClues, answerOf, clue as clueById } from '../content.js';
import { METHODS, METHOD_INFO } from '../engine/calibration.js';
import { planSession } from '../engine/planner.js';
import { PACE_LEVELS } from '../engine/pace.js';
import { shuffle, uid } from '../engine/util.js';
import { frame, studyWithMethod, testClues } from './run.js';
import { renderSiteBox } from './settings.js';

const PER_ANSWER = { geo: 4, history: 6 };   // most new clues for one answer in one session (a History tossup has ~5)
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
  // History: a tossup's clues together, in order (it's mastered on the site once all are right)
  for (const st of sites) for (const g of st.groups) { g.fresh = st.id === 'history' ? g.fresh.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })) : shuffle(g.fresh, rng); g.taken = 0; }
  const score = (g) => g.freq / Math.pow(1 + g.known + g.taken, SPREAD);
  const out = [];
  while (out.length < n) {
    const cap = (st) => PER_ANSWER[st.id] || 4;
    const open = sites.filter((st) => st.groups.some((g) => g.taken < cap(st) && g.fresh.length));
    if (!open.length) break;
    const st = open.reduce((a, b) => (b.taken < a.taken ? b : a));
    let best = null, bestS = -1;
    for (const g of st.groups) if (g.taken < cap(st) && g.fresh.length) { const sc = score(g); if (sc > bestS) { bestS = sc; best = g; } }
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
  const open = model.unfinished().find((x) => x.kind === 'study');
  const due = model.due(packs);
  const missedDue = due.filter((x) => x.reason === 'missed');
  const defaultMin = d.settings.sessionMinutes || Math.max(10, Math.round(d.settings.weeklyMinutes / d.settings.studyDays));
  const chance = model.chances(METHODS);
  let method = model.recommend(METHODS);
  const recommended = method;
  let minutes = defaultMin, mode = 'normal';
  const counts = model.counts(packs);

  const summary = h('div', { class: 'plan-box' });
  const update = () => {
    const plan = planFor({ minutes, due, mode });
    mount(summary,
      h('div', { class: 'stat' }, h('b', {}, String(plan.reviews.length)), h('span', {}, `review${plan.reviews.length === 1 ? '' : 's'}${due.length > plan.reviews.length && mode === 'normal' ? ` (of ${due.length} due)` : ''}`)),
      h('div', { class: 'stat' }, h('b', {}, String(plan.newClues)), h('span', {}, 'new clues')),
      h('div', { class: 'stat' }, h('b', {}, `${model.pace()}/hr`), h('span', {}, 'your pace')));
  };
  const minInput = h('input', { type: 'number', min: 5, max: 180, step: 5, value: minutes, class: 'num-input', 'aria-label': 'Minutes', oninput: (e) => { minutes = Math.max(5, Number(e.target.value) || defaultMin); update(); } });
  const modeSel = h('div', { class: 'row' },
    h('label', { class: 'check' }, h('input', { type: 'radio', name: 'mode', checked: true, onchange: () => { mode = 'normal'; update(); } }), 'Reviews, then new clues'),
    h('label', { class: 'check' }, h('input', { type: 'radio', name: 'mode', disabled: !missedDue.length, onchange: () => { mode = 'missed'; update(); } }), `Missed questions only (${missedDue.length})`));
  const methodSel = h('div', { class: 'method-pick' }, METHODS.map((m) => {
    const b = h('button', { type: 'button', class: 'method-btn', title: METHOD_INFO[m].why, 'aria-pressed': String(m === method), onclick: () => { method = m; methodSel.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); whyEl.textContent = METHOD_INFO[m].why; } },
      h('strong', {}, METHOD_INFO[m].label, m === recommended ? ' ★' : ''), h('span', { class: 'muted small' }, METHOD_INFO[m].blurb), h('span', { class: 'small' }, `${pct(chance[m])} chance best`));
    return b;
  }));
  const whyEl = h('p', { class: 'muted small' }, METHOD_INFO[method].why);
  const packBoxes = h('div', { class: 'pack-list' }, idx.packs.map((p) => h('label', { class: 'check' },
    h('input', { type: 'checkbox', value: p.id, checked: packs.includes(p.id), onchange: async () => {
      d.settings.packs = [...packBoxes.querySelectorAll('input:checked')].map((x) => x.value);
      store.save();
      renderStudy(root);
    } }), `${p.title} `, h('span', { class: 'muted small' }, `${p.answers} answers`))));
  const countLine = (site, label) => counts[site] ? h('div', { class: 'stat' }, h('b', {}, `${counts[site].mastered}`), h('span', {}, `${label} mastered · ${counts[site].missed} missed`)) : null;

  update();
  mount(root, h('section', {},
    h('h1', {}, 'Study'),
    open ? h('div', { class: 'callout' }, `You have an unfinished session from ${dateLabel(open.start.t)} (${METHOD_INFO[open.start.method]?.label || ''}): ${open.answers.length} answers so far. `,
      h('div', { class: 'row' }, h('button', { class: 'btn primary small', type: 'button', onclick: () => runSession(root, { resume: open }) }, 'Continue it'),
        h('button', { class: 'btn ghost small', type: 'button', onclick: () => { endUnfinished(open); renderStudy(root); } }, 'End it here'))) : null,
    h('div', { class: 'plan-box' }, countLine('geo', 'Geography clues'), countLine('history', 'History clues')),
    h('div', { class: 'card' },
      h('div', { class: 'row wrap' }, h('label', {}, 'Minutes ', minInput), summary),
      modeSel,
      h('h3', {}, 'Method for new clues'),
      h('p', { class: 'muted small' }, 'Picked for you: ', h('strong', {}, METHOD_INFO[method].label), ' ★. The pick is drawn from how likely each method is to be your best (see Results), so it changes now and then while the model is still unsure — that’s how it learns about methods you haven’t tried. You can choose another.'),
      methodSel, whyEl,
      h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: () => runSession(root, { packs, method, minutes, mode, due, chosen: method === recommended ? 'recommended' : 'own' }) }, 'Start'))),
    h('details', { class: 'card' }, h('summary', {}, `Question packs (${packs.length} of ${idx.packs.length})`), packBoxes,
      h('p', { class: 'muted small' }, 'New clues come from the answers asked most often first. With both History and Geography packs selected, new clues are split evenly between them.')),
    renderSiteBox()));
}

function planFor({ minutes, due, mode }) {
  if (mode === 'missed') return { reviews: due.filter((x) => x.reason === 'missed').map((x) => x.clue), newClues: 0 };
  const p = planSession({ minutes, due: due.length, pace: model.pace() });
  return { reviews: due.slice(0, p.reviews).map((x) => x.clue), newClues: p.newClues };
}

// End an unfinished session as it stands: it's logged as stopped early, with what was done.
function endUnfinished(open) {
  const p = open.pauses;
  const sum = (k) => p.reduce((s, x) => s + (x[k] || 0), 0);
  const planned = (open.start.planned || []).length;
  store.log({ type: 'session', kind: 'study', sessionId: open.sessionId, method: open.start.method, chosen: open.start.chosen, packs: open.start.packs,
    activeMs: sum('studyMs') + sum('extraMs'), totalMs: sum('activeMs'), reviewMs: sum('reviewMs'), studyMs: sum('studyMs'), extraMs: sum('extraMs'),
    planned, introduced: open.exposed.size, finished: false, stoppedEarly: true, status: 'ended-early',
    reviews: open.answers.filter((e) => e.phase === 'review').length, reviewRight: open.answers.filter((e) => e.phase === 'review' && e.correct).length,
    engageRatio: planned ? Math.min(1, open.exposed.size / planned) : null, minutes: open.start.minutes });
  store.saveNow();
  sitesync.flush().catch(() => {});
}

async function runSession(root, opts) {
  const d = store.current();
  let start, prior = { reviewMs: 0, studyMs: 0, extraMs: 0 };
  if (opts.resume) {
    start = opts.resume.start;
    for (const p of opts.resume.pauses) for (const k of Object.keys(prior)) prior[k] += p[k] || 0;
  } else {
    const plan = planFor(opts);
    start = store.log({ type: 'session-start', kind: 'study', sessionId: uid(), method: opts.method, chosen: opts.chosen, packs: opts.packs, minutes: opts.minutes, mode: opts.mode,
      reviews: plan.reviews, planned: pickNewClues(opts.packs, plan.newClues).map((c) => c.id) });
    store.saveNow();
  }
  const { sessionId, method } = start;
  const packs = start.packs || [];
  const answered = new Set(d.events.filter((e) => e.type === 'answer' && e.sessionId === sessionId && e.phase === 'review').map((e) => e.clue));
  const seen = new Set(d.events.filter((e) => e.type === 'expose' && e.sessionId === sessionId).map((e) => e.clue));
  const reviews = (start.reviews || []).filter((id) => !answered.has(id)).map(clueById).filter(Boolean);
  let batch = (start.planned || []).filter((id) => !seen.has(id)).map(clueById).filter(Boolean);
  const planned = (start.planned || []).length;
  const fr = frame(root, { title: 'Study session', note: `${reviews.length} reviews, then ${batch.length} new clues with ${METHOD_INFO[method].label.toLowerCase()}` });
  const totals = { reviewMs: 0, studyMs: 0, extraMs: 0 };
  const pause = (seg) => { store.log({ type: 'session-pause', sessionId, ...seg, activeMs: (seg.reviewMs || 0) + (seg.studyMs || 0) + (seg.extraMs || 0) }); store.saveNow(); sitesync.flush().catch(() => {}); };
  let reviewN = 0, reviewK = 0, stopped = false;

  // 1. Reviews: missed first, then due — the same clues, asked on their own as typed questions.
  if (reviews.length) {
    fr.setTitle('Review', `${reviews.length} to go`);
    const r = await testClues(fr, { clues: reviews, title: 'Review', phase: 'review', sessionId, feedback: 'each', onPause: ({ activeMs }) => pause({ reviewMs: activeMs }) });
    totals.reviewMs = r.activeMs; reviewN = r.n; reviewK = r.k;
    stopped = r.n < reviews.length;
  }

  // 2. New clues with the method; afterwards, more if they want.
  let exposed = [...seen], finished = !batch.length && planned > 0 && !stopped, rounds = 0;
  if (!stopped && batch.length) {
    while (batch.length) {
      rounds++;
      fr.setTitle(`New clues · ${METHOD_INFO[method].label}`, rounds === 1 ? `${batch.length} new clues` : `${batch.length} more (extra)`);
      const extraRound = rounds > 1;
      const r = await studyWithMethod(fr, { method, clues: batch, sessionId, phase: 'study', allowExtra: false, baseMs: prior.studyMs + totals.studyMs,
        onPause: (p) => pause({ reviewMs: totals.reviewMs, [extraRound ? 'extraMs' : 'studyMs']: p.activeMs + p.extraMs, ...(extraRound ? { studyMs: totals.studyMs } : {}) }) });
      exposed.push(...r.exposed);
      if (!extraRound) { totals.studyMs = r.activeMs; finished = r.finished; } else totals.extraMs += r.activeMs;
      if (!r.finished) break;
      const more = await offerMore(fr, model.pace());
      if (!more) break;
      batch = pickNewClues(packs, Math.max(5, Math.round(model.pace() / 6)));   // about ten more minutes' worth
    }
  }
  const studyMs = prior.studyMs + totals.studyMs, extraMs = prior.extraMs + totals.extraMs, reviewMs = prior.reviewMs + totals.reviewMs;
  const plannedMs = (planned / model.pace()) * 3600000;
  // past the plan: extra time as a share of the planned time, or extra clues as a share of the
  // planned clues, whichever is more; short of it: the share of planned clues reached
  exposed = [...new Set(exposed)];
  const extraClues = Math.max(0, exposed.length - planned);
  const engageRatio = planned ? (finished ? 1 + Math.max(extraMs / Math.max(60000, plannedMs), extraClues / planned) : Math.min(1, exposed.length / planned)) : null;
  const allAnswers = d.events.filter((e) => e.type === 'answer' && e.sessionId === sessionId && e.phase === 'review');
  store.log({ type: 'session', kind: 'study', sessionId, method, chosen: start.chosen, packs, activeMs: studyMs + extraMs, totalMs: reviewMs + studyMs + extraMs, reviewMs, studyMs, extraMs,
    planned, introduced: exposed.length, finished, stoppedEarly: !finished && planned > 0, reviews: allAnswers.length, reviewRight: allAnswers.filter((e) => e.correct).length, engageRatio, minutes: start.minutes, resumed: !!opts.resume || undefined });
  const pace = model.checkPace();
  store.saveNow();
  fr.end();
  const syncNote = h('li', { class: 'muted' }, 'Updating the History and Geography sites…');
  mount(fr.stage, h('div', { class: 'card' },
    h('h2', {}, 'Session done'),
    h('ul', { class: 'plain-list' },
      reviewN ? h('li', {}, `Reviews: ${reviewK} of ${reviewN} right.`) : null,
      exposed.length ? h('li', {}, `New clues: ${exposed.length}${extraClues ? ` (${extraClues} beyond the plan)` : ''}.`) : null,
      h('li', {}, `Active time: ${minutesText(reviewMs + studyMs + extraMs)}.`),
      pace.change ? h('li', { class: pace.change > 0 ? 'ok' : 'no' }, `Pace ${pace.change > 0 ? 'up' : 'down'} to ${PACE_LEVELS[pace.level]} new clues per hour: ${pace.reason}.`) : h('li', { class: 'muted' }, `Pace stays at ${model.pace()} new clues per hour (${pace.reason}).`),
      syncNote),
    h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '#/' }, 'Home'), h('a', { class: 'btn', href: '#/plan' }, 'This week’s plan'))));
  try { await sitesync.flush(); syncNote.textContent = 'Your answers are on the History and Geography sites too: mastered, missed and spaced review.'; }
  catch (_) { syncNote.textContent = 'Couldn’t reach the bowl sites just now; your answers will be sent next time.'; }
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
