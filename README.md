# Study Lab

A prototype study platform for History Bowl and Geography Bowl. Each student first finds out which ways of studying work best for them, using invented facts, and the lab keeps measuring every method while they study for real. It then runs their real study with the method most likely to be best for them: the right number of new clues, reviews right before they'd forget, and a weekly plan that fits their time or the coach's target.

The lab works like each site's own practice mode and keeps the sites up to date: a question you get right is mastered there and goes into its spaced review; one you miss goes to Missed Questions until you get it right on a later day.

It's a static site (plain HTML and JavaScript modules, no build step) on GitHub Pages, with a small Cloudflare Worker (`worker/lab-worker.js`) that keeps every student's progress online under their bowl-site account.

## Setting it up

1. **Website:** push the repo and turn on GitHub Pages for the main branch (root folder). The question packs in `content/packs/` add about 18 MB (7 MB of that is the History `.site.json` files, fetched only when the lab updates the History site's missed list); GitHub Pages compresses them to roughly a third. Locally: `python3 -m http.server 8000`.
2. **Lab server** (Cloudflare, connected to this repo, or `npx wrangler deploy`):
   - Create a D1 database (Storage & Databases → D1 → Create, name `study-lab`) and put its id in `wrangler.toml`.
   - Add a secret `ADMIN_KEY` (worker → Settings → Variables and Secrets, type **Secret**). It signs logins, so set it before anyone logs in.
   - Deploy from the repo, not by pasting `worker/lab-worker.js` into the dashboard editor: it uses `js/engine/calibration.js`, which wrangler bundles in.
   - `wrangler.toml` already has the rest: the worker's name, `MAIN_URL` (the bowl sites' worker, which checks passwords), `ADMIN_USERS = "kizuruki"`, and the `global_fetch_strictly_public` flag, which lets this worker call the bowl sites' worker on the same workers.dev subdomain.
3. **Addresses:** `js/config.js` has the two worker addresses. `LAB_URL` assumes the worker is `competitiveacademicslab` on the same subdomain as the bowl sites' worker; change it if yours is different.

Nothing changes on the History Bowl or Geography Bowl sites or their worker: the lab uses the routes they already have.

## How it works

### 1. Accounts and progress

Students log in with their History Bowl / Geography Bowl account; the lab server checks the password with the bowl sites' worker and gives the browser a signed login token (90 days). New students can create an account from the lab, which creates it on the bowl sites.

Everything a student does is an event in one append-only log on the lab server, so it follows them to any device. The browser keeps only the login and the events not yet sent (an "outbox", sent every few seconds and when the tab closes), so nothing is lost if the connection drops.

Leaving a session partway — another page, closing the tab — keeps everything done so far: each answer is saved as it happens, and the time so far is recorded. The session shows as unfinished; it can be continued (the same planned clues, the time adds up) or ended there, which logs it as stopped early with what was done. Calibration methods and check-ins can be left and continued the same way.

Only the coach account (`kizuruki`, or anyone in `ADMIN_USERS`) sees the coach view and the research settings; the lab server refuses the coach's routes to anyone else.

### 2. The methods

Eleven methods, each from a line of research on what helps people remember. Testing yourself and spreading practice out are the best-supported techniques (Dunlosky et al., 2013), so every method makes you produce or pick answers, and reviews come back spaced out.

| Method | What you do | Why |
|---|---|---|
| Flashcards | See each clue with its answer, then recall the answer until you get it | Practice testing (Dunlosky et al., 2013) |
| Tossups | Clues read out one at a time, in a random order; buzz when you know it | Recall in the competition's own format |
| Read & recall | Read short passages, then recall what they said | Read-recite-review beat rereading and note-taking (McDaniel et al., 2009) |
| Matching | Match clues to answers on boards | Recognition practice: easier, a gentle first look |
| Guess first | Guess each answer before you see it, then learn and recall it | Pretesting: trying first helps even when wrong (Pan & Sana, 2021; Pan & Rivers, 2023) |
| Letter hints | Recall with hints that shrink: every other letter, first letters, none | Diminishing cues (Fiechter & Benjamin, 2018); generation effect (Bertsch et al., 2007) |
| Quiz show | Pick from four answers of the same kind | Multiple choice with plausible choices and feedback helps learning (Little & Bjork, 2014) |
| Lightning round | 60-second rounds, points, streaks, a personal best | Game elements improve learning on average, g ≈ 0.49 (Sailer & Homner, 2020) |
| Sure or not? | Say how sure you are before you find out; confident mistakes come back first | Confident errors are the ones feedback fixes best (Metcalfe, 2017) |
| Connect it | Write one thing each answer connects to; your notes come back in reviews | Elaborative interrogation, moderate support (Dunlosky et al., 2013) |
| Tossup duel | Tossups against an AI that buzzes too and gets faster as you win | Competition adds game motivation to recall |

Left out on purpose: rereading, highlighting, summarizing and the keyword mnemonic, which rated low (Dunlosky et al., 2013); interleaving, which helps with categories but not word-like facts (Brunmair & Richter, 2019); and matching study to a "learning style", which hasn't held up when tested (Pashler et al., 2008). The lab's answer to learning styles is to measure, for each student, which methods actually work — and how much they keep at each.

### 3. Calibration: measuring methods fairly

Each method a student calibrates teaches a different invented civilization (`content/fantasy-world.json`): four civilizations with the same 15 kinds of answer each (ruler, general, river, treaty, poem and so on), four clues per answer, and a five-chapter story each. Because the facts are made up, nobody starts ahead, and nothing learned with one method helps with another. `scripts/check-world.mjs` checks that every clue is backed by its story, review wording differs from study wording, no clue names its answer, no two invented names are close enough to confuse the answer checker, and (optionally) none matches any of the 16,000 real History or Geography answers.

There are four civilizations and eleven methods, so each student calibrates four (three in the quick survey). The lab server hands out participant numbers in order; consecutive students take different sets of four, so any eleven students between them calibrate every method, and within a set the civilization and order rotate (a balanced Williams Latin square). The coach can pick their own four. Methods a student doesn't calibrate are measured in real study (section 5).

- **Full calibration:** 4 methods × 60 clues. **Quick survey:** 3 methods × 24 clues.
- Each step: study with the method (only active time counts), optional extra practice, enjoyment and effort ratings, then a test on every clue seen, in different wording. Check-ins open 1, 3, 7 and 14 days later; a missed one is skipped and the next still counts.
- Measured (`js/engine/metrics.js`): **learned per hour** (clues × share right on the test ÷ hours), **kept at 30 days** (the FSRS forgetting curve fitted to the test and check-ins), **durable per hour**, and **engagement** (enjoyment, extra practice, stopping early — not time, since everyone studies the same clues).
- **A test taken late** (more than 30 minutes after the studying, say after an interruption) counts as a delayed test: its score goes on the forgetting curve at the delay it was actually taken, and "learned" is read off the curve at zero once check-ins are in. The step's row on the Calibration page says how late it was.
- **Redoing one method** (an attempt that went wrong): the coach uses **Redo one** next to the student in the Coach view, or the Redo button on their own Calibration page. The attempt is set aside (its answers stay in the log but no longer count) and the method is studied again on a civilization the student hasn't seen — the quick survey leaves one free. Facts already seen can't be measured fairly a second time, so when none is left (a full calibration uses all four) the method is set aside and measured from real study instead. A lab already open on another device picks up the redo rather than saving its old copy over it. **Reset all** clears a student's whole calibration.

### 4. Personalization

`js/engine/personalize.js` keeps three numbers per method for each student: clues learned per hour, share kept at 30 days, and engagement. **Weekly yield = learned per hour × share kept × weekly hours × engagement**, so "10 hours at 100 clues an hour beats 2 hours at 200": a method the student sticks with can win even if it's slower.

Each number starts from a **blueprint** — neutral guesses, or the class's calibration results once 5 students have results for a method — and moves toward the student's own results as they come in. The method for each study session is chosen by Thompson sampling: each number is drawn from its uncertainty and the method with the highest yield in that draw is used, so a clear winner is picked almost always and a method that might still be best (including ones never tried) gets tried now and then. The Results page shows each method's chance of being best.

### 5. Real study

`scripts/import-packs.mjs` turns both question banks into packs of single-fact clues:

- **Geography:** every question is one clue, keeping the site's question id.
- **History:** tossups split into sentences (pronunciation guides and "for ten points" removed); quarter-3 questions are single clues with their category in front ("Andrew Jackson: Represented what political party?"). Each clue keeps its question's History-site key. Bonuses aren't used yet.
- Answers are grouped to count how often each comes up; a feature word is dropped only when unambiguous ("Nile River" joins "Nile"; "Arabian Sea" and "Arabian Peninsula" stay apart). Each clue keeps its own answer line, shown and checked exactly as on its site (lenient for Geography, strict for History, with the sites' own `answer-match.js`).

A session: **missed questions first**, then reviews FSRS says are due, asked on their own as typed questions (AI rewordings from `scripts/rephrase.mjs` when a pack has them); then **new clues** with the chosen method at the student's pace — most-asked answers first, each answer's next clue worth a bit less, a History tossup's clues together, History and Geography alternating when both are selected. After the planned clues they can keep going. There's also a missed-questions-only session.

Every session also counts as evidence for its method: the share of its new clues answered right the next time they come up, at however many days later, gives a learned-per-hour and kept-at-30-days estimate the same way calibration does (counted at half weight, since real clues aren't controlled). Because methods are drawn at random and new clues come from the same queue whatever the method, the methods get comparable clues over time. Engagement in real study is how far past the plan the student goes, or how short of it they stop.

Memory rules (`js/engine/memory.js`, FSRS-6 via ts-fsrs 5.4.2): only the first answer to a clue each day counts; wrong → Again, slow (over 15 s) → Hard, right → Good, tossup buzz on the first clue → Easy; picking from choices (matching, quiz show) counts as Hard at best; guesses before learning and hinted answers are practice only. Tossups credit clue by clue: the clue you buzzed on counts, clues read before it get asked on their own later, unread ones aren't touched. "I was right" corrects the answer checker.

### 6. Working with the bowl sites (`js/sitesync.js`, `js/sync.js`)

The lab acts like each site's practice mode, through the sites' own routes:

- **Right** → mastered on the site (`POST /events` with mode `lab`; History also adds it to `/mastered/<user>`), so it counts for assignments, the mastery leaderboard and the site's spaced review.
- **Wrong** → added to the site's Missed Questions (`/user-blob/<user>/geo-missed` or `history-missed`, in the site's own format, quarter-3 questions by category).
- **Missed, then right on a later day** → mastered, off Missed Questions, and (History) into the site's spaced repetition queue (`POST /spaced/<user>`).
- A History tossup is several clues in the lab: it's mastered on the site once all its clues are right, and missed as soon as one is missed. Geography questions are one clue each.
- Only the first answer to a clue each day counts, and only answers the student produced (not matching or quiz-show picks).
- Changes go out every few seconds and when a session ends. If a site is open in another tab at the same time, its next save can overwrite what the lab just added to its missed or mastered list.

The other way: at login (every few hours) the lab brings in what the student has done on the sites — questions answered right (`/review-pool`) count as learned and come back as reviews instead of as new clues, spread out at about 25 a day; questions on a site's Missed list come in as missed. Team assignments from both sites show on the plan page.

### 7. Pace, plans and the coach

- **Pace** (`js/engine/pace.js`): new clues per hour move between 50, 75, 100, 150 and 200, starting at 100. Up when reviews are 85%+ right with at most 15% overdue and 80% of planned minutes studied; down when below 70% right or over 30% overdue; at least 30 reviews between changes.
- **Plan** (`js/engine/planner.js`): the student's weekly minutes over their study days, reviews first. With a coach's **target** (clues still known in 30 days, per week): new clues = target ÷ share kept, minutes = new clues ÷ pace + review time — so a faster learner needs fewer minutes and a slower one more, weak recall means more review time and strong recall more new clues; over the weekly cap the target is lowered instead.
- **Coach view** (`#/coach`): every student's last activity, pace, mastered and missed counts, best method so far and calibration progress; a class target and per-student targets; redoing one method or resetting a student's whole calibration; the blueprint; calibration results as CSV.

## Lab server routes

Students (with the login token): `POST /lab/login`, `POST /lab/register`, `GET /lab/me`, `GET /lab/log?after=`, `POST /lab/log` (events, state, calibration results), `POST /lab/participant`, `GET /lab/blueprint` (names hidden). Coach (an admin token, or the admin key): `GET /lab/admin/students`, `GET /lab/admin/events?user=`, `PUT /lab/admin/config`, `POST /lab/admin/reset/<user>`, `POST /lab/admin/redo/<user>` (`{step}`), `DELETE /lab/admin/student/<user>`.

## Data

| Event | Fields |
|---|---|
| `expose` | a clue shown with its answer: `clue, answer, pack, method, sessionId` |
| `answer` | an attempt: `clue, correct, ms, method, sessionId, phase, format`, optional `credit`, `cluesRead`, `duel` (tossups), `pretest`, `cue`, `confidence`, `calib`, `checkinDay`, `override`, `spreadDue` |
| `session-start`, `session-pause`, `session`, `session-discard` | a session's plan, time when left partway, and summary |
| `note` | a Connect-it note on a clue |
| `checkin`, `calibration-start`, `pace` | bookkeeping |

`phase`: `study`, `immediate`, `checkin`, `review`, `import`. The student's state (settings, calibration steps, pace, blueprint, site-sync bookkeeping, personal bests) is saved with the log.

## Files

```
index.html, css/lab.css
js/config.js    server addresses and the coach account
js/engine/      memory (FSRS), calibration, metrics, personalize, pace, planner, util — no DOM, unit-tested
js/methods/     flashcards, tossup, duel, story, matching, guess, hints, choice, lightning, confidence, connect, quiz, common
js/views/       home (login), calibrate, run (the session frame), study, plan, results, settings, teacher (coach)
js/store.js     the log, online    js/model.js  everything derived from it
js/sitesync.js  lab → bowl sites   js/sync.js   bowl sites → lab, blueprint, coach calls
content/        fantasy-world.json, packs/ (built; <pack>.site.json has what History's missed list needs)
scripts/        build_world.py, check-world.mjs, import-packs.mjs, rephrase.mjs
worker/         lab-worker.js      wrangler.toml
test/           engine, simulation, content, worker tests; browser/e2e.mjs
vendor/         ts-fsrs (MIT), answer-match.js (from the bowl sites)
```

## Scripts and tests

```sh
npm test                    # engine, simulation, packs and answer checking, lab worker (Node 22.5+)
npm run test:browser        # a bot student through everything (needs Playwright)
npm run check-world         # add the two site repos as arguments to check against real answers
npm run import-packs        # rebuild content/packs from ../geographybowlreview and ../historybowlreview
ANTHROPIC_API_KEY=… npm run rephrase -- --pack geo-europe-russia --limit 500
```

The browser test serves the site, runs the lab worker on SQLite and a stand-in for the bowl sites' worker, and goes through: logging in, site history coming in, a quick calibration left partway and continued, check-ins a day and a week later, a session with each of the eleven methods, a session left and continued and another ended early, the practice-mode rules on both sites, the coach view and targets, the same student on a second device, and the coach redoing one of the student's methods while the student's lab is open.

## Not done yet

- **AI rewordings** haven't been generated; real-pack reviews use the original wording until they are. `scripts/rephrase.mjs` is ready and needs an API key.
- **More civilizations**, so one student can calibrate every method instead of four.
- **Bonuses**, and History quarter-4 questions.
- **Other kinds of competitions and AP study are left out for now**: math, multiple choice, reasoning questions with explanations. When math comes: skill tags per step and an error-type report — an arithmetic slip in a related-rates problem shouldn't count against related rates or differentiation, but should bring more arithmetic-heavy related-rates problems.

## Sources

- Dunlosky, Rawson, Marsh, Nathan & Willingham (2013). Improving students' learning with effective learning techniques. *Psychological Science in the Public Interest* 14(1).
- McDaniel, Howard & Einstein (2009). The read-recite-review study strategy. *Psychological Science* 20(4).
- Pan & Sana (2021), pretesting versus posttesting; Pan & Rivers (2023), metacognitive awareness of the pretesting effect, *Memory & Cognition*.
- Fiechter & Benjamin (2018). Diminishing-cues retrieval practice. *Psychonomic Bulletin & Review*.
- Bertsch, Pesta, Wiscott & McDaniel (2007). The generation effect: a meta-analytic review. *Memory & Cognition*.
- Little & Bjork (2014), competitive multiple-choice alternatives; Butler & Roediger (2008), feedback after multiple choice.
- Sailer & Homner (2020). The gamification of learning: a meta-analysis. *Educational Psychology Review* 32.
- Metcalfe (2017). Learning from errors. *Annual Review of Psychology* 68.
- Brunmair & Richter (2019). Similarity matters: a meta-analysis of interleaved learning. *Psychological Bulletin* 145.
- Pashler, McDaniel, Rohrer & Bjork (2008). Learning styles: concepts and evidence. *Psychological Science in the Public Interest* 9(3).
- Rawson & Dunlosky (2022), successive relearning; Wang & Tahir (2020), the effect of Kahoot! for learning, *Computers & Education*.
