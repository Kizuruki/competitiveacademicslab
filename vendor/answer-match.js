// ============================================================
// answer-match.js — shared answer checker for History Bowl and
// Geography Bowl review sites.   window.answerMatches(given, answer)
//
// Rules
//  • Case, accents, punctuation and symbols are ignored.
//  • Filler words (the, a, an, of, in, …) are dropped from both sides.
//  • Word order doesn't matter.
//  • "X or Y" (also "/", ";", ",") in the ANSWER = either is accepted.
//  • "X and Y" (also "&") in the ANSWER = both must be given.
//  • Typing "or" in your submission (hedging) is always wrong.
//  • Every word you type must belong to the answer — no bonus words,
//    except one leading first name / title ("Thomas Jefferson" for
//    "Jefferson").
//  • Dropping words is OK only if you keep the distinctive last word:
//    "Washington" for "George Washington", "Actium" for "Battle of
//    Actium". Not OK when that last word is generic ("Falls", "War",
//    "Africa", a number …): "Africa" ≠ "South Africa".
//  • Small spelling slips are forgiven: 1 typo in words of 6+ letters,
//    and same-sounding spellings (Lewis / Louis) with the same first
//    letter. Numbers must match exactly (1812 ≠ 1813, VII ≠ VIII).
//  • Parenthetical notes: "(accept X)" adds X as an answer,
//    "(do not accept X)" / "(prompt on X)" are ignored, any other
//    "(…)" words are optional.
//  • "(accept either underlined portion)" / "either name": each distinctive
//    word of a multi-word answer is accepted on its own.
//  • Letters spelled out with dashes count as the word: "C-O-L-O-M-B-I-A"
//    is "Colombia".
//  • answerMatches(given, answer, { lenient: true, question }) — the
//    Geography site — is more forgiving:
//      – spaces and symbols don't matter ("Guinea Bissau", "GuineaBissau")
//        and a slightly longer slip is forgiven ("Mediterranean se");
//      – a trailing feature word is optional both ways: "Mediterranean"
//        for "Mediterranean Sea", "Nile River" for "the Nile" (not "Japan"
//        for "Sea of Japan", "Red" for "Red Sea" or "Korea" for "South Korea");
//      – "(2 of) Washington, Oregon & California", or a question asking for
//        "2 of the 5 states", takes any 2 of the listed answers;
//      – a long described answer needs only its main words.
//  • Typing (or pasting) the whole answer as written always counts, even
//    when it contains "or" — otherwise "or" in an answer means hedging.
//  • Moderator instructions aren't answers: "accept descriptive answers
//    of Eisenhower's last speech" → "Eisenhower's last speech" (all of
//    its words needed); "accept equivalents, like Campaign" → "Campaign";
//    a bare "accept word forms" / "accept equivalents" adds nothing.
// ============================================================
(function () {
  const FILLER = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'at', 'for', 'by', 'to', 'from', 'with', 'and',
    'el', 'la', 'los', 'las', 'le', 'les', 'de', 'du', 'des', 'un', 'une', 'der', 'die', 'das']);

  // Words that are too generic to stand in for the whole answer on their own.
  const GENERIC = new Set(['battle', 'war', 'treaty', 'act', 'party', 'company', 'revolution', 'dynasty', 'empire',
    'kingdom', 'republic', 'state', 'united', 'north', 'south', 'east', 'west', 'northern', 'southern', 'eastern',
    'western', 'central', 'new', 'old', 'great', 'little', 'upper', 'lower', 'river', 'lake', 'sea', 'ocean', 'gulf',
    'bay', 'strait', 'mountain', 'mount', 'mt', 'range', 'island', 'isle', 'fall', 'city', 'town', 'county',
    'province', 'desert', 'peninsula', 'canal', 'harbor', 'harbour', 'park', 'valley', 'plain', 'plateau', 'basin',
    'delta', 'cape', 'point', 'purchase', 'rebellion', 'crisis', 'affair', 'massacre', 'movement', 'doctrine',
    'compromise', 'amendment', 'scandal', 'incident', 'uprising', 'revolt', 'conflict', 'campaign', 'expedition', 'plot', 'church', 'council', 'league', 'union', 'federation', 'confederation', 'america',
    'africa', 'asia', 'europe', 'king', 'queen', 'emperor', 'empress', 'president', 'saint', 'day', 'age', 'period',
    'era', 'crusade', 'canyon', 'sound', 'channel', 'coast', 'land', 'republic', 'democratic', 'people', 'federal',
    'national', 'royal', 'holy', 'grand', 'high', 'first', 'second', 'third', 'war', 'wall', 'tower', 'bridge',
    'palace', 'temple', 'castle', 'building', 'square', 'street', 'road', 'trail', 'railroad', 'railway']);

  // Geography feature words. TRAILING ones can be left off ("Mediterranean" for "Mediterranean Sea");
  // LEADING ones too ("Victoria" for "Lake Victoria"). "Sea of Japan" keeps its "Sea".
  const TRAILING = new Set(['sea', 'ocean', 'river', 'desert', 'mountain', 'peninsula', 'plateau', 'basin',
    'archipelago', 'gulf', 'range', 'volcano', 'glacier', 'reef', 'lagoon', 'canyon', 'highland', 'hill', 'forest']);
  // (not "island", "bay", "falls", "canal", "delta", "valley": "Vancouver" ≠ "Vancouver Island",
  //  "Hudson" could be the river, "Suez" the city)
  const LEADING = new Set(['lake', 'mount', 'mt']);
  const FEATURE = new Set([...TRAILING, ...LEADING, 'lake', 'strait', 'channel', 'sound', 'cape', 'isle', 'city',
    'state', 'province', 'county', 'region', 'coast', 'capital']);
  // feature words a player may add to an answer that doesn't have one, even when the question doesn't say
  // it: "Mediterranean Sea" for "the Mediterranean". Others ("Lake Michigan" for the state, "Erie Canal",
  // "Hudson Bay" for the Hudson) only count when the question itself names that kind of feature.
  const SAFE_EXTRA = new Set(['sea', 'ocean', 'desert']);
  // words that can't be the only thing left of an answer ("Red" for "Red Sea", "Long" for "Long Island")
  const PLAIN = new Set(['red', 'black', 'white', 'yellow', 'blue', 'green', 'dead', 'long', 'great', 'grand',
    'little', 'big', 'old', 'new', 'north', 'south', 'east', 'west', 'northern', 'southern', 'eastern', 'western',
    'upper', 'lower', 'central', 'middle', 'high', 'low', 'salt', 'coral', 'inland']);
  // words that tell two places apart: never dropped ("Korea" ≠ "South Korea")
  const DIRECTIONAL = new Set(['north', 'south', 'east', 'west', 'northern', 'southern', 'eastern', 'western',
    'new', 'upper', 'lower', 'central', 'middle', 'great', 'little', 'old']);
  // first words of place names that can't be dropped ("Guinea" ≠ "Equatorial Guinea", "Arabia" ≠ "Saudi Arabia")
  const PLACE_HEAD = new Set([...DIRECTIONAL, 'equatorial', 'saudi', 'sri', 'costa', 'sierra', 'burkina', 'puerto',
    'el', 'san', 'santa', 'sao', 'czech', 'dominican', 'papua', 'united', 'timor', 'marshall', 'solomon', 'cayman',
    'virgin', 'faroe', 'falkland', 'cook', 'trinidad', 'antigua', 'bosnia', 'guinea', 'vatican', 'hong', 'las', 'los',
    'rio', 'buenos', 'mexico', 'kuala', 'abu', 'addis', 'tel', 'port', 'fort', 'st', 'saint']);
  // little words a long described answer can do without
  const STOP = new Set([...FILLER, 'that', 'which', 'who', 'whom', 'whose', 'is', 'was', 'were', 'are', 'be', 'been',
    'it', 'its', 'this', 'these', 'those', 'part', 'as', 'also', 'or', 'than', 'into', 'his', 'her', 'their', 'there',
    'where', 'when', 'what', 'how', 'has', 'had', 'have', 'very', 'most', 'more', 'some', 'one']);

  const NUM = {
    one: 1, first: 1, two: 2, second: 2, three: 3, third: 3, four: 4, fourth: 4, five: 5, fifth: 5, six: 6, sixth: 6,
    seven: 7, seventh: 7, eight: 8, eighth: 8, nine: 9, ninth: 9, ten: 10, tenth: 10, eleven: 11, eleventh: 11,
    twelve: 12, twelfth: 12, thirteen: 13, thirteenth: 13, fourteen: 14, fourteenth: 14, fifteen: 15, fifteenth: 15,
    sixteen: 16, sixteenth: 16, seventeen: 17, seventeenth: 17, eighteen: 18, eighteenth: 18, nineteen: 19,
    nineteenth: 19, twenty: 20, twentieth: 20,
  };
  const ROMAN = /^(?=[ivxlc]+$)(c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/;
  const romanToInt = (s) => {
    const v = { i: 1, v: 5, x: 10, l: 50, c: 100 };
    let n = 0;
    for (let i = 0; i < s.length; i++) n += v[s[i]] < (v[s[i + 1]] || 0) ? -v[s[i]] : v[s[i]];
    return n;
  };

  function normWord(w) {
    if (w === 'st' || w === 'saint') return 'saint';
    if (w === 'mt') return 'mount';
    if (NUM[w]) return String(NUM[w]);
    let m = w.match(/^(\d+)(st|nd|rd|th)$/);
    if (m) return m[1];
    if (ROMAN.test(w)) return String(romanToInt(w));
    if (/^\d+$/.test(w)) return String(Number(w));
    // light singularising (applied identically to both sides)
    if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
    if (w.length > 4 && /(s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && w.endsWith('s') && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
    return w;
  }

  function tokens(text) {
    const words = String(text || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/ß/g, 'ss').replace(/æ/g, 'ae').replace(/œ/g, 'oe')
      .replace(/[’'`´]/g, '')          // O'Neill → oneill
      .replace(/(?<![a-z0-9])[a-z](?:-[a-z])+(?![a-z0-9])/g, (m) => m.replace(/-/g, ''))   // C-O-L-O-M-B-I-A → colombia
      .replace(/([a-z0-9])&([a-z0-9])/g, '$1$2')   // AT&T, B&O → att, bo
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim().split(/\s+/).filter(Boolean);
    const kept = words.filter((w) => !FILLER.has(w)).map(normWord);
    // An answer made only of filler words ("The Who"?) keeps them.
    return kept.length ? kept : words.map(normWord);
  }

  function lev(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
    return d[a.length][b.length];
  }

  function soundex(w) {
    const code = { b: 1, f: 1, p: 1, v: 1, c: 2, g: 2, j: 2, k: 2, q: 2, s: 2, x: 2, z: 2, d: 3, t: 3, l: 4, m: 5, n: 5, r: 6 };
    let out = w[0], last = code[w[0]] || 0;
    for (let i = 1; i < w.length && out.length < 4; i++) {
      const c = code[w[i]] || 0;
      if (c && c !== last) out += c;
      if (w[i] !== 'h' && w[i] !== 'w') last = c;
    }
    return (out + '000').slice(0, 4);
  }

  function wordsMatch(g, a, lenient, known) {
    if (g === a) return true;
    if (known && known.has(g) && known.has(a)) return false;   // two real names, not a typo (Iceland ≠ Ireland)
    if (/\d/.test(g) || /\d/.test(a)) return false;          // numbers must be exact
    if (g[0] !== a[0]) return false;                          // Prussia ≠ Russia
    const d = lev(g, a);
    if (Math.min(g.length, a.length) >= 6 && d <= 1) return true;                  // one typo
    if (lenient && Math.min(g.length, a.length) >= 9 && d <= 2) return true;      // "Mediteranian"
    if (Math.min(g.length, a.length) >= 4 && Math.abs(g.length - a.length) <= 1 &&
        d <= 2 && soundex(g) === soundex(a)) return true;                          // Lewis / Louis
    return false;
  }

  // "accept descriptive answers of X" / "any answer that indicates X" / "equivalents, such as X" are notes
  // for a moderator. Returns null for an ordinary answer, otherwise the X parts (all of their words required).
  // (titles like "All Quiet on the Western Front" or "Anything Goes" are not notes: "any/all/other/answers/anything"
  //  only count when an instruction word follows)
  const INSTRUCTION = new RegExp('^\\s*(?:or\\s+)?(?:also\\s+)?(?:accept\\s+)?(?:' + [
    '(?:any|all|other|any\\s*\\/\\s*all)\\s+(?:of\\s+|two\\s+|three\\s+)?(?:specific\\s+|clear\\s+|reasonable\\s+|similar\\s+|equivalent\\s+|other\\s+|additional\\s+)?' +
      '(?:answers?|descriptions?|descriptive|equivalents?|synonyms?|responses?|mentions?|references?|forms?|types?|kinds?|indications?|information|piece|parts?|words?|of\\b)',
    'similar\\s+(?:answers?|descriptions?|words?|responses?)', 'reasonable\\s+(?:answers?|descriptions?|equivalents?|synonyms?)',
    'equivalents?\\b', 'synonyms?\\b', 'descriptive\\b', 'descriptions?\\b', 'word\\s+forms?\\b', 'elaborations?\\b',
    'answers?\\s+(?:related|relating|including|mentioning|indicating|that|like|such|referring|about|describing|of|involving)\\b',
    'anything\\s+(?:related|relating|that|like|referring|mentioning|about|involving|describing)\\b',
  ].join('|') + ')', 'i');
  // "synonyms for “Rebellion” such as “Revolution”" swaps one word inside the main answer — not an answer itself
  const SUBSTITUTE = /^\s*(?:or\s+)?(?:also\s+)?(?:accept\s+)?(?:equivalents?|synonyms?|word\s+forms?|similar\s+words?)\s+(?:for|of|to)\s+[“"'‘]?([^,;“”"'’]+?)[”"'’]?\s*(?:,|;|$|\s+(?:like|such as|e\.g\.|including|for example)\b)/i;
  function instruction(chunk) {
    if (!INSTRUCTION.test(chunk)) return null;
    const sub = chunk.match(SUBSTITUTE);
    if (sub) {   // "equivalents for expedition, like Campaign": swap the word inside the main answer
      const ex = chunk.match(/^.*\b(?:like|such as|e\.g\.,?|including|for example)\s+(.+)$/i);
      return { word: sub[1].trim(), examples: ex ? ex[1].split(/\s*,\s*|\s*;\s*|\s+or\s+/).map((x) => x.replace(/[“”"‘’']/g, '').trim()).filter(Boolean) : [] };
    }
    let s = chunk.replace(/\s+(?:before|after|until)\b[^,;]*\b(?:mentioned|read|said|given|is said|is read)\b.*$/i, '')
      .replace(/\betc\.?/gi, ' ');
    // examples of what to accept ("such as nightmares", "like swinging a golf club, teeing off") — one per comma
    let m = s.match(/^.*\b(?:like|such as|e\.g\.,?|including|for example)\s+(.+)$/i);
    if (m) return m[1].split(/\s*,\s*|\s*;\s*/).filter(Boolean);
    // what a description has to be about ("descriptive answers of Eisenhower's last speech") — kept whole
    m = s.match(/\b(?:of|for|about|involving|indicating|mentioning|describing|referring to|related to|relating to|regarding|that (?:indicates?|mentions?|describes?|refers? to|involves?))\s+(.+)$/i);
    return m ? [m[1]] : '';
  }

  // "The Battle of Actium or The Battle of Octavian (accept Actium)"
  //   → [{ parts: [{ req: ['battle','actium'] }] }, …], optional: [...]
  function parseAnswer(answer) {
    const strings = Array.isArray(answer) ? answer : [answer];
    const alternatives = [];
    const optional = [];
    const plain = [], notes = [];
    let either = false;
    strings.forEach((raw) => {
      let s = String(raw || '');
      const extra = [];
      // letters in brackets inside a word are optional: "J(ohn) Edgar Hoover" → also "John Edgar Hoover"
      if (/[A-Za-z]\([a-z]+\)/.test(s)) extra.push(s.replace(/([A-Za-z])\(([a-z]+)\)/g, '$1$2').replace(/[\(\[][^\)\]]*[\)\]]/g, ' '));
      s = s.replace(/([A-Za-z])\([a-z]+\)/g, '$1');
      const note = (t) => {
        // one bracketed note can hold several instructions: "(prompt on 90s, accept Tech bubble before it is mentioned)"
        t.split(/\s*[;,]\s*(?=(?:but\s+)?(?:also\s+)?(?:accept|or|prompt|do not|don't|dont|reject|anti-prompt|be lenient|ignore)\b)|\s*;\s*/i).forEach((c) => {
          c = c.trim();
          if (!c) return;
          if (/^(?:but\s+)?(do not|don't|dont|not|prompt|reject|anti-prompt|no|be lenient|ignore|ignoring)\b/i.test(c)) return;
          if (/^(?:accept\s+)?either\b|\beither (?:underlined )?(?:portion|part|name|word)s?\b|\bunderlined portions?\b/i.test(c)) { either = true; return; }
          const acc = c.match(/^(?:also\s+)?(?:accept|or)\s*:?\s*(.*)$/i);
          if (acc) extra.push(acc[1].replace(/\s+(?:before|after|until)\b[^,;]*\b(?:mentioned|read|said|given)\b.*$/i, ''));
          else optional.push(...tokens(c));
        });
      };
      // top-level (…) and […] groups, nesting allowed: "(or T(homas) E(dward) Lawrence)"
      let out = '', depth = 0, buf = '';
      for (const ch of s) {
        if (ch === '(' || ch === '[') { if (depth++ > 0) buf += ch; continue; }
        if ((ch === ')' || ch === ']') && depth > 0) { if (--depth > 0) buf += ch; else { note(buf); buf = ''; out += ' '; } continue; }
        if (depth > 0) buf += ch; else out += ch;
      }
      if (buf) note(buf);
      s = out;
      s = s.replace(/\b(do not|don't) accept\b.*$/i, '').replace(/\bprompt on\b.*$/i, '');
      s = s.replace(/\baccept\b\s*:?\s*/gi, ' or ');
      [s, ...extra].forEach((chunk) => {
        const note = instruction(chunk);
        if (note === null) plain.push(chunk); else notes.push(note);
      });
    });
    const add = (alt, strict) => {
      const parts = alt.split(/\s+and\s+|\s&\s/i)
        .map((p) => ({ req: [...new Set(tokens(p))] }))
        .filter((p) => p.req.length);
      if (parts.length) alternatives.push(strict ? { parts, strict: true } : { parts });
    };
    const split = (chunk) => chunk.split(/\s+or\s+|\/|;|,/i);
    plain.forEach((chunk) => split(chunk).forEach((alt) => add(alt, false)));
    if (either) {
      plain.forEach((chunk) => split(chunk).forEach((alt) => {
        const words = tokens(alt);
        if (words.length >= 2) words.filter((w) => w.length >= 3 && !GENERIC.has(w) && !/^\d+$/.test(w)).forEach((w) => add(w, false));
      }));
    }
    notes.forEach((note) => {
      if (note === '') return;                                     // "accept equivalents" — nothing to match
      if (Array.isArray(note)) { note.forEach((alt) => add(alt, true)); return; }
      const re = new RegExp('\\b' + note.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
      plain.forEach((chunk) => split(chunk).forEach((alt) => {
        if (re.test(alt)) note.examples.forEach((ex) => add(alt.replace(re, ex), false));
      }));
    });
    return { alternatives, optional };
  }

  const WORDNUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, both: 2 };
  const toNum = (w) => (/^\d+$/.test(w) ? Number(w) : WORDNUM[String(w).toLowerCase()] || 0);

  // "(2 of) Washington, Oregon & California", or a question asking for "2 of the 5 states" whose answer
  // lists more than 2 → { n: 2, items: [...] }
  function listAnswer(answer, question) {
    const main = String((Array.isArray(answer) ? answer[0] : answer) || '');
    let n = 0, rest = main;
    const pre = main.match(/^\s*\(\s*(\d+|one|two|three|four|five|any\s+(\w+))\s+of\s*\)\s*(.*)$/i);
    if (pre) { n = toNum(pre[2] || pre[1]); rest = pre[3]; }
    else {
      const q = String(question || '').match(/\b(\d+|one|two|three|four|five|six|both)\s+of\s+(?:the\s+|its\s+|these\s+|those\s+|his\s+|her\s+|their\s+)?(?:other\s+)?(\d+|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i);
      // only when the answer itself is a list ("Washington, Iowa, Idaho…"), not one answer with
      // alternatives in brackets ("Lake Constance (or Bodensee)")
      const head = main.replace(/\([^)]*\)/g, ' ');
      if (q && head.split(/\s*(?:,|;|&|\band\b)\s*/i).filter((x) => tokens(x).length).length >= 2) n = toNum(q[1]);
    }
    if (!n) return null;
    const items = rest.replace(/\(([^)]*)\)/g, ', $1').split(/\s*(?:,|;|\/|&|\band\b|\bor\b|\balso\b)\s*/i)
      .map((x) => x.replace(/^\s*(?:also|or|accept)\s+/i, '').trim()).filter((x) => tokens(x).length);
    if (items.length <= n && !pre) return null;
    return items.length >= n ? { n, items } : null;
  }

  function matchList(rawGiven, list, known, question) {
    const pieces = rawGiven.split(/\s*(?:,|;|\/|&|\band\b|\bplus\b)\s*/i).map((x) => x.trim()).filter((x) => tokens(x).length);
    if (pieces.length < list.n) return list.n === 1 && list.items.some((it) => matchOne(rawGiven, it, true, known, question));
    const used = new Set();
    for (let i = 0; i < pieces.length; i++) {
      let k = list.items.findIndex((it, j) => !used.has(j) && matchOne(pieces[i], it, true, known, question));
      if (k < 0 && i + 1 < pieces.length) {                     // "Trinidad and Tobago" was split in two
        k = list.items.findIndex((it, j) => !used.has(j) && matchOne(pieces[i] + ' and ' + pieces[i + 1], it, true, known, question));
        if (k >= 0) i++;
      }
      if (k < 0) return false;                                   // a wrong one in the list
      used.add(k);
    }
    return used.size >= list.n;
  }

  const squash = (ws) => ws.join('');
  function matchOne(rawGiven, answer, lenient, known, question) {
    const G = [...new Set(tokens(rawGiven))];
    if (!G.length) return false;
    const { alternatives, optional } = parseAnswer(answer);
    if (!alternatives.length) return false;

    const wm = (g, a) => wordsMatch(g, a, lenient, lenient ? known : null);
    const union = [...optional];
    alternatives.forEach((a) => a.parts.forEach((p) => union.push(...p.req)));
    const has = (kw) => G.some((g) => wm(g, kw));
    // lenient: an extra feature word in the answer given is fine ("Mediterranean Sea" for "Mediterranean"),
    // unless the answer has a feature word of its own ("Sinai Peninsula" ≠ "Mount Sinai", "Victoria Falls" ≠
    // "Lake Victoria")
    const unknownAll = G.map((g, i) => (union.some((u) => wm(g, u)) ? -1 : i)).filter((i) => i >= 0);
    const asked = new Set(tokens(question || ''));
    const extraFeature = unknownAll.filter((i) => lenient && FEATURE.has(G[i]) && (SAFE_EXTRA.has(G[i]) || asked.has(G[i])) &&
      !G.some((g) => PLAIN.has(g)));                                     // not "Yellow Sea" for "yellow"
    const unknownBase = unknownAll.filter((i) => !extraFeature.includes(i));

    for (const alt of alternatives) {
      const altFeature = alt.parts.some((p) => p.req.some((kw) => FEATURE.has(kw)));
      const unknownIdx = altFeature ? unknownAll : unknownBase;
      const fullParts = alt.parts.map((p) => p.req.every(has));
      const full = fullParts.every(Boolean);

      if (full && unknownIdx.length === 0) return true;
      if (alt.strict) {                                            // a described answer needs (nearly) all of its words
        const req = alt.parts.reduce((n, p) => n + p.req.length, 0);
        const missing = alt.parts.reduce((n, p) => n + p.req.filter((kw) => !has(kw)).length, 0);
        if (unknownIdx.length === 0 && missing <= Math.floor(req / 4)) return true;
        continue;
      }
      // one leading first name / title: "Thomas Jefferson" for "Jefferson"
      if (full && unknownIdx.length === 1 && unknownIdx[0] === 0 && G.length >= 2) {
        const extra = G[0];
        if (!/\d/.test(extra) && !GENERIC.has(extra) && extra.length >= 3) return true;
      }
      // dropped words: keep the distinctive last word of each part
      if (unknownIdx.length === 0) {
        const ok = alt.parts.every((p, i) => {
          if (fullParts[i]) return true;
          const last = p.req[p.req.length - 1];
          // lenient (places): never drop a feature word ("Japan" ≠ "Sea of Japan") or the first word of a
          // place name ("Korea" ≠ "South Korea", "Guinea" ≠ "Equatorial Guinea")
          if (lenient && p.req.some((kw) => !has(kw) && (FEATURE.has(kw) || PLACE_HEAD.has(kw)))) return false;
          return p.req.length >= 2 && !/\d/.test(last) && !GENERIC.has(last) && has(last);
        });
        if (ok) return true;
      }
      if (!lenient || alt.parts.length !== 1) continue;
      const req = alt.parts[0].req;
      // spaces, symbols and a slightly bigger slip: "Mediterranean se", "GuineaBissau"
      const a1 = squash(req), g1 = squash(G);
      // …but not when it swaps one real name for another ("Columbia" for "Colombia")
      const swapsName = known && G.length === req.length &&
        G.some((g, i) => g !== req[i] && g.length >= 4 && req[i].length >= 4 && known.has(g) && known.has(req[i]));
      if (!swapsName && a1.length >= 6 && g1[0] === a1[0] && (a1.match(/\d+/g) || []).join() === (g1.match(/\d+/g) || []).join()
          && lev(g1, a1) <= Math.floor(a1.length / 8)) return true;
      // a feature word left off: "Mediterranean" for "Mediterranean Sea", "Victoria" for "Lake Victoria"
      let core = req.slice();
      while (core.length > 1 && TRAILING.has(core[core.length - 1])) core.pop();
      while (core.length > 1 && LEADING.has(core[0])) core.shift();
      if (core.length < req.length && core.every((kw) => has(kw)) && unknownIdx.length === 0 &&
          core.some((kw) => kw.length >= 4 && !GENERIC.has(kw) && !PLAIN.has(kw) && !/\d/.test(kw))) return true;
      // a long described answer: its main words are enough
      // ("the date that Delaware became part of the United States" ← "the date Delaware became a state")
      const keys = [...new Set(req.filter((kw) => !STOP.has(kw)))];
      if (keys.length >= 5) {
        const hit = keys.filter(has).length;
        const extra = G.filter((g) => !STOP.has(g) && !union.some((u) => wm(g, u))).length;
        if (hit >= Math.max(3, Math.ceil(keys.length / 2)) && extra <= 1) return true;
      }
    }
    return false;
  }

  // The whole answer typed (or pasted) as written is always right, even when it has an "or" in it:
  // "the date that Delaware became part of the United States, or the First State".
  function wholeAnswer(rawGiven, answer, lenient) {
    const g = tokens(rawGiven).join('');
    if (!g) return false;
    return (Array.isArray(answer) ? answer : [answer]).some((a) => {
      const t = tokens(String(a || '').replace(/^\s*\(\s*(?:\d+|one|two|three|four|five)\s+of\s*\)\s*/i, '')).join('');
      return t === g || (lenient && t.length >= 12 && g[0] === t[0] && lev(g, t) <= Math.floor(t.length / 12));
    });
  }

  function answerMatches(given, answer, opts) {
    const lenient = !!(opts && opts.lenient);
    const rawGiven = String(given || '');
    if (/\bor\b/i.test(rawGiven) && wholeAnswer(rawGiven, answer, lenient)) return true;
    if (/\bor\b/i.test(rawGiven)) return false;               // hedging: "Actium or Saratoga"
    const known = lenient && opts.knownWords instanceof Set ? opts.knownWords : null;
    if (lenient) {
      const list = listAnswer(answer, opts.question);
      if (list) return matchList(rawGiven, list, known, opts.question);
    }
    return matchOne(rawGiven, answer, lenient, known, lenient ? opts.question : '');
  }

  window.answerMatches = answerMatches;
  window.__answerMatchInternals = { tokens, parseAnswer, wordsMatch, listAnswer, isInstruction: (t) => INSTRUCTION.test(String(t || '')) };
})();
