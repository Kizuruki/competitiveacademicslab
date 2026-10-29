// Story: read one chapter of the civilization's history, then recall what it said: each of the
// chapter's clues is asked once, and misses come back once at the end of the chapter.
import { h, mount } from '../ui.js';
import { shuffle } from '../engine/util.js';
import { STOP, askClue, continueButton } from './common.js';

export const id = 'story';
export const needsStory = true;

async function readChapter(ctx, civ, ch, i, n) {
  ctx.timer.setIdle(5 * 60000);   // reading without touching anything is still studying
  const next = continueButton("I've read it");
  mount(ctx.stage, h('article', { class: 'card story' },
    h('div', { class: 'card-top' }, h('span', { class: 'tag' }, civ.name), h('span', { class: 'muted' }, `Chapter ${i + 1} of ${n}`)),
    h('h2', {}, ch.title),
    ch.text.split(/\n\n+/).map((p) => h('p', {}, p)),
    next.el));
  const r = await ctx.wait(next.promise);
  ctx.timer.setIdle(60000);
  return r;
}

export async function run(ctx) {
  const civ = ctx.world.civs.find((c) => c.id === ctx.clues[0].civ);
  const chapters = civ.story.filter((ch) => ctx.clues.some((c) => c.chapter === ch.n));
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    if ((await readChapter(ctx, civ, ch, i, chapters.length)) === STOP) return { finished: false };
    const mine = ctx.clues.filter((c) => c.chapter === ch.n);
    mine.forEach((c) => ctx.expose(c));
    const retry = [];
    for (const c of shuffle(mine)) {
      const r = await askClue(ctx, c, { format: 'story', label: `Recall · ${ch.title}` });
      if (r === STOP) return { finished: false };
      if (!r.correct) retry.push(c);
    }
    for (const c of retry) if ((await askClue(ctx, c, { format: 'story', label: 'Second try' })) === STOP) return { finished: false };
  }
  return { finished: true };
}

// After finishing: reread any chapter, then recall its clues again.
export async function extra(ctx) {
  const civ = ctx.world.civs.find((c) => c.id === ctx.clues[0].civ);
  const chapters = civ.story.filter((ch) => ctx.clues.some((c) => c.chapter === ch.n));
  for (;;) for (const ch of chapters) {
    if ((await readChapter(ctx, civ, ch, chapters.indexOf(ch), chapters.length)) === STOP) return;
    for (const c of shuffle(ctx.clues.filter((x) => x.chapter === ch.n))) if ((await askClue(ctx, c, { format: 'story', label: 'Extra practice' })) === STOP) return;
  }
}
