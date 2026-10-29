// End-to-end run in a real browser (needs Playwright: npm i -D playwright && npx playwright install chromium).
//
//   node test/browser/e2e.mjs            (or: npm run test:browser)
//
// A bot student logs in with a bowl-site account and goes through a quick calibration (leaving one
// method partway and coming back), check-ins a day and a week later (by moving the clock), study
// sessions with every one of the eleven methods, leaving a session and continuing it, and the sync
// with the bowl sites: mastered, missed, spaced review, history brought in. Then the coach logs in,
// and the student opens the lab on a second device. The lab worker runs here on SQLite; the bowl
// sites' worker is a stand-in with the same routes. Prints PASS/FAIL lines; exits non-zero on failure.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import labWorker from '../../worker/lab-worker.js';
import { MAIN_URL, LAB_URL } from '../../js/config.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { play } = require('./bot.cjs');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DAY = 86400000;
let failures = 0;
const ok = (cond, msg) => { console.log(cond ? 'PASS' : 'FAIL', msg); if (!cond) failures++; };

// ---- the site ----
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  let p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  res.end(fs.readFileSync(p));
});
await new Promise((r) => server.listen(0, r));
const SITE = `http://localhost:${server.address().port}/`;

// ---- stand-in for the bowl sites' worker ----
const site = { users: { Tess: 'pw1234', kizuruki: 'coachpw' }, events: [], stats: [], blobs: {}, mastered: {}, spaced: [] };
const J = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
const fakeMain = {
  async fetch(req) {
    const url = new URL(req.url), parts = url.pathname.split('/').map(decodeURIComponent);
    if (req.method === 'OPTIONS') return J({});
    const body = ['GET', 'HEAD'].includes(req.method) ? null : await req.json().catch(() => null);
    if (url.pathname === '/auth/login') return site.users[body.username] === body.password ? J({ success: true, username: body.username }) : J({ success: false, message: 'Invalid credentials' }, 401);
    if (url.pathname === '/auth/register') { if (site.users[body.username]) return J({ success: false, message: 'Username already exists' }, 400); site.users[body.username] = body.password; return J({ success: true }); }
    if (url.pathname === '/events') { for (const e of body.events || [body]) site.events.push({ ...e, ts: Date.now() }); return J({ success: true }); }
    if (parts[1] === 'geo-stats') { site.stats.push(body); return J({ success: true }); }
    if (parts[1] === 'user-blob') { const k = `${parts[2].toLowerCase()}/${parts[3]}`; if (req.method === 'PUT') { site.blobs[k] = body; return J({ success: true }); } return J({ data: site.blobs[k] ?? null }); }
    if (parts[1] === 'mastered') { if (req.method === 'PUT') { site.mastered[parts[2]] = body; return J({ success: true }); } return J(site.mastered[parts[2]] || []); }
    if (parts[1] === 'spaced') { site.spaced.push({ user: parts[2], ...body }); return J({ success: true }); }
    if (parts[1] === 'review-pool') {
      const user = parts[2].toLowerCase(), want = url.searchParams.get('site') === 'geo' ? 'geo' : 'history';
      const by = new Map();
      for (const e of site.events) if (e.username.toLowerCase() === user && e.site === want) { const x = by.get(e.questionKey) || { t: null, w: 0 }; if (e.correct) x.t = Math.max(x.t || 0, e.ts); else x.w++; by.set(e.questionKey, x); }
      return J({ site: want, items: [...by.entries()].filter(([, x]) => x.t).map(([k, x]) => [k, x.t, x.w]) });
    }
    if (parts[1] === 'me') return J({ categories: [], assignments: [{ id: 1, title: 'Week 3 review', start_ts: Date.now() - DAY, end_ts: Date.now() + 5 * DAY, buckets: [{ metric: 'correct', required: 40, done: 10 }] }] });
    return J({ error: 'not found' }, 404);
  },
};

// ---- the lab worker on SQLite; its own calls to the bowl sites go to the stand-in ----
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
const labEnv = { ADMIN_KEY: 'coach-key', DB: d1(), MAIN_URL };
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => { const u = String(input?.url || input); return u.startsWith(MAIN_URL) ? fakeMain.fetch(new Request(input, init)) : realFetch(input, init); };
const routeTo = (worker, env) => async (r) => {
  const q = r.request();
  const res = await worker.fetch(new Request(q.url(), { method: q.method(), headers: q.headers(), body: ['GET', 'HEAD'].includes(q.method()) ? undefined : q.postData() }), env);
  await r.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
};

const browser = await chromium.launch();
async function newPage() {
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 40[13]/.test(m.text())) page.errors.push(m.text()); });   // 401/403: wrong password and the coach check, on purpose
  page.on('dialog', (d) => d.accept());
  await page.route(`${LAB_URL}/**`, routeTo(labWorker, labEnv));
  await page.route(`${MAIN_URL}/**`, routeTo(fakeMain, {}));
  return page;
}
const page = await newPage();
// go to a page; if we're already on it, via Home so it renders afresh
const go = async (hash) => {
  if ((await page.evaluate(() => location.hash)) === hash) { await page.evaluate(() => { location.hash = '#/'; }); await page.waitForSelector('h1:has-text("Hi,")'); }
  await page.evaluate((h) => { location.hash = h; }, hash);
};
const inPage = (fn, arg) => page.evaluate(async ([src, arg]) => {
  const s = await import('/js/store.js'), m = await import('/js/model.js'), c = await import('/js/content.js'), ss = await import('/js/sitesync.js');
  return new Function('s', 'm', 'c', 'ss', 'arg', `return (${src})(s, m, c, ss, arg);`)(s, m, c, ss, arg);
}, [fn.toString(), arg]);
// as if `days` had passed: move every event and date back
const timeTravel = (days) => inPage((s, m, c, ss, days) => {
  const d = s.current(), ms = days * 86400000;
  for (const e of d.events) { e.t -= ms; if (e.spreadDue) e.spreadDue -= ms; }
  for (const st of d.calibration?.steps || []) { if (st.finishedAt) st.finishedAt -= ms; if (st.startedAt) st.startedAt -= ms; }
  d.pace.since -= ms; d.sync.siteSent = {}; s.touch();
}, days);

try {
  // a little Geography site history from before the lab
  const africa = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/packs/geo-africa-mediterranean.json'), 'utf8'));
  const oldKeys = africa.clues.slice(-60).map((c) => c[0].slice(4));
  for (const [i, k] of oldKeys.entries()) site.events.push({ username: 'Tess', site: 'geo', questionKey: k, correct: true, ts: Date.now() - (40 - (i % 30)) * DAY });
  site.blobs['tess/geo-missed'] = [africa.clues[africa.clues.length - 61][0].slice(4)];

  await page.goto(SITE);
  await page.fill('input[autocomplete=username]', 'Tess');
  await page.fill('input[type=password]', 'nope');
  await page.click('button:has-text("Log in")');
  await page.waitForSelector('.no:has-text("Invalid")');
  await page.waitForSelector('button:has-text("Log in"):not([disabled])');
  await page.fill('input[type=password]', 'pw1234');
  await page.click('button:has-text("Log in")');
  await page.waitForSelector('h1:has-text("Hi, Tess")', { timeout: 60000 });
  ok(true, 'logs in with the bowl-site account (and refuses a wrong password)');
  ok(!(await page.isVisible('#nav a:has-text("Coach")')), 'a student has no Coach page');
  await inPage((s) => { Object.assign(s.current().settings, { msPerChar: 2, lightningSeconds: 6, packs: ['geo-africa-mediterranean', 'hist-ancient'] }); s.save(); });
  for (let i = 0; i < 100 && !(await inPage((s) => s.current().sync.lastSiteImport)); i++) await page.waitForTimeout(200);
  const imp = await inPage((s, m) => { const mem = m.realMemory(); const e = Object.entries(mem).filter(([id]) => id.startsWith('geo:')); return { n: e.length, dueNow: m.due().length, missed: e.filter(([, x]) => x.lastResult === false).length }; });
  ok(imp.n === 61 && imp.missed === 1, `site history brought in at login: 60 learned, 1 missed (${JSON.stringify(imp)})`);
  ok(imp.dueNow <= 26, `a backlog comes back spread out, not all at once (${imp.dueNow} due today)`);

  await go('#/settings');
  await page.waitForSelector('h1:has-text("Settings")');
  ok(!(await page.isVisible('text=Research settings')) && !(await page.isVisible('text=Lab server')), 'students don’t see research settings or server addresses');

  // ---- calibration, leaving the first method partway ----
  await go('#/calibrate');
  await page.click('button:has-text("Start the quick survey")');
  await page.waitForSelector('table.grid');
  const steps = await inPage((s) => s.current().calibration.steps.map((x) => x.method));
  const part = await inPage((s) => s.current().calibration.participant);
  ok(steps.length === 3 && part === 0, `quick survey: three methods, participant number from the server (${steps.join(', ')}; #${part})`);
  await go('#/calibrate/step/0');
  await page.waitForSelector('section.intro');
  let n = 0;
  await play(page, { accuracy: 0.85, buzzAt: 9, until: async () => ++n > 25 });
  await page.click('#nav a:has-text("Home")');
  await page.waitForSelector('h1:has-text("Hi, Tess")');
  const paused = await inPage((s, m) => ({ step: s.current().calibration.steps[0], open: m.unfinished().map((x) => x.kind), pauses: s.current().events.filter((e) => e.type === 'session-pause').length }));
  ok(paused.pauses === 1 && paused.step.activeMs > 0 && paused.open.includes('calibration'), 'leaving a method partway records the time so far and leaves it in progress');
  const before = await inPage((s, m, c, ss, sid) => s.current().events.filter((e) => e.type === 'expose' && e.sessionId === sid).length, paused.step.sessionId);
  await go('#/calibrate/step/0');
  await page.waitForSelector('section.intro:has-text("Picking up where you left off")');
  for (let i = 0; i < steps.length; i++) {
    if (i) { await go(`#/calibrate/step/${i}`); await page.waitForSelector('section.intro'); }
    await play(page, { accuracy: 0.85, enjoy: 2 + i, buzzAt: 9, until: async () => !!(await page.$('h2:has-text(" done")')) });
  }
  const r0 = await inPage((s, m) => m.stepResults().map((r) => ({ m: r.method, n: r.introduced, imm: r.immediate.n, ms: r.activeHours * 3600000 })));
  ok(r0.length === 3 && r0.every((r) => r.n === 24 && r.imm === 24), `each method taught 24 clues and the test asked all 24 (first one resumed after ${before})`);
  for (const [days, label] of [[1, 'day 1'], [6, 'day 7']]) {
    await timeTravel(days);
    const due = await inPage((s, m) => m.checkinsDue().map((x) => x.index));
    ok(due.length === 3, `${label}: a check-in is open for every method`);
    for (const i of due) {
      await go(`#/checkin/${i}`);
      await page.waitForSelector('section.intro');
      await play(page, { accuracy: label === 'day 1' ? 0.7 : 0.6, until: async () => !!(await page.$('h2:has-text("Check-in done")')) });
    }
  }
  const r1 = await inPage((s, m) => m.stepResults().map((r) => ({ c: Object.keys(r.checkins).join(','), kept: r.keptAtH })));
  ok(r1.every((r) => r.c === '1,7' && r.kept > 0 && r.kept < 1), 'check-ins at days 1 and 7 and a 30-day estimate for every method');

  // ---- real study with every method ----
  const METHODS = ['flashcards', 'tossups', 'story', 'matching', 'guess', 'hints', 'choice', 'lightning', 'confidence', 'connect', 'duel'];
  const LABELS = { flashcards: 'Flashcards', tossups: 'Tossups', story: 'Read & recall', matching: 'Matching', guess: 'Guess first', hints: 'Letter hints', choice: 'Quiz show', lightning: 'Lightning round', confidence: 'Sure or not?', connect: 'Connect it', duel: 'Tossup duel' };
  for (const [k, method] of METHODS.entries()) {
    await go('#/study');
    await page.waitForSelector('.method-btn');
    // enough minutes for the reviews that are due plus a few new clues
    const dueNow = await inPage((s, m) => m.due(s.current().settings.packs).length);
    await page.fill('.num-input', String(Math.ceil((dueNow * 15) / 60) + 4)); await page.dispatchEvent('.num-input', 'input');
    await page.click(`.method-btn:has(strong:text-is("${LABELS[method]}")), .method-btn:has(strong:text-is("${LABELS[method]} ★"))`);
    await page.click('button:has-text("Start")');
    await play(page, { accuracy: 0.8, buzzAt: 12, until: async () => {
      if (await page.$('h2:has-text("Planned clues done.")')) { await page.click('button:has-text("Finish")'); return false; }
      return !!(await page.$('text=on the History and Geography sites too')) || !!(await page.$('text=answers will be sent next time'));
    } });
    if (k % 3 === 2) await timeTravel(1);
  }
  const sess = await inPage((s) => s.current().events.filter((e) => e.type === 'session' && e.kind === 'study').map((e) => ({ m: e.method, n: e.introduced, f: e.finished })));
  ok(sess.length === METHODS.length && METHODS.every((m) => sess.some((x) => x.m === m && x.n > 0 && x.f)), `every method ran a full session with new clues (${sess.map((x) => `${x.m}:${x.n}`).join(' ')})`);
  ok(!(await inPage((s) => s.current().events.some((e) => e.phase === 'review' && !String(e.clue).includes(':')))), 'calibration clues never show up in ordinary reviews');
  const noted = await inPage((s) => s.current().events.filter((e) => e.type === 'note').length);
  ok(noted > 0, `Connect it saves your notes (${noted})`);

  // ---- leaving a study session, then continuing it; another one ended early ----
  await go('#/study');
  await page.waitForSelector('.method-btn');
  await page.fill('.num-input', '8'); await page.dispatchEvent('.num-input', 'input');
  await page.click('.method-btn:has(strong:text-matches("^Flashcards"))');
  await page.click('button:has-text("Start")');
  n = 0;
  await play(page, { accuracy: 0.9, until: async () => ++n > 8 });
  await page.click('#nav a:has-text("Plan")');
  await page.waitForSelector('h1:has-text("This week")');
  const open1 = await inPage((s, m) => m.unfinished().filter((x) => x.kind === 'study').map((x) => ({ answers: x.answers.length, ms: x.activeMs })));
  ok(open1.length === 1 && open1[0].answers > 0 && open1[0].ms > 0, `the session left partway is saved as unfinished, with its answers (${JSON.stringify(open1)})`);
  await go('#/study');
  await page.click('button:has-text("Continue it")');
  await play(page, { accuracy: 0.9, until: async () => {
    if (await page.$('h2:has-text("Planned clues done.")')) { await page.click('button:has-text("Finish")'); return false; }
    return !!(await page.$('h2:has-text("Session done")'));
  } });
  const resumed = await inPage((s) => s.current().events.filter((e) => e.type === 'session' && e.kind === 'study' && e.resumed).map((e) => ({ planned: e.planned, n: e.introduced })));
  ok(resumed.length === 1 && resumed[0].n === resumed[0].planned, `continuing it finishes the same planned clues (${JSON.stringify(resumed)})`);
  await go('#/study');
  await page.click('button:has-text("Start")');
  n = 0; await play(page, { accuracy: 0.9, until: async () => ++n > 5 });
  await page.click('#nav a:has-text("Home")');
  await go('#/study');
  await page.click('button:has-text("End it here")');
  const ended = await inPage((s, m) => ({ open: m.unfinished().length, last: s.current().events.filter((e) => e.type === 'session').pop() }));
  ok(ended.open === 0 && ended.last.status === 'ended-early' && ended.last.stoppedEarly, 'ending it there logs it as stopped early, with what was done');

  // ---- the bowl sites ----
  await inPage((s, m, c, ss) => ss.flush());
  const geoSent = site.events.filter((e) => e.mode === 'lab' && e.site === 'geo');
  const histSent = site.events.filter((e) => e.mode === 'lab' && e.site === 'history');
  ok(geoSent.length > 0 && geoSent.every((e) => !e.questionKey.includes(':')), `Geography answers go to the site under its question ids (${geoSent.length})`);
  ok(histSent.every((e) => /^Q[123]\|/.test(e.questionKey) && e.quarter >= 1), `History answers go under the site's own question keys (${histSent.length})`);
  ok(site.stats.length === geoSent.length, 'and into the Geography site’s stats');
  // controlled check of the practice-mode rules on one History tossup and one Geography question
  const rules = await inPage(async (s, m, c, ss) => {
    const multi = [...new Set(c.allClues('hist-ancient').map((x) => x.siteKey))].map((k) => c.cluesOfSite(k)).find((cs) => cs.length >= 2 && cs.every((x) => !m.memory()[x.id]));
    const geo = c.allClues('geo-africa-mediterranean').find((x) => !m.memory()[x.id]);
    const say = (clue, correct, t) => { const ev = s.log({ type: 'answer', clue: clue.id, answer: clue.answer, pack: clue.pack, correct, ms: 3000, phase: 'review', format: 'question', t }); ss.onAnswer(ev); return ev; };
    const now = Date.now();
    say(multi[0], true, now - 3 * 86400000);                       // one clue of the tossup right…
    say(geo, false, now - 3 * 86400000);                           // …the Geography question missed
    await ss.flush();
    const after1 = { key: multi[0].siteKey, geo: geo.siteKey };
    say(multi[1], false, now - 2 * 86400000);                      // another clue of the tossup missed
    await ss.flush();
    for (const x of multi) say(x, true, now - 3600000);            // later: every clue right
    say(geo, true, now - 3600000);                                 // and the Geography question right
    await ss.flush();
    return { ...after1, n: multi.length };
  });
  const user = 'tess';
  ok(site.spaced.some((x) => x.quarter && x.questionText) && (site.mastered.Tess || []).includes(rules.key), 'a History tossup is mastered on the site once all its clues are right, and goes to its spaced queue after being missed');
  const histMissed = site.blobs[`${user}/history-missed`] || [];
  const geoMissed = site.blobs[`${user}/geo-missed`] || [];
  ok(!geoMissed.includes(rules.geo) && !histMissed.some((mq) => mq.question && mq.question.toLowerCase().replace(/\s+/g, ' ').startsWith(rules.key.slice(3, 60))), 'missed, then right on a later day: off both sites’ Missed lists');
  const wrongs = site.events.filter((e) => e.questionKey === rules.key);
  ok(wrongs.some((e) => !e.correct) && wrongs.filter((e) => e.correct).length === 1, 'the site gets one miss and one mastery for that tossup, not one per clue');
  ok(histMissed.every((mq) => (mq.quarter === 3 ? mq.category && Array.isArray(mq.questions) : mq.question && mq.answer && mq.quarter)), 'History missed entries are in the site’s own format');

  await go('#/plan');
  await page.waitForSelector('text=Week 3 review');
  ok(true, 'the plan shows team assignments from the bowl sites');

  // ---- the coach ----
  const coach = await newPage();
  await coach.goto(SITE);
  await coach.fill('input[autocomplete=username]', 'kizuruki');
  await coach.fill('input[type=password]', 'coachpw');
  await coach.click('button:has-text("Log in")');
  await coach.waitForSelector('#nav a:has-text("Coach")');
  await coach.evaluate(() => { location.hash = '#/coach'; });
  await coach.waitForSelector('h2:has-text("Students")');
  ok(await coach.isVisible('td:has-text("Tess")'), 'the coach sees every student');
  await coach.fill('label:has-text("Class target") input', '120');
  await coach.click('button:has-text("Save targets")');
  await coach.waitForSelector('text=Targets saved');
  await coach.evaluate(() => { location.hash = '#/settings'; });
  ok(await coach.isVisible('text=Research settings'), 'the coach sees the research settings');
  ok(coach.errors.length === 0, `no errors on the coach's page${coach.errors.length ? ': ' + coach.errors.slice(0, 3).join(' | ') : ''}`);

  // ---- the same student on another device ----
  await inPage((s) => s.saveNow());
  const counts = await inPage((s) => ({ events: s.current().events.length, steps: s.current().calibration.steps.filter((x) => x.finishedAt).length }));
  const phone = await newPage();
  await phone.goto(SITE);
  await phone.fill('input[autocomplete=username]', 'Tess');
  await phone.fill('input[type=password]', 'pw1234');
  const reqs = [];
  phone.on('request', (r) => { if (/\/lab\//.test(r.url())) reqs.push(`${r.method()} ${new URL(r.url()).pathname}`); });
  phone.on('response', (r) => { if (/\/lab\//.test(r.url())) reqs.push(`<- ${r.status()} ${new URL(r.url()).pathname}`); });
  await phone.click('button:has-text("Log in")');
  try { await phone.waitForSelector('h1:has-text("Hi, Tess")', { timeout: 60000 }); }
  catch (err) { console.log('phone stuck:', reqs.join(' | '), '\n', (await phone.textContent('#app')).slice(0, 200)); throw err; }
  const there = await phone.evaluate(async () => { const s = await import('/js/store.js'); return { events: s.current().events.length, steps: s.current().calibration.steps.filter((x) => x.finishedAt).length, target: s.current().coach.target }; });
  ok(there.events >= counts.events && there.steps === 3, `progress is online: another device sees the same log and calibration (${there.events} events)`);
  ok(there.target === 120, 'and the coach’s target');

  // ---- the coach redoes one method (say Tess was interrupted before its test) ----
  const before0 = await inPage((s) => ({ ...s.current().calibration.steps[0] }));
  await coach.evaluate(() => { location.hash = '#/coach'; });
  await coach.waitForSelector('h2:has-text("Students")');
  await coach.selectOption('tr:has-text("Tess") select', '0');
  await coach.click('tr:has-text("Tess") button:has-text("Redo one")');
  await coach.waitForSelector('text=Ready for them to redo');
  const kept = (await labEnv.DB.prepare('SELECT session_id FROM lab_results WHERE username = ?').bind('tess').all()).results.map((x) => x.session_id);
  ok(!kept.includes(before0.sessionId) && kept.length === 2, `the set-aside attempt no longer counts in the results (${kept.length} left)`);
  await inPage((s) => s.saveNow());   // the first device still has the old copy open and saves it
  const after0 = await inPage((s, m) => ({ step: s.current().calibration.steps[0], next: m.nextStep()?.method, results: m.stepResults().length }));
  ok(after0.step.civ !== before0.civ && !after0.step.finishedAt && after0.next === before0.method && after0.results === 2, `an open lab with the old copy picks up the redo instead of undoing it (${before0.civ} → ${after0.step.civ})`);
  await phone.reload();
  await phone.waitForSelector('h1:has-text("Hi, Tess")');
  ok(await phone.isVisible('text=Next: '), 'the other device shows the method ready to redo');
  ok(phone.errors.length === 0 && coach.errors.length === 0, 'no errors on the second device or the coach’s page');
} catch (err) {
  console.error(err);
  failures++;
} finally {
  ok(page.errors.length === 0, `no errors in the page${page.errors.length ? ': ' + page.errors.slice(0, 3).join(' | ') : ''}`);
  await browser.close();
  server.close();
}
console.log(failures ? `${failures} failed` : 'all passed');
process.exit(failures ? 1 : 0);
