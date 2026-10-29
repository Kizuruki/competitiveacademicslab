// Weekly plan and single-session plan.
//
// Time-based (default): the student's weekly minutes are spread over their study days; each day's
// predicted reviews come first, and what's left goes to new clues at their pace.
//
// Target-based (for assignments): a weekly target of clues remembered at the horizon. New clues
// needed = target ÷ (share kept). Minutes needed = new clues ÷ pace + review time. So a faster
// learner needs fewer minutes and a slower learner more; weak long-term recall shows up as more
// predicted reviews, strong recall leaves more time for new clues. If that would go over the weekly
// cap, the target is lowered instead of piling on hours.
export function planWeek({ weeklyMinutes, studyDays = 5, forecast = [], secPerReview = 15, pace = 100, keptShare = 0.5, target = null, capMinutes = null }) {
  const days = 7, perStudyDay = weeklyMinutes / studyDays;
  const isStudy = (d) => d < studyDays;   // day 0 = today; simple: the next `studyDays` days are study days
  const out = [];
  let carry = 0;
  for (let d = 0; d < days; d++) {
    const reviews = (forecast[d] || 0) + carry;
    if (!isStudy(d)) { carry = reviews; out.push({ day: d, study: false, reviews: 0, reviewMin: 0, newClues: 0, newMin: 0, totalMin: 0, carried: reviews }); continue; }
    carry = 0;
    const reviewMin = (reviews * secPerReview) / 60;
    out.push({ day: d, study: true, reviews, reviewMin, newClues: 0, newMin: 0, totalMin: reviewMin });
  }
  const reviewTotal = out.reduce((s, x) => s + x.reviewMin, 0);
  let note = '';
  let newTotal;
  if (target) {
    const needClues = target / Math.max(0.05, keptShare);
    let minutes = (needClues / pace) * 60 + reviewTotal;
    const cap = capMinutes || weeklyMinutes * 1.5;
    let reached = target;
    if (minutes > cap) {
      const room = Math.max(0, cap - reviewTotal);
      reached = Math.floor(((room / 60) * pace) * keptShare);
      note = `The target of ${target} would take ${Math.round(minutes)} minutes, over the ${Math.round(cap)}-minute cap, so this week aims for ${reached}.`;
      minutes = cap;
    }
    newTotal = Math.max(0, Math.round((reached / Math.max(0.05, keptShare))));
    spread(out, newTotal, pace);
    return { days: out, newClues: newTotal, reviewMinutes: reviewTotal, totalMinutes: out.reduce((s, x) => s + x.totalMin, 0), target: reached, note };
  }
  for (const x of out) {
    if (!x.study) continue;
    const room = Math.max(0, perStudyDay - x.reviewMin);
    x.newClues = Math.floor((room / 60) * pace);
    x.newMin = (x.newClues / pace) * 60;
    x.totalMin = x.reviewMin + x.newMin;
  }
  newTotal = out.reduce((s, x) => s + x.newClues, 0);
  if (reviewTotal > weeklyMinutes) note = 'Reviews alone fill the week; new clues wait until the review pile shrinks.';
  return { days: out, newClues: newTotal, reviewMinutes: reviewTotal, totalMinutes: out.reduce((s, x) => s + x.totalMin, 0), target: Math.round(newTotal * keptShare), note };
}

function spread(days, total, pace) {
  const study = days.filter((x) => x.study);
  study.forEach((x, i) => {
    x.newClues = Math.floor(total / study.length) + (i < total % study.length ? 1 : 0);
    x.newMin = (x.newClues / pace) * 60;
    x.totalMin = x.reviewMin + x.newMin;
  });
}

// One session: how many due reviews to do and how many new clues to add in `minutes`.
export function planSession({ minutes, due, secPerReview = 15, pace = 100 }) {
  const reviewMin = Math.min(minutes, (due * secPerReview) / 60);
  const reviews = Math.min(due, Math.floor((reviewMin * 60) / secPerReview));
  const newClues = Math.max(0, Math.floor(((minutes - reviewMin) / 60) * pace));
  return { reviews, newClues };
}
