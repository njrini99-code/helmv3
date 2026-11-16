# Story viewer and pull to refresh keyframes — Changelog

## 2026-11-16 — The story viewer and pull to refresh use the kept keyframes

```text
Design package: MOTION-AND-VISUAL 3.12 (the delete list), S3.1
PR/commit: claude/project-thread-10vtd2-motion-2 (#2544)
Contract IDs: D-64
Actions: none
Data impact: none
Held items: none
```

### Changed

- CoachHelm's story viewer (`coachhelm-team.css`) drops its four own
  keyframes:
  - The viewer rises from below on `ch-arrive` over the reveal beat (520 ms)
    on `--ch-ease-ios`. It used the retiring smooth spring curve.
  - Each story's body arrives 24 px from the trailing side, fading in, on
    `ch-arrive` over the base beat (260 ms) on the iOS curve. It was 420 ms
    on the spring curve.
  - The progress fill, the story's real clock, runs on a new kept keyframe,
    `ch-fill` in `motion.css`. Its 5.2 s time is unchanged.
  - Under Reduce Motion the viewer crossfades on the kept `ch-in`.
- Pull to refresh (`shell.css`): the ring turns on the kept
  `ch-spinner-turn`, one turn per working beat (1200 ms) in eight steps. It
  was its own `ch-ptr-turn` over 1040 ms.
- Motion gate ratchet: `coachhelm-team.css` keyframes 4 to 0 and retiring
  tokens 31 to 28; `shell.css` keyframes 12 to 11.

### Why

- 3.12 keeps one set of keyframes in `motion.css`; these were the last ones
  named for the story viewer and the refresh ring.

### Verification

- Unit (vitest): motion-gate, motion-durations-pinned, CoachHelm Team tests,
  shell tests (449 passed).
- Not run: a browser look at a story opening or a refresh. Owed: W-tier
  (WebKit, 390) look at both, and the motion gate on this branch.
