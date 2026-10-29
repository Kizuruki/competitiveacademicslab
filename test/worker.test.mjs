// The lab worker against a real SQLite database standing in for D1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/lab-worker.js';
import { blueprintFromRows } from '../js/engine/personalize.js';

function d1() {
  const db = new DatabaseSync(':memory:');
  class Stmt {
    constructor(sql, args = []) { this.sql = sql; this.args = args; }
    bind(...a) { return new Stmt(this.sql, a.map((v) => (v === undefined ? null : v))); }
    async all() { return { results: db.prepare(this.sql).all(...this.args) }; }
    async first() { return db.prepare(this.sql).get(...this.args) ?? null; }
    async run() { const r = db.prepare(this.sql).run(...this.args); return { success: true, meta: { changes: r.changes } }; }
  }
  return { prepare: (sql) => new Stmt(sql), batch: async (st) => Promise.all(st.map((s) => (/^\s*SELECT/i.test(s.sql) ? s.all() : s.run()))) };
}
const env = { ADMIN_KEY: 'secret', DB: d1() };
async function call(method, path, body, headers = {}) {
  const res = await worker.fetch(new Request(`https://lab.test${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined }), env);
  return { status: res.status, json: await res.json() };
}
const step = (method, lph, kept, enjoy, sid) => ({ sessionId: sid, method, civ: 'ostrevan', finishedAt: 1, activeHours: 0.3, introduced: 60, immediate: { n: 60, k: 50, p: 0.83 }, checkins: { 1: { n: 60, k: 45, t: 1 }, 7: { n: 60, k: 40, t: 7 } }, lastCheckin: 7, horizonDays: 30, learnedPerHour: lph, keptAtH: kept, durablePerHour: lph * kept, engagement: { enjoy, demand: 3, extraMin: 0, stoppedEarly: false, finished: true }, fit: () => 1 });

test('upload, blueprint, export, events, delete', async () => {
  for (let i = 0; i < 6; i++) {
    const r = await call('POST', '/lab/upload', {
      participant: `device-${i}-abcdef`, participantIndex: i, name: `S${i}`, username: i === 0 ? 'kizuruki' : null, protocol: 'quick', pace: 2,
      steps: [step('flashcards', 120 + i * 10, 0.5, 3, `s${i}a`), step('story', 90 + i * 5, 0.7, 4, `s${i}b`)],
      events: [{ id: `e${i}1`, t: 100, type: 'answer', correct: true }, { id: `e${i}2`, t: 200, type: 'session' }],
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.steps, 2);
  }
  // re-upload is idempotent for events, and updates a step
  let r = await call('POST', '/lab/upload', { participant: 'device-0-abcdef', steps: [step('flashcards', 300, 0.6, 5, 's0a')], events: [{ id: 'e01', t: 100 }, { id: 'e03', t: 300 }] });
  assert.equal(r.status, 200);

  r = await call('GET', '/lab/blueprint');
  assert.equal(r.json.participants, 6);
  assert.equal(r.json.rows.length, 12);
  assert.ok(r.json.rows.every((x) => !String(x.participant).startsWith('device')), 'device ids are not exposed');
  const flash0 = r.json.rows.filter((x) => x.method === 'flashcards').map((x) => x.learnedPerHour).sort((a, b) => a - b);
  assert.ok(flash0.includes(300) && !flash0.includes(120), 'the updated step replaces the old one');
  const bp = blueprintFromRows(r.json.rows);
  assert.equal(bp.flashcards.source, 'survey');
  assert.equal(bp.story.source, 'survey');
  assert.equal(bp.tossups.source, 'default');
  assert.ok(bp.story.kept > bp.flashcards.kept);

  assert.equal((await call('GET', '/lab/export')).status, 401);
  r = await call('GET', '/lab/export', null, { 'X-Admin-Key': 'secret' });
  assert.equal(r.json.participants.length, 6);
  assert.equal(r.json.participants.find((p) => p.participant === 'device-0-abcdef').events, 3);
  assert.equal(r.json.participants.find((p) => p.username === 'kizuruki').name, 'S0');
  assert.equal(r.json.steps.length, 12);
  assert.equal(r.json.steps[0].fit, undefined, 'functions and unknown fields are dropped');

  r = await call('GET', '/lab/events?key=secret&participant=device-0-abcdef');
  assert.deepEqual(r.json.events.map((e) => e.id), ['e01', 'e02', 'e03']);

  r = await call('DELETE', '/lab/participant/device-5-abcdef?key=secret');
  assert.equal(r.status, 200);
  r = await call('GET', '/lab/blueprint');
  assert.equal(r.json.participants, 5);

  r = await call('POST', '/lab/upload', { participant: 'x' });
  assert.equal(r.status, 400);
});
