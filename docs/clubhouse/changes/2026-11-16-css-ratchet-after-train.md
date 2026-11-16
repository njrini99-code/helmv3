# CSS ratchet after the 16 Nov train — Changelog

## 2026-11-16 — Two shadows become tokens, and a zero duration is no motion

```text
Design package: MOTION-AND-VISUAL 3.2, 4.6 and build step 7
PR/commit: claude/project-thread-10vtd2 (#2550)
Contract IDs: D-64
Actions: none
Data impact: none
Held items: none
```

### Changed

- The pushing page's leading-edge hairline (`shell.css`) reads the new
  `--ch-push-edge` token, and the stat terms rows (`stat-terms.css`) read
  `--ch-rule-top`. Both tokens hold the values the rules had, so nothing
  looks different.
- `npm run clubhouse:css` no longer counts a zero duration (`0s`, `0ms`) as
  raw motion, the same way the motion gate reads it (Nick, 16 Nov 2026). The
  zeros are deliberate: the hover wash that shows at once, the skeleton's
  150 ms wait, and the visibility flip after a fade. Any other literal
  duration or `cubic-bezier()` outside `tokens.css` and `motion.css` still
  counts.
- `config/clubhouse/css-ratchet.json` was lowered with `--ratchet` and
  nothing was raised. Raw shadow is down in `calendar.css` (93 to 91),
  `coachhelm-ask-v2.css` (32 to 29), `hub.css` (55 to 53) and `shell.css`
  (38 to 37). Keyframes outside `motion.css` are down in 36 files, and raw
  motion is at the new counts.
- After train 3 (dff100c5d), the two new stylesheets' raw shadows read
  tokens with the same values. The team hours rows read `--ch-rule-top-sep`.
  The tournament import grid's field reads `--ch-ring-field`,
  `--ch-ring-field-focus` and `--ch-ring-field-invalid`.
