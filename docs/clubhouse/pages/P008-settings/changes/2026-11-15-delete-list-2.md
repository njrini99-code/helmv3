# P008 — Changelog

## 2026-11-15 — Delete list, part 2: A moved priority takes its place at once

```text
Design package: MOTION-AND-VISUAL.md sections 3.1, 3.5, 3.11, 3.12 (owner, 15 Nov 2026)
PR/commit: worker C2 (delete list, part 2), follow-up branch
Contract IDs: CH-8606
Actions: none
Data impact: none
Held items: none
```

### Changed

- `styles/settings.css`, `screens/settings/CoachHelm.tsx`: the moved priority's green glow (a paint keyframe cleared on animationend) and the phone's lift-shadow rise are gone; the row takes its new place with the select haptic. The Saved word fades on `ch-in`. Catalog row CH-8606 says so.

### Why

- MOTION-AND-VISUAL 3.12: delete every on-mount animation and every loop but the working indicator; a kept keyframe lives in `styles/motion.css`. 3.1: content never moves on its own.

### Verification

- Unit (vitest, single files): settings (new CH-8606 test), plus motion-gate, motion-vocabulary, motion-durations-pinned and motion-physics. No browser was run: engine tier W is owed for the look, and D (a real iPhone) for any feel claim.
