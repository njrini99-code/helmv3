# P011 — Rounds: page contract

Every behaviour Rounds promises, by the 25 V2 categories (D-69). A contract's number is its Bridge ID (D-68:
namespace 11, category, item); `Code` is the catalog code on the element and in the test
(`docs/clubhouse/catalog/rounds.md`). Rows without a code are behaviours with no single element, recorded in
`config/clubhouse/bridge-contracts.json` by hand. The shell's contracts (P001, namespace 1) apply here too and are
named where they carry a category. `clubhouse:check` holds this file to the registry.

The page has four surfaces (PAGE.md, "What is live"). The library and the review are routed. Setup and the shot
screen are preview only until the engine move, so what is said of them is proved by the tests and the preview, not
by a live route. Every hand contract is `reserved` for now: none is `implemented` until a test title carries its
Bridge ID. Each category's note says which hand contracts a test would cover (the test is named in the contract's
`tests`) and which have no covering test at all; VERIFY.md repeats the split.

## 01 — Default / core UI

Status: DEFINED

The library opens for a player and the review for a player or a coach of the player's team; the server has read
both before first paint, so nothing is fetched in the browser to draw them. Setup and the shot screen draw the same
way in the preview, from fixtures and fake ports. Picking a hole in the review changes state only, so a reload opens
on the first hole over par again. A test covers 110101 to 110113; none of them names its Bridge ID yet.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 110101 | — | `LIBRARY_READY` | Rounds opens for a player on "Your rounds", read on the server before first paint: the round in progress (or the idle card, "No round in progress") beside the season card, then the search and grouping tools and every posted round by month or by course. The header reads "Since August 1 · N counted rounds". Only the player's own rounds are read (110803). |
| 110102 | — | `REVIEW_READY` | A round's review at /golf/dashboard/rounds/[id] opens for the player who played it and for a coach of their team: the hero (day, date and type, the course, tee swatch, yards, rating and slope, then the score and its to par), the figures (Front 9, Back 9 on an 18-hole round, Putts, Fairways, Greens), the scorecard as two captioned nines, the hole card with the shots of the picked hole, the scoring distribution, and the round recap and the player's notes when there are any. It opens on the first hole over par, else the first hole. Back goes to Rounds for a player and, for a coach, to that player's rounds on Stats with the player's name (D-53); a coach's kicker names the player and the notes are labelled with the player's first name ("Jonah's notes" in the preview). |
| 110103 | — | `SETUP_READY` | A new round's setup (preview only until the engine move) opens on the green band with its steps (Course, Scorecard, Track), the course card ("Choose a course", Browse courses), an open qualifier when there is one, Round details (type, date, holes), the scorecard's place held ("Your scorecard appears here once you pick a course and tees.") and the dock, whose Start round is off and names why ("Choose a course to start"). Picking tees reads that tee's holes and fills the scorecard; a hole changed for this round is counted and marked ("1 hole edited for this round"), edits never leave this round, and the dock then reads "Course · Tee · N holes · Par P". |
| 110104 | — | `TRACKING_READY` | The shot screen (preview only until the engine move) opens on the hole it is given: the top bar with Exit and Scorecard, the hole strip, the hole hero (hole number, par, yards, "Shot N" and the distance to the pin), the hole map and the shot log, and the shot entry, whose Next shot is off with the one thing missing named above it. Every rule and write is useShotTracking, the hook the Fairway screen runs; the round screen around it owns Exit, the scorecard, Round complete and Submit. |
| 110105 | — | `UNBUILT_TARGETS_ARE_NOT_DRAWN` | A control whose screen is not rebuilt is not drawn, never a dead button (nav.rebuiltHref). New round, Start a round, Continue and Submit lead to /rounds/new and /rounds/continue/[id], which are not rebuilt (the shell draws its not-rebuilt notice there), so none is drawn today; every posted round in the book opens its review. A round whose review cannot be opened is still listed, as one named group. /rounds/[id]/review (CoachHelm's) is not rebuilt for either role, and neither is the coach's Rounds library. |
| 110106 | — | `UNFINISHED_ROUNDS_ARE_LISTED` | The newest unfinished round fills the card; every other one is listed under "N more unfinished rounds" with Discard and, once round entry is rebuilt, Continue or Submit. A round whose every hole has a score reads "Ready to submit" (the card says "Submit round"), unless a completed round already holds that course and day, and never when the hole read failed. The card's strip marks each scored hole against par and rings the next one. |
| 110107 | — | `NOT_COUNTED_ROUNDS_STILL_LIST` | A posted round that does not count (isCountableRound) is still listed, with a "Not counted" pill, and sets no season figure. A 9-hole round shows its hole count in place of Out and In and sets no season figure either (full 18-hole rounds only, as on Home and Stats). |
| 110108 | — | `SEARCH_AND_GROUP_THE_BOOK` | The book is searched by course (client side, any part of the name, ignoring case) and grouped by month, newest first, or by course, in the order of each course's newest round; each group shows its round count, its average over its 18-hole rounds and its low. A search with no match says so (CH-11303) and keeps the tools where they are. |
| 110109 | — | `A_ROUND_STILL_BEING_PLAYED_GOES_TO_BE_CONTINUED` | Opening a round that is still in progress at /rounds/[id] redirects to /rounds/continue/[id], as the legacy page does. That screen is not rebuilt, so a Clubhouse player sees the shell's not-rebuilt notice there until the engine move. |
| 110110 | — | `START_HANDS_THE_WHOLE_FORM_TO_THE_ROUND_SCREEN` | Start round hands the round screen's port one form: the course and tee ids (or the course typed by hand), the round type, the date, 9 or 18 holes and which nine, every hole's par and yardage as edited, the qualifier and the round it counts as, and whether to save a typed course. It goes through useAction; the round opens (onStarted) only when the port answers with the new round's id, and that follow-up is inside the action, so a Retry opens it too (111401). |
| 110111 | — | `A_NINE_HOLE_ROUND_PLAYS_ONE_NINE` | A 9-hole tee set plays 9 and turns 18 off. On an 18-hole card, choosing 9 holes offers Front 9 or Back 9, and the dock and the scorecard total the chosen nine ("9 holes · Par 36"). |
| 110112 | — | `TRACKING_FOLLOWS_THE_DISTANCE_UNIT` | The shot screen follows the player's distance unit: the hero, the section labels ("Distance remaining (m)") and the quick picks read in meters when the preference is meters. What the engine stores stays yards and feet. |
| 110113 | — | `THE_OPEN_QUALIFIER_SETS_THE_ROUND` | When the player has an open qualifier, it is offered above Round details. Play sets the type to Qualifier, the course and the tees, and the note says which round it counts as ("This counts as round 3 of 3 in Fall qualifier 2"). Choosing the Qualifier type lists the player's qualifiers; one with no round open is listed but cannot be chosen (110805). |

## 02 — Initial loading / skeleton

Status: DEFINED

The library's route skeleton (CH-11401) is the Clubhouse one inside the shell and Fairway's outside it
(`rounds/loading.tsx` through `ClubhouseSwitch`); nothing shows for the first 150ms, then a fade (the shell's
11609). The review has no Clubhouse skeleton: `rounds/[id]/loading.tsx` is Fairway's, so a Clubhouse review loads
under the Fairway one (110206, reserved, no catalog row, no test). Setup and the shot screen load in place: the
course library (CH-11403), a course's tees (CH-11404), the scorecard (CH-11405), and a hole saving (CH-11402).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 110201 | CH-11401 | `THE_PAGE_IS_ON_ITS_WAY` | The page is on its way |
| 110202 | CH-11402 | `A_HOLED_OUT_HOLE_IS_SAVING` | A holed-out hole is saving |
| 110203 | CH-11403 | `THE_COURSE_LIBRARY_IS_LOADING` | The course library is loading |
| 110204 | CH-11404 | `A_COURSES_TEES_ARE_LOADING` | A course's tees are loading |
| 110205 | CH-11405 | `THE_PICKED_TEES_SCORECARD_IS_LOADING` | The picked tees' scorecard is loading |
| 110206 | — | `REVIEW_LOADS_UNDER_A_CLUBHOUSE_SKELETON` | A round's review loads under a Clubhouse skeleton inside the shell. Not built: rounds/[id]/loading.tsx is Fairway's (it has no ClubhouseSwitch, and there is no catalog row for it), so a Clubhouse review shows the Fairway skeleton first; the library's is CH-11401 through rounds/loading.tsx. No test covers it. The same class of gap Team Hub closed with CH-10405. |
| 110207 | CH-11406 | `A_ROUNDS_REVIEW_IS_LOADING` | A round's review is loading |

## 03 — Background loading / refresh

Status: N/A — the library and the review have no realtime, polling or pull to refresh: the server reads the page once per visit, and a Try again reads it again (category 14). The shot screen's background save is a network state, not a refresh of the page (category 07).

## 04 — Empty

Status: DEFINED

First run is the whole-page empty state (CH-11301, with Start a round once entry is rebuilt); a season with no
countable 18-hole round has its own card (CH-11302) and the rounds still list; a search that matches nothing says
so (CH-11303); nothing in progress is the idle card (CH-11304). The review has a round posted as a total
(CH-11305) and a hole scored without shots (CH-11306), and a round that is missing or not the viewer's is the
not-here page (CH-11307); the shot screen has a hole with no shots yet (CH-11308). Setup has no course chosen yet
(CH-11309), a search with no match (CH-11310), a course with no playable tees (CH-11311) and no open qualifier
(CH-11312). A failed read is never shown as empty: the first-run page shows only when every read answered and was
empty (110413). A test covers 110413.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 110401 | CH-11301 | `NO_ROUND_POSTED_AND_NONE_IN_PROGRESS` | No round posted and none in progress |
| 110402 | CH-11302 | `ROUNDS_POSTED_BUT_NO_COUNTABLE_18_HOLE` | Rounds posted, but no countable 18-hole round since August 1 |
| 110403 | CH-11303 | `A_COURSE_SEARCH_MATCHES_NOTHING` | A course search matches nothing |
| 110404 | CH-11304 | `NO_ROUND_IN_PROGRESS` | No round in progress |
| 110405 | CH-11305 | `A_ROUND_POSTED_AS_A_TOTAL_WITH` | A round posted as a total, with no holes |
| 110406 | CH-11306 | `A_HOLE_WITH_A_SCORE_BUT_NO` | A hole with a score but no shots tracked |
| 110407 | CH-11307 | `A_ROUND_THAT_DOESNT_EXIST_OR_ONE` | A round that doesn't exist, or one this viewer may not see |
| 110408 | CH-11308 | `A_HOLE_WITH_NO_SHOTS_YET` | A hole with no shots yet |
| 110409 | CH-11309 | `NO_COURSE_CHOSEN_YET` | No course chosen yet |
| 110410 | CH-11310 | `THE_COURSE_SEARCH_MATCHES_NOTHING` | The course search matches nothing (or the library is empty) |
| 110411 | CH-11311 | `A_COURSE_HAS_NO_TEES_READY_TO` | A course has no tees ready to play |
| 110412 | CH-11312 | `QUALIFIER_CHOSEN_BUT_NONE_IS_OPEN` | Qualifier chosen, but none is open |
| 110413 | — | `FIRST_RUN_ONLY_WHEN_EVERY_READ_ANSWERED` | The first-run page ("No rounds yet", CH-11301) shows only when the posted-rounds read and the in-progress read both answered and both were empty: a failed list read shows its own notice (CH-11201) and a failed in-progress check its own (CH-11202), never the first-run page. |
| 110414 | CH-11313 | `A_ROUND_WITH_NO_STROKES_GAINED` | A round with no strokes gained (posted without shots) |

## 05 — Validation

Status: DEFINED

Nothing is sent with a mistake in it: the controls that send are off, with the one thing wrong named beside them.
Start round names it in the dock (110510): a yardage that is missing or over 999 (CH-11107), a date after today
(CH-11109), and when adding a course the step's own message (CH-11108). Pars are buttons for 3 to 6, and the yardage
box takes digits only. On the shot screen the one thing missing is named above the disabled Next shot (CH-11101),
by the rules the Fairway entry runs (`shot-entry-rules`, so the hint cannot disagree with the button); an unusual
shot asks once (CH-11102), an impossible one is blocked (CH-11103), a distance that is not a number says so
(CH-11104), a changed shot that breaks a rule says so in its sheet (CH-11105), and shot 12 warns of the 15-stroke
limit (CH-11106). A test covers 110510.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 110501 | CH-11101 | `NEXT_SHOT_CANT_BE_RECORDED_YET` | Next shot can't be recorded yet |
| 110502 | CH-11102 | `A_SHOT_IS_POSSIBLE_BUT_UNUSUAL` | A shot is possible but unusual (a 420-yard drive onto the green; a shot that ends farther away) |
| 110503 | CH-11103 | `A_SHOT_THAT_CANT_HAPPEN` | A shot that can't happen (a 540-yard drive onto the green) |
| 110504 | CH-11104 | `THE_DISTANCE_ISNT_A_NUMBER` | The distance isn't a number |
| 110505 | CH-11105 | `A_CHANGED_SHOT_BREAKS_A_SHOT_RULE` | A changed shot breaks a shot rule |
| 110506 | CH-11106 | `A_HOLE_REACHES_SHOT_12` | A hole reaches shot 12 |
| 110507 | CH-11107 | `A_HOLES_YARDAGE_IS_MISSING_OR_TOO` | A hole's yardage is missing or too long (1 to 999, the legacy editor's bounds) |
| 110508 | CH-11108 | `ADDING_A_COURSE_A_STEP_ISNT_COMPLETE` | Adding a course: a step isn't complete |
| 110509 | CH-11109 | `THE_ROUNDS_DATE_IS_AFTER_TODAY` | The round's date is after today |
| 110510 | — | `START_NAMES_THE_ONE_THING_STOPPING_IT` | Start round is off until the setup is complete, and the dock names the one thing stopping it, in the order a player fixes it: no course ("Choose a course to start"), no date, a date after today (CH-11109), the qualifier round when the type is Qualifier, a 9-hole card played as 9, then the first hole with no yardage or a yardage over 999 (CH-11107). While the scorecard loads or fails to load, the dock says so instead. |

## 06 — Server / system error

Status: DEFINED

Discard and Start have their own toast naming what failed and what to do, with Retry (CH-11001, CH-11007). On the shot
screen a failure is said where it happened: the undo (CH-11002), a hole that does not save (CH-11003, Try again),
changing or deleting a shot (CH-11004), the submit (CH-11005, Try again) and Exit's discard (CH-11006). Every read that
fails has its own notice with Try again (CH-11201, CH-11202, CH-11204 to CH-11206, CH-11208 to CH-11211), a hole that
does not exist on the shot screen says so (CH-11207), and a crash stays in its section (CH-11203, `SectionBoundary`).
A partial read still renders the rest (110619). A player whose team membership read fails gets the route's error view,
never "no team" (shared with every page, `routes/team.ts`; not tested here). Neither route has a Clubhouse error view:
`rounds/error.tsx` and `rounds/[id]/error.tsx` are the shared Fairway boundary.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 110601 | CH-11001 | `DISCARDING_AN_UNFINISHED_ROUND_FAILS` | Discarding an unfinished round fails |
| 110602 | CH-11201 | `THE_POSTED_ROUNDS_DONT_LOAD` | The posted rounds don't load |
| 110603 | CH-11202 | `THE_ROUND_IN_PROGRESS_CHECK_FAILS` | The round-in-progress check fails |
| 110604 | CH-11203 | `A_SECTION_CRASHES_WHILE_DRAWING` | A section crashes while drawing |
| 110605 | CH-11204 | `A_REVIEWS_HOLE_BY_HOLE_CARD_DOESNT` | A review's hole-by-hole card doesn't load |
| 110606 | CH-11205 | `A_REVIEWS_SHOTS_DONT_LOAD` | A review's shots don't load |
| 110607 | CH-11206 | `THE_ROUND_ITSELF_DOESNT_LOAD` | The round itself doesn't load |
| 110608 | CH-11002 | `UNDO_FAILS` | Undo fails (tracking) |
| 110609 | CH-11003 | `A_HOLED_OUT_HOLE_DOESNT_SAVE` | A holed-out hole doesn't save |
| 110610 | CH-11004 | `CHANGING_OR_DELETING_A_SHOT_FAILS` | Changing or deleting a shot fails |
| 110611 | CH-11005 | `SUBMITTING_THE_ROUND_FAILS` | Submitting the round fails |
| 110612 | CH-11006 | `DISCARDING_FROM_EXIT_FAILS` | Discarding from Exit fails |
| 110613 | CH-11207 | `THE_SHOT_SCREEN_GETS_A_HOLE_THAT` | The shot screen gets a hole that doesn't exist |
| 110614 | CH-11007 | `STARTING_THE_ROUND_FAILS` | Starting the round fails |
| 110615 | CH-11208 | `A_COURSES_TEES_DONT_LOAD` | A course's tees don't load |
| 110616 | CH-11209 | `THE_COURSE_LIBRARY_DOESNT_LOAD` | The course library doesn't load |
| 110617 | CH-11210 | `THE_PICKED_TEES_SCORECARD_DOESNT_LOAD` | The picked tees' scorecard doesn't load |
| 110618 | CH-11211 | `THE_PLAYERS_QUALIFIERS_DONT_LOAD` | The player's qualifiers don't load (Qualifier chosen) |
| 110619 | — | `A_PARTIAL_READ_STILL_RENDERS_THE_REST` | A read that fails is logged, flagged on its own part and never thrown, so the rest of the page renders. In the library the posted rounds (CH-11201) and the in-progress check (CH-11202) fail apart, and a failed hole read leaves the in-progress card without its strip and never says it is ready to submit. In the review the holes and the shots fail apart (CH-11204, CH-11205) with the hero and the figures still drawn. The round itself failing is CH-11206. |
| 110620 | CH-11008 | `RESTORING_THE_ROUND_SAVED_ON_THIS_DEVICE` | Restoring the round saved on this device fails |
| 110621 | CH-11009 | `DISCARDING_THE_ROUND_ALREADY_IN_PROGRESS_FAILS` | Discarding the round already in progress fails |
| 110622 | CH-11010 | `SAVE_FOR_LATER_FAILS` | Save for later fails |
| 110623 | CH-11011 | `DISCARDING_FAILS_WHERE_NO_DISCARD_QUESTION_HOLDS` | Discarding fails where no discard question holds the message |
| 110624 | CH-11012 | `CHANGING_A_ROUND_TO_PRACTICE_FAILS` | Changing a round to practice fails (qualifier closed) |
| 110625 | CH-11013 | `THE_ROUND_REPORTS_AN_ERROR_WHILE_TRACKING` | The round reports an error while tracking (a failed checkpoint or auto-save, a restore or discard that didn't work) |

## 07 — Network / offline

Status: DEFINED

Discard and Start refuse while offline before anything is sent, with the shell's toast naming what did not happen, and
Try again on a hole that did not save only warns while offline (110702, reserved: no P011 test forces offline). The
shot screen's background save says "Saving round", "Round saved" or "Not synced yet, retrying" in a small pill
(CH-11901); the engine retries on its own. Setup's course, tee and scorecard reads that fail, offline or not, say they
did not load, with Try again (CH-11208 to CH-11210).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 110701 | CH-11901 | `THE_ROUND_SAVES_IN_THE_BACKGROUND` | The round saves in the background |
| 110702 | — | `WRITES_REFUSE_OFFLINE` | Discard (the library) and Start (setup) go through useAction: while the browser is offline nothing is sent, the error haptic fires and the shell's toast names what did not happen, with Retry (10703). On the shot screen, Try again on a hole that did not save, while offline, gives the warning haptic and sends nothing (the card already says "Reconnect, then try again."). No P011 test forces offline; the shell's tests cover useAction's refusal. |
| 110703 | CH-11902 | `THE_ROUND_CHANGED_ON_ANOTHER_DEVICE_AND` | The round changed on another device and this one stopped saving |

From the shell (P001): 10701 CH-1901, 10702 CH-1902, 10703 CH-1903, 10704 CH-1905.

## 08 — Permission / authorization

Status: DEFINED

Who may open the page: a player, or a coach for a review, with `golf_clubhouse_ui` on for that role (the shell's gate);
anyone else gets the Fairway page. The library is for players: a coach session renders nothing from the Clubhouse
route and keeps the Fairway page (110801). A round's review opens for the player who played it and a coach of their team,
and everyone else gets the same not-here page, so it never confirms that someone else's round exists; a failed check
is an error, never "not found" (110802). The library reads only the player's own rounds (110803, reserved: read, not
run). Discard is checked again by its server action (110804, reserved: read, not run), which is the legacy library's
action, unchanged. A qualifier with no round open cannot be chosen (110805). `/rounds/new` and `/rounds/continue/[id]`
are not rebuilt, so the shell draws its not-rebuilt notice there for a Clubhouse player.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 110801 | — | `LIBRARY_IS_FOR_PLAYERS` | /golf/dashboard/rounds is Clubhouse only for a player: a coach session renders nothing from the Clubhouse route and the Fairway page keeps the coach (v2 has no coach Rounds library), and the shell does not list the library as rebuilt for a coach. A player's rounds are theirs with or without a team (the team only sets the time zone that decides today). |
| 110802 | — | `REVIEW_IS_FOR_THE_PLAYER_AND_THEIR_COACHES` | A round's review opens for the player who played it and for a coach of a team the player is an active member of. Anyone else, a missing round and a test round get the same "This round isn't here" page, so it never confirms that someone else's round exists (CH-11307). A failed access check is not a permission answer: a round or a coach's membership read that fails gives "This round didn't load" with Try again (CH-11206), never "not found". |
| 110803 | — | `LIBRARY_HOLDS_ONLY_THE_PLAYERS_OWN_ROUNDS` | The library loader reads golf_rounds for the signed-in player only (their player id, no test rounds): completed rounds for the book and in-progress rounds for the card, through the RLS-scoped client, so no teammate's round is drawn. Read in this pass, not run: no test asserts the player filter. |
| 110804 | — | `DISCARD_IS_CHECKED_AGAIN_BY_ITS_SERVER_ACTION` | Discard is checked again by deleteInProgressRound, whatever the screen shows: it refuses an invalid id, a caller who is not signed in, a caller with no player profile, and a round that is not the caller's or is no longer in progress (it deletes by round, player and in-progress status, and tells a delete that matched nothing from a real one). Read in this pass, not run: no test here forces a refusal; the action is the legacy library's, unchanged. |
| 110805 | — | `A_CLOSED_QUALIFIER_CANT_BE_CHOSEN` | A qualifier with no round the player can still enter is listed but cannot be chosen, and its row says why; only one with a round open is offered above Round details (closed means closed, D-31). Choosing the Qualifier type with none open says "No qualifier is open for you right now" (CH-11312), and a qualifiers read that failed says so (CH-11211). |

From the shell (P001): 10801 CLUBHOUSE_GATE, 10802 ROLE_SCOPED_NAV.

## 09 — Success

Status: DEFINED

A discard that lands says "Round discarded" in a toast with the success haptic (110901). Start lands without a toast,
because the round opening is the confirmation. A submitted round says "Round posted" over the screen and links its
review (110902); using a course you typed in closes its sheet with the success haptic.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 110901 | — | `DISCARD_LANDED` | A discard that lands says so in a toast ("Round discarded") with the success haptic, and the card leaves and the idle card ("No round in progress") takes its place, whether the discard came from the question or from the toast's Retry. |
| 110902 | — | `ROUND_POSTED_SAYS_SO` | A submitted round says "Round posted" with the course, names the coach ("Coach Reyes can see it now.", else "Your coach can see it now.") and links View round review (a preview-only surface until the engine move). While it submits it names the real shot count, not timed steps, and a failed submit says so with Try again (CH-11005). |

From the shell (P001): 10901 CHANGE_LANDED.

## 10 — Warning

Status: DEFINED

Rounds' non-blocking warnings are minted in category 05 by the catalog's kind map, which files a warning under
Validation: the unusual-shot warning that asks once (CH-11102, 110502) and the countdown to the 15-stroke limit
(CH-11106, 110506). Neither is a category-10 contract of its own; Discard, Undo and Delete ask first instead (category 11).

## 11 — Destructive

Status: DEFINED

Discarding an unfinished round asks first, with the warning haptic before the question, and says what goes with it: every
shot, and that it can't be undone (CH-11501, CH-11701). On the shot screen, Undo asks first (CH-11502), Delete shot asks
inside the change sheet (CH-11505), leaving a hole with a result picked but not recorded asks (CH-11504), and Exit's
Discard round asks again (CH-11507). Nothing is optimistic: the card leaves only once the server has deleted the round
(111301). There is no Undo after a discard. The catalog's kind map files every confirm-kind row here, so this category
also holds sheets that are not destructive (Penalty, Exit, Scorecard, Round complete, Browse courses, Add a course).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 111101 | CH-11501 | `DISCARD_ON_AN_UNFINISHED_ROUND` | Discard on an unfinished round |
| 111102 | CH-11502 | `UNDO` | Undo |
| 111103 | CH-11503 | `PENALTY` | Penalty |
| 111104 | CH-11504 | `LEAVING_A_HOLE_WITH_A_RESULT_PICKED` | Leaving a hole with a result picked but not recorded |
| 111105 | CH-11505 | `A_RECORDED_SHOT_IS_TAPPED` | A recorded shot is tapped |
| 111106 | CH-11506 | `EXIT` | Exit |
| 111107 | CH-11507 | `DISCARD_ROUND_FROM_EXIT` | Discard round from Exit |
| 111108 | CH-11508 | `THE_LAST_HOLE_IS_SAVED` | The last hole is saved |
| 111109 | CH-11509 | `SCORECARD_FROM_THE_TOP_BAR` | Scorecard, from the top bar |
| 111110 | CH-11510 | `BROWSE_COURSES` | Browse courses (or Change course) |
| 111111 | CH-11511 | `ADD_A_COURSE` | Add a course |
| 111112 | CH-11512 | `A_ROUND_SAVED_ON_THIS_DEVICE_IS` | A round saved on this device is found on opening (an interrupted round) |
| 111113 | CH-11513 | `DISCARD_ON_THAT_DIALOG` | Discard saved shots on that dialog |
| 111114 | CH-11514 | `STARTING_A_ROUND_FINDS_ONE_ALREADY_IN` | Starting a round finds one already in progress for this course and date, with real progress |
| 111115 | CH-11515 | `DISCARD_ON_THAT_DIALOG_2` | Discard on that dialog |
| 111116 | CH-11516 | `A_SUBMIT_IS_REFUSED_BECAUSE_THE_COACH` | A submit is refused because the coach closed the round's qualifier (the refusal contains "qualifier" and "already been completed") |
| 111117 | CH-11517 | `DISCARD_ROUND_ON_THAT_SHEET` | Discard round on that sheet |

## 12 — State preservation

Status: DEFINED

The library keeps its search and grouping while the page is open, and the review keeps the picked hole; neither is in the
address, so a reload starts again from By month with no search, and on the first hole over par. A Start that fails leaves
the setup as it was (111201, reserved: no test), and a hole that does not save keeps its shots on the review with Try again
(111202, reserved: no test).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 111201 | — | `SETUP_KEPT_WHEN_START_FAILS` | A Start that fails leaves the setup as it was: the course and tees, the type, the date, the holes as edited and the qualifier all stay, and Start can be pressed again or retried from the toast (CH-11007); nothing is cleared until the round opens. Read in this pass: the CH-11007 test proves that Retry opens the round, not that every field is kept, so no test covers this. |
| 111202 | — | `SHOTS_STAY_WHEN_A_HOLE_DOESNT_SAVE` | When a holed-out hole does not save, the shot review stays with every shot listed and Try again (CH-11003); the round does not move on until the save lands, and the card says the shots are kept on this device (the engine's own copy). The test forces the failure and the retry, not the kept shots, so no test covers this. |

## 13 — Optimistic UI

Status: DEFINED

Nothing on the library is optimistic: Discard waits for the server, and the card leaves only on success (111301). The
shot screen adds a shot to the hole at once, and the round screen's engine saves it in the background and retries on its own
(the pill, CH-11901): that is the engine's contract, not an optimistic write of this page.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 111301 | — | `DISCARD_WAITS_FOR_THE_SERVER` | Nothing on the library is optimistic: Discard keeps the card until the server has deleted the round, and the card leaves only on success, from the question or from Retry. The device's emergency copy is cleared only when the delete worked. |

## 14 — Retry / recovery

Status: DEFINED

The error toast's Retry runs the same write with the same arguments, and when it lands everything the button would have done
follows (111401). Try again on a failed-read notice asks again (111402); on the shot screen it runs the hole's save or the
submit again (111403).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 111401 | — | `RETRY_FINISHES_THE_JOB` | The error toast's Retry runs the same write again with the same arguments, and when it lands everything the button would have done follows, because the follow-up lives inside the action: a Discard's Retry removes the card and closes the question, and a Start's Retry opens the round. |
| 111402 | — | `TRY_AGAIN_READS_AGAIN` | Try again on a failed-read notice asks again. The library's and the review's ask the server to read the page again (router.refresh); setup's read the course library, a course's tees or a tee's scorecard again through the port, and Start stays off while the scorecard is missing. The tees' Try again is drawn but no test presses it. |
| 111403 | — | `HOLE_SAVE_AND_SUBMIT_TRY_AGAIN_RUN_AGAIN` | On the shot screen, Try again on a hole that did not save runs the hole's checkpoint again (the round moves on only when it lands), and Try again on a failed submit runs the submit again (preview-only surfaces until the engine move). Offline, the first only warns (110702). |

From the shell (P001): 11401 ROUTE_TRY_AGAIN, 11402 TOAST_RETRY.

## 15 — Data freshness / sync

Status: DEFINED

Nothing refreshes in the background: the page is as fresh as its last read. A discard takes its card out in place and does
not read the page again (an unfinished round never counts toward the season). The total and the season are the one rule Home
and Stats use (111501), the review draws only what was recorded (111502), and a stale tee read is ignored (111503). A round's
date is a date-only value drawn at noon UTC so no time zone moves it a day; "today" is resolved on the server in the team's
zone (America/New_York for a player with no team).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 111501 | — | `TOTALS_AND_SEASON_MATCH_HOME_AND_STATS` | A round's total is the canonical one (withCanonicalRoundTotal: front plus back over a stale stored total), in the library and in the review. The season figures and the ribbon come from countable 18-hole rounds since August 1, the rule Home and Stats use, so the numbers agree across screens; the window and the sample are stated in the words ("Since August 1", "18-hole", "Not counted"). |
| 111502 | — | `REVIEW_SHOWS_ONLY_WHAT_WAS_RECORDED` | The review never invents a figure: a nine with a hole not scored has no total ("—") rather than a short one, a par 3 never counts a fairway whatever was stored, a hole scored without shots says so (CH-11306), a round posted as a total says so (CH-11305), and the recap and the notes are drawn only when they were written. |
| 111503 | — | `A_STALE_TEE_READ_IS_IGNORED` | A slow read for a course the player has left never replaces the next course's tees: the picker keeps only the latest answer of each read. |

## 16 — Micro animation

Status: DEFINED

Rounds adds a little motion of its own, all on the v2 tokens (D-64): a round in the book lifts 1px on hover (CH-11601, preview
only), the shot log's chevron turns (CH-11602) and the submit spinner turns and holds still with reduced motion
(CH-11603). Presses, sheets and skeleton fades are the shell's. Nothing counts up.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 111601 | CH-11601 | `HOVERING_A_ROUND_THAT_OPENS_ITS_REVIEW` | Hovering a round that opens its review |
| 111602 | CH-11602 | `THE_SHOT_LOG_OPENS` | The shot log opens |
| 111603 | CH-11603 | `SUBMITTING_THE_ROUND` | Submitting the round |

From the shell (P001): 11601 CH-1601, 11602 CH-1602, 11603 CH-1603, 11604 CH-1604, 11605 CH-1605, 11606 CH-1606, 11607 CH-1607, 11608 CH-1608, 11609 CH-1609, 11610 CH-1610, 11611 CH-1611, 11612 CH-1612.

## 17 — Haptic

Status: DEFINED

Rounds' own haptics are on the v2 grammar (D-70): a warning before Discard (CH-11701), a selection tick for opening a round, a
hole picked in the review and going to another hole (CH-11702, CH-11704, CH-11706), light for Continue, Submit and Start a round
(CH-11703), a medium tap once per recorded shot (CH-11705), and a warning for Undo, Delete shot, Discard round and Leave
without it (CH-11707); success and error come from the shell for every write.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 111701 | CH-11701 | `DISCARD_IS_TAPPED` | Discard is tapped |
| 111702 | CH-11702 | `A_ROUND_IS_OPENED` | A round is opened |
| 111703 | CH-11703 | `CONTINUE_SUBMIT_OR_START_A_ROUND_IS` | Continue, Submit or Start a round is tapped |
| 111704 | CH-11704 | `A_HOLE_IS_PICKED_ON_THE_REVIEWS` | A hole is picked on the review's card, or stepped with the arrows |
| 111705 | CH-11705 | `A_SHOT_IS_RECORDED` | A shot is recorded (Next shot or Hole out) |
| 111706 | CH-11706 | `GOING_TO_ANOTHER_HOLE` | Going to another hole |
| 111707 | CH-11707 | `UNDO_DELETE_SHOT_DISCARD_ROUND_LEAVE_WITHOUT` | Undo, Delete shot, Discard round, Leave without it |
| 111708 | CH-11708 | `THE_SECOND_TAP_OF_A_DISCARD_IN` | The second tap of a discard in round entry: the saved shots, the round already in progress, or the closed-qualifier round |
| 111709 | CH-11709 | `A_FAILURE_APPEARS_IN_ROUND_ENTRY_AN` | A failure appears in round entry: an inline line, a toast or a banner (CH-11008 to CH-11013, CH-11902) |

From the shell (P001): 11701 CH-1701, 11702 CH-1702, 11703 CH-1703, 11704 CH-1704, 11705 CH-1705, 11706 CH-1706.

## 18 — Accessibility

Status: DEFINED

Each round in the book is one named link (or one named group), each month or course a labelled region, the ribbon one labelled
image, and the in-progress card's strip is hidden from screen readers while the card says the same in words (CH-11801 to
CH-11803). The review's card is two captioned tables with a pressed button per hole (CH-11804). On the shot screen the strip,
the choices, the distance box and the hole map are named in words (CH-11805 to CH-11808). The figures are description lists
(111811), the shot screen's scorecard scrolls in a focusable region (111810, reserved: no test), and axe over 12 preview pages at
1280 and 390 was clean on 2026-09-30 (111809, reserved: a script, not a test). Not built: arrow keys inside the radio groups.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 111801 | CH-11801 | `A_SCREEN_READER_MOVES_THROUGH_THE_BOOK` | A screen reader moves through the book |
| 111802 | CH-11802 | `THE_IN_PROGRESS_CARDS_HOLE_STRIP` | The in-progress card's hole strip |
| 111803 | CH-11803 | `THE_SEASON_RIBBON` | The season ribbon |
| 111804 | CH-11804 | `THE_REVIEWS_CARD` | The review's card |
| 111805 | CH-11805 | `THE_HOLE_STRIP` | The hole strip |
| 111806 | CH-11806 | `CHOICES_IN_THE_ENTRY_AND_THE_SHEETS` | Choices in the entry and the sheets |
| 111807 | CH-11807 | `THE_DISTANCE_BOX` | The distance box |
| 111808 | CH-11808 | `THE_HOLE_MAP` | The hole map |
| 111809 | — | `NO_AXE_VIOLATIONS_IN_THE_SCANNED_PREVIEW_PAGES` | No axe violations on the 12 Rounds preview pages in clubhouse:a11y (the library: default, empty, failed; the review: default, coach, no shots; setup: default and failed courses; tracking: default, putt, holed and card) at 1280px and 390px, 24 scans, clean on 2026-09-30 after the fixes. It is a script (scripts/clubhouse/a11y.mjs), not a vitest test, so this stays reserved; the other preview states, the open sheets and the untouched tracking states are not scanned. |
| 111810 | — | `THE_SCORECARD_SCROLLS_IN_A_FOCUSABLE_REGION` | The scorecard on the shot screen's sheets (Scorecard and Round complete) scrolls sideways inside a labelled, focusable region (role region, tabIndex 0, "Scorecard"), so the keyboard can scroll it (axe scrollable-region-focusable). Found and fixed on 2026-09-30 by clubhouse:a11y; no vitest test asserts the region. |
| 111811 | — | `FIGURES_ARE_DEFINITION_LISTS` | The season and review figures are description lists in which a term is followed by its value and then its sub-line as a second description (label, figure, then "avg · +1.9 to par" or "+1"), never a bare span inside the list (axe definition-list). |

From the shell (P001): 11801 CH-1801, 11802 CH-1802, 11803 CH-1803, 11804 CH-1804, 11805 CH-1805, 11806 CH-1806, 11807 CH-1807, 11808 CH-1808, 11809 CH-1809, 11810 CH-1810, 11811 CH-1811, 11812 CH-1812.

## 19 — Responsive layout

Status: DEFINED

At 820px and below the library and the review are the phone build (`useChPhone`; the spec is `docs/clubhouse/phone/rounds.md`,
approved), not shrunken desktops (111901, reserved: not tested, CSS and `PhoneTop`); inside each surface the layout follows its own
container, with the phone rules at 640px and below. The ribbon draws the last ten rounds on the phone (111902); setup and the shot
screen are full screen and hide the tab bar (111903, reserved: not tested). That the sheets are bottom sheets on the phone is CSS
and is not tested.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 111901 | — | `LIBRARY_AND_REVIEW_PHONE_LAYOUT` | At phone width the library and the review are the phone build (useChPhone), not a shrunken desktop. The library's top bar is the tab root's "Rounds" with no back link and it keeps its own header; below 860px the round card and the season card stack, and at 640px and below the book drops Out · In · Tot and the meters to a date tile, the course and tee, and the to-par box (a group's header drops its average and low). The review's top bar is "Round" with "‹ Rounds" (or "‹ Stats" for a coach), its hero stacks and its card scrolls sideways inside its own frame. Not tested (PhoneTop needs the shell's slot and the layout is CSS): seen headless at 390 on 2026-09-30, not on an iPhone. |
| 111902 | — | `PHONE_RIBBON_DRAWS_THE_LAST_TEN` | On the phone the season ribbon draws the last ten rounds on a narrower canvas, so its labels stay readable; the desktop draws the last twenty. |
| 111903 | — | `SETUP_AND_TRACKING_ARE_FULL_SCREEN_ON_THE_PHONE` | A new round and the shot screen are full-screen flows on the phone: the tab bar hides while either is open (usePhoneTabsHidden). Setup keeps Start round in a dock above the home indicator and Back in its band; the shot screen keeps Exit and Scorecard in its own top bar. Not tested: setup and tracking were driven in real Chromium at 390 on 2026-09-30 (a shot recorded; the dock read "Finley GC · Blue · 18 holes · Par 72"), not on an iPhone. |

From the shell (P001): 11901 PHONE_CHROME.

## 20 — Keyboard / input

Status: DEFINED

Every control on the page is a native button, link or input in the tab order, and every sheet closes on Esc with focus back on
its opener (112001, reserved: no P011 test presses Esc). Not built: arrow keys inside the radio groups (each choice is a Tab
stop), and the iOS number pad's Done bar on the distance box. No shortcuts of its own.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 112001 | — | `SHEETS_CLOSE_ON_ESC_AND_FOCUS_RETURNS` | Every sheet and question on the page (Discard, the course picker, Add a course, Penalty, Change a shot, Leave this shot, Exit, Scorecard, Round complete) is the shell's Modal on the native dialog: Esc closes it and focus goes back to the button that opened it. No P011 test presses Esc. Not built: arrow keys inside the radio groups (each choice is its own Tab stop) and the iOS number pad's Done bar. |

From the shell (P001): 12001 CH-1906.

## 21 — Performance

Status: DEFINED

The loaders read in rounds and never one request per round (112101, reserved: no test asserts the order). Web vitals are the
shell's. The shot screen's own cost is not measured.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 112101 | — | `LOADERS_READ_IN_ROUNDS` | The library loader reads on the server before first paint, never one request per round: the team's time zone (when there is a team), then the posted rounds (paged), then the in-progress rounds, then their holes together (paged, at most 20 rounds at once). The review reads the round, then a coach's membership check, then the holes, the shots (paged), the tee's yards and the player's name together. A read that fails is flagged on its own part and logged, never thrown (110619). No test asserts the order. |

From the shell (P001): 12101 CH-1954.

## 22 — Analytics

Status: DEFINED

The shell records rage, dead and slow clicks for every page. Rounds adds no events of its own.

From the shell (P001): 12201 CH-1951, 12202 CH-1952, 12203 CH-1953.

## 23 — Logging / observability

Status: DEFINED

Failed reads are logged by name, failed writes are reported under the `rounds` surface with their action, and a crash reports
under its own section (112301).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 112301 | — | `FAILURES_ARE_LOGGED_BY_NAME` | A read that fails in a loader is logged through chLogServer under its surface and read (rounds with list, unfinished or unfinished-holes; rounds.review with round, membership, holes, shots, tee or player) and named on the page. A write that fails goes through useAction, which reports it under its action (rounds.discard, rounds.start), at low severity when the server refused it. A section that crashes is contained and reported under its own surface (rounds.unfinished, rounds.season, rounds.book, rounds.review.card, rounds.review.hole). Setup's course and tee reads run in the browser and report nothing themselves: the round screen's ports must. |

From the shell (P001): 12301 FAILURES_REPORTED.

## 24 — CI / automated test

Status: DEFINED

The page's tests are `rounds.test.tsx` (the library), `round-review.test.tsx`, `round-setup.test.tsx` and `round-tracking.test.tsx`,
with `src/lib/golf/__tests__/shot-entry-rules.test.ts` for the shared rules. `clubhouse:check` fails a catalog row of kinds 0 to 5
that no test names; the hand contracts are named by Bridge ID only once the titles carry them (112401).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 112401 | — | `TESTS_NAME_CONTRACTS` | The page's four test files (rounds.test, round-review.test, round-setup.test and round-tracking.test) name in a test title every P011 catalog code of kinds 0 to 5 that is not marked preview (clubhouse:check enforces it), and every hand contract they prove by its Bridge ID. Until those titles carry the Bridge IDs this stays reserved. |

From the shell (P001): 12401 TESTS_NAME_CONTRACTS.

## 25 — Helm Bridge action

Status: N/A — the Bridge is wired later (owner, D-68). Every contract above already has its Bridge ID; the commands (open a round, discard a round, start a round, record a shot) are defined when the Bridge is.
