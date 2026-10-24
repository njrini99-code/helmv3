# 2026-10-24 — Owner decisions: phone gutter, hairlines, button corners

## 2026-10-24 — One phone gutter, darker hairlines, button corners kept (decisions 5 to 7)

```text
Design package: none (owner decisions 2026-10-24: 5 phone gutter, OQ-63 / B2;
  6 hairlines, B3; 7 button radii, OQ-59)
PR/commit: feat/decisions-layout (bed382646, b72eed28e, fea5eeee5)
Contract IDs: none
Actions: none
Data impact: none
Held items: a real-iPhone pass for the hairlines (the owner asked to confirm
  them on a phone); the phone top bar and section strip keep their 16px
  inset, so on a large phone the bar's title sits 4px outside the page edge;
  hairlines written as literal rgb() (CoachHelm's dive and board) are not on
  the token yet
```

### Changed

- `--ch-page-x-phone` is the one phone gutter: 16px, and 20px from 414pt
  wide (Plus and Pro Max), set once in `tokens.css`. It was 20px on the
  CONS-34 roots and 16 on Home and Stats.
- Every phone page's side edge takes it, including the ones CONS-34 left
  out: phone Stats (player and team), Home (the board, its hero and body,
  the first run, no team, and its skeleton), round setup and recovery,
  CoachHelm's top-level phone rule, Messages (the page, its skeleton, the To
  line and the announcement), Ask and the dive's pushed screen.
- The full-bleed pieces that ran out by a hard 20px follow it: Team Hub's
  tabs, CoachHelm's player list and view chips, the round review's
  scorecard, the stats game nav, and setup's band and start dock. At 16px
  they would have run 4px past the screen.
- `--ch-border-hairline` is 0.10 in light (was 0.07) and 0.12 at night (was
  0.08). Increase Contrast keeps its own stronger line.
- Button sizes keep their corners: sm 8 and lg 12 (CONS-4 had moved them to
  7 and 14 on the radius scale). The default size stays on `--ch-radius-md`.

### Why

- Phone side margins changed between sections (16 on Home and Stats, 20
  elsewhere); the owner settled one gutter as iOS draws it.
- At half a pixel on a Retina screen the 0.07 line was hard to see.

### Verification

- `page-spacing.test.ts`: the token's 16 and 20 values, every phone page edge
  on it (each rule for the selector, so an overridden one cannot keep a raw
  edge), and every full-bleed piece out and back by it.
- `contrast-tokens.test.ts`: the hairline alphas; over the page and a card
  the line is 1.22:1 in light (was 1.15) and 1.34 to 1.38:1 at night (was
  1.20 to 1.23); Increase Contrast stays stronger. A separator is decoration
  (WCAG 1.4.11 asks no 3:1 of it).
- `radii-hairlines.test.ts`: sm 8px, lg 12px, default on the md token.
- Not checked in a browser or on a device: no dev server in this pass.
