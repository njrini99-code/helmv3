# 2026-10-24 — Qualifiers: the phone board's Total and caption

## 2026-10-24 — The phone board shows Total and desktop's ranking sentence

```text
Design package: none (Clubhouse A+ handoff, section 0.4 Qualifiers: "The phone board drops Total and the tiebreak caption")
PR/commit:      agent/aplus-lane-d
Contract IDs:   P009-A1
Actions:        none
Data impact:    none
Held items:     decision 10 (complete cards rank first, row 115) is not built yet; RANK_RULE changes with it
```

### Changed

- Each phone row shows the round's total strokes under the to-par plate (the
  header reads "To par" over "Total"), and its VoiceOver label adds "N strokes".
- Desktop and phone share one caption (`boardCaption`, `RANK_RULE` in
  model.ts): "Ranked by total to par, then total strokes, then more rounds
  played. Top N qualify on score…", the order `compareStandings` sorts by. The
  phone had said only "Ranked by total to par".

### Why

- Strokes break a tie on to par, so the phone hid what decided a place.

### Verification

- qualifiers-premium.test › phone board (header, total, caption). Wants an iPhone
  look at 390px: the plate's column is 52px with the total under it.
