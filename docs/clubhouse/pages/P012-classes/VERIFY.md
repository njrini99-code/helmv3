# P012 — Classes: verification

Only what was observed. Gates are in `docs/clubhouse/PROGRESS.md`; the per-gate checklist is
`docs/clubhouse/screens/classes.md`.

## Current verification status

```text
Status:     partial
Commit/PR:  agent/clubhouse (the page: c1925eba2; these page docs are uncommitted at the time of writing)
Date:       2026-09-30
```

## Static checks

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run -s typecheck` | not run in the docs pass; reported clean by the lead in the 2026-09-30 PROGRESS.md entry for the page |
| Lint | `npx eslint` on the changed files | not run in the docs pass (no code changed) |
| Clubhouse check | `npm run -s clubhouse:check` | `npm run -s clubhouse:check` exit 1 in the docs pass (its own 34 unit tests pass, 0 fail): 86 violations, all pending the lead's merge of the sidecar and `registry.mjs sync`. 81 say CONTRACT.md or an action names a Bridge ID that is not in `bridge-contracts.json` yet (40 for P012, 41 for P013: the hand contracts and the IDs the actions use), and 5 say a generated file is stale (`CLUBHOUSE_PAGE_MAP.md`, `CLUBHOUSE_ACTION_MAP.md`, `CLUBHOUSE_STATUS.md` and the two CONTRACT.md tables, which `sync` writes). No other rule fired. |
| Registry and contract check | a read-only simulation of `checkRegistry` with the 29 hand contracts merged into the registry in memory (`bridge-contracts.json` itself untouched) | 0 violations with both pages' 57 hand contracts merged in memory (29 for P012, 28 for P013) and CONTRACT.md rendered from the registry, which is what `sync` writes; sidecar hygiene problems: 0. `bridge-contracts.json` was not touched |
| Knowledge check | `npm run -s docs:check` | not run |
| Build | `npm run build` | not run: no `'use server'` file changed for this page (the loader and screens are server-only and client modules; the server actions are the current page's) |

## Automated tests

| Test | Contract | Result |
| --- | --- | --- |
| `src/clubhouse/__tests__/classes.test.tsx` (106 cases) | every catalog row of kinds 0 to 5 that is not preview (CH-12001 to CH-12902, less CH-12601 and CH-12602), and the hand contracts in the table below | pass: `npx vitest run src/clubhouse/__tests__/classes.test.tsx` exit 0, 106/106 (run in the docs pass); every fix of the review was mutation-checked, as reported in PROGRESS.md |

What the suite forces, beyond the catalog: the loader against a fake database (the player's own rows, the team's
week in the team's zone, each failed read on its own); the live writes against a fake client (the stored form,
the update a policy hides, the calendar-first removal, the id made by the page and the duplicate-key answer, the
sync's arguments and the no-time removal, the import's read-before-write duplicate check); each write
succeeding, failing with Retry and refused offline; the calendar sync in the background; and the route, the page's
role gate and the loading file inside and outside the shell.

### Hand contracts and the tests that prove them

All 29 hand contracts are `reserved` in the registry: no Classes test title carries a Bridge ID yet, and the
registry marks a hand contract `implemented` only when a test file names its ID. This table says which ones a test
in `classes.test.tsx` already covers (a phrase from the test title is given, so the ID can be added to it), which
it covers in part, and which none does. Coverage is by reading the test bodies, not by a mutation run of its own.

| Bridge ID | Contract | Covered | Tests that prove it (a title in classes.test.tsx starts with or contains) | Not covered |
| --- | --- | --- | --- | --- |
| 120101 | `CLASSES_READY` | yes | "a player on a team sees their classes, read on the server"; "CH-12801 the page is labelled "Classes""; "this week’s overlaps: the trip meets the two Thursday classes" |  |
| 120102 | `A_CLASS_IS_DRAWN_AS_WHAT_IT_IS` | yes | "a class from another term is named for it and kept out of this term’s figures"; "CH-12802 each card’s week strip is hidden from screen readers" |  |
| 120103 | `A_CLASS_SHEET_SHOWS_WHEN_AND_WHERE` | yes | "opening a class shows when and where it meets and its next meetings"; "a class in next term lists its next meetings from its term’s first day, not from today"; "the next meetings run from today to the end of the term" |  |
| 120407 | `FIRST_RUN_ONLY_WHEN_THE_READ_ANSWERED` | yes | "CH-12201 the classes do not load: it says so with a way to ask again, never "no classes""; "CH-12201 a failed read is never drawn beside classes"; "CH-12301 no classes yet: the first-run page offers the import first"; "removing the last class returns to the first-run page" |  |
| 120515 | `IMPORT_SKIPS_WHAT_IS_ALREADY_ON_THE_SCHEDULE` | yes | "an import skips what is already on the schedule, reads before it writes, and stops when it cannot read"; "CH-12307 an import skips a class already saved with no term"; "CH-12307 a schedule that is already all there imports nothing, syncs nothing, and says why" |  |
| 120516 | `ONLY_CLASSES_IN_THE_SAME_TERM_COUNT` | yes | "CH-12107 a class is only the same as another in its own term"; "CH-12107 CH-12108 the form’s overlap checks count only classes in the term it is set to"; "CH-12109 the form’s team overlap is this week’s, so a class set to another term meets none of it"; "a class from another term is never counted as overlapping this week’s practice"; "CH-12109 the import result counts overlaps with this week’s practice only for classes in this term" |  |
| 120609 | `AN_UPDATE_A_POLICY_HIDES_IS_A_FAILURE` | yes | "an edit updates only that player’s row, keeps its color, and a row a policy hides is a failure, not "saved"" |  |
| 120610 | `A_SYNC_THAT_WROTE_NOTHING_IS_A_FAILURE` | yes | "a sync that fails, throws, or writes nothing for a class that has meetings is a failure; for an online class it is not" |  |
| 120703 | `WRITES_REFUSE_OFFLINE` | partly | "CH-1903 a write while offline is refused with what was being done, sends nothing, and Retry works once back online"; "CH-1903 removing while offline is refused too, and the class stays"; "CH-12002 a class saved just as the connection went is still marked as not on the calendar" | Tested offline: an edit save, a remove, and a save whose sync is then refused. Not tested offline: an import and the header Retry sync. |
| 120801 | `THE_PAGE_IS_THE_PLAYERS` | partly | "the page gives a Clubhouse player the new screen and everyone else the current page"; "is for players: a coach session renders nothing here" | Not tested: a team whose resolved role is not player getting the no-team page (the test uses no team at all). |
| 120802 | `A_PLAYER_CHANGES_ONLY_THEIR_OWN_CLASSES` | partly | "reads the player’s own classes and the team’s events, in the team’s zone, and shapes both"; "an edit updates only that player’s row, keeps its color, and a row a policy hides is a failure, not "saved""; "removing takes the class off the calendar first, and the class row only if that worked" | The client filters are tested with a fake database. The policies themselves are not run here (npm run test:rls was not run). |
| 120803 | `SERVER_ACTIONS_ARE_THE_GATE` | no | none | no test |
| 120901 | `CHANGE_LANDED` | yes | "CH-12001 adding a class saves it once as typed"; "editing opens on the class as saved, saves only that class, and updates it in place"; "CH-12501 CH-12702 removing a class warns first"; "CH-12109 an import saves the reviewed rows, puts each on the calendar from next Monday" |  |
| 120902 | `THE_IMPORT_RESULT_SAYS_WHAT_REACHED_THE_CALENDAR` | partly | "CH-12004 CH-12109 the import result says which classes are not on the calendar and why, and counts only the ones that are"; "CH-12109 an import of classes that are all off the calendar does not say they are on it"; "CH-12002 an import whose calendar sync partly fails keeps every class, names the one that did not sync, and Retry syncs again"; "CH-12403 an import goes on the calendar in the background" | Not tested: the line that counts classes skipped as already on the schedule ("N already on your schedule and skipped"). |
| 121201 | `FORM_KEPT_ON_FAILURE` | yes | "CH-12001 a save that fails says so in the sheet, keeps what was typed, sends nothing to the calendar, and Retry saves it"; "CH-12004 an import that does not save says so, keeps the review, and Retry imports it"; "CH-12003 a remove that fails keeps the class and the question, says so, and Retry removes it"; "CH-12502 a form with changes asks before it is thrown away" |  |
| 121401 | `RETRY_FINISHES_THE_JOB` | partly | "CH-12001 a save that fails says so in the sheet, keeps what was typed, sends nothing to the calendar, and Retry saves it"; "CH-12003 a remove that fails keeps the class and the question, says so, and Retry removes it"; "CH-12004 an import that does not save says so, keeps the review, and Retry imports it"; "CH-12002 a class that saved but did not reach the calendar is kept and flagged, and Retry syncs it without saving it a second time" | Asserted after a Retry: a save adds the class, closes the sheet and starts the sync; a remove takes the class out and closes the question; an import shows the imported view; a sync clears the flags. Not asserted: an import’s calendar sync starting after its Retry. |
| 121402 | `RETRY_REPLAYS_THE_STORED_START` | partly | "CH-12002 an import puts each class on the calendar from its own start"; "a class saved is synced from its whole term, so a re-sync never removes the meetings already held" | Asserted: the header’s Retry sync restarts each class from the start it had, for an import and for a save. Not asserted: the starts on the toast’s Retry (it replays its arguments) and on a class sheet’s Retry sync. |
| 121403 | `TRY_AGAIN_REREADS_THE_PAGE` | partly | "CH-12201 the classes do not load: it says so with a way to ask again, never "no classes""; "CH-12202 the team’s events do not load: the classes show, the overlap card says it cannot tell" | The tests press Try again and see router.refresh called once. Not tested: fresh classes from the server replacing the page’s list. |
| 121404 | `A_SAVE_RETRIED_AFTER_A_LOST_ANSWER_REACHES_THE_SAME_ROW` | yes | "CH-12001 a class is inserted under the id the page made, and a retry after a lost answer reaches that row instead of adding a second copy"; "CH-12001 a new row id is a version 4 UUID"; "CH-12001 a failed save and its Retry, and another tap on Add in the same sheet, carry one row id; the next sheet gets a new one" |  |
| 121501 | `SAVE_DOES_NOT_WAIT_FOR_THE_CALENDAR` | yes | "CH-12403 CH-12002 a saved class goes on the calendar in the background"; "CH-12403 an import goes on the calendar in the background"; "CH-12403 while a class goes on the calendar the header says so, and says nothing once it has"; "CH-12002 a class saved while an import is still going on the calendar is flagged, not dropped" |  |
| 121502 | `SYNC_STARTS_FROM_THE_CLASS_OWN_TERM` | yes | "CH-12002 a class goes on the calendar from next Monday only when that is inside its own term and leaves the term standing"; "CH-12002 an import puts each class on the calendar from its own start"; "CH-12002 a schedule read in early summer for the fall goes on the calendar for the whole fall"; "CH-12109 an import saves the reviewed rows, puts each on the calendar from next Monday" |  |
| 121503 | `A_CLASS_WITH_NO_TIME_IS_TAKEN_OFF_THE_CALENDAR` | yes | "CH-12002 CH-12304 a class with days and no start or no end is taken off the calendar, not synced"; "CH-12303 CH-12304 a class with days and no time says so on its card and in its sheet, and is not on the calendar for want of a time"; "CH-12303 CH-12304 a class with days and a start but no end reads the same way"; "CH-12004 CH-12109 the import result says which classes are not on the calendar and why, and counts only the ones that are" |  |
| 121504 | `A_FAILED_SYNC_IS_REMEMBERED_FOR_THE_VISIT` | partly | "a failed sync is retried from the header, and from the class itself"; "CH-12002 a class that saved but did not reach the calendar is kept and flagged, and Retry syncs it without saving it a second time" | Not tested: a reload starting clean (nothing is stored to test). |
| 121806 | `NO_AXE_VIOLATIONS_IN_ANY_PREVIEW_STATE` | no | none | no test |
| 121901 | `PHONE_LAYOUT` | partly | "draws the phone bar with the way back to More, and the same classes and actions" | Tested: the phone bar, the back to More and the same actions. Not tested (CSS): the reflow at 1000px and 640px, and the bottom sheets. |
| 122001 | `ENTER_SAVES_AND_ESC_CLOSES` | no | none | no test |
| 122101 | `LOADER_READS_IN_ONE_PASS` | partly | "reads the player’s own classes and the team’s events, in the team’s zone, and shapes both"; "“today” is the team’s day"; "CH-12202 a failed events read is its own error: the classes load, and no overlap is claimed" | Not tested: that the two reads run together (Promise.all), and the loader throwing when no academic term can be found for the day. |
| 122301 | `FAILURES_REPORTED` | partly | "CH-12201 a failed classes read is an error, logged, never an empty schedule"; "CH-12202 a failed events read is its own error: the classes load, and no overlap is claimed"; "removing takes the class off the calendar first, and the class row only if that worked"; "a sync that fails, throws, or writes nothing for a class that has meetings is a failure; for an online class it is not" | Tested: the loader logs by name, and a thrown removal and a thrown sync are reported. Not tested: the surface names of a crash, the breadcrumbs and the low severity of a refused write. |
| 122401 | `TESTS_NAME_CONTRACTS` | no | none | no test |

## Visual verification

### Desktop
```text
Viewport:  1280px (preview, /clubhouse-preview/classes and its states), 2026-09-30, logged in PROGRESS.md
Reference: design/handoff/Player - Classes.html
Result:    looked at by eye against the board in the 2026-09-30 pass; axe clean on the six states (12 of 12 runs at 1280
           and 390). No pixel or side-by-side measurement is recorded.
```

### Phone
```text
Viewport:     390px (preview, headless Chromium, the 2026-09-30 pass logged in PROGRESS.md)
Device/shell: not yet on a real iPhone (npm run ios:dev, owner)
Reference:    design/handoff/Player - Classes - Mobile.html
Result:       built to the approved spec and looked at by eye at 390 in that pass; the iPhone pass is open
```

## Forced states

| State | Contract | How forced | Observed result |
| --- | --- | --- | --- |
| Skeleton | CH-12401 | test (the loading file inside and outside the shell) | the Clubhouse skeleton for a player in the shell, Fairway's for a coach there and outside it |
| Empty | CH-12301, CH-12302, CH-12305, CH-12307, 120407 | tests, `?state=empty`, `?state=noteam` | first run offers Import first; a failed read is never "no classes" |
| Validation | CH-12101 to CH-12114 | tests | the message beside the field, focus on the first; nothing sent |
| Server failure | CH-12001 to CH-12004, CH-12201 to CH-12204 | tests, `?state=failed`, `?state=partial` | toast or notice with its code; text kept; Retry finishes the job |
| Retry | 121401 to 121404 | tests | the same write again; the list, the sheet and the calendar follow; no second row |
| Offline | CH-1903, CH-12901 | tests | nothing sent; the shell's toast; a screenshot read says so and offers Paste text |
| Slow | CH-1902, CH-12902 | tests with a fake clock | said once |
| Permission | 120801, 120802 | tests | a coach gets the Fairway page; the reads and writes carry the player's id |
| Server refusal | 120803 | read, not run | reserved: the tests replace both calendar actions |
| Destructive | CH-12501, CH-12502 | tests | confirm first, warning haptic; the class leaves only when both the calendar and the row are done |
| Calendar | 121501 to 121504 | tests | the sheet is free; a class saved during a sync is flagged with no toast; each class starts from its own term; a class with no time is taken off |
| Optimistic rollback | none | n/a | nothing on the page is optimistic |

## Accessibility

```text
Keyboard:       Enter in a form field saves and Esc closes a sheet through the same path as Cancel (122001): read in code, not
                tested and not walked. A full keyboard walk at 1280 and 390 is open.
VoiceOver:      not tried on a device.
Focus:          a refused save moves focus to the first field that needs it (CH-12804, tested).
Reduced motion: the scan line stops when Animations is off (CSS); not tried with the OS setting.
Contrast:       axe reported no violations at 1280 and 390 on the six preview states; no manual contrast check.
Text scaling:   not checked.
```

## Performance

```text
Layout shift:      not measured
Request waterfall: none on the client; the server loader reads the classes and the week's events together (122101)
Large list:        both reads are limited to 500 rows; not measured
Animation:         the shell's tokens, plus the hover lift and the scan line (CH-12601, CH-12602)
Notes:             first-load JS and LCP (CH-1954) are open
```

## Open verification gaps

- The iPhone pass through `npm run ios:dev`, and a browser pass with a real player account (a class saved and
  imported, and the coach seeing it on the calendar).
- `npm run build` was not run.
- Every write and every failure against a live session: the tests replace `syncClassToCalendar`,
  `removeClassFromCalendar` and the vision reader, so the real calendar sync, the real reader on a real
  screenshot and the PDF reader (PDF.js from the CDN) were not exercised.
- The row-level-security policies for `golf_player_classes` were read in the baseline migration and not run
  (`npm run test:rls` was not run); no test forces a refusal by a server action (120803).
- The toast's Retry inside a real modal dialog: the tests run the shell's dialog-hosted toast in jsdom, which has
  no top layer.
- Found and not fixed (see the report to the parent): an import whose response is lost and then retried says "Nothing
  new to import" and syncs nothing, because the first attempt stored the rows; an import in a term's last 21 days,
  or the first save of an imported class, puts the whole term on the calendar, past meetings included; the
  no-time flag and the "No time set" notice have no catalog code of their own (they are described under CH-12303);
  two rows of the same import with the same name and term are both inserted (`importRows` compares against the
  classes already stored, not among the rows being imported; read in code, not run); the calendar sync's landing also fires the
  success haptic, with no toast (read in `useAction`, not felt on a device); the insert policy on
  `golf_player_classes` checks the player and not `team_id` (read in the baseline migration; the server
  action checks team membership).
- Also found: when the calendar removal lands and the delete then fails, the toast can read "It is still on your
  schedule and your calendar" (the hint of CH-12003), which is untrue for the calendar, and the class gets no "Not
  on your calendar" flag; the toast's Retry repeats both steps and clears it (read in `writes.remove` and the
  `removeAction` copy, not run).
- Q-75 is partly answered: Delete all classes (Q-75a) was approved on 2026-09-30 and is built (below); the rest is an
  open owner question, built on its reversible choices.

## Delete all classes (Q-75a), 2026-09-30

What was run, and what was seen:

| Check | Command | Result |
| --- | --- | --- |
| Tests | `npm run test:file -- src/clubhouse/__tests__/classes.test.tsx` | exit 0, 125/125 (16 new: `describe('Classes, delete all')` and three in `Classes live writes`) |
| Mutations | one edit at a time to `writes.ts` or `ClassesView.tsx`, the file rerun, the edit undone | 15 of 15 caught: every id deleted, not only those off the calendar; the delete not scoped to the player; a failed calendar removal still deleting the row; the read-back skipped; an unreadable read-back claiming "gone"; a half-way answer not dropping what is gone; the off-calendar class not flagged; the question closing on a half-way answer; the control not off while a write runs; no warning haptic; the toast copy not refined; the question closable while it runs; the other-term count dropped; a single class not named; the singular wording lost. (A first M4 was a syntax error that failed the whole file; it was redone as a real logic change and caught by the two live-writes tests) |
| Accessibility | a one-off axe scan (WCAG 2.0 to 2.2 AA) of the preview at 1280 and 390: the button, the question, the question with a class from another term, the half-way toast (`?state=failpartial`), the nothing-deleted toast (`?state=failwrites`) | 0 violations in 10 scans; no sideways scroll at 390; the phone button measured 358 x 44. The entries are not in `scripts/clubhouse/a11y.mjs` yet (the lead's file) |
| Types | `npm run typecheck:fast` | 4 errors, none in Classes (two in another page's tests, `hub.test.tsx` and `travel-class-conflicts.test.ts`, one in `recruiting-upload.test.tsx`) |

Seen by eye (screenshots at 1280 and 390): the button under the deck, the question, and the half-way outcome: three
classes gone, BUSI 401 kept, EXSS 188 flagged "Not on your calendar", the question counting the 2 that are left.

Not verified: the live `removeAll` against a real database and the real calendar action (the tests use a fake client
and a fake action); Delete all with a real player account; a real iPhone (the button's feel, the sheet, the warning
haptic); that a Retry after a really lost answer finds the rows gone (forced with fakes, not with a dropped
connection). Not in `a11y.mjs` and `native.mjs` yet.
