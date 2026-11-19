# 2026-11-15 — Sign up's phone pane is ivory paper

## 2026-11-15 — The phone pane paints the same ivory as the desktop pane

```text
Design package: none (owner, 2026-11-15: "Why is mobile gradient white and not the ivory")
PR/commit:      agent/phone-pane-ivory
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `onboard.css`, the phone block (`max-width: 820px`, or a short coarse
  screen): `.ch-ox-stage` now paints `var(--ch-ox-grain)` over
  `linear-gradient(170deg, rgb(250 248 241), rgb(245 241 231) 55%, rgb(241 236 223))`,
  the desktop pane's own background. It painted
  `linear-gradient(165deg, rgb(252 251 247), rgb(248 246 240))`.
- The dark theme's phone pane is unchanged.

### Why

- The handoff drew the phone pane as near-white glass over the course
  (`design/handoff/auth/src/ox.css`), which read as ivory. When #2180 made the
  pane opaque (P015 D1), the desktop pane became the ivory paper. The phone
  pane kept the near-white stops without the glass, so it read as white.
  PAGE.md and DESIGN.md call it "the ivory panel" on both sizes.

### Verification

- `src/clubhouse/__tests__/auth-phone-pane-ivory.test.ts`: it failed on the old
  rule, and passes now.
- WebKit (iPhone 17 Pro, 402x681), production's `/golf/signup`, before and
  after, logged in VERIFY.md. The after capture is production's page with the
  fixed rule injected. Not checked in real Safari or on the iPhone.
