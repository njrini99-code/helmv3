# P013 — Changelog

## 2026-11-15 — Delete list, part 2: chip rises and plan loops gone

```text
Design package: MOTION-AND-VISUAL.md sections 3.1, 3.5, 3.11, 3.12 (owner, 15 Nov 2026)
PR/commit: worker C2 (delete list, part 2), follow-up branch
Contract IDs: CH-13601
Actions: none
Data impact: none
Held items: none
```

### Changed

- `styles/coachhelm.css`: the Assigned chip and dismissed notice take their
  place at once (CH-13601); the Re-check line fades on `ch-in`; the board's view
  switch rises from the dimmed opacity on motion.css's `ch-arrive`
  (`ch-view-enter` is gone; coachhelm-ask, coachhelm-file and coachhelm-team
  name `ch-arrive` too).
- `styles/coachhelm-ask.css`: the model picker opens as a menu on `ch-arrive`
  (scale 0.96 from its anchor); the history drawer slides in on motion.css's new
  `ch-drawer-in` (on `translate`, which sheet-drag reads) over the reveal beat.
  `coachhelm-ask-cards.css`: the Undo ring drains on `ch-drain`.
- `styles/coachhelm-read.css`: the how-sure panel crossfades in on `ch-in`.
  `styles/coachhelm-plan.css`: the caret blink, saving sweep and reading dot
  loops are gone (PP-23); the folder list fades on `ch-in`.
- `styles/coachhelm-team.css`, `team/HoleMotion.tsx`, `team/TeamHole.tsx`: five
  unused keyframes and the dead `.wk.is-new` rise are deleted; the station
  pulse's unseen ring and HoleMotion's `station` prop are gone (`picks` stays: a
  choice mid-flight stops the ball).

### Why

- MOTION-AND-VISUAL 3.12: delete every on-mount animation and every loop but the
  working indicator; a kept keyframe lives in `styles/motion.css`. 3.1: content
  never moves on its own.

### Verification

- Unit (vitest, single files): view-switch-boundary, coachhelm-ask-picker-room,
  hole-arrival, story-tall, plus motion-gate, motion-vocabulary,
  motion-durations-pinned and motion-physics. No browser was run: engine tier W
  is owed for the look, and D (a real iPhone) for any feel claim.
