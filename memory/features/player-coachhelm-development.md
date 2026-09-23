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
- **Addendum A8 ("collect only useful context and complete the coaching
  action", folded into Pkg 9, planned 2026-09-23)**: survey found the
  select-insight -> approve -> link flow (`PromoteToFocusAreaButton` ->
  `FocusAreaModal` -> `createFocusAreaFromInsight[V2]`) and the
  completion+evaluation loop (`recordFocusAreaOutcome`) already exist and
  already satisfy "a real approved focus can be completed and later
  evaluated" — that part of A8 is not new work. The real gaps: no evidence
  revision/version is ever captured when a focus area is approved from an
  insight (`golf_coach_insights` rows are updated in place on regen, keyed by
  a stable `signature`, so `from_insight_id` is a live FK with no snapshot of
  what justified the approval); no practice-completion or review-criteria
  persistence exists tied to a focus area (`golf_practice_sessions` is an
  unrelated shot-log import table; PracticeRx is read-only by design); no
  read-time invalidation badge exists for when an insight's evidence changes
  after a focus area was built on it. Approved plan is 3 slices, in order:
  (1) stamp an evidence-revision fingerprint at approval time — needs an
  additive migration (`golf_player_focus_areas.evidence_revision text NULL`),
  gated behind a `config/feature-flags.yml` flag defaulted off until that
  migration is applied to prod, since writing to a column that doesn't exist
  yet would break focus-area creation outright; (2) practice completion +
  review criteria via a new `practice_log jsonb` column, reusing
  `updateFocusAreaProgressImpl`'s existing select-filter-reselect
  concurrency pattern; (3) a read-time-only badge comparing the stored vs.
  live evidence revision, same "derive at read time, never persist a
  re-check" contract as `due-for-review.ts` (Pkg 9 slice 4) — never touches
  status, never overwrites the stored revision, so the prior accepted
  version is preserved exactly. Slice 4 from the original addendum (shot-level
  intent/strike/target annotations — confirmed no existing table anywhere in
  the schema, `golf_shots` has only a generic `notes` text column) is
  DEFERRED, not built in this pass; it would need a genuinely new table +
  RLS surface and the acceptance bar doesn't require it. The pure,
  Supabase-free fingerprint core both slice 1 and slice 3 depend on is
  `src/lib/coachhelm/focus-areas/evidence-revision.ts`
  (`computeEvidenceRevision`/`EvidenceRevisionInput`/
  `canonicalizeForFingerprint`) — order-independent SHA-256 over
  status/confidence/your_value/comparison_value/secondary_value/sample_n/
  window/engine_version, deliberately excluding ids and bookkeeping
  timestamps so a no-op regen never changes the fingerprint.
  **Slice 1 (built, PR stacked on #1995 "Depends on #1995")**: migration
  `20260923090000_golf_focus_area_evidence_revision` adds
  `golf_player_focus_areas.evidence_revision text NULL` (additive, no
  backfill, no RLS/grant change -- not yet applied in prod). Write is gated
  behind the `coachhelm_focus_area_evidence_revision` flag
  (`config/feature-flags.yml`, `type: temporary_migration`, off in every
  environment) whose purpose notes the migration dependency; flip it on only
  after the owner applies the migration and confirms the column exists via
  `information_schema.columns`.
  `src/lib/coachhelm/focus-areas/evidence-revision-source.ts` bridges a live
  `golf_coach_insights` row's untyped `evidence` `Json` column into
  `EvidenceRevisionInput`, defensively returning `null` (never throwing) for
  any legacy/malformed row.
  `src/app/golf/actions/development.ts`'s private
  `resolveEvidenceRevisionForInsight` checks the flag first (never reads
  `golf_coach_insights` while off) and stamps `evidence_revision` in
  `createFocusAreaFromInsightV2Impl` and the legacy
  `createFocusAreaFromInsightImpl`; `createFocusAreaFromReviewImpl` is
  untouched since it has no source insight (`from_review_id`, not
  `from_insight_id`). `FocusAreaCard` renders a small "Evidence snapshot
  recorded" badge only when `evidence_revision` is present -- never the raw
  hash. The `intelligence`/`coachhelm` page loaders do NOT yet select
  `evidence_revision` (the column does not exist in prod); that read wiring
  is slice 3's job, behind the same flag. A pgTAP assertion in
  `supabase/tests/rls/wave_a_db_security.sql` guards the column stays a
  nullable `text` (not yet run locally -- no Docker/local Supabase stack
  available in this session; CI's Supabase lint + RLS tests job is the
  verification gate).
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
- **`src/lib/coachhelm/v3/ranking/situational-ranking.ts`** (2026-09-23,
  addendum §13, work package A6 slice 1, pure core, not wired to a route,
  component, or `ranking/score.ts` yet) — `groupIssues(packets)` groups
  par/distance/sequence/hypothesis findings that describe the same
  underlying shots into one `Issue` instead of letting a future feed show
  the same pattern three times or triple-count its stroke impact. Grouping
  runs before eligibility filtering (an ineligible packet can still bridge
  two eligible ones without splitting a real chain); each issue then picks
  exactly one deterministic impact owner among its ELIGIBLE member claims
  — only a genuine strokes-LOST (negative) claim may own, never a
  strength or a null — and mirrors only that owner's own numbers
  (including its own sample size) into its `policyInput`, so "one
  underlying issue, one leading priority" holds without discarding the
  other perspectives (they stay visible as drill-down claims). Full
  contract in `docs/architecture/coachhelm-evidence-contract.md`'s "Issue
  grouping and ranking-input unification" section and
  `memory/features/coachhelm-ai.md`.

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

- **Practice-completion log + coach criteria (Addendum A8 slice 2, folded
  into Pkg 9, 2026-09-23, `agent/coachhelm-a8-practice-log`)**:
  <!-- schema-drift-absent: golf_focus_area_practice_sessions -->
  `golf_focus_area_practice_sessions` is named below even though it is not
  yet in the schema snapshot — its migration has not been applied to
  production (owner's apply queue). Two new, additive surfaces added by
  `supabase/migrations/20260923110000_golf_focus_area_practice_log.sql`,
  both gated behind
  `coachhelm_focus_area_practice_log` (default off everywhere, zero reads
  or writes of either surface while off):
  - `golf_player_focus_areas.criteria` — a small, coach-authored jsonb list
    of "done" definitions (`{entries: [{id, label, source, created_at, met,
    met_at}]}`), capped at 10 entries, written via a compare-and-swap on
    `updated_at` with one retry (`addFocusAreaCriterion`,
    `setFocusAreaCriterionMet` in the new
    `src/app/golf/actions/focus-area-practice-log.ts`).
  - `golf_focus_area_practice_sessions` — a NEW append-only table (not a
    jsonb array, to avoid a read-modify-write losing a concurrent append)
    logging actual practice completions, idempotent on
    `UNIQUE(focus_area_id, client_request_id)` via `ON CONFLICT DO NOTHING`
    (`logFocusAreaPracticeSession`); a repeated `client_request_id` returns
    `{success: true}`, not a failure. RLS mirrors
    `golf_player_focus_areas`' own visibility by re-running its SELECT
    policy inside an `EXISTS` subquery, rather than re-deriving
    player/coach access a second time; append-only at both the RLS and grant
    layer (no UPDATE/DELETE policy, no UPDATE/DELETE grant for
    `authenticated`).
  - Deliberately a NEW action file, not `development.ts` — that file was
    under concurrent edit by two other in-flight A8 slices (evidence
    revision / evidence badge) when this slice started, and this keeps
    those rebases conflict-free.
  - **Deliberately out of scope for this slice**: loader/UI wiring. Neither
    the `intelligence`/`coachhelm` page loaders nor `FocusAreaCard` read or
    render `criteria` or practice sessions yet — those files are owned by
    the two concurrent A8 slices above, and wiring here would guarantee a
    conflict. A follow-up slice wires the read side once this slice lands.
  - The new pgTAP suite
    (`supabase/tests/rls/golf_focus_area_practice_sessions.sql`) has not
    been run locally (no Docker/local Supabase stack available in this
    session) — CI's "Supabase lint + RLS tests" job is this suite's first
    real run.

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
