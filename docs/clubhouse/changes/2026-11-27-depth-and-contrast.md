# 2026-11-27 — depth and contrast

## 2026-11-27 — Cards lift, night cards cast, and the scoring mix and control edges hold 3:1

```text
Design package: none; Nick's ask (27 Nov 2026): "more depth more modern premium look", "color contrast has been an issue"
PR/commit: branch clubhouse-depth-contrast (local, not pushed)
Contract IDs: none changed
Actions: none changed
Data impact: none
Held items: night primary button fill (2.64:1 on the night card, its label 4.98:1); before and after pictures still owed
```

### Changed

- `--ch-elevation-card` (day): the same ring and two soft layers, set to read.
  The contact shadow is 0.07 (was 0.05), and the ambient fall drops 6px with a
  16px blur and a -6px spread at 0.14 (was 4px, 12px, -4px at 0.08), so a card
  lifts off the linen below its edge and never hazes the page beside it.
  `--ch-elevation-cast` carries the same two drops.
- `--ch-elevation-card` (night): the ring plus the same two layers in black
  (0.28 and 0.44). The night card was ring only. It is lighter than its page,
  and now it casts as well, so the step reads by tone and by shadow.
- `--ch-elevation-raised`: kept a clear step above the deeper card, by day
  (0.08 contact, 0.22 over 36px) and at night (a 0.36 contact layer added under
  the 0.6 fall).
- `--ch-medallion-shadow`: the page empty's green tile casts a little deeper
  (0.22 and 0.36), still one quiet green cast.
- New `--ch-icon-well-edge`, the card's ring inset. The shell's tinted icon
  wells (More list on a desk, team switcher) wear it: the well was 1.07:1 on the
  card and read as a smudge. On the phone the More list's bare glyphs stay bare.
- `--ch-chart-bogey` (day) is #a87d40, was #b3884a: 3.46:1 on the card (was
  3.00:1). Its numeral in ink-950 holds 5.0:1.
- The scoring mix's par segment is edged in `--ch-border-control` (3.6:1 on the
  card by day and at night), not the ledger hairline (1.3:1).
- `--ch-border-control` (day) is #7d7972, was #85817a: 3.38:1 on the page (was
  3.02:1) and 4.04:1 on the card.

### Why

- Depth: Apple's HIG keeps elevated surfaces distinct (Dark Mode: base and
  elevated backgrounds), and layered key and ambient shadows read as depth
  without haze (Fluent 2 elevation; Josh Comeau, "Designing beautiful
  shadows"). Three elevations still: flat, card, raised. No lit inset rim, no
  third ambient layer.
- Contrast: WCAG 2.2 SC 1.4.11 asks 3:1 for graph marks and control
  boundaries. The three that sat at 3.0 now have room, and the par segment's
  edge meets it.

### Verification

- Unit: `src/clubhouse/styles/__tests__/depth.test.ts` (card and cast by day and
  night, raised above card, icon well edge) and
  `src/clubhouse/styles/__tests__/chart-mark-contrast.test.ts` (bogey, par
  edge, control border). Design-language token tables regenerated.
- `src/clubhouse/__tests__/hairlines.test.ts`: stats.css's full-pixel separator
  allowance falls from 2 to 1 (the par edge is a segment boundary, not a ledger
  hairline).
- Screenshots: not taken. The cloud computer's network blocks Playwright's
  browser download, and the Vercel Sandbox refused to start (the account has no
  permission to create one). Shoot with `npm run clubhouse:shots` before merging.
