# P016 — Live rounds: page contract

Every behaviour Live rounds promises, by the 25 V2 categories (D-69). A contract's number is its Bridge ID
(D-68: namespace 16, category, item); `Code` is the catalog code on the element and in the test
(`docs/clubhouse/catalog/live.md`). `clubhouse:check` holds this file to the registry.

Live rounds (build plan P-6) is not a page with its own screen only: Coach Home's Live now card, the live view at
`/golf/dashboard/live`, a player's own card and Teammates card, the sharing field in Round setup, and the rows on
Calendar, Qualifiers and Rounds are all drawn from the one lane. The plan numbers its words CH-166xx and CH-168xx
without regard to the catalog kinds, so `config/clubhouse/category-map.json` places each code in the category its
words belong to (with the reason there). Nothing here changes how a shot or a score is entered or stored.

## 01 — Default / core UI

Status: DEFINED

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 160101 | CH-16600 | `COACH_HOME_SOMEONE_IS_ON_THE_COURSE` | Coach Home, someone is on the course |
| 160102 | CH-16601 | `MORE_LANES_THAN_THE_CARD_SHOWS` | More lanes than the card shows |
| 160103 | CH-16602 | `COACH_HOME_ONLY_FINISHED_LANES_REMAIN` | Coach Home, only finished lanes remain (each stays 30 minutes after it posted) |
| 160104 | CH-16603 | `THE_HEAD_OF_THE_CARD` | The head of the card |
| 160105 | CH-16610 | `THE_LIVE_VIEW` | The live view |
| 160106 | CH-16611 | `TWO_OR_MORE_ROUND_TYPES_HAVE_LANES` | Two or more round types have lanes |
| 160107 | CH-16612 | `LANES_ON_THE_COURSE` | Lanes on the course |
| 160108 | CH-16613 | `LANES_THAT_POSTED_OR_STOPPED_TODAY` | Lanes that posted or stopped today |
| 160109 | CH-16615 | `THE_SORT_CONTROL` | The sort control |
| 160110 | CH-16616 | `A_PLAYERS_SHEET_THE_HOLE_THEY_PLAY` | A player's sheet, the hole they play next |
| 160111 | CH-16617 | `A_PLAYERS_SHEET_MOMENTS` | A player's sheet, Moments |
| 160112 | CH-16618 | `WIDE_LIVE_VIEW_NOBODY_SELECTED` | Wide live view, nobody selected |
| 160113 | CH-16620 | `QUALIFIER_DETAIL` | Qualifier detail (built in slice 4) |
| 160114 | CH-16622 | `THE_QUALIFIER_LIST` | The qualifier list (slice 4) |
| 160115 | CH-16630 | `THE_TEAM_ROUNDS_BAND_HOME_WHEN_ONLY` | The Team rounds band (slice 4); Home when only tournaments are live |
| 160116 | CH-16631 | `THE_SHARE_CHIP_ON_AN_IN_PROGRESS` | The share chip on an in-progress round in the player's library (slice 4) |
| 160117 | CH-16640 | `CALENDAR_PEEK_AND_INSPECTOR_AN_EVENT_WITH` | Calendar peek and inspector, an event with lanes linked to it (slice 4) |
| 160118 | CH-16660 | `ROUND_SETUP` | Round setup (slice 2) |
| 160119 | CH-16661 | `ROUND_SETUP_2` | Round setup (slice 2) |
| 160120 | CH-16662 | `A_QUALIFIER_ROUND_IN_SETUP` | A qualifier round in setup (slice 2) |
| 160121 | CH-16663 | `ROUND_SETUP_3` | Round setup (slice 2) |
| 160122 | CH-16670 | `A_QUALIFIER_LANES_SECOND_LINE` | A qualifier lane's second line |
| 160123 | CH-16671 | `A_PRACTICE_OR_TOURNAMENT_LANES_SECOND_LINE` | A practice or tournament lane's second line |
| 160124 | CH-16674 | `A_ROUND_THE_PLAYER_STOPPED` | A round the player stopped |
| 160125 | CH-16675 | `ALL_HOLES_SCORED_NOT_POSTED` | All holes scored, not posted |
| 160126 | CH-16676 | `A_ROUND_WAS_POSTED` | A round was posted |
| 160127 | CH-16680 | `THE_PLAYERS_OWN_LIVE_CARD` | The player's own live card (slice 1) |
| 160128 | CH-16681 | `THE_PLAYERS_OWN_LIVE_CARD_2` | The player's own live card (slice 1) |
| 160129 | CH-16682 | `THE_PLAYERS_TEAMMATES_CARD` | The player's Teammates card (slice 4) |
| 160130 | CH-16684 | `ROUND_SETUP_OPEN_CALL_VERSION_2` | Round setup, open call (a) version 2 (slice 2) |
| 160131 | CH-16685 | `COACH_HOME_A_TOURNAMENT_TRACKS_A_LIVE` | Coach Home, a tournament tracks a live round |

## 02 — Initial loading / skeleton

Status: DEFINED

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 160201 | — | `LIVE_DRAWS_THE_FIRST_READ_AT_ONCE` | The live view and Home's Live now card draw the server's first read at once, with no skeleton of their own (plan 4.12): the dashboard's loading frame covers the wait, nothing moves on first paint, and only a value that changes afterwards may animate. |

## 03 — Background loading / refresh

Status: DEFINED

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 160301 | CH-16604 | `A_LIVE_READ_FAILED_OR_THE_FEED` | A live read failed or the feed dropped |

## 04 — Empty

Status: DEFINED

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 160401 | CH-16619 | `NOBODY_IS_ON_THE_COURSE` | Nobody is on the course |

## 05 — Validation

Status: N/A — nothing in the live surfaces takes typed input; the sharing control (slice 2) is a choice among levels.

## 06 — Server / system error

Status: DEFINED

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 160601 | CH-16664 | `CHANGING_THE_SHARE_LEVEL_FAILS` | Changing the share level fails (slice 2) |
| 160602 | CH-16666 | `THE_SHARE_FUNCTION_IS_NOT_IN_THE` | The share function is not in the database yet (slice 2) |

## 07 — Network / offline

Status: DEFINED

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 160701 | CH-16605 | `THE_DEVICE_IS_OFFLINE_WHILE_THE_CARD` | The device is offline while the card or the live view is open |

## 08 — Permission / authorization

Status: DEFINED

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 160801 | CH-16609 | `THE_COACH_HAS_NO_TEAM_OR_LOST` | The coach has no team, or lost access to it |

## 09 — Success

Status: N/A — nothing here saves anything a coach does; the player's sharing change is quiet and has no success message (plan 5.3).

## 10 — Warning

Status: DEFINED

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 161001 | CH-16665 | `A_ROUNDS_SHARING_WAS_CHANGED_30_TIMES` | A round's sharing was changed 30 times (slice 2) |

## 11 — Destructive

Status: N/A — nothing here deletes or discards.

## 12 — State preservation

Status: DEFINED

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 161201 | CH-16621 | `A_PLAYER_WITH_THEIR_OWN_ROUND_ON` | A player with their own round on this qualifier (slice 4) |

## 13 — Optimistic UI

Status: N/A — the sharing control (slice 2) is optimistic; its contract is listed when it is built.

## 14 — Retry / recovery

Status: N/A — a failed read retries by itself every 20 seconds and by Retry on the feed chip (listed under refresh).

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

Status: N/A — the plan's copy deck owns the CH-166xx numbers; the motion rules (bead scale-in, to-par wash, ring under reduced motion) are in the plan's section 5 and tested in `PlayerLane.test.tsx`; no catalog row of its own yet.

## 17 — Haptic

Status: N/A — no haptic for a coach watching (D-70); the player's share haptics arrive with slice 2.

## 18 — Accessibility

Status: DEFINED

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 161801 | CH-16641 | `CALENDAR_GRID_BLOCK` | Calendar grid block (slice 4) |

## 19 — Responsive layout

Status: N/A — the lane changes by container width (`ch-lv-list`); see DESIGN.md.

## 20 — Keyboard / input

Status: N/A — the lane list is one tab stop walked with the arrow keys, Escape and R; see DESIGN.md.

## 21 — Performance

Status: N/A — nothing is budgeted yet.

## 22 — Analytics

Status: N/A — no analytics events.

## 23 — Logging / observability

Status: N/A — failed reads log through `chLogServer('live', …)` and `chReport({ surface: 'live.poll' })`; no catalog row of its own yet.

## 24 — CI / automated test

Status: N/A — tests are named in the manifest.

## 25 — Helm Bridge action

Status: N/A — nothing here is a Helm Bridge action.
