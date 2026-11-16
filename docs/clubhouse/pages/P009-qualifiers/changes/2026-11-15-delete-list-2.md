# P009 — Changelog

## 2026-11-15 — Delete list, part 2: the tray crossfades in, no drop

```text
Design package: MOTION-AND-VISUAL.md sections 3.1, 3.5, 3.11, 3.12 (owner, 15 Nov 2026)
PR/commit: worker C2 (delete list, part 2), follow-up branch
Contract IDs: CH-09602
Actions: none
Data impact: none
Held items: none
```

### Changed

- `styles/qualifiers.css`: what a row's tray holds, and the round's visuals,
  crossfade in over the quick beat on motion.css's `ch-in` (no 6px drop, no
  keyframe of its own).

### Why

- MOTION-AND-VISUAL 3.12: delete every on-mount animation and every loop but the
  working indicator; a kept keyframe lives in `styles/motion.css`. 3.1: content
  never moves on its own.

### Verification

- Unit (vitest, single files): qualifiers selection-skeleton-css, plus
  motion-gate, motion-vocabulary, motion-durations-pinned and motion-physics. No
  browser was run: engine tier W is owed for the look, and D (a real iPhone) for
  any feel claim.
