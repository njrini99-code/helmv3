# 2026-11-13 — the plan builder's desk, with contrast

## 2026-11-13 — The desk builder: a green head, a recessed table, tee-time stubs

```text
Design package: none (owner, 13 Nov 2026, on the builder at 1920: "we need more contrast. youre just putting black text on the off white it looks awful. be creative")
PR/commit:      agent/coach-fix-practice
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- `styles/practice.css`, desk builder only (`.ch-prb.is-desk`; the phone
  builder is untouched):
  - The head is the feature green (`--ch-feature-bg`), the sidebar's colour, so
    green frames the work on two sides. The plan's name is ivory at 22 strong;
    when and where, Saved and the day's strip read in the feature inks. The step
    control is an ivory chip on a faint ivory track. Preview is an ivory outline;
    Publish is the ivory plate (`--ch-on-green-plate`) in green ink, the brightest
    thing in the head. The strip's kinds take their night tones (champagne,
    slate, mint), drawn for a dark ground.
  - The board is a table one step darker than its cards (`--ch-ivory-200`; at
    night `--ch-grouped-bg`, below the cards as by day). Drills and the
    Inspector are light panels painted full height on the body with their
    hairlines, so they no longer stop where their sticky content ends. The
    builder fills the frame's height (the shell's recipe), so a short step's
    table runs to the bottom. Drills on the panel sit in the raised ivory; the
    chosen area is a green chip.
  - Each block starts on a tee-time stub: its start at 20 strong in ivory on
    green, its length under it, the way a tee sheet reads. A break's stub is the
    flat well tone in ink. The title moves to the first line at 17 strong.
  - A CoachHelm suggestion has a hollow stub: the same tee time in green ink on
    the accent tint behind a dashed edge, inside the card's green outline.
    Filled is in the plan; hollow is only offered.
- Measured in Safari at 1920, light and dark: Publish 1807 to 1888 inside the
  frame; the builder runs 64 to 851, the frame's full height, on Groups as on
  Blocks. `e2e/clubhouse/practice-builder-fit.spec.ts` still passes at 1280,
  1440 and 1920.
