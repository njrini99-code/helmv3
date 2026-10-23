# Clubhouse work queue: what is left and who has it

Updated 2026-10-22, after the merge trains landed. This is the single list
of open Clubhouse and CoachHelm work. Read it with [STATUS.md](STATUS.md)
(current state, rollout, rollback) before you start anything.

The rows come from a missing-work audit, the "supercharge 04" output specs
and the CoachHelm design call (D1 to D8). Those three live in the Claude
Project's knowledge, not in this repo. The table below now holds **all 180
audit rows** (the audit's 179 ids plus chs-63, see the note under the table),
each with its current status, and "Design call and output specs" maps the
design call's decisions and the output specs' layouts to those rows.
Statuses are the audit's evidence checked against `main`'s PR history on
2026-10-22; the audit's file and line checks were not rerun. **Before anyone
starts work that is not in this table, add a row for it first**, with its id,
a short description and its area, in the same commit as the claim.

Why this page exists: on 2026-10-21 about 22 PRs from parallel threads edited
the same files and picked the same Bridge IDs and CH codes. #2294 and #2292
both took Bridge IDs 130742 to 130745; #2299 reused CH-13971 and CH-13972
(main's correction chips) and CH-13996 (#2297's). Claims and reserved ranges
stop that.

## How to claim

1. **Check nobody has it.** `git fetch origin`, then look for the row id in
   this file on `main` and on open branches
   (`git grep -n '<row-id>' $(git branch -r --list 'origin/claude/*'
   'origin/agent/*') -- docs/clubhouse/QUEUE.md`), and run
   `gh pr list --state open --search '<row-id>'`.
2. **Claim before you start.** Your first commit on your branch edits this
   file: put your thread or session and your branch in the row's "Claimed
   by" cell, set the status to "in progress", and reserve the Bridge IDs and
   CH codes you will use (see below). Push that commit at once. CI runs only
   on pull requests and on `main`, so a push to a branch with no PR costs no
   runner minutes.
3. **One row is one claim.** You may hold several rows, but only in one area.
4. **One thread per area at a time.** The areas are the five in the
   reserved-numbers table at the end of this page. If an area is already
   claimed by another thread, pick a different area or wait. Two more labels
   appear in the queue, Owner and Production rollout. They mark rows that only
   the owner (a device, a review, a deploy or a flag) or the Production
   rollout thread (migrations) can finish; no area thread claims them.
5. **One PR per area, not per row.** Keep it a draft until the area's
   claimed rows are done. The owner folds ready PRs into a merge train.
6. **Base on the latest `main` and merge `main` before you push.**
7. **Never hand-edit generated files.** Regenerate them after merging main:
   `src/clubhouse/preview/component-catalog.json`,
   `docs/clubhouse/generated/*`, `src/lib/flags/registry.generated.ts` and
   `docs/generated/*`.
8. **When a row is done,** set its status and PR in the same PR that does it.
   A row is "done" only once that PR is merged.

## Statuses

| Status | Meaning |
| --- | --- |
| open | Nobody has it; claim it |
| in progress | An open PR does it (the train is named when one carries it) |
| held | Waits on a migration, flag, owner setting or named trigger |
| done | Merged to `main` |
| closed | No work: retired in the audit, by design, or found already done |

## Trains (2026-10-21, landed 2026-10-22)

<!-- markdownlint-disable MD013 -->

| Train | PR | Area | Landed |
| --- | --- | --- | --- |
| 1 | #2310 (merged) | CoachHelm engine | #2306, #2292, #2300 and the Codex review fixes; #2283 and #2288 landed on their own |
| 2 | #2312 (merged) | CoachHelm board UI | #2303, #2305, #2297, #2290, #2298; #2294 landed on its own |
| 3 | #2316 (closed) | Clubhouse parity & pages | #2293, #2295 and #2317 (the rebuilt #2307) landed on their own; #2287 landed on its own later |
| 4 | #2314 (merged) | Clubhouse fixes | #2282; #2279 and #2284 landed on their own |

<!-- markdownlint-enable MD013 -->

Threads landed nine of the trains' PRs on their own while the trains were
being built, which made every train conflict again. That is what the claim
rules above and rule 10 of `PROJECT_INSTRUCTIONS.md` stop.

Landed since the trains, each on its own: #2287 (Team Hub redesign,
par-24 and par-28), #2299 (coach Brief, par-05, rebased onto fresh IDs
and codes), #2289 (Classes import race), #2285 (announcement
acknowledgements policy), #2217 (iOS edge swipe; its real-phone checklist
still has to run before the next TestFlight build, doc-37), #2319
(coach-only availability note), and #2313 with #2323 (CoachHelm copy
names no clubs, v2 and v3). #2309 was closed and #2323 carries its
change. One PR is open on queue rows: #2328 (chs-37 and chs-39).

## The queue

Cells in "What" are short; the audit and the PR hold the detail. #2295 closes
its rows together and does not map them one to one.

<!-- markdownlint-disable MD013 -->

| Row | What | Area | Status | PR | Claimed by |
| --- | --- | --- | --- | --- | --- |
| par-01 | Coach parity gap closed by #2295 (coach player pages, coach Home, roster availability, coach Title, roster print) | Clubhouse parity & pages | done | #2295 | claude/project-thread-icincd |
| par-02 | As par-01 | Clubhouse parity & pages | done | #2295 | claude/project-thread-icincd |
| par-03 | As par-01 | Clubhouse parity & pages | done | #2295 | claude/project-thread-icincd |
| par-04 | As par-01 | Clubhouse parity & pages | done | #2295 | claude/project-thread-icincd |
| par-05 | Coach Brief: the team view behind `/intelligence` (`?view=brief`), behind `coachhelm_monday_brief_v1` | Clubhouse parity & pages | done | #2299 | claude/coachhelm-coach-brief |
| par-06 | As chs-07 (engine state on reads: support, cause, lifecycle, verdicts) | CoachHelm engine | done | #2247 | |
| par-07 | As chs-19 (team patterns on the coach Board) | CoachHelm board UI | done | #2251 | |
| par-08 | As par-01 | Clubhouse parity & pages | done | #2295 | claude/project-thread-icincd |
| par-09 | Game Fingerprint: CoachHelm count lines under each Game detail section | Clubhouse parity & pages | done | #2307, #2295 (landed in #2317) | claude/coach-parity-bridges |
| par-10 | Team rounds: a coach's Rounds is a Clubhouse screen, not a redirect to Team stats | Clubhouse parity & pages | done | #2293 | claude/project-thread-eitv8h |
| par-11 | Coach note on a round review | Clubhouse parity & pages | done | #2293 | claude/project-thread-eitv8h |
| par-12 | Team-grid leg figure opens that player's Game detail section | Clubhouse parity & pages | done | #2281 | |
| par-13 | As chs-15 (Track record view) | CoachHelm board UI | done | #2253 | |
| par-14 | As chs-21 (course plan) | CoachHelm board UI | done | #2252 (coach half), #2333 | claude/coachhelm-round-prompts |
| par-15 | As par-01 | Clubhouse parity & pages | done | #2295 | claude/project-thread-icincd |
| par-16 | As par-01 | Clubhouse parity & pages | done | #2295 | claude/project-thread-icincd |
| par-17 | Coach's player Stats hero has a CoachHelm button | Clubhouse parity & pages | done | #2281 | |
| par-18 | Goals: a player sets a goal on the Development tab | Clubhouse parity & pages | done | #2293 | claude/project-thread-eitv8h |
| par-19 | Goals: accept or dismiss suggested goals; coach pauses, resumes or abandons. The empty state is done (#2281) | Clubhouse parity & pages | done | #2293, #2281 | claude/project-thread-eitv8h |
| par-20 | As par-01 | Clubhouse parity & pages | done | #2295 | claude/project-thread-icincd |
| par-21 | Roster detail: CoachHelm block and strokes-by-leg line on the roster peek and phone profile | Clubhouse parity & pages | done | #2307, #2295 (landed in #2317) | claude/coach-parity-bridges |
| par-22 | What's new is a Clubhouse screen for a coach | Clubhouse parity & pages | done | #2293 | claude/project-thread-eitv8h |
| par-23 | Retired in the audit (per #2293) | Clubhouse parity & pages | closed | | |
| par-24 | Coach's Team Hub nav item shows the team's overdue tasks | Clubhouse parity & pages | done | #2287 | claude/project-thread-ya6ije |
| par-25 | Ask CoachHelm is coach-only: by design (no player Ask, owner decision 2026-10-19, design call D7) | CoachHelm board UI | closed | | |
| par-26 | Retired in the audit (per #2293) | Clubhouse parity & pages | closed | | |
| par-27 | Retired in the audit (per #2293) | Clubhouse parity & pages | closed | | |
| par-28 | Players get a Tasks tab in Team Hub; task links land on it | Clubhouse parity & pages | done | #2287 | claude/project-thread-ya6ije |
| par-29 | Player-only round entry: by design (per #2295) | Clubhouse parity & pages | closed | | |
| par-30 | Player-only classes and My qualifiers: by design (per #2295) | Clubhouse parity & pages | closed | | |
| par-31 | Coach-only management screens: by design (per #2295) | Clubhouse parity & pages | closed | | |
| chs-01 | Slice 0: Deep dive reads open with What, Why, Next and When, in the coach's and the player's voice | CoachHelm board UI | done | #2214, #2295, #2303 | |
| chs-02 | As chs-04 (player Board capped at 3 reads and 1 strength, no zero-stroke text) | CoachHelm board UI | done | #2215 | |
| chs-03 | The templated placeholder cause is no longer drawn on the Deep dive | CoachHelm board UI | done | #2213 | |
| chs-04 | Player Board shows 3 reads and 1 strength | CoachHelm board UI | done | #2215 | |
| chs-05 | Slice 0b: stamped read windows, round floors, revision key, freshness sweep (flag `coachhelm_reads_v1_copy`; preview on, production off) | CoachHelm engine | done | #2223 | |
| chs-06 | Delivery: newest copy wins, overlapping reads fold into one, cap 3 reads and 1 strength (same flag) | CoachHelm engine | done | #2224 | |
| chs-07 | Slice 1: support words and the claim ladder (the How sure row) with a range (flag `coachhelm_support_v1`) | CoachHelm engine | done | #2219, #2241, #2242, #2247 | |
| chs-08 | Slice 2: the cause in three honest states (counted, likely, not traced), replacing the placeholder (flag `coachhelm_root_cause_diagnosis`) | CoachHelm engine | done | #2221, #2247 | |
| chs-09 | Slice 3: lifecycle words Cleared, Contradicted and Under review, plus a Cleared list (flag `coachhelm_recheck_v1`) | CoachHelm engine | done | #2232, #2247 | |
| chs-10 | Slice 4: a verdict on each focus area (Worked, Moved, Did not move, Got worse, Too early, Can't tell) (flag `coachhelm_verdicts_v1`) | CoachHelm engine | done | #2227, #2247 | |
| chs-11 | Verdict loop on focus areas (flag `coachhelm_verdicts_v1`, off) | CoachHelm engine | done | #2300 (landed in #2310) | claude/coachhelm-verdict-loop |
| chs-12 | Why do you think so? audit lines on a read (Counted, Rounds, Compared to, Test, Would change if, Checked); draws once the engine writes them (flag `coachhelm_support_v1`) | CoachHelm board UI | done | #2247 | |
| chs-13 | Correction chips under a read's audit (flag off) | CoachHelm board UI | done | #2291 | |
| chs-14 | Slice 6a: learning from corrections (coach weights, ranking, cause line) (flag `coachhelm_corrections_v1`). The chips that write corrections are chs-13 | CoachHelm engine | done | #2226 | |
| chs-15 | Slice 6b: Track record page (held on recheck, precision per rung, corrections) (flag `coachhelm_track_record_v1`) | CoachHelm board UI | done | #2253 | |
| chs-16 | Slice 5a insight angles: lie-adjusted approach, bad-day floor, three-putt autopsy, miss-cost compass (flag `coachhelm_insight_angles_v1`) | CoachHelm engine | done | #2229 | |
| chs-17 | Slice 5b counted families: par-3 tee split, strokes gained per approach band, lag leave, under-reading (same flag) | CoachHelm engine | done | #2248 | |
| chs-18 | Slice 7a: team pool benchmark words (flag `coachhelm_team_pool_v1`). The audit found the coach Board card does not draw the team line; not rechecked | CoachHelm engine | done | #2238 | |
| chs-19 | Slice 7b: Team pattern rows on the coach Board (flag `coachhelm_team_pattern_v1`) | CoachHelm board UI | done | #2251 | |
| chs-20 | Same-day field context on bad-day-floor and pressure reads | CoachHelm engine | done | #2251 | |
| chs-21 | Slice 7c: Course plan from a player's own history on a course. The coach has it (flag `coachhelm_course_plan_v1`); #2333 draws the player copy on the player Board | CoachHelm board UI | done | #2252 (coach half), #2333 | claude/coachhelm-round-prompts (CH-13916, CH-13917, CH-13233, CH-13333) |
| chs-22 | Slice 8a: one-tap putt miss prompt after a missed putt. Fairway round entry only (flag `coachhelm_data_gap_prompt_v1`); Clubhouse round entry has none. Left alone by #2293 | CoachHelm board UI | done | #2333 | claude/coachhelm-round-prompts (CH-11960, Bridge 110760) |
| chs-23 | Slice 8b: course-picker nudge and recovery-lie tap (flag `coachhelm_data_prompts_v2`). Fairway round entry only until #2333; the `lie_after_recovery` column is applied | CoachHelm board UI | done | #2333 | claude/coachhelm-round-prompts (CH-11961, CH-11962, Bridge 110761, 110762) |
| chs-24 | Optional club chip on approaches: not built on purpose, CoachHelm names no clubs | CoachHelm engine | closed | | |
| chs-25 | Level anchors (hs and div) and a GolfHelm-wide benchmark pool: owner decision Q-88, Tour and teammates only | CoachHelm engine | closed | | |
| chs-26 | One-team canary for the v3 flags (env `HELM_COACHHELM_TEAMS`) | CoachHelm engine | done | #2258 | |
| chs-27 | Out-of-date notice on a read when a newer round exists (CH-13903) | CoachHelm board UI | done | | |
| chs-28 | Coach Monday brief, view and Monday 05:00 delivery (flag `coachhelm_monday_brief_v1`, production off) | CoachHelm engine | done | #2292 (landed in #2310) | claude/coachhelm-monday-brief |
| chs-29 | CoachHelm side of coach parity (#2295) | Clubhouse parity & pages | done | #2295 | claude/project-thread-icincd |
| chs-30 | Round review: CoachHelm 30-second debrief | CoachHelm board UI | done | #2298 (landed in #2312) | claude/coachhelm-round-debrief |
| chs-31 | Coach Board header: one sentence plus "Since you were last here" | CoachHelm board UI | done | #2294 | |
| chs-32 | Coach Board path line (D2 grammar) | CoachHelm board UI | done | #2294 | |
| chs-33 | Cut PriPill, ReadMeter, Gauge and the drill well from the card | CoachHelm board UI | done | #2294 | |
| chs-34 | "No reads yet" becomes a By player row | CoachHelm board UI | done | #2294 | |
| chs-35 | Deep dive: one-sentence hero and one read ledger | CoachHelm board UI | done | #2297 (landed in #2312) | claude/coachhelm-deepdive-ledger |
| chs-36 | Standing: "Where strokes go" ladder replaces Most to gain | CoachHelm board UI | done | #2290 (landed in #2312) | claude/coachhelm-strokes-ladder |
| chs-37 | Game profile folds into Standing (out of scope of #2290) | CoachHelm board UI | done | #2328 | claude/coachhelm-standing-ask (CH-13913 to CH-13915, Bridge 130760 to 130762) |
| chs-38 | Deep dive: "Where it happened" example holes | CoachHelm board UI | done | #2297 (landed in #2312) | claude/coachhelm-deepdive-ledger |
| chs-39 | Coach Ask: an answer that names a read links to that player's Deep dive | CoachHelm board UI | done | #2328 | claude/coachhelm-standing-ask (CH-13914, Bridge 130761) |
| chs-40 | Coach voice from the stored `coach_copy`, regex as fallback (#2306 writes it) | CoachHelm board UI | done | #2303, #2306 (landed in #2310, #2312) | claude/coachhelm-coach-voice |
| chs-41 | PR #2073 root map, Team roots, leak ladder and summary cards: PR closed 2026-10-21 as superseded, UI not carried over | CoachHelm board UI | closed | #2073 (closed) | |
| chs-42 | PR #2073 would have turned on nine Fairway CoachHelm flags: PR closed 2026-10-21, the flips were never applied | CoachHelm engine | closed | #2073 (closed) | |
| chs-43 | As chs-29 | Clubhouse parity & pages | done | #2295 | claude/project-thread-icincd |
| chs-44 | As chs-29 | Clubhouse parity & pages | done | #2295 | claude/project-thread-icincd |
| chs-45 | Q7 strokes gained by leg: diverging bars, likely-range whisker, hollow early reads, pinned readout | Clubhouse parity & pages | done | #2225 | |
| chs-46 | Q3 thin samples muted (Early read, N rounds), floors table | Clubhouse parity & pages | done | #2225 | |
| chs-47 | Q4 colour a change only past one standard error, else No clear change | Clubhouse parity & pages | done | #2230 | |
| chs-48 | Data-driven strokes-gained gauge and track scales, one putts basis on Home and the Rounds library, tokens, phone holes-filter bug | Clubhouse parity & pages | done | #2230 | |
| chs-49 | Q1 better is up: inverted score axes with Lower is better, Rounds library flipped | Clubhouse parity & pages | done | #2230, #2234 | |
| chs-50 | Q8 trend of rounds: a dot per round, 5-round mean from round 3, pin, Open round | Clubhouse parity & pages | done | #2234 | |
| chs-51 | Q9 putting by distance: dot per band, Wilson whisker, made and attempts, Tour curve, Needs 10 putts | Clubhouse parity & pages | done | #2235, #2257 | |
| chs-52 | Q11 scoring mix bar centred on par, counts on tap | Clubhouse parity & pages | done | #2236 | |
| chs-53 | Q10 team ranked dot plot with ties, metric menu, tap to open a player | Clubhouse parity & pages | done | #2237 | |
| chs-54 | Q5 page range in rounds (Last 5, 10, 20, Season, Qualifiers) with vs previous N | Clubhouse parity & pages | done | #2257 | |
| chs-55 | Q2 and Q13 one interaction model: drag-scrub, tap pins, hover and keys move the same header readout | Clubhouse parity & pages | done | #2225, #2234 | |
| chs-56 | Team-grid leg figure opens Game detail (with par-12) | Clubhouse parity & pages | done | #2281 | |
| chs-57 | Q14 keep the four player Stats tabs (Overview, Game detail, Rounds, Development): nothing to build | Clubhouse parity & pages | closed | | |
| chs-58 | Fraction stats as a compact bar with a benchmark tick; proximity and miss maps restyled: dropped, they keep their look | Clubhouse parity & pages | closed | | |
| chs-59 | Dumbbell chart: two windows or two players on one axis. Deferred on purpose, not built | Clubhouse parity & pages | held | | |
| chs-60 | Tournament boundaries as ticks on the trend x-axis. Deferred on purpose, marked later in the spec | Clubhouse parity & pages | held | | |
| chs-61 | Focused visual pass on Clubhouse Stats and CoachHelm | Clubhouse parity & pages | done | #2211 | |
| chs-62 | SG and stats cache numbers corrected: held migrations `20260930150000` (SG penalty fix) and the OD-01 chain from `20260924120000` (percentile floor `20260925120000` included). Each needs its own owner decision | Clubhouse parity & pages | held | | |
| chs-63 | Idle players' reads refresh nightly (6 a night, oldest first) and two duplicate-write holes close (flag `coachhelm_stale_refresh_v1`, off in preview too). The audit listed it a second time as chs-41 | CoachHelm engine | done | #2288 | |
| doc-01 | D-72: empty sections draw the shape of what will fill them | Clubhouse fixes | done | #2202 | |
| doc-02 | D-73: the live motion duration set is written into the rules and pinned by a test | Clubhouse fixes | done | #2202 | |
| doc-03 | D-74: the sidebar fold keeps its width spring; its frame cost is still to be measured on a production build in Safari before turn-on | Owner | held | #2201 (the spring) | |
| doc-04 | D-75: desktop keyboard layer (Cmd+K palette, G-then-letter, ? sheet, tooltips, right-click menus) | Clubhouse fixes | done | #2202 | |
| doc-05 | D-76: Clubhouse date and time fields replace every browser date and time input | Clubhouse fixes | done | #2202 | |
| doc-06 | Recruiting Due field uses the app's date field: found already done | Clubhouse fixes | closed | #2284 | |
| doc-07 | A 12 or 24-hour time choice in Clubhouse Settings (D-76), kept on the device and followed by every Clubhouse time | Clubhouse parity & pages | done | #2334 | claude/project-thread-a106un; Bridge items 80-89 and CH suffixes 80-89 on P008 and P003; uses CH-8980 (80780) |
| doc-08 | D-77: Clubhouse screens for reset password, join by code, staff invite, coach onboarding, coach pending and demo, behind `golf_clubhouse_front_door` (production off); the P015 device checklist is unticked | Owner | held | #2202 | |
| doc-09 | D-78: the native launch colour changes to Clubhouse's in the native build that ships with Clubhouse on. Deferred on purpose: needs a native build | Owner | held | | |
| doc-10 | D-79: a finished round becomes a scorecard to keep (settles in once, prints on one page, exports an image) | Clubhouse parity & pages | done | #2202 | |
| doc-11 | Busy buttons stay lit while saving; roving arrow-key focus in choice groups | Clubhouse fixes | done | #2202 | |
| doc-12 | As par-01 | Clubhouse parity & pages | done | #2295 | claude/project-thread-icincd |
| doc-13 | Team stats print: the leg grid narrows on paper | Clubhouse parity & pages | done | #2281 | |
| doc-14 | Qualifier leaderboard prints on one sheet with a print head | Clubhouse parity & pages | done | #2202 | |
| doc-15 | Calendar Print and Duplicate | Clubhouse parity & pages | done | #2202 | |
| doc-16 | Completion-plan audit backlog: qualifier step strip, eyebrows, urgent announcements, red sign-out, putting-ring labels, Settings desktop polish | Clubhouse fixes | done | #2202 | |
| doc-17 | iPad tier at 821 to 1180px (narrower sidebar and gutter) | Clubhouse fixes | done | #2202 | |
| doc-18 | Dynamic Type: phone text follows iOS Text Size | Clubhouse fixes | done | #2202 | |
| doc-19 | Polish waves 2 to 9: toasts (Undo, replace, Dismiss), focus rings, Animations off from the first frame, page-head line, skeletons that match layouts, no-team actions | Clubhouse fixes | done | #2202 | |
| doc-20 | First run: empty team and new player (Invite players stays; a calm block for no rounds) | Clubhouse parity & pages | done | #2202 | |
| doc-21 | On course: the screen stays awake while tracking, putt quick picks, Review and post as the footer primary | Clubhouse parity & pages | done | #2202 | |
| doc-22 | Players see only the meetings they are invited to (Calendar, Home, sidebar, Classes) | Clubhouse parity & pages | done | #2202, #2205 | |
| doc-23 | As par-01 | Clubhouse parity & pages | done | #2295 | claude/project-thread-icincd |
| doc-24 | Head coach identity: sidebar, account sheet and Settings say Head coach | Clubhouse fixes | done | #2202 | |
| doc-25 | Owner 10-16 design: lit green segmented chips, one desktop window material, smooth wheel, no scrollbars, no green side bars, script wordmark, folding icon rail, photo-card course picker | Clubhouse fixes | done | #2201 | |
| doc-26 | Any team member, a player included, can set a course photo (`golf_set_course_image`) | Clubhouse parity & pages | done | #2201 | |
| doc-27 | Delete conversation (a per-person hide) | Clubhouse parity & pages | done | #2185, #2228 | |
| doc-28 | As par-01 | Clubhouse parity & pages | done | #2295 | claude/project-thread-icincd |
| doc-29 | Qualifier privacy: the coach's reasoning is coach-only and the reason is written separately | Clubhouse parity & pages | done | #2209 | |
| doc-30 | Owner decision 1 (10-21): Messages files and qualifier squad-size and entrant edits ship with the Clubhouse flag, with no switch of their own. The migrations behind them are applied (`20260929200000` on 2026-10-21, `20261001130000` on 2026-10-03), so nothing is left to build | Owner | closed | | |
| doc-31 | Q-120: server-side version check on round submit. The app-side check is live; held migration `20261001000000` | Production rollout | held | #2189 (app side) | |
| doc-32 | Attendance privacy: players read only their own RSVP rows, counts come from a definer function. Held migration `20261017102000`; apply after a deploy that carries `attendance-counts.ts` | Production rollout | held | #2201 (app side) | |
| doc-33 | Security S4 step 2: a player can no longer read a teammate's full player row. Held migration `20261017005000`: apply only after a deploy with #2269 and #2276 | Production rollout | held | #2269, #2276 (app side) | |
| doc-34 | Strokes-gained penalty fix and the OD-01 stats cache chain (test rounds counted): same held migrations as chs-62. Each needs its own owner decision | Clubhouse parity & pages | held | | |
| doc-35 | Owner review of the Settings desktop screen (it was built with no handoff) | Owner | held | | |
| doc-36 | Production build and a `clubhouse:perf` re-measure of Stats, Home and CoachHelm | Owner | held | | |
| doc-37 | Owner real-iPhone pass (coach 20 min; player 30 min with airplane mode, Recover, VoiceOver, large text, dark). It also gates doc-38 to doc-41 reaching users, which needs the next App Store build | Owner | held | | |
| doc-38 | Done key over the iOS number pad during a round. In main; reaches users with the next App Store build (see doc-37) | Clubhouse fixes | done | #2228 | |
| doc-39 | iOS app: the edge swipe drags only the pushed screen, bars stay fixed. Landed; the real-phone checklist in the PR has to run before the next TestFlight build (doc-37) | Clubhouse fixes | done | #2217 | |
| doc-40 | iOS offline cold-start reload loop fixed. In main; reaches users with the next App Store build (see doc-37) | Clubhouse fixes | done | #2202 | |
| doc-41 | Push soft ask and a push row in Settings, iPhone app only. In main; reaches users with the next App Store build (see doc-37) | Clubhouse fixes | done | #2256 | |
| doc-42 | Recruit film uploads on now the bucket takes video | Clubhouse fixes | done | #2286 | |
| doc-43 | Server errors tagged `ui=clubhouse` for the canary | Clubhouse fixes | done | #2228 | |
| doc-44 | Saved Sentry search and alert for the canary (needs a Sentry login) | Owner | held | | |
| doc-45 | Name the production rollback deployment in STATUS | docs | done | #2296 | |
| doc-46 | Canary: set `HELM_CLUBHOUSE_TEAMS` to Guilford (and Lynchburg), flip `golf_clubhouse_ui`, deploy, watch a weekday. The owner's step | Owner | held | | |
| doc-47 | Deploy main with the flag off and confirm with `release:status --strict`. The owner's step; no thread deploys | Owner | held | | |
| doc-48 | Q-153: charts and graphics are drawn in place at first paint (no draw-in wipes) | Clubhouse parity & pages | done | #2246 | |
| doc-49 | Tick the PROGRESS motion gates with device evidence | Owner | held | #2239 (reports only) | |
| doc-50 | Phone Roster and Team stats figures render directly, no digit rolling | Clubhouse fixes | done | #2282 (landed in #2314) | claude/clubhouse-no-digit-rolling |
| doc-51 | Recruiting Add no longer duplicates after a lost reply; desktop Roster opens join requests from the notification | Clubhouse fixes | done | #2220 | |
| doc-52 | Typed text is kept in Settings, reset and gate boxes before hydration | Clubhouse fixes | done | #2271, #2274, #2277 | |
| doc-53 | Sign-out clears the service worker's private caches (S2) | Clubhouse fixes | done | #2263 | |
| doc-54 | S1: no account can claim coach access to another organization | Clubhouse fixes | done | #2200 | |
| doc-55 | Password reset email: the Clubhouse screens exist; applying the template to the auth project is an owner production setting | Clubhouse fixes | held | | |
| doc-56 | Round E2E and write journeys in CI | Clubhouse fixes | done | #2208 | |
| doc-57 | Make `clubhouse-quality` a required check: decided 10-21, it stays advisory, no work | Owner | closed | | |
| doc-58 | Practice, Lineups, Events and Scouting in the navigation. Deferred on purpose: no design exists | Clubhouse parity & pages | held | | |
| doc-59 | Home weather and Week N of 12. Deferred on purpose: no season dates or weather source | Clubhouse parity & pages | held | | |
| doc-60 | Invite players by email from Roster (a new server action; no migration) | Clubhouse parity & pages | done | #2334 | claude/project-thread-a106un; same window as doc-07; uses CH-3080 (30680), CH-3180 (30580), CH-3880 (31880), CH-3980 (30780) |
| doc-61 | Classes: two imports at once save a class once (held migration `20261021110000`, applied 2026-10-22) | Clubhouse fixes | done | #2289 | claude/clubhouse-classes-import-race |
| doc-62 | Record the brand decision (white cards, Instrument Sans) in STATUS | docs | done | #2284 | claude/clubhouse-audit-polish |
| pr-01 | As chs-07: CoachHelm v3 slices 0 to 8 are in main; #2283 turned the flags on in preview, production stays off | CoachHelm engine | done | #2283 | |
| pr-02 | Clubhouse is off in production (`golf_clubhouse_ui` production false; #2188 turned it back off after #2180). It stays off until the owner's canary (doc-46) | Owner | held | #2188 | |
| pr-03 | Old CoachHelm root-map redesign, 9 surfaces switched on, summary-card openers (PR #2073): closed as superseded | CoachHelm board UI | closed | #2073 (closed) | |
| pr-04 | As doc-39 | Clubhouse fixes | done | #2217 | |
| pr-05 | As doc-50: phone Roster and Team stats figures render as plain text | Clubhouse fixes | done | #2282 (landed in #2314) | |
| pr-06 | Team stats leads with strokes gained (one 48px lead card): removed by #2257 with the old chart code | Clubhouse parity & pages | closed | #2257 | |
| pr-07 | Security S2 to S8 follow-ups (service worker caches, player-hub staff gate, teammate profiles, participant tenancy). #2206 closed as superseded | Clubhouse fixes | done | #2263, #2269, #2275 | |
| pr-08 | Announcement acknowledgements: coach read scoped to the team (S5, database half). Migrations `20261017101500` and `20261017101600` applied 2026-10-22 | Clubhouse fixes | done | #2285 | |
| pr-09 | As doc-33 (security S3, S4, S8: teammates read through the profile function; the closing policy is held) | Production rollout | held | #2269, #2275, #2276 | |
| pr-10 | As doc-32 (players read only their own RSVP rows) | Production rollout | held | | |
| pr-11 | Teammate-read audit: pgTAP for the profile function, two reads moved to it | Clubhouse fixes | done | #2276 | |
| pr-12 | As doc-52 (sign-in keeps text typed before hydration, with a test) | Clubhouse fixes | done | #2277 | |
| pr-13 | Clubhouse nightly write-journey and round E2E | Clubhouse fixes | done | #2208 | |
| pr-14 | Readiness leftovers: push soft ask, iOS Done key, film hidden (turned on later, doc-42), ui=clubhouse tag, hidden_at probe cache | Clubhouse fixes | done | #2228, #2256 | |
| pr-15 | Course factory end-to-end pipeline (course geometry fixtures, compiler): #2048 closed, branch kept; restart as small slices only if the owner wants it | Owner | closed | #2048 (closed) | |
| pr-16 | Clubhouse premium pass (classic direction, drawn figures, every page) | Clubhouse parity & pages | done | #2162, #2170, #2185 | |
| pr-17 | Clubhouse data fixes: neutral loading frame, typed reads, quieter Sentry | Clubhouse fixes | done | #2157 | |
| pr-18 | Tour-only benchmarks, one definition per stat, strokes-gained penalty and shot-end fix (code). Its database half is doc-34 | Clubhouse parity & pages | done | #2109, #2110 | |
| pr-19 | Team codes sign up players only; signup and action security gaps closed | Clubhouse fixes | done | #2108 | |
| pr-20 | New-round engine moved into `useNewRoundSession` | Clubhouse fixes | done | #2104 | |
| pr-21 | Six branches already in main by squash: course-photo-members, course-picker-premium, fairway-fixes-polish, s1-coach-org-pin, clubhouse-readiness, clubhouse-mac-gates | Clubhouse fixes | done | #2189, #2192, #2200, #2201, #2202, #2211 | |
| pr-22 | Tooling PRs closed unmerged with conflicts: preflight command (#2058), deploy policy doc (#2093), hermetic create-workspace test (#2216). Rebuild #2058 from main only if wanted | docs | closed | #2058, #2093, #2216 (closed) | |
| pr-23 | Housekeeping PRs: #2278 (deno.lock) and #2259 (Bridge telemetry) landed; #2203, #2268, #2249 and #2261 closed as superseded | docs | done | #2278, #2259 | |
| new-01 | Preview player self page uses the player shell | Clubhouse fixes | done | #2284 | claude/clubhouse-audit-polish |
| new-02 | Roster test CH-3009 flakes on `main` (came in with #2295): the menu focuses its first item on the next frame and the test pressed Escape first; the helper now waits for focus | Clubhouse fixes | done | #2332 | claude/project-thread-llcuya (Roster flake and presentation timeout); no Bridge IDs or CH codes needed |
| new-03 | The `presentation` CI check times out starting its web server (3 min): readiness waited for the first compile of the popup lab (112 s on two cores, over 180 s on a runner); it now waits for a static file and the setup file compiles the routes | Clubhouse fixes | done | #2332 | claude/project-thread-llcuya (Roster flake and presentation timeout); no Bridge IDs or CH codes needed |
| new-04 | Unit shard fails with "window is not defined" from `use-edge-swipe.ts` (`finish` timer of a committed swipe outlives the test file; main run 39714700693, #2217). The effect cleanup now hands a committed swipe's exit back and cancels its frames; a fake-timer test fails without it | Clubhouse fixes | done | #2332 | claude/project-thread-llcuya (Roster flake and presentation timeout); no Bridge IDs or CH codes needed |
| mot-01 | Desktop sidebar fold: the spring keeps its look, but resize readers and Lenis wait until it settles and the brand panel drops its blur while it moves | Clubhouse fixes | done | #2339 | claude/clubhouse-motion-apple-bar (motion pass the owner approved 2026-10-22); no Bridge IDs or CH codes needed |
| mot-02 | Dialog backdrop is a solid wash on desktop too, never a live blur | Clubhouse fixes | done | #2339 | claude/clubhouse-motion-apple-bar (motion pass the owner approved 2026-10-22); no Bridge IDs or CH codes needed |
| mot-03 | Tab bar and sidebar section switches swap at once (no fade-through dip); pushes, pops and other links keep their motion | Clubhouse fixes | done | #2339 | claude/clubhouse-motion-apple-bar (motion pass the owner approved 2026-10-22); no Bridge IDs or CH codes needed |
| mot-04 | Back during a phone push reverses from where the push stood instead of waiting it out | Clubhouse fixes | done | #2339 | claude/clubhouse-motion-apple-bar (look-and-feel pass the owner approved 2026-10-22); no Bridge IDs or CH codes needed |
| mot-05 | A sheet or dialog reopened while closing picks up from where it stood instead of snapping | Clubhouse fixes | done | #2339 | claude/clubhouse-motion-apple-bar (look-and-feel pass the owner approved 2026-10-22); no Bridge IDs or CH codes needed |
| mot-06 | Font weights on four rungs (400 to 700) and the phone player name wraps instead of truncating | Clubhouse fixes | done | #2339 | claude/clubhouse-motion-apple-bar (look-and-feel pass the owner approved 2026-10-22); no Bridge IDs or CH codes needed |
| mot-07 | Placeholder text on its own readable token in both themes | Clubhouse fixes | done | #2339 | claude/clubhouse-motion-apple-bar (look-and-feel pass the owner approved 2026-10-22); no Bridge IDs or CH codes needed |
| mot-08 | Text on 11 sizes (11 to 34px), nearest step, from approved before/after renders | Clubhouse fixes | done | #2339 | claude/clubhouse-motion-apple-bar (type scale the owner approved 2026-10-23); no Bridge IDs or CH codes needed |
| queue-01 | Move every audit row that is not here into this queue, with the design-call and output-spec items | docs | in progress | | claude/project-thread-f4qkrr (thread "Audit rows into queue") |
| aplus-a2 | Values that round to zero get no gain or loss tone, on every screen (A2) | Clubhouse A+ | in progress | #2356 | agent/clubhouse-aplus-wp1 (Clubhouse A+ handoff, WP-1); no Bridge IDs or CH codes needed |
| aplus-a1 | One change-signal rule: halves plus standard error, never first vs last (A1) | Clubhouse A+ | in progress | #2356 | agent/clubhouse-aplus-wp1 (Clubhouse A+ handoff, WP-1); no Bridge IDs or CH codes needed |
| aplus-a5 | Ahead of or behind the team decided on the shown values (A5) | Clubhouse A+ | in progress | #2356 | agent/clubhouse-aplus-wp1 (Clubhouse A+ handoff, WP-1); no Bridge IDs or CH codes needed |
| aplus-a6 | Average to par uses the window's weighted value (A6) | Clubhouse A+ | in progress | #2356 | agent/clubhouse-aplus-wp1 (Clubhouse A+ handoff, WP-1); no Bridge IDs or CH codes needed |
| aplus-a7 | Rate floors on Fairways, GIR, Scrambling and Sand saves (A7) | Clubhouse A+ | in progress | #2356 | agent/clubhouse-aplus-wp1 (Clubhouse A+ handoff, WP-1); no Bridge IDs or CH codes needed |
| aplus-a3 | Roster team average pooled per round, not a mean of player means (A3) | Clubhouse A+ | in progress | #2356 | agent/clubhouse-aplus-wp1 (Clubhouse A+ handoff, WP-1); no Bridge IDs or CH codes needed |
| aplus-a4 | Team SG headline and leg totals obey the 3-round floor (A4) | Clubhouse A+ | in progress | #2356 | agent/clubhouse-aplus-wp1 (Clubhouse A+ handoff, WP-1); no Bridge IDs or CH codes needed |
| aplus-a20 | Standing “Refreshed” date in the team’s time zone; SG to one decimal (A20) | Clubhouse A+ | in progress | #2356 | agent/clubhouse-aplus-wp1 (Clubhouse A+ handoff, WP-1); no Bridge IDs or CH codes needed |
| aplus-a8 | Chart defects (A8, 11 parts): Ask trend better-is-up with round ticks; SG tick decimals; women's Tour zero label; gauge stays in its half with its end labelled; putts lower is better; green's bold side is the worst; month spark per 18; ring early fill under 10 putts; tabular tick numbers; team phone mean weighted; par line only for one par, dead ScoreLine removed | Clubhouse A+ | in progress | #2356 | agent/clubhouse-aplus-wp1 (Clubhouse A+ handoff, WP-2); no Bridge IDs or CH codes needed |
| aplus-a9 | A dialog's dim fades with its panel, turns round mid-exit and follows a sheet drag (`--ch-scrim-a`) (A9) | Clubhouse A+ | in progress | #2356 | agent/clubhouse-aplus-wp1 (Clubhouse A+ handoff, WP-3); no Bridge IDs or CH codes needed |
| aplus-a10 | Desktop gapless crossfade on drill-ins (A10): waits on the owner (OQ-14, pinned motion tokens) | Clubhouse A+ | held | | Owner decision OQ-14 |
| aplus-a11 | Stats busy dim holds off 150ms (`--ch-dur-busy-delay`) (A11) | Clubhouse A+ | in progress | #2356 | agent/clubhouse-aplus-wp1 (Clubhouse A+ handoff, WP-3); no Bridge IDs or CH codes needed |
| aplus-a12 | A finger's press waits 70ms before a button shrinks; a quick tap still shows it (A12) | Clubhouse A+ | in progress | #2356 | agent/clubhouse-aplus-wp1 (Clubhouse A+ handoff, WP-3); no Bridge IDs or CH codes needed |
| aplus-a21 | Held prefetch pages dropped after a round is submitted, discarded or retyped; Roster revalidates on submit (A21) | Clubhouse A+ | in progress | #2356 | agent/clubhouse-aplus-wp1 (Clubhouse A+ handoff, WP-3); no Bridge IDs or CH codes needed |
| aplus-a13 | A row's push target is fetched whole on touch-down (rounds cards, Stats player list, qualifier rows, Roster's View insights) (A13) | Clubhouse A+ | in progress | #2356 | agent/clubhouse-aplus-wp1 (Clubhouse A+ handoff, WP-3); no Bridge IDs or CH codes needed |
| aplus-a14 | Navigation links are silent (no `haptic('select')` on a Link), with a lint rule and a source scan (A14) | Clubhouse A+ | in progress | #2356 | agent/clubhouse-aplus-wp1 (Clubhouse A+ handoff, WP-4); no Bridge IDs or CH codes needed |
| aplus-a16 | Palette New message, Post announcement and Add class open their forms (`?compose=1`, `?new=1`); Home's join requests open the requests (A16). The coach round's back label stays Stats: D-53 (owner) set it, so A16 part 3 waits on the owner | Clubhouse A+ | in progress | #2356 | agent/clubhouse-aplus-wp1 (Clubhouse A+ handoff, WP-4); no Bridge IDs or CH codes needed |
| aplus-a30 | A player's old pages (`/players/<id>/game`, `/print`, `/genome`) are aliased, so old links reach Stats; a test reads next.config's served URLs (A30). G3 (classes, rounds/new, rounds/recover for a coach) waits on the owner | Clubhouse A+ | in progress | #2356 | agent/clubhouse-aplus-wp1 (Clubhouse A+ handoff, WP-4); no Bridge IDs or CH codes needed |
| aplus-a18 | Contrast: header eyebrow on the Ledger eyebrow ink, placeholders on their token, no-data marks on the tertiary ink, ScoreMark prints the em dash (A18) | Clubhouse A+ | in progress | #2356 | agent/clubhouse-aplus-wp1 (Clubhouse A+ handoff, WP-5); no Bridge IDs or CH codes needed |
| aplus-a19 | Labelled spans and divs get a role (img, group, status), with a source scan (A19) | Clubhouse A+ | in progress | #2356 | agent/clubhouse-aplus-wp1 (Clubhouse A+ handoff, WP-5); no Bridge IDs or CH codes needed |
| aplus-a27 | Track's disabled Next reads at 4.6:1 in light; phone and dark already pass, now pinned (A27) | Clubhouse A+ | in progress | #2356 | agent/clubhouse-aplus-wp1 (Clubhouse A+ handoff, WP-5); no Bridge IDs or CH codes needed |
| aplus-a22 | Section switcher: the chevron and dot never glide in over the name after it was hidden (A22) | Clubhouse A+ | in progress | #2356 | agent/clubhouse-aplus-wp1 (Clubhouse A+ handoff, WP-6); no Bridge IDs or CH codes needed |
| aplus-a23 | Glyph subset: no U+2011, ▲/▼, decorative text arrows, prime or ≥; shared sign-out copy; apostrophe scan over every folder (A23) | Clubhouse A+ | in progress | #2356 | agent/clubhouse-aplus-wp1 (Clubhouse A+ handoff, WP-6); no Bridge IDs or CH codes needed |
| aplus-a24 | 390px: trip card dates and times hold together, Hub strip fade and snap, phone tabs scroll, Putts two lines, short SG labels (A24) | Clubhouse A+ | in progress | #2356 | agent/clubhouse-aplus-wp1 (Clubhouse A+ handoff, WP-6); no Bridge IDs or CH codes needed |
| aplus-a29 | Render must-fixes: Track distance words clear of the tee disc, no textarea grip on touch; KPI gauges held for the owner (A29) | Clubhouse A+ | in progress | #2356 | agent/clubhouse-aplus-wp1 (Clubhouse A+ handoff, WP-6); no Bridge IDs or CH codes needed |
| aplus-a26 | Week grid: busy blocks under the events they overlap, 22px minimum, narrow blocks keep only the title; side-by-side lanes held for the owner (A26) | Clubhouse A+ | in progress | #2356 | agent/clubhouse-aplus-wp1 (Clubhouse A+ handoff, WP-7); no Bridge IDs or CH codes needed |
| aplus-a17 | Quiet refresh after a minute away or back online, never under a dialog, a field or a round; A15 held for an iOS build (A17) | Clubhouse A+ | in progress | #2356 | agent/clubhouse-aplus-wp1 (Clubhouse A+ handoff, WP-8); no Bridge IDs or CH codes needed |
| aplus-a15 | Native canvas, launch screen and splash in Clubhouse's phone colours from one reversible switch (config/native-canvas.json); splash hides on first paint (A15) | Clubhouse A+ | in progress | #2356 | agent/clubhouse-aplus-wp1 (Clubhouse A+ handoff, WP-8); no Bridge IDs or CH codes needed |
| aplus-rr1 | Round review viewer from the resolved dashboard role, so a dual-role player reads their own round (W7 RR-1) | Clubhouse A+ | in progress | #2356 | agent/clubhouse-aplus-wp1 (Clubhouse A+ handoff, WP-9); no Bridge IDs or CH codes needed |
| aplus-chr1 | CoachHelm never fetched ahead of the tap, so prefetches record no insight exposures (W7 CH-R1) | Clubhouse A+ | in progress | #2356 | agent/clubhouse-aplus-wp1 (Clubhouse A+ handoff, WP-9); no Bridge IDs or CH codes needed |
| aplus-up1 | Hub documents upload straight to Storage on a signed URL; Classes import refuses an image too large for one request (W7 UP-1) | Clubhouse A+ | in progress | #2356 | agent/clubhouse-aplus-wp1 (Clubhouse A+ handoff, WP-9); no Bridge IDs or CH codes needed |
| aplus-cons0 | One source-scan helper for Clubhouse guard tests (walk, code, hits, ratchet) (CONS-0) | Clubhouse A+ | in progress | #2361 | agent/clubhouse-aplus-phase2 (Clubhouse A+ handoff, WP-10); no Bridge IDs or CH codes needed |
| aplus-b1 | Type roles per step with leading and tracking; one bar title, one hero, two widths; ratchet on raw font shorthands (B1, stage 1) | Clubhouse A+ | in progress | #2361 | agent/clubhouse-aplus-phase2 (Clubhouse A+ handoff, WP-11); no Bridge IDs or CH codes needed |
| aplus-cons5 | Done is primary, Clear filters never, Try again by scope; AST guard (CONS-5) | Clubhouse A+ | in progress | #2361 | agent/clubhouse-aplus-phase2 (Clubhouse A+ handoff, WP-11); no Bridge IDs or CH codes needed |
| aplus-cons30 | One eyebrow role, 13/500 with no tracking (CONS-30) | Clubhouse A+ | in progress | #2361 | agent/clubhouse-aplus-phase2 (Clubhouse A+ handoff, WP-11); no Bridge IDs or CH codes needed |
| aplus-b2 | Spacing scale and reading widths; six stylesheets migrated behind a guard; What's new measure (B2) | Clubhouse A+ | in progress | #2361 | agent/clubhouse-aplus-phase2 (Clubhouse A+ handoff, WP-11); no Bridge IDs or CH codes needed |
| aplus-cons39 | Ratchet on local tabular-figure declarations (CONS-39) | Clubhouse A+ | in progress | #2361 | agent/clubhouse-aplus-phase2 (Clubhouse A+ handoff, WP-11); no Bridge IDs or CH codes needed |
| aplus-b3 | Card and sheet radius tokens, device hairlines, raw radii onto tokens; radii guard (B3) | Clubhouse A+ | in progress | #2361 | agent/clubhouse-aplus-phase2 (Clubhouse A+ handoff, WP-12); no Bridge IDs or CH codes needed |
| aplus-cons4 | Button sm and lg corners on the radius scale (CONS-4) | Clubhouse A+ | in progress | #2361 | agent/clubhouse-aplus-phase2 (Clubhouse A+ handoff, WP-12); no Bridge IDs or CH codes needed |
| aplus-cons32 | Phone cards on the card radius; Surface foot on the inset (CONS-32) | Clubhouse A+ | in progress | #2361 | agent/clubhouse-aplus-phase2 (Clubhouse A+ handoff, WP-12); no Bridge IDs or CH codes needed |
| aplus-b4 | Elevated surfaces at night, glass blur from the token, edge fade, raw-shadow ratchet (B4) | Clubhouse A+ | in progress | #2361 | agent/clubhouse-aplus-phase2 (Clubhouse A+ handoff, WP-12); no Bridge IDs or CH codes needed |
| aplus-cons35 | z-index ladder; skip links above a toast; literals ratcheted (CONS-35) | Clubhouse A+ | in progress | #2361 | agent/clubhouse-aplus-phase2 (Clubhouse A+ handoff, WP-12); no Bridge IDs or CH codes needed |
| aplus-b21 | Dark primary key on a lighter face (B21, X-6) | Clubhouse A+ | in progress | #2361 | agent/clubhouse-aplus-phase2 (Clubhouse A+ handoff, WP-12); no Bridge IDs or CH codes needed |
| aplus-b15 | Chart ink under Increase Contrast (B15) | Clubhouse A+ | in progress | #2361 | agent/clubhouse-aplus-phase2 (Clubhouse A+ handoff, WP-12); no Bridge IDs or CH codes needed |
| aplus-cons23 | One grab handle and one FormSheet for Settings and Recruiting (CONS-23) | Clubhouse A+ | in progress | #2361 | agent/clubhouse-aplus-phase2 (Clubhouse A+ handoff, WP-13); no Bridge IDs or CH codes needed |
| aplus-b6 | One press controller (data-ch-pressed) and the pressed-state sweep (B6) | Clubhouse A+ | in progress | #2361 | agent/clubhouse-aplus-phase2 (Clubhouse A+ handoff, WP-14); no Bridge IDs or CH codes needed |
| aplus-cons1 | Danger key on tokens with states and a default warning (CONS-1) | Clubhouse A+ | in progress | #2361 | agent/clubhouse-aplus-phase2 (Clubhouse A+ handoff, WP-14); no Bridge IDs or CH codes needed |
| aplus-cons2 | Every button is ui/Button: rounds/track first, per-file ratchet (CONS-2) | Clubhouse A+ | in progress | #2361 | agent/clubhouse-aplus-phase2 (Clubhouse A+ handoff, WP-14); no Bridge IDs or CH codes needed |
| aplus-cons3 | In flight is busy: 24 keys (CONS-3) | Clubhouse A+ | in progress | #2361 | agent/clubhouse-aplus-phase2 (Clubhouse A+ handoff, WP-14); no Bridge IDs or CH codes needed |
| aplus-cons25 | Haptic grammar held: commit only for settle, shot, refresh (CONS-25) | Clubhouse A+ | in progress | #2361 | agent/clubhouse-aplus-phase2 (Clubhouse A+ handoff, WP-14); no Bridge IDs or CH codes needed |
| aplus-b5 | One line chart (ui/charts/Line): team trend, leg cards, form lines, Ask trend, Deep dive strip; Recharts gone (B5) | Clubhouse A+ | in progress | #2361 | agent/clubhouse-aplus-phase2 (Clubhouse A+ handoff, WP-15); RoundTrend held for the owner; no Bridge IDs or CH codes needed |
| aplus-b8 | Lenis idles, mono face not preloaded, long lists skip off-screen rows (B8) | Clubhouse A+ | in progress | #2361 | agent/clubhouse-aplus-phase2 (Clubhouse A+ handoff, WP-16); no Bridge IDs or CH codes needed |
| aplus-b7 | Rows arrive and leave in place (ui/ListPresence) on Hub, Roster requests, Bell, Messages; Swap eases its height (B7) | Clubhouse A+ | in progress | #2361 | agent/clubhouse-aplus-phase2 (Clubhouse A+ handoff, WP-16); rounds library held for the owner; no Bridge IDs or CH codes needed |
| aplus-b10 | Failure copy without "reported", phone Today, sortable roster headers (B10.3 to B10.5) | Clubhouse A+ | in progress | #2361 | agent/clubhouse-aplus-phase2 (Clubhouse A+ handoff, WP-17); B10.1 and B10.2 wait on A25; no Bridge IDs or CH codes needed |

<!-- markdownlint-enable MD013 -->

Counts on 2026-10-23: 137 done, 23 held, 20 closed, none in progress, none
open. Rows added since the audit are not counted: new-02 to new-04 (#2332) and
mot-01 to mot-08 (#2339) are done, queue-01 is in progress here. On
2026-10-23 PRs #2328 (chs-37, chs-39), #2333 (chs-21, chs-22, chs-23, par-14)
and #2334 (doc-07, doc-60) merged, so those rows are done. The held rows wait on
the owner (the iPhone pass and App Store build in doc-37, which also gates
doc-38 to doc-41 reaching users; device checks and reviews in doc-03, doc-08,
doc-35, doc-36 and doc-49; the reset-email template in doc-55; the canary and
deploy in doc-46, doc-47 and pr-02), on held migrations that Production
rollout applies (doc-31 to doc-34, chs-62, pr-09, pr-10), or on a stated
trigger because they were deferred on purpose (doc-09, doc-58, doc-59, chs-59,
chs-60).

Held rows that need no migration, flag or deploy, only an owner nod or a
tool: chs-59 and chs-60 (two stats charts, deferred on purpose), doc-36
(`clubhouse:perf` needs a production build, which is a local `npm run build`,
not a deploy) and doc-44 (the Sentry alert can now be created with the Sentry
tools). Moving any of them to open is the owner's call.

The audit listed chs-41 twice: the dropped PR #2073 root map, and the
idle-player stale refresh that the CoachHelm thread found later. The second
one is chs-63 here. PR #2282 cited "pr-05"; that is the audit's own pr-05
(no digit rolling), which is doc-50.

## Design call and output specs

The CoachHelm design call (2026-10-19) made eight decisions, D1 to D8. The
"supercharge 04" output specs draw six layouts, and its architecture note
cuts the engine work into slices 0 to 8. The rows above hold the work; this
maps each decision, layout and slice to those rows. Every v3 flag named is
`production: false` and `preview: true` unless a row says otherwise.

<!-- markdownlint-disable MD013 -->

| Item | What | Rows | State |
| --- | --- | --- | --- |
| D1 | One object, two voices: the coach and the player see the same read | chs-40, chs-01, chs-29 | done |
| D2 | The path line is the second line of every read | chs-32 | done (#2294) |
| D3 | Coaches get a player page | chs-29, par-01 | done (#2295) |
| D4 | The Board leads with the decision, not the pulse | chs-31, chs-34 | done (#2294) |
| D5 | Team pattern is a rollup of causes | chs-19, par-07 | done, flag `coachhelm_team_pattern_v1` |
| D6 | Freshness and lifecycle are words on the read | chs-27, chs-09 | done: Out of date shows now; Cleared and the other lifecycle words wait on `coachhelm_recheck_v1` and data |
| D7 | No Ask for players | par-25 | closed (owner decision 2026-10-19) |
| D8 | Cut, do not add (pulse block, Gauge, ReadMeter, Game profile view) | chs-33, chs-35, chs-37 | done except chs-37, in progress in #2328 |
| Layout 1 | Coach Monday brief | chs-28, par-05 | done (#2292, #2299), flag `coachhelm_monday_brief_v1` |
| Layout 2 | Coach Player page | chs-29, par-01 | done (#2295) |
| Layout 3 | Player post-round 30-second screen | chs-30 | done (#2298) |
| Layout 4 | Team pattern view | chs-19 | done (#2251). The players-by-families matrix came from PR #2073 and is dropped (chs-41) |
| Layout 5 | Prescription and verdict loop view | chs-10, chs-11 | done (#2227, #2300), flag `coachhelm_verdicts_v1` |
| Layout 6 | "Why do you think so?" audit view | chs-12, chs-13 | done (#2247, #2291); draws once the engine writes the audit lines |
| Slice 0, 0b | Four-line copy, caps, freshness plumbing | chs-05, chs-06, chs-02, chs-03 | done |
| Slice 1 | Support words and the claim ladder | chs-07, chs-12 | done |
| Slice 2 | Root cause in three honest states | chs-08 | done |
| Slice 3 | Lifecycle: Cleared, Contradicted, Under review | chs-09 | done |
| Slice 4 | Closed loop: a verdict on every prescription | chs-10, chs-11 | done |
| Slice 5 | Counted families and insight angles | chs-16, chs-17 | done |
| Slice 6 | Learning from corrections, Track record | chs-13, chs-14, chs-15 | done |
| Slice 7 | Team pool, team pattern, course plan, canary | chs-18, chs-19, chs-20, chs-21, chs-26 | done except chs-21 (player copy in progress in #2333) |
| Slice 8 | New data: one-tap prompts, club chip, course nudge, recovery lie | chs-22, chs-23, chs-24 | chs-22 and chs-23 in progress in #2333 (they were Fairway round entry only); chs-24 closed (no clubs) |
| Level anchors | A GolfHelm-wide benchmark pool | chs-25 | closed (owner decision Q-88) |

<!-- markdownlint-enable MD013 -->

## PRs with no audit row

They are listed so nobody starts the same work again. PRs that now have a row
(#2283 is pr-01, #2285 is pr-08, #2288 is chs-63, #2217 is doc-39) are in
the queue above.

<!-- markdownlint-disable MD013 -->

| PR | What | Area | State |
| --- | --- | --- | --- |
| #2306 | Engine writes the coach's voice (`coach_copy`) on every v3 read | CoachHelm engine | landed (train 1) |
| #2305 | Coach can re-check the team's reads from the Board | CoachHelm board UI | landed (train 2) |
| #2279 | Clubhouse text boxes read the event value in the handler | Clubhouse fixes | landed |
| #2309 | v3 CoachHelm copy names no clubs (stacked on #2306) | CoachHelm engine | closed; #2323 carries it |
| #2313 | v2 CoachHelm copy names no clubs | CoachHelm engine | landed |
| #2323 | v3 CoachHelm copy names no clubs | CoachHelm engine | landed |
| #2318 | Home and Calendar read a player's availability | Clubhouse parity & pages | landed |
| #2319 | Coach-only availability note for the roster (held migration `20261022090000`) | Clubhouse parity & pages | landed |
| #2320 | Coach Standing: the ladder's reads come from the coach feed | CoachHelm board UI | landed |
| #2328 | Game profile folds into Standing; Ask answers link a player's reads | CoachHelm board UI | open (chs-37, chs-39) |
| #2333 | CoachHelm data prompts in round entry, player Course plan | CoachHelm board UI | open draft (chs-21, chs-22, chs-23, par-14) |
| #2332 | Roster CH-3009 flake, presentation server-start timeout, edge-swipe timer | Clubhouse fixes | open (new-02, new-03, new-04) |
| #2329 | `HELD.md` marks `20261022090000` applied; regenerated database types | docs | landed |
| #2331 | Regenerate `database.ts` for `golf_import_player_classes`; incident close-out | docs | open |
| #2327 | Regenerate `database.ts` from the production schema (bot; #2331 supersedes it) | docs | open |

<!-- markdownlint-enable MD013 -->

Two open PRs sit in CoachHelm board UI: PR #2328 (branch
`claude/coachhelm-standing-ask`) and PR #2333 (branch
`claude/coachhelm-round-prompts`), both from the CoachHelm thread. Order
decided by the coordinator 2026-10-22: #2328 lands first, then #2333, and that
thread refreshes #2333 (merge main, regenerate) after #2328 lands. They change
the same files: `src/clubhouse/data/coachhelm.ts`,
`docs/clubhouse/catalog/coachhelm.md`, the P013 `CONTRACT.md`,
`config/clubhouse/bridge-contracts.json` and the generated Clubhouse files.

## Reserving Bridge IDs and CH codes

Neither number is a plain counter, so "take the next one" is what collided.

- A **Bridge ID** is page namespace, two-digit category, two-digit item
  (`scripts/clubhouse/registry.mjs`): 130742 is P013, category 07, item 42.
  `registry.mjs sync` mints the next free item in a page and category, so two
  branches cut from the same `main` mint the same ID.
- A **CH code** is page prefix, one kind digit, two-digit suffix: CH-13996 is
  P013, kind 9 (Network and UX), suffix 96. You pick it by hand in
  `docs/clubhouse/catalog/`.

On `main` (2026-10-21) the highest Bridge ID per page is 12401 (P001), 22401
(P002), 32401 (P003), 42401 (P004), 52401 (P005), 62401 (P006), 72401
(P007), 82401 (P008), 92401 (P009), 102401 (P010), 112402 (P011), 122401
(P012), 132301 (P013), 142001 (P014) and 152301 (P015). The highest CH code
is CH-15972. Counting `main`, the tombstones and every `origin/claude/*` and
`origin/agent/*` branch pushed since 2026-10-14 (46 refs), no page uses a
Bridge item above 56, and no page outside P013 and P015 uses a CH suffix
above 59, except CH-9999 on P009.

So each area owns the same two-digit window for Bridge items, in every
category of every page, and for CH suffixes, in every kind of every page:

<!-- markdownlint-disable MD013 -->

| Area | Bridge items | CH suffixes | P013 instead |
| --- | --- | --- | --- |
| CoachHelm board UI | 60-69 | 60-69 | kinds 0-8: 33-42; kind 9: CH-13913 to CH-13919 |
| CoachHelm engine | 70-79 | 70-79 | kinds 0-8: 43-49; kind 9: CH-13946 to CH-13949 |
| Clubhouse parity & pages | 80-89 | 80-89 | kinds 0-8: 91-99; kind 9: CH-13954 to CH-13959 |
| Clubhouse fixes | 90-99 | 90-99 (P009 kind 9: 90-98) | kinds 0-8: 85-89; kind 9: CH-13925 to CH-13929 |
| docs | none | none | none |

<!-- markdownlint-enable MD013 -->

P015 (sign-in) kind 9 already uses suffixes 60-62 and 70-72; take the next
free code in your window there. **P013 kind 9 is nearly full.** On `main`
on 2026-10-22, 69 of its 99 codes are defined in `catalog/coachhelm.md`, so
30 are free: 22 inside the area windows above (board UI 7, engine 4, parity
6, fixes 5) and 8 outside them (CH-13973 to CH-13979 and CH-13994). The
open PR #2328 takes CH-13913 to CH-13915 and the open draft #2333 takes
CH-13916 and CH-13917, which leaves 25 free and 17 in the windows (board UI
2, engine 4, parity 6, fixes 5). The 2026-10-21 count listed only CH-13978,
CH-13979 and CH-13994 as free outside the windows; CH-13973 to CH-13977 are
used nowhere on `main` now, but ask the owner before taking them. When an area
runs out, ask the owner before using another kind with a
`config/clubhouse/category-map.json` override.

**#2299 (par-05) landed** with CH-13983 to CH-13989 and CH-13997 to
CH-13999, Bridge IDs 130780 to 130789 (P013, category 07, parity window).
The open PR #2328 takes Bridge IDs 130760 to 130762 and the open draft
PR #2333 takes 130763 and 130764, both inside the board UI window.

How to use a reservation:

1. Write the catalog rows with CH codes from your window, and note the
   window in your row's "Claimed by" cell when you claim.
2. Run `node scripts/clubhouse/registry.mjs sync`. It mints the next free
   item, which is below your window.
3. In `config/clubhouse/bridge-contracts.json`, move each new record's `id`
   and `item` into your window (keep the category). Nothing else is
   hand-edited.
4. Run `registry.mjs sync` again: it rewrites the generated maps and each
   page's contract lists from the moved IDs.
5. Run `npm run clubhouse:check`.
