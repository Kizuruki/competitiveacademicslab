// Content: the invented calibration world, plus real packs built from the History Bowl and
// Geography Bowl question banks (scripts/import-packs.mjs). Everything is answers and clues:
//   answer { id, name, accept[], type?, freq? }
//   clue   { id, answer, study, test, pack, text?, forms?, siteKey?, sub?, category? }
// Real-pack clues are studied in their original wording; reviews use an AI rewording when one has
// been made (scripts/rephrase.mjs), else the original. `forms` is the clue's own answer line, so it's checked exactly as on
// the site it came from.

const state = { world: null, packs: {}, clue: new Map(), answer: new Map(), byAnswer: new Map(), bySite: new Map(), siteFiles: {}, index: null, known: null };

function add(pack, answers, clues) {
  for (const a of answers) state.answer.set(a.id, { ...a, pack });
  for (const c of clues) {
    const clue = { ...c, pack, study: c.study || c.text, test: c.test || c.text };   // c.test may be a rewording
    state.clue.set(c.id, clue);
    if (!state.byAnswer.has(c.answer)) state.byAnswer.set(c.answer, []);
    state.byAnswer.get(c.answer).push(clue);
    if (clue.siteKey) { if (!state.bySite.has(clue.siteKey)) state.bySite.set(clue.siteKey, []); state.bySite.get(clue.siteKey).push(clue); }
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
  state.known = null; state.subAnswers = null;
  state.packs[id] = { ...meta, title: raw.title, site: raw.site, subs: raw.subs, answerCount: answers.length, clueCount: clues.length };
  return state.packs[id];
}

// Packs are stored compactly: answers [id, name, freq], clues [key, answerIndex, text, subIndex,
// forms?, sourceIndex?]. siteKey is how the clue's question is known on its site: the Geography
// question id, or for History the site's mastered key (src: [key, quarter, set, category]).
export function expandPack(p) {
  const answers = p.answers.map(([id, name, freq]) => ({ id, name, freq, accept: [] }));
  const category = p.title.split(' · ')[1] || p.title;
  const clues = p.clues.map(([key, ai, text, si, forms, srcIndex]) => {
    const src = p.src && srcIndex !== undefined && srcIndex !== null ? p.src[srcIndex] : null;
    return {
      id: key, answer: answers[ai].id, text, sub: p.subs[si] || '', category, forms: forms || null,
      siteKey: p.site === 'geo' ? key.slice(4) : src ? src[0] : null,
      quarter: src ? src[1] : null, set: src ? src[2] : null, siteCategory: src ? src[3] : null,
    };
  });
  return { answers, clues };
}
export const loadedPacks = () => Object.keys(state.packs);
// All clues of one History site question (a tossup is split into several).
export const cluesOfSite = (siteKey) => state.bySite.get(siteKey) || [];
// What the History site's missed list needs (full question text, answer line, quarter-3 categories).
export async function siteFile(packId, base = '.') {
  if (state.siteFiles[packId]) return state.siteFiles[packId];
  const meta = (await packIndex(base)).packs.find((p) => p.id === packId);
  if (!meta || !meta.siteFile) return (state.siteFiles[packId] = { q: {}, cats: {} });
  const res = await fetch(`${base}/content/packs/${meta.siteFile}`);
  state.siteFiles[packId] = res.ok ? await res.json() : { q: {}, cats: {} };
  return state.siteFiles[packId];
}

export const world = () => state.world;
export const clue = (id) => state.clue.get(id);
export const answerOf = (c) => state.answer.get(typeof c === 'string' ? state.clue.get(c)?.answer : c.answer);
export const cluesOf = (answerId) => state.byAnswer.get(answerId) || [];
// The answer as this clue's own question gives it ("Salem (Oregon)"), else the answer's name.
// Answer-line instructions ("(accept Roentgen radiation before mentioned)") aren't shown.
export const shownAnswer = (c) => ((c.forms && c.forms[0]) || answerOf(c)?.name || '').replace(/\s*[[(](?:accept|prompt|do not|don't|reject|or)\b[^\])]*[\])]/gi, '').trim();
export const packOf = (id) => (id === 'fantasy' ? { id: 'fantasy', title: 'Calibration world', site: 'fantasy' } : state.packs[id]);
export const allClues = (pack) => [...state.clue.values()].filter((c) => !pack || c.pack === pack);

// Wrong choices that look like the right one: for the invented world, the same civilization's
// answers of the same kind (people, places, things); for real packs, answers from the same
// pack and subcategory, then the same pack.
const KIND = { ruler: 'person', general: 'person', scholar: 'person', poet: 'person', deity: 'person', city: 'place', river: 'place', mountain: 'place', island: 'place', monument: 'place', battle: 'thing', treaty: 'thing', disaster: 'thing', poem: 'thing', code: 'thing' };
export function distractors(c, n = 3, rng = Math.random) {
  const a = answerOf(c);
  const pick = (list) => { const out = [...new Set(list)].filter((x) => x !== c.answer); for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; };
  let pool;
  if (c.pack === 'fantasy') {
    const same = state.world.answers.filter((x) => x.civ === a.civ && KIND[x.slot] === KIND[a.slot]).map((x) => x.id);
    pool = pick(same);
    if (pool.length < n) pool = [...pool, ...pick(state.world.answers.filter((x) => x.civ === a.civ).map((x) => x.id)).filter((x) => !pool.includes(x))];
  } else {
    if (!state.subAnswers) {
      state.subAnswers = new Map();
      for (const x of state.clue.values()) for (const k of [`${x.pack}|${x.sub}`, `${x.pack}|`]) { if (!state.subAnswers.has(k)) state.subAnswers.set(k, new Set()); state.subAnswers.get(k).add(x.answer); }
    }
    pool = pick([...(state.subAnswers.get(`${c.pack}|${c.sub}`) || [])]);
    if (pool.length < n) pool = [...pool, ...pick([...(state.subAnswers.get(`${c.pack}|`) || [])]).filter((x) => !pool.includes(x))];
  }
  return pool.slice(0, n);
}

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
