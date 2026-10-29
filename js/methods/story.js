// Read & recall. In calibration: read one chapter of the civilization's history, then recall what
// it said. With real questions: read short passages — each answer with all of its new clues (for
// History, a tossup's clues together, in order) — three at a time, then recall each clue.
// Misses come back once at the end of each page.
import { h, mount } from '../ui.js';
import { shuffle } from '../engine/util.js';
import { shownAnswer, answerOf } from '../content.js';
import { STOP, askClue, continueButton, chunk } from './common.js';

export const id = 'story';

async function read(ctx, el, button = "I've read it") {
  ctx.timer.setIdle(5 * 60000);   // reading without touching anything is still studying
  const next = continueButton(button);
  el.append(next.el);
  mount(ctx.stage, el);
  const r = await ctx.wait(next.promise);
  ctx.timer.setIdle(60000);
  return r;
}

async function recall(ctx, clues, label) {
  clues.forEach((c) => ctx.expose(c));
  const retry = [];
  for (const c of shuffle(clues)) {
    const r = await askClue(ctx, c, { format: 'story', label });
    if (r === STOP) return STOP;
    if (!r.correct) retry.push(c);
  }
  for (const c of retry) if ((await askClue(ctx, c, { format: 'story', label: 'Second try' })) === STOP) return STOP;
  return true;
}

// passages for real questions: [{ title, clues }]
function passages(clues) {
  const by = new Map();
  for (const c of clues) {
    const k = c.siteKey && c.pack.startsWith('hist') ? `${c.answer}|${c.siteKey}` : c.answer;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(c);
  }
  return [...by.values()].map((cs) => ({ title: shownAnswer(cs[0]), clues: cs.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })) }));
}

export async function run(ctx) {
  if (ctx.clues[0]?.pack === 'fantasy') {
    const civ = ctx.world.civs.find((c) => c.id === ctx.clues[0].civ);
    const chapters = civ.story.filter((ch) => ctx.clues.some((c) => c.chapter === ch.n));
    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      const el = h('article', { class: 'card story' },
        h('div', { class: 'card-top' }, h('span', { class: 'tag' }, civ.name), h('span', { class: 'muted' }, `Chapter ${i + 1} of ${chapters.length}`)),
        h('h2', {}, ch.title), ch.text.split(/\n\n+/).map((p) => h('p', {}, p)));
      if ((await read(ctx, el)) === STOP) return { finished: false };
      if ((await recall(ctx, ctx.clues.filter((c) => c.chapter === ch.n), `Recall · ${ch.title}`)) === STOP) return { finished: false };
    }
    return { finished: true };
  }
  const pages = chunk(passages(ctx.clues), 3);
  for (let i = 0; i < pages.length; i++) {
    const el = h('article', { class: 'card story' },
      h('div', { class: 'card-top' }, h('span', { class: 'tag' }, 'Read'), h('span', { class: 'muted' }, `Page ${i + 1} of ${pages.length}`)),
      pages[i].map((p) => h('section', { class: 'passage' }, h('h3', {}, p.title), h('p', {}, p.clues.map((c) => c.study).join(' ')))));
    if ((await read(ctx, el)) === STOP) return { finished: false };
    if ((await recall(ctx, pages[i].flatMap((p) => p.clues), `Recall · page ${i + 1}`)) === STOP) return { finished: false };
  }
  return { finished: true };
}

// After finishing: read again, then recall again.
export async function extra(ctx) {
  for (;;) {
    if (ctx.clues[0]?.pack === 'fantasy') {
      const civ = ctx.world.civs.find((c) => c.id === ctx.clues[0].civ);
      for (const ch of civ.story.filter((x) => ctx.clues.some((c) => c.chapter === x.n))) {
        if ((await read(ctx, h('article', { class: 'card story' }, h('h2', {}, ch.title), ch.text.split(/\n\n+/).map((p) => h('p', {}, p))))) === STOP) return;
        if ((await recall(ctx, ctx.clues.filter((c) => c.chapter === ch.n), 'Extra practice')) === STOP) return;
      }
    } else {
      for (const page of chunk(passages(shuffle(ctx.clues)), 3)) {
        if ((await read(ctx, h('article', { class: 'card story' }, page.map((p) => h('section', { class: 'passage' }, h('h3', {}, p.title), h('p', {}, p.clues.map((c) => c.study).join(' '))))))) === STOP) return;
        if ((await recall(ctx, page.flatMap((p) => p.clues), 'Extra practice')) === STOP) return;
      }
    }
  }
}
export { answerOf };
