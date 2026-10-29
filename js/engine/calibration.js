// Calibration: each study method teaches a different invented civilization, then the same
// questions (in different wording) are asked right away and 1, 3, 7 and 14 days later.
//
// Counterbalancing: which civilization goes with which method, and the order of methods, rotate
// between participants (16 combinations), so no civilization or position favors one method.
import { daysBetween, DAY_MS } from './util.js';

export const METHODS = ['flashcards', 'tossups', 'story', 'matching'];
export const METHOD_INFO = {
  flashcards: { label: 'Flashcards', blurb: 'See each clue with its answer, then recall the answer from the clue.' },
  tossups: { label: 'Tossups', blurb: 'Clues are read out one at a time in a random order; buzz when you know it.' },
  story: { label: 'Story', blurb: 'Read a short chapter of the civilization’s history, then recall what it said.' },
  matching: { label: 'Matching', blurb: 'Match each clue to its answer, round after round.' },
};
export const CHECKIN_DAYS = [1, 3, 7, 14];
export const PROTOCOLS = {
  full: { label: 'Full calibration', methods: 4, chapters: [1, 2, 3, 4, 5], about: '4 methods × 60 clues. About 20–40 minutes per method, plus short check-ins over two weeks.' },
  quick: { label: 'Quick survey', methods: 3, chapters: [1, 2], about: '3 methods × 24 clues. About 30–40 minutes in total, plus optional check-ins.' },
};
// Balanced (Williams) Latin square: each method comes first, second, … equally often, and follows
// each other method equally often.
const WILLIAMS = [[0, 1, 3, 2], [1, 2, 0, 3], [2, 3, 1, 0], [3, 0, 2, 1]];

export function participantIndex(seedText) {
  let h = 2166136261;
  for (const ch of String(seedText)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 16;
}

// → [{ method, civ, order }] in the order they should be done
export function assign(p, civIds, protocol = 'full') {
  const civShift = p % 4, row = WILLIAMS[Math.floor(p / 4) % 4];
  let steps = row.map((m, order) => ({ method: METHODS[m], civ: civIds[(m + civShift) % 4], order }));
  if (protocol === 'quick') {
    const drop = METHODS[(p + Math.floor(p / 4)) % 4];
    steps = steps.filter((s) => s.method !== drop).map((s, order) => ({ ...s, order }));
  }
  return steps;
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
