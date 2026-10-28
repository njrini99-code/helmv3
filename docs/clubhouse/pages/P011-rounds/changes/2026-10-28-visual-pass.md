# 2026-10-28 — Rounds: visual pass (review, library, setup, tracking polish)

## 2026-10-28 — Pre-deploy visual and premium pass, area F

```text
Design package: visual-pass-2026-10-28 RUBRIC.md (P011 checklist, H4, H12,
                H13, H17), premium-research/home-rounds-stats.md
PR/commit:      visual-pass-2026-10-28
Contract IDs:   none new
Actions:        none
Data impact:    none; shot tracking collects exactly what it did (H18: no
                change under screens/rounds/track)
Held items:     iPhone check of the back label on a review opened from Team
                rounds (no swap after paint); Safari check of the scorecard's
                strokes-gained bracket and of the 12px floor at the largest
                Text Size
```

### Changed

- Review back label: whether the round was opened from the library or Team
  rounds is read during render (`useSyncExternalStore`), so "Rounds" or
  "Stats" is right before the first paint instead of swapping after mount.
- Debrief: the moved number says which way in a word inside the toned figure
  ("15 of 18 greens, better than usual."), so the colour is never the only
  signal (H13).
- Scorecard strokes-gained strip: the total stands behind a hairline seam and
  a quiet bracket spans the four legs it adds up, so it reads as their sum.
- In-progress strip: the under-par disc starts at the eagle's red (#c4493b),
  so its numeral holds 4.5:1 at the top stop (4.58; it was 3.89).
- Cards sit on the 16px card radius (the in-progress card, season scoring,
  the review hero, its cards, the recap, the zone stages, the chart stage,
  setup's band and cards, the shot screen's hero and entry panel).
- Phone text floor: numerals in fixed cells that later rules drew at 11px (the
  in-progress strip's hole numbers, the fairway, green and putt cells, the
  hole map and compare cells) take the floor's 12px; the floor's pins moved to
  one block at the end of rounds.css so later rules can't undercut them.
- The phone scorecard table follows Text Size (it was a raw 12px).
- The hole map and compare cells draw their numbers in Instrument Sans, not
  JetBrains Mono (mono is for key hints only).
- Setup: the qualifier's Play pill centres its label.
- Shot screen scorecard: the pinned corner cells take the table's own corner,
  so the ivory corners no longer notch; the pinned header cells carry the
  table's top highlight, so its top edge reads as one line.
- Round complete sheet: "Posting adds this round to your stats." sits 16
  below the scorecard. Its margin had been zeroed by the `.ch-root p` reset,
  so it read as a caption stuck to the table.
- Season chart (every round against par): the under-par bar's bottom stop is
  the eagle's red (#c4493b), matching the strip disc.

### Verification

- Before: `/home/claude/vp/before/`, `/home/claude/vp/before-states-F/`.
  After: `/home/claude/vp/after-F/`.
- stylelint (clubhouse config) and eslint on the touched files; round-review,
  round-debrief (moved figure text and the colour-alone ratchet, now none),
  rounds and look-feel tests via the queued runner.
