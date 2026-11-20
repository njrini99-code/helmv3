# Clubhouse shared — Changelog

## 2026-11-20 — Night contrast and gradients in cards (premium plan, batch 1)

```text
Design package: premium plan 2026-11-19, batch 1 (G2 to G10)
PR/commit: agent/clubhouse-night-contrast-b1
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- Wells are flat (G2, G2b; owner decision 3). `--ch-well-bg` and
  `--ch-well-soft-bg` are the old gradients' middle stops, in both
  themes. The week strip, the pager, the empty card and every
  Segmented track lose the tan gradient behind their text. The inset
  shadow keeps the recess.
- Night accent (G4, CON-2): `--ch-green-fill-500` and
  `--ch-accent-hover` go from #2a7d53 to #25734d. Ivory on a selected
  chip or a hovered primary goes from 4.10–4.40 to 4.98.
- No radial light on green (G5): the 17 mint and amber radial layers
  on the round heroes, the new-round band, the tracking hero, the
  auth hero and `--ch-board-bg` are removed.
- Literal gradients on keys and marks (G3 to G3d, M4):
  - The Home "Add" key's rules are deleted (no screen renders it).
  - Round detail's "Finish" key is the raised secondary key on
    tokens, with a night face.
  - The scorecard "Tot" cell is flat `--ch-champagne-100`.
  - The bogey square is flat `--ch-card-bg`.
  - The Round review score is solid on-green ink, not
    gradient-clipped text.
- New-round course icon on hover (G6) uses the dark-pinned fill
  (1.87 → 7+ at night).
- One tooltip ink plate (G7): `--ch-tip-bg`, `--ch-tip-ink` and
  `--ch-tip-ink-soft`, dark by day and light at night. They apply to
  the qualifier tip, the round-zones tip and the rail tip. The picked
  qualifier coin uses the pinned `--ch-on-champagne-ink`. Night
  ratios go from 1.0–1.9 to 13–14.
- Focus on green (G8): inside `.ch-surface--feature`,
  `.ch-scoreboard` and `[data-on-green]` the ring is the champagne
  `--ch-border-focus-on-dark`. One rule in `base.css`.
- Disabled primary at night (G9): `--ch-key-disabled-ink` (#a39e92,
  6.7:1 on the well) in place of ink-400 (4.26).
- Security: `scripts/gen-appstore-screenshots.mjs` no longer carries
  the demo account's sign-in as a default. It reads `SHOT_EMAIL` and
  `SHOT_PASSWORD` and exits without them.

### Why

- Premium plan 2026-11-19, section 2. These rows were real WCAG
  misses at night, or a gradient behind text inside a card, which
  DESIGN_LANGUAGE §10 bans.

### Not done here

- G10 (muted on-green inks on the raised top stop) is still to be
  measured in WebKit.
- T2 was already fixed on main.
