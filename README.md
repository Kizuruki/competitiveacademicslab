# Study Lab

A prototype study platform for History Bowl and Geography Bowl. Each student first finds out which way of studying works best for them, using invented facts. The lab then runs their real study with that method: the right number of new clues for them, reviews right before they'd forget, and a weekly plan that fits their time or a coach's target.

It's a static site (plain HTML and JavaScript modules, no build step), so it runs on GitHub Pages or any web server. Everything a student does is saved in their browser. An optional small Cloudflare Worker collects calibration results for a school survey.

## Running it

```sh
python3 -m http.server 8000        # then open http://localhost:8000
```

On GitHub Pages, push the repo and turn on Pages for the main branch (root folder). Nothing else is needed. The question packs in `content/packs/` add about 9 MB; GitHub Pages compresses them to roughly a third of that.

## How it works

### 1. Calibration: which method works for this student

The four methods are flashcards, tossups with buzzing, story and matching. Each one teaches a different invented civilization (`content/fantasy-world.json`). The world has four civilizations with the same 15 kinds of answer each (ruler, general, river, treaty, poem and so on), four clues per answer, and a five-chapter story per civilization. Because the facts are made up, nobody starts ahead, and nothing learned with one method helps with another. `scripts/check-world.mjs` checks this:

- every clue is backed by its story chapter;
- review wording differs from study wording;
- no clue names its own answer;
- no invented name is close enough to another to confuse the answer checker;
- optionally, no invented name matches any of the 16,000 real History or Geography answers.

- **Full calibration:** all 4 methods, 60 clues each.
- **Quick survey:** 3 methods (which one is dropped rotates between students), 24 clues each.

Which civilization goes with which method, and the order of methods, are counterbalanced over 16 combinations: a cyclic civilization shift plus a balanced Williams Latin square. A student's combination comes from their device id.

Each step runs in this order:

1. The student studies with the method. Only active time counts: the page is visible and they did something in the last minute (five minutes while reading a story chapter).
2. They may keep practicing afterwards if they want.
3. They rate enjoyment and effort.
4. They take a test on every clue they saw, in the different wording, with results at the end.
5. Check-ins open 1, 3, 7 and 14 days later. A missed check-in is skipped and the next one still counts.

Measured per method (`js/engine/metrics.js`):

- **Learned per hour:** clues introduced × share right on the immediate test ÷ active hours.
- **Kept at the horizon** (default 30 days): the FSRS forgetting curve fitted to the test and the check-ins.
- **Durable per hour:** learned per hour × share kept.
- **Engagement:** from enjoyment, extra practice and stopping early. Time spent isn't used in calibration, because everyone studies the same clues there, so time mostly reflects speed.

### 2. Personalization

`js/engine/personalize.js` keeps three numbers per method for each student:

- clues learned per hour;
- share kept at the horizon;
- engagement: how much more or less they study with that method than with an average one.

**Weekly yield = learned per hour × share kept × weekly hours × engagement.** This captures "10 hours at 100 clues an hour beats 2 hours at 200": a method the student sticks with can win even if it's slower.

Each number starts from a **blueprint**: neutral guesses, or the school survey once at least 5 students have results for a method. It then moves toward the student's own results as they arrive, so with little data they stay near the blueprint and with more data their own numbers take over.

The method for each study session is chosen by Thompson sampling. Each number is drawn from its uncertainty, and the method with the highest yield in that draw is used. A clear winner is picked almost every time, while a method that might still be best gets tried now and then. The Results page shows each method's chance of being best.

In real study sessions, engagement comes from how far past the plan the student goes, or how far short they stop. It's measured as a share of what was planned, so a slow method isn't mistaken for an engaging one.

### 3. Real study (History and Geography packs)

`scripts/import-packs.mjs` turns both question banks into packs of single-fact clues:

- **Geography:** every question is already one clue. Clue ids keep the site's question ids, so answers flow both ways with the Geography site.
- **History:** tossups are split into sentences, with pronunciation guides and "for ten points" removed. Quarter-3 questions are single clues with their category put in front ("Andrew Jackson: Represented what political party?"). Bonuses aren't used yet.
- **Answer grouping:** clues are grouped by answer to count how often each answer comes up. A feature word is only dropped when that's unambiguous: "Nile River" joins "Nile", but "Arabian Sea" and "Arabian Peninsula" stay apart.
- **Answer checking:** each clue keeps its own answer line, so it's shown and checked exactly as on its own site: lenient for Geography, strict for History, using the same `answer-match.js` both sites use.

A session runs in two parts:

- **Reviews come first.** These are clues the student has already studied that FSRS says are due, asked on their own as typed questions. A clue the student never saw is never reviewed. If a pack has AI rewordings (`scripts/rephrase.mjs`), reviews ask the same fact in different words, so nothing has to be held out. Without rewordings they use the original wording.
- **Then new clues,** using the chosen method at the student's pace.
  - Answers asked most often come first, and each clue already learned for an answer makes the next one for it worth less. The most common answers get several clues and the rest still get covered.
  - At most 4 new clues per answer per session.
  - With History and Geography both selected, new clues alternate between them.
- After the planned clues, the student can keep going with more.

Memory rules (`js/engine/memory.js`, FSRS-6 via ts-fsrs 5.4.2, vendored):

- Only the first graded answer to a clue on a given day updates its memory. Repeats in the same session are practice.
- Ratings:
  - Wrong → Again.
  - Right but slow (over 15 s) → Hard.
  - Right → Good.
  - A tossup buzz on the very first clue read → Easy.
- **Tossups are credited clue by clue.**
  - Clues are read in a new random order each time, so the first sentence can't become a cue.
  - The clue that triggered a correct buzz counts as known.
  - Clues read before it are flagged and asked on their own at the next review.
  - Clues never read aren't touched.
  - On a wrong buzz, every clue read counts as missed.
- An "I was right" button corrects the answer checker when it misses an acceptable answer.

### 4. Pace

New clues per hour move between 50, 75, 100, 150 and 200, starting at 100 (`js/engine/pace.js`). A change needs at least 30 review answers since the last one.

- **Up one level** when review accuracy is at least 85%, at most 15% of reviews are overdue, and the student studied at least 80% of their planned minutes in the past week.
- **Down one level** when review accuracy is below 70% or more than 30% of reviews are overdue.

### 5. Weekly plan and assignments

`js/engine/planner.js` works in one of two modes:

- **Time mode:** the student's weekly minutes are spread over their study days. Each day's predicted reviews come first, and the rest goes to new clues at their pace.
- **Target mode** (a coach's target of clues still known at the horizon): new clues needed = target ÷ share kept, and minutes = new clues ÷ pace + review time.
  - A fast learner needs fewer minutes; a slow learner needs more.
  - Weak long-term recall shows up as more review time; strong recall leaves more time for new clues.
  - If the target would go over the weekly cap, the target is lowered instead of piling on hours.

### 6. Working with the bowl sites

- **Log in** with the same account as History Bowl and Geography Bowl (`/auth/login` on the sites' worker).
- **Bring in Geography site history:** each question answered right on the Geography site (`GET /review-pool`) becomes one answer at that time, rated Hard if it was ever missed. Those clues come back as reviews instead of as new clues. Only site activity newer than what the lab already has is brought in, so the lab's own answers aren't counted twice.
- **Answers count on the Geography site:** the first answer to each Geography clue per day goes to `POST /events` with mode `lab`, the same record the site makes. It counts toward team assignments, the site's spaced review and mastery. It can be turned off in Settings.
- **Team assignments** from both sites are shown on the plan page.
- **History is one-way for now.** The History site keys its records by quarter and question text rather than by id, so History answers aren't synced yet.

### 7. School survey

`worker/lab-worker.js` is a separate Cloudflare Worker with one D1 database.

- Students press "Upload my results" in Settings to send their calibration results and study log. Uploads are append-only and safe to repeat.
- "Get the school blueprint" builds the blueprint from everyone's results: median learned per hour, mean share kept and mean engagement per method. It's worth about one student's worth of evidence, so each student's own data takes over quickly.
- The coach view at `#/teacher` (needs the admin key) lists every student's results and downloads them as CSV.

Deploying the lab server:

```sh
npx wrangler d1 create study-lab          # put the database_id in wrangler.toml
npx wrangler secret put ADMIN_KEY
npx wrangler deploy                       # put the workers.dev address in Settings → Lab server
```

Routes:

- `POST /lab/upload`
- `GET /lab/blueprint` (device ids are hashed)
- `GET /lab/export?key=…`
- `GET /lab/events?key=…&participant=…&after=…`
- `DELETE /lab/participant/<id>?key=…`

## Data

One append-only event log per student, in `localStorage`. Settings → Export downloads it, and Import restores it. Memory, results and recommendations are all recomputed from the log.

| Event | Fields |
|---|---|
| `expose` | a clue shown with its answer: `clue, answer, pack, method, sessionId` |
| `answer` | a graded attempt: `clue, correct, ms, method, sessionId, phase, format`, with optional `credit`, `cluesRead` (tossups), `calib`, `checkinDay` (calibration) and `override` ("I was right") |
| `session` | one study or calibration session: `kind, method, activeMs`, `extraMs`, `finished`, `stoppedEarly`, `enjoy`, `demand` (calibration) or `planned`, `introduced`, `engageRatio`, `reviews` (study) |
| `checkin`, `calibration-start`, `pace` | bookkeeping |

`phase` is one of `study`, `immediate`, `checkin`, `review` or `import`. `format` is one of `flashcard`, `tossup`, `story`, `match`, `question` or `site`.

## Files

```
index.html, css/lab.css
js/engine/      memory (FSRS), calibration, metrics, personalize, pace, planner, util — no DOM, unit-tested
js/methods/     flashcards, tossup, story, matching, quiz (tests and reviews), common
js/views/       home, calibrate, run (the session frame), study, plan, results, settings, teacher
js/store.js     the event log    js/model.js  everything derived from it    js/sync.js  servers
content/        fantasy-world.json, packs/ (built), rephrased/ (optional)
scripts/        build_world.py, check-world.mjs, import-packs.mjs, rephrase.mjs
worker/         lab-worker.js
test/           engine, simulation, content, worker tests; browser/e2e.mjs
vendor/         ts-fsrs (MIT), answer-match.js (from the bowl sites)
```

## Scripts and tests

```sh
npm test                    # engine, simulation, packs/answer checking, lab worker (Node 22.5+)
npm run test:browser        # a bot student through calibration, study and every server feature (needs Playwright)
npm run check-world         # add the two site repos as arguments to check against real answers
npm run import-packs        # rebuild content/packs from ../geographybowlreview and ../historybowlreview
ANTHROPIC_API_KEY=… npm run rephrase -- --pack geo-europe-russia --limit 500
```

- The simulation test runs simulated students through calibration. It checks that calibration finds the method with the best durable yield, and that a method a student keeps at for longer can win even at a lower rate.
- The browser test serves the site itself, runs the lab worker on SQLite, and stands in for the bowl-sites worker.
- After a question bank changes, rerun `import-packs`. Clue ids stay stable, so students' memory carries over.

## Not done yet

- **AI rewordings** haven't been generated. Until they are, real-pack reviews use the original wording; fantasy-world reviews are already reworded. `scripts/rephrase.mjs` is ready, needs an API key, and checks every rewording before keeping it.
- **History sync** with the History site isn't in place. That needs a shared clue id; see section 6.
- **Bonuses and the story method for real packs** aren't supported. Story needs a narrative written around real facts.
- **Other kinds of competitions and AP study are deliberately left out for now:** math, multiple choice, reasoning questions with explanations. The memory, personalization and assignment parts should work smoothly first. When math comes: skill tags per step, and an error-type report. For example, an arithmetic slip in a related-rates problem shouldn't count against related rates or differentiation, but should bring more arithmetic-heavy related-rates problems.
