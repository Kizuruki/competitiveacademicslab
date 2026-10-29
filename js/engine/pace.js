// Pace: how many new clues a student takes on per hour of new-material time. Everyone starts at
// 100 clues/hour. It steps up when reviews show the clues are sticking and the student is putting in
// the time, and steps down when recall drops or reviews pile up.
//
//   up   – review accuracy ≥ 85%, overdue reviews ≤ 15% of what's due, and at least 80% of the
//          planned weekly minutes studied in the past week
//   down – review accuracy < 70%, or overdue reviews > 30% of what's due
// A change needs at least 30 review answers since the last change (so one bad day doesn't count).
export const PACE_LEVELS = [50, 75, 100, 150, 200];
export const START_LEVEL = 2;
export const MIN_REVIEWS = 30;

export function adjustPace(level, { reviewN, reviewP, overdueShare, weekMinutes, plannedWeekMinutes }) {
  if (reviewN < MIN_REVIEWS || reviewP === null) return { level, change: 0, reason: `needs ${MIN_REVIEWS - reviewN} more review answers before the pace can change` };
  if (reviewP < 0.7 || overdueShare > 0.3) {
    if (level === 0) return { level, change: 0, reason: 'already at the slowest pace' };
    return { level: level - 1, change: -1, reason: reviewP < 0.7 ? `review accuracy ${(reviewP * 100).toFixed(0)}% is below 70%` : `${(overdueShare * 100).toFixed(0)}% of reviews are overdue` };
  }
  if (reviewP >= 0.85 && overdueShare <= 0.15 && weekMinutes >= 0.8 * plannedWeekMinutes) {
    if (level === PACE_LEVELS.length - 1) return { level, change: 0, reason: 'already at the fastest pace' };
    return { level: level + 1, change: 1, reason: `review accuracy ${(reviewP * 100).toFixed(0)}% with reviews kept up` };
  }
  return { level, change: 0, reason: 'holding steady' };
}
