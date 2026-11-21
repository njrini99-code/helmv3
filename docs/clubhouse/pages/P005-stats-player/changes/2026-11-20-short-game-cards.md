# P005-stats-player — Changelog

## 2026-11-20 — Short game detail cards (look-09)

```text
Design package: Nick's request of 20 Nov (iPhone screenshot of Short game), DESIGN_LANGUAGE.md law 6 (picture first; on phone a chart or grouped list over a table)
PR/commit: claude/project-thread-jn6rm7
Contract IDs: none
Actions: none
Data impact: none (same GolfStats fields, no stat math changed)
Held items: none
```

### Changed

- Inside the pushed Short game detail (the Stats redesign), "Up and down by
  where the green was missed" is the page's grouped rows instead of a four
  column table: each miss direction has its rail, its rate, the makes behind
  it ("6 of 10") and its share of misses. A tick marks the player's own up and
  down rate over every chance ("All chances, 38%"); a rail at or above it is
  green, below it amber.
- "Finish after the chip" uses the same rows (figure with its unit, rail on
  the longest finish) instead of the older compare bars.
- The figure table ("Strokes to hole out from around the green") is redrawn:
  a quiet footnote header, 44pt rows on row hairlines, the "All lies" summary
  column as one rounded well with firmer figures, and the "All distances"
  total row in the figure weight under a firmer rule. Any detail table that
  passes `keyCol` or a `total` row gets the same drawing.
- Second pass (Nick: "more color and contrast while keeping the premium
  look"): the "All lies" well is the feature green band with ivory figures;
  each lie figure in the strokes table sits in a soft gain or loss chip
  (green fewer strokes than All lies at that distance, amber more, untoned
  within 0.05); the "Sand saves" and "Up and downs" tiles lead with the rate
  and keep the makes ("4 of 12") underneath; each "Finish after the chip" lie
  row is toned against the Overall finish (closer green, farther amber), and
  Overall stays grey as the yardstick.
- Option F (Nick, 21 Nov: "more contrast", then chose F on the card): in a
  pushed Game detail, the headline numbers ("Scoring numbers", "Approach
  numbers", "Short-game numbers", "Putting numbers") are the detail's one deep
  green feature card, ivory figures at the large-title size. Every other card
  opens on a deep green title bar over its ivory body. Labels, row names and
  table figures move to the heavier roles (figure, headline), secondary text
  is darker, rails are 14pt on a darker track, and a plain rail or compare bar
  (nothing to judge it against, such as "Up and down by distance" or the
  Overall finish) is near-black instead of grey or green. Only a card with a
  benchmark draws green and amber.
- On the desk at 1280 the detail is the 420pt pane beside the overview, so it
  takes the same one-column cards as the phone.
- A closed "More detail" (the older desktop Game detail) keeps its tables.
- Option F, slice 2 (Nick approved the rollout, 21 Nov): every shared Stats
  card (the overview cards on phone and desk, and the plain cards in a
  detail) opens on the deep green title bar, with its count and chevron in
  the feature inks and darker secondary text in the body. The overview keeps
  Scoring average as its one green card. In a detail, the green card moves to
  the top: "The figures" (or "Per round" in Scoring) is now the deep green
  card, right under the headline, and the four "numbers" panels take the
  title bar like the rest.
