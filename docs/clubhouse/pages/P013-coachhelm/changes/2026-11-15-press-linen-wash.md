# P013 — Changelog

## 2026-11-15 — Press: the linen wash, no CSS press delay (3.8)

```text
Design package: MOTION-AND-VISUAL.md section 3.8 (owner, 15 Nov 2026); shared entry docs/clubhouse/changes/2026-11-15-press-linen-wash.md
PR/commit: claude/project-thread-10vtd2 (worker D, press)
Contract IDs: D-64, CH-1606
Actions: none
Data impact: none
Held items: none
```

### Changed

- `styles/coachhelm-ask-v2.css`: 2 pressed rule(s) draw the wash.
- `styles/coachhelm-ask.css`: 1 pressed rule(s) lose their CSS press delay; 7
  pressed rule(s) draw the wash; 1 desk hover rule(s) draw the wash at once.
- `styles/coachhelm-dive.css`: 6 pressed rule(s) draw the wash; 3 desk hover
  rule(s) draw the wash at once.
- `styles/coachhelm-file.css`: 3 pressed rule(s) lose their CSS press delay; 1
  pressed rule(s) draw the wash.
- `styles/coachhelm-plan.css`: 1 pressed rule(s) draw the wash; 1 desk hover
  rule(s) draw the wash at once.
- `styles/coachhelm-profile.css`: 1 pressed rule(s) draw the wash.
- `styles/coachhelm-standing.css`: 1 pressed rule(s) draw the wash.
- `styles/coachhelm-team.css`: 2 pressed rule(s) draw the wash.
- `styles/coachhelm-views.css`: 2 pressed rule(s) draw the wash.
- `styles/coachhelm.css`: 3 pressed rule(s) draw the wash; 1 desk hover rule(s)
  draw the wash at once.
- A pressed row, option or menu row on this page now takes the one linen wash
  (`--ch-sel`) in place of the green row tint or an ink wash: in over 110 ms,
  out over 280 ms on the iOS curve (`lib/press.ts`), after the 50 ms touch
  delay, and a tap shorter than that still flashes it for 110 ms. On a desk, a
  row's hover is the same wash, at once.

### Why

- 3.8: Apple's own row highlight. Opacity or a green tint on ivory reads as
  disabled or chosen; the wash reads as selected. The press delay lives in
  `lib/press.ts` (3.2), so a scroll that starts on a row never presses it.

### Verification

- Unit: pressed-sweep, selected-state, dark-ink-guard, motion-gate (counts only
  fall) and the shared press tests. Engine tier: no browser run here; W for the
  colour and D (a real iPhone) for the feel are owed.
- Press to see it: CoachHelm: press an Ask history row, a composer chip, a Deep
  dive item, a Your Week file row, a plan row and a team board row; on a desk,
  hover a CoachHelm row or a Deep dive item.
