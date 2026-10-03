# P009 — Qualifiers: page contract

Every behaviour Qualifiers promises, by the 25 V2 categories (D-69). A contract's
number is its Bridge ID (D-68: namespace 9, category, item); `Code` is the
catalog code on the element and in the test (`docs/clubhouse/catalog/qualifiers.md`).
Rows without a code are behaviours with no single element, recorded in
`config/clubhouse/bridge-contracts.json` by hand. The shell's contracts (P001,
namespace 1) apply here too and are named where they carry a category.
`clubhouse:check` holds this file to the registry.

The page covers four screens: the list (a coach's "Qualifiers", a player's "My qualifiers"), one
qualifier (leaderboard, player rounds), the create and edit form, and Manage selections (steps,
coach's picks, confirm). Coaches and players share the list and the qualifier (D-30); create, edit
and Manage selections are coach-only.

## 01 — Default / core UI

Status: DEFINED

Every screen opens final on first paint, read on the server in one pass. The list opens on the live qualifier as its hero, with Active and Concluded below it (90101). A qualifier opens on six facts and the leaderboard, with round-by-round scores, selections and the course per round beside it for a coach (90102). The form opens with the whole active roster ticked and sensible defaults, or prefilled when editing (90103). Manage selections opens on its three steps (90104). Every address renders in place, never as a redirect (90105, D-23). `/my-qualifiers` is the player's own list (90106); a coach is not offered it, and inside the Clubhouse frame the shell shows its not-rebuilt page there (10401). With the Clubhouse off, the selection address sends a coach to the existing CoachHelm workspace (90107).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 90101 | — | `LIST_READY` | The list opens with the count of active and concluded qualifiers, the All, Active and Concluded pills with their counts, search, the live qualifier (or, with none live, the active one that starts first) as the hero with its leaders, the other active ones as cards under Active and the concluded ones under Concluded; a coach also gets Create qualifier. |
| 90102 | — | `DETAIL_READY` | A qualifier opens with its status pill and name, six facts (dates, entry deadline, entrants, rounds submitted, course, spots), the leaderboard, and beside it the selections, the course per round and the scoring rules; a coach also gets round-by-round scores, Manage selections, Edit qualifier and Close or Reopen. |
| 90103 | — | `FORM_READY` | Create opens with the whole active roster ticked, three rounds, a five-player squad and one coach's pick; Edit opens with the qualifier's own values, round courses and entrants. |
| 90104 | — | `SELECTION_READY` | Manage selections opens with the qualifier's name and squad line, the three steps (Standings, Coach's picks, Squad confirmed) with the current one marked, the places on score now, the rest of the field, the coach's picks with their open slots, and the one primary action for the next step. |
| 90105 | — | `ADDRESSES_RENDER_IN_PLACE` | Each address renders its own screen in place, never as a redirect (D-23): /qualifiers and /my-qualifiers the list, /qualifiers/[id] the detail, /qualifiers/new and /qualifiers/[id]/edit the form, and /qualifiers/[id]/selection Manage selections. |
| 90106 | — | `MY_QUALIFIERS_ARE_THE_PLAYERS_OWN` | /my-qualifiers lists only the qualifiers the player is entered in, /qualifiers puts a player's own first with where they stand, and a coach who is given /my-qualifiers gets the whole list (the Clubhouse frame does not offer it to coaches: the shell shows its not-rebuilt page there). |
| 90107 | — | `SELECTION_ADDRESS_OUTSIDE_THE_CLUBHOUSE` | With the Clubhouse off, /qualifiers/[id]/selection sends a coach to the CoachHelm qualifying workspace and a player to the qualifier, and a signed-out visitor to login; with it on, the route gets the address. |

From the shell (P001): 10101 CH-1904, 10102 SHELL_READY, 10103 TEAM_SWITCH_READS_EVERY_SCREEN_AGAIN.

## 02 — Initial loading / skeleton

Status: DEFINED

Three route skeletons in the page's own shapes: the list (90201: head, tools, hero, cards), one qualifier (90202: head, facts, leaderboard, side cards) and the form (90203). They are the `loading.tsx` files of qualifiers, my-qualifiers, `[id]`, new and `[id]/edit`, and each shows the Clubhouse skeleton inside the Clubhouse and the existing one outside it. Manage selections has no loading file of its own, so while it loads the qualifier's skeleton shows (close in shape, not exact); it has no code of its own for that (open). The course picker shows skeleton rows (90204), and a selection write in flight reads Starting, Saving, Removing or Confirming (90205). v2 timing: nothing for 150ms, then a fade (the shell's 11609).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 90201 | CH-09401 | `THE_LIST_IS_LOADING` | The list is loading |
| 90202 | CH-09402 | `A_QUALIFIER_IS_LOADING` | A qualifier is loading |
| 90203 | CH-09403 | `THE_FORM_IS_LOADING` | The form is loading |
| 90204 | CH-09407 | `COURSES_OR_TEES_ARE_LOADING_IN_THE` | Courses or tees are loading in the picker |
| 90205 | CH-09408 | `A_SELECTION_WRITE_IS_IN_FLIGHT` | A selection write is in flight |
| 90206 | CH-09409 | `MANAGE_SELECTIONS_IS_LOADING` | Manage selections is loading |
| 90207 | CH-09410 | `A_QUALIFIERS_COURSES_AND_SCORECARDS_ARE_STILL` | A qualifier's courses and scorecards are still streaming in behind its standings |

From the shell (P001): 10201 CH-1401.

## 03 — Background loading / refresh

Status: DEFINED

While a write is in flight its button reads Creating, Saving, Closing or Reopening and is disabled (90301 to 90303); the phone's Reopen sits in a sheet that closes as it starts, so there only the toast reports it. A live qualifier listens for signed rounds and, after 800ms of quiet, has the server read the page again once (90304); the leaderboard says "Updates as rounds are signed". There is no pull to refresh (the phone waits for the foundation's design).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 90301 | CH-09404 | `A_CREATE_OR_SAVE_IS_IN_FLIGHT` | A create or save is in flight |
| 90302 | CH-09405 | `A_CLOSE_IS_IN_FLIGHT` | A close is in flight |
| 90303 | CH-09406 | `A_REOPEN_IS_IN_FLIGHT` | A reopen is in flight |
| 90304 | — | `LIVE_STANDINGS_REFRESH` | While a qualifier is live the page listens for its signed rounds and, after 800ms of quiet, has the server read the page again once; an upcoming or closed qualifier is not listened to, and a dropped feed is reported at low severity, never shown. |

## 04 — Empty

Status: DEFINED

First-run and filtered are distinct, and a failed read is never drawn as empty. A team with no qualifiers gets the v2 page empty state, with Create qualifier for a coach and a line about their coach for a player (90401); a search or filter that matches nothing offers Clear filters (90402); Concluded says so when nothing has concluded (90403); a qualifier with no round in says "Awaiting first round" (90404); the form says when the roster has no active players (90405); a player entered in nothing is told so (90406); a round with only a total says so (90407); no team is the page empty state on every address (90408, 90804); a course search that matches nothing, or a course with no tee sets, says so (90409, 90410); Manage selections says when nobody can be a pick or no place on score is filled (90411, 90412). Not found and coach-only are category 08.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 90401 | CH-09301 | `THE_TEAM_HAS_NO_QUALIFIERS` | The team has no qualifiers |
| 90402 | CH-09302 | `SEARCH_OR_FILTER_MATCHES_NOTHING` | Search or filter matches nothing |
| 90403 | CH-09303 | `NOTHING_HAS_CONCLUDED_YET` | Nothing has concluded yet |
| 90404 | CH-09304 | `NO_ROUND_IS_IN_YET` | No round is in yet |
| 90405 | CH-09305 | `THE_ROSTER_HAS_NO_ACTIVE_PLAYERS` | The roster has no active players (form) |
| 90406 | CH-09306 | `A_PLAYER_ISNT_ENTERED_IN_ANY_QUALIFIER` | A player isn't entered in any qualifier (/my-qualifiers) |
| 90407 | CH-09308 | `A_ROUND_HAS_NO_HOLE_BY_HOLE` | A round has no hole-by-hole card |
| 90408 | CH-09309 | `NOT_ON_A_TEAM` | Not on a team |
| 90409 | CH-09312 | `THE_COURSE_SEARCH_MATCHES_NOTHING` | The course search matches nothing |
| 90410 | CH-09314 | `A_COURSE_HAS_NO_TEE_SETS` | A course has no tee sets |
| 90411 | CH-09315 | `NOBODY_CAN_BE_A_COACHS_PICK` | Nobody can be a coach's pick |
| 90412 | CH-09316 | `NO_PLACE_ON_SCORE_IS_FILLED` | No place on score is filled |
| 90413 | CH-09318 | `PLAYERS_ARE_LEVEL_AT_THE_LAST_PLACE` | Players are level at the last place on score (Q-114) |

## 05 — Validation

Status: DEFINED

Checked in the form before anything is sent. Each problem sits under its field (name, start date, end date, entry deadline, rounds, the one-round confirmation, players, squad size, coach's picks: 90501 to 90509), the top of the form says how many (90510), and focus moves to the first one (92001). Enter submits the form and shows the same problems (92002). The pick dialog needs a player (90512) and a reason (90511). Editing adds two rules the server also holds: a player with a round or a squad place stays entered (90513), and once the squad is confirmed its size is fixed (90514). Problems are alerts tied to their fields (91804).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 90501 | CH-09101 | `THE_NAME_IS_EMPTY` | The name is empty |
| 90502 | CH-09102 | `THERE_IS_NO_START_DATE` | There is no start date |
| 90503 | CH-09103 | `THE_END_DATE_IS_BEFORE_THE_START` | The end date is before the start |
| 90504 | CH-09104 | `THE_ENTRY_DEADLINE_IS_AFTER_THE_START` | The entry deadline is after the start |
| 90505 | CH-09105 | `ROUNDS_ISNT_1_TO_50_OR_IS` | Rounds isn't 1 to 50, or is below a round that already has scores (edit) |
| 90506 | CH-09106 | `ONE_ROUND_NOT_ACKNOWLEDGED` | One round, not acknowledged |
| 90507 | CH-09107 | `NO_PLAYERS_CHOSEN` | No players chosen |
| 90508 | CH-09108 | `SQUAD_SIZE_ISNT_1_TO_12` | Squad size isn't 1 to 12 |
| 90509 | CH-09109 | `MORE_COACHS_PICKS_THAN_PLACES` | More coach's picks than places |
| 90510 | CH-09110 | `ANY_OF_THE_ABOVE_ON_SUBMIT` | Any of the above on submit |
| 90511 | CH-09111 | `A_COACHS_PICK_WITH_NO_REASON` | A coach's pick with no reason |
| 90512 | CH-09112 | `SAVE_PICK_WITH_NO_PLAYER_CHOSEN` | Save pick with no player chosen |
| 90513 | — | `LOCKED_ENTRANTS_STAY` | In the edit form a player who has a round in the qualifier, or a place in its squad, stays entered: their box is ticked and disabled and says why. |
| 90514 | — | `SQUAD_FIXED_ONCE_CONFIRMED` | Once the squad is confirmed, squad size and coach's picks are read-only in the edit form, which says the size is fixed, and a save sends no squad change. |

## 06 — Server / system error

Status: DEFINED

Every write has its own failure toast naming what did not happen and what to do: create, save, close and reopen (90601 to 90604) and the four selection writes (90623 to 90626). Every section that can fail to load has its own notice with Try again (90605 to 90614, 90621, 90627), and a crash stays in its section (90615 to 90620, 90628; SectionBoundary). A save that lands in part says which part (90622). A failed read of the qualifier itself (detail or form), or of a player's team, throws to the route error view (the shell's 10603 to 10607) instead of claiming "not found"; Manage selections tells a failed read apart in its own notice (90627). Try again has the server read the page again (91402), and Retry runs the write again (91401).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 90601 | CH-09001 | `CREATING_A_QUALIFIER_FAILS` | Creating a qualifier fails |
| 90602 | CH-09002 | `SAVING_AN_EDIT_FAILS` | Saving an edit fails |
| 90603 | CH-09003 | `CLOSING_A_QUALIFIER_FAILS` | Closing a qualifier fails |
| 90604 | CH-09004 | `REOPENING_A_QUALIFIER_FAILS` | Reopening a qualifier fails |
| 90605 | CH-09201 | `THE_QUALIFIERS_DONT_LOAD` | The qualifiers don't load |
| 90606 | CH-09202 | `ENTRIES_OR_ROUNDS_DONT_LOAD_ON_THE` | Entries or rounds don't load on the list |
| 90607 | CH-09203 | `A_QUALIFIERS_ENTRANTS_DONT_LOAD` | A qualifier's entrants don't load |
| 90608 | CH-09204 | `A_QUALIFIERS_ROUNDS_DONT_LOAD` | A qualifier's rounds don't load |
| 90609 | CH-09205 | `THE_SCORECARDS_DONT_LOAD` | The scorecards don't load (or the stream that carries them is cut off) |
| 90610 | CH-09206 | `THE_ROUND_COURSES_DONT_LOAD` | The round courses don't load (detail), or the stream that carries them is cut off |
| 90611 | CH-09207 | `THE_CONFIRMED_SQUAD_DOESNT_LOAD` | The confirmed squad doesn't load, or the entries it takes its names from don't |
| 90612 | CH-09208 | `THE_ROSTER_DOESNT_LOAD_IN_THE_FORM` | The roster (or, editing, the entrants or their rounds) doesn't load in the form |
| 90613 | CH-09209 | `THE_COURSE_LIST_DOESNT_LOAD_IN_THE` | The course list doesn't load in the picker |
| 90614 | CH-09210 | `A_COURSES_TEES_DONT_LOAD_IN_THE` | A course's tees don't load in the picker |
| 90615 | CH-09211 | `THE_LIST_CRASHES` | The list crashes |
| 90616 | CH-09212 | `THE_LEADERBOARD_CRASHES` | The leaderboard crashes |
| 90617 | CH-09213 | `ROUND_BY_ROUND_CRASHES` | Round-by-round crashes |
| 90618 | CH-09214 | `SELECTIONS_CRASHES` | Selections crashes |
| 90619 | CH-09215 | `COURSE_PER_ROUND_CRASHES` | Course per round crashes |
| 90620 | CH-09216 | `THE_FORM_CRASHES` | The form crashes |
| 90621 | CH-09217 | `THE_ROUND_COURSES_DONT_LOAD_IN_THE` | The round courses don't load in the edit form |
| 90622 | CH-09902 | `AN_EDIT_SAVED_ONLY_IN_PART_OR` | An edit saved only in part, or not at all |
| 90623 | CH-09005 | `START_SELECTING_FAILS` | Start selecting fails |
| 90624 | CH-09006 | `SAVING_A_COACHS_PICK_FAILS` | Saving a coach's pick fails |
| 90625 | CH-09007 | `REMOVING_A_COACHS_PICK_FAILS` | Removing a coach's pick fails |
| 90626 | CH-09008 | `CONFIRMING_THE_SQUAD_FAILS` | Confirming the squad fails |
| 90627 | CH-09218 | `MANAGE_SELECTIONS_DOESNT_LOAD` | Manage selections doesn't load |
| 90628 | CH-09219 | `MANAGE_SELECTIONS_CRASHES` | Manage selections crashes |
| 90629 | CH-09009 | `THE_SQUAD_IS_CONFIRMED_BUT_TELLING_THE` | The squad is confirmed but telling the players failed |
| 90630 | CH-09010 | `GIVING_OR_TAKING_BACK_A_PLACE_AT` | Giving or taking back a place at a tied cut fails |
| 90631 | CH-09221 | `THE_COACHS_PICK_NOTES_DONT_LOAD` | The coach's pick notes don't load (detail, coach, confirmed squad) |
| 90632 | CH-09222 | `A_PLAYERS_ENTRIES_DONT_LOAD_ON_MY` | A player's entries don't load on /my-qualifiers |
| 90633 | CH-09220 | `A_REFRESH_OF_A_QUALIFIERS_STANDINGS_FAILS` | A refresh of a qualifier's standings fails after they were showing (a live update, a write's re-read, Try again) |

## 07 — Network / offline

Status: DEFINED

Offline, no write is sent: the shell's toast names what did not happen, the error haptic fires and the page stays as it was (90702, with the shell's 10703). A save over 5 seconds says it is still saving (10702), the banner says the device is offline (10701), and Try again on a notice while offline says so instead of failing again (10704). The one catalog row here, 90701, is a state, not a network behaviour: a confirmed squad is read-only. It sits in this category only because its kind (network and UX) defaults here.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 90701 | CH-09903 | `THE_SQUAD_IS_CONFIRMED` | The squad is confirmed (Manage selections) |
| 90702 | — | `WRITES_REFUSED_OFFLINE` | Offline, none of the eight writes (create, save, close, reopen, start selecting, save a pick, remove a pick, confirm the squad) is sent: the shell's offline toast (CH-1903) names what did not happen, the error haptic fires, and the page does not move on. |
| 90703 | CH-09904 | `THE_LISTS_FILTER_AND_SEARCH` | The list's filter and search |
| 90704 | CH-09905 | `RETURNING_TO_THE_LIST_FROM_A_QUALIFIER` | Returning to the list from a qualifier |

From the shell (P001): 10701 CH-1901, 10702 CH-1902, 10703 CH-1903, 10704 CH-1905.

## 08 — Permission / authorization

Status: DEFINED

The route decides who reaches an address and every write is checked again by its server action. Hiding a control from a player is a courtesy and never the gate.

Addresses. A signed-in coach or player with a team may open the list and a qualifier of their team. `/new`, `/[id]/edit` and `/[id]/selection` are for coaches: a player who opens one gets the coach-only page with a way back (90802), and nothing is read for them because the route stops before its loaders run (90803). A qualifier on another team, one that does not exist, or a link that is not an id is "not on your team" for a coach and a player alike (90801); the loaders enforce it, so its data reaches no one outside the team (90805). No session reads nothing, and no team gets the no-team page on every address (90804). With the Clubhouse off, the selection address goes to the existing workspace (90107).

What a player sees. The list and the qualifier, the whole leaderboard with their own row marked, and the squad once it is confirmed. Never a coach control (90808); never a teammate's scorecards, because a player opens only their own and the loader sends their browser no other holes (90806); never a coach's reason for a pick (90807). Coach-only: Create, Edit, Manage selections, Close, Reopen, round-by-round scores and the pick reasoning.

The server. Close and Reopen compare the caller's organisation with the qualifier team's (90812). Start selecting, saving or removing a pick and Confirm use the team access check on the qualifier's own team, and a pick must be a player on that team (90810). The two setup actions behind Edit do the same and, while the Clubhouse is off for the caller, refuse before any read (90811, 92302). Row-level security on the qualifier tables is the second gate; the live policies were read on 2026-09-29 (`docs/clubhouse/screens/qualifiers.md`, "Role permissions") and not read again for this page. A player reads selections only once the squad is confirmed. Open, not this page's to fix: the database itself lets an active team player read a teammate's holes (round and hole policies; Q-14 chose the stricter rule in the UI, and tightening the policies would be a separate migration that is not written), and until the held hardening migration is applied (D-35, `docs/clubhouse/held/data/qualifier-db-hardening.md`) it also lets one read a pick's reason. So 90806 and 90807 are what this page guarantees (it never asks for them and never sends them to a player's browser), not what the database enforces. What a refusal says: the selection actions' developer-worded refusals become sentences a coach can act on, such as "Every pick is taken. Remove one first." (90809), and the server's own words go to the breadcrumb trail (92303).

Not covered by a test here (read in this pass, not run): `createGolfQualifier` signs the caller in as a coach and writes to their organisation's active team; `updateGolfQualifierDetails` compares the coach's organisation with the qualifier team's organisation, as Close does, and RLS is the narrower second gate (a staff row for that team), so a coach elsewhere in the same organisation passes the check and is stopped by the update matching no row, which the action reports as "you may not have edit access to this team"; `setQualifierRoundCourses` checks the caller with the team access check on the qualifier's own team. Their refusals reach the coach as the server wrote them, or as the toast's own hint when the words are technical.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 90801 | CH-09310 | `THE_QUALIFIER_ISNT_ON_THE_VIEWERS_TEAM` | The qualifier isn't on the viewer's team, or doesn't exist |
| 90802 | CH-09311 | `A_PLAYER_OPENS_NEW_OR_EDIT` | A player opens /new, /edit or /selection |
| 90803 | — | `COACH_ADDRESSES_READ_NOTHING_FOR_A_PLAYER` | For a player, /qualifiers/new, /qualifiers/[id]/edit and /qualifiers/[id]/selection stop at the coach-only page (CH-09311) before any loader runs, so nothing of the qualifier is read for them. |
| 90804 | — | `SIGNED_OUT_OR_TEAMLESS_READS_NOTHING` | A signed-out visitor gets an empty page and someone with no team gets the no-team page (CH-09309) on every address, and neither reads a qualifier. |
| 90805 | — | `TEAM_OWNERSHIP_IN_THE_LOADERS` | The list reads only the viewer's team and never a test qualifier, and the detail, form and Manage selections loaders answer a qualifier on another team, or none, with not found (CH-09310), so its data reaches no one outside the team. |
| 90806 | — | `PLAYER_OPENS_OWN_ROUNDS_ONLY` | A player can open scorecards only for their own rounds (the row button on desktop, the rounds sheet on the phone), and the loader sends their browser only their own holes, never a teammate's. |
| 90807 | — | `PICK_REASONING_IS_COACH_ONLY` | A coach's reason for a pick is read only for a coach and is never in a player's data or on a player's screen: a player sees who was picked, not why. |
| 90808 | — | `COACH_CONTROLS_HIDDEN_FROM_PLAYERS` | A player is never shown a coach control: not Create qualifier, Manage selections, Edit, Close, Reopen, the phone's Qualifier actions, round-by-round scores or the coach's Selections panel (hiding them is a courtesy; the gates are 90803 and 90810 to 90812). |
| 90809 | — | `SELECTION_REFUSALS_IN_COACH_WORDS` | A refusal from the selection actions (not this team's coach, the squad moved on, picks not open, every pick taken, no reason, player not on the team, roster unchecked, nothing to confirm, qualifier missing) reaches the coach as a sentence saying what to do, and an unrecognised one falls back to the toast's own hint. |
| 90810 | — | `SELECTION_ACTIONS_RECHECK_THE_COACH` | Start selecting, saving or removing a pick and confirming the squad each check on the server that the caller coaches the qualifier's own team (Unauthorized, Qualifier not found, Not a coach of this team) before the service runs, and a pick must also be a player on that team. |
| 90811 | — | `SETUP_ACTIONS_RECHECK_THE_COACH` | The squad-size and entrants actions behind Edit check that the caller coaches the qualifier's team before any write, and refuse a signed-out caller and a malformed id. |
| 90812 | — | `STATUS_ACTION_RECHECKS_THE_COACH` | Close and Reopen check on the server that the caller's organisation owns the qualifier's team, so a player or another organisation's coach is refused as Unauthorized before anything is updated. |

From the shell (P001): 10801 CLUBHOUSE_GATE, 10802 ROLE_SCOPED_NAV, 10803 TEAM_SWITCH_IS_A_HEAD_COACHS.

## 09 — Success

Status: DEFINED

A write that lands says so in a toast with the success haptic: "Qualifier created · 7 players entered", "Qualifier saved", "Qualifier closed · no new rounds accepted", "Qualifier reopened · players can enter rounds", "Selecting is open · choose your picks", "Eli Brandt picked", "Eli Brandt removed as a pick", "Squad confirmed · 5 players told" (90901). A create opens the new qualifier, and a save or a confirm returns to the qualifier; the others leave the coach where they are (90902). On the confirm toast the count is the squad's size: the server tells each candidate one of three outcomes (selected, not selected, not scored), best effort, and a notification that fails is logged and not shown (open).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 90901 | — | `CHANGE_LANDED` | A write that lands (create, save, close, reopen, start selecting, save a pick, remove a pick, confirm the squad) says what landed in a toast and fires the success haptic. |
| 90902 | — | `QUALIFIER_OPENS_AFTER_A_CREATE_SAVE_OR_CONFIRM` | A landed create opens the new qualifier and a landed save or confirm returns to the qualifier, while close, reopen, start selecting, save a pick and remove a pick leave the coach where they are. |

From the shell (P001): 10901 CHANGE_LANDED.

## 10 — Warning

Status: DEFINED

A closed qualifier is a standing condition, not an error. The coach reads "Closed to new rounds." and the rule, including rounds already started; a player reads that the qualifier is closed (91001). Desktop and phone say the same to the coach.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 91001 | CH-09901 | `THE_QUALIFIER_IS_CLOSED` | The qualifier is closed |

## 11 — Destructive

Status: DEFINED

Four steps ask first, with the warning haptic before the question: Close qualifier (91101), Start selecting (91102), Remove a coach's pick (91103) and Confirm the squad (91104). Start selecting says it cannot be undone, Confirm says the squad cannot be changed afterwards, and Remove says the reason goes with the pick. The catalog keeps Discard with state preservation (91201). A qualifier itself is never deleted from this page.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 91101 | CH-09501 | `CLOSE_QUALIFIER` | Close qualifier |
| 91102 | CH-09503 | `START_SELECTING` | Start selecting |
| 91103 | CH-09504 | `REMOVE_A_COACHS_PICK` | Remove a coach's pick |
| 91104 | CH-09505 | `CONFIRM_THE_SQUAD` | Confirm the squad |

## 12 — State preservation

Status: DEFINED

A failed create or save keeps every field as typed (91202), and a save that landed in part keeps saying what saved and what did not until the next save (the note under 90622). A refused pick keeps the dialog with its player and reason (91203). Scorecards a coach has open stay open when the standings are read again (91204). Leaving the form with unsaved changes asks first (91201). The list's search and status filter are local to the open page and are not kept anywhere.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 91201 | CH-09502 | `CANCEL_OR_BACK_WITH_UNSAVED_CHANGES_IN` | Cancel or Back with unsaved changes in the form |
| 91202 | — | `FORM_KEPT_ON_FAILURE` | A create or save that fails keeps every field as typed, and a save that lands only in part keeps saying what saved and what did not until the next save (CH-09902). |
| 91203 | — | `PICK_KEPT_ON_FAILURE` | A pick the server refuses keeps the dialog open with the chosen player and the reason, so nothing has to be typed again. |
| 91204 | — | `OPEN_SCORECARDS_SURVIVE_A_REFRESH` | Scorecards a coach has open stay open when the standings are read again. |

## 13 — Optimistic UI

Status: DEFINED

None. Every write waits for the server: the status pill, the picks and the steps change only after it says the write landed, and a refused write changes nothing on the page (91301). When it has landed, the page is updated in place and the server reads it again (91501).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 91301 | — | `WRITES_WAIT_FOR_THE_SERVER` | Nothing is optimistic: the status pill, the picks and the steps change only after the server says the write landed, and a refused write changes nothing on the page. |

## 14 — Retry / recovery

Status: DEFINED

The failure toast's Retry runs the same write again with the same arguments and, when it lands, does everything the button would have done: the pill changes, the question closes, the qualifier opens (91401; until 2026-09-30 it only re-sent the write, see the changelog). Try again on a notice that failed to load has the server read the whole page again; the course picker retries only its own list, and the edit form's round courses offer no retry, because a re-read would drop the coach's changes (91402).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 91401 | — | `RETRY_FINISHES_THE_JOB` | The error toast's Retry runs the same write again with the same arguments, and when it lands everything a landed write does follows: the status changes, the question closes, and the page opens the qualifier or reads again. |
| 91402 | — | `TRY_AGAIN_REREADS_THE_PAGE` | Try again on a section that did not load has the server read the whole page again (router.refresh), except the course picker, which re-reads only its own list, and the edit form's round courses, which offer none so a re-read cannot drop the coach's changes. |

From the shell (P001): 11401 ROUTE_TRY_AGAIN, 11402 TOAST_RETRY.

## 15 — Data freshness / sync

Status: DEFINED

After a write lands, the server reads the page again so the page shows the server's state (91501). A live qualifier is kept current by the realtime listener (90304). A player's page is as fresh as their last load or that listener; D-31 records that the round-entry function refuses rounds on a closed qualifier, a rule that is not part of this page and was not re-checked here.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 91501 | — | `WRITES_RE_READ_THE_PAGE` | A landed close, reopen, save, start selecting, save a pick, remove a pick or confirm has the server read the page again so it shows the server's state (a create opens the new qualifier instead), and a write that fails re-reads nothing. |

## 16 — Micro animation

Status: DEFINED

Pressing a card, the hero or a status pill (91601), and a leaderboard row's scorecards appearing in place at their final state, with no count-up or stagger and a static Live dot (91602, D-33). Both are preview-checked; their catalog rows are marked preview and no test forces them. Everything uses the v2 tokens (D-64).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 91601 | CH-09601 | `PRESSING_A_CARD_THE_HERO_OR_A` | Pressing a card, the hero or a status pill |
| 91602 | CH-09602 | `OPENING_A_LEADERBOARD_ROW` | Opening a leaderboard row |

From the shell (P001): 11601 CH-1601, 11602 CH-1602, 11603 CH-1603, 11604 CH-1604, 11605 CH-1605, 11606 CH-1606, 11607 CH-1607, 11608 CH-1608, 11609 CH-1609, 11610 CH-1610, 11611 CH-1611, 11612 CH-1612.

## 17 — Haptic

Status: DEFINED

Qualifiers' own haptics (91701 to 91703) on the v2 grammar (D-70): select for a status pill, a leaderboard row, a player checkbox, a course, a tee and a player in the pick dialog; warning before Close, Discard, Start selecting, Confirm and Remove; success when a write lands (90901); error when a write fails or is refused offline (90702).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 91701 | CH-09701 | `A_STATUS_PILL_A_LEADERBOARD_ROW_A` | A status pill, a leaderboard row, a player checkbox, a course, a tee, or a player in the pick dialog |
| 91702 | CH-09702 | `CLOSE_QUALIFIER_DISCARD` | Close qualifier, Discard |
| 91703 | CH-09703 | `START_SELECTING_CONFIRM_SQUAD_REMOVE_A_PICK` | Start selecting, Confirm squad, Remove a pick |

From the shell (P001): 11701 CH-1701, 11702 CH-1702, 11703 CH-1703, 11704 CH-1704, 11705 CH-1705, 11706 CH-1706, 11707 CH-1707.

## 18 — Accessibility

Status: DEFINED

The leaderboard and round-by-round are tables (rows, column headers, a row header per player); each row's scorecards open from a button that says whether it is expanded, and each scorecard is a captioned table (91802). A live update to the standings is announced in a polite region (91803). Field problems are alerts tied to their fields (91804). Manage selections' steps are a named list with the current step marked (90104). Dialogs are native and trap focus, and Esc closes them (the shell's). The axe scan (91801) last ran before the phone build and Manage selections, so it needs a rerun.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 91801 | CH-09801 | `NO_AXE_VIOLATIONS_IN_ANY_PREVIEW_STATE` | No axe violations in any preview state, 1280px and 390px |
| 91802 | CH-09802 | `THE_LEADERBOARD_AND_ROUND_BY_ROUND_ARE` | The leaderboard and round-by-round are tables (rows, column headers, a row header per player); each row's scorecards open from a button with aria-expanded, and each scorecard is a table with a caption |
| 91803 | CH-09803 | `A_LIVE_UPDATE_TO_THE_STANDINGS_IS` | A live update to the standings is announced |
| 91804 | — | `FIELD_PROBLEMS_ARE_ALERTS` | Each problem in the form or the pick dialog is an alert tied to its field by aria-describedby, the field is marked aria-invalid, and a field with no problem is not. |

From the shell (P001): 11801 CH-1801, 11802 CH-1802, 11803 CH-1803, 11804 CH-1804, 11805 CH-1805, 11806 CH-1806, 11807 CH-1807, 11808 CH-1808, 11809 CH-1809, 11810 CH-1810, 11811 CH-1811, 11812 CH-1812, 11813 CH-1813, 11814 CH-1814.

## 19 — Responsive layout

Status: DEFINED

At 820px and below a qualifier is one column with a rounds sheet (91901), the form puts Cancel and Create in the top bar and hides the tab bar (91902), Manage selections has its own top bar and a foot for its primary action (91903), and the list is the desktop list with phone CSS under a "‹ More" top bar (91904). The phone spec is `docs/clubhouse/phone/qualifiers.md` (approved).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 91901 | — | `PHONE_DETAIL` | At 820px and below a qualifier is one column: three facts (rounds in, spots, deadline), the leaderboard as cards that open a player's rounds in a sheet, the confirmed squad above it, and Close and Reopen behind Edit; round-by-round stays on desktop. |
| 91902 | — | `PHONE_FORM` | On the phone the form's Cancel and Create (Save when editing) sit in the top bar and the tab bar steps aside; Create runs the same checks as the page's button, and Cancel asks before discarding changes. |
| 91903 | — | `PHONE_SELECTION` | On the phone Manage selections has its own top bar (Selections, with a way back to the qualifier) and the one primary action in a foot at the bottom of the page. |
| 91904 | — | `PHONE_LIST` | On the phone the list's top bar reads ‹ More and the title (Qualifiers, or My qualifiers on a player's own list); the list itself is the desktop list with phone CSS. |

From the shell (P001): 11901 PHONE_CHROME.

## 20 — Keyboard / input

Status: DEFINED

Enter in a form field submits the form (92002), and a problem takes focus at its first field (92001). A leaderboard row's scorecards open from a button that takes Enter and Space, and the row itself is not a tab stop (92003). The shell's edge swipe and browser back pop a pushed phone screen (12001).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 92001 | — | `FIRST_PROBLEM_TAKES_FOCUS` | When Create or Save finds problems nothing is sent and focus moves to the first problem in reading order (name, dates, rounds, the one-round confirmation, players, squad, picks), not the last. |
| 92002 | — | `ENTER_SUBMITS_THE_FORM` | Enter in a field of the form submits it, and a form with a problem shows the problem instead of sending. |
| 92003 | — | `SCORECARDS_OPEN_FROM_THE_KEYBOARD` | A leaderboard row's scorecards open from a button that takes Enter and Space and says whether it is expanded; the row itself is not a tab stop. |

From the shell (P001): 12001 CH-1906.

## 21 — Performance

Status: DEFINED

Each screen is read once on the server, in one pass, and arrives whole (92101). The list reads the team's qualifiers (newest first, up to 1,000), then entries and rounds together. A qualifier reads its entries, rounds, round courses and (once confirmed) selections together, then the tees, then the scorecards it may open. The form reads the roster and, editing, the qualifier, then its entrants, rounds, squad and courses together. Long reads page and `.in()` lists are chunked. Manage selections reads through the loader the confirm uses, so it reads the qualifier twice: once for ownership, then the workspace. The course picker looks up on demand, when it opens and 250ms after typing stops (92102). Web vitals are the shell's (12101).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 92101 | — | `ONE_PASS_LOADERS` | The list, the detail and the form are each read on the server in one pass, every table once, and arrive whole, so nothing is fetched after first paint except a live qualifier's re-read and the course picker's lookups. |
| 92102 | — | `PICKER_SEARCH_IS_DEBOUNCED` | The course picker looks courses up when it opens and once, 250ms after typing stops, not on every key. |

From the shell (P001): 12101 CH-1954.

## 22 — Analytics

Status: DEFINED

The shell records rage, dead and slow clicks for every page (12201 to 12203). Qualifiers adds no events of its own; its breadcrumbs (92304) are error context, not analytics.

From the shell (P001): 12201 CH-1951, 12202 CH-1952, 12203 CH-1953.

## 23 — Logging / observability

Status: DEFINED

Failures are reported, server reads logged, intents breadcrumbed (92301, 92304). A refused write is reported at low severity and a thrown one at the default, under surface `qualifiers` and the write's own name (`qualifiers.create`, `.save`, `.close`, `.reopen`, `.startSelecting`, `.setPick`, `.removePick`, `.confirmSquad`); a crash is reported high under its section (`qualifiers.list`, `.leaderboard`, `.rounds`, `.selections`, `.courses`, `.form`, `.selection`); the picker reports under `qualifiers.picker` and the live feed under `qualifiers.live`. Server reads log through `chLogServer('qualifiers', <read>)`. The selection actions' own refusal text is kept in the trail (92303), and the held setup actions refuse when the Clubhouse is off (92302).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 92301 | — | `FAILURES_REPORTED` | A refused write is reported through chReport at low severity and a thrown one at the default, with surface qualifiers and the write's name (qualifiers.close, qualifiers.save, ...); a crash is reported high under its section (qualifiers.leaderboard, ...), a failed picker read under qualifiers.picker, and a failed server read is logged through chLogServer('qualifiers', <read>). |
| 92302 | — | `HELD_SETUP_ACTIONS_REFUSE_OFF` | The squad-size and entrants actions refuse before any read unless the Clubhouse UI is on for the caller (D-61). |
| 92303 | — | `SELECTION_REFUSAL_KEPT_FOR_THE_TRAIL` | The selection actions' own refusal text, cut at 200 characters, goes to a chTrail breadcrumb ('qualifiers selection refused') and not to the coach, so Sentry keeps what the server said. |
| 92304 | — | `INTENTS_LEAVE_BREADCRUMBS` | Each intent leaves a chTrail breadcrumb before anything is sent: a filter, opening the scorecards, asking to close, asking to start selecting or to confirm, Create, Save, and the write itself by name (action qualifiers.<name>). |

From the shell (P001): 12301 FAILURES_REPORTED.

## 24 — CI / automated test

Status: DEFINED

`src/clubhouse/__tests__/qualifiers.test.tsx` names every catalog code of kinds 0 to 5 that is not marked preview, and every hand contract by its Bridge ID in a test title (92401). The server side has its own files: `qualifying-coach-gate.test.ts` (90810), `qualifier-setup.test.ts` (90811, 92302) and `golf-qualifier-manual-close.test.ts` (90812). Motion (CH-09601, CH-09602) and the axe scan (CH-09801) are preview-checked only.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 92401 | — | `TESTS_NAME_CONTRACTS` | src/clubhouse/__tests__/qualifiers.test.tsx names every catalog code of kinds 0 to 5 it forces and every hand contract it proves by its Bridge ID in a test title, and the server actions behind Manage selections, Close and Edit have their own test files. |

From the shell (P001): 12401 TESTS_NAME_CONTRACTS.

## 25 — Helm Bridge action

Status: N/A — the Bridge is wired later (owner, D-68). Every contract above already has its Bridge ID; the commands (open a qualifier, create one, start selecting) are defined when the Bridge is.
