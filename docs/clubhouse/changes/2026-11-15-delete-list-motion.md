# Shared motion — Changelog

## 2026-11-15 — The delete list: still first paint, one loop, Ask's own motion

```text
Design package: MOTION-AND-VISUAL.md sections 3.1, 3.2, 3.5, 3.6, 3.9, 3.11, 3.12 (owner, 15 Nov 2026); production audit 2026-11-15 S3.1, MOT-14, MOT-15, MOT-18, MAC-15, H393-007, PL-TRK-03 (P3-226), P3-305 / GAP-H-23
PR/commit: claude/project-thread-10vtd2 (worker C, delete list)
Contract IDs: D-64
Actions: none
Data impact: none
Held items: none
```

### Changed

- `styles/motion.css` (new): every keyframe Clubhouse keeps, in one file loaded
  with tokens.css and base.css (ClubhouseFrame, AuthFrame, ShellSkeleton,
  ClubhouseRouteError, the component preview).
- Ask (`styles/coachhelm-ask-v2.css`): 36 keyframes and their rules deleted.
  What stays: the answer crossfades once on the quick beat (`ch-in`), the plan
  pane slides in and out (an overlay a tap opens), the Undo window's ring drains
  (a real clock, `ch-drain`), a read's card fades in on a tap, and the island's
  working ring turns on the working beat while its step runs (the one loop). The
  send key crosses its two glyphs with an opacity transition; the island fades
  out with a transition; the work list folds with a quick fade. Gone: every
  on-mount rise, pop, stagger, draw-in, ring, flash, write head, coin, drop and
  pager slide, and the per-burst fade on streamed words.
- `styles/coachhelm-thread.css`: the new turn's rise and the streamed
  paragraph's fade are gone (the question's arrival is chat/Thread.tsx's; the
  answer crossfades once); the dead step dot and step list motion are deleted;
  the CoachHelm wheel turns on the working beat (`--ch-dur-typing`, `CoachMark`
  `TURN_MS` 1200).
- `styles/practice.css`: the plan helper's wheel rides the same working beat and
  keyframe.
- The working indicator (3.9, 3.11): `motion.css` gains `ch-working` (three
  dots, opacity only, 1.2 s) and `ch-spinner-turn`. Messages' typing dots lose
  their hop; the typing bubble crossfades in instead of popping. The CoachHelm
  ball (`chat/BallMark.tsx`) thinks as three waves of points of light on
  `ch-working`; its breathe, thin, drift and rest ripples are gone, so it has no
  `news` prop. `ui/Spinner`, Quick chat's live ring and its wheel turn on
  `--ch-dur-typing`; under Reduce Motion the working sign is still (base.css's
  spinner exemption, OQ-18, is gone).
- Loops deleted: the calendar's now dot and pill, the trust chip's live dot, the
  Classes scan, Team's station pulse and LinkPending's sweep (its hairline fades
  in and stands still). `--ch-dur-shimmer`, `--ch-dur-live`, `--ch-dur-sweep`,
  `--ch-dur-station-pulse` and `CH_SWEEP_MS` are deleted.
- First paint and values: a change mark is struck from the first frame (no
  draw-in); a picked hole's reading takes its new value at once (3.6; `ZoneBig`
  loses `settle`); calendar's panel, change note and old slot fade on `ch-in`.
- Owner exceptions (the course view's play, a live Ask visual) run on
  motion.css's `ch-draw`, `ch-arrive`, `ch-pass` and `ch-in`; rounds-track.css
  and coachhelm-ask-studio.css keep no keyframe. The shot card's turned face
  holds taps for one beat with one keyframe, `ch-hold` (PL-TRK-03), and no
  longer rises.
- P3-305 / GAP-H-23: `PlayerFile`'s fold takes `CH_EASE_IOS_CSS` / `CH_EASE_OUT`
  from lib/motion; the dead spring-smooth transition in coachhelm-file.css is
  gone.

### Why

- MOTION-AND-VISUAL 3.12: delete every on-mount animation and every loop but the
  working indicator, and take Ask's keyframes down to what it needs; 3.1: first
  paint is still, three things move, the one loop is the working indicator while
  work runs.

### Verification

- Unit: motion-gate (fails only on the new `styles/motion.css`, 12 keyframes,
  which the ratchet has not recorded yet), motion-vocabulary,
  motion-durations-pinned, motion-physics, coachhelm-ask-working-motion,
  ambient-loops, one-spinner, ball-mark, shot-card-fold, week-narrow,
  hole-arrival, calendar-now-compositor, coachhelm-visual-artifact-css and the
  CSS suites that read these sheets; tsgo clean. No browser was run: engine
  tiers W and D (real iPhone) are still owed for any feel claim.
