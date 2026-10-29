// End-to-end run in a real browser (needs Playwright: npm i -D playwright && npx playwright install chromium).
//
//   node test/browser/e2e.mjs            (or: npm run test:browser)
//
// A bot student goes through a quick calibration (every method in it, plus check-ins a day and a
// week later by moving the clock), study sessions on History and Geography packs with each real-pack
// method, leaving a session halfway, and every server feature: logging in with a bowl-site account,
// bringing in Geography site history, sending answers back, uploading to the lab server and getting
// the school blueprint. The lab worker runs here on SQLite; the bowl-sites worker is a small stand-in
// with the same routes. Prints PASS/FAIL lines and exits non-zero on any failure.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import labWorker from '../../worker/lab-worker.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { play } = require('./bot.cjs');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let failures = 0;
const ok = (cond, msg) => { console.log(cond ? 'PASS' : 'FAIL', msg); if (!cond) failures++; };

// ---- static server for the site ----
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    const idx = path.join(p, 'index.html');
    if (fs.existsSync(idx)) { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(fs.readFileSync(idx)); }
    res.writeHead(404); return res.end();
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  res.end(fs.readFileSync(p));
});
await new Promise((r) => server.listen(0, r));
const SITE = `http://localhost:${server.address().port}/`;

// ---- lab worker on SQLite ----
function d1() {
  const db = new DatabaseSync(':memory:');
  class Stmt {
    constructor(sql, args = []) { this.sql = sql; this.args = args; }
    bind(...a) { return new Stmt(this.sql, a.map((v) => (v === undefined ? null : v))); }
    async all() { return { results: db.prepare(this.sql).all(...this.args) }; }
    async first() { return db.prepare(this.sql).get(...this.args) ?? null; }
    async run() { const r = db.prepare(this.sql).run(...this.args); return { success: true, meta: { changes: r.changes } }; }
  }
  return { db, prepare: (sql) => new Stmt(sql), batch: async (st) => { const o = []; for (const s of st) o.push(/^\s*SELECT/i.test(s.sql) ? await s.all() : await s.run()); return o; } };
}
const labEnv = { ADMIN_KEY: 'coach-key', DB: d1() };

// ---- stand-in for the bowl sites' worker: the routes the lab uses ----
const site = { users: { Tess: 'pw1234' }, events: [] };
const fakeMain = {
  async fetch(req) {
    const url = new URL(req.url);
    const J = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    if (url.pathname === '/auth/login') {
      const { username, password } = await req.json();
      return site.users[username] === password ? J({ success: true, username }) : J({ success: false, message: 'Invalid credentials' }, 401);
    }
    if (url.pathname === '/events' && req.method === 'POST') {
      const b = await req.json();
      for (const e of b.events || [b]) site.events.push({ ...e, ts: Date.now() });
      return J({ success: true, count: (b.events || [b]).length });
    }
    if (url.pathname.startsWith('/review-pool/')) {
      const user = decodeURIComponent(url.pathname.split('/')[2]).toLowerCase();
      const by = new Map();
      for (const e of site.events) if (e.username.toLowerCase() === user && e.site === 'geo') {
        const x = by.get(e.questionKey) || { t: null, w: 0 };
        if (e.correct) x.t = Math.max(x.t || 0, e.ts); else x.w++;
        by.set(e.questionKey, x);
      }
      return J({ site: 'geo', items: [...by.entries()].filter(([, x]) => x.t).map(([k, x]) => [k, x.t, x.w]) });
    }
    if (url.pathname.startsWith('/me/team/')) return J({ categories: [], assignments: [{ id: 1, title: 'Week 3 review', start_ts: Date.now() - 86400000, end_ts: Date.now() + 5 * 86400000, buckets: [{ metric: 'correct', required: 40, done: 10 }] }] });
    return J({ error: 'not found' }, 404);
  },
};
const routeTo = (worker, env) => async (r) => {
  const q = r.request();
  const res = await worker.fetch(new Request(q.url(), { method: q.method(), headers: q.headers(), body: ['GET', 'HEAD'].includes(q.method()) ? undefined : q.postData() }), env);
  await r.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
};

// ---- browser ----
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/status of 401/.test(m.text())) errors.push(m.text()); });   // 401: the wrong-password login, on purpose
page.on('dialog', (d) => d.accept());
await page.route('https://lab.test/**', routeTo(labWorker, labEnv));
await page.route('https://main.test/**', routeTo(fakeMain, {}));
// go to a page; if we're already on it, via Home so it renders afresh
const go = async (hash) => {
  if ((await page.evaluate(() => location.hash)) === hash) { await page.evaluate(() => { location.hash = '#/'; }); await page.waitForSelector('h1:has-text("Hi,")'); }
  await page.evaluate((h) => { location.hash = h; }, hash);
};
const store = (fn, arg) => page.evaluate(async ([src, arg]) => { const s = await import('/js/store.js'); const m = await import('/js/model.js'); return new Function('s', 'm', 'arg', `return (${src})(s, m, arg);`)(s, m, arg); }, [fn.toString(), arg]);
// move everything back `days`, as if that much time had passed
const timeTravel = (days) => store((s, m, days) => {
  const d = s.current(), ms = days * 86400000;
  for (const e of d.events) e.t -= ms;
  for (const st of d.calibration?.steps || []) if (st.finishedAt) { st.finishedAt -= ms; st.startedAt -= ms; }
  d.pace.since -= ms; s.touch(); s.saveNow();
}, days);

try {
  await page.goto(SITE);
  await page.fill('input[placeholder="Your name"]', 'Tess');
  await page.click('button[type=submit]');
  await page.waitForSelector('h1:has-text("Hi, Tess")');
  ok(await page.isVisible('text=No results yet'), 'home: no fake "best method" before any results');
  await store((s) => { Object.assign(s.current().settings, { msPerChar: 2, packs: ['geo-africa-mediterranean', 'hist-ancient'], mainUrl: 'https://main.test', labUrl: 'https://lab.test' }); s.saveNow(); });

  // ---- calibration ----
  await go('#/calibrate');
  await page.click('button:has-text("Start the quick survey")');
  await page.waitForSelector('table.grid');
  const steps = await store((s) => s.current().calibration.steps.map((x) => x.method));
  ok(steps.length === 3 && new Set(steps).size === 3, `quick survey: three different methods (${steps.join(', ')})`);
  for (let i = 0; i < steps.length; i++) {
    await go(`#/calibrate/step/${i}`);
    await page.waitForSelector('section.intro');
    await play(page, { accuracy: 0.85, enjoy: 2 + i, buzzAt: 9, until: async () => !!(await page.$('h2:has-text(" done")')) });
  }
  const r0 = await store((s, m) => m.stepResults().map((r) => ({ m: r.method, n: r.introduced, imm: r.immediate.n })));
  ok(r0.length === 3 && r0.every((r) => r.n === 24 && r.imm === 24), 'each method taught 24 clues and the test asked all 24');
  ok(await store((s, m) => m.checkinsDue().length) === 0, 'no check-ins on the same day');
  for (const [days, label] of [[1, 'day 1'], [6, 'day 7']]) {
    await timeTravel(days);
    const due = await store((s, m) => m.checkinsDue().map((x) => x.index));
    ok(due.length === 3, `${label}: a check-in is open for every method`);
    for (const i of due) {
      await go(`#/checkin/${i}`);
      await page.waitForSelector('section.intro');
      await play(page, { accuracy: label === 'day 1' ? 0.7 : 0.6, until: async () => !!(await page.$('h2:has-text("Check-in done")')) });
    }
  }
  const r1 = await store((s, m) => m.stepResults().map((r) => ({ c: Object.keys(r.checkins).join(','), t1: r.checkins[1]?.t, t7: r.checkins[7]?.t, kept: r.keptAtH, skipped: s.current().calibration.steps.find((x) => x.sessionId === r.sessionId).doneDays })));
  ok(r1.every((r) => r.c === '1,7' && r.t1 === 1 && r.t7 === 7), 'check-ins recorded at days 1 and 7');
  ok(r1.every((r) => r.skipped.includes(3)), 'the missed day-3 check-in counts as skipped, not offered later');
  ok(r1.every((r) => r.kept > 0 && r.kept < 1), 'a 30-day retention estimate for every method');
  await go('#/results');
  await page.waitForSelector('svg.chart');
  ok(true, 'results page draws the retention chart');

  // ---- study sessions on real packs ----
  const realMethods = ['flashcards', 'tossups', 'matching'];
  for (const [k, method] of realMethods.entries()) {
    await go('#/study');
    await page.waitForSelector('.method-btn');
    await page.fill('.num-input', '6'); await page.dispatchEvent('.num-input', 'input');
    await page.click(`.method-btn:has-text("${method[0].toUpperCase() + method.slice(1)}")`);
    await page.click('button:has-text("Start")');
    let more = false;
    await play(page, { accuracy: 0.85, buzzAt: 12, until: async () => {
      if (await page.$('h2:has-text("Planned clues done.")')) { await page.click(k === 0 && !more ? 'button:has-text("Keep going")' : 'button:has-text("Finish")'); more = true; return false; }
      return !!(await page.$('h2:has-text("Session done")'));
    } });
    await timeTravel(2);
  }
  const sess = await store((s) => s.current().events.filter((e) => e.type === 'session' && e.kind === 'study').map((e) => ({ m: e.method, n: e.introduced, planned: e.planned, engage: e.engageRatio, reviews: e.reviews })));
  ok(sess.length === 3 && sess.every((x, i) => x.m === realMethods[i]), 'three study sessions, one per real-pack method');
  ok(sess[0].n > sess[0].planned && sess[0].engage > 1, `"keep going" counts as extra engagement (${sess[0].n} of ${sess[0].planned} planned, ×${sess[0].engage.toFixed(2)})`);
  ok(sess[1].reviews + sess[2].reviews > 0, 'later sessions start with due reviews');
  const fantasyReviewed = await store((s) => s.current().events.some((e) => e.phase === 'review' && !String(e.clue).includes(':')));
  ok(!fantasyReviewed, 'calibration clues never show up in ordinary reviews');
  const mix = await store((s) => { const ids = s.current().events.filter((e) => e.type === 'expose' && e.clue.includes(':')).map((e) => e.clue.split(':')[0]); return [...new Set(ids)]; });
  ok(mix.includes('geo') && mix.includes('hist'), `new clues come from both Geography and History packs (${mix.join(', ')})`);

  // ---- leaving mid-session ----
  await go('#/study');
  await page.waitForSelector('.method-btn');
  await page.click('button:has-text("Start")');
  await page.waitForSelector('.stage .card');
  const before = await store((s) => s.current().events.length);
  await page.click('#nav a:has-text("Results")');
  await page.waitForSelector('h1:has-text("Results")');
  await page.keyboard.press('Enter'); await page.keyboard.press('Space'); await page.waitForTimeout(400);
  ok(await store((s) => s.current().events.length) === before, 'after leaving a session nothing more is logged from it');

  // ---- bowl-site account ----
  const africa = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/packs/geo-africa-mediterranean.json'), 'utf8'));
  const keys = africa.clues.slice(-4).map((c) => c[0].slice(4));
  for (const k of keys) site.events.push({ username: 'Tess', site: 'geo', questionKey: k, correct: true, ts: Date.now() - 3 * 86400000 });
  site.events.push({ username: 'Tess', site: 'geo', questionKey: keys[0], correct: false, ts: Date.now() - 4 * 86400000 });
  await go('#/settings');
  await page.fill('input[autocomplete=username]', 'Tess');
  await page.fill('input[autocomplete=current-password]', 'nope');
  await page.click('button:has-text("Log in")');
  await page.waitForSelector('form .no:has-text("Invalid")');
  await page.fill('input[autocomplete=current-password]', 'pw1234');
  await page.click('button:has-text("Log in")');
  await page.waitForSelector('text=Logged in as');
  ok(true, 'logs in with the bowl-site account (and refuses a wrong password)');
  await go('#/study');
  await page.click('button:has-text("Bring in my Geography site history")');
  await page.waitForSelector('text=/\\d+ new of \\d+/');
  const imported = await store((s, m, keys) => keys.map((k) => m.memory()['geo:' + k]?.card?.stability ?? null), keys);
  ok(imported.every((x) => x > 0) && imported[0] < imported[1], 'site history counts as learned; the question missed on the site is weaker');
  const sentBefore = site.events.filter((e) => e.mode === 'lab').length;
  await page.fill('.num-input', '5'); await page.dispatchEvent('.num-input', 'input');
  await page.click('.method-btn:has-text("Flashcards")');
  await page.click('button:has-text("Start")');
  await play(page, { accuracy: 0.85, until: async () => !!(await page.$('h2:has-text("Session done")')) });
  const sent = site.events.filter((e) => e.mode === 'lab').slice(sentBefore);
  ok(sent.length > 0 && sent.every((e) => e.site === 'geo' && e.questionKey && !e.questionKey.includes(':')), `Geography answers go to the site under their site question ids (${sent.length})`);
  ok(new Set(sent.map((e) => e.questionKey)).size === sent.length, 'one answer per question per day goes to the site');
  await page.click('#nav a:has-text("Study")');
  await page.click('button:has-text("Bring in my Geography site history")');
  await page.waitForSelector('text=/\\d+ new of \\d+/');
  ok(/(^|\D)0 new of/.test(await page.textContent('#app')), "the lab's own answers aren't brought back in as site history");
  await go('#/plan');
  await page.waitForSelector('text=Week 3 review');
  ok(true, 'plan page shows team assignments from the bowl sites');

  // ---- lab server ----
  for (let i = 0; i < 5; i++) {
    await labWorker.fetch(new Request('https://lab.test/lab/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ participant: `classmate-${i}-xyz`, name: `C${i}`, steps: ['flashcards', 'tossups', 'story', 'matching'].map((m, j) => ({ sessionId: `c${i}${j}`, method: m, activeHours: 0.4, introduced: 60, immediate: { n: 60, k: 50, p: 0.83 }, checkins: { 7: { n: 60, k: 40, t: 7 } }, lastCheckin: 7, learnedPerHour: [150, 110, 90, 130][j], keptAtH: [0.45, 0.6, 0.7, 0.4][j], engagement: { enjoy: [3, 5, 4, 2][j] } })) }) }), labEnv);
  }
  await go('#/settings');
  await page.click('button:has-text("Upload my results")');
  await page.waitForSelector('text=/Uploaded \\d+ calibration results/');
  const uploaded = labEnv.DB.db.prepare("SELECT COUNT(*) AS n FROM lab_steps WHERE participant NOT LIKE 'classmate%'").get().n;
  ok(uploaded === 3, 'uploads the three calibration results');
  await page.click('button:has-text("Get the school blueprint")');
  await page.waitForSelector('text=/now your starting point|students so far/');
  const bp = await store((s) => s.current().blueprint && Object.fromEntries(Object.entries(s.current().blueprint).map(([k, v]) => [k, v.source])));
  ok(bp && Object.values(bp).filter((x) => x === 'survey').length >= 3, `blueprint from the class survey (${JSON.stringify(bp)})`);
  await go('#/teacher');
  await page.fill('input[placeholder=ADMIN_KEY]', 'coach-key');
  await page.click('button:has-text("Load")');
  await page.waitForSelector('h2:has-text("Students (6)")');
  ok(true, 'coach view lists all six students');
} catch (err) {
  console.error(err);
  failures++;
} finally {
  ok(errors.length === 0, `no errors in the page${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
  await browser.close();
  server.close();
}
console.log(failures ? `${failures} failed` : 'all passed');
process.exit(failures ? 1 : 0);
