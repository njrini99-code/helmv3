# 2026-10-23 — Native canvas follows Clubhouse (Clubhouse A+ WP-8)

## 2026-10-23 — Launch screen, splash and native canvas in Clubhouse's colours (A15)

```text
Design package: none (Clubhouse A+ handoff, section 5, A15)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: ships only with a new app build (owner)
```

### Changed

- One switch, `config/native-canvas.json`, picks the app's native canvas:
  Fairway's `--fw-color-canvas` (#F2E6D2, #0D0F0D) or Clubhouse's phone
  `--ch-bg-page` (#EDE9DF, #111512). It is set to Clubhouse.
- `scripts/native-canvas.mjs` writes the active palette into the colour
  asset (renamed `AppCanvas`), the launch screen's fallback, the splash
  images, `capacitor.config.ts` and its generated iOS config, and Android's
  splash. Dry run by default; `--apply` writes; `--check` reports drift. To go
  back: `node scripts/native-canvas.mjs --set fairway --apply`, which
  restores the original splash images byte for byte.
- The Clubhouse splash images are the Fairway ones with the background (and
  the mark's anti-aliased edge) recoloured; the mark's own colours are kept.
- In the Clubhouse dashboard, an inline script hides the splash two frames
  after the server's page paints, through the native bridge, instead of
  after hydration. CapacitorProvider's hide stays as the fallback.
- The handoff's "cream flash in dark mode" was already fixed (dark splash
  image and a dark canvas existed); what remained was a step from Fairway's
  canvas to Clubhouse's page, light and dark. The handoff named the desktop
  light value; the app is phone width, so it uses the phone value.

### Why

- At launch and on overscroll, the app showed Fairway's canvas around
  Clubhouse's page.

### Verification

- `canvas-color-sync.test.ts` now pins each palette to its token, every
  native copy (including Android, newly) to the active palette, and runs the
  script's `--check`; it passes with either palette active. New
  `splash-hide.test.tsx`. Not done: an iOS build and a device cold launch in
  light and dark.
