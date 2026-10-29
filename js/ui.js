// Tiny DOM helpers and the active-time tracker.

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
export const $ = (sel, root = document) => root.querySelector(sel);
export function mount(el, ...kids) { el.replaceChildren(...kids.flat(Infinity).filter(Boolean)); return el; }

export function toast(msg, kind = 'info') {
  const t = h('div', { class: `toast ${kind}`, role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3200);
}

export const pct = (x, digits = 0) => (x === null || x === undefined || Number.isNaN(x) ? '—' : `${(x * 100).toFixed(digits)}%`);
export const num = (x, digits = 0) => (x === null || x === undefined || Number.isNaN(x) ? '—' : Number(x).toFixed(digits));
export const minutes = (ms) => `${Math.round(ms / 60000)} min`;
export function dateLabel(t) {
  const d = new Date(t), today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - today) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Counts time only while the page is visible and the student has done something recently.
// Reading screens get a longer idle allowance.
export function activeTimer(idleMs = 60000) {
  let total = 0, last = performance.now(), lastInput = performance.now(), running = false, idle = idleMs, stopped = false;
  const bump = () => { lastInput = performance.now(); };
  const tick = () => {
    const now = performance.now();
    if (running && document.visibilityState === 'visible' && now - lastInput < idle) total += now - last;
    last = now;
  };
  const iv = setInterval(tick, 1000);
  const evs = ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart', 'input'];
  evs.forEach((e) => window.addEventListener(e, bump, { passive: true }));
  return {
    start() { tick(); running = true; bump(); },
    pause() { tick(); running = false; },
    setIdle(ms) { idle = ms; },
    poke: bump,
    ms() { tick(); return Math.round(total); },
    stop() { if (stopped) return Math.round(total); tick(); running = false; stopped = true; clearInterval(iv); evs.forEach((e) => window.removeEventListener(e, bump)); return Math.round(total); },
  };
}

// An answer box: resolves with { text, ms } (text '' = "Don't know").
export function answerBox({ placeholder = 'Type your answer', autofocus = true } = {}) {
  const input = h('input', { type: 'text', class: 'answer', placeholder, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Your answer' });
  const submit = h('button', { class: 'btn primary', type: 'submit' }, 'Answer');
  const pass = h('button', { class: 'btn ghost', type: 'button' }, "Don't know");
  const form = h('form', { class: 'answer-row' }, input, submit, pass);
  const started = performance.now();
  const promise = new Promise((resolve) => {
    form.addEventListener('submit', (e) => { e.preventDefault(); if (!input.value.trim()) { input.focus(); return; } done(input.value); });
    pass.addEventListener('click', () => done(''));
    function done(text) { input.disabled = submit.disabled = pass.disabled = true; resolve({ text, ms: Math.round(performance.now() - started) }); }
  });
  if (autofocus) setTimeout(() => input.focus(), 30);
  return { el: form, promise, input };
}

export function waitClick(btn) { return new Promise((r) => btn.addEventListener('click', r, { once: true })); }
export function keyOnce(keys, handler) {
  const fn = (e) => { if (keys.includes(e.key) && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) { e.preventDefault(); window.removeEventListener('keydown', fn); handler(e); } };
  window.addEventListener('keydown', fn);
  return () => window.removeEventListener('keydown', fn);
}
