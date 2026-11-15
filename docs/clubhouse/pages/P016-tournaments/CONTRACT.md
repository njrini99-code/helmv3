# P016 — Tournaments: page contract

Every behaviour Tournaments promises, by the 25 V2 categories (D-69). A
contract's number is its Bridge ID (D-68: namespace 16, category, item); `Code`
is the catalog code on the element and in the test
(`docs/clubhouse/catalog/tournaments.md`). The shell's contracts (P001) apply
here too and are named where they carry a category. `clubhouse:check` holds this
file to the registry.

Status: the base only (types, fixtures, primitives, placeholders, preview
screens). Several lanes build the views in
parallel; each fills the categories its view touches, from its own serial range
in the catalog.

## 01 — Default / core UI

Status: DEFINED

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 160101 | CH-16600 | `COACH_HOME_SOMEONE_IS_ON_THE_COURSE` | Coach Home, someone is on the course |
| 160102 | CH-16602 | `COACH_HOME_ONLY_FINISHED_LANES_REMAIN` | Coach Home, only finished lanes remain (each stays 30 minutes after it posted) |
| 160103 | CH-16603 | `THE_HEAD_OF_THE_CARD` | The head of the card |
| 160104 | CH-16610 | `THE_LIVE_VIEW` | The live view |
| 160105 | CH-16611 | `TWO_OR_MORE_ROUND_TYPES_HAVE_LANES` | Two or more round types have lanes |
| 160106 | CH-16612 | `LANES_ON_THE_COURSE` | Lanes on the course |
| 160107 | CH-16613 | `LANES_THAT_POSTED_OR_STOPPED_TODAY` | Lanes that posted or stopped today |
| 160108 | CH-16615 | `THE_SORT_CONTROL` | The sort control |
| 160109 | CH-16616 | `A_PLAYERS_SHEET_THE_HOLE_THEY_PLAY` | A player's sheet, the hole they play next |
| 160110 | CH-16617 | `A_PLAYERS_SHEET_MOMENTS` | A player's sheet, Moments |
| 160111 | CH-16618 | `WIDE_LIVE_VIEW_NOBODY_SELECTED` | Wide live view, nobody selected |
| 160112 | CH-16620 | `QUALIFIER_DETAIL` | Qualifier detail (built in slice 4) |
| 160113 | CH-16622 | `THE_QUALIFIER_LIST` | The qualifier list (slice 4) |
| 160114 | CH-16630 | `THE_TEAM_ROUNDS_BAND_HOME_WHEN_ONLY` | The Team rounds band (slice 4); Home when only tournaments are live |
| 160115 | CH-16631 | `THE_SHARE_CHIP_ON_AN_IN_PROGRESS` | The share chip on an in-progress round in the player's library (slice 4) |
| 160116 | CH-16640 | `CALENDAR_PEEK_AND_INSPECTOR_AN_EVENT_WITH` | Calendar peek and inspector, an event with lanes linked to it (slice 4) |
| 160117 | CH-16660 | `ROUND_SETUP` | Round setup (slice 2) |
| 160118 | CH-16661 | `ROUND_SETUP_2` | Round setup (slice 2) |
| 160119 | CH-16662 | `A_QUALIFIER_ROUND_IN_SETUP` | A qualifier round in setup (slice 2) |
| 160120 | CH-16663 | `ROUND_SETUP_3` | Round setup (slice 2) |
| 160121 | CH-16670 | `A_QUALIFIER_LANES_SECOND_LINE` | A qualifier lane's second line |
| 160122 | CH-16671 | `A_PRACTICE_OR_TOURNAMENT_LANES_SECOND_LINE` | A practice or tournament lane's second line |
| 160123 | CH-16674 | `A_ROUND_THE_PLAYER_STOPPED` | A round the player stopped |
| 160124 | CH-16675 | `ALL_HOLES_SCORED_NOT_POSTED` | All holes scored, not posted |
| 160125 | CH-16676 | `A_ROUND_WAS_POSTED` | A round was posted |
| 160126 | CH-16680 | `THE_PLAYERS_OWN_LIVE_CARD` | The player's own live card (slice 1) |
| 160127 | CH-16681 | `THE_PLAYERS_OWN_LIVE_CARD_2` | The player's own live card (slice 1) |
| 160128 | CH-16682 | `THE_PLAYERS_TEAMMATES_CARD` | The player's Teammates card (slice 4) |
| 160129 | CH-16684 | `ROUND_SETUP_OPEN_CALL_VERSION_2` | Round setup, open call (a) version 2 (slice 2) |
| 160130 | CH-16685 | `COACH_HOME_A_TOURNAMENT_TRACKS_A_LIVE` | Coach Home, a tournament tracks a live round |
| 160131 | CH-16606 | `MORE_LANES_THAN_THE_CARD_SHOWS` | More lanes than the card shows |

## 02 — Initial loading / skeleton

Status: DEFINED

Every view takes `load`; `loading` draws the view's head and body as
placeholders in place, marked busy (CH-16401). A built view replaces the
placeholder with its own skeleton at its final geometry and keeps the code. The
route skeletons arrive with the routes (Phase 7).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 160201 | CH-16401 | `A_TOURNAMENTS_VIEW_IS_ON_ITS_WAY` | A Tournaments view is on its way (`load: 'loading'`) |

From the shell (P001): 10201 CH-1401, 10202 CH-1402.

## 03 — Background loading / refresh

Status: DEFINED

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 160301 | CH-16604 | `A_LIVE_READ_FAILED_OR_THE_FEED` | A live read failed or the feed dropped |

## 04 — Empty

Status: DEFINED

Until a lane builds its view, the view says so honestly (CH-16301, preview
only). Each view's real empty states (no events this season, no field entered,
no rounds to link, and so on) are its lane's rows.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 160403 | CH-16311 | `THE_SEASON_LEDGER_THE_SEASON_HAS_NO` | The season ledger (Home, History): the season has no finished event yet |
| 160404 | CH-16312 | `HOME_NO_EVENT_IS_UPCOMING_OR_LIVE` | Home: no event is upcoming or live |
| 160405 | CH-16320 | `EVENT_DESK_THE_EVENT_HAS_NO_SCORES` | Event desk: the event has no scores yet (not played, nothing entered) |
| 160406 | CH-16321 | `EVENT_DESK_HOLES_TAB_NO_SCORECARD_HAS` | Event desk, Holes tab: no scorecard has holes (a totals-only event, or none entered) |
| 160407 | CH-16335 | `REVIEW_THE_EVENT_HAS_A_REVIEW_THAT` | Review: the event has a review that is not open yet (`review.open` is false: a round is not final) |
| 160408 | CH-16336 | `REVIEW_THE_EVENT_HAS_NO_REVIEW` | Review: the event has no review (not played, nothing to read) |
| 160409 | CH-16337 | `REVIEW_THE_REVIEW_IS_OPEN_AND_HAS` | Review: the review is open and has no notes or reflections |
| 160410 | CH-16340 | `HISTORY_NO_EVENT_IS_FINISHED` | History: no event is finished (the read worked) |
| 160411 | CH-16350 | `COMPARE_A_SIDE_SELECTS_NO_ROUNDS` | Compare: a side selects no rounds (a player with none in that context or period) |
| 160412 | CH-16351 | `COMPARE_THERE_ARE_NO_ROUNDS_AT_ALL` | Compare: there are no rounds at all (the read worked) |
| 160413 | CH-16302 | `A_TOURNAMENTS_ROUTE_OPENS_BEFORE_THE_HELD` | A Tournaments route opens before the held migrations are applied (a tournament table or RPC is missing: PGRST205, 42P01, PGRST202) |
| 160414 | CH-16303 | `A_TOURNAMENTS_ROUTE_SIGNED_IN_BUT_ON` | A Tournaments route, signed in but on no team |
| 160415 | CH-16304 | `AN_EVENT_ADDRESS_THAT_IS_NOT_THIS` | An event address that is not this team's (deleted, another team's, not an id) |
| 160416 | CH-16305 | `A_PLAYER_ON_A_COACHS_TOURNAMENTS_PAGE` | A player on a coach's Tournaments page (new or edit event, lineup, live, compare, history, link rounds) |
| 160417 | CH-16619 | `NOBODY_IS_ON_THE_COURSE` | Nobody is on the course |
| 160418 | CH-16352 | `HOME_NO_EVENT_IN_THE_SEASON_NOTHING_2` | Home: no event in the season, nothing failed (P-5 4.11.1; replaces CH-16310) |
| 160419 | CH-16338 | `LINK_ROUNDS_NO_GOLFHELM_ROUND_IS_WAITING` | Link rounds: no GolfHelm round is waiting to be linked (the read worked) |
| 160420 | CH-16362 | `LINEUP_THE_TEAM_HAS_NO_PLAYERS_ON` | Lineup: the team has no players on its roster (the read worked) |
| 160421 | CH-16363 | `LINEUP_A_PLAYER_IN_THE_DRAFT_IS` | Lineup: a player in the draft is injured, out for academics, not travelling, or has left the team |
| 160422 | CH-16370 | `LIVE_ROUND_NOBODY_IS_IN_THE_ROUND` | Live round: nobody is in the round (no lineup, no individuals) |
| 160423 | CH-16390 | `PLAYER_NO_TOURNAMENTS_IN_THE_SEASON` | Player: no tournaments in the season (the read worked) |
| 160424 | CH-16391 | `PLAYER_EVENT_THE_EVENT_HAS_NO_ROUNDS` | Player event: the event has no rounds yet |
| 160425 | CH-16392 | `PLAYER_EVENT_THE_COACH_HAS_SHARED_NOTHING` | Player event: the coach has shared nothing |
| 160426 | CH-16393 | `PLAYER_EVENT_THE_TEAMS_RESULT_IS_NOT` | Player event: the team’s result is not on the player’s page (teammates’ scores and the lineup are the coach’s until held file 4) |

## 05 — Validation

Status: N/A — not defined yet: no view is built (each renders the base's

placeholder) and nothing is wired. The lane that builds the view defines this
category with its catalog rows (screens/tournaments/README.md).

## 06 — Server / system error

Status: DEFINED

A view whose one read failed draws its head and "Tournaments didn’t load" with
Try again (CH-16201); sections that fail on their own are each view's `errors`
flags and its lane's rows.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 160601 | CH-16201 | `A_TOURNAMENTS_VIEWS_ONE_READ_FAILS` | A Tournaments view's one read fails (any view; `load: 'failed'`) |
| 160602 | CH-16210 | `HOME_THE_EVENTS_READ_FAILS_WHILE_THE` | Home: the events read fails while the page itself loads (`errors.events`) |
| 160603 | CH-16220 | `EVENT_DESK_HOLES_TAB_THE_SCORECARDS_READ` | Event desk, Holes tab: the scorecards read fails (`errors.holes`) |
| 160604 | CH-16221 | `EVENT_DESK_THE_FIELD_READ_FAILS` | Event desk: the field read fails (`errors.field`) |
| 160605 | CH-16222 | `EVENT_DESK_OVERVIEW_AND_WHO_COUNTED_THE` | Event desk, Overview and Who counted: the rounds read fails (`errors.rounds`) |
| 160606 | CH-16235 | `REVIEW_THE_REVIEW_READ_FAILS` | Review (its own page and the desk's Review tab): the review read fails (`errors.review`) |
| 160607 | CH-16236 | `HISTORY_THE_TREND_READ_FAILS` | History: the trend read fails (`errors.trend`) |
| 160608 | CH-16250 | `COMPARE_THE_ROUNDS_READ_FAILS` | Compare: the rounds read fails (`errors.rounds`) |
| 160609 | CH-16251 | `COMPARE_THE_FIELD_READ_FAILS` | Compare: the field read fails (`errors.field`) |
| 160610 | CH-16252 | `COMPARE_THE_HOLE_FIGURES_READ_FAILS` | Compare: the hole figures read fails (`errors.holes`) |
| 160611 | CH-16664 | `CHANGING_THE_SHARE_LEVEL_FAILS` | Changing the share level fails (slice 2) |
| 160612 | CH-16666 | `THE_SHARE_FUNCTION_IS_NOT_IN_THE` | The share function is not in the database yet (slice 2) |
| 160613 | CH-16050 | `STOP_TRACKING_CONFIRMED_ON_THE_DESK_AND` | Stop tracking confirmed on the desk (CH-16550) and written (P-5) |
| 160614 | CH-16051 | `CANCEL_TOURNAMENT_CONFIRMED_ON_THE_DESK` | Cancel tournament confirmed on the desk (CH-16551) |
| 160615 | CH-16052 | `RESTORE_TOURNAMENT_ON_THE_DESK` | Restore tournament on the desk |
| 160616 | CH-16053 | `STOP_TRACKING_REFUSED_THE_RESULTS_ARE_OFFICIAL` | Stop tracking refused: the results are official |
| 160617 | CH-16253 | `HOME_THE_READ_OF_THE_CALENDARS_UNTRACKED` | Home (coach): the read of the calendar's untracked tournaments fails (`errors.untracked`, P-5) |
| 160618 | CH-16038 | `LINK_ROUNDS_LINKING_A_GOLFHELM_ROUND_TO` | Link rounds: linking a GolfHelm round to an event round fails or is refused |
| 160619 | CH-16039 | `LINK_ROUNDS_NOT_A_TOURNAMENT_ROUND_FAILS` | Link rounds: "Not a tournament round" fails |
| 160620 | CH-16060 | `EDIT_EVENT_THE_SAVE_IS_REFUSED` | Edit event: the save is refused (stale, a round with scores, an out-of-order round, not a coach) |
| 160621 | CH-16061 | `EDIT_EVENT_THE_CHANGES_ARE_SAVED` | Edit event: the changes are saved |
| 160622 | CH-16238 | `LINK_ROUNDS_THE_CANDIDATE_ROUNDS_READ_FAILS` | Link rounds: the candidate rounds read fails (`errors.candidates`) |
| 160623 | CH-16062 | `LINEUP_SAVING_THE_DRAFT_FAILS_OR_IS` | Lineup: saving the draft fails or is refused (the event changed, the lineup is locked, too many players) |
| 160624 | CH-16063 | `LINEUP_PUBLISHING_FAILS_OR_IS_REFUSED` | Lineup: publishing fails or is refused (the save before it is refused, or the publish itself) |
| 160625 | CH-16064 | `LINEUP_LOCKING_FAILS_OR_IS_REFUSED` | Lineup: locking fails or is refused |
| 160626 | CH-16262 | `LINEUP_THE_ROSTER_READ_FAILS` | Lineup: the roster read fails (`errors.roster`) |
| 160627 | CH-16070 | `LIVE_ROUND_SAVING_A_SCORE_FAILS_OR` | Live round: saving a score fails or is refused (not in the round’s lineup, not signed in, not set up) |
| 160628 | CH-16071 | `LIVE_ROUND_STARTING_SUSPENDING_RESUMING_OR_FINISHING` | Live round: starting, suspending, resuming or finishing the round fails or is refused (rounds out of order, a state it can’t move to) |
| 160629 | CH-16271 | `LIVE_ROUND_THE_HOLES_OF_LINKED_GOLFHELM` | Live round: the holes of linked GolfHelm rounds fail to load (`errors.holes`) |
| 160630 | CH-16092 | `PLAYER_SAVING_THEIR_REFLECTION_FAILS_OR_IS` | Player: saving their reflection fails or is refused |
| 160631 | CH-16290 | `PLAYER_THE_EVENTS_READ_FAILS` | Player: the events read fails (`errors.events`) |
| 160632 | CH-16291 | `PLAYER_EVENT_THE_COACHS_SHARED_NOTES_READ` | Player event: the coach’s shared notes read fails (`errors.notes`) |
| 160633 | CH-16292 | `PLAYER_EVENT_THE_PLAYERS_REFLECTION_READ_FAILS` | Player event: the player’s reflection read fails (`errors.reflection`) |
| 160634 | CH-16293 | `PLAYER_EVENT_THE_PLAYERS_OWN_SPOT_FAILS` | Player event: the player’s own spot (the lineup reveal) fails to load (`errors.reveal`) |
| 160635 | CH-16072 | `HOLE_BY_HOLE_SAVING_ONE_HOLE_FAILS` | Hole by hole: saving one hole fails or is refused (not in the round’s lineup, a total already entered, results official, not set up) |

## 07 — Network / offline

Status: DEFINED

No Tournaments route is served yet, so the shell's offline contracts are the
whole of it today; the live round's outbox (5L.8.5) adds its own.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 160701 | CH-16605 | `THE_DEVICE_IS_OFFLINE_WHILE_THE_CARD` | The device is offline while the card or the live view is open |

From the shell (P001): 10701 CH-1901, 10702 CH-1902, 10703 CH-1903,
10704 CH-1905, 10705 CH-1909, 10706 CH-1910.

## 08 — Permission / authorization

Status: DEFINED

Coach-only views (new, edit, lineup, compare, history, links, review) and the
player's own view are decided by the route (plan 14.2, Phase 7); until then the
shell's gate is the only one, and Tournaments is reachable in the preview only.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 160801 | CH-16609 | `THE_COACH_HAS_NO_TEAM_OR_LOST` | The coach has no team, or lost access to it |

From the shell (P001): 10801 CLUBHOUSE_GATE, 10802 ROLE_SCOPED_NAV,
10803 TEAM_SWITCH_IS_A_HEAD_COACHS, 10804 CH-1911.

## 09 — Success

Status: N/A — not defined yet: no view is built (each renders the base's

placeholder) and nothing is wired. The lane that builds the view defines this
category with its catalog rows (screens/tournaments/README.md).

## 10 — Warning

Status: DEFINED

The event desk tells the coach when the host's published number differs from our
scorecard (CH-16920): shown with both numbers, never silently picked (D-82).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 161001 | CH-16920 | `EVENT_DESK_THE_HOSTS_PUBLISHED_NUMBER_DIFFERS` | Event desk: the host's published number differs from our scorecard (`officialTotal` set and unequal) |
| 161002 | CH-16665 | `A_ROUNDS_SHARING_WAS_CHANGED_30_TIMES` | A round's sharing was changed 30 times (slice 2) |

## 11 — Destructive

Status: DEFINED

P-5 (2026-10-25): the desk's tournament menu. Stop tracking asks first (161101)
and, with scores entered or the results official, says why it stays tracked
instead. Cancel tournament asks first (161102), shows at once, and is written
only when its toast's Undo runs out, so Undo sends nothing. Both fire the
warning haptic. Restore is the safe direction and doesn't ask.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 161101 | CH-16550 | `STOP_TRACKING_FROM_THE_DESKS_TOURNAMENT_MENU` | Stop tracking, from the desk's tournament menu (P-5) |
| 161102 | CH-16551 | `CANCEL_TOURNAMENT_FROM_THE_DESKS_TOURNAMENT_MENU` | Cancel tournament, from the desk's tournament menu (P-5; the calendar's CH-6541) |
| 161103 | CH-16560 | `LOCK_THE_LINEUP_FROM_THE_LINEUP_BUILDER` | Lock the lineup, from the lineup builder |
| 161104 | CH-16570 | `FINISH_THE_ROUND_FROM_THE_LIVE_ROUND` | Finish the round, from the live round |

## 12 — State preservation

Status: DEFINED

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 161201 | CH-16621 | `A_PLAYER_WITH_THEIR_OWN_ROUND_ON` | A player with their own round on this qualifier (slice 4) |

## 13 — Optimistic UI

Status: N/A — not defined yet: no view is built (each renders the base's

placeholder) and nothing is wired. The lane that builds the view defines this
category with its catalog rows (screens/tournaments/README.md).

## 14 — Retry / recovery

Status: N/A — not defined yet: no view is built (each renders the base's

placeholder) and nothing is wired. The lane that builds the view defines this
category with its catalog rows (screens/tournaments/README.md).

## 15 — Data freshness / sync

Status: DEFINED

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 161501 | CH-16614 | `LANES_WITH_NO_WORD_FOR_90_MINUTES` | Lanes with no word for 90 minutes |
| 161502 | CH-16672 | `A_LANE_SILENT_FOR_10_MINUTES_WITH` | A lane silent for 10 minutes with the last hole at least as old |
| 161503 | CH-16673 | `A_LANE_SILENT_FOR_90_MINUTES` | A lane silent for 90 minutes |
| 161504 | CH-16677 | `TWO_OR_MORE_HOLES_LAND_IN_ONE` | Two or more holes land in one read (a phone that reconnected) |
| 161505 | CH-16683 | `THE_PLAYERS_OWN_LIVE_CARD_NOT_SAVED` | The player's own live card, not saved for 10 minutes (slice 1) |

## 16 — Micro animation

Status: DEFINED

A value that changes after first paint takes its new value in place and gets the
520 ms changed-wash (CH-16601, D-100); nothing rolls and nothing draws in on
first paint.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 161601 | CH-16601 | `A_VALUE_CHANGES_AFTER_FIRST_PAINT` | A value changes after first paint (a live score, a team total, a place) |
| 161602 | CH-16650 | `HOME_A_TOURNAMENT_ARRIVES_WHILE_THE_PAGE` | Home: a tournament arrives while the page is open (another tab or coach set it up; P-5 M9) |

From the shell (P001): 11601 CH-1601, 11602 CH-1602, 11603 CH-1603,
11604 CH-1604, 11605 CH-1605, 11606 CH-1606, 11607 CH-1607, 11608 CH-1608,
11609 CH-1609, 11610 CH-1610, 11611 CH-1611, 11612 CH-1612, 11613 CH-1613,
11614 CH-1614, 11615 CH-1615, 11616 CH-1616, 11617 CH-1617, 11618 CH-1618,
11619 CH-1619, 11620 CH-1620, 11621 CH-1621, 11622 CH-1622.

## 17 — Haptic

Status: N/A — not defined yet: no view is built (each renders the base's

placeholder) and nothing is wired. The lane that builds the view defines this
category with its catalog rows (screens/tournaments/README.md).

## 18 — Accessibility

Status: DEFINED

DeltaChip and TrustChip speak their meaning in words and never rest on hue alone
(CH-16801).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 161801 | CH-16801 | `A_SIGNED_DIFFERENCE_OR_A_TRUST_STATE` | A signed difference or a trust state is read |
| 161802 | CH-16641 | `CALENDAR_GRID_BLOCK` | Calendar grid block (slice 4) |
| 161803 | CH-16850 | `HOME_A_TOURNAMENT_ARRIVES_WHILE_THE_PAGE_2` | Home: a tournament arrives while the page is open |

From the shell (P001): 11801 CH-1801, 11802 CH-1802, 11803 CH-1803,
11804 CH-1804, 11805 CH-1805, 11806 CH-1806, 11807 CH-1807, 11808 CH-1808,
11809 CH-1809, 11810 CH-1810, 11811 CH-1811, 11812 CH-1812, 11813 CH-1813,
11814 CH-1814, 11815 CH-1815, 11816 CH-1820, 11817 CH-1821, 11818 CH-1822,
11819 CH-1830, 11820 CH-1831, 11821 CH-1832, 11822 CH-1840, 11823 CH-1841,
11824 CH-1842, 11825 CH-1816, 11826 CH-1817, 11827 CH-1823, 11828 CH-1824.

## 19 — Responsive layout

Status: N/A — not defined yet: no view is built (each renders the base's

placeholder) and nothing is wired. The lane that builds the view defines this
category with its catalog rows (screens/tournaments/README.md).

## 20 — Keyboard / input

Status: N/A — not defined yet: no view is built (each renders the base's

placeholder) and nothing is wired. The lane that builds the view defines this
category with its catalog rows (screens/tournaments/README.md).

## 21 — Performance

Status: N/A — not defined yet: no view is built (each renders the base's

placeholder) and nothing is wired. The lane that builds the view defines this
category with its catalog rows (screens/tournaments/README.md).

## 22 — Analytics

Status: N/A — not defined yet: no view is built (each renders the base's

placeholder) and nothing is wired. The lane that builds the view defines this
category with its catalog rows (screens/tournaments/README.md).

## 23 — Logging / observability

Status: N/A — not defined yet: no view is built (each renders the base's

placeholder) and nothing is wired. The lane that builds the view defines this
category with its catalog rows (screens/tournaments/README.md).

## 24 — CI / automated test

Status: N/A — not defined yet: no view is built (each renders the base's

placeholder) and nothing is wired. The lane that builds the view defines this
category with its catalog rows (screens/tournaments/README.md).

## 25 — Helm Bridge action

Status: N/A — not defined yet: no view is built (each renders the base's

placeholder) and nothing is wired. The lane that builds the view defines this
category with its catalog rows (screens/tournaments/README.md).
