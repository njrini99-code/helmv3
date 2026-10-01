# P014 — Recruiting: page contract

Every behaviour Recruiting promises, by the 25 V2 categories (D-69). A contract's
number is its Bridge ID (D-68: namespace 14, category, item); `Code` is the
catalog code on the element and in the test (`docs/clubhouse/catalog/recruiting.md`).
Every contract on this page has a catalog code; there are no hand-recorded behaviours without one
(the category map routes the page's rows to their categories, `config/clubhouse/category-map.json`).
The shell's contracts (P001, namespace 1) apply here too and are named where they carry a category.
`clubhouse:check` holds this file to the registry.

One screen on one route: a coach's prospect tracker. A header and Add prospect, a pipeline of four stages
(Watched, Recruiting, Offered, Committed) that filters the list, a searchable and sortable list, and the open
prospect's panel with contact, notes and private documents. On a phone it is the owner's phone build: the list, a
pushed prospect, and sheets for the edit form, the stage and delete. It is coach-only (a player is sent Home), and
it changes no schema.

## 01 — Default / core UI

Status: DEFINED

Recruiting opens final on first paint, read on the server in one pass: the header with Add prospect, the pipeline with every stage's count and share, the list by recently updated, and the first prospect's panel (140101, CH-14904). On a phone at 820px and below it is the phone build (141901, CH-14914). The route draws the Clubhouse page only for a coach with the Clubhouse on; everyone else keeps the existing page. From the shell, the frame opens on its own (10102).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 140101 | CH-14904 | `RECRUITING_OPENS` | Recruiting opens |

From the shell (P001): 10101 CH-1904, 10102 SHELL_READY.

## 02 — Initial loading / skeleton

Status: DEFINED

The route skeleton (140201, CH-14401) draws the header, the pipeline, the table and the panel in their final slots, and on a phone the search, the timeline and seven rows; it is `recruiting/loading.tsx`, through `ClubhouseSwitch`, so it shows only inside the Clubhouse. A prospect's documents have their own two-row skeleton (140202, CH-14402), marked busy. v2 timing: nothing for 150ms, then a fade (the shell's 11609).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 140201 | CH-14401 | `THE_PAGE_IS_ON_ITS_WAY` | The page is on its way |
| 140202 | CH-14402 | `A_PROSPECTS_DOCUMENTS_ARE_LOADING` | A prospect's documents are loading |
| 140203 | CH-14407 | `A_FILE_IS_BEING_SENT_TO_STORAGE` | A file is being sent to Storage and the browser reports progress |

From the shell (P001): 10201 CH-1401.

## 03 — Background loading / refresh

Status: DEFINED

While a write is in flight its button says so and is off, and nothing closes the dialog or sheet it is in: Saving for an add or a save (140301, CH-14403), Uploading (140302, CH-14404), Removing (140303, CH-14405) and Deleting (140304, CH-14406). A save over 5 seconds says it is still saving, once (the shell's 10702). The list does not poll; a fresh list arrives with a write or Try again (141501).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 140301 | CH-14403 | `AN_ADD_OR_A_SAVE_IS_ON` | An add or a save is on its way |
| 140302 | CH-14404 | `A_DOCUMENT_IS_UPLOADING` | A document is uploading |
| 140303 | CH-14405 | `A_DOCUMENT_IS_BEING_REMOVED` | A document is being removed |
| 140304 | CH-14406 | `A_PROSPECT_IS_BEING_DELETED` | A prospect is being deleted |

From the shell (P001): 10301 BELL_REFRESHES_ON_OPEN.

## 04 — Empty

Status: DEFINED

First run and filtered are distinct, and a failed read is never drawn as empty. No prospects at all is the page empty state with Add your first prospect, and the pipeline shows zeros and dashes (140401, CH-14301). A search or a stage that matches nothing says which, and offers Clear search and Search all stages, or Show all stages when it is only a stage (140402, CH-14302). A prospect with no contact details, no notes or no documents has three different rows, each with its own action (140403 to 140405, CH-14303 to CH-14305). A coach on no team gets the page that says so and opens Team Settings (140406, CH-14306). A failed list is category 06 and never "your list starts here" (141501).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 140401 | CH-14301 | `FIRST_RUN_NO_PROSPECTS` | First run: no prospects |
| 140402 | CH-14302 | `A_SEARCH_OR_A_STAGE_MATCHES_NOTHING` | A search or a stage matches nothing |
| 140403 | CH-14303 | `A_PROSPECT_WITH_NO_EMAIL_AND_NO` | A prospect with no email and no phone |
| 140404 | CH-14304 | `A_PROSPECT_WITH_NO_NOTES` | A prospect with no notes |
| 140405 | CH-14305 | `A_PROSPECT_WITH_NO_DOCUMENTS` | A prospect with no documents |
| 140406 | CH-14306 | `A_COACH_ON_NO_TEAM_THE_PAGE` | A coach on no team the page can resolve |

From the shell (P001): 10401 CH-1301, 10402 CH-1302, 10403 CH-1303, 10404 CH-1304.

## 05 — Validation

Status: DEFINED

The form checks before it sends, with the message beside the field, focus on the first invalid one, and nothing sent: a first name is required (140501, CH-14101); a class year is a four-digit year from 2020 to 2040 (140502, CH-14102); a state is two letters (140503, CH-14103); and a value past the server's limit (names and hometown 120 characters, email 254, phone 40, notes 5,000) says so instead of being cut (140504, CH-14104). The same limits as the server's own check, so the server's answer is never the first time a coach hears of them. A file to upload is screened in the dialog: over 25 MB (140505, CH-14105) and a type the bucket does not take (140506, CH-14106) are refused before anything is sent.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 140501 | CH-14101 | `SAVE_WITH_NO_FIRST_NAME` | Save with no first name |
| 140502 | CH-14102 | `A_CLASS_YEAR_THAT_IS_NOT_A` | A class year that is not a four-digit year from 2020 to 2040 |
| 140503 | CH-14103 | `A_STATE_THAT_IS_NOT_TWO_LETTERS` | A state that is not two letters |
| 140504 | CH-14104 | `A_VALUE_PAST_THE_SERVERS_LIMIT_NAMES` | A value past the server's limit: names and hometown 120 characters, email 254, phone 40, notes 5,000 |
| 140505 | CH-14105 | `A_FILE_OVER_25_MB` | A file over its limit: 25 MB for a document or an image, 100 MB for film (MP4, MOV, M4V) |
| 140506 | CH-14106 | `A_FILE_WHOSE_TYPE_THE_BUCKET_DOES` | A file whose type the bucket does not take |
| 140507 | CH-14107 | `STORAGE_TURNS_DOWN_A_FILES_TYPE_AFTER` | Storage turns down a file's type after the page let it through (the bucket not yet updated to take film, or a type it stopped taking) |
| 140508 | CH-14108 | `STORAGE_TURNS_DOWN_A_FILES_SIZE_AFTER` | Storage turns down a file's size after the page let it through (the bucket's cap not yet raised, or a project-wide upload limit below it) |
| 140509 | CH-14109 | `SEVERAL_FILES_ARE_DROPPED_AT_ONCE` | Several files are dropped at once |
| 140510 | CH-14110 | `A_FOLDER_OR_A_FILE_WITH_NOTHING` | A folder, or a file with nothing in it, is dropped |

## 06 — Server / system error

Status: DEFINED

Every write goes through `useAction`, which reports it (Sentry, under `recruiting.<action>`), buzzes the error haptic and raises a toast with the reason and a Retry: adding a prospect (140601, CH-14001), saving changes (140602, CH-14002), a stage change (140603, CH-14003), deleting (140604, CH-14004), uploading a document (140605, CH-14005), removing one (140606, CH-14006) and opening one (140607, CH-14007). A refused or thrown write is a sentence in the coach's words, never a status code. The list that does not load is a notice with Try again (140608, CH-14201), never the empty state; a prospect's documents that do not load are a notice inside the Documents section, and the rest of the prospect still works (140609, CH-14202). A section that crashes while drawing is contained and reported with its own Try again (140610, CH-14203). The shell's frame errors apply too (10603 to 10606).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 140601 | CH-14001 | `ADDING_A_PROSPECT_FAILS` | Adding a prospect fails |
| 140602 | CH-14002 | `SAVING_CHANGES_TO_A_PROSPECT_FAILS` | Saving changes to a prospect fails |
| 140603 | CH-14003 | `A_STAGE_CHANGE_FAILS` | A stage change fails |
| 140604 | CH-14004 | `DELETING_A_PROSPECT_FAILS` | Deleting a prospect fails |
| 140605 | CH-14005 | `UPLOADING_A_DOCUMENT_FAILS` | Uploading a document fails (not because Storage turned the file itself down: that is CH-14107 or CH-14108) |
| 140606 | CH-14006 | `REMOVING_A_DOCUMENT_FAILS` | Removing a document fails |
| 140607 | CH-14007 | `OPENING_A_DOCUMENT_FAILS` | Opening a document fails |
| 140608 | CH-14201 | `THE_PROSPECT_LIST_DOESNT_LOAD` | The prospect list doesn't load |
| 140609 | CH-14202 | `A_PROSPECTS_DOCUMENTS_DONT_LOAD` | A prospect's documents don't load |
| 140610 | CH-14203 | `A_SECTION_CRASHES_WHILE_DRAWING` | A section crashes while drawing |

From the shell (P001): 10601 CH-1001, 10602 CH-1201, 10603 CH-1202, 10604 CH-1203, 10605 CH-1204, 10606 CH-1205, 10607 CH-1206, 10608 CH-1207, 10609 CH-1208, 10610 CH-1002.

## 07 — Network / offline

Status: DEFINED

Offline, no write is sent: the shell's toast names what did not happen ("Couldn't move Mason Reilly to Committed: you're offline"), the error haptic fires, and the page stays as it was, so a stage that was not sent has nothing to put back (140701, CH-14901, with the shell's 10703). The banner says the device is offline (10701), a save over 5 seconds says it is still saving (10702), and Try again on a notice while offline says so instead of failing again (10704).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 140701 | CH-14901 | `ANY_WRITE_WHILE_OFFLINE` | Any write while offline |
| 140702 | CH-14915 | `AN_ADD_IS_REPEATED` | An Add is repeated |
| 140703 | CH-14916 | `AN_UPLOAD_IS_REPEATED` | An upload is repeated |
| 140704 | CH-14917 | `A_FILE_IS_DRAGGED_OVER_A_PROSPECTS` | A file is dragged over a prospect's documents (desktop) |

From the shell (P001): 10701 CH-1901, 10702 CH-1902, 10703 CH-1903, 10704 CH-1905.

## 08 — Permission / authorization

Status: DEFINED

Recruiting is for coaches. A player who opens it is sent Home before the page draws, as the existing page does, and the Clubhouse route itself draws nothing for a session with no coach (140801, CH-14902). The page's own server actions scope every read and write to the coach's active team, with RLS behind them and no service role; when one refuses a write because the caller is not the team's coach, the server's sentence is the toast's reason (140802, CH-14903). The sidebar lists Recruiting for a coach only (10802), and the Clubhouse gate decides whether a coach gets the new page at all (10801). The documents bucket is private: a file is reached only through a link that expires, made when it is opened.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 140801 | CH-14902 | `A_PLAYER_OPENS_RECRUITING` | A player opens Recruiting |
| 140802 | CH-14903 | `THE_SERVER_REFUSES_A_WRITE_BECAUSE_THE` | The server refuses a write because the caller is not the team's coach |

From the shell (P001): 10801 CLUBHOUSE_GATE, 10802 ROLE_SCOPED_NAV.

## 09 — Success

Status: DEFINED

A landed write says so, after the answer: "Ellie Morrow added" and the prospect is in the list and open, even if the search or stage would have hidden them (140901, CH-14905); "Mason Reilly saved", with the row, the panel and the pipeline showing the change (140902, CH-14906); "Mason Reilly deleted", and the next prospect opens (140903, CH-14907); "Fall schedule added" or "Fall schedule.pdf removed", and the list reads again without losing its rows (140904, CH-14908). Each lands with the success haptic (the shell's 11702). A stage change is silent on success beyond the polite announcement (141803).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 140901 | CH-14905 | `A_PROSPECT_IS_ADDED` | A prospect is added |
| 140902 | CH-14906 | `CHANGES_TO_A_PROSPECT_ARE_SAVED` | Changes to a prospect are saved |
| 140903 | CH-14907 | `A_PROSPECT_IS_DELETED` | A prospect is deleted |
| 140904 | CH-14908 | `A_DOCUMENT_IS_ADDED_OR_REMOVED` | A document is added or removed |

From the shell (P001): 10901 CHANGE_LANDED.

## 10 — Warning

Status: N/A — Recruiting warns about nothing before it happens. The one thing that could go wrong without the coach noticing, losing a prospect or a document, is a confirmation (category 11), and nothing else on the page needs a caution, a limit notice or a soft block.

## 11 — Destructive

Status: DEFINED

Deleting a prospect asks first, and says what goes with them: "Delete Mason Reilly?" with "This removes them from your list, with their notes and documents. This can't be undone." On desktop it is a dialog with Keep them and Delete prospect; on the phone it is an action sheet with Delete prospect in red and Cancel apart below it (141101, CH-14501). A warning haptic precedes it (141702, CH-14702). Typing the name is not asked. Removing a document asks too (141102, CH-14502). Nothing is deleted optimistically: the question stays open, and the prospect stays, until the server has answered.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 141101 | CH-14501 | `DELETE_PROSPECT_FROM_THE_PANEL_OR_THE` | Delete prospect, from the panel (desktop) or the edit sheet (phone) |
| 141102 | CH-14502 | `REMOVE_A_DOCUMENT` | Remove a document |

## 12 — State preservation

Status: DEFINED

A save that fails leaves the dialog or sheet open with every field as it was typed, so nothing has to be typed again (141201, CH-14910). An upload that fails keeps the title and the category chosen (140605, CH-14005). The stage filter and the sort are remembered in this browser (`localStorage`), as they are on the existing page, and come back when the coach does; the search and the open prospect are not.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 141201 | CH-14910 | `A_SAVE_FAILS` | A save fails |

## 13 — Optimistic UI

Status: DEFINED

A stage is saved the moment it is picked, so the prospect is in the new stage before the server has answered: the row's chip, the panel's control, the pipeline's counts and shares (141301, CH-14909). If the save does not land, the prospect goes back to the stage it was in, the toast says so with a Retry (140603, CH-14003), and Retry moves them again and, if that fails too, puts them back again. The move and its undo are both inside the action, so a thrown error is undone as well. Nothing else on the page is optimistic: an add, an edit, a delete and every document write wait for the server.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 141301 | CH-14909 | `A_STAGE_IS_PICKED` | A stage is picked |

## 14 — Retry / recovery

Status: DEFINED

Retry on a failure toast runs the same action again with the same arguments, with everything that follows a write (the move, the undo, the list read, the closing of the dialog) inside it, so a retry finishes the whole job (141401, CH-14911). Try again on the list's notice and on the Documents notice read them again (140608, 140609). The shell's Retry and Try again apply (11401, 11402).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 141401 | CH-14911 | `A_WRITE_FAILS_OR_THE_LIST_DOES` | A write fails, or the list does not load |

From the shell (P001): 11401 ROUTE_TRY_AGAIN, 11402 TOAST_RETRY.

## 15 — Data freshness / sync

Status: DEFINED

The server's list is the page's source: after a write, or Try again, the server sends a fresh list and it replaces the page's copy, so a retry after a failed read shows the prospects and never "your list starts here" (141501, CH-14912). A prospect's documents are read when it opens, and again after an upload or a removal, keeping their rows on screen while they do (140904). Dates in the list resolve from the server's clock and the UTC calendar until the browser knows its own zone, so there is no mismatch at hydration. There is no live feed: the list belongs to one coach's team and changes when they change it.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 141501 | CH-14912 | `THE_SERVER_SENDS_A_FRESH_LIST` | The server sends a fresh list (after a write, or Try again) |

## 16 — Micro animation

Status: DEFINED

A stage in the pipeline lifts its ring 1px on hover and takes a second ring while it is the filter, in the quick duration (141601, CH-14601). A prospect opens on the phone by sliding in over the list and back out on pop, in the base duration, and fades with reduced motion (141602, CH-14602). Every tappable presses in about 6px and springs back through the shell's press (11606); the first paint rises once (11607); animations off remove all of it (11608). This page's own CSS uses only the v2 tokens (D-64).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 141601 | CH-14601 | `HOVERING_OR_PRESSING_A_STAGE_IN_THE` | Hovering or pressing a stage in the pipeline |
| 141602 | CH-14602 | `A_PROSPECT_OPENS_ON_THE_PHONE` | A prospect opens on the phone |

From the shell (P001): 11601 CH-1601, 11602 CH-1602, 11603 CH-1603, 11604 CH-1604, 11605 CH-1605, 11606 CH-1606, 11607 CH-1607, 11608 CH-1608, 11609 CH-1609, 11610 CH-1610, 11611 CH-1611, 11612 CH-1612.

## 17 — Haptic

Status: DEFINED

v2 grammar (D-70): selection when a stage is picked as the filter or as a prospect's stage, when a row is opened and when a sort is chosen (141701, CH-14701); warning when Delete prospect is tapped, before the question (141702, CH-14702); success for a landed save or send (11702); error when a write fails (11703). Every other tap is silent.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 141701 | CH-14701 | `A_STAGE_IS_PICKED_AS_THE_FILTER` | A stage is picked, as the filter or as a prospect's stage; a row is opened; a sort is chosen |
| 141702 | CH-14702 | `DELETE_PROSPECT_IS_TAPPED` | Delete prospect is tapped |
| 141703 | CH-14703 | `STORAGE_TURNS_A_FILE_DOWN` | Storage turns a file down (CH-14107, CH-14108) |

From the shell (P001): 11701 CH-1701, 11702 CH-1702, 11703 CH-1703, 11704 CH-1704, 11705 CH-1705, 11706 CH-1706.

## 18 — Accessibility

Status: DEFINED

The pipeline is one group named "Filter by stage", each stage a toggle named "Offered, 1 prospect" with its pressed state, and off while the list is empty (141801, CH-14801). The prospects are a real table with a caption and column headers, each name one button, the open one `aria-current`; on the phone a list of buttons named with the prospect, class and stage (141802, CH-14802). The stage control is a radio group that arrow keys move, and the new stage is announced politely once it has saved (141803, CH-14803). A refused save puts each message beside its field with `role="alert"`, marks it `aria-invalid` and moves focus to the first (141804, CH-14804). Email and Call are real links, `mailto:` and `tel:`, named by what they do (141805, CH-14805). Dialogs and sheets are native `<dialog>`s that hold focus and return it on close, and the pushed phone screen is named by its title (the shell's 11809).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 141801 | CH-14801 | `A_SCREEN_READER_REACHES_THE_PIPELINE` | A screen reader reaches the pipeline |
| 141802 | CH-14802 | `A_SCREEN_READER_MOVES_THROUGH_THE_PROSPECTS` | A screen reader moves through the prospects |
| 141803 | CH-14803 | `A_STAGE_IS_CHANGED` | A stage is changed |
| 141804 | CH-14804 | `A_SAVE_IS_REFUSED` | A save is refused |
| 141805 | CH-14805 | `EMAIL_AND_CALL` | Email and Call |

From the shell (P001): 11801 CH-1801, 11802 CH-1802, 11803 CH-1803, 11804 CH-1804, 11805 CH-1805, 11806 CH-1806, 11807 CH-1807, 11808 CH-1808, 11809 CH-1809, 11810 CH-1810, 11811 CH-1811, 11812 CH-1812.

## 19 — Responsive layout

Status: DEFINED

At 820px and below Recruiting is the phone build from the owner's boards, never a shrunken desktop: the top bar reads Recruiting with "‹ More", a prospect is a pushed screen, and the edit form, the stage picker and delete are bottom sheets (141901, CH-14914). The desktop list reflows by its own width (container queries), so a narrow canvas drops columns instead of scrolling the page. The phone chrome (the tab bar, the safe areas, the top bar) is the shell's (11901).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 141901 | CH-14914 | `THE_PHONE` | The phone |

From the shell (P001): 11901 PHONE_CHROME.

## 20 — Keyboard / input

Status: DEFINED

Enter in a field of the form saves it through the same checks as the button, Esc closes a dialog or clears the search, and arrow keys move the stage (142001, CH-14913). Text fields are 16px on the phone so iOS does not zoom, and every control has a 44px hit area. The shell's edge swipe pops the pushed phone screen (12001).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 142001 | CH-14913 | `KEYBOARD` | Keyboard |

From the shell (P001): 12001 CH-1906.

## 21 — Performance

Status: DEFINED

Recruiting is read once on the server, in one pass, and arrives whole; a prospect's documents are read only when it opens, so the page never waits for a file list it may not show. There are no requests after first paint except a write, Try again and a prospect's documents. A slow click is the shell's (12101).

From the shell (P001): 12101 CH-1954.

## 22 — Analytics

Status: DEFINED

The shell records rage, dead and slow clicks for every page (12201 to 12203). Recruiting adds no events of its own; its breadcrumbs are error context, not analytics.

From the shell (P001): 12201 CH-1951, 12202 CH-1952, 12203 CH-1953.

## 23 — Logging / observability

Status: DEFINED

Failures are reported, server reads logged and intents breadcrumbed. A refused write is reported at low severity and a thrown one at the default, under surface `recruiting` and the write's own name (`recruiting.add`, `.save`, `.stage`, `.delete`, `.upload`, `.removeDocument`, `.openDocument`); a crash is reported high under its section (`recruiting.pipeline`, `.list`, `.panel`). A failed list read logs through `chLogServer('recruiting', 'prospects')`, and each intent leaves a `chTrail` breadcrumb before anything is sent. The shell's failure reporting applies (12301).

From the shell (P001): 12301 FAILURES_REPORTED.

## 24 — CI / automated test

Status: DEFINED

`src/clubhouse/__tests__/recruiting.test.tsx` names every catalog code of kinds 0 to 5 that is not marked preview, in a test title, and forces it (motion, CH-14601 and CH-14602, is preview-checked only). The stage save and its rollback, the delete confirmation, search, filter and sort, the role gate and a failed upload each fail when the code they guard is broken (VERIFY.md, mutation checks). The shell's convention applies (12401).

From the shell (P001): 12401 TESTS_NAME_CONTRACTS.

## 25 — Helm Bridge action

Status: N/A — the Bridge is wired later (owner, D-68). Every contract above already has its Bridge ID; the commands (open a prospect, add one, move one to a stage) are defined when the Bridge is.
