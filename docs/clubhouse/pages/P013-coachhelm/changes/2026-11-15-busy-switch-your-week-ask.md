# 2026-11-15 — coachhelm

## 2026-11-15 — Switches dim after 150 ms; Your week and Ask use the switch

```text
Design package: MOTION-AND-VISUAL.md 3.9 and 3.12; production audit 2026-11-15 P1-56 (GAP-H-06), P1-57 (GAP-H-07), H393-063
PR/commit:      claude/project-thread-10vtd2 (ef4a75307, 277108145)
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Every view switch (Board, Team, Ask, Your week, Standing, Deep dive) and Ask's
  chat switch: the strip moves and taps stop on the tap (`aria-busy`); the dim
  (`data-ch-busy='skeleton'`) comes only once the switch has taken 150 ms and
  holds at least 300 ms (`use-view-switch.ts` `busy`, `lib/use-busy.ts`). The
  landing view's settle starts from the opacity the dim had reached, full before
  150 ms.
- Your week (P1-56): spreads the switch's settle and gets the same busy rule on
  its cards (`coachhelm-file.css`); it had `aria-busy` with no dim and no
  settle.
- The player's Ask tab (P1-57): goes through `useViewSwitch` on Your week, the
  views' frame and Ask itself, so it takes the selection on the tap and the page
  dims as for any view. It was a plain `router.push` with no pending state.
- The Team board's and Your week's skeletons are static (no sheen; H393-063).
  The board's busy rules exclude the strip by its `data-ch-strip` marker, now on
  the phone chip row too.

### Why

- 3.9: no dim for a wait under 150 ms and no flash. The player's Ask and Your
  week were the two switches outside the shared pattern.

### Verification

- vitest: view-switch-boundary (dimmedAt pinned to the delay), sub-tabs (Ask
  through the owner's switch), coachhelm-ask, coachhelm-views, coachhelm,
  player-file, team-sweep, chips-tabs, motion gate tests; `tsgo` clean. Engine
  tier for feel: D owed. The CoachHelm to Ask timing (761 to 918 ms, Chromium 4x
  CPU) was not re-measured.
