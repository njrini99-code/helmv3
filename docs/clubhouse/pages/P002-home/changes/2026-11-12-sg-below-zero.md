# P002 Home — 2026-11-12

## 2026-11-12 — The team's game says once why its strokes gained sits below zero

```text
Design package: none (owner decision Q1, 12 Nov 2026)
PR/commit:      agent/preview-fixes
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- `screens/home/TeamLegs.tsx`: the desk head's line reads "Last 10 rounds ·
  strokes gained per round · the same rounds as the average above." then the
  shared sentence from `lib/sg.ts` (`sgBaseline(tour).why`), in place of "vs
  Tour". The phone card's footer ends with the same sentence, after its own
  line.

### Why

- Q1: keep the PGA Tour baseline and say what it means, once and quietly, so a
  coach does not read every negative as broken numbers. The sentence and where
  it goes: `docs/clubhouse/changes/2026-11-12-sg-below-zero.md`.

### Verification

- `src/clubhouse/lib/__tests__/sg-below-zero.test.ts`; the page's own suites
  pass unchanged.
