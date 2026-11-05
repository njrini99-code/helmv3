# Clubhouse redesign: production plan

Owner's goal, 5 Nov 2026: ready for production and usable tomorrow. This file is
the working plan. Status updates go in the Status table.

## Where it stands

- Production: `golf_clubhouse_ui` is on, the 13 redesign flags are off, and none
  of the 17 redesign migrations are applied. Deploying main today ships the
  pre-redesign screens plus 127 unreleased commits.
- Preview: the 13 flags are on and it reads staging, where the 17 migrations are
  applied.
- This branch (`agent/clubhouse-redesign-followups`) holds the fixes for the
  owner's 4 Nov list. The full suite ran with one failure left that isn't from
  this branch: `check-migration-headers`, three older files on main.

## Rules for this work

- One PR, stacked on nothing. No merge, flag change or migration while a
  required check is red.
- Each leak, write or data fix carries a test that failed on the old code.
- One worker, one dev server and one browser at a time. This Mac froze with
  more.
- Claim only what the instrument measures. Anything not checked is listed as not
  verified.
- **Deploys, production migrations and production flags need the owner's word in
  the conversation.** That includes preview deploys.

## Stages

### 1. Land the fixes

Push, open the PR, mark it ready so the full CI runs, fix what it finds, and
close lane PRs #2441 to #2478 (leave #2479). Merge needs a green CI aggregate
and Review Gate.

### 2. Audit each lane, in order

Roster, Classes and coach Home; Stats and player Home; Messages; Team Board;
Read; Lenses; Ask; Quick chat; Practice plan. For each lane, on fixtures in
WebKit at 390 and 1440, light and dark, coach and player:

- Every screen and state in its `05-SCREENS` renders, with no console errors.
- Layout against its `06-SCREEN-SPECS` and the "after" pictures.
- Motion against `07-MOTION`, read from `document.getAnimations()`, with Reduce
  Motion.
- Skeleton against the loaded page: same shape, no jump.
- Player payloads hold nothing coach-only.

### 3. Add the missing tests that matter

Of the 620 `08` criteria, write the leak, write, data and wiring ones, lane by
lane. Report the count covered. Layout criteria stay manual.

### 4. Real-data and smoothness check (needs a preview deploy)

This branch on staging, signed in by the owner as test accounts: the write
journeys, numbers against the database, then Safari Frames for page switches,
Messages, Stats filters and sheets, and Animation Hitches on the iPhone.

### 5. Go-live runbook

Written and rehearsed before anyone runs it: backup check, migration order with
each row's VERIFY, the flag order, the deploy command, `release:status
--strict`, a smoke pass, and rollback for each step.

## Decisions only the owner can make

| Decision | Recommendation |
| --- | --- |
| One preview deploy of this branch | Yes. Stages 4 and 5 can't finish without it |
| Apply the 17 migrations to production | After stage 4 passes. The Practice ones touch a live table (`golf_documents`), so they go first in a quiet window |
| Turn on the 13 flags | All together after the migrations; `START_HERE` warns averages disagree if only some are on |
| Deploy to production | After the migrations and before the flags |

## Status

| Stage | State |
| --- | --- |
| 1. Land the fixes | In progress |
| 2. Lane audit | Not started |
| 3. Tests | Not started |
| 4. Real data and smoothness | Blocked on the preview deploy decision |
| 5. Runbook | Not started |
