# 2026-11-12 — calendar

## 2026-11-12 — Sources says "No class schedules added yet" instead of "for 0 players" (W45)

```text
Design package: none (preview walk fix, PREVIEW_ISSUES.md W45)
PR/commit:      agent/preview-fixes-f9
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     an Add link beside it (where classes are added is the player's Classes page, not the coach's)
```

### Changed

- The coach's side panel, Sources: with no class schedules on the calendar the
  line reads "No class schedules added yet".
  With some, it still reads "Class schedules for N players".

### Why

- Nick's walk (W45): "Class schedules for 0 players" read as broken.

### Verification

- `screens/calendar/__tests__/sources-no-classes.test.tsx`; calendar suites 6
  files, 215 tests, exit 0.
