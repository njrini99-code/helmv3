# 2026-11-13 — coachhelm

## 2026-11-13 — This week's tiles, the course map's stations and the desk's hint

```text
Design package: none (audit 2026-11-13: F-0019, F-0007, F-0024; owner: "Start improving the look and feel")
PR/commit:      agent/ch-look-coachhelm-stats
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     F-0008 (player desk, axe on `.ch-btn--sm > span`): no change, see Verification
```

### Changed

- This week (F-0019, coach phone and desk): one container, the section's card. A
  tile is a plain well with no ring and no 2px green outline; the row no longer
  stretches every tile to the one with a picture (`align-items: flex-start`),
  the 162px minimum is gone and the byline follows the title instead of sinking
  to the tile's foot. An unseen tile is marked by an 8px green dot closing its
  byline, as an unread conversation's, never an outline or a rail. The desk's
  rows keep their full width (`align-items: stretch`) and lose the same ring and
  outline.
- The course map (F-0007): the live hole is `role="group"`, named "Where the
  team loses strokes to Tour, by part of the hole", so a screen reader reaches
  its station buttons (an image's children are presentational). Each station's
  name starts with the words drawn on it, short name then figure ("Tee, +0.7 a
  round, off the tee"), and the "+N" button's starts with "+N". The empty hole,
  with nothing to press, stays one image.
- The desk's hint under the hole says "Choose a spot" (F-0024), right for a
  mouse, a trackpad and an iPad that gets the desk layout.

### Why

- Audit 2026-11-13: a card holding cards, three tiles stretched to the tallest
  with ~80pt of nothing in the plain ones (F-0019); axe nested-interactive and
  IBM aria_descendant_valid on `.holesvg` (F-0007); "Tap a spot" on a desk
  (F-0024).

### Verification

- New `team/__tests__/hole-a11y.test.tsx` and
  `team/__tests__/this-week-tiles-css.test.ts`, and one case added to
  `team/__tests__/team-board-states.test.tsx`: each failed before the change and
  passes after.
- Contrast from tokens: the unseen dot is 7.48:1 on the well in light
  (`--ch-green-600` on `--ch-well-bg-flat`) and 7.78:1 in dark.
- F-0008: the only `.ch-btn--sm` on the audited page (player, 0 rounds) is the
  ghost "Development" link in the head, `--ch-green-600` on `--ch-bg-page`:
  7.21:1 light, 7.99:1 dark. The run's own pixel pass and its WebKit 1440 lane
  were clean, and its notes record axe flagging elements mid-fade on other
  pages. No change; re-run axe once the page has settled.
- Screenshots: pending the lead's visual pass (no browser was run here); no
  VERIFY rows were added.
