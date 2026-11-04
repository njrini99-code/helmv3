# 2026-11-03 — My stats phone: summary and details behind the lane's flag

## 2026-11-03 — PR 4b (clubhouse_stats_redesign_v1, off)

```text
Design package: design-refresh/stats-home/ (PR 4b)
PR/commit:      agent/stats-pr4b-summary
Contract IDs:   as today's phone Stats
Actions:        none new
Data impact:    none; figures read the existing loader
Held items:     none
```

### Changed

- StatsPlayer picks StatsPlayerPhoneShs on a phone with the flag on; StatsPlayerPhone stays for the flag off. GameDetail gains `asDetail`, drawing a section as a pushed detail's body with every panel kept.

### Verification

- stats-summary-figures.test.ts and mini-rails.test.tsx (new). Not run yet: the owner deferred testing to the end of the build.
