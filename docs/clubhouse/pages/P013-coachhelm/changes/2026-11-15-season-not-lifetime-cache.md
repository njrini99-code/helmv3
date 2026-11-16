# 2026-11-15 — coachhelm

## 2026-11-15 — Standing's scoring and category SG are this season's

```text
Design package: none (stats and charts audit 2026-11-15, SC-01, Part 4)
PR/commit:      claude/project-thread-vledif
Contract IDs:   none added or reworded
Actions:        getThemesForPlayer / getThemesForCoach take this season's strokes gained by category (`opts.sg`)
Data impact:    none (reads only)
Held items:     the SQL fix is the held OD-01 chain plus 20260928150000, the owner's to apply
```

### Changed

- `data/season-figures.ts` (new): a player's figures over this season as Stats
  counts them (practice out, test rounds never, a nine
  at half a round, greens and putts from each round's stats row), with the
  window's label, and the season's strokes gained by
  category; the team's clock (`loadPlayerTeamZone`, which Standing now shares).
- Standing: the scoring average every projection starts from is this season's,
  and the hero says so ("Scoring average 78.0 this
  season, 6 rounds" beside all-time rows; under the season's rows it names its
  rounds only when they differ from the count already
  said). Under five rounds this season it is an early read ("3 rounds this
  season"). The putt-band and sand attempts a round stay the
  cache row's, the row the generators size the same projections from, so a
  projection still matches its insight card.
- Deep dive and the team board: the themes grade a part of the round as a leak
  or a strength on this season's strokes gained, read
  in Clubhouse and handed to the themes action (`opts.sg`); the action no longer
  reads `golf_player_stats_cache`. The team board takes
  them from the rounds it already has, with no read per player. A season that
  does not read leaves the themes without strokes gained.

### Why

- Production still runs the old `update_player_stats_complete`: test and
  total-only rounds sit in the putts denominator, and a test
  round's 37 is Cole B's best round. Every Clubhouse-reachable reader of that
  row now reads the season.

### Not changed

- `src/app/golf/actions/coachhelm-data.ts:412` (the z-scores):
  `getPlayerProfile` has no live caller (Fairway retired; only the admin
  page names it in a comment), so nothing a user sees reads it.

### Verification

- `data/__tests__/season-figures.test.ts` over the golden rounds G1 to G4: putts
  31.33 a round, greens 14 of 27, G4 (and its +34.51)
  never counted, the label, equal to Ask's figures for the same window, failing
  as a whole without stats rows.
- Standing loader cases (the season's 78.0 over the cache's 74.1; an early read
  at 3 rounds; a season that fails), the themes action
  (handed SG, dropped non-numbers), the Deep dive and coach reads.
- Not checked in a browser or on a device in this change.
