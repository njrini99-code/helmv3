# 2026-11-15 — hub

## 2026-11-15 — Hub head and Waiting on count the rounds Home counts

```text
Design package: none (launch readiness 2026-11-15, DF-C-03 P1; Batch 4)
PR/commit:      claude/project-thread-vledif
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only)
Held items:     none
```

### Changed

- `data/hub.ts` `rosterPulse` counts the rounds Home's "days since a round" and
  Roster's count read (`roundsForFigures`): scoring rounds
  of either length, with practice out and a round with no type counted. Before,
  it counted every round type.
- The Hub head's rounds in 30 days and players active in 14, and each player's
  rounds in Home's Waiting on, read from it.

### Why

- DF-C-03: a player who only played practice read as active on the Hub and as
  quiet on Home and Roster.

### Screenshots

- None. The layout is unchanged; the counts leave practice rounds out.

### Verification

- `data/__tests__/hub-pulse-windows.test.ts`: a new case (an eighteen, a nine, a
  round with no type and a practice round) fails on
  the old code. The window case now uses scoring rounds.
- Not checked in a browser or on a device in this change.
