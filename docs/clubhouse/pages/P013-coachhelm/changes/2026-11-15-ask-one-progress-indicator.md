# 2026-11-15 — coachhelm

## 2026-11-15 — Ask keeps one progress indicator: the island's turning ring (MOT-14)

```text
Design package: none (production audit 2026-11-15, MOT-14, MOT-15; Batch 4 item 4; spec S3.1)
PR/commit:      worktree-agent-a28a8e337f498ea91 (motion, ambient loops slice)
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     screenshots owed (a live Ask turn and the quick chat work line, before/after)
```

### Changed

- `styles/coachhelm-ask-v2.css`: infinite loops go from 11 to 1. The one that
  stays is the running step's ring in the activity island
  (`:is(.ch-isl, .ch-ak-isl) .mk .arc`, `ch-spinner-turn`). It is the step
  list's own indicator, it sits on the step that is running (the place a
  person looks), and it stops by itself when that step finishes or the turn
  is stopped.
- Drawn still now: the live dot after streamed words and on the quick chat
  work line (`.ch-ak-live`, was `ch-ak-breath`), the v2 step list's dot; the
  running work-line words and step labels are plain ink (the `ch-ak-shim`
  text shimmer is gone); the visual skeleton bar is a flat track (no
  `ch-ak-sweep`); the "Sending…" capsule shows its tint and words without the
  running bar (`ch-ak-capsule`); a busy artifact tile has no scan
  (`ch-ak-scan`); an open week slot keeps its tinted ring without the pulse
  (`ch-ak-slot`).
- The island's passing light (`ch-isl-light`, MO-4-I10), off by default
  behind `setWaitLight`, is removed with its switch (`chat/reveal.ts`), its
  markup (`chat/island/ActivityIsland.tsx`) and the preview's `&light=1`.
- `ch-ak-coin` no longer animates `filter: saturate()`; the coins light in on
  opacity and scale only.
- Keyframes: 43 to 36. The live Ask visual's rise (`CoachComposition.tsx`,
  the owner's exception) is untouched.

### Why

- 50 keyframes and 11 infinite loops in Ask (breathing dots, text shimmer,
  scan sweeps) against S3.1's one progress indicator and no infinite ambient
  loops; `background-position` and `filter` keyframes repaint every frame.

### Verification

- `__tests__/ambient-loops.test.ts` (new): the only `infinite` rule in
  `coachhelm-ask-v2.css` is the island ring; the removed keyframes are gone;
  no keyframe animates `filter` or `background-position`. Source only; no
  browser or device run.
