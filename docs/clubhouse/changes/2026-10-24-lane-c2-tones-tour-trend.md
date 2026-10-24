# 2026-10-24 — Tones, the women's Tour, the phone team trend (Clubhouse A+ lane C2, logged by S2)

## 2026-10-24 — Better and worse tokens, the women's Tour named, the phone trend's axis and noise colour (lane C2)

```text
Design package: none (Clubhouse A+ phase 2, lane C2; merged in faa69f7c4)
PR/commit:      12d59b396, 1ee85e5c8, 95f6a61fb
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     rows 105 and 121 and Standing's window (owner decision I); row 107 was already done (formatSG at one decimal)
```

### Changed

- Row 48 (CONS-20): Stats' old tone words become `is-gain`/`is-loss` on the
  chart's gain and loss pair. The scoring form chart's "worse" side is now
  amber.
- Row 110: a women's team reads the women's Tour on Home's leg bench, the par
  tiles and the strokes gained zone.
- Row 69: the phone team trend draws its axis and is green or amber only past
  its noise.

### Why

- The A+ plan's rows lane C left; lane C2 restarted them and did not log them.

### Tests

- Named in each commit (`stats-team.test.tsx` for row 69, `tour-mark` and
  Home tests for row 110, `tone-vocabulary.test.ts` for row 48).
