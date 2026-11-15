# Shared motion — Changelog

## 2026-11-15 — One curve, no overshoot, twelve tokens and the motion gate

```text
Design package: MOTION-AND-VISUAL.md section 3.2 (owner, 15 Nov 2026); production audit 2026-11-15 S3.1, S3.11, MOT-08, Batch 4 item 7
PR/commit: claude/project-thread-10vtd2
Contract IDs: D-64
Actions: none
Data impact: none
Held items: none
```

### Changed

- `styles/tokens.css`: the motion block is the vocabulary: six durations (press
  110, quick 180, base 260, release 280, marks 360, reveal 520), two curves
  (`--ch-ease-ios`, `--ch-ease-out`) and two loading beats
  (`--ch-dur-busy-delay` 150, `--ch-dur-busy-min` 300). Every other motion token
  sits under "Retiring" and may only lose uses. The overshooting
  `--ch-ease-spring` and the seven CSS `linear()` springs are deleted; the
  `--ch-*-spring-*` names left are the iOS curve on a D-64 beat. 1714 lines
  before, 1671 after the spring removal.
- `lib/motion.ts`: `CH_EASE_OUT`, `CH_DUR.marks`, `CH_DUR_MS`, `CH_SPRING` (mass
  1, stiffness 157.9, damping 25.13), `CH_RUBBER_BAND`, `CH_SWIPE`, `CH_SHEET`,
  `CH_BUSY`. Every named script spring is bounce 0 but send and launch (at most
  0.08, until the insert rule replaces them); `pour` is deleted.
- `lib/press.ts`: a button presses to 0.97 at any width, down over press and
  back over release on the iOS curve.
- `lib/slide-plate.ts`: the segmented thumb rides the base beat on the iOS
  curve.
- The desktop rail fold (`styles/shell.css`) moves on the base beat, iOS curve.
- `__tests__/motion-gate.test.ts` (unit, required CI): no overshooting curve in
  any stylesheet or script; per file, paint keyframes, literal durations,
  retiring tokens, `@keyframes` and `infinite` animations may only fall
  (`config/clubhouse/motion-ratchet.json`). Seeded at 19 paint keyframes, 11
  literal durations, 881 retiring-token uses, 180 keyframes and 38 loops.
- `__tests__/motion-vocabulary.test.ts` pins the CSS and script mirror.

### Why

- The owner's motion system (3.1): three things move, nothing overshoots, the
  working dots are the one loop. The audit found overshoot on surfaces a tap
  opens (MOT-08) and no motion check in the gate.

### Verification

- Unit: motion-gate, motion-vocabulary, motion-physics, motion-durations-pinned,
  motion, refresh-tokens, slide-plate-thumb, messages motion tests. Engine tier
  for any feel claim: D (real iPhone) still owed.
