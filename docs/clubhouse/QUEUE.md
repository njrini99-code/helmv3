# Clubhouse work queue: what is left and who has it

Updated 2026-10-21. This is the single list of open Clubhouse and CoachHelm
work. Read it with [STATUS.md](STATUS.md) (current state, rollout, rollback)
before you start anything.

The rows come from a missing-work audit, the "supercharge 04" output specs
and the CoachHelm design call (D1 to D6). Those three live in the Claude
Project's knowledge, not in this repo. The table below holds only the audit
rows that a pull request has cited so far (read from the bodies of open and
recently merged PRs on 2026-10-21). **Before anyone starts an audit row that
is not in this table, add it here first**, with its id, a short description
and its area, in the same commit as the claim.

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
4. **One thread per area at a time.** The areas are the five in the table.
   If an area is already claimed by another thread, pick a different area or
   wait.
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
| held | Waits on a held migration, a held flag or an owner production setting |
| done | Merged to `main` |
| closed | No work: retired in the audit, by design, or found already done |

## Trains (2026-10-21)

| Train | PR | Area | Carries |
| --- | --- | --- | --- |
| 1 | #2310 | CoachHelm engine | #2283, #2288, #2306, #2292, #2300 |
| 2 | #2312 | CoachHelm board UI | #2303, #2305, #2297, #2290, #2298 (#2294 already merged); stacked on train 1 |
| 3 | not opened yet (another agent is opening it) | Clubhouse parity & pages | #2295, #2307, #2293, #2287 |
| 4 | not opened yet (another agent is opening it) | Clubhouse fixes | #2279, #2282, #2284 |

Held out: #2299 (coach Brief, par-05) needs a rebase on `main` after trains
1 and 2 land, and fresh Bridge IDs and CH codes (reserved below). Parked
drafts: #2289 (Classes import race, held migration), #2285 (announcement
acknowledgements policy, held migrations), #2217 (iOS edge swipe). Not in a
train: #2309 (v3 CoachHelm copy names no clubs; stacked on #2306 in train 1)
and #2313 (the same for v2 copy).

## The queue

Cells in "What" are short; the audit and the PR hold the detail. #2295 closes
its rows together and does not map them one to one.

| Row | What | Area | Status | PR | Claimed by |
| --- | --- | --- | --- | --- | --- |
| par-01 | Coach parity gap closed by #2295 (coach player pages, coach Home, roster availability, coach Title, roster print) | Clubhouse parity & pages | in progress | #2295 (train 3) | claude/project-thread-icincd |
| par-02 | As par-01 | Clubhouse parity & pages | in progress | #2295 (train 3) | claude/project-thread-icincd |
| par-03 | As par-01 | Clubhouse parity & pages | in progress | #2295 (train 3) | claude/project-thread-icincd |
| par-04 | As par-01 | Clubhouse parity & pages | in progress | #2295 (train 3) | claude/project-thread-icincd |
| par-05 | Coach Brief: the team view behind `/intelligence` (`?view=brief`), behind `coachhelm_monday_brief_v1` | Clubhouse parity & pages | in progress | #2299 (held out of trains: rebase on main, fresh IDs and codes reserved below) | claude/coachhelm-coach-brief |
| par-08 | As par-01 | Clubhouse parity & pages | in progress | #2295 (train 3) | claude/project-thread-icincd |
| par-09 | Game Fingerprint: CoachHelm count lines under each Game detail section | Clubhouse parity & pages | in progress | #2307 (train 3, stacked on #2295) | claude/coach-parity-bridges |
| par-10 | Team rounds: a coach's Rounds is a Clubhouse screen, not a redirect to Team stats | Clubhouse parity & pages | in progress | #2293 (train 3) | claude/project-thread-eitv8h |
| par-11 | Coach note on a round review | Clubhouse parity & pages | in progress | #2293 (train 3) | claude/project-thread-eitv8h |
| par-12 | Team-grid leg figure opens that player's Game detail section | Clubhouse parity & pages | done | #2281 | |
| par-15 | As par-01 | Clubhouse parity & pages | in progress | #2295 (train 3) | claude/project-thread-icincd |
| par-16 | As par-01 | Clubhouse parity & pages | in progress | #2295 (train 3) | claude/project-thread-icincd |
| par-17 | Coach's player Stats hero has a CoachHelm button | Clubhouse parity & pages | done | #2281 | |
| par-18 | Goals: a player sets a goal on the Development tab | Clubhouse parity & pages | in progress | #2293 (train 3) | claude/project-thread-eitv8h |
| par-19 | Goals: accept or dismiss suggested goals; coach pauses, resumes or abandons. The empty state is done (#2281) | Clubhouse parity & pages | in progress | #2293 (train 3); #2281 | claude/project-thread-eitv8h |
| par-20 | As par-01 | Clubhouse parity & pages | in progress | #2295 (train 3) | claude/project-thread-icincd |
| par-21 | Roster detail: CoachHelm block and strokes-by-leg line on the roster peek and phone profile | Clubhouse parity & pages | in progress | #2307 (train 3, stacked on #2295) | claude/coach-parity-bridges |
| par-22 | What's new is a Clubhouse screen for a coach | Clubhouse parity & pages | in progress | #2293 (train 3) | claude/project-thread-eitv8h |
| par-23 | Retired in the audit (per #2293) | Clubhouse parity & pages | closed | | |
| par-24 | Coach's Team Hub nav item shows the team's overdue tasks | Clubhouse parity & pages | in progress | #2287 (train 3) | claude/project-thread-ya6ije |
| par-26 | Retired in the audit (per #2293) | Clubhouse parity & pages | closed | | |
| par-27 | Retired in the audit (per #2293) | Clubhouse parity & pages | closed | | |
| par-28 | Players get a Tasks tab in Team Hub; task links land on it | Clubhouse parity & pages | in progress | #2287 (train 3) | claude/project-thread-ya6ije |
| par-29 | Player-only round entry: by design (per #2295) | Clubhouse parity & pages | closed | | |
| par-30 | Player-only classes and My qualifiers: by design (per #2295) | Clubhouse parity & pages | closed | | |
| par-31 | Coach-only management screens: by design (per #2295) | Clubhouse parity & pages | closed | | |
| chs-04 | Player Board shows 3 reads and 1 strength | CoachHelm board UI | done | #2215 | |
| chs-11 | Verdict loop on focus areas (flag `coachhelm_verdicts_v1`, off) | CoachHelm engine | in progress | #2300 (train 1) | claude/coachhelm-verdict-loop |
| chs-13 | Correction chips under a read's audit (flag off) | CoachHelm board UI | done | #2291 | |
| chs-22 | CoachHelm data-gap prompt; left alone by #2293. Confirm scope in the audit before claiming | CoachHelm board UI | open | | |
| chs-23 | As chs-22 | CoachHelm board UI | open | | |
| chs-28 | Coach Monday brief, view and Monday 05:00 delivery (flag `coachhelm_monday_brief_v1`, production off) | CoachHelm engine | in progress | #2292 (train 1) | claude/coachhelm-monday-brief |
| chs-29 | CoachHelm side of coach parity (#2295) | Clubhouse parity & pages | in progress | #2295 (train 3) | claude/project-thread-icincd |
| chs-30 | Round review: CoachHelm 30-second debrief | CoachHelm board UI | in progress | #2298 (train 2) | claude/coachhelm-round-debrief |
| chs-31 | Coach Board header: one sentence plus "Since you were last here" | CoachHelm board UI | done | #2294 | |
| chs-32 | Coach Board path line (D2 grammar) | CoachHelm board UI | done | #2294 | |
| chs-33 | Cut PriPill, ReadMeter, Gauge and the drill well from the card | CoachHelm board UI | done | #2294 | |
| chs-34 | "No reads yet" becomes a By player row | CoachHelm board UI | done | #2294 | |
| chs-35 | Deep dive: one-sentence hero and one read ledger | CoachHelm board UI | in progress | #2297 (train 2) | claude/coachhelm-deepdive-ledger |
| chs-36 | Standing: "Where strokes go" ladder replaces Most to gain | CoachHelm board UI | in progress | #2290 (train 2) | claude/coachhelm-strokes-ladder |
| chs-37 | Game profile folds into Standing (out of scope of #2290) | CoachHelm board UI | open | | |
| chs-38 | Deep dive: "Where it happened" example holes | CoachHelm board UI | in progress | #2297 (train 2) | claude/coachhelm-deepdive-ledger |
| chs-40 | Coach voice from the stored `coach_copy`, regex as fallback (#2306 writes it) | CoachHelm board UI | in progress | #2303 (train 2); #2306 (train 1) | claude/coachhelm-coach-voice |
| chs-43 | As chs-29 | Clubhouse parity & pages | in progress | #2295 (train 3) | claude/project-thread-icincd |
| chs-44 | As chs-29 | Clubhouse parity & pages | in progress | #2295 (train 3) | claude/project-thread-icincd |
| chs-56 | Team-grid leg figure opens Game detail (with par-12) | Clubhouse parity & pages | done | #2281 | |
| chs-62 | Waits on a held migration (production rollout, per #2281) | Clubhouse parity & pages | held | | |
| doc-06 | Recruiting Due field uses the app's date field: found already done | Clubhouse fixes | closed | #2284 | |
| doc-12 | As par-01 | Clubhouse parity & pages | in progress | #2295 (train 3) | claude/project-thread-icincd |
| doc-13 | Team stats print: the leg grid narrows on paper | Clubhouse parity & pages | done | #2281 | |
| doc-23 | As par-01 | Clubhouse parity & pages | in progress | #2295 (train 3) | claude/project-thread-icincd |
| doc-28 | As par-01 | Clubhouse parity & pages | in progress | #2295 (train 3) | claude/project-thread-icincd |
| doc-34 | Waits on a held migration (production rollout, per #2281) | Clubhouse parity & pages | held | | |
| doc-42 | Recruit film uploads on now the bucket takes video | Clubhouse fixes | done | #2286 | |
| doc-45 | Name the production rollback deployment in STATUS | docs | done | #2296 | |
| doc-50 | Phone Roster and Team stats figures render directly, no digit rolling | Clubhouse fixes | in progress | #2282 (train 4) | claude/clubhouse-no-digit-rolling |
| doc-55 | Password reset email: the Clubhouse screens exist; applying the template to the auth project is an owner production setting | Clubhouse fixes | held | | |
| doc-61 | Classes: two imports at once save a class once (held migration) | Clubhouse fixes | held | #2289 (draft, parked) | claude/clubhouse-classes-import-race |
| doc-62 | Record the brand decision (white cards, Instrument Sans) in STATUS | docs | in progress | #2284 (train 4) | claude/clubhouse-audit-polish |
| new-01 | Preview player self page uses the player shell | Clubhouse fixes | in progress | #2284 (train 4) | claude/clubhouse-audit-polish |

#2282 also cites a "pr-05", which is not one of the audit's prefixes. It is
left out until someone confirms what it is.

## Open PRs with no audit row

They are listed so nobody starts the same work again.

| PR | What | Area | Train |
| --- | --- | --- | --- |
| #2283 | CoachHelm v3 flags on in preview (production unchanged) | CoachHelm engine | 1 |
| #2288 | Idle-player stale refresh (flag off); fail-closed insight reads | CoachHelm engine | 1 |
| #2306 | Engine writes the coach's voice (`coach_copy`) on every v3 read | CoachHelm engine | 1 |
| #2305 | Coach can re-check the team's reads from the Board | CoachHelm board UI | 2 |
| #2279 | Clubhouse text boxes read the event value in the handler | Clubhouse fixes | 4 |
| #2309 | v3 CoachHelm copy names no clubs (stacked on #2306) | CoachHelm engine | none |
| #2313 | v2 CoachHelm copy names no clubs | CoachHelm engine | none |
| #2285 | Announcement acknowledgements: coach read scoped to the team | Clubhouse fixes | parked (held migrations) |
| #2217 | iOS app: the edge swipe drags only the pushed screen | Clubhouse fixes | parked |

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

| Area | Bridge items | CH suffixes | P013 instead |
| --- | --- | --- | --- |
| CoachHelm board UI | 60-69 | 60-69 | kinds 0-8: 33-42; kind 9: CH-13913 to CH-13919 |
| CoachHelm engine | 70-79 | 70-79 | kinds 0-8: 43-49; kind 9: CH-13946 to CH-13949 |
| Clubhouse parity & pages | 80-89 | 80-89 | kinds 0-8: 91-99; kind 9: CH-13954 to CH-13959 |
| Clubhouse fixes | 90-99 | 90-99 (P009 kind 9: 90-98) | kinds 0-8: 85-89; kind 9: CH-13925 to CH-13929 |
| docs | none | none | none |

P015 (sign-in) kind 9 already uses suffixes 60-62 and 70-72; take the next
free code in your window there. **P013 kind 9 is nearly full**: after the
windows above, only CH-13978, CH-13979 and CH-13994 are free. When an area
runs out, ask the owner before using another kind with a
`config/clubhouse/category-map.json` override.

**#2299 (par-05) on rebase:** its Monday brief rows come from train 1. Its
own rows keep CH-13983 to CH-13989, CH-13997 and CH-13998 (no other branch
uses them) and replace CH-13996 with CH-13999. Their Bridge IDs move to
130780 to 130789 (P013, category 07, parity window). It must leave main's
rows 130739 to 130741 and CH-13970 to CH-13972 alone.

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
