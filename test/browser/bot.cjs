// Plays through Study Lab screens like a student who knows `accuracy` of the answers: reads the clue
// on screen, looks its answer up in the page's own content module, and types it (or a wrong answer).
const P = { accuracy: 0.8 };
async function answerFor(page, text, display = false) {
  return page.evaluate(async ([t, display]) => {
    const C = await import('/js/content.js');
    const c = C.allClues().find((x) => x.study === t || x.test === t || x.text === t);
    if (!c) return null;
    return (!display && c.forms && c.forms[0]) || C.answerOf(c).name;
  }, [text, display]);
}
const vis = async (page, sel) => { const el = await page.$(sel); return el && (await el.isVisible()) ? el : null; };
async function step(page, opts = {}) {
  const acc = opts.accuracy ?? P.accuracy;
  // text answer
  const input = await page.$('input.answer:not([disabled])');
  if (input && await input.isVisible()) {
    const pEl = await page.$('.stage .prompt');
    const prompt = pEl ? await pEl.textContent() : null;
    let ans = prompt ? await answerFor(page, prompt.trim()) : null;
    if (!ans) { // tossup: answer is the group's; read the first clue sentence shown
      const sent = await page.$$eval('.clue-sent', (els) => els.map((e) => e.textContent).filter(Boolean));
      const full = await page.evaluate(async (sents) => {
        const C = await import('/js/content.js');
        for (const s of sents) { const c = C.allClues().find((x) => x.study.startsWith(s) || s.startsWith(x.study)); if (c) return (c.forms && c.forms[0]) || C.answerOf(c).name; }
        return null;
      }, sent);
      ans = full;
    }
    const right = Math.random() < acc;
    // the box can go away mid-answer (the Lightning round's clock runs out): just look again
    try {
      await input.fill(right && ans ? ans : (Math.random() < 0.5 ? 'zzzz' : ''), { timeout: 3000 });
      if (await input.inputValue()) await input.press('Enter', { timeout: 3000 }); else await page.click('button:has-text("Don\'t know")', { timeout: 3000 });
    } catch (_) { /* moved on */ }
    return 'answer';
  }
  // tossup buzz
  const buzz = await page.$('button.buzz:not([disabled])');
  if (buzz && await buzz.isVisible()) {
    const top = await page.$('.stage .card-top');
    const graded = top ? !(await top.textContent()).includes('First reading') : true;
    if (!graded) { await page.waitForTimeout(200); return 'listen'; }
    const words = await page.$$eval('.clue-sent', (els) => els.map((e) => e.textContent).join(' ').split(/\s+/).filter(Boolean).length);
    const st = await page.$('.stage .row .muted');
    const allRead = st ? (await st.textContent()).includes('All clues read') : false;
    if (words >= (opts.buzzAt ?? 12) || allRead) { await buzz.click({ timeout: 1500 }).catch(() => {}); return 'buzz'; }
    await page.waitForTimeout(60); return 'listen';
  }
  // quiz show: pick the right answer (or a wrong one)
  const choices = await page.$$('.choice-btn:not([disabled])');
  if (choices.length) {
    const prompt = (await (await page.$('.stage .prompt')).textContent()).trim();
    const ans = await answerFor(page, prompt, true);
    let right = null;
    for (const b of choices) if ((await b.textContent()).replace(/^\d/, '').trim() === ans) right = b;
    const pick = Math.random() < acc && right ? right : choices.find((b) => b !== right) || choices[0];
    await pick.click();
    return 'choice';
  }
  // sure or not?
  const sure = await page.$('.feedback button.btn:text-matches("^[123]\\. ")');
  if (sure && await sure.isVisible()) {
    const opts = await page.$$('.feedback button.btn:text-matches("^[123]\\. ")');
    await opts[Math.floor(Math.random() * opts.length)].click();
    return 'confidence';
  }
  // connect it: write a note now and then
  const note = await page.$('textarea.note-input');
  if (note && await note.isVisible() && !(await note.inputValue()) && Math.random() < 0.5) { await note.fill('reminds me of something'); }
  // matching
  const clueBtn = await page.$('.match-item.clue:not(.matched)');
  if (clueBtn && await clueBtn.isVisible()) {
    const t = (await clueBtn.textContent()).trim();
    const ans = await answerFor(page, t, true);
    await clueBtn.click();
    const names = await page.$$('.match-item.ans:not(.matched)');
    let target = null;
    for (const n of names) if ((await n.textContent()).trim() === ans) target = n;
    if (Math.random() > acc) { const wrong = names.find((n) => n !== target); if (wrong) await wrong.click(); }
    if (!target) target = await page.$('.match-item.ans:not(.matched)');
    if (target) await target.click();
    return 'match';
  }
  // ratings
  if (await vis(page, '.scale-btn')) {
    const scales = await page.$$('.scale-row');
    for (const s of scales) { const b = await s.$$('.scale-btn'); await b[(opts.enjoy ?? 4) - 1].click(); }
    await page.click('button:has-text("Continue to the test")');
    return 'rate';
  }
  for (const [label, what] of [['Done', 'done'], ['Finish', 'finish'], ["I've read it", 'read'], ['Continue', 'continue'], ['Next board', 'next'], ['Next', 'next'], ['Start the quiz', 'start'], ['Ready', 'ready'], ['Go!', 'go'], ['Start', 'start']]) {
    const b = await page.$(`.stage button:text-is("${label}"), section.intro button:text-is("${label}")`);
    if (b && await b.isVisible() && await b.isEnabled()) { await b.click(); return what; }
  }
  return null;
}
async function play(page, { until, max = 4000, ...opts }) {
  const counts = {};
  for (let i = 0; i < max; i++) {
    if (until && await until()) return counts;
    const r = await step(page, opts).catch((e) => { if (/detached|closed|Target/.test(e.message)) return 'retry'; throw e; });
    counts[r] = (counts[r] || 0) + 1;
    if (!r) await page.waitForTimeout(150);
    else await page.waitForTimeout(r === 'listen' ? 0 : 40);
  }
  throw new Error('play: gave up ' + JSON.stringify(counts));
}
module.exports = { play, step, answerFor };
