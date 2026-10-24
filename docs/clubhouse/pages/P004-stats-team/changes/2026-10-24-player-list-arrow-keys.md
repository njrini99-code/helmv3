# 2026-10-24 — Stats (team): arrow keys in the player list

## 2026-10-24 — Up and Down walk the players in "Where each player gains and loses"

```text
Design package: none (Clubhouse A+ Round 1, S3 item 3; B11, row 63 remainder)
PR/commit:      agent/aplus-s3
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The desktop player list (the strokes-gained-by-leg table, the one whose rows
  are fetched ahead on press, A13) walks with the arrow keys: Up and Down move
  between the players' name links, Home and End go to the ends, and the list is
  one Tab stop. `RovingRows` runs inside the `stats.team.legs` boundary and
  walks within `.ch-lg`, which stays put when a leg change swaps the table.
- The shortcuts sheet lists "Move between players" under "On Stats" (not on a
  phone), as Roster does.

### Why

- B11: the Stats player list was the last list without the arrow keys
  (docs/clubhouse/changes/2026-10-24-arrow-keys.md held it).
- Each leg figure's own link (it opens Game detail) stays a Tab stop; only the
  name links are walked.

### Verification

- screens/stats/__tests__/legs-keys.test.tsx: one Tab stop, Down, Up, End and
  Home move focus, and the sheet lists the keys.
