# P004 — Changelog

## 2026-11-15 — Delete list, part 2: the lit line and window ghost on motion.css

```text
Design package: MOTION-AND-VISUAL.md sections 3.1, 3.5, 3.11, 3.12 (owner, 15 Nov 2026)
PR/commit: worker C2 (delete list, part 2), follow-up branch
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- `styles/stats.css`: the line a tap lights and the Updating pill fade on
  `ch-in`; `styles/stats-redesign.css`: the window crossfade's copy fades on
  `ch-out` (shs-motion still removes it on animationend). Neither sheet holds a
  keyframe.

### Why

- MOTION-AND-VISUAL 3.12: delete every on-mount animation and every loop but the
  working indicator; a kept keyframe lives in `styles/motion.css`. 3.1: content
  never moves on its own.

### Verification

- Unit (vitest, single files): stats-motion, plus motion-gate,
  motion-vocabulary, motion-durations-pinned and motion-physics. No browser was
  run: engine tier W is owed for the look, and D (a real iPhone) for any feel
  claim.
