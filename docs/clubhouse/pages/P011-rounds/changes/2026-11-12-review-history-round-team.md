# 2026-11-12 — rounds

## 2026-11-12 — A round's review compares it with its own team's rounds

```text
Design package: none (owner's preview walk, 11 Nov 2026)
PR/commit:      agent/preview-fixes-ui
Contract IDs:   none reworded (P-7's record chips keep their rules)
Actions:        none
Data impact:    none (a read's team filter)
Held items:     none
```

### Changed

- A coach's review read the player's other rounds for the coach's current team.
  A coach of two
  teams opening a round posted for the other team compared it with the wrong
  team's rounds: on
  staging, a 37-putt round (the player's most this season among 17 rounds on its
  team) read "Ties
  fewest putts this season · 37" against the coach's team's 3 rounds (37, 38, 39
  putts). The history
  now reads the reviewed round's own team, then the coach's when the round has
  none
  (`historyTeam`, round-history.ts). A player still reads all their own rounds.

### Verification

- `data/__tests__/record-marks-putts-staging.test.ts` (new, staging's figures
  with ids and names
  replaced): the wrong team reproduces "Ties fewest putts this season · 37"; the
  round's own team
  gives no putts record; `historyTeam` picks the round's team, then the coach's,
  none for a player.
- Staging reads (read-only): the reviewed round's team holds 17 of the player's
  season rounds
  (putts 30 to 37), the coach's team 5 (37, 38, 39 and two blank).
