# 2026-11-15 — roster

## 2026-11-15 — Needs a look flags the players with no round this season

```text
Design package: none (launch readiness 2026-11-15, DF-C-04 P1; Batch 4)
PR/commit:      claude/project-thread-vledif-pa-data-23
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only)
Held items:     none
```

### Changed

- `data/roster.ts` reads Home's count (`quietOf`) from the year's counted rounds for each player, and passes it to `attentionFor`.
- A player with no counted round in the year reads "No rounds this season" in Needs a look once the season, or their time on the
  team, is a week old. A player whose last round was a nine or before the season reads "No rounds in N days" from that round.

### Why

- DF-C-04: Roster counted quiet days only from a round this season, so the quietest players, with none, were never flagged, and Home
  and Roster could disagree about a player whose last round was a nine.

### Screenshots

- None. The layout is unchanged; Needs a look lists more players.

### Verification

- `data/__tests__/quiet-players-named.test.ts`: five players (posting this week, none this season, last in May, nines only, joined
  three days ago). It fails on the old code.
- Not checked in a browser or on a device in this change.
