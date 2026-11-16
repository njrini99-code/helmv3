# 2026-11-15 — home

## 2026-11-15 — Home's brief names the players longest without a round

```text
Design package: none (launch readiness 2026-11-15, DF-C-04 P1; Batch 4)
PR/commit:      claude/project-thread-vledif-pa-data-23
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only; the roster read adds `joined_at`)
Held items:     none
```

### Changed

- `screens/home/model.ts` adds `quietOf`, the one count of days without a
  counted round for Home and Roster. It counts from the
  newest counted round in the year's read (a nine, or one before the season). A
  player with none is quiet since the season started,
  or since they joined if that is later, and is marked `none`.
- `data/home.ts` takes each player's last round from the year's counted rounds
  (`roundsForFigures`), not only the season's, and reads
  `joined_at` with the roster. Players with no eighteen this season are passed
  to the brief with their count.
- `homeSubline` names an unposted player who has been quiet for 7 days or more,
  like any quiet player: "Ava hasn’t posted a round this
  season", or "Ben hasn’t posted a round in 179 days" when the last was before
  the season. With three or more, players with none are
  said as that ("3 players haven’t posted a round in 30+ days; Ava hasn’t posted
  one this season"), never as "the longest at" a count.
- An unposted player with no count, who joined less than a week ago, or who is
  out is still not named (HOME-S5).

### Why

- DF-C-04: the brief skipped exactly the players who had gone longest. A player
  with no eighteen this season had no count, so Home
  never named them, while a player with one quiet week was named.
- This revisits the 11 Nov owner pass (HOME-S5), which kept players with no
  rounds out of the brief. The PR asks the owner to confirm.

### Screenshots

- None. The layout is unchanged; the brief's sentence names more players.

### Verification

- `screens/home/__tests__/quiet-unposted.test.ts` (the count and every sentence)
  and `data/__tests__/quiet-players-named.test.ts`
  (Home's and Roster's loaders on one roster) fail on the old code.
- HOME-S5's own case (`home-owner-pass.test.tsx`, `logic.test.ts`) still passes
  unchanged.
- Not checked in a browser or on a device in this change.
