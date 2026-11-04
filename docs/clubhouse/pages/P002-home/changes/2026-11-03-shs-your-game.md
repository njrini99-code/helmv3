# 2026-11-03 — Player Home: Your game card and flat hero behind the Stats flag

## 2026-11-03 — PR 6 (clubhouse_stats_redesign_v1, off)

```text
Design package: design-refresh/stats-home/ (PR 6)
PR/commit:      agent/stats-pr6-home
Contract IDs:   none new; CH-2216 and CH-2311 keep their words
Actions:        none new
Data impact:    with the flag on, sparks read 10 rounds and Putting's count line
                sums recorded putts
Held items:     none
```

### Changed

- PlayerGame draws YourGameCard on a phone with the flag on, each leg a link to
  `#gm-<part>`. PlayerHomePhone sets `data-ch-hero-flat` and draws the greeting
  on flat `--ch-frame`.

### Verification

- your-game-card.test.tsx (new). Not run yet: the owner deferred testing to the
  end of the build.
