# 2026-11-12 — roster

## 2026-11-12 — The class split counts players with no class year (W23)

```text
Design package: none (preview walk fix, PREVIEW_ISSUES.md W23)
PR/commit:      agent/preview-fixes-f9
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The season card's class bar and legend add "N not set" for players whose class
  year is missing or past, drawn as a quiet
  segment (the legend's ink at 45%), so the split always adds up to the roster
  count above it.
- `format.ts` gains `classUnset`; `classMix` is unchanged.

### Why

- Nick's walk (W23): "8 active", while the class split added to 6.

### Verification

- `screens/roster/__tests__/class-mix-unset.test.tsx`: the count, the segment, a
  label that sums to the roster, and nothing
  drawn when every year is set. Roster suites: 9 + 8 files, all pass.
