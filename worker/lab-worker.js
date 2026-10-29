// Study Lab server: keeps each student's progress online, tied to their History Bowl / Geography
// Bowl account, and gives the coach (kizuruki) the class's results.
//
// Bindings: DB (a D1 database). Secrets: ADMIN_KEY (the coach's key; also signs logins unless
// TOKEN_SECRET is set). Optional vars: MAIN_URL (the bowl sites' worker), ADMIN_USERS (comma list,
// default "kizuruki"). wrangler.toml turns on global_fetch_strictly_public so this worker can reach
// the bowl sites' worker on the same workers.dev subdomain.
//
// Students
//   POST /lab/login     { username, password }   checked against the bowl sites' accounts → { token }
//   POST /lab/register  { username, password }   creates a bowl-site account, then logs in
//   GET  /lab/me                                  progress state, coach targets, participant number
//   GET  /lab/log?after=<n>                       the event log, 5000 at a time (pass `next` back)
//   POST /lab/log       { events, state, steps }  append events (repeats ignored), save state
//   POST /lab/participant                         this student's calibration participant number
//   GET  /lab/blueprint                           everyone's calibration results (names hidden)
// Coach (token of an admin user, or X-Admin-Key / ?key=)
//   GET    /lab/admin/students                    everyone: state summary, results, event counts
//   GET    /lab/admin/events?user=…&after=…       one student's log
//   PUT    /lab/admin/config  { defaultTarget, capMinutes, students: { user: { target, capMinutes } } }
//   POST   /lab/admin/reset/<user>                clear a student's calibration
//   POST   /lab/admin/redo/<user>  { step }       redo one method of it (see engine/calibration.js)
//   DELETE /lab/admin/student/<user>              remove a student's lab data
// Every request needs `Authorization: Bearer <token>` except login, register and OPTIONS.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key, Authorization',
};
const DEFAULT_MAIN = 'https://patient-base-c952.javalutionization.workers.dev';
import { redoStep, CIVS } from '../js/engine/calibration.js';

const J = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const str = (v, n) => (v === null || v === undefined ? null : String(v).slice(0, n));
const int = (v) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);
const lower = (u) => String(u || '').trim().toLowerCase();
const parse = (t, d) => { try { return JSON.parse(t); } catch (_) { return d; } };
const TOKEN_DAYS = 90;

let ready = false;
async function ensure(env) {
  if (ready) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS lab_users (
      username TEXT PRIMARY KEY, display TEXT, participant INTEGER, state TEXT, created INTEGER, updated INTEGER)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS lab_log (
      username TEXT NOT NULL, id TEXT NOT NULL, t INTEGER, type TEXT, data TEXT, PRIMARY KEY (username, id))`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS lab_results (
      username TEXT NOT NULL, session_id TEXT NOT NULL, method TEXT, data TEXT, updated INTEGER, PRIMARY KEY (username, session_id))`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS lab_config (key TEXT PRIMARY KEY, value TEXT)`),
  ]);
  ready = true;
}

// ---- tokens: user.expiry.signature (HMAC-SHA256) ----
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)));
}
const secretOf = (env) => env.TOKEN_SECRET || env.ADMIN_KEY || '';
async function makeToken(env, user) {
  const body = `${encodeURIComponent(user)}.${Date.now() + TOKEN_DAYS * 86400000}`;
  return `${body}.${await hmac(secretOf(env), body)}`;
}
async function readToken(env, request) {
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get('Authorization') || '');
  if (!m || !secretOf(env)) return null;
  const parts = m[1].split('.');
  if (parts.length !== 3) return null;
  const body = `${parts[0]}.${parts[1]}`;
  if ((await hmac(secretOf(env), body)) !== parts[2] || Number(parts[1]) < Date.now()) return null;
  return decodeURIComponent(parts[0]);
}
const admins = (env) => new Set(String(env.ADMIN_USERS || 'kizuruki').split(',').map(lower).filter(Boolean));

async function config(env) {
  const row = await env.DB.prepare(`SELECT value FROM lab_config WHERE key = 'coach'`).first();
  return parse(row?.value, null) || { defaultTarget: 0, capMinutes: 0, students: {} };
}
async function hashed(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf).slice(0, 6)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// A calibration step as the lab computes it (metrics.stepMetrics), kept to plain fields.
function cleanStep(s) {
  const num = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
  const checkins = {};
  for (const [d, c] of Object.entries(s.checkins || {}).slice(0, 8)) checkins[int(d)] = { n: int(c?.n), k: int(c?.k), t: num(c?.t) };
  const e = s.engagement || {};
  return {
    sessionId: str(s.sessionId, 40), method: str(s.method, 20), civ: str(s.civ, 40),
    finishedAt: int(s.finishedAt), activeHours: num(s.activeHours), introduced: int(s.introduced),
    immediate: { n: int(s.immediate?.n), k: int(s.immediate?.k), p: num(s.immediate?.p) },
    checkins, lastCheckin: int(s.lastCheckin), horizonDays: int(s.horizonDays),
    learnedPerHour: num(s.learnedPerHour), keptAtH: num(s.keptAtH), durablePerHour: num(s.durablePerHour),
    engagement: { enjoy: int(e.enjoy), demand: int(e.demand), extraMin: num(e.extraMin), stoppedEarly: !!e.stoppedEarly, finished: !!e.finished },
  };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      await ensure(env);
      const main = String(env.MAIN_URL || DEFAULT_MAIN).replace(/\/+$/, '');

      // ---- accounts: the bowl sites' worker checks the password ----
      if ((path === '/lab/login' || path === '/lab/register') && request.method === 'POST') {
        if (!secretOf(env)) return J({ error: 'The lab server has no ADMIN_KEY secret yet.' }, 500);
        const { username, password } = await request.json();
        if (path === '/lab/register') {
          const r = await fetch(`${main}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
          const body = await r.json().catch(() => ({}));
          if (!body.success) return J({ error: body.message || 'Could not create the account.' }, 400);
        }
        const r = await fetch(`${main}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
        const body = await r.json().catch(() => ({}));
        if (!body.success) return J({ error: body.message || 'Wrong username or password.' }, 401);
        const display = String(body.username || username);
        const user = lower(display);
        const now = Date.now();
        await env.DB.prepare(`INSERT INTO lab_users (username, display, state, created, updated) VALUES (?, ?, '{}', ?, ?)
          ON CONFLICT (username) DO UPDATE SET display = excluded.display`).bind(user, display, now, now).run();
        return J({ token: await makeToken(env, user), username: display, admin: admins(env).has(user) });
      }

      const keyOK = !!env.ADMIN_KEY && (request.headers.get('X-Admin-Key') || url.searchParams.get('key')) === env.ADMIN_KEY;
      const user = await readToken(env, request);
      const isAdmin = keyOK || (user && admins(env).has(user));

      if (path.startsWith('/lab/admin/')) {
        if (!isAdmin) return J({ error: 'Coach only.' }, 403);
        if (path === '/lab/admin/students' && request.method === 'GET') {
          const users = (await env.DB.prepare(`SELECT username, display, participant, state, created, updated FROM lab_users ORDER BY updated DESC`).all()).results;
          const results = (await env.DB.prepare(`SELECT username, data, updated FROM lab_results ORDER BY updated ASC`).all()).results;
          const counts = (await env.DB.prepare(`SELECT username, COUNT(*) AS n, MAX(t) AS last FROM lab_log GROUP BY username`).all()).results;
          const byU = new Map(counts.map((c) => [c.username, c]));
          return J({
            config: await config(env),
            students: users.map((u) => {
              const st = parse(u.state, {});
              return { username: u.username, display: u.display, participant: u.participant, created: u.created, updated: u.updated, events: byU.get(u.username)?.n || 0, lastEvent: byU.get(u.username)?.last || null,
                pace: st.pace?.level ?? null, weeklyMinutes: st.settings?.weeklyMinutes ?? null, calibration: st.calibration ? { protocol: st.calibration.protocol, steps: (st.calibration.steps || []).map((s) => ({ method: s.method, finishedAt: s.finishedAt || null })) } : null, summary: st.summary || null };
            }),
            results: results.map((r) => ({ username: r.username, updated: r.updated, ...parse(r.data, {}) })),
          });
        }
        if (path === '/lab/admin/events' && request.method === 'GET') {
          const who = lower(url.searchParams.get('user'));
          const after = int(url.searchParams.get('after')) ?? 0;
          const { results } = await env.DB.prepare(`SELECT rowid AS r, data FROM lab_log WHERE username = ? AND rowid > ? ORDER BY rowid LIMIT 5000`).bind(who, after).all();
          return J({ events: results.map((r) => parse(r.data, {})), next: results.length === 5000 ? results[results.length - 1].r : null });
        }
        if (path === '/lab/admin/config' && request.method === 'PUT') {
          const b = await request.json();
          const students = {};
          for (const [u, v] of Object.entries(b.students || {}).slice(0, 2000)) students[lower(u)] = { target: int(v?.target) || 0, capMinutes: int(v?.capMinutes) || 0 };
          const value = { defaultTarget: int(b.defaultTarget) || 0, capMinutes: int(b.capMinutes) || 0, students };
          await env.DB.prepare(`INSERT INTO lab_config (key, value) VALUES ('coach', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`).bind(JSON.stringify(value)).run();
          return J({ success: true, config: value });
        }
        let m = path.match(/^\/lab\/admin\/(reset|redo)\/([^/]+)$/);
        if (m && request.method === 'POST') {
          const who = lower(decodeURIComponent(m[2]));
          const row = await env.DB.prepare(`SELECT state FROM lab_users WHERE username = ?`).bind(who).first();
          if (!row) return J({ error: 'No such student.' }, 404);
          const st = parse(row.state, {});
          const now = Date.now();
          let out = { success: true };
          const drop = [];
          if (m[1] === 'reset') {
            for (const s of st.calibration?.steps || []) { if (s.sessionId) drop.push(s.sessionId); }
            st.calibration = null;
          } else {
            const { step } = await request.json();
            if (!st.calibration?.steps?.[step]) return J({ error: 'No such method in their calibration.' }, 400);
            if (st.calibration.steps[step].sessionId) drop.push(st.calibration.steps[step].sessionId);
            out = { success: true, ...redoStep(st.calibration, Number(step), CIVS, 'coach', now) };
          }
          // the student's open lab may still have the old copy: resetAt tells the server to keep this one
          st.resetAt = now;
          await env.DB.batch([
            env.DB.prepare(`UPDATE lab_users SET state = ?, updated = ? WHERE username = ?`).bind(JSON.stringify(st), now, who),
            ...drop.map((sid) => env.DB.prepare(`DELETE FROM lab_results WHERE username = ? AND session_id = ?`).bind(who, sid)),
          ]);
          return J(out);
        }
        m = path.match(/^\/lab\/admin\/student\/([^/]+)$/);
        if (m && request.method === 'DELETE') {
          const who = lower(decodeURIComponent(m[1]));
          await env.DB.batch(['lab_log', 'lab_results', 'lab_users'].map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE username = ?`).bind(who)));
          return J({ success: true });
        }
        return J({ error: 'not found' }, 404);
      }

      if (!user) return J({ error: 'Please log in again.' }, 401);

      if (path === '/lab/me' && request.method === 'GET') {
        const row = await env.DB.prepare(`SELECT display, participant, state FROM lab_users WHERE username = ?`).bind(user).first();
        const cfg = await config(env);
        const mine = cfg.students[user] || {};
        const n = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM lab_log WHERE username = ?`).bind(user).first()).n;
        return J({ username: row?.display || user, admin: admins(env).has(user), participant: row?.participant ?? null, state: parse(row?.state, {}), events: n, now: Date.now(),
          coach: { target: mine.target || cfg.defaultTarget || 0, capMinutes: mine.capMinutes || cfg.capMinutes || 0 } });
      }

      if (path === '/lab/log' && request.method === 'GET') {
        const after = int(url.searchParams.get('after')) ?? 0;
        const { results } = await env.DB.prepare(`SELECT rowid AS r, data FROM lab_log WHERE username = ? AND rowid > ? ORDER BY rowid LIMIT 5000`).bind(user, after).all();
        return J({ events: results.map((r) => parse(r.data, {})), next: results.length === 5000 ? results[results.length - 1].r : null });
      }

      if (path === '/lab/log' && request.method === 'POST') {
        const b = await request.json();
        const now = Date.now();
        const stmts = [];
        let stored = 0;
        for (const e of (Array.isArray(b.events) ? b.events : []).slice(0, 2000)) {
          const id = str(e && e.id, 40);
          const data = JSON.stringify(e);
          if (!id || data.length > 8000) continue;
          // the same id again replaces it (an answer later corrected with "I was right")
          stmts.push(env.DB.prepare(`INSERT INTO lab_log (username, id, t, type, data) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (username, id) DO UPDATE SET data = excluded.data, t = excluded.t`).bind(user, id, int(e.t), str(e.type, 24), data));
          stored++;
        }
        let stale = false;
        if (b.state && typeof b.state === 'object') {
          // a coach reset or redo since this copy was loaded: keep the coach's calibration (and
          // ignore this copy's calibration results, which may include the attempt set aside)
          const cur = parse((await env.DB.prepare(`SELECT state FROM lab_users WHERE username = ?`).bind(user).first())?.state, {});
          if (cur.resetAt && !(Number(b.loadedAt) > cur.resetAt)) { stale = true; b.state.calibration = cur.calibration ?? null; b.state.resetAt = cur.resetAt; }
          else if (cur.resetAt) b.state.resetAt = cur.resetAt;
          const text = JSON.stringify(b.state);
          if (text.length > 400000) return J({ error: 'State too large.' }, 413);
          stmts.push(env.DB.prepare(`UPDATE lab_users SET state = ?, updated = ? WHERE username = ?`).bind(text, now, user));
        }
        if (stale) b.steps = [];
        if (b.stepsAll && Array.isArray(b.steps) && !stale) {
          // the full list of this student's results: drop the ones set aside
          const keep = new Set(b.steps.map((s) => str(s && s.sessionId, 40)).filter(Boolean));
          const old = (await env.DB.prepare(`SELECT session_id FROM lab_results WHERE username = ?`).bind(user).all()).results;
          for (const r of old) if (!keep.has(r.session_id)) stmts.push(env.DB.prepare(`DELETE FROM lab_results WHERE username = ? AND session_id = ?`).bind(user, r.session_id));
        }
        for (const s of (Array.isArray(b.steps) ? b.steps : []).slice(0, 30)) {
          const c = cleanStep(s);
          if (!c.sessionId || !c.method) continue;
          stmts.push(env.DB.prepare(`INSERT INTO lab_results (username, session_id, method, data, updated) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (username, session_id) DO UPDATE SET method = excluded.method, data = excluded.data, updated = excluded.updated`).bind(user, c.sessionId, c.method, JSON.stringify(c), now));
        }
        for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
        return J({ success: true, stored, stale });
      }

      // participant numbers are handed out in order, so a class covers every method set
      if (path === '/lab/participant' && request.method === 'POST') {
        const row = await env.DB.prepare(`SELECT participant FROM lab_users WHERE username = ?`).bind(user).first();
        if (row && row.participant !== null && row.participant !== undefined) return J({ participant: row.participant });
        const got = await env.DB.prepare(`INSERT INTO lab_config (key, value) VALUES ('nextParticipant', '1')
          ON CONFLICT (key) DO UPDATE SET value = CAST(value AS INTEGER) + 1 RETURNING value`).first();
        const next = Number(got.value) - 1;
        await env.DB.prepare(`UPDATE lab_users SET participant = ? WHERE username = ? AND participant IS NULL`).bind(next, user).run();
        const final = await env.DB.prepare(`SELECT participant FROM lab_users WHERE username = ?`).bind(user).first();
        return J({ participant: final.participant });
      }

      if (path === '/lab/blueprint' && request.method === 'GET') {
        const { results } = await env.DB.prepare(`SELECT username, method, data FROM lab_results ORDER BY updated ASC`).all();
        const latest = new Map();
        for (const r of results) latest.set(`${r.username}|${r.method}`, r);
        const rows = [];
        for (const r of latest.values()) {
          const d = parse(r.data, {});
          if (d.learnedPerHour === null && d.keptAtH === null) continue;
          rows.push({ participant: await hashed(r.username), method: r.method, learnedPerHour: d.learnedPerHour, keptAtH: d.keptAtH, lastCheckin: d.lastCheckin, engagement: d.engagement });
        }
        return J({ participants: new Set(rows.map((r) => r.participant)).size, rows });
      }

      return J({ error: 'not found' }, 404);
    } catch (err) {
      return J({ error: String((err && err.message) || err) }, 500);
    }
  },
};
