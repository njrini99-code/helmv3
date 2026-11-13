# 2026-11-13 — the plan builder fits the desk

## 2026-11-13 — The plan builder is left out of the shared desk left edge

```text
Design package: none (coach audit, 13 Nov 2026, §5 #2)
PR/commit:      agent/coach-fix-practice
Contract IDs:   none
Actions:        none new
Data impact:    none
Held items:     none
```

### Fixed

- `styles/shell.css`: the desk left-edge rule (12 Nov, "Practice's pages open on
  the shared desk left edge") took every `main.ch-prc`, the plan builder too. The
  builder fills its frame (`width: 100%`), so the edge's left margin pushed it
  past the window: at 1920 it ran from x 400 to 2072 and Publish (x 1967 to 2048)
  was off-screen. The rule now leaves out `main[data-ch='practice-builder']`, as
  it leaves out the player's CoachHelm file, which also fills the frame.
- Measured after, in Safari at 1920: builder x 240 to 1912 (its frame), Publish
  1807 to 1888, Inspector 1572 to 1912. Practice home keeps the shared edge
  (x 400 to 1600). At 1440 and 1280 the edge's margin is 0, so nothing moves.
- `e2e/clubhouse/practice-builder-fit.spec.ts` checks Publish, Preview, the
  Inspector and the builder end inside the frame at 1280, 1440 and 1920 (WebKit,
  local preview route).
