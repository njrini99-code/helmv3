# 2026-11-15 — roster

## 2026-11-15 — Rounds count nine-hole rounds; a player opens Stats on the season the Roster ranks

```text
Design package: none (launch readiness 2026-11-15, DF-C-05 P1 and DF-C-19 P2; Batch 3)
PR/commit:      claude/project-thread-vledif
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only)
Held items:     none
```

### Changed

- `data/roster.ts`: `roundsAll` is now the rounds this season that count toward a score, of either length (a nine-hole round is a
  round). Before, it counted only eighteen-hole rounds and included practice. `rounds` stays the eighteens the average, form, early
  floor and place read.
- Recent rounds lists the newest rounds of either length. A nine says "9 holes" beside its date.
- `screens/roster/format.ts` adds `roundsPlayed`. The desktop Rds cell, the CSV's Rounds column, the peek's Rounds figure and the
  Rounds sort all read it.
- The row note reads "Early read · 2 rounds and 2 nines", or "Early read · 2 nine-hole rounds", and never "No rounds this season" for
  a player who posted nines.
- The profile's "All N" opens Stats on This season with both lengths (`holes=all`), the list it counts.
- DF-C-19: the Roster's average, place and team average are the season's. Each Roster link to a player's Stats (desktop row and
  menu, peek, phone) now opens on This season (`window=season`), where the hero prints the same average. Before, they opened on
  Last 10, a different window and a different number.

### Why

- DF-C-05: a player whose season was nines read "No rounds this season", and the profile's count dropped them.
- DF-C-19: the coach clicked 74.3 on the Roster and landed on 73.1, because Stats opened on another window.

### Screenshots

- None taken in this change. The layout is unchanged. A nine-hole round's date line gains "· 9 holes", and the count cells show the
  larger count.

### Verification

- `data/__tests__/roster-nines.test.ts`: two eighteens, two nines and a practice round (count 4, average 75 from the eighteens, row
  note, Rounds order); a nines-only player; Recent rounds with a nine first.
- The 29 Roster suites, including `roster.test.tsx` (the "All N" link now carries `holes=all`).
- Not checked in a browser or on a device in this change.
