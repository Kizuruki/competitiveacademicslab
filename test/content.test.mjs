// Packs and answer checking: what the importer makes, and that every clue's own answer is accepted.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { tossupClues, geoGrouper } from '../scripts/import-packs.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
globalThis.window = globalThis.window || {};
vm.runInThisContext(fs.readFileSync(`${ROOT}vendor/answer-match.js`, 'utf8'));

test('History tossups split into standalone sentence clues', () => {
  const q = 'This case overturned another whose plaintiff was indicted for robbery in Maryland, called\nBetts v. Brady. Abe Fortas [FORR-tuss] argued on behalf of this case’s plaintiff before the\nSupreme Court. An expanded public defender system was set up in the U.S. as a result. For 10 points, name this landmark case whose plaintiff broke into a pool hall.';
  assert.deepEqual(tossupClues(q), [
    'This case overturned another whose plaintiff was indicted for robbery in Maryland, called Betts v. Brady.',
    'Abe Fortas argued on behalf of this case’s plaintiff before the Supreme Court.',
    'An expanded public defender system was set up in the U.S. as a result.',
    'Name this landmark case whose plaintiff broke into a pool hall.',
  ]);
  assert.deepEqual(tossupClues('A 2017 film by Craig Gillespie stars Margot Robbie as, for ten points, what American figure skater?'), ['A 2017 film by Craig Gillespie stars Margot Robbie as what American figure skater?']);
  assert.deepEqual(tossupClues('John F. Kennedy gave this speech in Berlin. It was given in 1963.'), ['John F. Kennedy gave this speech in Berlin.', 'It was given in 1963.']);
});

test('Geography answers merge across feature words only when unambiguous', () => {
  const g = geoGrouper(['Nile River', 'the Nile', 'Arabian Sea', 'Arabian Peninsula', 'Lake Tanganyika', 'Tanganyika', 'Black Sea', 'Mississippi River']);
  assert.equal(g('Nile River'), g('Nile'));
  assert.equal(g('Lake Tanganyika'), g('Tanganyika'));
  assert.notEqual(g('Arabian Sea'), g('Arabian Peninsula'));
  assert.equal(g('Black Sea'), 'black sea');
});

test('every clue in the installed packs accepts its own answer line', async () => {
  const C = await import('../js/content.js');
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u) => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(`${ROOT}${String(u).replace(/^\.\//, '')}`, 'utf8')) });
  try {
    const idx = await C.packIndex('.');
    if (!idx.packs.length) return;   // no packs built
    for (const p of idx.packs) await C.loadPack(p.id, '.');
    await C.loadWorld('.');
  } finally { globalThis.fetch = realFetch; }
  let n = 0, own = 0, name = 0;
  for (const c of C.allClues()) {
    n++;
    if (!C.check((c.forms && c.forms[0]) || C.answerOf(c).name, c)) own++;
    if (!C.check(C.answerOf(c).name, c)) name++;
  }
  assert.ok(n > 1000);
  assert.ok(own / n < 0.002, `${own} of ${n} clues reject their own answer line`);
  assert.ok(name / n < 0.002, `${name} of ${n} clues reject the answer's display name`);
  const xray = C.allClues().find((c) => c.forms && /accept Roentgen/.test(c.forms[0]));
  if (xray) assert.equal(C.shownAnswer(xray), 'X-Ray');
  const fantasy = C.allClues().find((c) => c.pack === 'fantasy');
  assert.equal(C.check('Queen Ysolde', C.clue('ostrevan.ruler.1')), true);
  assert.equal(C.check('Ysolde Marow', C.clue('ostrevan.ruler.1')), true, 'small spelling slips are fine');
  assert.equal(C.check('Tamsin Rook', C.clue('ostrevan.ruler.1')), false);
  assert.ok(fantasy);
});
