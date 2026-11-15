# Shared motion — Changelog

## 2026-11-15 — Delete list, part 2: the rest of the file-local keyframes

```text
Design package: MOTION-AND-VISUAL.md sections 3.1, 3.4, 3.5, 3.11, 3.12 (owner, 15 Nov 2026)
PR/commit: worker C2 (delete list, part 2), follow-up branch
Contract IDs: D-64
Actions: none
Data impact: none
Held items: none
```

### Changed

- `styles/motion.css`: gains `ch-drawer-in` (a drawer from the leading edge, on `translate`, for Ask's history); `ch-arrive`'s note names its two uses outside the owner exceptions (a menu from its anchor, a CoachHelm view switch from the dimmed opacity).
- `styles/base.css`: the unused `ch-reveal` keyframe is gone; the desktop crossfade's skeleton fades on `ch-in` (no `ch-skel-in`).
- `styles/class-awareness.css`: the class popover fades in on `ch-in`.
- Every page sheet in this slice now names a motion.css keyframe or nothing (each page's 2026-11-15-delete-list-2.md).

### Why

- MOTION-AND-VISUAL 3.12: first paint is still, the one loop is the working indicator, and a kept keyframe lives in `styles/motion.css`.

### Verification

- Unit (vitest, single files): motion-gate, motion-vocabulary, motion-durations-pinned, motion-physics, motion-approved (its skeleton-fade pin now names `ch-in` on the iOS curve). No browser run; W and D tiers owed.
