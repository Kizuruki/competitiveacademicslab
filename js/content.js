// Content: the invented calibration world, plus real packs built from the History Bowl and
// Geography Bowl question banks (scripts/import-packs.mjs). Everything is answers and clues:
//   answer { id, name, accept[], type?, freq? }
//   clue   { id, answer, study, test, pack, text?, forms?, siteKey?, sub?, category? }
// Real-pack clues are studied in their original wording; reviews use an AI rewording when one has
// been made (scripts/rephrase.mjs), else the original. `forms` is the clue's own answer line, so it's checked exactly as on
// the site it came from.

const state = { world: null, packs: {}, clue: new Map(), answer: new Map(), byAnswer: new Map(), index: null, known: null };

function add(pack, answers, clues) {
  for (const a of answers) state.answer.set(a.id, { ...a, pack });
  for (const c of clues) {
    const clue = { ...c, pack, study: c.study || c.text, test: c.test || c.text };   // c.test may be a rewording
    state.clue.set(c.id, clue);
    if (!state.byAnswer.has(c.answer)) state.byAnswer.set(c.answer, []);
    state.byAnswer.get(c.answer).push(clue);
  }
}

export async function loadWorld(base = '.') {
  if (state.world) return state.world;
  const res = await fetch(`${base}/content/fantasy-world.json`);
  if (!res.ok) throw new Error(`Could not load the calibration world (${res.status}).`);
  state.world = await res.json();
  add('fantasy', state.world.answers, state.world.clues);
  return state.world;
}

export async function packIndex(base = '.') {
  if (state.index) return state.index;
  try {
    const res = await fetch(`${base}/content/packs/index.json`);
    state.index = res.ok ? await res.json() : { packs: [] };
  } catch (_) { state.index = { packs: [] }; }
  return state.index;
}

export async function loadPack(id, base = '.') {
  if (state.packs[id]) return state.packs[id];
  const idx = await packIndex(base);
  const meta = idx.packs.find((p) => p.id === id);
  if (!meta) throw new Error(`Unknown pack ${id}`);
  const res = await fetch(`${base}/content/packs/${meta.file}`);
  if (!res.ok) throw new Error(`Could not load ${meta.title} (${res.status}).`);
  const raw = await res.json();
  const { answers, clues } = expandPack(raw);
  // AI rewordings (scripts/rephrase.mjs): reviews ask the same fact in different words
  if (meta.rephrased) {
    try {
      const r = await fetch(`${base}/content/rephrased/${id}.json`);
      const map = r.ok ? await r.json() : {};
      for (const c of clues) if (map[c.id]) c.test = map[c.id];
    } catch (_) { /* reviews use the original wording */ }
  }
  add(id, answers, clues);
  state.known = null;
  state.packs[id] = { ...meta, title: raw.title, site: raw.site, subs: raw.subs, answerCount: answers.length, clueCount: clues.length };
  return state.packs[id];
}

// Packs are stored compactly: answers [id, name, freq], clues [key, answerIndex, text, subIndex, forms?].
export function expandPack(p) {
  const answers = p.answers.map(([id, name, freq]) => ({ id, name, freq, accept: [] }));
  const category = p.title.split(' · ')[1] || p.title;
  const clues = p.clues.map(([key, ai, text, si, forms]) => ({
    id: key, answer: answers[ai].id, text, sub: p.subs[si] || '', category,
    siteKey: p.site === 'geo' ? key.slice(4) : null, forms: forms || null,
  }));
  return { answers, clues };
}
export const loadedPacks = () => Object.keys(state.packs);

export const world = () => state.world;
export const clue = (id) => state.clue.get(id);
export const answerOf = (c) => state.answer.get(typeof c === 'string' ? state.clue.get(c)?.answer : c.answer);
export const cluesOf = (answerId) => state.byAnswer.get(answerId) || [];
// The answer as this clue's own question gives it ("Salem (Oregon)"), else the answer's name.
// Answer-line instructions ("(accept Roentgen radiation before mentioned)") aren't shown.
export const shownAnswer = (c) => ((c.forms && c.forms[0]) || answerOf(c)?.name || '').replace(/\s*[[(](?:accept|prompt|do not|don't|reject|or)\b[^\])]*[\])]/gi, '').trim();
export const packOf = (id) => (id === 'fantasy' ? { id: 'fantasy', title: 'Calibration world', site: 'fantasy', methods: ['flashcards', 'tossups', 'story', 'matching'] } : state.packs[id]);
export const allClues = (pack) => [...state.clue.values()].filter((c) => !pack || c.pack === pack);

// Every word in a Geography answer: a typed word that is itself one of these is a different place,
// not a typo ("Iceland" for "Ireland") — the same rule the Geography site uses.
function geoKnownWords() {
  if (state.known) return state.known;
  const tok = window.__answerMatchInternals?.tokens;
  state.known = new Set();
  if (tok) for (const c of state.clue.values()) if (state.packs[c.pack]?.site === 'geo') for (const f of c.forms || [state.answer.get(c.answer).name]) tok(f).forEach((w) => state.known.add(w));
  return state.known;
}

// Is `given` right for this clue? Uses the shared answer checker, with each site's own settings:
// Geography is lenient (spelling slips, feature words), History and the calibration world aren't.
export function check(given, c) {
  const a = answerOf(c);
  if (!a || !given || !given.trim()) return false;
  // the clue's own answer line, plus the answer's display name (the same thing, spelled the way
  // most questions spell it)
  const forms = c.forms ? [...c.forms, a.name] : [a.name, ...(a.accept || [])];
  if (packOf(c.pack)?.site === 'geo') return !!window.answerMatches(given, forms, { lenient: true, question: c.text, knownWords: geoKnownWords() });
  return !!window.answerMatches(given, forms);
}
