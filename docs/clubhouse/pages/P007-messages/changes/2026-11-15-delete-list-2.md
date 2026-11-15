# P007 — Changelog

## 2026-11-15 — Delete list, part 2: poll pops gone, the rest on ch-in

```text
Design package: MOTION-AND-VISUAL.md sections 3.1, 3.5, 3.11, 3.12 (owner, 15 Nov 2026)
PR/commit: worker C2 (delete list, part 2), follow-up branch
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- `styles/messages-details.css`, `screens/messages/polls.tsx`: the poll's disc
  pop, check draw and face pop (MOT-POLL-1, MOT-POLL-3) are gone with the
  tapped-row `data-pop` plumbing; the vote takes its state at once.
- `styles/messages.css`: the announcements fold and the jump-to-latest key
  crossfade in on `ch-in` (no drop, no pop); the details panel's Reduce Motion
  fade is `ch-in` over the quick beat. `styles/messages-thread.css`: the typing
  bubble's Reduce Motion fade is `ch-in` over the quick beat (it now opts in to
  the 180ms fade). The working dots are unchanged.

### Why

- MOTION-AND-VISUAL 3.12: delete every on-mount animation and every loop but the
  working indicator; a kept keyframe lives in `styles/motion.css`. 3.1: content
  never moves on its own.

### Verification

- Unit (vitest, single files): d-details-motion, messages-polls,
  messages-polls-css, rail-announcements-row, announcements-fold, plus
  motion-gate, motion-vocabulary, motion-durations-pinned and motion-physics. No
  browser was run: engine tier W is owed for the look, and D (a real iPhone) for
  any feel claim.
