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
- Cohort/benchmark constants (2026-09-23, repair plan N16): `v3/counterfactual/cohort-baselines.ts` anchors carry `provenance: 'measured' | 'derived'` per value — women's anchors are always `'derived'` (LPGA/NCAA discounted to college, never a measured women's-college population stat); a `'derived'` label must read as a target/estimate, never an average/norm. Full contract in `docs/architecture/coachhelm-evidence-contract.md`.
- Round review acknowledgement must not silently fail; it affects both learning and UI state.

## UI Contract

- Player CoachHelm should explain what changed, why it matters, and what action to take next.
- My Development should show focus area status, progress, target/current values, and trend in a compact way.
- Round review surfaces need clear highlights, areas to review, stats comparison, predictions, and feedback actions.
- Standing/goal/intent/hero narrative UI should be polished but not obscure source data or actionability.
- Mobile views must follow the shared app shell and avoid oversized top-of-screen chrome.
- A route's `loading.tsx` reserves the page's paint at t=0 — for a
  `'use client'` page holding its own `loading` state that is that
  component's loading branch, not its settled layout. A route whose
  `page.tsx` is a pure `permanentRedirect` shim renders `bg-canvas` only:
  no geometry, and no real `<h1>` for a screen that never mounts.
  Reference implementation: `dashboard/alerts/loading.tsx`.

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

- **Coach-facing "due for review" queue (Pkg 9 slice 4, 2026-09-23,
  `agent/coachhelm-focus-due-queue`)**: "due" is derived AT READ TIME from
  `target_date` — overdue or due within a window (default 7 days, inclusive
  both ends) — never written to a column or a cron, so an edited target date
  is reflected on the very next read. Lives in
  `src/lib/coachhelm/focus-areas/due-for-review.ts` (pure, no `'use server'`
  directive — `development.ts` IS `'use server'`, which only permits
  async-function exports, so a plain derivation helper cannot live there),
  consumed by the coach UI's `DueForReviewPanel`
  (`components/fairway/pages/coachhelm/`), which derives its list
  client-side from the SAME `focusAreas` prop `PlayersGridView` already has
  (the `intelligence/page.tsx` loader already selects
  `target_kind`/`target_date`) — no new fetch for the badge. Only
  `'active' | 'in_progress' | 'paused'` areas with `target_kind === 'date'`
  are ever "due" — `'proposed'` (not yet accepted) and
  `'completed'`/`'declined'` never are, mirroring
  `ACTIONABLE_FOCUS_AREA_STATUSES`. `target_kind === 'rounds'` timeframes are
  explicitly OUT of scope for this slice (no round-count context is
  fetched) — left for later.
  **Timezone (#1998 review fix)**: `target_date` is a coach-local CALENDAR
  date (an `<input type=date>` value), not a UTC instant. The first version
  compared it against `new Date()` read in UTC — the exact #1487 bug
  `src/lib/golf/timezone.ts`'s `todayIsoInZone` /
  `src/lib/golf/task-overdue.ts`'s `isGolfTaskOverdueInZone` already exist to
  prevent: from the evening on, west of UTC, an area due TODAY read
  `'overdue'` for hours. Fixed by requiring every caller to pass an
  already-resolved `todayIso` (`YYYY-MM-DD`) — no `Date`, no default.
  `intelligence/page.tsx` resolves it ONCE, server-side, via
  `todayIsoInZone(teamTimezone)` where `teamTimezone` comes from
  `golf_team_settings.timezone` (default `'America/New_York'`, same pattern
  `dashboard-data.ts` already uses), and threads it down through
  `playersDrillProps.todayIso` → `PlayersGridView` → `DueForReviewPanel`.
  `DueForReviewPanel` (a client component) must never compute "today" itself
  — SSR runs UTC and hydration runs the browser's zone, so a client-side
  `new Date()` default would ALSO be a hydration-mismatch risk on top of
  being the wrong zone.
  A team-scoped server action (`listDueFocusAreas`) existed briefly in this
  slice but was removed (#1998 review) for having no production caller —
  the UI needs none, since it derives from data the page already loads. Add
  it back, tested, when an actual caller (e.g. a notification digest) needs
  it server-side.
  **Follow-up, not yet fixed**: `intelligence/page.tsx`'s
  `golf_player_focus_areas` query (the one that feeds `focusAreas`, and
  therefore this panel) has no pagination. Past 1,000 rows for a team,
  PostgREST's cap silently truncates it and both `RosterHealthHeader` and
  `DueForReviewPanel` under-report — same class of bug
  `.claude/rules/database.md` calls out generally, not yet applied here.

- **Duplicate-active-work guard (Pkg 9 slice 1a, 2026-09-23,
  `agent/coachhelm-focus-dedup`)**: all 5 focus-area create paths
  (`createFocusArea`, `createPlayerFocusArea`, `createFocusAreaFromReview`,
  `createFocusAreaFromInsightV2`, `createFocusAreaFromInsight`) now call a
  shared `findActiveFocusAreaForMetric(client, player_id, target_metric)`
  pre-check before inserting. A match on the SAME canonicalized
  `target_metric` (via `resolveFocusTargetMetric`) whose status is
  `'proposed' | 'active' | 'in_progress' | 'paused'` blocks the insert and
  returns `{ success: false, error: ACTIVE_FOCUS_DUPLICATE_ERROR,
  duplicateFocusAreaId }` instead — `'completed'`/`'declined'` areas never
  block a new one. App-level only, no schema change: prod
  (`golf_player_focus_areas`, checked read-only 2026-09-23) already has one
  duplicate-active pair on the same player/metric, so a partial unique index
  would fail until an owner picks which row to keep. That index (plus an
  `evidence_revision` column) is deferred to slice 1b pending that decision.
  `recordInsightAction` (`event-ledger.ts`) gained the same same-day dedup
  `recordInsightExposure` already had (#1506 pattern), keyed on `(insight_id,
  actor_id, action_type)` via `effectiveness/action-rows.ts`, so a
  double-submit that DOES get past the guard (a genuine race between the
  read and the insert) still can't double-count as two ledger actions.
  Known limitation (#1995 review, deferred): the ledger dedup key is
  `(insight_id, actor_id, action_type)` — it does NOT include
  `focus_area_id`. A second genuine `create_focus_area` action on the SAME
  insight but a DIFFERENT target metric (now possible since the duplicate
  guard only blocks a repeat of the same metric) is deduped away as if it
  were the earlier one, undercounting the display-only `acted` signal in
  `TrustSignal`. This does not affect the duplicate-active-work guard
  itself (a separate check, keyed on player+metric) — only the ledger's
  action count can read low. Fixing it means widening the dedup key, a
  follow-up slice.

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

Stats uses CoachHelmShell as its only horizontal container, including the loading fallback. On
phones, selected development/standing/detail views prioritize their content over the overview spine;
desktop retains its side-by-side context. The round scope picker and Log round action retain 44px
touch targets. What-if results reveal with opacity/translation rather than animated layout height,
and honor reduced motion.
