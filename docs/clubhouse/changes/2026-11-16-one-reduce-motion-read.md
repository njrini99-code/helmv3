# One Reduce Motion read — Changelog

## 2026-11-16 — The last direct Reduce Motion reads go through one owner

```text
Design package: MOTION-AND-VISUAL 3.11 (Reduce Motion and Animations off)
PR/commit: claude/project-thread-10vtd2-motion-2 (#2544)
Contract IDs: D-64
Actions: none
Data impact: none
Held items: none
```

### Changed

- `lib/handoff.ts`: the hand-off curtain reads `chMotionModeNow()` instead of
  its own media query, so Settings › Animations off also lifts it at once,
  not only the OS Reduce Motion setting.
- Messages, the reply swipe in `overlays/bubble-actions.tsx`: the bubble only
  follows the finger with full motion on; under Reduce Motion or Animations
  off it stays put, as it did under Reduce Motion before.
- Messages, the phone details screen's "Photos and files" jump scrolls
  smoothly only with full motion on, and jumps at once otherwise.
- `lib/reduced-motion.ts` is now the only place Clubhouse code asks the OS
  setting (tests aside).

### Why

- 3.11 makes one module the owner of the setting. These three read the media
  query directly and ignored the Animations switch in Settings.

### Verification

- Unit (vitest): handoff (new case: Animations off lifts the curtain without
  animating), messages screens, reduced-motion (532 and 8 passed).
- Not run: a browser look. This changes nothing with full motion on.
