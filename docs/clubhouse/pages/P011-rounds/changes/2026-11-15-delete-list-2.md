# P011 — Changelog

## 2026-11-15 — Delete list, part 2: The round card, the course picker and live lanes stand still

```text
Design package: MOTION-AND-VISUAL.md sections 3.1, 3.5, 3.11, 3.12 (owner, 15 Nov 2026)
PR/commit: worker C2 (delete list, part 2), follow-up branch
Contract IDs: CH-11924
Actions: none
Data impact: none
Held items: none
```

### Changed

- `styles/rounds.css`: the card opened from Post round is whole in its first frame (its settle is gone); the map/list swap and a compare tick fade on `ch-in`; the compare circles no longer fade in with the list. Catalog and CONTRACT (CH-11924) say so.
- `styles/rounds-setup.css`: the course cards' scroll-driven fold is gone.
- `styles/live.css`, `live/HoleBeads.tsx`: a fresh hole and a new spark segment fade on `ch-in` (no scale); the to-par wash fades on `ch-out`.

### Why

- MOTION-AND-VISUAL 3.12: delete every on-mount animation and every loop but the working indicator; a kept keyframe lives in `styles/motion.css`. 3.1: content never moves on its own.

### Verification

- Unit (vitest, single files): round-card, PlayerLane, plus motion-gate, motion-vocabulary, motion-durations-pinned and motion-physics. No browser was run: engine tier W is owed for the look, and D (a real iPhone) for any feel claim.
