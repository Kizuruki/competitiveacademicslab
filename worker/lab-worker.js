// Study Lab server: a small Cloudflare Worker with one D1 database (binding DB) and a secret
// ADMIN_KEY. It only stores what students upload from the lab for the school survey; logins,
// answers and assignments stay on the bowl sites' worker.
//
//   POST   /lab/upload                 a student's calibration results and study log (append-only)
//   GET    /lab/blueprint              everyone's calibration results, for building the blueprint
//   GET    /lab/export?key=…           everything, for the coach (X-Admin-Key header also works)
//   GET    /lab/events?key=…&participant=…&after=…   one student's raw events, 2000 at a time
//                                     (pass the returned `next` as `after` for the next page)
//   DELETE /lab/participant/<id>?key=… remove one student's data
//
// Deploy: wrangler d1 create study-lab; put the binding in wrangler.toml (see README);
// wrangler secret put ADMIN_KEY; wrangler deploy.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
};
const J = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const str = (v, n) => (v === null || v === undefined ? null : String(v).slice(0, n));
const int = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);
const METHODS = ['flashcards', 'tossups', 'story', 'matching'];

let ready = false;
async function ensure(env) {
  if (ready) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS lab_participants (
      participant TEXT PRIMARY KEY, participant_index INTEGER, name TEXT, username TEXT, protocol TEXT,
      pace INTEGER, settings TEXT, created INTEGER, updated INTEGER)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS lab_steps (
      participant TEXT NOT NULL, session_id TEXT NOT NULL, method TEXT, civ TEXT, data TEXT, updated INTEGER,
      PRIMARY KEY (participant, session_id))`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS lab_events (
      participant TEXT NOT NULL, id TEXT NOT NULL, t INTEGER, type TEXT, data TEXT,
      PRIMARY KEY (participant, id))`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS lab_events_t ON lab_events (participant, t)`),
  ]);
  ready = true;
}

// A step as the lab computes it (metrics.stepMetrics), kept to the fields the blueprint and the
// coach view use, plus the raw counts.
function cleanStep(s) {
  const num = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
  const checkins = {};
  for (const [d, c] of Object.entries(s.checkins || {}).slice(0, 8)) checkins[int(d)] = { n: int(c.n), k: int(c.k), t: num(c.t) };
  const e = s.engagement || {};
  return {
    sessionId: str(s.sessionId, 40), method: METHODS.includes(s.method) ? s.method : null, civ: str(s.civ, 40),
    finishedAt: int(s.finishedAt), activeHours: num(s.activeHours), introduced: int(s.introduced),
    immediate: { n: int(s.immediate?.n), k: int(s.immediate?.k), p: num(s.immediate?.p) },
    checkins, lastCheckin: int(s.lastCheckin), horizonDays: int(s.horizonDays),
    learnedPerHour: num(s.learnedPerHour), keptAtH: num(s.keptAtH), durablePerHour: num(s.durablePerHour),
    fitP0: num(s.fitP0), fitS: num(s.fitS),
    engagement: { enjoy: int(e.enjoy), demand: int(e.demand), extraMin: num(e.extraMin), stoppedEarly: !!e.stoppedEarly, finished: !!e.finished },
  };
}

// Device ids stay private: the blueprint only needs to tell participants apart.
async function shortId(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf).slice(0, 6)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    const admin = () => !!env.ADMIN_KEY && (request.headers.get('X-Admin-Key') || url.searchParams.get('key')) === env.ADMIN_KEY;
    try {
      await ensure(env);

      if (url.pathname === '/lab/upload' && request.method === 'POST') {
        const b = await request.json();
        const participant = str(b.participant, 64);
        if (!participant || participant.length < 8) return J({ error: 'participant id required' }, 400);
        const now = Date.now();
        const stmts = [env.DB.prepare(
          `INSERT INTO lab_participants (participant, participant_index, name, username, protocol, pace, settings, created, updated)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (participant) DO UPDATE SET
             participant_index = COALESCE(excluded.participant_index, participant_index), name = COALESCE(excluded.name, name),
             username = COALESCE(excluded.username, username), protocol = COALESCE(excluded.protocol, protocol),
             pace = COALESCE(excluded.pace, pace), settings = CASE WHEN excluded.settings = '{}' THEN settings ELSE excluded.settings END,
             updated = excluded.updated`
        ).bind(participant, int(b.participantIndex), str(b.name, 60), str(b.username, 40), str(b.protocol, 10), int(b.pace), JSON.stringify(b.settings || {}).slice(0, 1000), now, now)];
        let steps = 0;
        for (const s of (Array.isArray(b.steps) ? b.steps : []).slice(0, 20)) {
          const c = cleanStep(s);
          if (!c.sessionId || !c.method) continue;
          stmts.push(env.DB.prepare(
            `INSERT INTO lab_steps (participant, session_id, method, civ, data, updated) VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT (participant, session_id) DO UPDATE SET method = excluded.method, civ = excluded.civ, data = excluded.data, updated = excluded.updated`
          ).bind(participant, c.sessionId, c.method, c.civ, JSON.stringify(c), now));
          steps++;
        }
        let events = 0;
        for (const e of (Array.isArray(b.events) ? b.events : []).slice(0, 1000)) {
          const id = str(e && e.id, 40);
          if (!id) continue;
          const data = JSON.stringify(e);
          if (data.length > 4000) continue;
          stmts.push(env.DB.prepare(`INSERT OR IGNORE INTO lab_events (participant, id, t, type, data) VALUES (?, ?, ?, ?, ?)`).bind(participant, id, int(e.t), str(e.type, 20), data));
          events++;
        }
        for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
        return J({ success: true, steps, events });
      }

      if (url.pathname === '/lab/blueprint' && request.method === 'GET') {
        const { results } = await env.DB.prepare(`SELECT participant, method, data, updated FROM lab_steps ORDER BY updated ASC`).all();
        // latest result per participant and method
        const latest = new Map();
        for (const r of results) latest.set(`${r.participant}|${r.method}`, r);
        const rows = [];
        for (const r of latest.values()) {
          const d = JSON.parse(r.data);
          if (d.learnedPerHour === null && d.keptAtH === null) continue;
          rows.push({ participant: await shortId(r.participant), method: r.method, learnedPerHour: d.learnedPerHour, keptAtH: d.keptAtH, lastCheckin: d.lastCheckin, engagement: d.engagement });
        }
        return J({ participants: new Set(rows.map((r) => r.participant)).size, rows });
      }

      if (url.pathname === '/lab/export' && request.method === 'GET') {
        if (!admin()) return J({ error: 'admin key required' }, 401);
        const people = (await env.DB.prepare(`SELECT * FROM lab_participants ORDER BY updated DESC`).all()).results;
        const steps = (await env.DB.prepare(`SELECT participant, data, updated FROM lab_steps ORDER BY updated ASC`).all()).results;
        const counts = (await env.DB.prepare(`SELECT participant, COUNT(*) AS n, MAX(t) AS last FROM lab_events GROUP BY participant`).all()).results;
        const byP = new Map(counts.map((c) => [c.participant, c]));
        return J({
          participants: people.map((p) => ({ participant: p.participant, participantIndex: p.participant_index, name: p.name, username: p.username, protocol: p.protocol, pace: p.pace, settings: JSON.parse(p.settings || '{}'), created: p.created, updated: p.updated, events: byP.get(p.participant)?.n || 0, lastEvent: byP.get(p.participant)?.last || null })),
          steps: steps.map((s) => ({ participant: s.participant, updated: s.updated, ...JSON.parse(s.data) })),
        });
      }

      if (url.pathname === '/lab/events' && request.method === 'GET') {
        if (!admin()) return J({ error: 'admin key required' }, 401);
        const participant = str(url.searchParams.get('participant'), 64);
        const after = int(url.searchParams.get('after')) ?? 0;
        const { results } = await env.DB.prepare(`SELECT rowid AS r, data FROM lab_events WHERE participant = ? AND rowid > ? ORDER BY rowid ASC LIMIT 2000`).bind(participant, after).all();
        return J({ events: results.map((r) => JSON.parse(r.data)), next: results.length === 2000 ? results[results.length - 1].r : null });
      }

      const del = url.pathname.match(/^\/lab\/participant\/([^/]+)$/);
      if (del && request.method === 'DELETE') {
        if (!admin()) return J({ error: 'admin key required' }, 401);
        const p = decodeURIComponent(del[1]);
        await env.DB.batch(['lab_events', 'lab_steps', 'lab_participants'].map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE participant = ?`).bind(p)));
        return J({ success: true });
      }

      return J({ error: 'not found' }, 404);
    } catch (err) {
      return J({ error: String(err && err.message || err) }, 500);
    }
  },
};
