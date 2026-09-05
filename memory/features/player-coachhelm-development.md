# Feature: Player CoachHelm And Development

## Status

- active

## Current State

Player CoachHelm and Development is the player-facing intelligence and growth surface. It combines performance insights, shot analytics, predictions, round reviews, focus areas, goals, intent, standing, genome, and development-plan progress.

This area depends heavily on shot tracking, stats, round reviews, and CoachHelm generation. It is the player-facing interpretation layer, not the raw engine.

## Primary Entry Points

### Routes

- `src/app/golf/(dashboard)/dashboard/coachhelm/**`
- `src/app/golf/(dashboard)/dashboard/my-insights/**`
- `src/app/golf/(dashboard)/dashboard/my-development/**`
- `src/app/golf/(dashboard)/dashboard/development/**`
- `src/app/golf/(dashboard)/dashboard/rounds/[id]/review/**`

### Components

- `src/components/golf/coachhelm/player/**`
- `src/components/golf/coachhelm/round-review/**`
- `src/components/golf/coachhelm/insight-card/**`
- `src/components/golf/coachhelm/v3/StandingBar/**`
- `src/components/golf/coachhelm/v3/GoalCard/**`
- `src/components/golf/coachhelm/v3/GoalCreationModal/**`
- `src/components/golf/coachhelm/v3/IntentPill/**`
- `src/components/golf/coachhelm/v3/IntentDrawer/**`
- CounterfactualLine and HeroNarrativeCard were removed; the surviving v3 components are `GoalCreationModal/`, `HoleShotPath/`, `PuttHeatmap/` and `StandingBar/`

### Actions And Engine Code

- `src/app/golf/actions/shot-analytics.ts`
- `src/app/golf/actions/intelligence-dashboard.ts`
- `src/app/golf/actions/development.ts`
- `src/app/golf/actions/player-feedback.ts`
- `src/app/golf/actions/round-reviews.ts`
- `src/app/golf/actions/v3/**`
- `src/lib/coachhelm/v2/**`
- `src/lib/coachhelm/v3/**`

## Core Data

- `golf_players`
- `golf_rounds`
- `golf_shots`
- `golf_round_reviews`
- `golf_player_focus_areas`
- `golf_insight_player_feedback`
- `golf_patterns_v2`
- `golf_predictions`
- `golf_coachhelm_settings`
- V3 tables for player genome, goals, intent, qualifying, chat, and narrative/budget support.

## Data Flow

```txt
Player opens CoachHelm
  -> load player profile, rounds, shots, predictions, patterns, settings
  -> generate insights if missing or stale where allowed
  -> render PlayerCoachHelmDashboard and V3 surfaces

Player opens My Development
  -> read golf_player_focus_areas
  -> group active, in progress, completed, paused
  -> show progress, trends, and coach-assigned focus areas

Player opens round review
  -> read generated review and related evidence
  -> player can acknowledge or rate feedback
  -> revalidate CoachHelm and development surfaces
```

## Business Rules

- Players see their own CoachHelm and development data, not arbitrary teammates.
- Coaches create development/focus areas; player development views are primarily read/progress surfaces.
- Feedback and acknowledgement actions must persist to player-specific records and revalidate player-facing pages.
- Auto-generation should not fabricate insights when source data is insufficient.
- V3 narrative and counterfactual content must preserve citation/trust rules from CoachHelm AI.
- Round review acknowledgement must not silently fail; it affects both learning and UI state.

## UI Contract

- Player CoachHelm should explain what changed, why it matters, and what action to take next.
- My Development should show focus area status, progress, target/current values, and trend in a compact way.
- Round review surfaces need clear highlights, areas to review, stats comparison, predictions, and feedback actions.
- Standing/goal/intent/hero narrative UI should be polished but not obscure source data or actionability.
- Mobile views must follow the shared app shell and avoid oversized top-of-screen chrome.

## Known Risk Areas

- Player acknowledgement/dismissal callbacks have historically been easy to render without wiring actions.
- Revalidation can miss `/golf/dashboard/coachhelm` or `/golf/dashboard/my-development`.
- Player-facing fallbacks can mask missing source data or LLM/citation failures.
- V3 surfaces evolve quickly, so docs and registry paths need frequent updates when new components land.
- **Focus-area progress is travel from baseline, never `current / target`,
  and an unresolvable metric must render no progress bar at all** — not a
  guessed one. `golf_player_focus_areas.baseline_value` (present in
  `src/lib/types/database.ts`) anchors the math;
  `getProgressPercent(current, target, metric, baseline)` returns
  `number | null`, and `null` means callers must render no bar rather than
  defaulting to a ratio. Direction is a three-state resolution
  (`'lower' | 'higher' | 'unknown'` from `resolveMetricDirection`) — never
  default an unknown direction to "higher is better", since that can render
  a full "on track" bar for a player who is meaningfully worse than target.
  `target_metric` is free text by design (the modal offers "Custom
  metric…"); anything outside the shared catalog
  (`src/lib/coachhelm/focus-areas/catalog.ts`, re-exported for UI importers
  by `src/components/fairway/pages/coachhelm/areaTypes.ts`) is legitimate
  but manual, and the card must say "Tracked manually" rather than show an
  inert bar. Baselines are recovered only where provable (an area the
  windowed driver never touched, or the first snapshot value) — guessing one
  reintroduces the fabricated-progress bug this display contract exists to
  prevent. (STU, source: `focus-area-progress-display-contract.md` and
  `focus-area-redesign.md`, both dated 2026-08-02; verified 2026-09-05 that
  `golf_player_focus_areas` and `golf_goals` exist in
  `src/lib/types/database.ts` and that the three files above exist.)
- **Windowed auto-tracking for focus areas is driven by `src/lib/golf/
  progress-drivers.ts`, a plain server module (deliberately not `'use
  server'`)**, windowing each active area's metric over rounds since the
  area's `started_at` from the round stats cache rather than an all-time,
  diluted cache. It never auto-completes an area. The two page-view hooks
  that used to also trigger it were removed deliberately — a page read that
  writes raced the CoachHelm crons into a live database deadlock — and are
  locked out by a dedicated test; do not re-add them. The round-submit
  background path is what actually drives this in production alongside the
  nightly standing-refresh cron, and it must run before any early-return
  branch in that action, or everything after the return silently never
  executes. (STU, source: `focus-area-redesign.md` dated 2026-08-02.)

## Tests To Prefer

- `src/test/app/golf/dashboard/coachhelm/**`
- `src/test/coachhelm/v3/**`
- `src/test/coachhelm/v2/post-round-trigger.test.ts`
- Browser checks for player CoachHelm, My Development, and round review on mobile.

## Related Docs

- `memory/features/coachhelm-ai.md`
- `memory/features/shot-tracking.md`
- `memory/features/stats-analytics.md`
- `memory/context/coachhelm-ai.md`
- `memory/context/golfhelm-features.md`
- `docs/v3-feature-audit.md`
