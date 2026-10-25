# 2026-10-24 — Qualifiers: the board's header names its order

## 2026-10-24 — The header says full cards come first

```text
Design package: none (review of #2361, should-fix 3)
PR/commit:      agent/clubhouse-aplus-phase2
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     the selection workspace and confirm order (owner decision A)
```

### Changed

- A qualifier's desktop header reads "Full cards first, then total to par"
  where it said "Ranked by total to par", since decision 10 ranks a card a
  round short below every complete card.

### Why

- The header described an order the board no longer uses.
- The selection workspace (`rankCandidates`) still ranks by to par alone, so
  the confirmed squad can differ from the board when cards differ in length.
  Changing it is owner decision A (Fairway and the workspace), held.

### Verification

- `npx vitest run src/clubhouse/__tests__/qualifiers.test.tsx`.
