# Desktop rail fold — Changelog

## 2026-11-15 — The rail folds on transform and opacity only (MOT-11)

```text
Design package: production audit 2026-11-15 S4.4 (desktop rail fold), MOT-11 (P1-37)
PR/commit: claude/project-thread-10vtd2 (#2537)
Contract IDs: D-64
Actions: none
Data impact: none
Held items: none
```

### Changed

- `styles/shell.css`, the folding sidebar: the sidebar's width, the brand
  panel's margin and padding, the brand line's gap and the word track's grid
  column no longer transition. They take their new value in one frame, so the
  canvas is laid out once per fold, not on every frame of it.
- The circle on the seam no longer glides: its `translate` follows the seam at
  once, and its chevron still turns over the base beat (260 ms) on the iOS
  curve. Its press keeps the press beat on `transform` and `box-shadow`.
- The words (nav labels, group headings, the identity text, the sidebar card)
  and the brand word fade and slide 4 px over the quick beat (180 ms): arriving
  on `--ch-ease-ios`, leaving on `--ch-ease-out`. The old 144 ms "after the edge
  passes" delay and the 126 ms exit are gone, since there is no moving edge to
  wait for. A group's short rule on the rail fades on the same beat.
- `lib/rail-fold.ts`: the doc comment now says the width no longer moves. The
  code is unchanged: with no width transition the computed duration is 0, so the
  fold settles on the next task and held size reads run once.
- Motion gate: retiring-token uses in `shell.css` 70 to 64.

### Why

- MOT-11 measured the fold animating width, margin, padding, gap and grid
  columns; each frame re-laid the canvas and every size reader under it. S4.4
  asks for transform and opacity only, with the content column at its final
  width at once. It also made the "presentation" check
  (`clubhouse/no-layout-motion`) fail on #2537, because the earlier retoken
  changed the text of those layout transitions.

### Verification

- Unit (vitest): new `shell/__tests__/rail-fold-css.test.ts` (fails on the
  previous `shell.css`, passes now), rail-toggle, rail-fold, brand-word,
  look-feel-pass-css, motion-gate, motion-durations-pinned.
- `npm run clubhouse:css`: 0 findings (was 5).
- Not run: a browser look at the fold. Owed: a W-tier (WebKit, 1440) look at
  fold and unfold on the real app, light and dark, and a D-tier feel check on
  the Mac's Safari.
