# 2026-11-12 — stats (team)

## 2026-11-12 — The scoring chip says "No clear change" by Home's rule

```text
Design package: none (owner's preview walk, 11 Nov 2026)
PR/commit:      agent/preview-fixes-ui
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The Scoring average chip on the redesign's summary card drew an arrow and
  "0.8 lower than the 10 before" for any change, and only its tint followed the
  standard error. Home and the desk hero say "No clear change" under that error.
  Now the chip follows the same rule (`deltaTone`): under the error it shows the
  signed number with no arrow, followed by "No clear change vs previous 10". The
  arrow and "lower than the 10 before" appear only once the change is clear.
  One helper (`scoreChangeChip`) serves this chip and My stats (P005).

### Why

- Preview walk W27: Home said "−0.8 No clear change vs previous 10" while Stats
  said "↓ 0.8 lower than the 10 before" for the same figure.
- Still open: if the two pages also differ in tint (green on one, grey on the
  other), their round lists differ. Home reads 18-hole rounds only; Stats counts
  a 9-hole round as half. That is recorded in the issue list, not changed here.

### Verification

- `screens/stats/__tests__/score-change-chip.test.ts` (4 cases). The Stats and
  Home suites: 82 files, 982 passed.
