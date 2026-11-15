# 2026-11-15 — home

## 2026-11-15 — Player Home: every figure names its window, strokes gained is the last 10

```text
Design package: none (prod audit 2026-11-15, PL-HOME-01, PL-HOME-02, PL-HOME-03, N13P-64)
PR/commit:      claude/project-thread-vledif
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only)
Held items:     none
```

### Changed

- `screens/home/PlayerGame.tsx`: strokes gained reads "Last 10, per round vs Tour" (it is the last ten counted rounds,
  `figure-window.ts`, QA-1), never "Season" or "this season", on the card, the desktop caption, the phone meta and each part's
  screen-reader text (PL-HOME-01, PL-HOME-03).
- The Scoring card's figures each say their window: the average "Last 5", with a clear change "Last 5 · −0.8 · Better than previous 5"
  and one inside its error "Last 5 · No clear change vs previous 5" (no signed figure); under par "In last 5" ("In last 5 with par
  recorded" when some rounds have no par); handicap "Index" (PL-HOME-02).
- `data/player-home.ts`, `data/figure-window.ts` `lastTenHoleRounds`: Your game's fairways, greens, putts and scrambling read the rounds
  with holes among the newest ten, as My stats' Last 10 does, never the newest ten that happen to have holes, which reached back past the
  ten (N13P-64: 42% against 43% fairways under the same "Last 10").

### Why

- The figure was computed from the last ten rounds and labelled the season's. One card held four windows and named none.

### Verification

- `screens/home/__tests__/player-game-windows.test.tsx` (new), `data/__tests__/last-ten-hole-rounds.test.ts` (new), `__tests__/home-consumer-truthfulness.test.tsx` (under par's words),
  the rest of the player Home suites.
- Not checked in a browser or on a device in this change.
