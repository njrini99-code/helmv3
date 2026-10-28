# 2026-10-28 — Qualifiers: Confirm squad follows the board

## 2026-10-28 — Manage selections and Confirm squad rank as the board does

```text
Design package: none (wiring review 2026-10-27, item 2; owner decision A: "Match the board")
PR/commit:      fix/clubhouse-badge-and-confirm-order
Contract IDs:   none
Actions:        ACT-P009-CONFIRM-SQUAD; the tie choice (chooseQualifierTiePlace)
Data impact:    which players confirm writes as top_score, when cards differ in length
Held items:     none
```

### Changed

- Manage selections, the tie choice at the cut and Confirm squad read the
  selection workspace in the board's order: a card a round short ranks
  below every full card, then to par, strokes, more rounds, name. Players
  are level at the cut only inside one group, as on the board.
- The order is one function, `boardOrder` in
  `src/lib/coachhelm/v3/qualifying/ranking.ts`. The board (`model.ts`)
  sorts with it, and the loader uses it when asked for `order: 'board'`.
- Clubhouse passes the order: `loadQualifierSelection` to the loader, and
  `writes.ts` to `chooseQualifierTiePlace` and `confirmQualifierSelection`.
  The server actions read anything but `'board'` as the plain order.

### Why

- The board and "You vs the line" put a short card below the full cards
  (owner decision 10). Manage selections and Confirm ranked by score alone,
  so Confirm could give a place to a player the board showed outside the
  line, and the reverse.
- Fairway's workspace calls the same loader and actions without an order,
  so Fairway's ranking, tie and confirm do not change.

### Verification

- `qualifying-board-order.test.ts`: a short card with a lower total ranks
  below the full cards in Manage selections and Confirm; confirm writes the
  board's squad; the order, the places on score and the tie at the cut match
  `buildBoard` on 300 generated boards; without an order, score order as
  before.
- `standings-parity.test.tsx`: the workspace in the board's order equals the
  Clubhouse board on order and the cut, through the real loaders.
