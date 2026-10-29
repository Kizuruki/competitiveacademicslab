// Memory per clue, using FSRS (the open-source Free Spaced Repetition Scheduler, vendored from
// ts-fsrs 5.4.2). Memory is rebuilt from the event log, so the log is the only thing stored.
//
// Rules
//  • The first graded attempt at a clue on a calendar day updates its memory; later attempts that
//    day are in-session practice and don't (they'd make a clue look stronger than it is).
//  • Rating: wrong → Again; right but slow (over 15 s) → Hard; right → Good; a tossup buzz on the
//    very first clue read → Easy.
//  • Tossups credit clues one by one (see tossupCredit): only the clue that triggered a correct buzz
//    counts as known. Clues read before it without a buzz aren't counted either way; they're flagged
//    so the next review asks each of them on its own. Clues never read aren't touched.
//  • Guesses before learning (pretest) and answers given with a letter hint (cue) are practice only.
//  • Picking an answer out (matching, multiple choice) counts, but a right pick is rated Hard.
//  • History brought in from the bowl sites can carry spreadDue, so a big backlog comes back spread
//    over the following weeks instead of all at once.
// Each entry also keeps lastResult: whether the latest first-of-the-day attempt was right (a clue
// is "missed" until a later day's attempt is right, like Missed Questions on the sites).
import { fsrs, createEmptyCard, generatorParameters, Rating, forgetting_curve } from '../../vendor/ts-fsrs/index.mjs';
import { dayKey, DAY_MS } from './util.js';
import { RECOGNITION } from './calibration.js';

export const SLOW_MS = 15000;
export const PARAMS = generatorParameters({ request_retention: 0.9, enable_fuzz: false, enable_short_term: false, maximum_interval: 365 });
const scheduler = fsrs(PARAMS);
export { Rating };

export function ratingFor(answer) {
  if (!answer.correct) return Rating.Again;
  if (RECOGNITION.has(answer.format)) return Rating.Hard;               // picking it out is easier than recalling it
  if (answer.credit === 'trigger' && answer.cluesRead === 1) return Rating.Easy;
  if (answer.ms && answer.ms > SLOW_MS) return Rating.Hard;
  return Rating.Good;
}

// Probability of recalling a clue `days` after its last review, for a given stability.
export function recallAt(stability, days) {
  if (!stability) return 0;
  return forgetting_curve(PARAMS.w, Math.max(0, days), stability);
}

function emptyEntry() {
  return { card: null, lastDay: null, needsCheck: false, introducedAt: null, method: null, attempts: 0, correct: 0, wrong: 0, lastResult: null, imported: false };
}

// events → { [clueId]: entry }. Replayed in time order (history brought in from the bowl sites is
// appended to the log later than it happened).
export function buildMemory(events) {
  const mem = {};
  const sorted = events.every((e, i) => i === 0 || events[i - 1].t <= e.t) ? events : [...events].sort((a, b) => a.t - b.t);
  for (const ev of sorted) applyEvent(mem, ev);
  return mem;
}

export function applyEvent(mem, ev) {
  if (ev.type === 'expose') {
    const e = mem[ev.clue] || (mem[ev.clue] = emptyEntry());
    if (!e.introducedAt) { e.introducedAt = ev.t; e.method = ev.method || null; }
    return;
  }
  if (ev.type !== 'answer' || !ev.clue || ev.credit === 'unread') return;   // a clue never read isn't touched
  if (ev.pretest || ev.cue) return;                                         // a guess before learning, or answered with a hint
  const e = mem[ev.clue] || (mem[ev.clue] = emptyEntry());
  if (!e.introducedAt) { e.introducedAt = ev.t; e.method = ev.method || null; }
  if (ev.credit === 'read-before') { e.needsCheck = true; return; }   // read, didn't trigger a buzz
  e.attempts++;
  if (ev.correct) e.correct++; else e.wrong++;
  if (ev.correct && ev.format !== 'tossup') e.needsCheck = false;      // answered on its own
  if (!ev.correct) e.needsCheck = false;                               // a miss is scheduled by FSRS instead
  const day = dayKey(ev.t);
  if (e.lastDay === day) return;
  const now = new Date(ev.t);
  const card = e.card ? reviveCard(e.card) : createEmptyCard(now);
  const next = scheduler.next(card, now, ratingFor(ev)).card;
  e.card = { due: Math.max(next.due.getTime(), ev.spreadDue || 0), stability: next.stability, difficulty: next.difficulty, reps: next.reps, lapses: next.lapses, state: next.state, last: ev.t };
  e.lastDay = day;
  e.lastResult = !!ev.correct;
  e.imported = ev.phase === 'import';
}

function reviveCard(c) {
  return { due: new Date(c.due), stability: c.stability, difficulty: c.difficulty, elapsed_days: 0, scheduled_days: 0,
    learning_steps: 0, reps: c.reps, lapses: c.lapses, state: c.state, last_review: new Date(c.last) };
}

export function recallNow(entry, now = Date.now()) {
  if (!entry || !entry.card) return 0;
  return recallAt(entry.card.stability, (now - entry.card.last) / DAY_MS);
}

// Clues to review now: due by FSRS, or flagged for a standalone check. Most at risk first.
// Missed clues (latest attempt wrong, not yet answered today) come first, then the rest.
export function dueClues(mem, now = Date.now(), { includeChecks = true } = {}) {
  const out = [];
  const today = dayKey(now);
  for (const [clue, e] of Object.entries(mem)) {
    const missed = e.lastResult === false && e.lastDay !== today;
    const due = e.card && e.card.due <= now;
    const check = includeChecks && e.needsCheck && e.lastDay !== today;
    if (due || check || missed) out.push({ clue, reason: missed ? 'missed' : due ? 'due' : 'check', recall: recallNow(e, now), overdueDays: e.card ? (now - e.card.due) / DAY_MS : 0 });
  }
  return out.sort((a, b) => (a.reason === 'missed') !== (b.reason === 'missed') ? (a.reason === 'missed' ? -1 : 1) : a.recall - b.recall);
}

// new / missed / mastered, the way the bowl sites count them
export function status(e) {
  if (!e || !e.introducedAt) return 'new';
  if (e.lastResult === false) return 'missed';
  if (e.lastResult === true) return 'mastered';
  return 'learning';
}

// How many reviews fall due on each of the next `days` days (index 0 = today, including overdue).
export function forecast(mem, days = 7, now = Date.now()) {
  const counts = new Array(days).fill(0);
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  for (const e of Object.values(mem)) {
    if (!e.card) { if (e.needsCheck) counts[0]++; continue; }
    const d = Math.floor((e.card.due - start.getTime()) / DAY_MS);
    if (d < days) counts[Math.max(0, d)]++;
  }
  return counts;
}

// A tossup reads an answer's clues in a shuffled order. Given that order, how many clues were read
// when the student buzzed (or the reading finished) and whether the answer was right, credit each clue.
export function tossupCredit({ order, cluesRead, correct }) {
  return order.map((clue, i) => {
    if (i >= cluesRead) return { clue, credit: 'unread' };
    if (!correct) return { clue, credit: 'read', correct: false };
    if (i === cluesRead - 1) return { clue, credit: 'trigger', correct: true };
    return { clue, credit: 'read-before' };
  });
}
