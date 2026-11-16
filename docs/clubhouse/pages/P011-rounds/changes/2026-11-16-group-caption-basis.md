# 2026-11-16 — rounds

## 2026-11-16 — A month's caption says what its average is over

```text
Design package: none (launch readiness 2026-11-15, DF-C-14)
PR/commit:      claude/project-thread-vledif-pa-data-23
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only)
Held items:     none
```

### Changed

- `screens/rounds/TeamRounds.tsx`: a group heading on Team rounds reads
  "7 rounds · avg 72.7 over 3" when its average leaves out practice or
  nine-hole rounds. With every round in the average it reads as before.

### Why

- "7 rounds · avg 72.7" read as the average of seven rounds when it was
  the average of three.

### Verification

- `__tests__/team-rounds-group-caption.test.ts` and the updated
  `__tests__/team-rounds-season.test.tsx`. Not checked in a browser or on a
  device.
