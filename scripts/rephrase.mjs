#!/usr/bin/env node
// Rewords real-pack clues so reviews ask the same fact in different words (instead of holding
// questions out). The lab uses content/rephrased/<pack>.json as each clue's review wording when it
// exists, and the original wording otherwise.
//
//   ANTHROPIC_API_KEY=… node scripts/rephrase.mjs --pack geo-africa-mediterranean [--limit 500] [--model claude-haiku-5-5]
//   node scripts/rephrase.mjs --pack hist-us --dry-run      (prints one request, sends nothing)
//
// Clues go 25 to a request, most frequent answers first. Each rewording is checked before it's
// kept: it must differ from the original, stay within half to double its length, and not name the
// answer (no answer word of 4+ letters that the original didn't already contain). The output file
// is written after every batch, so a stopped run picks up where it left off.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : acc), []));
if (!args.pack) { console.error('Usage: node scripts/rephrase.mjs --pack <pack id> [--limit N] [--model id] [--dry-run]'); process.exit(1); }
const MODEL = args.model || 'claude-haiku-5-5';
const LIMIT = Number(args.limit || 1e9);
const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY && !args['dry-run']) { console.error('Set ANTHROPIC_API_KEY (or use --dry-run).'); process.exit(1); }

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'vendor/answer-match.js'), 'utf8'), sandbox);
const { tokens } = sandbox.window.__answerMatchInternals;

const pack = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/packs', `${args.pack}.json`), 'utf8'));
const outDir = path.join(ROOT, 'content/rephrased');
const outFile = path.join(outDir, `${args.pack}.json`);
const done = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
const todo = pack.clues
  .map(([id, ai, text, , forms]) => ({ id, text, answer: (forms && forms[0]) || pack.answers[ai][1], forms: forms || [pack.answers[ai][1]], freq: pack.answers[ai][2] }))
  .filter((c) => !done[c.id])
  .sort((a, b) => b.freq - a.freq)
  .slice(0, LIMIT);
console.log(`${args.pack}: ${Object.keys(done).length} done, ${todo.length} to go`);

const prompt = (batch) => `You are rewording quiz clues for a student's spaced review. For each clue, write one new version that asks for the same answer using different wording and sentence structure, so that recognizing the original sentence isn't enough — the student has to know the fact.

Rules:
- Keep every fact in the clue; add nothing that isn't in it, and don't drop the key detail.
- Never name the answer or any part of it.
- About the same length as the original. Plain, clear English.
- If the clue says "this city", "this man" and so on, keep a pointer like that.

Answer with only a JSON object mapping each id to its new wording.

${JSON.stringify(Object.fromEntries(batch.map((c) => [c.id, { clue: c.text, answer: c.answer }])), null, 1)}`;

function acceptable(orig, next, forms) {
  if (typeof next !== 'string') return false;
  const t = next.trim();
  if (!t || t === orig.trim()) return false;
  if (t.length < orig.length * 0.5 || t.length > orig.length * 2 + 20) return false;
  const have = new Set(tokens(orig));
  for (const f of forms) for (const w of tokens(f)) if (w.length >= 4 && !have.has(w) && tokens(t).includes(w)) return false;
  return true;
}

// the lab only fetches rewordings for packs the index says have them
function markIndex(n) {
  const file = path.join(ROOT, 'content/packs/index.json');
  const idx = JSON.parse(fs.readFileSync(file, 'utf8'));
  const p = idx.packs.find((x) => x.id === args.pack);
  if (p) { p.rephrased = n; fs.writeFileSync(file, JSON.stringify(idx, null, 1)); }
}

async function ask(batch) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, messages: [{ role: 'user', content: prompt(batch) }] }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  const text = body.content.map((c) => c.text || '').join('');
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(json);
}

if (args['dry-run']) { console.log(prompt(todo.slice(0, 25))); process.exit(0); }
fs.mkdirSync(outDir, { recursive: true });
let kept = 0, rejected = 0;
for (let i = 0; i < todo.length; i += 25) {
  const batch = todo.slice(i, i + 25);
  let out;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { out = await ask(batch); break; } catch (err) { console.error(err.message); await new Promise((r) => setTimeout(r, 2000 * (attempt + 1))); }
  }
  if (!out) continue;
  for (const c of batch) {
    if (acceptable(c.text, out[c.id], c.forms)) { done[c.id] = out[c.id].trim(); kept++; } else rejected++;
  }
  fs.writeFileSync(outFile, JSON.stringify(done));
  markIndex(Object.keys(done).length);
  process.stdout.write(`\r${Math.min(i + 25, todo.length)}/${todo.length}  kept ${kept}, rejected ${rejected}`);
}
console.log(`\nwrote ${path.relative(process.cwd(), outFile)}`);
