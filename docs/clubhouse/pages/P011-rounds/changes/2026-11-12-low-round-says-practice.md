# 2026-11-12 — rounds

## 2026-11-12 — The low round says it leaves practice out (W30)

```text
Design package: none (preview walk fix, PREVIEW_ISSUES.md W30)
PR/commit:      agent/preview-fixes-f9
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     one team-average definition across Rounds, Stats and Roster (75.8 / 75.7 / 75.8) is a data and product call
```

### Changed

- On desktop, when the season has practice rounds, the Low round caption reads
  "Cole · −2 · no practice", as the
  Average caption already does. The phone keeps "Cole · −2"; its Average caption
  says "no practice".

### Why

- Nick's walk (W30): "Low round 70 (Cole −2)" sat over a 68 for Cole three rows
  down, a practice round, and nothing said
  practice was out.

### Verification

- `team-rounds-season.test.tsx` (expected caption updated); rounds suites 151
  files, 1060 tests, exit 0.
