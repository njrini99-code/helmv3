# 2026-11-15 — coachhelm

## 2026-11-15 — Ask reads every catalogue metric over the asked window, none from the lifetime cache

```text
Design package: none (launch readiness 2026-11-15, DF-P-11; Batch 3)
PR/commit:      claude/project-thread-vledif
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only; one_putts added to the existing golf_round_stats_cache read)
Held items:     none
```

### Changed

- `lib/coachhelm/v3/chat/read-tools.ts`: `FIGURE_OF` maps every metric in the catalogue a round holds, so a team ranking, the
  team average and the place a comparison sets beside a player read scrambling, sand saves, one- and three-putts, penalties
  and score to par over the asked window too. Before, only greens, fairways, scoring, putts and strokes gained did, and the rest
  came from `golf_player_stats_cache` (lifetime, practice and test rounds included) beside a "last 10" figure.
- `PlayerFigures` carries those figures with the chances or holes behind each rate; a rate's method reads "pooled", a count's
  "per 18".
- `data/player-figures.ts` names them from `figure-window.ts` `figureSetOver`; `figure-window.ts` gains `onePutts` (per 18, from
  each round's stats row, only when its putts were recorded) and `stats-common.ts` reads `one_putts`.
- A one- or three-putt rate is the per-18 count over 18: a share of the holes in the rounds whose putts were recorded.

### Why

- DF-P-11: "Ask mixes last-10 and lifetime". A coach asking where a player ranks on scrambling over the last 10 rounds got the
  team's lifetime figures, and a team average labelled as the whole record next to a window figure.

### Verification

- `data/__tests__/ask-every-metric-window.test.ts`: the golden rounds G1 to G4 (G4 never counted), each new metric's rate and
  sample this season and at every length, and a ranking on each of the six that reads the window while the cache holds
  deliberately wrong lifetime values.
- `player-metrics-window`, `comparison-windows`, `registry-readers`, `player-figures-parity`, `figure-window`.
- Not checked in a browser or on a device in this change.
