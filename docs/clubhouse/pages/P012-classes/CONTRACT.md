# P012 — Classes: page contract

Every behaviour Classes promises, by the 25 V2 categories (D-69). A contract's
number is its Bridge ID (D-68: namespace 12, category, item); `Code` is the
catalog code on the element and in the test (`docs/clubhouse/catalog/classes.md`).
Rows without a code are behaviours with no single element, recorded in
`config/clubhouse/bridge-contracts.json` by hand. The shell's contracts (P001,
namespace 1) apply here too and are named where they carry a category.
`clubhouse:check` holds this file to the registry.

Classes is the player's page. Coaches have no Classes page in Clubhouse and keep the current
Fairway page at the same address (`LegacyClassesPage.tsx`, unchanged), so every contract below is
a player's.

The hand contracts (the rows with no code) are all `reserved`: a hand contract is `implemented`
only when a test title carries its Bridge ID, and the Classes tests were written before these IDs
existed. VERIFY.md says, for each, whether a test in `classes.test.tsx` covers it, covers part of
it, or none does.

## 01 — Default / core UI

Status: DEFINED

Classes opens on the term at a glance for a player. There are no tabs and no address parameters: the page is the term overview, the deck of classes and the side column, and everything else (a class, the form, the import, the remove question) is a sheet over it. The server loader has read the page before first paint, so nothing is fetched in the browser to draw it. A class's own sheet is opened by tapping its card; the Add class tile at the end of the deck and the header's Add class open the same form.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 120101 | — | `CLASSES_READY` | Classes opens for a player with everything the server read before first paint, so nothing is fetched in the browser to draw it: the header (the term and its dates, the title, Import schedule and Add class), the term overview, every class as a card in the order the week unfolds with the Add tile at the end, this week's overlaps with the team's events, and a note on what the coach can see. |
| 120102 | — | `A_CLASS_IS_DRAWN_AS_WHAT_IT_IS` | A class card is drawn from the class's own data: a class in another term is named for that term and left out of this term's credits and overlaps, a class saved with no term counts as the current term, and the week strip has five days, or seven when the class meets on a weekend day. A screen reader gets one button per class, named for its code, name and when it meets (CH-12801), and the strip is hidden (CH-12802). |
| 120103 | — | `A_CLASS_SHEET_SHOWS_WHEN_AND_WHERE` | Opening a class shows when and where it meets, its instructor, term and notes, and its next four meetings, each marked when it overlaps a team event. The meetings run from the later of today and the first day of the class's own term to the end of that term, so a class in next term lists next term's first meetings. A class with no time lists none. Nothing the table has no column for (a grade, a deadline, a share switch) is drawn. |

## 02 — Initial loading / skeleton

Status: DEFINED

The route skeleton (CH-12401) is the Clubhouse one for a player inside the shell (the loading file reads the shell's role from context); a coach there, and anyone outside the shell, get the Fairway skeleton, because that is the page they get. Classes loads no section on its own after the server render, so there are no section skeletons; a schedule being read says so (CH-12402) and classes being put on the calendar say so in the header (CH-12403).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 120201 | CH-12401 | `THE_PAGE_IS_ON_ITS_WAY` | The page is on its way |
| 120202 | CH-12402 | `A_SCHEDULE_IS_BEING_READ` | A schedule is being read |
| 120203 | CH-12403 | `CLASSES_ARE_BEING_PUT_ON_THE_CALENDAR` | Classes are being put on the calendar |

From the shell (P001): 10201 CH-1401.

## 03 — Background loading / refresh

Status: N/A — Classes has no realtime, polling or pull to refresh: the server reads the page once per visit, and Try again reads it again (category 14). A write updates the list in place from what the database sent back and does not read the page again (category 15).

## 04 — Empty

Status: DEFINED

First run is the whole-page empty state (CH-12301), which offers Import schedule first and Add a class second and draws none of the rest of the page (no header actions, no overview, no deck). A player on no team gets CH-12305. Nothing overlapping this week (CH-12302) and a class with no fixed meeting (CH-12303) or with times and no days (CH-12304) are quiet states, not errors, and an import where every class is already on the schedule says so (CH-12307). A failed read is never shown as empty (120407). Classes has no search or filter, so it has no filtered empty state.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 120401 | CH-12301 | `NO_CLASSES_YET` | No classes yet |
| 120402 | CH-12302 | `NO_CLASS_MEETS_A_TEAM_EVENT_THIS` | No class meets a team event this week |
| 120403 | CH-12303 | `A_CLASS_WITH_NO_FIXED_MEETING` | A class with no fixed meeting (online or arranged) |
| 120404 | CH-12304 | `A_CLASS_WITH_TIMES_BUT_NO_DAYS` | A class with times but no days |
| 120405 | CH-12305 | `A_PLAYER_ON_NO_TEAM` | A player on no team |
| 120406 | CH-12307 | `AN_IMPORT_WHERE_EVERY_CLASS_IS_ALREADY` | An import where every class is already on the schedule |
| 120407 | — | `FIRST_RUN_ONLY_WHEN_THE_READ_ANSWERED` | The first-run page (CH-12301) shows only when the classes read answered and the list is empty. A read that failed shows CH-12201 in its place, with no Add class or Import schedule beside it, and the header offers neither. Removing the last class returns to the first-run page. |
| 120408 | CH-12308 | `PHONE_NO_CLASS_MEETS_TODAY` | Phone: no class meets today |

## 05 — Validation

Status: DEFINED

The form's rules show beside their field after the first refused Save (CH-12101 to CH-12107), each answering as it is fixed, with `role="alert"`, `aria-invalid` and the first field that needs it taking focus (CH-12804). A class at exactly another class's days and times is refused (CH-12107); one that only overlaps is a note that does not block (CH-12108), and so is an overlap with a team event this week (CH-12109). Both notes and the refusal count only classes in the term the form is set to (120516). The import checks a paste, a file and the reader's answer before anything is saved (CH-12110 to CH-12114), and skips classes already on the schedule (120515).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 120501 | CH-12101 | `SAVE_WITH_NO_COURSE_CODE` | Save with no course code |
| 120502 | CH-12102 | `SAVE_WITH_NO_COURSE_NAME` | Save with no course name |
| 120503 | CH-12103 | `SAVE_WITH_NO_TERM` | Save with no term |
| 120504 | CH-12104 | `THE_END_IS_NOT_AFTER_THE_START` | The end is not after the start |
| 120505 | CH-12105 | `A_START_WITH_NO_END_OR_AN` | A start with no end, or an end with no start |
| 120506 | CH-12106 | `CREDITS_THAT_ARE_NOT_A_WHOLE_NUMBER` | Credits that are not a whole number from 0 to 12 |
| 120507 | CH-12107 | `A_CLASS_AT_EXACTLY_ANOTHER_CLASSS_DAYS` | A class at exactly another class's days and times |
| 120508 | CH-12108 | `A_CLASS_THAT_OVERLAPS_ANOTHER_CLASS_WITHOUT` | A class that overlaps another class without being the same |
| 120509 | CH-12109 | `A_CLASS_OVERLAPS_A_TEAM_EVENT_THIS` | A class overlaps a team event this week (in the form, or among the imported classes) |
| 120510 | CH-12110 | `READ_SCHEDULE_WITH_NOTHING_PASTED` | Read schedule with nothing pasted |
| 120511 | CH-12111 | `A_FILE_OVER_12_MB` | A file over 12 MB |
| 120512 | CH-12112 | `A_FILE_THAT_IS_NOT_AN_IMAGE` | A file that is not an image, PDF or TXT |
| 120513 | CH-12113 | `THE_READER_SAYS_THE_IMAGE_IS_NOT` | The reader says the image is not a class schedule |
| 120514 | CH-12114 | `THE_READER_FINDS_NO_CLASSES` | The reader finds no classes |
| 120515 | — | `IMPORT_SKIPS_WHAT_IS_ALREADY_ON_THE_SCHEDULE` | An import reads the classes the player already has before it writes, and skips any with the same stored name and term, so importing a schedule twice never doubles the calendar. A class saved with no term, or a blank one, is in the current term, so it is the same class; the same class in another term is another class and is imported. A read that fails stops the import with nothing saved. When every class is already there nothing is inserted and nothing is synced (CH-12307). |
| 120516 | — | `ONLY_CLASSES_IN_THE_SAME_TERM_COUNT` | Every check that compares classes counts only the classes of the term in question. The exact-same-time refusal (CH-12107) and the overlap note (CH-12108) count only classes in the term the form is set to. This week's overlaps with the team (CH-12109), on the overview, the cards, the side card, the form and the import result, count only classes in the current term, because the week's events are this term's. A class with no term is in the current term. The same days and times in another term never refuse a save. |

## 06 — Server / system error

Status: DEFINED

Every write has its own toast naming what failed and what to do, with Retry (CH-12001 to CH-12004); each read that fails has its own notice with Try again (CH-12201, CH-12202); a section that crashes stays in its section (CH-12203, SectionBoundary); a reader that fails offers Paste text (CH-12204). An edit that a policy hides is a failure, never "Class updated" (120609), and a sync that wrote nothing for a class that has meetings is a failure (120610). A route-level failure (the loader throws when it can find no academic term for the day, or any read the loader does not catch) shows the shared route error view (`classes/error.tsx`).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 120601 | CH-12001 | `ADDING_OR_UPDATING_A_CLASS_FAILS` | Adding or updating a class fails |
| 120602 | CH-12002 | `A_CLASS_SAVED_BUT_DID_NOT_REACH` | A class saved but did not reach the calendar (the sync failed, threw, wrote no meetings for a class that has them, was refused offline, or was skipped because another sync was still running, as when a class is saved while an import is being put on the calendar) |
| 120603 | CH-12003 | `REMOVING_A_CLASS_FAILS` | Removing a class fails (the calendar removal or the delete) |
| 120604 | CH-12004 | `IMPORTING_THE_REVIEWED_ROWS_FAILS_TO_SAVE` | Importing the reviewed rows fails to save |
| 120605 | CH-12201 | `THE_PLAYERS_CLASSES_DONT_LOAD` | The player's classes don't load |
| 120606 | CH-12202 | `THE_TEAMS_EVENTS_DONT_LOAD` | The team's events don't load |
| 120607 | CH-12203 | `A_SECTION_CRASHES_WHILE_DRAWING` | A section crashes while drawing |
| 120608 | CH-12204 | `THE_READER_FAILS_OR_THROWS` | The reader fails or throws |
| 120609 | — | `AN_UPDATE_A_POLICY_HIDES_IS_A_FAILURE` | An edit whose update a row-level-security policy hides comes back from the database with no error and no row. The page treats that as a failure ("Nothing was saved. This class was not found, or you can't change it.") and never as "Class updated". An edit is limited to the class's id and the player's own id. |
| 120610 | — | `A_SYNC_THAT_WROTE_NOTHING_IS_A_FAILURE` | A calendar sync that returns no error but wrote no meetings for a class that has days and a time is a failure, so the class is flagged and CH-12002 says why, instead of a quietly empty calendar. A class with no days has nothing to write and is not a failure. A sync that throws is reported (surface classes.sync, low severity) and its reason reads "The calendar sync did not finish". |
| 120611 | CH-12005 | `DELETE_ALL_CLASSES_CHANGED_NOTHING_NO_CLASS` | Delete all classes changed nothing: no class could be taken off the calendar (every removal failed or threw), the connection dropped, or the write threw |
| 120612 | CH-12006 | `DELETE_ALL_CLASSES_STOPPED_HALF_WAY_SOME` | Delete all classes stopped half-way: some classes are gone and some are not |

## 07 — Network / offline

Status: DEFINED

Every write refuses while offline before anything is sent, with the shell's toast naming what did not happen (120703). Reading a screenshot offline says so and offers Try again and Paste text, and pasted text and TXT files are read on the device (CH-12901); a read over 5 seconds says so once (CH-12902) and a save over 5 seconds says so once (the shell's CH-1902). Classes has no realtime, so it has no connection-lost state of its own.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 120701 | CH-12901 | `A_SCREENSHOT_IS_CHOSEN_WHILE_OFFLINE` | A screenshot is chosen while offline |
| 120702 | CH-12902 | `A_READ_IS_SLOW` | A read is slow |
| 120703 | — | `WRITES_REFUSE_OFFLINE` | Every write on the page (saving a class, removing one, importing a schedule and putting classes on the calendar) is refused while the browser is offline, before anything is sent, with the shell's toast naming what did not happen (CH-1903) and the error haptic; an edit keeps the form as typed, and the toast's Retry sends it once back online. A class saved just as the connection went stays in the list, flagged as not on the calendar (CH-12002). Reading a screenshot offline is CH-12901; pasted text and a TXT file are read on the device. |

From the shell (P001): 10701 CH-1901, 10702 CH-1902, 10703 CH-1903, 10704 CH-1905.

## 08 — Permission / authorization

Status: DEFINED

Who may open the page: a player with `golf_clubhouse_ui` on for the player role (the shell's gate, and `page.tsx`); anyone else gets the Fairway page (120801). A player on no team gets the no-team page (CH-12305), because a class is saved with the team whose calendar it goes on. A player's reads and writes are their own (120802), and the calendar actions check the caller again (120803, reserved: read, not run). Nothing on the page is drawn for one role and hidden for another: the page has one role.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 120801 | — | `THE_PAGE_IS_THE_PLAYERS` | Clubhouse Classes is the player's page. A session that is a player with a player profile, with the Clubhouse on for the player role, gets it; a coach (including a coach who also has a player profile), a signed-out session and everyone else get the current Fairway page, unchanged. The route itself renders nothing for a session with no player profile, and a team where the member's role is not player gets the no-team page (CH-12305). |
| 120802 | — | `A_PLAYER_CHANGES_ONLY_THEIR_OWN_CLASSES` | Every read and write the page makes is limited to the player's own rows: the classes are read with the session's player id, an edit updates and a remove deletes by the class's id and that player id, and a new class carries the player's id and team id. Row-level security is the gate that counts: the baseline policies let only the owning player insert, update or delete a class and let its player and an active coach of the team read it, and teammates cannot (read in the baseline migration; the policies were not run for this page). |
| 120803 | — | `SERVER_ACTIONS_ARE_THE_GATE` | The calendar actions check the caller again, whatever the screen shows. syncClassToCalendar refuses a caller who is not signed in, whose player profile is not the player named, who is not a member of the team, or whose class row is not theirs. removeClassFromCalendar refuses a caller with no player profile, a team they are not on and a class that another player owns (looked up with the admin client on purpose, so a row the policies hide is not mistaken for an absent one), and cleans up an orphaned class's events only on the caller's own teams. Read in this pass, not run: the tests replace both actions, so no test here forces a refusal. |

From the shell (P001): 10801 CLUBHOUSE_GATE, 10802 ROLE_SCOPED_NAV, 10803 TEAM_SWITCH_IS_A_HEAD_COACHS.

## 09 — Success

Status: DEFINED

A class added, updated or removed names itself in a toast with the success haptic (120901). An import that lands shows the Schedule imported view instead of a toast, and that view says what reached the calendar and what could not (120902). The calendar sync landing shows nothing: the header's "Adding to your calendar…" goes away and a class's flag clears (the shell's action layer still fires the success haptic).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 120901 | — | `CHANGE_LANDED` | A change that lands names itself in a toast with the success haptic: Class added, Class updated, STAT 201 removed. The calendar sync's landing shows no toast (the header's "Adding to your calendar…" goes away, and a class's flag clears), and an import that lands shows the Schedule imported view instead of a toast. |
| 120902 | — | `THE_IMPORT_RESULT_SAYS_WHAT_REACHED_THE_CALENDAR` | The Schedule imported view says how many classes were imported and counts as on the calendar only those that can be: "3 of 4 are on your calendar and repeat weekly until Dec 15" (until each class's own term end, or "until the end of their terms, Dec 15 and May 15" when they differ), then "Not on your calendar: PHIL 150 (no meeting days) and HIST 210 (no time set). Open the class to add what's missing." It says "Adding them to your calendar…" while the sync runs, and "Some didn't reach your calendar. Use Retry sync on the Classes page." when one failed. An import where no class can be on the calendar never says they are. |

From the shell (P001): 10901 CHANGE_LANDED.

## 10 — Warning

Status: N/A — Classes has no non-blocking warnings of its own to number here: an overlap with another class or the team is a note in the form that does not block (category 05: CH-12108 and CH-12109), a class with no time or no days says so on its card (category 04, CH-12304, and 121503), and Remove and Discard ask first (category 11).

## 11 — Destructive

Status: DEFINED

Removing a class asks first, with the warning haptic before the question, and says what goes: the class comes off the schedule and the calendar, and it cannot be undone (CH-12501). Nothing is optimistic: the class leaves the list only once the calendar removal and the delete have both landed. Closing a form that has changes asks first and comes back with what was typed if the answer is Keep editing (CH-12502). There is no Undo and no Delete all (Q-75).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 121101 | CH-12501 | `REMOVE_CLASS` | Remove class |
| 121102 | CH-12502 | `CANCEL_OR_CLOSE_A_FORM_THAT_HAS` | Cancel or close a form that has changes |
| 121103 | CH-12503 | `DELETE_ALL_CLASSES_NOT_DRAWN_WITH_NO` | Delete all classes (a quiet red button under the deck, with a bin icon; 44px tall and full width on the phone). Not drawn with no classes (CH-12301) or when they didn't load (CH-12201); off while a save, an import, a remove, a calendar sync or a delete-all is running, because a write beside it would put back what was just taken off |

## 12 — State preservation

Status: DEFINED

A class that fails to save keeps the sheet open with every field as typed, an import that fails keeps its review, and a remove that fails keeps the question (121201). A form with changes asks before it is thrown away (CH-12502). Nothing is kept across a reload: the open sheet and a half-typed form are in the page's memory, and the calendar flags are held for the visit only (121504).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 121201 | — | `FORM_KEPT_ON_FAILURE` | A class that fails to save leaves its sheet open with every field as typed; nothing is cleared until the save lands, and the failure toast is inside the open sheet so its Retry is where the person is looking. An import that fails to save leaves the review as it was. A remove that fails leaves the question open and the class in the list. Cancel or close on a form with changes asks first (CH-12502), and each time the sheet opens it starts from the class being edited, or blank. |

## 13 — Optimistic UI

Status: N/A — nothing on Classes is optimistic: a class joins, changes or leaves the list only when the write has landed, and the toast, the list and the sheet all wait for it. The calendar sync is a separate action that follows the save (121501), not an optimistic view of it.

## 14 — Retry / recovery

Status: DEFINED

The error toast's Retry runs the same action again with the same arguments, and when it lands everything the button would have done follows (121401). A calendar Retry replays the start each class was first synced from (121402), and a save retried after a lost answer reaches the row it may already have stored (121404). Try again on a failed-read notice has the server read the page again (121403).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 121401 | — | `RETRY_FINISHES_THE_JOB` | The error toast's Retry runs the same write again with the same arguments, and when it lands everything the button would have done follows, because the follow-ups live inside the action: a save's Retry adds the class to the list, closes the sheet and starts the calendar sync; a remove's Retry takes the class out of the list and closes the question; an import's Retry shows the imported view and starts the sync; a sync's Retry puts the failed classes on the calendar. A failed sync's Retry never saves the class a second time. |
| 121402 | — | `RETRY_REPLAYS_THE_STORED_START` | Every calendar sync starts each class from the day its last attempt did. The toast's Retry replays the same arguments; the header's Retry sync and a class sheet's Retry sync pass no start, so each class takes the start held for it this visit. A Retry therefore never moves a class to a start its own term would refuse, and a class saved from its whole term is re-synced from its whole term, so a re-sync never removes the meetings already held. |
| 121403 | — | `TRY_AGAIN_REREADS_THE_PAGE` | Try again on the classes' failed-load notice (CH-12201) and on the team events' notice (CH-12202) has the server read the whole page again (router.refresh); classes the server sends afresh replace what the page holds. |
| 121404 | — | `A_SAVE_RETRIED_AFTER_A_LOST_ANSWER_REACHES_THE_SAME_ROW` | A new class's row id is made in the browser once per sheet, when the sheet opens, and travels with every attempt to save it: the toast's Retry, a second tap on Add class and an attempt after a lost answer all carry the same id. A duplicate-key answer on that id (the table's only unique column) means an earlier attempt stored the row, so the save updates that row with what was sent this time and keeps the color it has, and there is no second copy. Any other failure is still a failure, a colliding row that is not the player's is "Nothing was saved", and the next sheet gets a new id. |

From the shell (P001): 11401 ROUTE_TRY_AGAIN, 11402 TOAST_RETRY.

## 15 — Data freshness / sync

Status: DEFINED

Nothing refreshes in the background, and a change that lands does not read the page again: the list is what the server read plus what this page's own writes returned (the stored row after a save, the stored rows after an import), so a class another device changed shows on the next visit or on Try again. The team's events for the week are read once and are not re-read either. The calendar is a second write that follows the save without being waited on (121501), starts from the class's own term (121502), takes a class with no time off the calendar (121503), and is remembered as failed for the visit only (121504). Every date and time is resolved in the team's zone on the server.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 121501 | — | `SAVE_DOES_NOT_WAIT_FOR_THE_CALENDAR` | Saving a class and putting it on the calendar are two actions. The save is done, and "Class added" shows, as soon as the row is stored: the sheet is free (Add class is enabled again) while the header says "Adding to your calendar…" (CH-12403) until the sync lands. An import works the same way: its result shows at once. A class saved while another sync is still running is not dropped: it is flagged "Not on your calendar" with no error toast, and the header's Retry sync puts it there. |
| 121502 | — | `SYNC_STARTS_FROM_THE_CLASS_OWN_TERM` | An import puts a class on the calendar from next Monday, so a schedule read mid-term does not fill the calendar with meetings already held, but only where that Monday is inside the class's own term and leaves the term standing, which is the window the sync will derive. A class in next term, one imported before its term begins and one in the last weeks of a term (under 21 days left) is put on its term's whole window, with no start given. A class with no term is in the current term. A save syncs the whole term. |
| 121503 | — | `A_CLASS_WITH_NO_TIME_IS_TAKEN_OFF_THE_CALENDAR` | A class with days but no start or no end time is never put on the calendar: the server would place it from 08:00 to 09:00, a block the coach could plan around that is not real. The sync takes it off the calendar instead (a no-op if it was never on it, and it clears a block an earlier save put there), and the class says so: its card reads "No meeting time, not on your calendar" and "Add the time this class meets.", its sheet reads "No time set" and "Not on your calendar: no time set" with no meetings listed, there is no week strip, and the import result names it. A class with times and no days is flagged "No meeting days, not on your calendar" (CH-12304). |
| 121504 | — | `A_FAILED_SYNC_IS_REMEMBERED_FOR_THE_VISIT` | No column records a calendar sync, so the classes whose last sync failed, and the start each was synced from, are held by the page for the visit only: a reload starts clean, and the page never says "synced 2 minutes ago". A class that is not on the calendar is flagged on its card, in the header ("1 class is not on your calendar", with Retry sync) and in its own sheet (with Retry sync), and a Retry that lands clears all three. |

## 16 — Micro animation

Status: DEFINED

Two motions of its own, both in `classes.css` on the v2 tokens (D-64): a hovering class lifts 2px (CH-12601) and a scan line sweeps the page while a schedule is read, still under reduced motion (CH-12602). Both are checked in the preview, not in a test, and CH-12602 stays `reserved` because its code appears only in the stylesheet. Every press, sheet and skeleton fade is the shell's.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 121601 | CH-12601 | `HOVERING_A_CLASS` | Hovering a class |
| 121602 | CH-12602 | `A_SCHEDULE_IS_BEING_READ_2` | A schedule is being read |

From the shell (P001): 11601 CH-1601, 11602 CH-1602, 11603 CH-1603, 11604 CH-1604, 11605 CH-1605, 11606 CH-1606, 11607 CH-1607, 11608 CH-1608, 11609 CH-1609, 11610 CH-1610, 11611 CH-1611, 11612 CH-1612.

## 17 — Haptic

Status: DEFINED

On the v2 grammar (D-70): a tick for opening a class, choosing or clearing a day and switching between a file and pasted text (CH-12701, CH-12703, CH-12705); a warning before the remove question and on Discard (CH-12702, CH-12502); an error when a file cannot be read or a write fails; success and error for every save come from the shell's action layer. Every other tap is silent.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 121701 | CH-12701 | `A_CLASS_IS_OPENED` | A class is opened |
| 121702 | CH-12702 | `REMOVE_CLASS_IS_TAPPED_IN_A_CLASSS` | Remove class is tapped in a class's sheet |
| 121703 | CH-12703 | `A_DAY_IS_CHOSEN_OR_CLEARED_IN` | A day is chosen or cleared in the form |
| 121704 | CH-12705 | `THE_IMPORT_SWITCHES_BETWEEN_A_FILE_AND` | The import switches between a file and pasted text |
| 121705 | CH-12704 | `DELETE_ALL_CLASSES_IS_TAPPED` | Delete all classes is tapped |

From the shell (P001): 11701 CH-1701, 11702 CH-1702, 11703 CH-1703, 11704 CH-1704, 11705 CH-1705, 11706 CH-1706, 11707 CH-1707.

## 18 — Accessibility

Status: DEFINED

The page is labelled "Classes" and each class is one button named for its code, name and when it meets (CH-12801); the card's week strip and the overview's drawing are hidden and the labels say the same in words (CH-12802, CH-12803); a refused save marks each field and moves focus to the first (CH-12804); the import's drop zone is a real button (CH-12805); status changes and errors are announced (`role="status"` on CH-12402 and CH-12403, `role="alert"` on the form's messages and the import's errors). Sheets are native dialogs that trap focus and close on Esc. Axe over the six preview states at 1280 and 390 is reserved because it is a dev-server run and not a test (121806). A full keyboard walk and a screen reader pass are open.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 121801 | CH-12801 | `A_SCREEN_READER_MOVES_THROUGH_THE_DECK` | A screen reader moves through the deck |
| 121802 | CH-12802 | `THE_CARDS_WEEK_STRIP` | The card's week strip |
| 121803 | CH-12803 | `THE_TERM_OVERVIEW` | The term overview |
| 121804 | CH-12804 | `A_SAVE_IS_REFUSED` | A save is refused |
| 121805 | CH-12805 | `THE_IMPORTS_DROP_ZONE` | The import's drop zone |
| 121806 | — | `NO_AXE_VIOLATIONS_IN_ANY_PREVIEW_STATE` | No axe violations on the six preview states (the board's Fall 2026, empty, failed, partial, no team and loading) at 1280px and 390px, run by npm run clubhouse:a11y from the entries in scripts/clubhouse/a11y.mjs. Reserved: it ran clean on 2026-09-30 (12 of 12), but it is a dev-server run, not a test, so no test names it. |

From the shell (P001): 11801 CH-1801, 11802 CH-1802, 11803 CH-1803, 11804 CH-1804, 11805 CH-1805, 11806 CH-1806, 11807 CH-1807, 11808 CH-1808, 11809 CH-1809, 11810 CH-1810, 11811 CH-1811, 11812 CH-1812, 11813 CH-1813, 11814 CH-1814.

## 19 — Responsive layout

Status: DEFINED

The phone build at 820px and below (121901); the phone spec is `docs/clubhouse/phone/classes.md` (approved, from `Player - Classes - Mobile.html`). Classes opens from More on the phone (D-66), so its top bar goes back there. That the sheets are bottom sheets that drag to close, and the reflow below 1000px and 640px, are CSS and are not tested.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 121901 | — | `PHONE_LAYOUT` | At 820px and below Classes is the phone build, never a shrunken desktop: the shell's top bar reads "Classes" with "‹ More" going back to More, the page keeps its own header, and the same classes and actions are there; the sheets are bottom sheets. Below a 1000px container the side column goes under the deck, and below 640px the deck is one column, the overview stacks and the two header buttons share the row. |

From the shell (P001): 11901 PHONE_CHROME.

## 20 — Keyboard / input

Status: DEFINED

Enter in a form field saves, and Esc closes any sheet through the same path as Cancel, so a form with changes asks first and focus returns to what opened it (122001, reserved: no test presses Enter or Esc). The days, the file drop zone and every other control are native buttons in the tab order. No shortcuts of its own.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 122001 | — | `ENTER_SAVES_AND_ESC_CLOSES` | Enter in a field of the Add or Edit form saves it (the form has a hidden submit button and the same refusals as the Save button), and Esc closes any sheet through the same path as Cancel or Close, so a form with changes asks first (CH-12502), with focus returning to what opened it. The day picker's days are native buttons with a pressed state, and the import's drop zone is a native button (CH-12805). Not tested here: no test presses Enter or Esc. |

## 21 — Performance

Status: DEFINED

The loader reads the page in one pass: the team's zone, then the classes and the week's events together, each limited to 500 rows (122101). Web vitals are the shell's.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 122101 | — | `LOADER_READS_IN_ONE_PASS` | The server loader reads the page before first paint in one pass: the team's time zone, then the player's classes and the team's events for the week together (each limited to 500 rows). Each failed read is flagged on its own (classes.error, week.error) and logged, never thrown, so the other still shows. "Today" is the team's day in the team's zone (in the evening in New York it is already tomorrow in UTC), and the week runs Monday to Sunday around it. |

From the shell (P001): 12101 CH-1954.

## 22 — Analytics

Status: DEFINED

The shell records rage, dead and slow clicks for every page. Classes adds no events of its own.

From the shell (P001): 12201 CH-1951, 12202 CH-1952, 12203 CH-1953.

## 23 — Logging / observability

Status: DEFINED

Failed reads are logged by name, failed writes are reported under the `classes` surface with their action, intents leave a breadcrumb (`classes add`, `classes import`, `classes open` and `action classes.<name>`), and a crash reports under its own section (122301).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 122301 | — | `FAILURES_REPORTED` | A read that fails in the loader is logged through chLogServer("classes", "classes" or "events") and named on the page. A write that fails is reported through chReport under the classes surface with its action (classes.save, classes.remove, classes.import, classes.sync), at low severity when the server refused it, after a chTrail breadcrumb for the intent. A calendar removal or sync that throws is reported under classes.remove or classes.sync. A section that crashes reports under its own surface (classes.term, classes.deck, classes.side). |

From the shell (P001): 12301 FAILURES_REPORTED.

## 24 — CI / automated test

Status: DEFINED

`src/clubhouse/__tests__/classes.test.tsx` names every catalog code of kinds 0 to 5 it forces, and `clubhouse:check` fails a row of kinds 0 to 5 that no test names (122401). The hand contracts are named by Bridge ID in a test title once the IDs are added (VERIFY.md has the map).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 122401 | — | `TESTS_NAME_CONTRACTS` | src/clubhouse/__tests__/classes.test.tsx names every Classes catalog code of kinds 0 to 5 it forces (clubhouse:check fails a row that no test names), and every hand contract it proves by its Bridge ID in a test title. Reserved: no test title carries a Bridge ID yet, and no test asserts this. |

From the shell (P001): 12401 TESTS_NAME_CONTRACTS.

## 25 — Helm Bridge action

Status: N/A — the Bridge is wired later (owner, D-68). Every contract above already has its Bridge ID; the commands (open a class, add a class, import a schedule, remove a class) are defined when the Bridge is.
