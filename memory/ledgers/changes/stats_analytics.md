# Stats And Analytics change ledger

## 2026-08-27 — Ask CoachHelm CTA is role-aware; putting rail label width

- SHA: 1a57943e6.
- Change: `StatsSpine` takes `viewerContext` ('self' | 'coach') and optional
  `playerName`, wired from `StatsSpineStage`'s existing
  `standingViewerContext`. Coach -> Ask (`surfaceHref('ask')`, seeded with
  "What should I work on with <player>?" when the name is known); player ->
  Overview. `StatsBento` putting rail `labelWidth` 44 -> 60.
- Why: the CTA was hardcoded to `/golf/dashboard/coachhelm`, the player-only
  front door, so a coach who tapped Ask on a player's stats page hit the
  player-view dead end (2026-08-26 owner report). RailBars' label column is a
  hard px track and "15-20ft" is as wide as the "Fairways" label that had
  already proved 44px too narrow.

## 2026-08-25 — completed-round SG lifecycle capability

- Status: uncommitted local reliability repair; not deployed.
- Change: `recalculate_round_strokes_gained` now declares the existing
  narrowly-scoped `stats_cache` lifecycle capability before updating only its
  five derived strokes-gained columns on a completed round.
- Why: the database correctly rejected general edits to completed history, but
  the intended SG recalculation path had not identified itself as the allowed
  derived write and produced false post-submit failure alerts.
