# Phone overlay push — Changelog

## 2026-11-16 — Pushed phone screens ride the iOS curve over 520 ms

```text
Design package: production audit 2026-11-15 S4.1 (push and pop), S3.1
PR/commit: claude/project-thread-10vtd2-motion-2 (#2544)
Contract IDs: D-64
Actions: none
Data impact: none
Held items: none
```

### Changed

- `shell/PhoneScreen.tsx`: a pushed phone screen (a round, a player, a
  message thread) slides in and out over the reveal beat (520 ms) on
  `--ch-ease-ios`, the same timing as a route push. It used the 462 ms smooth
  spring before.
- `shell/phone-chrome.tsx`: the page beneath draws back 30% of the width (was
  24%) and its scrim fades on the same 520 ms iOS timing, so the two edges
  still move as one. `CH_PUSH_TWEEN` is the shared timing.
- Tests: motion-approved and phone-shell-gestures expect 30%.

### Why

- S4.1 asks for one push for every drill-in: 520 ms, the iOS curve, the page
  beneath drawing back 30% under the dim. Route pushes already did; pushed
  phone screens were the last on the old spring and the old 24% shift.

### Verification

- Unit (vitest): shell, phone-shell-gestures and the other shell tests,
  motion-approved, motion-durations-pinned, motion-gate (316 passed).
- Not run: a browser look. Owed: the W-tier motion gate (WebKit) on this
  branch and a D-tier feel check on a real iPhone.
