# 2026-11-12 — rounds

## 2026-11-12 — The Tees column says only tees (W32)

```text
Design package: none (preview walk fix, PREVIEW_ISSUES.md W32)
PR/commit:      agent/preview-fixes-f9
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     R1/R2/R3 on event rounds: the team list carries no tournament round number (only qualifier_round_number
                on the row, not on ChTeamRound), so it needs a data change first
```

### Changed

- In the desktop table a round with no tee recorded shows the no-data dash under Tees instead of "18 holes". A
  nine-hole round keeps its "9 holes" chip with or without a tee. The phone row, which has no Tees header, is unchanged.

### Why

- Nick's walk (W32): qualifier rounds read "18 holes" under Tees.

### Verification

- `team-rounds-tees.test.tsx`; rounds suites 151 files, 1060 tests, exit 0.
