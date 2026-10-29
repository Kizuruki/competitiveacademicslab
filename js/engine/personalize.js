// Personalization: start every student from a blueprint (what worked for the group), then shift
// toward their own results as they come in. With little data a student's estimates stay near the
// blueprint; with more, their own numbers take over. That's what makes a model "trained on one
// student" workable.
//
// For each method there are three numbers:
//   learn  – clues learned per active hour
//   kept   – share of introduced clues still remembered at the horizon (default 30 days)
//   engage – how much more (or less) the student studies with this method than with an average one
// Weekly durable yield = learn × kept × weekly hours × engage. The recommendation draws each number
// from its uncertainty and picks the method with the highest yield in that draw (Thompson sampling):
// a clear winner is picked almost always, and methods that might still be best get tried now and then.
import { METHODS } from './calibration.js';
import { beta, normal, clamp, mean } from './util.js';

export const DEFAULT_BLUEPRINT = Object.fromEntries(METHODS.map((m) => [m, {
  learn: 100, kept: 0.5, engage: 1,
  strength: { hours: 0.25, items: 10, sessions: 2 },  // how much evidence the default is worth: less than one calibration session
  source: 'default',
}]));

// Engagement evidence from one calibration session: enjoyment 1–5 → 0.75–1.25, plus extra practice
// after finishing (up to +0.25), minus 0.15 for stopping early.
export function calibrationEngagement(eng) {
  if (!eng) return null;
  let x = eng.enjoy ? 0.75 + 0.125 * (eng.enjoy - 1) : 1;
  x += Math.min(0.25, (eng.extraMin || 0) / 20);
  if (eng.stoppedEarly) x -= 0.15;
  return clamp(x, 0.4, 1.6);
}

// steps: stepMetrics() results for this student; study: studySessionsByMethod(); bp: blueprint
export function posteriors(steps, study, bp = DEFAULT_BLUEPRINT, horizonDays = 30) {
  const allStudy = Object.values(study).flat();
  const studyMean = allStudy.length ? mean(allStudy) : null;
  const out = {};
  for (const m of METHODS) {
    const prior = bp[m] || DEFAULT_BLUEPRINT[m];
    const mine = steps.filter((s) => s.method === m);
    // learn rate
    const hours = mine.reduce((s, x) => s + x.activeHours, 0);
    const learnedClues = mine.reduce((s, x) => s + (x.learnedPerHour !== null ? x.learnedPerHour * x.activeHours : 0), 0);
    const h0 = prior.strength.hours;
    const learnMean = (h0 * prior.learn + learnedClues) / (h0 + hours);
    const learnSd = learnMean * 0.6 / Math.sqrt(1 + hours / h0);
    // kept at horizon: evidence counts the last check-in's answers, weighted down when the horizon is
    // far beyond the last check-in (the curve has to be extrapolated)
    let a = prior.kept * prior.strength.items, b = (1 - prior.kept) * prior.strength.items, keptItems = 0;
    for (const s of mine) {
      if (s.keptAtH === null || !s.lastCheckin) continue;
      const n = s.checkins[s.lastCheckin].n * Math.sqrt(Math.min(1, (s.lastCheckin + 1) / (horizonDays + 1)));
      a += s.keptAtH * n; b += (1 - s.keptAtH) * n; keptItems += n;
    }
    // engagement
    const obs = mine.map((s) => calibrationEngagement(s.engagement)).filter((x) => x !== null);
    if (studyMean && study[m]) for (const minutes of study[m]) obs.push(clamp(minutes / studyMean, 0.3, 2));
    const k0 = prior.strength.sessions;
    const engageMean = (k0 * prior.engage + obs.reduce((s, x) => s + x, 0)) / (k0 + obs.length);
    const engageSd = 0.3 / Math.sqrt(1 + obs.length / k0);
    out[m] = {
      learn: { mean: learnMean, sd: learnSd, hours },
      kept: { a, b, mean: a / (a + b), items: keptItems },
      engage: { mean: engageMean, sd: engageSd, n: obs.length },
      evidence: { hours, keptItems, sessions: mine.length },
    };
  }
  return out;
}

export function expectedYield(post, weeklyHours) {
  return post.learn.mean * post.kept.mean * weeklyHours * post.engage.mean;
}

function drawYield(post, weeklyHours, rng) {
  const learn = Math.max(1, post.learn.mean + post.learn.sd * normal(rng));
  const kept = beta(post.kept.a, post.kept.b, rng);
  const engage = Math.max(0.2, post.engage.mean + post.engage.sd * normal(rng));
  return learn * kept * weeklyHours * engage;
}

// Chance each method is the best one for this student, from `n` draws.
export function chanceBest(posts, weeklyHours, rng, n = 2000, methods = METHODS) {
  const wins = Object.fromEntries(methods.map((m) => [m, 0]));
  for (let i = 0; i < n; i++) {
    let best = null, bestY = -1;
    for (const m of methods) { const y = drawYield(posts[m], weeklyHours, rng); if (y > bestY) { bestY = y; best = m; } }
    wins[best]++;
  }
  return Object.fromEntries(methods.map((m) => [m, wins[m] / n]));
}

// The method to use for the next study session (one Thompson draw).
export function pickMethod(posts, weeklyHours, rng, methods = METHODS) {
  let best = null, bestY = -1;
  for (const m of methods) { const y = drawYield(posts[m], weeklyHours, rng); if (y > bestY) { bestY = y; best = m; } }
  return best;
}

// Blueprint from many participants' calibration results (the school survey). Each participant's
// numbers count once; the blueprint is worth about one student's worth of evidence, so a new
// student's own data takes over quickly.
// rows: [{ participant, method, learnedPerHour, keptAtH, engagement }]
export function blueprintFromRows(rows, minParticipants = 5) {
  const bp = {};
  for (const m of METHODS) {
    const mine = rows.filter((r) => r.method === m);
    const people = new Set(mine.map((r) => r.participant)).size;
    if (people < minParticipants) { bp[m] = { ...DEFAULT_BLUEPRINT[m], participants: people }; continue; }
    const learn = mine.map((r) => r.learnedPerHour).filter((x) => x !== null && Number.isFinite(x)).sort((a, b) => a - b);
    const kept = mine.map((r) => r.keptAtH).filter((x) => x !== null && Number.isFinite(x));
    const eng = mine.map((r) => calibrationEngagement(r.engagement)).filter((x) => x !== null);
    bp[m] = {
      learn: learn.length ? learn[Math.floor(learn.length / 2)] : DEFAULT_BLUEPRINT[m].learn,
      kept: kept.length ? mean(kept) : DEFAULT_BLUEPRINT[m].kept,
      engage: eng.length ? mean(eng) : 1,
      strength: { hours: 1, items: 20, sessions: 3 },
      source: 'survey', participants: people,
    };
  }
  return bp;
}
