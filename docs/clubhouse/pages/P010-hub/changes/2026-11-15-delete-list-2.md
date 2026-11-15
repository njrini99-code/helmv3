# P010 — Changelog

## 2026-11-15 — Delete list, part 2: A notification's task: a still wash until the row is used

```text
Design package: MOTION-AND-VISUAL.md sections 3.1, 3.5, 3.11, 3.12 (owner, 15 Nov 2026)
PR/commit: worker C2 (delete list, part 2), follow-up branch
Contract IDs: 100103
Actions: none
Data impact: none
Held items: none
```

### Changed

- `styles/hub.css`, `screens/hub/parts.tsx`: the task a `?task=` link opened keeps a still selected-row wash until the row is used, for every user; the fade that played as the page opened (a paint keyframe) and its animationend listener are gone. CONTRACT row 100103 says so.

### Why

- MOTION-AND-VISUAL 3.12: delete every on-mount animation and every loop but the working indicator; a kept keyframe lives in `styles/motion.css`. 3.1: content never moves on its own.

### Verification

- Unit (vitest, single files): hub-focus-task, plus motion-gate, motion-vocabulary, motion-durations-pinned and motion-physics. No browser was run: engine tier W is owed for the look, and D (a real iPhone) for any feel claim.
