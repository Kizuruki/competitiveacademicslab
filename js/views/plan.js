// This week: reviews the scheduler expects, new clues at the student's pace, and (with a coach's
// target) how many minutes that target takes for this student.
import { h, mount, num, pct } from '../ui.js';
import * as store from '../store.js';
import * as model from '../model.js';
import * as sync from '../sync.js';
import { planWeek } from '../engine/planner.js';
import { PACE_LEVELS, MIN_REVIEWS } from '../engine/pace.js';
import { median } from '../engine/util.js';
import { selectedPacks } from './study.js';

const REAL_METHODS = ['flashcards', 'tossups', 'matching'];

// Seconds a review takes for this student (answer time + reading the feedback), from their reviews.
export function secPerReview() {
  const ms = store.current().events.filter((e) => e.type === 'answer' && e.phase === 'review' && e.ms > 0).slice(-200).map((e) => e.ms);
  return ms.length >= 10 ? Math.min(40, Math.max(8, median(ms) / 1000 + 4)) : 15;
}

export async function renderPlan(root) {
  mount(root, h('p', { class: 'muted' }, 'Loading…'));
  await selectedPacks().catch(() => []);
  const d = store.current(), st = d.settings;
  const kept = model.keptShare(REAL_METHODS);
  const plan = planWeek({ weeklyMinutes: st.weeklyMinutes, studyDays: st.studyDays, forecast: model.weekForecast(), secPerReview: secPerReview(), pace: model.pace(), keptShare: kept, target: st.target || null, capMinutes: st.capMinutes || null });
  const pi = model.paceInputs();
  const dayName = (i) => new Date(Date.now() + i * 86400000).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const weeksLeft = st.tournamentDate ? Math.max(0, (new Date(st.tournamentDate + 'T12:00:00') - Date.now()) / (7 * 86400000)) : null;

  const box = h('div', {});
  mount(root, h('section', {},
    h('h1', {}, 'This week'),
    h('div', { class: 'plan-box' },
      h('div', { class: 'stat' }, h('b', {}, String(plan.newClues)), h('span', {}, 'new clues')),
      h('div', { class: 'stat' }, h('b', {}, String(Math.round(plan.days.reduce((s, x) => s + x.reviews, 0)))), h('span', {}, 'reviews expected')),
      h('div', { class: 'stat' }, h('b', {}, `${Math.round(plan.totalMinutes)} min`), h('span', {}, 'in total')),
      h('div', { class: 'stat' }, h('b', {}, String(plan.target)), h('span', {}, `still known in ${st.horizonDays} days`))),
    plan.note ? h('div', { class: 'callout' }, plan.note) : null,
    st.target ? h('p', { class: 'muted' }, `Target mode: ${st.target} clues to still know in ${st.horizonDays} days. At your pace (${model.pace()} new clues/hour) and the share you keep (${pct(kept)}), that's ${Math.round(plan.newClues)} new clues and ${Math.round(plan.totalMinutes)} minutes this week.`) : h('p', { class: 'muted' }, `Time mode: ${st.weeklyMinutes} minutes over ${st.studyDays} days. Reviews come first; the rest goes to new clues at ${model.pace()} per hour.`),
    h('div', { class: 'table-wrap' }, h('table', { class: 'grid' },
      h('thead', {}, h('tr', {}, ['Day', 'Reviews', 'New clues', 'Minutes'].map((x, i) => h('th', { class: i ? 'num' : '' }, x)))),
      h('tbody', {}, plan.days.map((x) => h('tr', { class: x.study ? '' : 'rest' },
        h('td', {}, dayName(x.day)),
        h('td', { class: 'num' }, x.study ? String(Math.round(x.reviews)) : x.carried ? `(${Math.round(x.carried)} wait)` : '—'),
        h('td', { class: 'num' }, x.study ? String(x.newClues) : '—'),
        h('td', { class: 'num' }, x.study ? num(x.totalMin) : 'rest')))))),
    h('h2', {}, 'Pace'),
    h('p', {}, `${model.pace()} new clues per hour (levels: ${PACE_LEVELS.join(', ')}). Since the last change: `,
      pi.reviewN ? `${pi.reviewN} review answers, ${pct(pi.reviewP)} right` : 'no reviews yet', `; ${pct(pi.overdueShare)} of reviews overdue; ${Math.round(pi.weekMinutes)} of ${pi.plannedWeekMinutes} planned minutes studied in the past 7 days.`),
    h('p', { class: 'muted small' }, `Goes up with at least ${MIN_REVIEWS} reviews, 85%+ right, at most 15% overdue and 80% of your planned minutes. Goes down if reviews drop below 70% right or more than 30% are overdue. New clues stay at this pace until then.`),
    weeksLeft !== null ? [h('h2', {}, 'Tournament'), h('p', {}, `${num(weeksLeft, 1)} weeks to go. At this week’s plan that’s about ${Math.round(weeksLeft * plan.newClues * kept)} more clues you’d still know on the day (rough: assumes reviews keep up).`)] : null,
    box));
  if (d.profile.username) {
    const list = await sync.teamAssignments();
    if (list.length) mount(box, h('h2', {}, 'Team assignments'), h('p', { class: 'muted small' }, 'From the bowl sites. Geography answers here count toward them when sharing is on (Settings).'),
      h('ul', { class: 'plain-list' }, list.filter((a) => a.end_ts > Date.now()).map((a) => {
        const req = (a.buckets || []).reduce((s, b) => s + (Number(b.required) || 0), 0);
        const done = (a.buckets || []).reduce((s, b) => s + Math.min(Number(b.done) || 0, Number(b.required) || 0), 0);
        return h('li', {}, h('strong', {}, a.title), ` (${a.site === 'geo' ? 'Geography' : 'History'}) — ${req ? pct(done / req) : '—'} done, due ${new Date(a.end_ts).toLocaleDateString()}`);
      })));
  }
}
