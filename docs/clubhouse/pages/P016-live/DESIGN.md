# P016 — Live rounds: design handoff

## Package

```text
Source:   build plan P-6 (handoff 4.34.6; the lane and bead grammar is 5L's, 4.33)
Version:  plan of 2026-10-24 with the 2026-10-25 changelog and recheck
Date:     2026-10-25
Status:   draft (no owner board; the plan is the spec, and docs/clubhouse/phone/live.md maps it)
```

## Design objective

One lane grammar for every live surface: a name, where they are, score to par, thru, and a bead row that tells the story
of the round at a glance. Quiet by default: nothing moves on first paint, a changed value updates in place, and a lane
that has not been heard from says so in words rather than being dimmed.

## Decisions that shape the build

- **Shape carries the result, not colour.** A filled circle under par, a dot for par, a hollow square for bogey, a filled
  square for double or worse, a hollow circle for a hole not yet played, a green ring on the hole being played. The dark
  eagle bead is its own token (`--ch-live-bead-eagle`, #b84d3f) because the shared eagle fill sits at 3.00:1.
- **The live dot is static** (D-33). **The to-par changes in place** (D-100): its changed-wash is a layer on the to-par
  cell that fades out over the reveal beat, tinted by the result (under, over or the selected tint). Under reduced motion
  or Animations off there is no wash and no scale: a ring for three seconds.
- **Quiet lanes keep contrast** (ink-500 and the warning ink, never 0.6 opacity). Freshness: under 10 minutes fresh; from
  10 minutes "Last update 14 min ago"; from 90 minutes "No update since 11:40" and the lane moves to Not heard from; past
  4 hours it leaves the lists.
- **`current_hole` is a hole number**; the play order only orders the beads and finds the next unscored hole.
- **Late means two or more holes gained a score in one read.** One "Caught up · thru n" line, no wash.
- **A coach's long press** is `ui/Peek` (450 ms, 8 px slop, its own haptics): Message (prefilled, never sent), Open round,
  Open qualifier. No haptic for a coach watching.
- **Lane form follows a container query** on the list, not the viewport: two lines up to 640 px, one line with the
  momentum line from 640 px. The phone page edge is `--ch-page-x-phone`.

## Components

`live/PlayerLane`, `HoleBeads`, `MomentumLine`, `FreshnessChip`, `LiveAnnouncer`, `use-live-rounds`; `screens/live/LiveView`
(desktop), `LiveViewPhone`, `PlayerLiveSheet` (a sheet, and the desktop panel's body); `screens/home/LiveNowCard`.
