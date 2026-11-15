# 2026-11-13 — stats (player)

## 2026-11-13 — Where tee shots finish is one row: Left, Center, Right

```text
Design package: none (owner, 12 Nov 2026: "there's only between left and
                right, not top or bottom")
PR/commit:      agent/tee-grid-one-row
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only; no stored value changes)
Held items:     none
```

### Changed

- Off the tee's "Where tee shots finish" draws one row, Left, Center and Right,
  each with its count and share, in place of the 3×3 grid. The logger records
  a tee shot's side only (`team-intelligence/normalize.ts`, "tee: left |
  right"), so the long and short rows always read 0.
- Every tee shot still counts once. A shot an older edit logged as short or
  long counts as center, and a diagonal as its side. Production held 2 such
  shots (short, April 2026) out of 16,619 tee shots on 12 Nov. The three
  shares add to 100 (largest remainder).
- The biggest cell keeps the highlight (Center, as before). The averages, the
  outcome tiles and the note "Shots with no direction logged count as center."
  are unchanged.
- Approaches keep the 3×3 grid: an approach records long and short.
- Fairway's edit-shot sheet offers Left and Right for a tee shot's miss
  direction, no longer Short and Long, matching the live logger.

### Tests

- `src/clubhouse/screens/stats/__tests__/tee-finish-sides.test.tsx`: one row
  of three cells, the fold, shares that add to 100, the highlight, and the
  approach grid's nine cells.
- `src/clubhouse/__tests__/stats-parity.test.tsx`: the panel's label now reads
  "by side".
