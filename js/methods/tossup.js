// Tossups: an answer's clues are read out word by word in a random order; buzz (Space) when you
// know it. Two answers per batch. The first reading of a new answer just shows you the clues; after
// that each tossup is graded clue by clue: the clue you buzzed on counts as known, clues read before
// it get asked on their own later, and unread clues aren't touched. An answer is done once you get it
// within two clues, or after three rounds.
import { h, mount, answerBox } from '../ui.js';
import { shuffle } from '../engine/util.js';
import { tossupCredit } from '../engine/memory.js';
import { answerOf, shownAnswer } from '../content.js';
import { STOP, chunk, groupByAnswer, kindTag, continueButton } from './common.js';

export const id = 'tossups';

// opponent (Tossup duel): { clue, word, correct, wrongName } — where the AI buzzes and whether it's right
export function playTossup(ctx, group, { graded, label, opponent = null }) {
  const order = shuffle(group.clues);
  const a = { name: answerOf(order[0]).name };   // a tossup's clues share the answer; show its usual name
  const msPerChar = ctx.settings.msPerChar || 54;
  const text = h('p', { class: 'tossup-text' });
  const buzz = h('button', { class: 'btn buzz', type: 'button' }, 'Buzz (Space)');
  const status = h('div', { class: 'muted small' }, graded ? 'Buzz as soon as you know it.' : 'New answer: listen to every clue, then see the answer.');
  const area = h('div', { class: 'feedback' });
  mount(ctx.stage, h('div', { class: 'card' }, h('div', { class: 'card-top' }, kindTag(order[0]), h('span', { class: 'muted' }, label)), text, h('div', { class: 'row' }, buzz, status), area));
  return new Promise((resolve) => {
    let clueIdx = 0, wordIdx = 0, timer = null, buzzed = false, finished = false, oppDone = !opponent, aiWon = false;
    const words = order.map((c) => c.study.split(/\s+/));
    const spans = order.map(() => h('span', { class: 'clue-sent' }));
    spans.forEach((s, i) => { text.append(s); if (i < spans.length - 1) text.append(' '); });
    const step = () => {
      if (buzzed) return;
      if (!oppDone && (clueIdx > opponent.clue || (clueIdx === opponent.clue && wordIdx >= opponent.word))) return aiBuzz();
      if (clueIdx >= words.length) { finished = true; status.textContent = 'All clues read. Buzz now or wait…'; timer = setTimeout(() => onBuzz(true), graded ? 5000 : 1200); return; }
      const w = words[clueIdx][wordIdx];
      spans[clueIdx].textContent += (wordIdx ? ' ' : '') + w;
      wordIdx++;
      if (wordIdx >= words[clueIdx].length) { clueIdx++; wordIdx = 0; }
      timer = setTimeout(step, msPerChar * (w.length + 1));
      ctx.timer.poke();   // listening counts as active
    };
    const key = (e) => { if (e.code === 'Space' && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); onBuzz(false); } };
    window.addEventListener('keydown', key);
    buzz.addEventListener('click', () => onBuzz(false));
    ctx.wait(new Promise(() => {})).then((r) => { if (r === STOP) { cleanup(); resolve(STOP); } });
    function cleanup() { clearTimeout(timer); window.removeEventListener('keydown', key); }
    function aiBuzz() {
      oppDone = true;
      if (opponent.correct) {
        aiWon = true;
        status.textContent = `🤖 The AI buzzed: “${a.name}” — right. What would you have said?`;
        return onBuzz(false);
      }
      status.textContent = `🤖 The AI buzzed: “${opponent.wrongName}” — wrong! Your turn: keep listening.`;
      timer = setTimeout(step, 900);
    }
    async function onBuzz(noBuzz) {
      if (buzzed) return;
      buzzed = true; clearTimeout(timer); window.removeEventListener('keydown', key);
      buzz.disabled = true;
      // a buzz mid-sentence counts that clue as read
      const cluesRead = noBuzz ? order.length : Math.min(order.length, clueIdx + (wordIdx > 0 || finished ? 1 : 0)) || 1;
      let given = '', ms = 0;
      if (!noBuzz) {
        const box = answerBox(aiWon ? { placeholder: 'Your answer (practice)' } : undefined);
        mount(area, box.el);
        const r = await ctx.wait(box.promise);
        if (r === STOP) { resolve(STOP); return; }
        given = r.text; ms = r.ms;
      }
      let correct = !noBuzz && ctx.check(given, order[0]);
      order.forEach((c) => ctx.expose(c));
      // Graded answers are logged when the student moves on, so "I was right" can still change them.
      const badge = { trigger: 'buzzed on this one', 'read-before': 'read before your buzz — asked on its own later', read: 'read', unread: 'not reached' };
      const next = continueButton('Next');
      const show = () => {
        const credit = tossupCredit({ order: order.map((c) => c.id), cluesRead, correct });
        const fix = graded && given && !correct ? h('button', { class: 'btn ghost small', type: 'button', onclick: () => { correct = true; show(); next.el.focus(); } }, 'I was right') : null;
        mount(area,
          h('div', { class: !graded && noBuzz ? 'plain' : correct ? 'ok' : 'no' }, correct ? '✓ ' : !graded && noBuzz ? '' : noBuzz ? 'No buzz. ' : `✗ You said “${given || '—'}”. `, 'Answer: ', h('strong', {}, a.name), opponent ? h('span', { class: 'muted' }, aiWon ? ' — point to the AI' : correct ? ' — your point' : '') : null),
          h('ol', { class: 'reveal-list' }, order.map((c, i) => h('li', { class: graded ? credit[i].credit : 'read' }, c.study, graded ? h('span', { class: 'badge' }, badge[credit[i].credit]) : null))),
          h('div', { class: 'row' }, next.el, fix));
        return credit;
      };
      show();
      const w = await ctx.wait(next.promise);
      if (graded) {
        const credit = tossupCredit({ order: order.map((c) => c.id), cluesRead, correct });
        for (const cr of credit) {
          const c = order.find((x) => x.id === cr.clue);
          ctx.answer(c, !!cr.correct, ms, { format: 'tossup', credit: cr.credit, cluesRead, given: given || undefined, ...(opponent ? { duel: aiWon ? 'ai' : correct ? 'you' : 'none' } : {}) });
        }
      }
      resolve(w === STOP ? STOP : { correct, cluesRead, aiWon });
    }
    step();
  });
}

export async function run(ctx) {
  const groups = groupByAnswer(ctx.clues);
  const batches = chunk(groups, 2), seen = [];
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    for (const g of batch) if ((await playTossup(ctx, g, { graded: false, label: 'First reading' })) === STOP) return { finished: false };
    let pending = [...batch];
    for (let round = 2; round <= 3 && pending.length; round++) {
      const next = [];
      for (const g of shuffle(pending)) {
        const r = await playTossup(ctx, g, { graded: true, label: `Round ${round}` });
        if (r === STOP) return { finished: false };
        if (!(r.correct && r.cluesRead <= 2)) next.push(g);
      }
      pending = next;
    }
    if (b % 2 === 1 && seen.length) {
      const g = shuffle(seen)[0];
      if ((await playTossup(ctx, g, { graded: true, label: 'Mixed review' })) === STOP) return { finished: false };
    }
    seen.push(...batch);
  }
  return { finished: true };
}

export async function extra(ctx) {
  const groups = groupByAnswer(ctx.clues);
  for (;;) for (const g of shuffle(groups)) if ((await playTossup(ctx, g, { graded: true, label: 'Extra practice' })) === STOP) return;
}
