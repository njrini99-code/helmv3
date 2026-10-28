# 2026-10-28 — Visual pass (area C: Team stats)

## 2026-10-28 — Stage headline contrast, an instant headline, honest "no clear change" chips, the phone edge

```text
Design package: none (pre-deploy visual pass, owner: "a full pass", 2026-10-28)
PR/commit: visual-pass-2026-10-28
Contract IDs: 41604 (meaning narrowed: the headline figure no longer animates)
Actions: none
Data impact: none
Held items: the trend stage's gold for a loss and mint for a gain need a look on an iPhone in sunlight; Safari/WebKit not checked (Chromium only)
```

### Changed

- The team strokes gained headline on the deep green stage and its change chip
  take the stage's own mint and gold
  (`--ch-stage-up`, `--ch-stage-down`), in both themes, as the players' end
  labels and bars already did. In light the
  loss figure was the page's loss amber (#865608) on the green, measured 1.6:1;
  gold is now 6.5:1 and mint
  6.6:1. The minus sign carries the direction.
- The headline figure changes at once on a window or measure change: the Swap's
  fade-and-rise around it is gone (A+
  rubric: the headline changes instantly). The trend and tape panels keep their
  own swaps.
- A change inside its standard error shows the signed number and "No clear
  change" with no glyph. The flat state drew a
  dash icon beside a signed number ("— +0.4", "— −1.3"), which read as two minus
  signs. The same on the tape's cells
  and on the shared SG change chip (`charts.tsx`), which P005 uses too.
- The SVG callout takes tabular digits through `.ch-num`.
- Phone: the head, the window switch, the hero and the trend sit on the 16px
  page edge with the cards. A 4px inset put
  their first glyphs and the switch's edge at 20 beside cards at 16.
- Phone: the player rows' chevron is ink-500 (ink-400 measured 2.8:1 on the
  phone page, under 3:1 for an icon).

### Verification

- Before/after captures at 393 and 1280, light and dark
  (`/home/claude/vp/before`, `/home/claude/vp/after-C`).
- Contrast by the WCAG formula on eyedropped stage pixels (#134a31 under the
  headline).
- eslint on the touched files (exit 0); the stats vitest files and the type
  ratchet through the shared queue (pass).
