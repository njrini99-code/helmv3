# 2026-10-31 — Rounds: the course view is the whole screen and plays your shots

## 2026-10-31 — Full-screen hole, folding shot list, shot animation

```text
Design package: none (owner, 2026-10-31, on the phone: "the animation of it
                popping up and the visual need to be a lot better. There
                should be an animation of your shots"; "it should become the
                whole screen")
PR/commit:      claude/round-bar-discard
Contract IDs:   none new (the course view's existing contract)
Actions:        none
Data impact:    none
Held items:     not yet watched on a real iPhone; checked in Safari at 402 px
                with the animations stepped frame by frame
```

### Changed

- CourseView.tsx: the drawn hole fills the screen above a 68 px bar ("This
  hole · 1 shot · 142 yds to go"); tapping the bar or swiping it up raises
  the shot list over the map on the smooth spring, swiping down folds it.
  Each opening starts folded.
- HoleMap (parts.tsx) `play`: as the view opens the hole settles in on the
  reveal beat (scale 1.06 to 1); then each shot draws along its path over
  the reveal beat, one after another, a ball flies it, and the number where
  it landed pops in on the base beat; the club label, the dashed line to the
  pin and the distance pill follow. Never under reduced motion or
  Animations off; the shot screen's own map never plays.
- hole-geometry.ts shotPath: a full shot bows by a seventh of its length, a
  putt rolls straight.
- .claude/rules/clubhouse.md: the second named exception to Q-153.

### Verification

- shot-path.test (3); round-tracking, shot parity, hole-map contrast,
  motion and style ratchet tests pass.
- Safari, iPhone 17 size, preview `track?state=approach`: frames at 560 ms
  (ball in flight, arc drawn behind it) and 1400 ms (final), and the list
  opened.
