# P003 — Roster: page contract

Every behaviour Roster promises, by the 25 V2 categories (D-69). A contract's
number is its Bridge ID (D-68: namespace 3, category, item); `Code` is the
catalog code on the element and in the test (`docs/clubhouse/catalog/roster.md`).
Rows without a code are behaviours with no single element, recorded in
`config/clubhouse/bridge-contracts.json` by hand. The shell's contracts (P001,
namespace 1) apply here too and are named where they carry a category.
`clubhouse:check` holds this file to the registry.

## 01 — Default / core UI

Status: DEFINED

Roster opens on the active players as cards, best scoring average first, with the join requests and Needs a look above them, all from the server's first render (30101). On the phone it is the list screen. A ?player= link opens that profile on the phone only, and does nothing on desktop (30102).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 30101 | — | `ROSTER_READY` | Roster opens with the team line, the join requests, Needs a look and the active players as cards by scoring average, all from the server's first render; on the phone, the list screen with the same players as rows. |
| 30102 | — | `DEEP_LINK_OPENS_PROFILE` | On the phone, a link with ?player=<golf_players.id> opens that player's profile once and the address is cleaned; an id that is not on this roster opens the list and nothing else. Desktop ignores ?player=. |

From the shell (P001): 10101 CH-1904, 10102 SHELL_READY.

## 02 — Initial loading / skeleton

Status: DEFINED

Route skeleton (30201): the header, toolbar and six face cards in their final slots, and below 820px the phone's list rows, switched in CSS because the skeleton renders on the server. v2 timing: nothing for 150ms, then a fade (the shell's 11609). The page and its data arrive together, so no section loads on its own; the reads that can fail have notices (category 06).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 30201 | CH-3401 | `ROSTER_IS_LOADING` | Roster is loading |

From the shell (P001): 10201 CH-1401.

## 03 — Background loading / refresh

Status: DEFINED

There is no realtime, no polling and no pull to refresh (it waits for a design, D-43). What is in flight is a write: Remove (30301) and Approve all (30302) show their progress and cannot be pressed twice. A refresh, from Try again or from the page a write revalidated, replaces what the screen holds (30303).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 30301 | CH-3402 | `A_REMOVE_IS_IN_FLIGHT` | A remove is in flight |
| 30302 | CH-3403 | `APPROVE_ALL_IS_IN_FLIGHT` | Approve all is in flight (phone join requests sheet, D-55) |
| 30303 | — | `ROSTER_FOLLOWS_A_REFRESH` | When the server sends the page again (Try again, or the page a write revalidated), the players and join requests on screen become the new ones: an approved player appears, and a read that failed and now succeeds shows the players, never No players yet. |

## 04 — Empty

Status: DEFINED

First-run (30401), filtered (30402, 30403) and per-player (30405) are distinct, and a failed read is never shown as empty (32101). A team without a join code is its own state (30404), and a failed team read is a different one (CH-3207, category 06). A coach with no active team gets Roster's own page state, no longer Home's (CH-3306, fixed 2026-09-30). Whole-page empties are the v2 page empty state (D-71).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 30401 | CH-3301 | `NO_PLAYERS_YET` | No players yet |
| 30402 | CH-3302 | `A_SEARCH_MATCHES_NOBODY` | A search matches nobody |
| 30403 | CH-3303 | `A_STATUS_FILTER_HAS_NOBODY` | A status filter has nobody |
| 30404 | CH-3304 | `THE_TEAM_HAS_NO_JOIN_CODE` | The team has no join code |
| 30405 | CH-3305 | `A_PLAYER_HAS_NO_18_HOLE_ROUNDS` | A player has no 18-hole rounds |
| 30406 | CH-3306 | `A_COACH_SIGNED_IN_WITH_NO_ACTIVE` | A coach signed in with no active team |

## 05 — Validation

Status: DEFINED

One input has a limit: the coach's note (30501, 2,000 characters; the counter appears in the last 200 and typing stops at the limit). The search box takes any text. Nothing else is typed into a form: players join by code, and the server checks who may decide a request (30803). What players typed comes out safely: the export writes a name that could be read as a formula as text (30502).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 30501 | CH-3101 | `A_COACHS_NOTE_IS_WITHIN_200_CHARACTERS` | A coach's note is within 200 characters of its 2,000 limit |
| 30502 | — | `EXPORT_CELLS_ARE_TEXT` | The CSV export writes a player's name that starts with =, +, - or @ (or a tab or a return) as text, with a leading apostrophe, so a spreadsheet never reads it as a formula; numbers are left as numbers. |

## 06 — Server / system error

Status: DEFINED

Every change has its own toast (30601 to 30607) naming what failed and what to do, and every read that fails to load has its own notice with Try again (30608 to 30610, 30614 to 30616). A crash stays in its section (30611 to 30613, SectionBoundary). Try again refreshes the whole page (31402). A refused change shows the server's own sentence when it is short and readable (30803).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 30601 | CH-3001 | `REMOVING_A_PLAYER_FAILS` | Removing a player fails |
| 30602 | CH-3002 | `APPROVING_A_JOIN_REQUEST_FAILS` | Approving a join request fails |
| 30603 | CH-3003 | `DECLINING_A_JOIN_REQUEST_FAILS` | Declining a join request fails |
| 30604 | CH-3004 | `THE_COACHS_NOTE_DOESNT_SAVE` | The coach's note doesn't save (on leaving the field) |
| 30605 | CH-3005 | `THE_BROWSER_BLOCKS_THE_CSV_DOWNLOAD` | The browser blocks the CSV download |
| 30606 | CH-3006 | `COPYING_THE_JOIN_CODE_OR_LINK_FAILS` | Copying the join code or link fails |
| 30607 | CH-3007 | `APPROVE_ALL_LEAVES_SOME_REQUESTS_UNAPPROVED` | Approve all (phone requests sheet, D-55) leaves some requests unapproved |
| 30608 | CH-3201 | `THE_ROSTER_DOESNT_LOAD` | The roster doesn't load |
| 30609 | CH-3202 | `SEASON_ROUNDS_DONT_LOAD` | Season rounds don't load |
| 30610 | CH-3203 | `JOIN_REQUESTS_DONT_LOAD` | Join requests don't load |
| 30611 | CH-3204 | `THE_JOIN_REQUESTS_SECTION_CRASHES` | The join requests section crashes |
| 30612 | CH-3205 | `THE_ROSTER_LIST_CRASHES` | The roster list crashes |
| 30613 | CH-3206 | `THE_PLAYER_PANEL_CRASHES` | The player panel crashes |
| 30614 | CH-3207 | `THE_TEAM_ROW_DOESNT_LOAD` | The team row doesn't load |
| 30615 | CH-3208 | `FOCUS_AREAS_OR_GOALS_DONT_LOAD` | Focus areas or goals don't load |
| 30616 | CH-3209 | `THIS_COACHS_NOTES_DONT_LOAD` | This coach's notes don't load |

From the shell (P001): 10601 CH-1001, 10602 CH-1201, 10603 CH-1202, 10604 CH-1203, 10605 CH-1204, 10606 CH-1205, 10607 CH-1206, 10608 CH-1207, 10609 CH-1208, 10610 CH-1002.

## 07 — Network / offline

Status: DEFINED

Roster's writes all go through useAction, so offline every one is refused before anything is sent and the toast names it (30701, the shell's 10703). A save over 5 seconds says so (10702), the banner (10701), and Try again while offline says so instead of retrying (10704). Export, Copy and the filters are local. Roster has no lost-confirmation state: a write answers or throws, and a throw is reported (32301).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 30701 | — | `WRITES_REFUSED_OFFLINE` | Offline, every Roster write (a removal, an approval, a decline, Approve all, a note) is refused before anything is sent, the toast names what did not happen, and nothing on screen changes; Export, Copy and the filters are local and keep working. |

From the shell (P001): 10701 CH-1901, 10702 CH-1902, 10703 CH-1903, 10704 CH-1905.

## 08 — Permission / authorization

Status: DEFINED

Roster is a coach's page. The page takes the Clubhouse branch only for a coach with golf_clubhouse_ui on (the shell's 10801), and the route checks the coach again before any read (30801). A player who opens this address in Clubhouse gets the shell's not-rebuilt notice (10401; role-scoped by 10802), never the list, the notes or the join requests. A coach with no active team gets the page empty state (CH-3306, category 04). The loader reads only the coach's active team, and only the notes this coach wrote (30802). The server decides every change and Roster shows its answer (30803). removePlayerFromTeam refuses a caller who is not a coach, has no team, or whose team the player is not on, and it refuses while the player has a saved round in progress. acceptJoinRequest and rejectJoinRequest refuse a request that is not for the coach's own team or is already processed, and approval refuses a player who is already on a team. setIntent refuses a player the coach does not coach. RLS is the second gate. A ?player= link for someone who is not on this roster opens nothing (30102).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 30801 | — | `COACH_ONLY_ROSTER` | Only a coach gets the Clubhouse roster: the page hands it over for a coach with the flag on, the route checks the coach again before any read, and a player on this address gets the shell's not-rebuilt notice, never the list, the notes or the join requests. |
| 30802 | — | `NOTES_PRIVATE_TO_THE_COACH` | The loader reads the members of the coach's active team (active and inactive only) and only the notes this coach wrote (coach_id), so another coach's note about the same player is never loaded. |
| 30803 | — | `REFUSED_CHANGE_SHOWN_AND_UNDONE` | When the server refuses a removal, an approval, a decline or a note (not on your team, already processed, a saved round in progress, not authorized), its sentence is shown in the error toast and the screen goes back: the player stays and the dialog stays open, the request returns to its place, and the text stays in the field. |

From the shell (P001): 10801 CLUBHOUSE_GATE, 10802 ROLE_SCOPED_NAV.

## 09 — Success

Status: DEFINED

A change that lands names itself in a toast and taps the success pattern once (30901; the shell's 10901). A removal also closes the dialog and the panel. Opening a player, filtering and sorting are not changes and give no toast. An export and a copy name themselves too (31702, 31703).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 30901 | — | `CHANGE_LANDED` | A change that lands names itself in a toast (added, declined, note saved, removed) with one success haptic; a removal also closes the dialog and the player's panel or profile. |

From the shell (P001): 10901 CHANGE_LANDED.

## 10 — Warning

Status: N/A — no Roster state is a warning today; Approve all that only partly lands is an error with a Retry (category 06), and the duplicate-player notice Fairway shows has not been rebuilt (open).

Fairway's roster warned when one student appears on the roster twice (#1477). Clubhouse dropped that notice, and the handoff does not draw one, so it is an open gap in VERIFY.md rather than a contract. When it is rebuilt it belongs in this category.

## 11 — Destructive

Status: DEFINED

Remove from team asks first (31101): the dialog says who, that they can rejoin with the team code, and that their account and stats are not deleted. Pressing Remove player fires the warning haptic (31704), and the button reads Removing while it runs. Decline is not destructive: the player can ask again. On the phone the same confirm follows ⋯, then Remove from team, in red (D-42).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 31101 | CH-3501 | `REMOVE_FROM_TEAM` | Remove from team (row menu; on the phone, the profile's ⋯ sheet) |

## 12 — State preservation

Status: DEFINED

A note that fails to save stays in the field (31201). The cards or list choice is kept on the device (31202). A saved note reads back when the player is opened again (31203). Search, the status pills, the sort and the open player are per visit and are not kept. A failed removal keeps its dialog open.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 31201 | — | `NOTE_KEPT_ON_FAILURE` | A note that fails to save stays in the field, and the toast says so; leaving the field again or the toast's Retry saves it. |
| 31202 | — | `LAYOUT_REMEMBERED` | The cards or list choice is stored on the device (ch-roster-view) and applied when Roster opens; a device that refuses storage still switches for the visit. Search, filter and sort are not kept. |
| 31203 | — | `SAVED_NOTE_READS_BACK` | A saved note is written into the roster the screen holds, so closing a player and opening them again, on desktop or the phone, shows the new text; an emptied note reads back empty. |

## 13 — Optimistic UI

Status: DEFINED

Approve and Decline are optimistic: the request leaves the list at once and comes back in its place if the server refuses or throws (31301). Removing a player is not optimistic: it waits, and the dialog stays open on a failure. A note is not optimistic. Approve all takes each request off as it lands.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 31301 | — | `REQUEST_DECISIONS_OPTIMISTIC` | Approve and Decline take the request off the list at once and put it back in its place if the server refuses or throws, and while one decision is in flight every other Approve and Decline waits; Remove is not optimistic, it waits with the dialog open and the button reading Removing. |

## 14 — Retry / recovery

Status: DEFINED

The toast's Retry re-runs the same change and finishes it on screen too (31403; the shell's 11402). Approve all's Retry re-runs only the requests that failed (31401). Try again on a notice refreshes the whole page, not one section (31402; the shell's 11401 for a crashed route).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 31401 | — | `APPROVE_ALL_RETRIES_ONLY_FAILURES` | Approve all goes one request at a time; those that landed leave the list, and the toast's Retry re-runs only the ones that failed, never approving anyone twice. |
| 31402 | — | `TRY_AGAIN_REFRESHES_THE_PAGE` | Try again on the roster, season stats, join requests or join code notice asks the server for the whole page again (router.refresh), not one section alone. |
| 31403 | — | `TOAST_RETRY_FINISHES_THE_JOB` | The Retry on a failed-change toast completes the change on screen as well as on the server: a retried removal removes the player and closes the dialog, a retried approval or decline keeps the request off the list, and a retried note save marks the note saved. |

From the shell (P001): 11401 ROUTE_TRY_AGAIN, 11402 TOAST_RETRY.

## 15 — Data freshness / sync

Status: N/A — Roster is a snapshot of the moment the server rendered it, with no realtime, polling or sync.

What a coach changes here revalidates the page and comes back (category 03). A change made elsewhere, such as a player asking to join, shows on the next visit or on Try again.

## 16 — Micro animation

Status: DEFINED

Roster's own motion (CH-3601, CH-3602; both are checked in the preview, not by a test) and the shell's: v2 press, reveal, sheets and pushes (D-64).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 31601 | CH-3601 | `OPENING_OR_SWITCHING_A_PLAYER` | Opening or switching a player |
| 31602 | CH-3602 | `HOVERING_OR_PRESSING_A_FACE_CARD_OR` | Hovering or pressing a face card or row |

From the shell (P001): 11601 CH-1601, 11602 CH-1602, 11603 CH-1603, 11604 CH-1604, 11605 CH-1605, 11606 CH-1606, 11607 CH-1607, 11608 CH-1608, 11609 CH-1609, 11610 CH-1610, 11611 CH-1611, 11612 CH-1612.

## 17 — Haptic

Status: DEFINED

Roster's own haptics (31701 to 31703) and the warning as Remove player is pressed (31704), on the v2 grammar (D-70), with the shell's (11701 to 11706).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 31701 | CH-3701 | `OPENING_A_PLAYER_CHANGING_A_FILTER_LAYOUT` | Opening a player; changing a filter, layout or sort |
| 31702 | CH-3702 | `AN_EXPORT_LANDS` | An export lands |
| 31703 | CH-3703 | `THE_CODE_OR_LINK_IS_COPIED` | The code or link is copied |
| 31704 | — | `REMOVE_PLAYER_WARNS` | Pressing Remove player in the confirm fires the warning haptic (D-70), then the success pattern when the removal lands or the error pattern when it fails; Cancel is silent. |

From the shell (P001): 11701 CH-1701, 11702 CH-1702, 11703 CH-1703, 11704 CH-1704, 11705 CH-1705, 11706 CH-1706.

## 18 — Accessibility

Status: DEFINED

Roster's own (31801 to 31806): the table roles, a status as a word, Esc, the polite note counter, axe at 1280 and 390, and the phone row as one button. The join requests card is a labelled region, the desktop panel a named complementary landmark, and a pushed phone profile is named by the player. The shell's skip link, landmarks and dialog behaviour (11801 to 11811).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 31801 | CH-3801 | `THE_DESKTOP_LIST_VIEW_IS_A_TABLE` | The desktop list view is a table (phone rows: CH-3806): every value, including the player's open button, sits in a cell under a column header |
| 31802 | CH-3802 | `A_FACE_CARD_READS_ITS_STATUS_AS` | A face card reads its status as a word; the green dot is decoration |
| 31803 | CH-3803 | `ESC_CLOSES_THE_PLAYER_PANEL_EXCEPT_WHILE` | Esc closes the player panel, except while typing a note (desktop; on the phone, Back and the edge swipe pop the profile, CH-1906) |
| 31804 | CH-3804 | `THE_NOTE_COUNTER_IS_ANNOUNCED_POLITELY_A` | The note counter is announced politely; a locked note says why it's locked |
| 31805 | CH-3805 | `NO_AXE_VIOLATIONS_IN_ANY_PREVIEW_STATE` | No axe violations in any preview state, both layouts, 1280px and 390px |
| 31806 | CH-3806 | `PHONE_A_PLAYER_ROW_IS_ONE_BUTTON` | Phone: a player row is one button that reads name, class, note, average and handicap; the form spark is decoration |

From the shell (P001): 11801 CH-1801, 11802 CH-1802, 11803 CH-1803, 11804 CH-1804, 11805 CH-1805, 11806 CH-1806, 11807 CH-1807, 11808 CH-1808, 11809 CH-1809, 11810 CH-1810, 11811 CH-1811, 11812 CH-1812.

## 19 — Responsive layout

Status: DEFINED

At 820px and below Roster is the phone screen, never the desktop shrunk (31901). On a wider canvas the panel follows the cards once the container is under 1080px, and the padding tightens under 640px. The phone spec is docs/clubhouse/phone/roster.md (approved).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 31901 | — | `PHONE_LIST_AND_PROFILE` | At 820px and below Roster is the phone screen: a top bar with the back link to More and Invite players, the join requests banner, the sorted list, and each player as a pushed profile that is a history entry, so the edge swipe and Back return to the list. |

From the shell (P001): 11901 PHONE_CHROME.

## 20 — Keyboard / input

Status: DEFINED

The coach's note saves when the field loses focus, only if it changed (32001). Esc closes the panel, except while typing a note or while a dialog is open, where it closes only the dialog (31803). Cards, rows and the pills are buttons, so Enter and Space open them. Roster has no keyboard shortcuts of its own. The shell's edge swipe and browser back pop the pushed profile (12001).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 32001 | — | `NOTE_SAVES_ON_LEAVING_THE_FIELD` | The coach's note saves when the field loses focus, only if its trimmed text changed, and an emptied note saves as no note. |

From the shell (P001): 12001 CH-1906.

## 21 — Performance

Status: DEFINED

One server pass, in two parallel rounds because the second needs the first's player ids, and nothing is fetched after first paint (32101). Web vitals are the shell's (12101). Not measured: the loader's time and layout shift (VERIFY.md).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 32101 | — | `LOADER_NEVER_THROWS` | loadRoster reads the team, the members and the join requests in one parallel round, then rounds, focus areas, goals and this coach's notes in a second (it needs the member ids); every failed read is logged through chLogServer and flagged, never thrown, and a failed read is never shown as empty. |

From the shell (P001): 12101 CH-1954.

## 22 — Analytics

Status: DEFINED

The shell records rage, dead and slow clicks for every page (12201 to 12203). Roster adds no events of its own.

From the shell (P001): 12201 CH-1951, 12202 CH-1952, 12203 CH-1953.

## 23 — Logging / observability

Status: DEFINED

A failed change is reported through chReport with surface roster and its action name, a crash with its section surface, and a failed server read through chLogServer('roster', ...); each intent leaves a chTrail breadcrumb (32301; the shell's 12301).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 32301 | — | `FAILURES_REPORTED` | A failed change is reported through chReport with surface roster and its action name (roster.removePlayer, roster.approveRequest, roster.declineRequest, roster.approveAll, roster.coachNote), a crash with its section surface (roster.requests, roster.list, roster.peek), and a failed server read through chLogServer('roster', ...); each intent leaves a chTrail breadcrumb. |

From the shell (P001): 12301 FAILURES_REPORTED.

## 24 — CI / automated test

Status: DEFINED

Every catalog code of kinds 0 to 5 that is not marked preview is forced by a named test, and so is each hand contract (32401). clubhouse:check fails a catalog row that no test names.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 32401 | — | `TESTS_NAME_CONTRACTS` | src/clubhouse/__tests__/roster.test.tsx names, in a test title, every Roster catalog code of kinds 0 to 5 that is not marked preview, and each hand contract above. |

From the shell (P001): 12401 TESTS_NAME_CONTRACTS.

## 25 — Helm Bridge action

Status: N/A — the Bridge is wired later (owner, D-68).

Every contract above already has its Bridge ID; the commands (open a player, approve a request, invite players) are defined when the Bridge is.
