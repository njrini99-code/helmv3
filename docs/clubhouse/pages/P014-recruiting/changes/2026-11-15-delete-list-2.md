# P014 — Changelog

## 2026-11-15 — Delete list, part 2: The gilt rule is there at once; its haptic fires directly

```text
Design package: MOTION-AND-VISUAL.md sections 3.1, 3.5, 3.11, 3.12 (owner, 15 Nov 2026)
PR/commit: worker C2 (delete list, part 2), follow-up branch
Contract IDs: CH-14806
Actions: none
Data impact: none
Held items: none
```

### Changed

- `styles/recruiting.css`, `screens/recruiting/parts.tsx`: a landed move to Committed shows the 1px gilt rule at once (its clip-path draw is gone) and `haptic('success')` fires with the moment, once the save has landed and the phone's stage sheet has closed, instead of waiting for an animationend. Catalog, CONTRACT, DESIGN and WIRING say so.

### Why

- MOTION-AND-VISUAL 3.12: delete every on-mount animation and every loop but the working indicator; a kept keyframe lives in `styles/motion.css`. 3.1: content never moves on its own.

### Verification

- Unit (vitest, single files): recruiting, plus motion-gate, motion-vocabulary, motion-durations-pinned and motion-physics. No browser was run: engine tier W is owed for the look, and D (a real iPhone) for any feel claim.
