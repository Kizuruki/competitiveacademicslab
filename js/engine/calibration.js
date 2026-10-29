// Calibration: each study method teaches a different invented civilization, then the same
// questions (in different wording) are asked right away and 1, 3, 7 and 14 days later.
//
// Counterbalancing: which methods a student calibrates, which civilization goes with which method,
// and the order of methods rotate between participants, so no civilization or position favors one
// method.
import { daysBetween, DAY_MS } from './util.js';

export const METHODS = ['flashcards', 'tossups', 'story', 'matching', 'guess', 'hints', 'choice', 'lightning', 'confidence', 'connect', 'duel'];
// why: the research behind each method, shown to students (sources in the README)
export const METHOD_INFO = {
  flashcards: { label: 'Flashcards', blurb: 'See each clue with its answer, then recall the answer from the clue until you get it.', why: 'Testing yourself is one of the two best-supported ways to study (Dunlosky et al., 2013).' },
  tossups: { label: 'Tossups', blurb: 'Clues are read out one at a time in a random order; buzz when you know it.', why: 'Recall practice in the same format as the competition.' },
  story: { label: 'Read & recall', blurb: 'Read a short passage about each answer, then recall what it said.', why: 'Read, recite, review beat rereading and note-taking (McDaniel et al., 2009).' },
  matching: { label: 'Matching', blurb: 'Match each clue to its answer, round after round.', why: 'Recognition practice: easier, a gentle first look at new material.' },
  guess: { label: 'Guess first', blurb: 'Guess each answer before you see it (it’s fine to be wrong), then learn it and recall it.', why: 'Trying before you’re taught improves later recall, even when the guess is wrong (Pan & Sana, 2021).' },
  hints: { label: 'Letter hints', blurb: 'Recall with letter hints that shrink each round until you need none.', why: 'Shrinking hints and producing the answer yourself both help memory (Fiechter & Benjamin, 2018; Bertsch et al., 2007).' },
  choice: { label: 'Quiz show', blurb: 'Pick the answer from four close choices.', why: 'Multiple choice with plausible choices and feedback helps learning (Little & Bjork, 2014).' },
  lightning: { label: 'Lightning round', blurb: '60-second rounds: as many as you can, with streaks and a personal best.', why: 'Game elements improve learning on average (Sailer & Homner, 2020).' },
  confidence: { label: 'Sure or not?', blurb: 'Say how sure you are before you see if you were right; confident mistakes come back first.', why: 'Mistakes made confidently are the ones best corrected by feedback (Metcalfe, 2017).' },
  connect: { label: 'Connect it', blurb: 'Write one thing each answer connects to, then recall it.', why: 'Explaining why a fact is true (elaborative interrogation) has moderate support (Dunlosky et al., 2013).' },
  duel: { label: 'Tossup duel', blurb: 'Tossups against an AI opponent that buzzes too.', why: 'Competition adds game motivation to recall practice.' },
};
// recognition formats are easier than recall: a right answer counts as Hard, not Good
export const RECOGNITION = new Set(['match', 'choice']);
export const CHECKIN_DAYS = [1, 3, 7, 14];
export const PROTOCOLS = {
  full: { label: 'Full calibration', methods: 4, chapters: [1, 2, 3, 4, 5], about: '4 methods × 60 clues. About 20–40 minutes per method, plus short check-ins over two weeks.' },
  quick: { label: 'Quick survey', methods: 3, chapters: [1, 2], about: '3 methods × 24 clues. About 30–40 minutes in total, plus optional check-ins.' },
};
// Balanced (Williams) Latin square: each method comes first, second, … equally often, and follows
// each other method equally often.
const WILLIAMS = [[0, 1, 3, 2], [1, 2, 0, 3], [2, 3, 1, 0], [3, 0, 2, 1]];
export const COMBOS = 16 * METHODS.length;

// Only four invented civilizations exist, so each student calibrates four of the methods (three in
// the quick survey); the rest are measured in real study. Participant numbers are handed out in
// order by the lab server: consecutive students take different sets of four (every method appears
// in four of the eleven sets), and within a set the civilization and order rotate over 16 students.
export function participantIndex(seedText) {
  let h = 2166136261;
  for (const ch of String(seedText)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0) % COMBOS;
}
export function methodSet(p) {
  const block = p % METHODS.length;
  return [0, 1, 2, 3].map((k) => METHODS[(block * 4 + k) % METHODS.length]);
}

// → [{ method, civ, order }] in the order they should be done. `chosen`: four methods picked by hand.
export function assign(p, civIds, protocol = 'full', chosen = null) {
  const set = chosen && chosen.length === 4 ? chosen : methodSet(p);
  const q = Math.floor(p / METHODS.length) % 16;
  const civShift = q % 4, row = WILLIAMS[Math.floor(q / 4) % 4];
  let steps = row.map((m, order) => ({ method: set[m], civ: civIds[(m + civShift) % 4], order }));
  if (protocol === 'quick') {
    const drop = set[(q + Math.floor(q / 4)) % 4];
    steps = steps.filter((s) => s.method !== drop).map((s, order) => ({ ...s, order }));
  }
  return steps;
}

// the invented civilizations (content/fantasy-world.json; scripts/check-world.mjs checks they match)
export const CIVS = ['ostrevan', 'kaldrun', 'sennari', 'ombrel'];

// Redo one method: its attempt is set aside (kept in the log, no longer counted) and the method
// starts again on a civilization this student hasn't studied, if one is left (the quick survey uses
// three of four). If none is left, the method is marked skipped and measured in real study instead.
// → { civ } (the new civilization, or null if skipped)
export function redoStep(cal, i, civIds = CIVS, reason = '', now = Date.now()) {
  const s = cal.steps[i];
  if (!s) return null;
  if (s.sessionId) (s.discarded = s.discarded || []).push({ sessionId: s.sessionId, civ: s.civ, at: now, reason });
  const used = new Set(cal.steps.flatMap((x) => [x.civ, ...(x.discarded || []).map((d) => d.civ)]));
  const free = civIds.find((c) => !used.has(c)) || null;
  Object.assign(s, { sessionId: null, startedAt: null, finishedAt: null, doneDays: [], stage: null, activeMs: 0, extraMs: 0, finishedStudy: false, skipped: !free });
  if (free) s.civ = free;
  return { civ: free };
}
// could this step be redone on a fresh civilization?
export function canRedoFresh(cal, i, civIds = CIVS) {
  const used = new Set(cal.steps.flatMap((x) => [x.civ, ...(x.discarded || []).map((d) => d.civ)]));
  return civIds.some((c) => !used.has(c));
}

export function clueSet(world, civ, protocol = 'full') {
  const chapters = new Set(PROTOCOLS[protocol].chapters);
  return world.clues.filter((c) => c.civ === civ && chapters.has(c.chapter));
}

// Which check-in is waiting for a finished calibration step. If several have come due (a missed
// day-1 check by day 4), only the latest is offered; the earlier ones count as skipped.
export function nextCheckin(step, doneDays, now = Date.now()) {
  if (!step.finishedAt) return null;
  const elapsed = daysBetween(step.finishedAt, now);
  const open = CHECKIN_DAYS.filter((d) => d <= elapsed && !doneDays.includes(d));
  if (!open.length) return null;
  const day = open[open.length - 1];
  const later = CHECKIN_DAYS.filter((d) => d > day && !doneDays.includes(d));
  return { day, elapsed, skipped: open.slice(0, -1), next: later[0] ? step.finishedAt + later[0] * DAY_MS : null };
}

export function nextCheckinDate(step, doneDays) {
  if (!step.finishedAt) return null;
  const d = CHECKIN_DAYS.find((x) => !doneDays.includes(x) && x > Math.max(0, ...doneDays));
  return d ? { day: d, at: step.finishedAt + d * DAY_MS } : null;
}
