# Shared — 2026-11-13

## 2026-11-13 — SG window in words; empty Practice day is NO_DATA

```text
Design package: none (audit 2026-11-13, F-0005 and F-0026)
PR/commit:      agent/ch-look-data-honesty
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- `lib/sg-window-line.ts`: `sgWindowLine` ("Last 8 · Jun–Jul", both years when
  the window crosses one) and `sgWindowSpoken`, client-safe; the window is found
  server-side in `data/sg-window.ts`. Roster draws it (P003).
- `screens/practice/PracticeHome.tsx` (no page manifest): a day with no practice
  draws the shared no-data mark `NO_DATA` ("—") in place of an en dash; a reader
  still hears "No practice".

### Why

- F-0005: a strokes gained figure beside a season figure names its own window.
- F-0026: one glyph for "nothing here" across Clubhouse.

### Verification

- `src/clubhouse/data/__tests__/sg-window.test.ts`,
  `src/clubhouse/screens/practice/__tests__/week-strip-no-data.test.tsx` (RED,
  then GREEN).
- No screenshots: no browser in this slice (lead's instruction).
