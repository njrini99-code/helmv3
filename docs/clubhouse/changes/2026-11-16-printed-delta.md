# 2026-11-16 — format

## 2026-11-16 — A change rounded as it is printed

```text
Design package: none (launch readiness 2026-11-15, DF-C-15)
PR/commit:      claude/project-thread-vledif-pa-data-23
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `lib/format.ts`: `printedDelta` rounds a change to the digits it is
  printed at, with the rounding `formatSigned` uses and no negative zero.
  Stats Team's change chips read it.

### Why

- Display rounding goes through `lib/format` (CONS-15).

### Verification

- `data/__tests__/most-improved.test.ts` and
  `__tests__/display-rounding.test.ts`.
