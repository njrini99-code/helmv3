# Stats And Analytics change ledger

## 2026-09-30 — Tour-only benchmarks, one putting/scrambling definition, SG rules (Q-89, Q-93)

- Change: every D1, college and division benchmark on the golf stats screens is
  now the Tour (`golf_pga_standards`; the LPGA Tour for women's teams) or is
  dropped where the Tour has no value (`src/lib/golf/benchmarks/tour.ts`,
  Priorities rebuilt on it). Putt make %, sand save and penalties have one
  definition each (`src/lib/golf/putt-make.ts`, `golf_holes.sand_save`,
  `golf_holes.penalty_strokes`); test rounds are excluded in every stats read;
  the 100-round cap applies after the countable filter; `getPlayerPatterns`
  ranks by absolute impact. The TS strokes-gained engine ends each shot at the
  next shot's start. Migration `20260930150000` (written, NOT applied) makes the
  two SG SQL functions do the same, charges a penalty to the shot that earned
  it and stores NULL SG for test rounds.
- Why: owner decisions Q-93 ("change it all to PGA moving forward, and fix
  putting and scrambling") and Q-89 (approved as recommended; applying is a
  separate go). Numbers: `docs/operations/2026-09-30-sg-penalty-and-shot-end-before-after.md`.

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

## 2026-09-07 — route `loading.tsx` fallbacks reshaped to the real first paint

- SHA: 6eccdf03d.
- Change: this feature's route Suspense fallbacks (`dashboard/stats/team`, `dashboard/roster/[id]`) were reshaped.
  No route, table, server action, data flow or business rule changed — the
  edits are confined to `loading.tsx` skeleton geometry and its ARIA
  wrapper.
- Why: the fallbacks were shape-matched to each page's SETTLED layout
  rather than the markup that paints at t=0. For a `'use client'` page
  holding its own `loading` state, the Suspense fallback is replaced by
  that component's loading branch, so reserving the populated geometry
  caused the layout shift the fallback exists to prevent. A route whose
  `page.tsx` is a pure `permanentRedirect` shim now renders `bg-canvas`
  only — no geometry, no `<h1>` for a screen that never mounts.
- Verification: every edited file was adversarially re-verified against
  its page's source, twice for the files that failed the first pass.
  typecheck 0, lint 0, build 0.
