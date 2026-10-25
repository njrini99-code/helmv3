# 2026-10-24 — Qualifiers: the viewer card names the place

## 2026-10-24 — "You vs the line" opens on "Place 3", not a bare "3"

```text
Design package: none (Clubhouse A+ Round 3 review shots)
PR/commit:      agent/aplus-s3b
Contract IDs:   CH-09908
Actions:        none
Data impact:    none
Held items:     the phone board's column head at 390px (see Why)
```

### Changed

- The card's own line reads "Place 3" (or "Place T3") before the to-par plate
  and the rounds in, as the board's Pos column names it. Same weight and size.

### Why

- The shots showed "3 +4": the position had no label.
- The phone board's two-line "To par / Total" head is not sticky in the CSS
  (`.ch-qfm-lbhead` has no position, height or overflow); it scrolls under the
  phone bar with the page, so nothing in it is clipped by a bad offset. Making
  it stick is a layout change, so it waits for the owner and a device look.

### Verification

- qualifiers.test › CH-09908: the card's place reads "Place" and the board's
  position label.
