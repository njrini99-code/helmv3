# 2026-11-03 — Coach Home: the redesign behind the lane's flag

## 2026-11-03 — PR 10: green hero, capsules, cards (clubhouse_classes_roster_home_v1, off)

```text
Design package: design-refresh/classes-roster-home/ (PR 10)
PR/commit:      agent/crh-pr10-home
Contract IDs:   as today's Home
Actions:        none new
Data impact:    none (practice rounds left out of Home's averages under the
                flag; yearById added under it)
Held items:     none
```

### Changed

- HomePhone, DayCard, TeamLegsPhone branch on the flag; home.css has one new
  block under `.ch-hm[data-ch-crh='on']`; the hero-mode bar is `--ch-frame`
  under the flag.

### Verification

- home-crh.test.ts (new). Not run yet: the owner deferred testing to the end of
  the build.
