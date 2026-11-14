# P011 Rounds — 2026-11-13

## 2026-11-13 — One score: holes, else nines, else stored total

```text
Design package: none (audit 2026-11-13, F-0003)
PR/commit:      agent/ch-look-data-honesty
Contract IDs:   111501 (meaning and tests updated)
Actions:        none new
Data impact:    none (reads only; the stale stored totals are a follow-up repair)
Held items:     none
```

### Changed

- `data/round-scope.ts`: `roundTotals(row, holes?)`, the one rule for a round's
  score. A round with all its holes in hand, every one scored, reads its total
  and to-par from them; otherwise its nines (`withCanonicalRoundTotal`, written
  with the holes); otherwise the stored `total_score`. The holes correct a
  recorded score and never make one for a round with none recorded, which no
  list or season figure counts, so 110102 ("Score not recorded") holds.
- `data/round-review-shape.ts`: the review header takes `roundTotals` with the
  round's holes, so the header, Out and In and the card print one score even
  when the nines are missing.
- `data/course-glance.ts`: the course glance in round setup ("Last time 78")
  read the stored `total_score`; it now reads the same total as the course page.

### Why

- Audit F-0003: Dylan's 19 Jul round (4625ba2c) sums to 79 (Out 40, In 39, +7)
  while its stored `total_score` is 78. The review, the Rounds library, Team
  rounds and the season loaders already printed 79 (front plus back since PR
  #2110); of the Rounds shapes, the course glance was the one still printing 78.
- Not closed here (follow-ups): the stored totals stay stale until a repair and
  a trigger land (no database writes in this slice); Clubhouse readers outside
  this slice still read the raw `total_score`: `data/qualifiers.ts:231` with
  `screens/qualifiers/model.ts:74` (the board must move with the SQL selection
  workspace), `data/coachhelm-dive.ts:37,62`, `data/coachhelm-file.ts:143-145`;
  Fairway and SQL readers are untouched.

### Verification

- `src/clubhouse/data/__tests__/round-total-parity.test.ts` (RED on the glance
  and the review without nines, GREEN after); the page's own suites pass.
- No screenshots: no browser in this slice (lead's instruction).
