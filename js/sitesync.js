// The lab works like each site's own practice mode, and keeps the sites up to date:
//   right → the question is mastered (and goes into the site's spaced review pool)
//   wrong → it goes to Missed Questions
//   missed, then right on a later day → mastered, taken off Missed Questions, and (History) added
//                                       to the site's spaced repetition queue
// Only the first answer to a clue each day counts, like the lab's own memory: answering again
// right after seeing it isn't knowing it. Picking from choices (matching, quiz show) doesn't count
// on the sites — only answers you produced yourself do.
//
// Geography questions are single clues, so a lab answer is a site answer. A History tossup is
// split into several clues in the lab; it counts as mastered on the History site once you've gotten
// every one of its clues right, and as missed as soon as you miss one.
//
// Changes are worked out from the log and sent in batches (every few seconds and when a session
// ends), using the sites' own routes: POST /events and /geo-stats, the mastered list
// (/mastered/<user>), the missed lists (/user-blob/<user>/geo-missed and history-missed) and
// /spaced/<user>. If the site is open in another tab at the same time, its next save can overwrite
// what the lab added to the missed or mastered list.
import * as store from './store.js';
import { MAIN_URL } from './config.js';
import { clue as clueById, packOf, cluesOfSite, siteFile } from './content.js';
import { RECOGNITION } from './engine/calibration.js';
import { dayKey, DAY_MS } from './engine/util.js';

const latest = new Map();   // clue → { day, ev }: its latest first-of-the-day answer that counts on a site
let built = null, dirty = new Set(), timer = null, running = null;

const counts = (e) => e.type === 'answer' && String(e.clue).includes(':') && ['study', 'review'].includes(e.phase)
  && !e.pretest && !e.cue && e.credit !== 'unread' && e.credit !== 'read-before' && !RECOGNITION.has(e.format);
const siteOf = (c) => packOf(c.pack)?.site;
const keyOf = (c) => `${siteOf(c)}|${c.siteKey}`;

function rebuild() {
  const d = store.current();
  latest.clear();
  for (const e of d.events) if (counts(e)) note(e);
  dirty = new Set(d.sync.siteDirty || []);
  built = d.id;
}
function note(e) {
  const day = dayKey(e.t);
  const cur = latest.get(e.clue);
  if (cur && cur.day >= day) return false;   // not the first answer that day
  latest.set(e.clue, { day, ev: e });
  return true;
}

// Called for every answer the lab logs (and again when "I was right" changes one).
export function onAnswer(ev) {
  const d = store.current();
  if (!d || !d.profile.username) return;
  if (built !== d.id) rebuild();
  if (!counts(ev)) return;
  const c = clueById(ev.clue);
  if (!c || !c.siteKey || !['geo', 'history'].includes(siteOf(c))) return;
  const cur = latest.get(ev.clue);
  if (!(cur && cur.ev.id === ev.id) && !note(ev)) return;
  dirty.add(keyOf(c));
  d.sync.siteDirty = [...dirty];
  clearTimeout(timer);
  timer = setTimeout(() => flush().catch(() => {}), 8000);
}

const api = async (path, opts = {}) => {
  const res = await fetch(`${MAIN_URL}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json().catch(() => ({}));
};

// Send what changed. Safe to call any time; a call while one is running waits for it.
export function flush() {
  if (running) return running.then(() => (dirty.size ? flush() : undefined));
  const d = store.current();
  if (!d || !d.profile.username || !dirty.size) return Promise.resolve();
  if (built !== d.id) rebuild();
  running = sendDirty(d).finally(() => { running = null; });
  return running;
}

async function sendDirty(d) {
  const user = d.profile.username, u = encodeURIComponent(user);
  const todo = [...dirty];
  dirty = new Set(); d.sync.siteDirty = [];
  const sent = d.sync.siteSent || (d.sync.siteSent = {});
  const events = [], stats = [], geoMissed = { add: new Set(), remove: new Set() };
  const hist = { missedAdd: new Map(), missedRemove: new Set(), mastered: new Set(), spaced: [] };
  try {
    for (const k of todo) {
      const [site, key] = [k.slice(0, k.indexOf('|')), k.slice(k.indexOf('|') + 1)];
      if (site === 'geo') {
        const c = clueById(`geo:${key}`), r = c && latest.get(c.id);
        if (!r) continue;
        const kind = r.ev.correct ? 'right' : 'wrong', tag = `geo|${key}|${r.day}`;
        if (sent[tag] !== kind) {
          events.push({ username: user, site: 'geo', mode: 'lab', category: c.category, subcategory: c.sub || null, questionKey: key, correct: !!r.ev.correct, responseMs: r.ev.ms ?? null });
          stats.push({ category: c.category, subcategory: c.sub || 'Unknown', mode: 'lab', correct: !!r.ev.correct });
          sent[tag] = kind;
        }
        (r.ev.correct ? geoMissed.remove : geoMissed.add).add(key);
      } else if (site === 'history') {
        const clues = cluesOfSite(key);
        if (!clues.length) continue;
        const res = clues.map((c) => latest.get(c.id));
        const known = res.filter(Boolean);
        if (!known.length) continue;
        const day = known.reduce((m, r) => (r.day > m ? r.day : m), known[0].day);
        const c0 = clues[0];
        const sf = (await siteFile(c0.pack)).q[key];
        if (!sf) continue;
        const ev = (correct) => ({ username: user, site: 'history', mode: 'lab', quarter: c0.quarter, part: c0.quarter === 2 ? 'tossup' : null, category: c0.siteCategory || 'Unknown', questionKey: key, correct, qset: c0.set || null, responseMs: null });
        if (known.some((r) => !r.ev.correct)) {
          if (!sent[`hist|${key}|${day}|wrong`]) { events.push(ev(false)); sent[`hist|${key}|${day}|wrong`] = 1; }
          hist.missedAdd.set(key, sf);
        } else if (known.length === clues.length) {
          // every clue right: mastered
          if (!sent[`hist|${key}|${day}|right`]) { events.push(ev(true)); sent[`hist|${key}|${day}|right`] = 1; }
          hist.mastered.add(key);
          hist.missedRemove.add(key);
          hist.spaced.push({ key, sf });
        }
      }
    }
    // the sites' answer log (assignments, spaced review pool, mastery leaderboard)
    for (let i = 0; i < events.length; i += 50) await api('/events', { method: 'POST', body: JSON.stringify({ events: events.slice(i, i + 50) }) });
    await Promise.all(stats.map((s) => api(`/geo-stats/${u}`, { method: 'POST', body: JSON.stringify(s) }).catch(() => {})));
    // Geography missed list
    if (geoMissed.add.size || geoMissed.remove.size) {
      const cur = (await api(`/user-blob/${u}/geo-missed`)).data;
      const list = Array.isArray(cur) ? cur.filter((x) => typeof x === 'string') : [];
      const next = [...list.filter((id) => !geoMissed.remove.has(id)), ...[...geoMissed.add].filter((id) => !list.includes(id))];
      if (JSON.stringify(next) !== JSON.stringify(list)) await api(`/user-blob/${u}/geo-missed`, { method: 'PUT', body: JSON.stringify(next) });
    }
    // History mastered list (the site keeps it as one list) and missed list
    if (hist.mastered.size) {
      const cur = await api(`/mastered/${u}`);
      const list = Array.isArray(cur) ? cur : [];
      const add = [...hist.mastered].filter((k) => !list.includes(k));
      if (add.length) await api(`/mastered/${u}`, { method: 'PUT', body: JSON.stringify([...list, ...add]) });
    }
    if (hist.missedAdd.size || hist.missedRemove.size) {
      const cur = (await api(`/user-blob/${u}/history-missed`)).data;
      let list = Array.isArray(cur) ? cur : [];
      const before = JSON.stringify(list);
      const catName = (sf) => sf.cat.split('|').slice(1).join('|');
      const sameEntry = (mq, sf) => (sf.qr === 3 ? mq.quarter === 3 && mq.category === catName(sf) : mq.question === sf.t);
      const wasMissed = new Set(hist.spaced.filter(({ sf }) => list.some((mq) => sameEntry(mq, sf))).map(({ key }) => key));
      // a quarter-3 entry is the whole category: it leaves only when none of its questions is missed
      const catClear = async (key, sf) => {
        const cat = (await siteFileFor(key)).cats[sf.cat];
        return !cat || cat.questions.every((q) => historyState(siteKeyOf(3, `${cat.category} :: ${q.question}`)) !== 'missed');
      };
      const removeSf = new Map(hist.spaced.map(({ key, sf }) => [key, sf]));
      const keep = [];
      for (const mq of list) {
        let drop = false;
        for (const key of hist.missedRemove) {
          const sf = removeSf.get(key);
          if (sf && sameEntry(mq, sf) && (sf.qr !== 3 || (await catClear(key, sf)))) { drop = true; break; }
        }
        if (!drop) keep.push(mq);
      }
      list = keep;
      for (const [key, sf] of hist.missedAdd) {
        if (list.some((mq) => sameEntry(mq, sf))) continue;
        if (sf.qr === 3) {
          const cat = (await siteFileFor(key)).cats[sf.cat];
          if (cat) list.push({ quarter: 3, category: cat.category, prompt: cat.prompt, questionSetCategory: cat.questionSetCategory || 'Unknown', questions: cat.questions, timestamp: Date.now() });
        } else {
          const entry = { question: sf.t, answer: sf.a, quarter: sf.qr, category: sf.c, timestamp: Date.now() };
          if (sf.qr === 2) entry.type = 'tossup';
          list.push(entry);
        }
      }
      if (JSON.stringify(list) !== before) await api(`/user-blob/${u}/history-missed`, { method: 'PUT', body: JSON.stringify(list) });
      // missed, then right: into the site's spaced repetition queue (as the site does from Missed Questions)
      for (const { key, sf } of hist.spaced) {
        if (!wasMissed.has(key)) continue;
        await api(`/spaced/${u}`, { method: 'POST', body: JSON.stringify({ quarter: sf.qr, questionText: sf.t, answer: Array.isArray(sf.a) ? sf.a[0] : sf.a, category: sf.c }) }).catch(() => {});
      }
    }
  } catch (err) {
    for (const k of todo) dirty.add(k);   // try again next time
    d.sync.siteDirty = [...dirty];
    throw err;
  } finally {
    const keep = [dayKey(Date.now()), dayKey(Date.now() - DAY_MS)];
    for (const k of Object.keys(sent)) if (!keep.some((day) => k.includes(`|${day}`))) delete sent[k];
    d.sync.lastSiteSync = Date.now();
    store.save();
  }
}
// the History site's key for a question (makeMasteredKey in its index.html)
export const siteKeyOf = (quarter, text) => `Q${quarter}|${String(text || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 100)}`;
async function siteFileFor(key) {
  const c = cluesOfSite(key)[0];
  return c ? siteFile(c.pack) : { q: {}, cats: {} };
}

// For the Study page: what the sites will show for a History question right now.
export function historyState(key) {
  if (built !== store.current()?.id) rebuild();
  const res = cluesOfSite(key).map((c) => latest.get(c.id));
  if (res.some((r) => r && !r.ev.correct)) return 'missed';
  if (res.length && res.every((r) => r && r.ev.correct)) return 'mastered';
  return res.some(Boolean) ? 'partial' : 'new';
}
export const pendingCount = () => dirty.size;
