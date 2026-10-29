// The lab worker against a real SQLite database standing in for D1, and a stand-in for the bowl
// sites' worker (which checks passwords).
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
  return { prepare: (sql) => new Stmt(sql), batch: async (st) => { const out = []; for (const s of st) out.push(/^\s*SELECT/i.test(s.sql) ? await s.all() : await s.run()); return out; } };
}
const env = { ADMIN_KEY: 'secret', DB: d1(), MAIN_URL: 'https://main.test' };
const accounts = { Tess: 'pw1', kizuruki: 'coach' };
for (let i = 0; i < 6; i++) accounts[`S${i}`] = 'pw';
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url), b = JSON.parse(opts.body || '{}');
  if (u.pathname === '/auth/login') return new Response(JSON.stringify(accounts[b.username] === b.password ? { success: true, username: b.username } : { success: false, message: 'Invalid credentials' }), { status: accounts[b.username] === b.password ? 200 : 401 });
  if (u.pathname === '/auth/register') { if (accounts[b.username]) return new Response(JSON.stringify({ success: false, message: 'Username already exists' }), { status: 400 }); accounts[b.username] = b.password; return new Response(JSON.stringify({ success: true })); }
  return new Response('{}', { status: 404 });
};
async function call(method, path, body, token) {
  const res = await worker.fetch(new Request(`https://lab.test${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }), env);
  return { status: res.status, json: await res.json() };
}
const step = (method, lph, kept, enjoy, sid) => ({ sessionId: sid, method, civ: 'ostrevan', finishedAt: 1, activeHours: 0.3, introduced: 60, immediate: { n: 60, k: 50, p: 0.83 }, checkins: { 1: { n: 60, k: 45, t: 1 }, 7: { n: 60, k: 40, t: 7 } }, lastCheckin: 7, horizonDays: 30, learnedPerHour: lph, keptAtH: kept, durablePerHour: lph * kept, engagement: { enjoy, demand: 3, extraMin: 0, stoppedEarly: false, finished: true } });

test('accounts, progress online, blueprint, coach', async () => {
  assert.equal((await call('POST', '/lab/login', { username: 'Tess', password: 'nope' })).status, 401);
  assert.equal((await call('GET', '/lab/me')).status, 401, 'no token, no data');
  const login = await call('POST', '/lab/login', { username: 'Tess', password: 'pw1' });
  assert.equal(login.status, 200);
  const T = login.json.token;
  assert.equal(login.json.admin, false);
  assert.equal((await call('GET', '/lab/me', null, T + 'x')).status, 401, 'a tampered token is refused');

  // progress: events and state, repeats replace
  let r = await call('POST', '/lab/log', { events: [{ id: 'e1', t: 1, type: 'answer', correct: false }, { id: 'e2', t: 2, type: 'expose' }], state: { settings: { weeklyMinutes: 90 }, pace: { level: 3 } } }, T);
  assert.equal(r.json.stored, 2);
  r = await call('POST', '/lab/log', { events: [{ id: 'e1', t: 1, type: 'answer', correct: true, override: true }] }, T);
  r = await call('GET', '/lab/log?after=0', null, T);
  assert.deepEqual(r.json.events.map((e) => e.id), ['e1', 'e2']);
  assert.equal(r.json.events[0].correct, true, '"I was right" reaches the server copy');
  r = await call('GET', '/lab/me', null, T);
  assert.equal(r.json.state.settings.weeklyMinutes, 90);
  assert.equal(r.json.username, 'Tess');

  // participant numbers in order, stable per student
  const p1 = (await call('POST', '/lab/participant', {}, T)).json.participant;
  assert.equal((await call('POST', '/lab/participant', {}, T)).json.participant, p1);

  // a class uploads calibration results
  const tokens = {};
  for (let i = 0; i < 6; i++) {
    tokens[i] = (await call('POST', '/lab/login', { username: `S${i}`, password: 'pw' })).json.token;
    const n = (await call('POST', '/lab/participant', {}, tokens[i])).json.participant;
    assert.equal(n, p1 + 1 + i);
    await call('POST', '/lab/log', { events: [], state: { summary: { pace: 100 } }, steps: [step('flashcards', 120 + i * 10, 0.5, 3, `s${i}a`), step('story', 90 + i * 5, 0.7, 4, `s${i}b`)] }, tokens[i]);
  }
  r = await call('GET', '/lab/blueprint', null, T);
  assert.equal(r.json.participants, 6);
  assert.ok(r.json.rows.every((x) => !/^s\d$/i.test(x.participant)), 'names are hidden');
  const bp = blueprintFromRows(r.json.rows);
  assert.equal(bp.story.source, 'survey');
  assert.equal(bp.duel.source, 'default');
  assert.ok(bp.story.kept > bp.flashcards.kept);

  // coach only
  assert.equal((await call('GET', '/lab/admin/students', null, T)).status, 403, 'a student can’t open the coach view');
  const coach = (await call('POST', '/lab/login', { username: 'kizuruki', password: 'coach' })).json;
  assert.equal(coach.admin, true);
  r = await call('GET', '/lab/admin/students', null, coach.token);
  assert.equal(r.status, 200);
  assert.equal(r.json.students.length, 8);
  assert.equal(r.json.results.length, 12);
  assert.equal(r.json.students.find((s) => s.username === 'tess').events, 2);
  r = await call('PUT', '/lab/admin/config', { defaultTarget: 150, capMinutes: 200, students: { S2: { target: 80 } } }, coach.token);
  assert.equal(r.status, 200);
  assert.equal((await call('GET', '/lab/me', null, tokens[2])).json.coach.target, 80);
  assert.equal((await call('GET', '/lab/me', null, T)).json.coach.target, 150);
  r = await call('GET', '/lab/admin/events?user=Tess', null, coach.token);
  assert.equal(r.json.events.length, 2);
  // redo one method: the attempt is set aside, its result dropped, and the student's stale copy can't undo it
  const loadedAt = (await call('GET', '/lab/me', null, tokens[0])).json.now;
  const cal = { protocol: 'quick', steps: [{ method: 'flashcards', civ: 'ostrevan', sessionId: 's0a', finishedAt: 1, doneDays: [] }, { method: 'story', civ: 'kaldrun', sessionId: 's0b', finishedAt: 1, doneDays: [] }, { method: 'tossups', civ: 'sennari', sessionId: null, finishedAt: null, doneDays: [] }] };
  await call('POST', '/lab/log', { state: { calibration: cal }, loadedAt }, tokens[0]);
  r = await call('POST', '/lab/admin/redo/S0', { step: 0 }, coach.token);
  assert.equal(r.json.civ, 'ombrel', 'redone on the one civilization not used yet');
  r = await call('GET', '/lab/admin/students', null, coach.token);
  assert.ok(!r.json.results.some((x) => x.sessionId === 's0a'), 'the set-aside result no longer counts');
  r = await call('POST', '/lab/log', { state: { calibration: cal, settings: { weeklyMinutes: 60 } }, loadedAt, steps: [step('flashcards', 999, 0.9, 5, 's0a')], stepsAll: true }, tokens[0]);
  assert.equal(r.json.stale, true);
  const me0 = (await call('GET', '/lab/me', null, tokens[0])).json;
  assert.equal(me0.state.calibration.steps[0].civ, 'ombrel', 'an open lab with the old copy can’t undo the redo');
  assert.equal(me0.state.settings.weeklyMinutes, 60, 'the rest of its state still saves');
  assert.ok(!(await call('GET', '/lab/admin/students', null, coach.token)).json.results.some((x) => x.sessionId === 's0a'));
  r = await call('POST', '/lab/log', { state: { ...me0.state }, loadedAt: me0.now + 1, steps: [step('story', 100, 0.7, 4, 's0b')], stepsAll: true }, tokens[0]);
  assert.equal(r.json.stale, false, 'after reloading, saves go through again');
  r = await call('POST', '/lab/admin/redo/S0', { step: 1 }, coach.token);
  assert.equal(r.json.civ, null, 'no civilization left: measured in real study');

  await call('POST', '/lab/log', { state: { calibration: { protocol: 'quick', steps: [] } } }, T);
  await call('POST', '/lab/admin/reset/Tess', {}, coach.token);
  assert.equal((await call('GET', '/lab/me', null, T)).json.state.calibration, null);
  await call('DELETE', '/lab/admin/student/S5', null, coach.token);
  assert.equal((await call('GET', '/lab/blueprint', null, T)).json.participants, 4, 'S5 removed, and both of S0’s attempts were set aside');
  assert.equal((await call('GET', '/lab/admin/students?key=secret')).status, 200, 'the admin key works too');

  // creating an account goes through the bowl sites
  r = await call('POST', '/lab/register', { username: 'Newbie', password: 'pw2' });
  assert.equal(r.status, 200);
  assert.equal(accounts.Newbie, 'pw2');
  assert.equal((await call('POST', '/lab/register', { username: 'Tess', password: 'x' })).status, 400);
});
