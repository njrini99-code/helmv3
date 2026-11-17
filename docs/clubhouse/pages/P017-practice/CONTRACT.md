# P017 — Practice: page contract

Every behaviour Practice promises, by the 25 V2 categories (D-69). Practice has
no catalog file of its own: its rows are the "Practice:" rows of
`docs/clubhouse/catalog/coachhelm.md`, numbered CH-13080 and up, so their Bridge
IDs belong to P013 and are named below rather than minted again (CH codes and
Bridge IDs are permanent). P017 owns no Bridge IDs yet; namespace 17 is
reserved. The design's own CH-17xxx error codes and their mapping to the
catalog rows are in PAGE.md. `clubhouse:check` holds this file to the registry.

Status: partial. A category marked N/A below means no Practice row is minted
in it yet, not that Practice has no such behaviour; the loading, offline and
permission categories are defined through the shell.

## 01 — Default / core UI

Status: N/A — no Practice row is minted in this category yet; see PAGE.md, "Rows the catalog does not have yet", for behaviour that has tests and no code

## 02 — Initial loading / skeleton

Status: DEFINED

Loading uses the shell's skeleton and `useBusy` contracts; Practice has `PracticeLoading` and `PracticeSkeletons` but no catalog row of its own.

From the shell (P001): 10201 CH-1401, 10202 CH-1402.

## 03 — Background loading / refresh

Status: N/A — no Practice row is minted in this category yet; see PAGE.md, "Rows the catalog does not have yet", for behaviour that has tests and no code

## 04 — Empty

Status: DEFINED

Practice's empty states are catalogued under P013 (their rows are the "Practice:" rows of `catalog/coachhelm.md`), so the IDs are named here, not minted here:

- 130436 (CH-13395): New plan, and someone with no team
- 130437 (CH-13396): a coach's first plan, or no practice this week
- 130438 (CH-13397): a player with nothing published

## 05 — Validation

Status: DEFINED

- 130502 (CH-13180): a drill runs past its turn (a warning, never a block)
- 130503 (CH-13181): an all-day practice in New plan (the design's validation codes that have no row are in PAGE.md)

## 06 — Server / system error

Status: DEFINED

Named from P013's block:

- 130645 (CH-13080): three saves in a row failed
- 130646 (CH-13081): publish went through, or a refusal reopens the confirm
- 130647 (CH-13082): Delete draft refused
- 130648 (CH-13083): a new drill saved
- 130649 (CH-13084): offline while editing
- 130691 (CH-13286): one part of a page does not load
- 130607 (CH-13204): a section crashes while drawing (Practice's boundaries are `practice.*`)

## 07 — Network / offline

Status: DEFINED

Offline and slow saves are the shell's; the builder's own offline line is the row named under 06.

From the shell (P001): 10701 CH-1901, 10702 CH-1902, 10703 CH-1903,
10704 CH-1905, 10705 CH-1909, 10706 CH-1910, 10790 CH-1990, 10791 CH-1991.

## 08 — Permission / authorization

Status: DEFINED

A player on a coach address is redirected (PAGE.md, Addresses); no catalog row names it yet.

From the shell (P001): 10801 CLUBHOUSE_GATE, 10802 ROLE_SCOPED_NAV,
10803 TEAM_SWITCH_IS_A_HEAD_COACHS, 10804 CH-1911.

## 09 — Success

Status: N/A — no Practice row is minted in this category yet; see PAGE.md, "Rows the catalog does not have yet", for behaviour that has tests and no code

## 10 — Warning

Status: N/A — no Practice row is minted in this category yet; see PAGE.md, "Rows the catalog does not have yet", for behaviour that has tests and no code

## 11 — Destructive

Status: DEFINED

- 131101 (CH-13580): another coach saved first (stale save)
- 131102 (CH-13581): a block deleted, with Undo
- 131103 (CH-13582): Split evenly replacing groups

## 12 — State preservation

Status: N/A — no Practice row is minted in this category yet; see PAGE.md, "Rows the catalog does not have yet", for behaviour that has tests and no code

## 13 — Optimistic UI

Status: N/A — no Practice row is minted in this category yet; see PAGE.md, "Rows the catalog does not have yet", for behaviour that has tests and no code

## 14 — Retry / recovery

Status: N/A — no Practice row is minted in this category yet; see PAGE.md, "Rows the catalog does not have yet", for behaviour that has tests and no code

## 15 — Data freshness / sync

Status: N/A — no Practice row is minted in this category yet; see PAGE.md, "Rows the catalog does not have yet", for behaviour that has tests and no code

## 16 — Micro animation

Status: N/A — no Practice row is minted in this category yet; see PAGE.md, "Rows the catalog does not have yet", for behaviour that has tests and no code

## 17 — Haptic

Status: N/A — no Practice row is minted in this category yet; see PAGE.md, "Rows the catalog does not have yet", for behaviour that has tests and no code

## 18 — Accessibility

Status: DEFINED

- 131822 (CH-13895): a block's sheet on a phone, or Swap
- 131823 (CH-13896): the time ribbon changes

## 19 — Responsive layout

Status: N/A — no Practice row is minted in this category yet; see PAGE.md, "Rows the catalog does not have yet", for behaviour that has tests and no code

## 20 — Keyboard / input

Status: N/A — no Practice row is minted in this category yet; see PAGE.md, "Rows the catalog does not have yet", for behaviour that has tests and no code

## 21 — Performance

Status: N/A — no Practice row is minted in this category yet; see PAGE.md, "Rows the catalog does not have yet", for behaviour that has tests and no code

## 22 — Analytics

Status: N/A — no Practice row is minted in this category yet; see PAGE.md, "Rows the catalog does not have yet", for behaviour that has tests and no code

## 23 — Logging / observability

Status: N/A — no Practice row is minted in this category yet; see PAGE.md, "Rows the catalog does not have yet", for behaviour that has tests and no code

## 24 — CI / automated test

Status: N/A — no Practice row is minted in this category yet; see PAGE.md, "Rows the catalog does not have yet", for behaviour that has tests and no code

## 25 — Helm Bridge action

Status: N/A — no Practice row is minted in this category yet; see PAGE.md, "Rows the catalog does not have yet", for behaviour that has tests and no code
