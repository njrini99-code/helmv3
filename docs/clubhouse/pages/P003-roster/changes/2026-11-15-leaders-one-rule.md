# 2026-11-15 — roster

## 2026-11-15 — The leader cards and the list rank by one rule

```text
Design package: none (prod audit 2026-11-15, ROSTER-01, ROSTER-02, ROSTER-08, ROSTER-11)
PR/commit:      claude/project-thread-vledif
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only)
Held items:     none
```

### Changed

- `screens/roster/format.ts` `leaderPicks`: each card names a different player. Needs a look is chosen before Best last 3, so the
  player who needs a look is never taken by the heater card; the display order is unchanged.
- `screens/roster/sort.ts`: the Avg and SG orders rank by the cards' floor (three counting rounds): an early read sits after every
  ranked player, by its own figure, and a missing figure last.
- `screens/roster/RosterLeaders.tsx`: every card says its window under the figure (season, last 3 avg, SG a round). Needs a look's
  figure is strokes gained a round; its reason is words under the name, not the figure.
- `screens/roster/RosterPhoneCrh.tsx`: the row's handicap reads "Handicap 3.1" on the subline; under an early read's number, how many
  more rounds it needs to rank.

### Why

- The three cards all named Cole at 77.5 while the list put Mason first at 72.0 on one round. The cards and the list now share one
  floor and one order, and no player fills two cards.

### Verification

- `screens/roster/__tests__/leaders-one-rule.test.tsx`, `data/__tests__/needs-a-look.test.tsx`, the Roster suite.
- Not checked in a browser or on a device in this change.
