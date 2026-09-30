# Rounds catalog (11xxx)

Routes: `/golf/dashboard/rounds` (the library, for players), `/golf/dashboard/rounds/[id]` (a round's review, for the player and a coach of their team), and, for players, round entry: `/golf/dashboard/rounds/new` and `/golf/dashboard/rounds/continue/[id]`. Coaches have no Rounds library in v2; they reach a round from Stats, Home and Qualifiers, and a coach on the entry addresses gets the shell's not-rebuilt page (a coach does not log rounds). `/golf/dashboard/rounds/recover` stays Fairway's. Spec: `docs/clubhouse/phone/rounds.md`. Plan: `docs/clubhouse/ROUNDS_PLAN.md`.

The library shows the round in progress, the season's scoring, then every posted round by month or by course. Review, New round and Continue are rebuilt, so their controls are drawn for a player (`nav.rebuiltHref`); a control for a screen that is not rebuilt is still not drawn, so no control ever leads nowhere. New round and Continue run over the round engine (`src/lib/golf/round-session/`, #2104), through one round screen for both (`RoundRuntime`).

Where things live:
- Code: `src/clubhouse/screens/rounds/` (`RoundsLibrary`, `parts`, `writes`, `RoundsSkeleton`, `RoundReview`, `ReviewLoadFailed`), `setup/` for a new round (`RoundSetup`, `CoursePicker`, `AddCourseSheet`, `HoleConfig`, `shape`), `track/` for the shot screen (`RoundTracking` over the shared `useShotTracking`, `ShotEntry`, `HoleReview`, `sheets`, `round-sheets`, `labels`), and `entry/` for the round around them: `NewRound` and `ContinueRound` (each maps its engine into a `ChRoundSession`), `RoundRuntime` (the Exit and finish sheets, the banners, the submit; `RecoveryHost`), the dialogs (`RecoveryDialog`, `InProgressConflictDialog`, `SaveAsPracticeSheet`, `QualifierRoundSheet`, `ReloadBanner`), `ports` (the engines' toast port), `setup-reads` (the course library reads and the engine's start form) and `failures`
- Loaders: `src/clubhouse/data/rounds.ts` (`loadRoundsLibrary`) and `round-review.ts` (`loadRoundReview`), with their pure steps in `rounds-shape.ts` and `round-review-shape.ts`
- Routes: `src/clubhouse/routes/rounds.tsx`, `round-review.tsx`, `round-new.tsx`, `round-continue.tsx` (the pages `rounds/new/page.tsx` and `rounds/continue/[id]/page.tsx` branch on `isClubhouseFor('player')`; their `loading.tsx` use `ClubhouseSwitch`)
- Tests: `src/clubhouse/__tests__/rounds.test.tsx` (library), `round-review.test.tsx` (review) and `round-setup.test.tsx` (a new round), `round-tracking.test.tsx` (the shot screen), `round-entry.test.tsx` (the entry dialogs and banners), and, through the real engines, `round-entry-wiring.test.tsx` (/rounds/new), `round-entry-continue.test.tsx` (/rounds/continue/[id]) and `round-entry-routes.test.tsx` (the addresses, the pages, the ports)
- Preview: `/clubhouse-preview/rounds` (`?state=idle|many|empty|noseason|failed|unfinished-failed|failwrites`) `/clubhouse-preview/round` (`?state=coach|noshots|noholes|total|holebyhole`) `/clubhouse-preview/setup` (`?state=failcourses|failtees|failholes|failstart|noqualifiers|qualifiersfailed`) and `/clubhouse-preview/track` (`?state=approach|putt|holed|checkpointfail|last|meters|exit|card|summary|submitting|posted|submitfail`)

Discard goes through `useAction`, so these belong to the shell: offline refusal (CH-1903), slow saves (CH-1902), and the success and error haptics (D-70).

## 110xx Error toasts

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-11001 | Discarding an unfinished round fails | "Couldn't discard the round at Finley GC" + "It is still saved. Try again, or continue it instead." + Retry; the card stays. Done: "Round discarded", and the card goes, whether the discard came from the dialog or from Retry | `useAction('rounds.discard')` → `deleteInProgressRound`, then `clearEmergencySave` | rounds.test › CH-11001 |
| CH-11002 | Undo fails (tracking) | Under the undo question: "Couldn't undo the shot. It's still on your card; try again." The shot stays | `UndoConfirm` reads the engine's `undoError` | round-tracking.test › CH-11002 |
| CH-11003 | A holed-out hole doesn't save | "Hole 4 didn't save." + "Your shots are kept on this device. Try again to move on." (offline: "Reconnect, then try again.") + Try again; the round doesn't move on until it saves | `HoleReview`, `handleRetryHoleCheckpoint` | round-tracking.test › CH-11402 |
| CH-11004 | Changing or deleting a shot fails | In the sheet: "Couldn't save the change." + the engine's reason; the sheet stays open with what was typed | `EditShotSheet` (`editError`) | preview |
| CH-11005 | Submitting the round fails | "The round didn't submit" + the engine's sentence, or "It's saved on this device. Check your connection, then try again." + Try again, and Go back (to the finish sheet), so a failure that retrying won't clear isn't a dead end. A closed qualifier is CH-11516 instead | `SubmitOverlay` | round-tracking.test › CH-11603 |
| CH-11006 | Discarding from Exit fails | In the discard question: "Couldn't discard the round." + the reason; the round is kept | `ExitSheet` (`discardError`) | round-entry-wiring.test › CH-11006 |
| CH-11007 | Starting the round fails | "Couldn't start your round at Finley GC" + "Nothing was saved yet. Try again in a moment." + Retry; Retry opens the round when it lands | `RoundSetup` (`useAction('rounds.start')`, the follow-up inside the action) | round-setup.test › CH-11007 |
| CH-11008 | Restoring the round saved on this device fails | Above the options in the dialog: "Couldn't restore your saved shots." + the reason in words ("That save did not go through. Your shots are still on this device. Please try again.") or, with none, "They are still on this device. Keep this screen open and try again."; Restore is enabled again. Error haptic (CH-11709). The legacy screens set this on the page behind the open dialog, where nobody saw it | `RecoveryDialog` (`error`) | round-entry.test › CH-11008 |
| CH-11009 | Discarding the round already in progress fails | In the discard question: "Couldn't discard the round." + the reason, or "It is still saved. Try again, or resume it instead."; the question stays. Error haptic (CH-11709). The legacy screen set this on the setup page behind the open dialog | `InProgressConflictDialog` (`error`) | round-entry.test › CH-11009 |
| CH-11010 | Save for later fails | Toast "Couldn't save your round at Finley GC" + the reason ("Another save for this round is just finishing. Try again in a moment.") or "Your shots are still on this device. Check your connection, then try again." + Retry. Error haptic (CH-11709). It renders inside an open dialog (CH-1812), so it covers the Exit sheet and the closed-qualifier sheet alike; the legacy Exit sheet drew the thrown message, and the submit overlay's Save & exit drew nothing | `useEntryFailureToast('save-for-later')`, `entryFailureToast` | round-entry.test › CH-11010 |
| CH-11011 | Discarding fails where no discard question holds the message | Toast "Couldn't discard the round at Finley GC" + the action's own reason when it is readable ("This round can no longer be discarded. It was already finished."), or "It is still saved. Try again, or keep playing." + Retry. Error haptic (CH-11709). The Exit sheet's own question shows CH-11006 instead | `useEntryFailureToast('discard-round')` | round-entry.test › CH-11011 |
| CH-11012 | Changing a round to practice fails (qualifier closed) | On the sheet: "Couldn't change this round to practice." + the reason, or "Your round is still saved. Try again in a moment."; the choices stay. Error haptic (CH-11709) | `SaveAsPracticeSheet` (`error`) | round-entry.test › CH-11012 |
| CH-11013 | The round reports an error while tracking (a failed checkpoint or auto-save, a restore or discard that didn't work) | The shot screen's red note with an action (as CH-11003) above the shot screen: the round's own sentence and Dismiss (silent: it only hides the message). No Reload. Error haptic (CH-11709). Before the legacy banner (B4) these had no surface outside a submit | `RoundErrorBanner` | round-entry.test › CH-11013 |
| CH-11014 | Starting a qualifier round that is no longer open to the player (played already, or past the qualifier's rounds) | Toast "Couldn't start your round at Finley GC" + the engine's sentence ("Round 1 of this qualifier is not open to you now. Your next round is 2."). No Retry: asking again gets the same answer; the setup's qualifier list is the way to pick another | `startRefusal('qualifier_round_unavailable')`, `RoundSetup` (`retry: false`) | round-entry-wiring.test › CH-11014 |
| CH-11015 | The qualifier's next round couldn't be checked before starting (offline, signed out, not entered) | Toast "Couldn't start your round at Finley GC" + the engine's sentence ("We could not verify your next qualifier round. Try again before starting.") + Retry, which checks again. Nothing was started | `startRefusal('qualifier_unverified')` | round-entry-wiring.test › CH-11015 |
| CH-11016 | Starting a round on a course and day that already has a completed round | Toast "Couldn't start your round at Finley GC" + "You already have a completed round for this course on this date. Tap Start round again to start a new one anyway." + Start anyway, which is that second Start (the engine confirms on the second call and starts). Nothing was started yet | `startRefusal('duplicate_completed_round')`, `RoundSetup` (`retry: 'Start anyway'`) | round-entry-wiring.test › CH-11016 |

## 111xx Validation (tracking)

Every rule is the shared shot rules (`src/lib/golf/shot-entry-rules.ts`), the same the Fairway entry runs, so the hint can never disagree with the button.

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-11101 | Next shot can't be recorded yet | Above the disabled button, the one thing missing: "Select a shot result", "Choose driver or non-driver", "Choose a miss direction", "Enter the distance remaining", "Green proximity must be under 150 ft", "Confirm the result above to continue"; the button names it (`aria-describedby`) | `nextShotBlocker` | round-tracking.test › CH-11101 |
| CH-11102 | A shot is possible but unusual (a 420-yard drive onto the green; a shot that ends farther away) | A warning with Confirm; once confirmed "Confirmed. Tap Next shot when ready." Changing the result or distance asks again | `shotPlausibility`, `plausibilityKey` | round-tracking.test › CH-11102 |
| CH-11103 | A shot that can't happen (a 540-yard drive onto the green) | The reason, with no Confirm; Next shot stays off | `shotPlausibility` | round-tracking.test › CH-11103 |
| CH-11104 | The distance isn't a number | "Enter the distance as a number, like 150." under a red-ringed box | `ShotEntry` | round-tracking.test › CH-11104 |
| CH-11105 | A changed shot breaks a shot rule | In the sheet: the reason; a block disables Save, a warning turns it into "Save anyway" | `EditShotSheet`, `editedShotIssues` | preview |
| CH-11106 | A hole reaches shot 12 | "Shot 12 of 15. 3 more before the limit."; at 15 "This is the most strokes a hole can record (15). Hole out or pick up." | `ShotEntry` | round-tracking.test › CH-11106 |
| CH-11107 | A hole's yardage is missing or too long (1 to 999, the legacy editor's bounds) | The Start hint names it ("Hole 4 needs a yardage"); a wrong value rings its box | `setupBlocker`, `holeIssue`, `HoleConfig` | round-setup.test › CH-11109 (rules) |
| CH-11108 | Adding a course: a step isn't complete | The footer names it ("Enter the course's name", "Name the tees you're playing", "A course rating is between 55 and 80", "Hole 1 needs a yardage"); Next waits | `addCourseIssue` | round-setup.test › CH-11108 |
| CH-11109 | The round's date is after today | "The round's date can't be after today" in the dock; the date box is ringed; Start waits | `setupBlocker`, `RoundSetup` | round-setup.test › CH-11109 |

## 112xx Didn't load

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-11201 | The posted rounds don't load | "Your rounds didn't load" + "Nothing is lost. Your posted rounds are still saved; try again in a moment." + Try again (asks the server again). The season card, search and the book are not drawn; it never reads as "no rounds" | `InlineNotice` in the hero | rounds.test › CH-11201 |
| CH-11202 | The round-in-progress check fails | "Couldn't check for a round in progress" + "Any round you started is still saved. Try again in a moment." + Try again, in place of the card | `UnfinishedCard` | rounds.test › CH-11202 |
| CH-11203 | A section crashes while drawing | "Season scoring couldn’t be shown." (or "Your round in progress", "Your rounds") + "The rest of the page is fine. This has been reported automatically." + Try again; the rest of the page stays | `SectionBoundary rounds.unfinished`, `rounds.season`, `rounds.book` | rounds.test › CH-11203 |
| CH-11204 | A review's hole-by-hole card doesn't load | "The scorecard didn't load" + "The round's totals are right; the hole-by-hole card is missing. Try again in a moment." + Try again; the hero and figures still show | `RoundReview` | round-review.test › CH-11204 |
| CH-11205 | A review's shots don't load | "The shots for this round didn't load" + "The scorecard is right; only the shot-by-shot detail is missing." + Try again, in the hole card | `HoleCard` | round-review.test › CH-11205 |
| CH-11206 | The round itself doesn't load | "This round didn't load" + "Nothing is lost; the round is still saved. Try again in a moment." + Try again | `ReviewLoadFailed` | round-review.test › CH-11206 |
| CH-11207 | The shot screen gets a hole that doesn't exist | "This hole didn't load. Go back to Rounds and continue the round from there." | `RoundTracking` | preview |
| CH-11208 | A course's tees don't load | "The tees at Finley GC didn't load" + "Try again, or add the course by hand." + Try again | `CoursePicker` | round-setup.test › CH-11208 |
| CH-11209 | The course library doesn't load | "The course library didn't load" + "Your round isn't started yet, so nothing is lost. Try again, or add the course by hand." + Try again | `CoursePicker` | round-setup.test › CH-11209 |
| CH-11210 | The picked tees' scorecard doesn't load | "The scorecard didn't load" + "Your course and tees are picked; only the pars and yardages are missing. Try again."; Start waits | `RoundSetup` | round-setup.test › CH-11210 |
| CH-11211 | The player's qualifiers don't load (Qualifier chosen) | "Your qualifiers didn't load" + "Play it as a practice round, or come back in a moment." | `RoundSetup` | round-setup.test › CH-11211 |

## 113xx Empty

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-11301 | No round posted and none in progress | "No rounds yet" + "Track your first round shot by shot. Your scores, stats and every round you post show up here." Start a round, once round entry is rebuilt | `EmptyState size="page"` | rounds.test › CH-11301 |
| CH-11302 | Rounds posted, but no countable 18-hole round since August 1 | "Your season starts with your first 18-hole round." + "Scoring average, best round, putts and greens fill in here from 18-hole rounds posted since August 1." The rounds still list below | `SeasonCard` | rounds.test › CH-11302 |
| CH-11303 | A course search matches nothing | "No rounds at “Pinehurst”" + "Check the spelling, or search part of the course name." | `EmptyState compact` | rounds.test › CH-11303 |
| CH-11304 | No round in progress | "No round in progress" · "Ready when you are." + "Start a round and track every shot. It saves as you go, so you can pick it back up here." A ghost 18-hole strip, then "Last round Sep 26 · Finley GC" (or "No rounds posted yet") | `UnfinishedCard` | rounds.test › CH-11304 |
| CH-11305 | A round posted as a total, with no holes | "Posted as a total" + "This round was posted with its score only, so there's no hole-by-hole card or shots to show." The hero and figures still show | `EmptyState compact` in `RoundReview` | round-review.test › CH-11305 |
| CH-11306 | A hole with a score but no shots tracked | "No shots were tracked on this hole. It was scored as a total." | `HoleCard` | round-review.test › CH-11306 |
| CH-11307 | A round that doesn't exist, or one this viewer may not see | "This round isn't here" + (player) "It may have been deleted, or it isn’t one of your rounds." / (coach) "… or it was played by someone who isn’t on your team." + Go to your rounds / Go to Stats. The same page either way, so it never confirms someone else's round exists | `ClubhouseRoundReviewRoute` | round-review.test › CH-11307 |
| CH-11308 | A hole with no shots yet | "No shots yet on this hole" in the shot log | `ShotLog` | round-tracking.test › CH-11502 |
| CH-11309 | No course chosen yet | The scorecard's place holds a faint card: "Your scorecard appears here once you pick a course and tees."; the dock says "Choose a course to start" | `RoundSetup` | round-setup.test › CH-11309 |
| CH-11310 | The course search matches nothing (or the library is empty) | "No courses match “zzz”. Check the spelling, or add it by hand." | `CoursePicker` | round-setup.test › CH-11510 |
| CH-11311 | A course has no tees ready to play | "Chapel Ridge GC has no tees ready to play yet. A coach can finish them in the course library; for now, add the course by hand."; draft tees show, not playable | `CoursePicker` | round-setup.test › CH-11208 |
| CH-11312 | Qualifier chosen, but none is open | "No qualifier is open for you right now. Your coach opens one when it's time; until then, play a practice or tournament round." | `RoundSetup` | round-setup.test › CH-11312 |
| CH-11313 | A round with no strokes gained (posted without shots) | One line where the Strokes gained card would be: "No strokes gained for this round. It is worked out from shots tracked hole by hole." The hero, figures and card still show | `StrokesGained` in `RoundReview` | strokes-gained.test › CH-11313 |

## 114xx Loading

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-11401 | The page is on its way | The header, the round card beside the season card, the tools and four rows, in place | `RoundsSkeleton` via `rounds/loading.tsx` (`ClubhouseSwitch`) | rounds.test › CH-11401 |
| CH-11402 | A holed-out hole is saving | "Saving hole 4…" with a spinner above its shots; the shots can't be changed until it lands | `HoleReview` | round-tracking.test › CH-11402 |
| CH-11403 | The course library is loading | Four row-shaped blocks, `aria-busy` | `CoursePicker` | round-setup.test › CH-11403 |
| CH-11404 | A course's tees are loading | Three tee-card-shaped blocks | `CoursePicker` | preview |
| CH-11405 | The picked tees' scorecard is loading | Nine hole-row blocks where the scorecard goes; Start waits ("Loading the scorecard") | `RoundSetup` | preview |
| CH-11406 | A round's review is loading | The back link, the green hero, the figures and the scorecard frame as skeletons, in place; outside Clubhouse, Fairway's | `RoundReviewSkeleton` via `ClubhouseSwitch` in `rounds/[id]/loading.tsx` | round-review.test › CH-11406 |
| CH-11407 | Round entry is on its way: the address's own loading, and, on /rounds/new, the beat before the device's day and the player's qualifiers are read | The back link, the course card, the details and scorecard cards and the dock, in place, `aria-busy`. Outside Clubhouse, Fairway's | `RoundEntrySkeleton` via `ClubhouseSwitch` in `rounds/new/loading.tsx` and `continue/[id]/loading.tsx`, and `NewRound` while it reads | round-entry-routes.test › CH-11407, round-entry-wiring.test › CH-11407 |

## 115xx Confirm

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-11501 | Discard on an unfinished round | "Discard this round?" + "Every shot from Finley GC on Oct 14 is deleted. This can't be undone." Keep it · Discard round (danger; "Discarding" while it runs) | `Modal` | rounds.test › CH-11501 |
| CH-11502 | Undo | "Undo shot 2?" + the shot + Keep it / Undo | `UndoConfirm` | round-tracking.test › CH-11502 |
| CH-11503 | Penalty | "Add a penalty stroke": out of bounds, water, unplayable, lost ball, each with what it means; for stroke and distance, which stroke went (the last one entered, or one from here not entered yet). Add waits for a choice; it works before the first shot | `PenaltySheet` over `usePenaltyHandler` | round-tracking.test › CH-11503 |
| CH-11504 | Leaving a hole with a result picked but not recorded | "Leave this shot?" + Stay / Leave without it | `UnsavedSheet` | round-tracking.test › CH-11504 |
| CH-11505 | A recorded shot is tapped | "Change shot 1": club, lie before, distances, result, miss, putt read; Delete asks "Delete shot 1?" first | `EditShotSheet` over `useEditShotModal` | round-tracking.test › CH-11505 |
| CH-11506 | Exit | The round so far ("Finley GC · thru 3 · +1") + Save for later / Keep playing / Discard round | `ExitSheet` | round-tracking.test › CH-11506 |
| CH-11507 | Discard round from Exit | "Discard this round?" + "It deletes every shot you entered at Finley GC. This can't be undone." + Keep it / Discard round | `ExitSheet` | round-tracking.test › CH-11506 |
| CH-11508 | The last hole is saved | "Round complete": score and to par, putts, fairways, greens, front and back, the card; Back to hole 18 / Submit round | `RoundCompleteSheet` | round-tracking.test › CH-11508 |
| CH-11509 | Scorecard, from the top bar | Both nines with par, score and putts, totals of what's scored, the current hole marked | `ScorecardSheet` | round-tracking.test › CH-11509 |
| CH-11510 | Browse courses (or Change course) | "Where are you playing?": search, Recently played, Team courses, Course library (one Results list when searching), Add a course; a course opens its tees with length, par, rating and slope | `CoursePicker` | round-setup.test › CH-11510 |
| CH-11511 | Add a course | Four steps (course, tee, holes, review); the course is the round's own, and "Save this course for next time" (on) saves it and offers it to the library (Q-72h) | `AddCourseSheet` | round-setup.test › CH-11511 |
| CH-11512 | A round saved on this device is found on opening (an interrupted round) | The exit sheet's shape: "Recover unsaved progress" + "Saved on this device. It may have been saved when the app was interrupted.", the round card (holes done as a count and a bar, "Finley GC", "Blue tees · Practice · saved 5 min ago", or "Shots on a hole in progress") and two rows: Restore round (the primary, light haptic; "Restoring…" while it writes, both rows wait and the dialog can't close) and Discard saved shots. Closing without choosing keeps the copy | `RecoveryDialog` | round-entry.test › CH-11512 |
| CH-11513 | Discard saved shots on that dialog | The exit sheet's discard question: "Discard the saved shots?" + "The copy of your round at Finley GC saved on this device is deleted. This can't be undone." + Keep it / Discard shots. Only the device copy goes; a round already on the server is untouched | `RecoveryDialog` (`DiscardConfirm`) | round-entry.test › CH-11513 |
| CH-11514 | Starting a round finds one already in progress for this course and date, with real progress | The exit sheet's shape: "Round already in progress" + "You already have a round in progress for Finley GC on this date.", the round card in the Library card's voice (scored holes as a count and a bar, "Finley GC", "In progress · updated 2h ago"; no tees or type, which the conflict doesn't carry) and three rows: Resume (the primary, light haptic), Start a new round ("Keeps that round. For a second round on a 36-hole day.") and Discard. Every row waits while an action runs and the dialog can't close; nothing happens on its own | `InProgressConflictDialog` | round-entry.test › CH-11514 |
| CH-11515 | Discard on that dialog | The exit sheet's discard question: "Discard this round?" + "It has 4 scored holes, last updated 2h ago. This can't be undone." + Keep it / Discard round ("Discarding…" while it runs); once it is gone, this round starts | `InProgressConflictDialog` (`DiscardConfirm`) | round-entry.test › CH-11515 |
| CH-11516 | A submit is refused because the coach closed the round's qualifier (the refusal contains "qualifier" and "already been completed") | The exit sheet's shape: "This qualifier is closed" + the server's sentence ("This qualifier has already been completed. Rounds can no longer be submitted.") + "Your round and every shot are saved." and rows: Save as practice round (the primary, light haptic; "Saving as practice…"; "It won't count toward the qualifier"), Save for later, Go back, Discard round. No Try again: the same submit is refused every time. Any other submit failure is CH-11005 | `SaveAsPracticeSheet` | round-entry.test › CH-11516 |
| CH-11517 | Discard round on that sheet | The exit sheet's discard question: "Discard this round?" + "It deletes every shot you entered. This can't be undone." + Keep it / Discard round. The legacy overlay discarded on one tap | `SaveAsPracticeSheet` (`DiscardConfirm`) | round-entry.test › CH-11517 |
| CH-11518 | A saved qualifier round with no round number (it predates the durable number) is finished and submitted | "Which qualifier round is this?" + "This saved scorecard needs its qualifier round number before it can be submitted. Your shots and completed holes stay saved." and one row per unused round the server offered ("Qualifier round 3", the chosen one primary); Back returns to the finish sheet; Submit round waits for a choice and posts as that round. The legacy continue screen's "Choose qualifier round" dialog | `QualifierRoundSheet`, `requestRoundSubmission`, `handleQualifierRound*` | round-entry-continue.test › CH-11518 |
| CH-11519 | The same, and no round is left to choose | The server's reason in the rows' place ("Every configured qualifier round is already saved for you. …"), or "No unused qualifier round is available right now. Your scorecard remains saved."; only Back remains | `QualifierRoundSheet` | round-entry-continue.test › CH-11519 |

## 116xx Motion

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-11601 | Hovering a round that opens its review | It lifts 1px and its ring turns green (quick) | `a.ch-rd-sc:hover`, `--ch-dur-quick` | preview |
| CH-11602 | The shot log opens | Its chevron turns (base); the rows show at once. No turn with reduced motion | `ShotLog`, `.ch-rt-log__chev` | preview |
| CH-11603 | Submitting the round | A spinner (still with reduced motion) and what is really happening: "Saving 71 shots, updating your stats and writing the round recap." No timed fake steps (Q-72d). Posted: a tick (the success haptic, once), "Round posted", View round review, which opens on its own after two and a half seconds | `SubmitOverlay` | round-tracking.test › CH-11603 |

## 117xx Haptics

| # | When | They feel | How | Test |
| --- | --- | --- | --- | --- |
| CH-11701 | Discard is tapped | Warning, before the question | `askDiscard` | rounds.test › CH-11701 |
| CH-11702 | A round is opened | Selection | `RoundRow` | rounds.test › CH-11702 |
| CH-11703 | Continue, Submit or Start a round is tapped | Light (press) | `UnfinishedCard`, the more-unfinished list | rounds.test › CH-11703 |
| CH-11704 | A hole is picked on the review's card, or stepped with the arrows | Selection | `ReviewNine`, `RoundReview.step` | round-review.test › CH-11704 |
| CH-11705 | A shot is recorded (Next shot or Hole out) | Medium, once (the Button's own tap is replaced); every choice in the panel is a selection tick | `ShotEntry`, `Seg` | preview |
| CH-11706 | Going to another hole | Selection (the engine's navigation port) | `PORTS` in `RoundTracking` | preview |
| CH-11707 | Undo, Delete shot, Discard round, Leave without it | Warning | `UndoConfirm`, `EditShotSheet`, `ExitSheet`, `UnsavedSheet` | preview |
| CH-11708 | The second tap of a discard in round entry: the saved shots, the round already in progress, or the closed-qualifier round | Warning, before the discard runs | `DiscardConfirm` | round-entry.test › CH-11708 |
| CH-11709 | A failure appears in round entry: an inline line, a toast or a banner (CH-11008 to CH-11013, CH-11902) | Error, once per message | `useErrorHaptic`, `useEntryFailureToast`, `ReloadBanner` | round-entry.test › CH-11709 |

## 118xx Accessibility

| # | When | They get | How | Test |
| --- | --- | --- | --- | --- |
| CH-11801 | A screen reader moves through the book | Each round is one link (or one group before Review is rebuilt) named "Sep 26, Finley GC, 72 (E)"; each month or course is a labelled region; the page is labelled by "Your rounds" | `RoundRow`, `main aria-labelledby` | rounds.test › CH-11801 |
| CH-11802 | The in-progress card's hole strip | The strip is hidden from screen readers; the card says the same in words: "+1 through 3", "Continue at hole 4" | `Strip aria-hidden` | rounds.test › CH-11802 |
| CH-11803 | The season ribbon | One labelled image: "Strokes over par for your last 8 rounds, oldest to newest; average +1.9"; each bar has a title with its date, score and type | `Ribbon role="img"` | rounds.test › CH-11803 |
| CH-11804 | The review's card | Two tables, captioned "Front nine" and "Back nine", with a button per hole number (pressed on the one shown); fairways and greens read "Hit", "Missed" or "Not applicable"; the hole card is a polite live region, so stepping holes is announced | `ReviewNine`, `HoleCard` | round-review.test › CH-11804 |
| CH-11805 | The hole strip | Holes you can go to are buttons ("Go to hole 1, 4 strokes"); the rest are named marks ("Hole 2, current hole") | `TrackStrip` | round-tracking.test › CH-11805 |
| CH-11806 | Choices in the entry and the sheets | Radio groups named for what they choose ("Shot result", "Where it missed the green"); putt tags are toggle buttons | `Seg`, the miss grid | preview |
| CH-11807 | The distance box | Labelled by its section ("Distance remaining (yds)"), `aria-invalid` with its message when it isn't a number | `ShotEntry` | preview |
| CH-11808 | The hole map | One image named in words ("Hole 4, par 4: 2 shots so far"), captioned Schematic | `HoleMap` | preview |

## 119xx Network and UX

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-11901 | The round saves in the background | A small pill under the top bar: "Saving round", "Round saved", or "Not synced yet, retrying" (the engine retries on its own) | `RoundTracking` (`autoSaveStatus`) | preview |
| CH-11902 | The round changed on another device and this one stopped saving | The shot screen's amber note with an action (as CH-11003) above the shot screen: "This round was updated on another device." + "Saving is paused here so this device can't overwrite the newer round. Reload to continue." + Reload ("Reloading…" once tapped); nothing to dismiss. A Save for later refused for the same reason shows it as a toast with Reload instead of Retry. The two engines word it differently ("Please reload.", "Reload to continue."); both are this state. Error haptic (CH-11709). The legacy screens draw no "restoring" or "back online" state here, so neither does this | `ReloadBanner`, `useEntryFailureToast('round-updated')` | round-entry.test › CH-11902 |
| CH-11903 | The engine reports that auto-save is having trouble ("Auto-save is having trouble. …", both engines) | Toast "Saving is slow" + "Your shots are safe on this device. The copy on the server may be late." At most once a minute (the engine throttles it) | `noticeToast` in `ports` | round-entry-routes.test › CH-11903 |
| CH-11904 | The device couldn't keep its quick local backup | Toast "This device couldn't keep a quick backup" + "Your shots are still saving to a slower backup and to the server." Once a session | `noticeToast` | round-entry-routes.test › CH-11903 |
| CH-11905 | A submit couldn't reach the server, and the round is saved on the device | Toast "Your round is saved on this device" + "It couldn't reach the server. Continue it from Rounds to submit again." Then Rounds opens, where the round waits and Continue offers the device copy (CH-11512). `/rounds/recover` is Fairway's and has no Clubhouse screen, so the engine's recover route is Rounds (`ENGINE_ROUTES`) | `noticeToast`, `routes.recover` | round-entry-routes.test › CH-11903 |
| CH-11906 | A closed-qualifier round is changed to practice | Toast "Saved as a practice round"; the finish sheet is back to submit (the continue engine reloads the page) | `noticeToast` | round-entry-wiring.test › CH-11012 |
| CH-11907 | Starting a qualifier round finds the player's own round in progress for that qualifier | Toast "You already have a round in progress for this qualifier" + "Opening it." and that round opens to continue. Starting is refused for good; nothing is created | `NewRound` (`startRefusal('qualifier_round_active')`) | round-entry-wiring.test › CH-11907 |
| CH-11908 | Any other note an engine raises (an error outside an action, or a wording this screen doesn't know) | Toast with the engine's own words; an error ticks the error haptic (CH-11709), so nothing the engine says is dropped | `noticeToast`, `useRoundPorts` | round-entry-routes.test › CH-11908 |
| CH-11909 | The submit has taken over 15 seconds | Under "Submitting round": "This is taking longer than usual. Your round is saved on this device, and it is waiting in Rounds." with Rounds as a link | `SubmitOverlay` (`slowHref`), `SUBMIT_SLOW_MS` | round-entry-routes.test › CH-11909 |
| CH-11910 | Every hole is in but the finish sheet was closed | A note over the shot screen: "All holes are in. Review the round, then submit it." + Review and submit, which opens the finish sheet again | `RoundRuntime` | round-entry-routes.test › CH-11910 |
