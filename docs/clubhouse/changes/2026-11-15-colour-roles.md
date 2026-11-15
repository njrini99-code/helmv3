## 2026-11-15 — Colour roles: red for errors only, under par in the gain (4.7)

```text
Design package: clubhouse-handoff/launch-readiness-2026-11-15/MOTION-AND-VISUAL.md (section 4.7); design-refresh/DESIGN_LANGUAGE.md §3
PR/commit: branch claude/project-thread-d9q2qs, its own commit so it can be dropped alone
Contract IDs: none changed
Actions: none changed
Data impact: none
Held items: over-par hole chips keep the scorecard's squares; champagne is not yet attention-only (see Not changed)
```

### Changed

- Under par is the gain. `--ch-score-under` reads `--ch-chart-gain` (`#0f5233`, 8.6:1 on the card; `#a9e0c0` at night), `--ch-score-under-bg` the gain tint and `--ch-score-under-fill` the gain fill (`#0b3a25` under an ivory numeral; the light mint under the deep green numeral at night). The hole map's under-par tints and ring are green (the ring 3.8:1 on the card). Every red under-par value in the stylesheets and screens now reads these tokens, and the red-only tokens (`--ch-feature-under`, `--ch-chip-flag-bg`, `--ch-feature-flag`, the refresh's under-par override, the dark eagle bead) are deleted.
- New: `--ch-score-birdie-fill` (the scoring mix and live beads: birdie a step lighter than eagle or better, 2.5:1 apart), `--ch-score-fill-ink` (the numeral on a filled mark), `--ch-stage-gain` (under par on the deep-green stage).
- Scorecard marks: birdie is a gain-tinted ring, eagle a solid gain disc; on a green scoreboard, the shot screen's hole strip and the round strip, under par is the feature gain's mint disc under the deep green numeral (7.0:1). The current hole's ivory chip carries the deep gain disc under the ivory numeral (8.0:1).
- Red now means an error or a destructive action; the pin flag and a penalty stake keep their red as drawn on the course. `RED_TOKENS` in `scripts/clubhouse/check.mjs` flags red anywhere else, and no longer accepts an under-par context.
- Comments and page docs that said "red means under par" now say what the code does.

### Not changed

- Over par: the hole map's tints were already amber; the scorecard's bogey and double squares stay ink, so the shape still carries over par.
- Champagne as attention only: `--ch-champagne-100` with `--ch-champagne-ink` is the documented attention pair, but champagne rules and gilt (about 130 reads) still dress other things.
- The class-year brick (`--ch-yr-fr`), the plan group's clay and the red tee box are identities, not data, and keep their colours.

### Why

- Nick's MOTION-AND-VISUAL.md (15 Nov), 4.7: "Red is for errors only (S2). This retires DESIGN_LANGUAGE's 'red means under par'."

### Verification

- Unit: check.mjs (red context), hole strip, score flow band, hole-map contrast, contrast tokens; the design-language tables now list the under-par, attention, flag and error tokens with their ratios.
- Before and after screenshots, phone 393 and desktop 1440, light and dark, Chromium (tier C), in the PR.
