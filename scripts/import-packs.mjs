#!/usr/bin/env node
// Builds study packs from the History Bowl and Geography Bowl question banks.
//
//   node scripts/import-packs.mjs --geo ../geographybowlreview --history ../historybowlreview [--min-freq 2] [--out content/packs]
//
// Every clue is one fact with one answer:
//  • Geography: each question is already a single clue. Clue ids keep the site's question id
//    ("geo:<id>"), so answers can be shared with the Geography site in both directions.
//  • History: tossups are split into their sentences (one clue each, pronunciation guides and "for
//    ten points" removed); quarter-3 questions are single clues already, with their category in
//    front. Bonuses aren't used yet.
// Answers are grouped by a normalized form of the answer line (letters only, "the" dropped), and a
// feature word (River, Lake, Mount, Sea, …) is dropped only when that leaves no ambiguity: "Nile
// River" joins "Nile", "Lake Tanganyika" joins "Tanganyika", but "Arabian Sea" and "Arabian
// Peninsula" stay apart. Each answer gets its frequency: how many questions it has across the whole
// bank. Each clue keeps its own answer line, so it's shown and checked exactly as on the site the
// question came from.
//
// Files are written in a compact form (see content.js, which expands them).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const IS_CLI = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
const args = IS_CLI ? Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : acc), [])) : {};
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(args.out || path.join(ROOT, 'content/packs'));
const MIN_FREQ = Number(args['min-freq'] || 2);
if (IS_CLI && !args.geo && !args.history) { console.error('Usage: node scripts/import-packs.mjs --geo <geography repo> --history <history repo> [--min-freq 2]'); process.exit(1); }

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'vendor/answer-match.js'), 'utf8'), sandbox);
const { tokens } = sandbox.window.__answerMatchInternals;

const LEAD = new Set(['lake', 'mount', 'mt']);
const TRAIL = new Set(['sea', 'ocean', 'river', 'desert', 'mountain', 'mountains', 'peninsula', 'plateau', 'basin', 'archipelago', 'gulf', 'range', 'volcano', 'glacier', 'reef', 'lagoon', 'canyon', 'highland', 'highlands', 'hill', 'hills', 'forest']);
const PLAIN = new Set(['black', 'red', 'white', 'yellow', 'green', 'blue', 'dead', 'north', 'south', 'east', 'west', 'great', 'little', 'big', 'long', 'grand', 'rocky', 'salt', 'old', 'new', 'upper', 'lower', 'high']);
const plainKey = (form) => tokens(String(form || '').replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ')).join(' ');
// "x river" → "x" etc., or null when there's no feature word to drop
function featureBase(key) {
  let t = key.split(' ');
  const core = (x) => x.length && !(x.length === 1 && PLAIN.has(x[0]));
  if (t.length > 1 && LEAD.has(t[0]) && core(t.slice(1))) return t.slice(1).join(' ');
  if (t.length > 1 && TRAIL.has(t[t.length - 1]) && core(t.slice(0, -1))) return t.slice(0, -1).join(' ');
  return null;
}
// Grouping for Geography: merge "x <feature>" into "x" only when x is used with one feature word at most.
function geoGrouper(allForms) {
  const variants = new Map();   // base → set of full keys that reduce to it
  for (const f of allForms) {
    const k = plainKey(f), b = featureBase(k);
    if (!b) continue;
    if (!variants.has(b)) variants.set(b, new Set());
    variants.get(b).add(k);
  }
  return (form) => {
    const k = plainKey(form), b = featureBase(k);
    return b && variants.get(b).size === 1 ? b : k;
  };
}
const firstAlt = (a) => String(a).split(/\s+or\s+|\s*\/\s*|;/i)[0];
const slug = (s) => s.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

// ---- History tossups → sentence clues ----
const ABBR = /(?:\b(?:Mr|Mrs|Ms|Dr|St|Mt|Ft|Jr|Sr|vs|v|Gen|Col|Lt|Capt|Sgt|Adm|Gov|Sen|Rep|Pres|Rev|No|Co|Inc|Ltd|Bros|ca|c|b|d|r|fl|approx|Vol|Ch|pp|e\.g|i\.e|etc|U\.S|U\.K|U\.N|D\.C|A\.D|B\.C|B\.C\.E|C\.E)|\b[A-Z])\.$/;
function cleanText(t) {
  return String(t || '')
    .replace(/\[\[[^\]]*\]\]/g, '').replace(/\[[^\]]*\]/g, '')   // pronunciation guides
    .replace(/\(\*\)/g, '').replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
}
function splitSentences(text) {
  const parts = [];
  const re = /([.!?][”"’')]*)\s+(?=[A-Z“"‘(0-9])/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    const end = m.index + m[1].length;
    const chunk = text.slice(last, end);
    if (ABBR.test(chunk.slice(0, m.index + 1 - last))) continue;
    parts.push(chunk.trim()); last = end;
  }
  parts.push(text.slice(last).trim());
  return parts.filter(Boolean);
}
function ftp(sentence) {
  let s = sentence
    .replace(/^(?:for\s+(?:10|ten)\s+points|ftp)[,:]?\s*/i, '')
    .replace(/,?\s*for\s+(?:10|ten)\s+points,?\s*/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
export function tossupClues(question) {
  return splitSentences(cleanText(question)).map(ftp).filter((s) => s.split(' ').length >= 4);
}

// ---- build ----
function buildPacks(site, items, groupOf) {
  // items: [{ key, text, forms[], pack, packTitle, sub }]
  const groups = new Map();   // canon → { id, spellings: Map, freq }
  const prefix = site === 'geo' ? 'geo' : 'hist';
  for (const it of items) {
    const k = groupOf(it.forms[0]);
    if (!k) continue;
    it.group = k;
    if (!groups.has(k)) groups.set(k, { id: `${prefix}:${slug(k)}`, spellings: new Map(), questions: new Set(), freq: 0 });
    const g = groups.get(k);
    const spelling = String(firstAlt(it.forms[0])).replace(/^the\s+/i, '').trim();
    g.spellings.set(spelling, (g.spellings.get(spelling) || 0) + 1);
    if (!g.questions.has(it.question)) { g.questions.add(it.question); g.freq++; }
  }
  // distinct slugs
  const seen = new Map();
  for (const g of groups.values()) { const n = seen.get(g.id) || 0; seen.set(g.id, n + 1); if (n) g.id += `-${n + 1}`; }
  for (const g of groups.values()) g.name = [...g.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const packs = new Map();
  for (const it of items) {
    if (!it.group) continue;
    const g = groups.get(it.group);
    if (g.freq < MIN_FREQ) continue;
    if (!packs.has(it.pack)) packs.set(it.pack, { id: it.pack, title: it.packTitle, site, subs: [], answers: [], aIndex: new Map(), src: [], sIndex: new Map(), clues: [] });
    const p = packs.get(it.pack);
    if (!p.aIndex.has(g.id)) { p.aIndex.set(g.id, p.answers.length); p.answers.push([g.id, g.name, g.freq]); }
    let si = p.subs.indexOf(it.sub); if (si < 0) { si = p.subs.length; p.subs.push(it.sub); }
    const sameAsName = it.forms.length === 1 && it.forms[0].trim() === g.name;
    const row = [it.key, p.aIndex.get(g.id), it.text, si, sameAsName ? null : it.forms];
    // History: which site question the clue comes from — [site key, quarter, set, category]
    if (it.src) {
      if (!p.sIndex.has(it.src[0])) { p.sIndex.set(it.src[0], p.src.length); p.src.push(it.src); }
      row.push(p.sIndex.get(it.src[0]));
    }
    while (row.length && row[row.length - 1] === null) row.pop();
    p.clues.push(row);
  }
  return [...packs.values()].map(({ aIndex, sIndex, ...p }) => (p.src.length ? p : (delete p.src, p)));
}

const index = { built: new Date().toISOString().slice(0, 10), minFreq: MIN_FREQ, packs: [] };
if (IS_CLI) fs.mkdirSync(OUT, { recursive: true });
function write(p, extra) {
  const file = `${p.id}.json`;
  fs.writeFileSync(path.join(OUT, file), JSON.stringify(p));
  const size = fs.statSync(path.join(OUT, file)).size;
  index.packs.push({ id: p.id, title: p.title, site: p.site, file, clues: p.clues.length, answers: p.answers.length, ...extra });
  console.log(`${p.id}: ${p.clues.length} clues, ${p.answers.length} answers, ${(size / 1e6).toFixed(1)} MB`);
}

if (args.geo) {
  const dir = path.join(path.resolve(args.geo), 'question_data/categories');
  const items = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    for (const q of readJSON(path.join(dir, f))) {
      if (!q || typeof q.id !== 'string' || !q.question || !q.answer) continue;
      if (/^\s*\(\s*(\d+|one|two|three|four|five)\s+of\s*\)/i.test(q.answer)) continue;   // "(2 of) …" list answers
      items.push({ key: `geo:${q.id}`, question: q.id, text: String(q.question).trim(), forms: [q.answer, ...(q.aliases || [])], pack: `geo-${f.replace(/\.json$/, '')}`, packTitle: `Geography · ${q.category}`, sub: q.subcategory || '' });
    }
  }
  const group = geoGrouper(items.map((it) => firstAlt(it.forms[0])));
  for (const p of buildPacks('geo', items, (a) => group(firstAlt(a)))) write(p, { region: p.title.replace('Geography · ', '') });
}

if (args.history) {
  const root = path.resolve(args.history);
  const PACKS = { 'US History': 'us', 'European History': 'european', 'World History': 'world', 'Geographical History': 'world', 'Ancient History': 'ancient' };
  const TITLES = { us: 'History · US', european: 'History · European', world: 'History · World and geographical', ancient: 'History · Ancient', other: 'History · Arts, science, culture and other' };
  const items = [];
  // Quarter-3 questions lean on their category ("ANDREW JACKSON — Represented what political
  // party?"), so the category goes in front of the clue.
  const SMALL = new Set(['a', 'an', 'and', 'the', 'of', 'in', 'on', 'for', 'to', 'by', 'or', 'at', 'vs']);
  const titleCase = (t) => (t === t.toUpperCase() ? t.toLowerCase().split(' ').map((w, i) => (i && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ') : t);
  // The History site keys what you've mastered by quarter and question text (makeMasteredKey and
  // q3Key in its index.html); hist-site.json keeps what its missed list needs for each question.
  const siteKey = (quarter, text) => `Q${quarter}|${String(text || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 100)}`;
  const setOf = (x, id) => String(x.set || (/^([ABCN])-/.exec(String(id || '')) || [])[1] || (/^Nat-/.test(String(id)) ? 'N' : '')).toUpperCase() || null;
  const site = { q: {}, cats: {} };
  const addQ = (q, kind, { quarter, set, cat = null } = {}) => {
    if (!q || !q.id || !q.question || !q.answer) return;
    const forms = (Array.isArray(q.answer) ? q.answer : [q.answer]).map(String).filter(Boolean);
    if (!forms.length) return;
    const packKey = PACKS[q.questionSetCategory] || 'other';
    const key = quarter === 3 ? siteKey(3, `${cat.category || ''} :: ${q.question}`) : siteKey(quarter, q.question);
    const category = q.questionSetCategory || (cat && cat.questionSetCategory) || 'Unknown';
    site.q[key] = { t: q.question, a: q.answer, qr: quarter, c: category, s: set, ...(cat ? { cat: `${set}|${cat.category}` } : {}) };
    const base = { question: q.id, forms, pack: `hist-${packKey}`, packTitle: TITLES[packKey], sub: q.questionSetCategory || '', src: [key, quarter, set, category] };
    if (kind === 'single') items.push({ ...base, key: `hist:${q.id}`, text: (cat ? `${titleCase(cleanText(cat.category)).replace(/[.:…]+$/, '')}: ` : '') + cleanText(q.question) });
    else tossupClues(q.question).forEach((text, i) => items.push({ ...base, key: `hist:${q.id}#${i + 1}`, text }));
  };
  for (const f of ['questions.json', 'questions_nationals.json']) {
    const file = path.join(root, f);
    if (!fs.existsSync(file)) continue;
    const d = readJSON(file);
    (d.q1 || []).forEach((q) => addQ(q, 'tossup', { quarter: 1, set: setOf(q, q.id) }));
    (d.q2 || []).forEach((x) => x.tossup && addQ(x.tossup, 'tossup', { quarter: 2, set: setOf(x, x.tossup.id) }));
    (d.q3 || []).forEach((g) => {
      const set = setOf(g, g.questions?.[0]?.id);
      site.cats[`${set}|${g.category}`] = { category: g.category, prompt: g.prompt || '', questionSetCategory: g.questionSetCategory || 'Unknown', questions: g.questions || [] };
      (g.questions || []).forEach((q) => addQ(q, 'single', { quarter: 3, set, cat: g }));
    });
  }
  // History answers are grouped on the full answer (no feature words dropped: "Nile" the battle and
  // the river shouldn't merge here).
  for (const p of buildPacks('history', items, (a) => plainKey(firstAlt(a)))) {
    // <pack>.site.json: what the History site's missed list needs for this pack's questions
    // (full text and answer line; quarter-3 categories whole). Loaded only when needed.
    const part = { q: {}, cats: {} };
    for (const [key] of p.src) { const q = site.q[key]; part.q[key] = q; if (q.cat) part.cats[q.cat] = site.cats[q.cat]; }
    fs.writeFileSync(path.join(OUT, `${p.id}.site.json`), JSON.stringify(part));
    write(p, { siteFile: `${p.id}.site.json` });
  }
}

if (IS_CLI) {
  index.packs.sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 1));
  console.log(`wrote ${index.packs.length} packs to ${path.relative(process.cwd(), OUT) || '.'}`);
}
export { splitSentences, cleanText, geoGrouper, plainKey };
