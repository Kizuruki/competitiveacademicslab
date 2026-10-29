// Checks content/fantasy-world.json: same slots in every civilization, every fact in its story
// chapter, test wording different from study wording, no clue naming its own answer, accepted
// answers recognized by the shared answer checker, and (optionally) no invented name that matches a
// real answer on the History or Geography sites.
//   node scripts/check-world.mjs [path/to/historybowlreview] [path/to/geographybowlreview]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const world = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/fantasy-world.json'), 'utf8'));
globalThis.window = globalThis.window || {};
new Function(fs.readFileSync(path.join(ROOT, 'vendor/answer-match.js'), 'utf8'))();
const { answerMatches } = globalThis.window;
const { tokens } = globalThis.window.__answerMatchInternals;

const problems = [];
const warn = [];
const bad = (m) => problems.push(m);
const answers = new Map(world.answers.map((a) => [a.id, a]));
const slotIds = world.slots.map((s) => s.id);

// 1. same template everywhere
for (const civ of world.civs) {
  const mine = world.answers.filter((a) => a.civ === civ.id);
  if (mine.map((a) => a.slot).join() !== slotIds.join()) bad(`${civ.id}: slots differ from the template`);
  for (const s of slotIds) {
    const n = world.clues.filter((c) => c.civ === civ.id && c.slot === s).length;
    if (n !== 4) bad(`${civ.id}.${s}: ${n} clues (want 4)`);
  }
  if (civ.story.length !== world.chapters.length) bad(`${civ.id}: ${civ.story.length} story chapters`);
}
// 2. every clue's key phrase is in its chapter; 3. wording checks
const words = (s) => new Set(tokens(s));
for (const c of world.clues) {
  const civ = world.civs.find((x) => x.id === c.civ);
  const ch = civ.story.find((x) => x.n === c.chapter);
  if (!ch || !ch.text.toLowerCase().includes(c.key.toLowerCase())) bad(`${c.id}: key "${c.key}" not in chapter ${c.chapter}`);
  if (!/^This |^In this |^Pilgrims |^Under this /.test(c.study)) bad(`${c.id}: study wording should read like a tossup clue`);
  if (!/\?$/.test(c.test) || !/^(Which|On which|To which|By which|In which)\b/.test(c.test)) bad(`${c.id}: test wording should be a "Which …?" question`);
  const a = words(c.study), b = words(c.test);
  const overlap = [...a].filter((w) => b.has(w)).length / Math.max(a.size, b.size);
  if (overlap > 0.85) warn.push(`${c.id}: study and test wording overlap ${(overlap * 100).toFixed(0)}%`);
  const ans = answers.get(c.answer);
  for (const form of ans.accept) {
    const re = new RegExp(`\\b${form.replace(/^the /i, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (form.length > 3 && (re.test(c.study) || re.test(c.test))) bad(`${c.id}: names its own answer ("${form}")`);
  }
}
// 4. accepted answers: each form is recognized, and no form is accepted for another answer
for (const a of world.answers) {
  for (const form of a.accept) if (!answerMatches(form, [a.name, ...a.accept])) bad(`${a.id}: "${form}" not accepted`);
  for (const o of world.answers) {
    if (o.id === a.id) continue;
    for (const form of a.accept) if (answerMatches(form, [o.name, ...o.accept])) bad(`"${form}" (${a.id}) is also accepted for ${o.id}`);
  }
}
// 5. name parity: average name length per civilization
const lens = world.civs.map((civ) => {
  const names = world.answers.filter((a) => a.civ === civ.id).map((a) => a.name.replace(/^(The |Mount |Battle of (the )?|Treaty of )/, ''));
  return [civ.id, (names.join('').length / names.length).toFixed(1)];
});
// 6. clashes with real answers (optional)
const [hist, geo] = process.argv.slice(2);
const real = new Map();
if (hist) for (const n of JSON.parse(fs.readFileSync(path.join(hist, 'graph_data/output_nodes.json'), 'utf8'))) real.set(tokens(n.answer).join(' '), `History: ${n.answer}`);
if (geo) for (const f of fs.readdirSync(path.join(geo, 'question_data/categories'))) {
  for (const q of JSON.parse(fs.readFileSync(path.join(geo, 'question_data/categories', f), 'utf8'))) real.set(tokens(q.answer).join(' '), `Geography: ${q.answer}`);
}
if (real.size) {
  for (const a of world.answers) for (const form of a.accept) {
    const k = tokens(form).join(' ');
    if (real.has(k)) bad(`"${form}" (${a.id}) is a real answer — ${real.get(k)}`);
  }
  // names mentioned in clues that aren't answers (Skarth, Lake Thale, …)
  const extra = new Set();
  for (const c of world.clues) for (const m of (c.study + ' ' + c.test).matchAll(/\b[A-Z][a-z]+(?: [A-Z][a-z]+)?/g)) extra.add(m[0]);
  for (const e of extra) { if (/^The\b/.test(e)) continue; const k = tokens(e).join(' '); if (k.split(' ').length && real.has(k) && !/^(This|Which|In|On|To|By|Under|Pilgrims|Old|Lake|Mount|Queen|King|Khan|Archon|Battle|Treaty)$/.test(e)) warn.push(`clue name "${e}" is also a real answer (${real.get(k)})`); }
}
console.log(`civilizations ${world.civs.length}, answers ${world.answers.length}, clues ${world.clues.length}`);
console.log('average name length:', lens.map(([c, l]) => `${c} ${l}`).join(', '));
if (real.size) console.log(`checked against ${real.size} real History/Geography answers`);
warn.forEach((w) => console.log('note:', w));
if (problems.length) { problems.forEach((p) => console.log('PROBLEM:', p)); process.exit(1); }
console.log('world OK');
