# 2026-10-22 — Motion pass: the fold, the dialog backdrop and section switches

## 2026-10-22 — Motion pass toward the Apple bar (mot-01, mot-02, mot-03)

```text
Design package: none (owner-approved motion pass, 2026-10-22)
PR/commit: branch claude/clubhouse-motion-apple-bar
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- mot-01: the desktop sidebar fold keeps its spring on the width, but marks itself
  moving (`lib/rail-fold.ts`, `data-ch-rail-moving` on `.ch-app`). The team trend
  chart, the CoachHelm trend evidence, the round zones' label size and Lenis's
  scroll limit read the new size once, when the fold settles, instead of on every
  frame. The brand panel drops its frost for those frames.
- mot-02: the desktop dialog backdrop (`.ch-modal`) and the peek backdrop
  (`.ch-peek`) are solid washes, a shade deeper, with no blur.
- mot-03: a tap on the phone's tab bar or a desktop sidebar item swaps the page at
  once (`data-ch-tab`, `lib/nav-motion.ts`, shell.css). Onto a route skeleton the
  old page still holds through the 300ms hold. Pushes, pops and every other link
  keep their motion; no duration token changed.

### Why

- Each was a frame-time cost or a visible dip on a path a coach takes many times a
  day: the fold re-rendered size readers on every frame of the spring; a blur under
  a fading backdrop re-blurs the page on every frame (the phone lost it on
  2026-10-12 for the same reason); and the fade-through left a beat with neither
  page on screen on every section change. iOS tab bars and macOS sidebars swap at
  once.

### Verification

- `src/clubhouse/lib/__tests__/rail-fold.test.tsx` (new) and
  `src/clubhouse/__tests__/native-nav.test.tsx` (section-switch cases).
- The Clubhouse unit suite, `tsc --noEmit`, eslint, `clubhouse:check`,
  `clubhouse:css`.
- Not measured here: this environment has no browser, so no frame timing or
  screenshots. Check on a Mac (Safari and Chrome) and the iOS app before release.
