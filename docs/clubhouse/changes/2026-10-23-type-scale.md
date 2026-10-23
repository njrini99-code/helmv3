# 2026-10-23 — The 11-size type scale

## 2026-10-23 — Text on 11 sizes (mot-08)

```text
Design package: none (owner-approved from before/after renders, 2026-10-23)
PR/commit: branch claude/clubhouse-motion-apple-bar
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- mot-08: every Clubhouse text size up to 36px moves to the nearest of 11 steps:
  11, 12, 13, 14, 15, 16, 17, 20, 22, 28 and 34px (ties round up). 805
  declarations in 32 stylesheets, the `--ch-type-*` tokens included. The biggest
  groups: 12.5 → 13 (231), 13.5 → 14 (165), 11.5 → 12 (78), 14.5 → 15 (70),
  19 → 20 (69). Titles settle on 20, 22, 28 and 34. Nothing under 11px is left.
- Weights, line heights, letter spacing and colour are unchanged. Figures of
  40px and up keep their sizes. SVG chart labels, which are sized in drawing
  units that scale with the chart, are unchanged.

### Why

- Today there were 36 text sizes, many half a pixel apart, so the same kind of
  text read slightly differently from page to page. Apple's ladder is about 11.
  The owner reviewed real before/after renders of Roster and Player stats on a
  phone and on desktop and approved it.

### Verification

- `src/clubhouse/__tests__/look-feel-pass-css.test.ts` pins the 11 steps (fails
  on the previous stylesheets). `stats-parity.test.tsx` now expects the phone
  approach label at 14px (was 13.5, inside its 13 to 14px contract).
- Before/after renders: Roster and Player stats, phone and desktop, from the
  branch in headless Chromium. Team Stats and Home did not load in that browser.
