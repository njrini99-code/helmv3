# P017 — Practice: page contract

Every behaviour Practice promises, by the 25 V2 categories (D-69). Practice has
no catalog file of its own: its rows are the "Practice:" rows of
`docs/clubhouse/catalog/coachhelm.md`, numbered CH-13080 and up, so their Bridge
IDs belong to P013 and are named below rather than minted again (CH codes and
Bridge IDs are permanent). P017's own Bridge IDs (namespace 17) are the
design's CH-17xxx error and log codes the server actions already write,
registered in `docs/clubhouse/catalog/practice.md` (plan D12); PAGE.md maps
them to the catalog rows. `clubhouse:check` holds this file to the registry.

Status: partial. A category marked N/A below means no Practice row is minted
in it yet, not that Practice has no such behaviour; the loading, offline and
permission categories are defined through the shell.

## 01 — Default / core UI

Status: N/A — no Practice row is minted in this category yet; see PAGE.md,

"Rows the catalog does not have yet", for behaviour that has tests and no code

## 02 — Initial loading / skeleton

Status: DEFINED

Loading uses the shell's skeleton and `useBusy` contracts; Practice has
`PracticeLoading` and `PracticeSkeletons` but no catalog row of its own.

From the shell (P001): 10201 CH-1401, 10202 CH-1402.

## 03 — Background loading / refresh

Status: N/A — no Practice row is minted in this category yet; see PAGE.md,

"Rows the catalog does not have yet", for behaviour that has tests and no code

## 04 — Empty

Status: DEFINED

Practice's empty states are catalogued under P013 (their rows are the
"Practice:" rows of `catalog/coachhelm.md`), so the IDs are named here, not
minted here:

- 130436 (CH-13395): New plan, and someone with no team
- 130437 (CH-13396): a coach's first plan, or no practice this week
- 130438 (CH-13397): a player with nothing published

## 05 — Validation

Status: DEFINED

- 130502 (CH-13180): a drill runs past its turn (a warning, never a block)
- 130503 (CH-13181): an all-day practice in New plan (the design's validation
  codes that have no row are in PAGE.md)

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 170501 | CH-17101 | `A_GROUP_IS_AT_TWO_STATIONS_IN` | A group is at two stations in one turn |
| 170502 | CH-17102 | `A_COACH_IS_IN_TWO_PLACES_AT` | A coach is in two places at once |
| 170503 | CH-17103 | `A_BLOCK_HAS_MORE_GROUPS_THAN_STATIONS` | A block has more groups than stations |
| 170504 | CH-17104 | `A_BLOCK_USES_A_GROUP_WITH_NO` | A block uses a group with no players |
| 170505 | CH-17109 | `A_PLAN_IS_OVER_ITS_LIMITS` | A plan is over its limits |
| 170506 | CH-17110 | `AN_ALL_DAY_PRACTICE_GETS_A_PLAN` | An all-day practice gets a plan |
| 170507 | CH-17112 | `A_DRILLS_FIELDS_ARE_NOT_VALID` | A drill's fields are not valid |
| 170508 | CH-17113 | `A_SAVED_GROUPS_NAME_OR_SIZE_IS` | A saved group's name or size is not valid |
| 170509 | CH-17114 | `A_COURSE_BLOCK_HAS_NO_HOLES` | A Course block has no holes |
| 170510 | CH-17115 | `PUBLISHING_IS_HELD_BY_PROBLEMS_IN_THE` | Publishing is held by problems in the plan |
| 170511 | CH-17116 | `AN_EMPTY_PLAN_IS_PUBLISHED` | An empty plan is published |
| 170512 | CH-17117 | `A_CANCELLED_PRACTICES_PLAN_IS_PUBLISHED` | A cancelled practice's plan is published |

## 06 — Server / system error

Status: DEFINED

Named from P013's block:

- 130645 (CH-13080): three saves in a row failed
- 130646 (CH-13081): publish went through, or a refusal reopens the confirm
- 130647 (CH-13082): Delete draft refused
- 130648 (CH-13083): a new drill saved
- 130649 (CH-13084): offline while editing
- 130691 (CH-13286): one part of a page does not load
- 130607 (CH-13204): a section crashes while drawing (Practice's boundaries
  are `practice.*`)

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 170601 | CH-17001 | `A_PLAN_SAVE_FAILS` | A plan save fails |
| 170602 | CH-17002 | `PUBLISHING_A_PLAN_FAILS` | Publishing a plan fails |
| 170603 | CH-17003 | `REPUBLISHING_A_PLAN_FAILS` | Republishing a plan fails |
| 170604 | CH-17004 | `TAKING_A_PLAN_DOWN_FAILS` | Taking a plan down fails |
| 170605 | CH-17006 | `SAVING_OR_COPYING_A_DRILL_FAILS` | Saving or copying a drill fails |
| 170606 | CH-17008 | `DELETING_A_PLAN_FAILS` | Deleting a plan fails |
| 170607 | CH-17009 | `CREATING_A_MAKE_UP_FAILS` | Creating a make-up fails |
| 170608 | CH-17014 | `THE_PLAN_CARD_DOES_NOT_POST_TO` | The plan card does not post to team chat after a publish |
| 170609 | CH-17201 | `A_PLAN_CANNOT_BE_READ` | A plan cannot be read |

## 07 — Network / offline

Status: DEFINED

Offline and slow saves are the shell's; the builder's own offline line is the
row named under 06.

From the shell (P001): 10701 CH-1901, 10702 CH-1902, 10703 CH-1903,
10704 CH-1905, 10705 CH-1909, 10706 CH-1910, 10790 CH-1990, 10791 CH-1991.

## 08 — Permission / authorization

Status: DEFINED

A player on a coach address is redirected (PAGE.md, Addresses); no catalog row
names it yet.

From the shell (P001): 10801 CLUBHOUSE_GATE, 10802 ROLE_SCOPED_NAV,
10803 TEAM_SWITCH_IS_A_HEAD_COACHS, 10804 CH-1911.

## 09 — Success

Status: N/A — no Practice row is minted in this category yet; see PAGE.md,

"Rows the catalog does not have yet", for behaviour that has tests and no code

## 10 — Warning

Status: DEFINED

The plan's two warnings, from `validatePlan` (`src/lib/coachhelm/v3/practice-plan/model.ts`): they show on the plan and never hold a publish.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 171001 | CH-17105 | `A_PLAYER_IS_IN_NO_GROUP` | A player is in no group |
| 171002 | CH-17106 | `THE_PLAN_RUNS_PAST_THE_END_OF` | The plan runs past the end of practice |

## 11 — Destructive

Status: DEFINED

- 131101 (CH-13580): another coach saved first (stale save)
- 131102 (CH-13581): a block deleted, with Undo
- 131103 (CH-13582): Split evenly replacing groups

## 12 — State preservation

Status: N/A — no Practice row is minted in this category yet; see PAGE.md,

"Rows the catalog does not have yet", for behaviour that has tests and no code

## 13 — Optimistic UI

Status: N/A — no Practice row is minted in this category yet; see PAGE.md,

"Rows the catalog does not have yet", for behaviour that has tests and no code

## 14 — Retry / recovery

Status: N/A — no Practice row is minted in this category yet; see PAGE.md,

"Rows the catalog does not have yet", for behaviour that has tests and no code

## 15 — Data freshness / sync

Status: DEFINED

Another coach saved the plan first: the save is refused as stale and the builder offers Load latest (the screen row is P013's CH-13580, same copy).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 171501 | CH-17505 | `ANOTHER_COACH_SAVED_THE_PLAN_FIRST` | Another coach saved the plan first |

## 16 — Micro animation

Status: N/A — no Practice row is minted in this category yet; see PAGE.md,

"Rows the catalog does not have yet", for behaviour that has tests and no code

## 17 — Haptic

Status: N/A — no Practice row is minted in this category yet; see PAGE.md,

"Rows the catalog does not have yet", for behaviour that has tests and no code

## 18 — Accessibility

Status: DEFINED

- 131822 (CH-13895): a block's sheet on a phone, or Swap
- 131823 (CH-13896): the time ribbon changes

## 19 — Responsive layout

Status: N/A — no Practice row is minted in this category yet; see PAGE.md,

"Rows the catalog does not have yet", for behaviour that has tests and no code

## 20 — Keyboard / input

Status: N/A — no Practice row is minted in this category yet; see PAGE.md,

"Rows the catalog does not have yet", for behaviour that has tests and no code

## 21 — Performance

Status: N/A — no Practice row is minted in this category yet; see PAGE.md,

"Rows the catalog does not have yet", for behaviour that has tests and no code

## 22 — Analytics

Status: N/A — no Practice row is minted in this category yet; see PAGE.md,

"Rows the catalog does not have yet", for behaviour that has tests and no code

## 23 — Logging / observability

Status: DEFINED

The publish fan-out (Home's plan line and the players' notifications) logs a warning as `practice.fanout` when it fails; nothing shows on screen.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 172301 | CH-17205 | `HOMES_PLAN_LINE_OR_THE_PLAYERS_NOTIFICATION` | Home's plan line or the players' notification fan-out fails |

## 24 — CI / automated test

Status: N/A — no Practice row is minted in this category yet; see PAGE.md,

"Rows the catalog does not have yet", for behaviour that has tests and no code

## 25 — Helm Bridge action

Status: N/A — no Practice row is minted in this category yet; see PAGE.md,

"Rows the catalog does not have yet", for behaviour that has tests and no code
