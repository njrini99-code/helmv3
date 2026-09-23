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
- `src/app/golf/actions/round-review-sequence-attribution.ts`
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
- Package 10 anchor choice (owner decision, 2026-09-23): comparable-method attribution's `interventionAt` anchors on an insight's first qualifying `golf_insight_action` (`INTERVENTION_ACTION_TYPES` in `causality/comparable-attribute.ts` — `create_focus`/`acknowledged`/`resolved`, confirmed by the owner including `'acknowledged'` alone) when one exists, else falls back to first exposure (`shown_at`). The action wins even if it is earlier than the exposure — a gap in the exposure ledger is not evidence the action didn't happen. `anchor_kind` ('action' | 'exposure') is derived at READ time (`attribution-read.ts`'s `attachAnchorKind`) via an exact timestamp-string match against `golf_insight_action.created_at`, never "does any action exist for this insight" — the latter would silently reclassify an old exposure-anchored row the moment an unrelated LATER action appears, since attribution rows are written once but actions are append-only. The view model (`attribution-view-model.ts`) renders "(since first shown)" for `anchor_kind: 'exposure'` and "(since you acted on it)" for `anchor_kind: 'action'` (owner-confirmed wording). No migration — not persisted, no column exists for it.

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
- **Observed-outcome language (repair-plan §14.12, 2026-09-23)**: any
  coach- or player-facing string, and any chat/LLM-facing text, that states
  an insight's outcome must use hedged, honest wording — never "proven",
  "caused by", "guaranteed", or a quantified "Saved N strokes" claim, unless
  the underlying data is an actual measurement, not an estimate or a
  self-report. Guarded by
  `src/test/coachhelm/observed-outcome-language.test.ts` (an AST-walk over
  string/template literals and JSX text, not a raw-text regex — comments
  and identifiers are never checked, so engineering prose about
  causality/lift/proof can't false-positive).

## Known Risk Areas

- `upsertInsight`'s optimistic CAS (`src/lib/coachhelm/v2/insights/upsert.ts`,
  `updateExisting`) guards both `lifecycle_state` and `updated_at` (2026-09-23
  — closed the §15.2 "old worker finishes after a new revision" gap). On a
  CAS miss it re-reads the row: a genuine lifecycle change (dismiss/
  acknowledge/archive/resolve, or another lifecycle write) always wins with
  no retry; a same-lifecycle evidence-only race retries ONCE, and only if
  the incoming evidence (`isEvidenceNewer`: later `window_end`, or same
  `window_end` with a larger `sample_n`) is actually newer than what the
  re-read finds — otherwise the write is dropped, never overwriting a
  concurrent newer revision. The exhausted-retry-while-still-newer case pages
  at `error` severity with no `skipSentry` (a real evidence loss, not an
  expected backoff); the stale-worker case logs at `warning` with
  `skipSentry: true`. `isEvidenceNewer` compares `window_end` as parsed
  instants, not raw strings — v2 mining writes a date-only `YYYY-MM-DD`
  while several v3 evidence builders write a full timestamp, and a same-day
  string compare would otherwise misjudge the shorter form as older. `.eq`
  passes through the exact `updated_at` string read from PostgREST
  (microsecond-precision `timestamptz(6)`), never a JS-reserialized value.
  `upsertInsightV3`'s `engine_version` stamp (`upsert-v3.ts`) only matches a
  row when it isn't already `'v3'`, so a repeat v3 write doesn't burn the one
  CAS retry bumping `updated_at` for a no-op stamp. `evidenceRevisionKey`
  (the separate maturation-confirmation dedup key, §15.2 row 12) was
  investigated and found NOT to need a content component: it gates only
  `metadata.maturation_keys`, never the evidence write itself, and per plan
  §5.2 a same-round correction correctly should not add a second maturation
  confirmation.
- **Follow-up, not yet done (2026-09-23):** `generator-base.ts`'s and
  `synthesis.ts`'s archive/retraction sweeps (`generator-base.ts:483-497`,
  `synthesis.ts:545`) compare-and-set on `lifecycle_state` alone, with no
  `updated_at`/revision guard. Unlike `updateExisting`, they write a terminal
  administrative state (archived), not evolving evidence, so the CAS miss
  they already handle (skip cleanly, no retry) covers their own race — but a
  sweep's write can still silently discard a *concurrent unrelated refresh's*
  metadata (e.g. a movement/maturation update landing between the sweep's
  read and its write) since it only guards the field it itself intends to
  change. Not fixed here — flagged as a follow-up scoping question, not a
  confirmed bug, since it may be within these sweeps' intended scope.
- Player acknowledgement/dismissal callbacks have historically been easy to render without wiring actions.
- Revalidation can miss `/golf/dashboard/coachhelm` or `/golf/dashboard/my-development`.
- Player-facing fallbacks can mask missing source data or LLM/citation failures.
- V3 surfaces evolve quickly, so docs and registry paths need frequent updates when new components land.
- **Repair-plan §14.12 audit, observed-outcome language (2026-09-23)**: found
  and fixed one live bug — `InsightCard.tsx`'s `OutcomeBadge` rendered
  "Saved {impact} strokes/rd" once a player/coach marked a focus area's
  insight `improved` (`golf_coach_insights.outcome_status`, a HUMAN
  self-report via `recordFocusAreaOutcomeImpl`, unrelated to
  `golf_insight_outcome_attribution`/`method_version`). `impact` is
  `evidence.strokes_impact`, the insight's GENERATION-TIME counterfactual
  estimate ("strokes recoverable IF fixed" — never a post-outcome
  measurement, see `patternToInsightVocabulary.ts`), so the badge presented
  an old estimate as a measured saving. Fixed to the same hedged "~N str/rd
  at stake" phrasing used everywhere else this field is shown. Also fixed a
  stale comment claiming `outcome_status`/`outcome_measured_at` weren't yet
  projected by `INSIGHT_SELECT` — they have been for a while, so the badge
  was live (confirmed rendering in `FairwayPlayerInsight.tsx`,
  `audience="coach"`), just untested (no prior test covered it).
  Audited and found ALREADY correct, no fix needed: the trust ladder
  (`deriveTrustStatus`/`FairwayEffectiveness.tsx`, renamed off `'proven'` in
  N9) and `MovementPill`'s "↑ +6pt since 12 days ago" (plain magnitude +
  direction, no causal wording) both already use honest, hedged language.
  `FocusAreaCard.tsx`/`RosterHealthHeader.tsx`'s plain "Improved"/"Worsened"
  tally labels are a human's own self-report echoed back, not a system-
  asserted claim, so left as-is. `DiagnosisPanel.tsx`'s "Caused by" is a
  DIFFERENT axis (root-cause diagnosis of a symptom, with its own honest
  measured-fact-vs-hypothesis chip) and was deliberately NOT touched here —
  named as a candidate for a future, separate review rather than expanded
  into this slice. Admin-only analytics (`effectiveness_score`/
  `improvement_rate` on `app/admin/golf/page.tsx` etc.) are an internal
  audience reading a raw score, out of scope. Guard test:
  `src/test/coachhelm/observed-outcome-language.test.ts`.
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
  **Slice 3 (built, PR "Depends on #2004", no migration)**: read-time-only
  "evidence has changed since this was approved" check, same "derive at read
  time, never persist a re-check" contract as `due-for-review.ts` (Pkg 9
  slice 4) -- never writes `evidence_revision` or `status`, so the prior
  accepted version is preserved exactly.
  `src/lib/coachhelm/focus-areas/evidence-revision-status.ts`'s pure
  `compareEvidenceRevision(stored, live)` returns `'match' | 'changed' |
  'unknown'`; `'unknown'` (stored absent, or the live insight couldn't be
  recomputed) always renders nothing -- an unverifiable comparison must never
  be reported as a confirmed mismatch.
  `src/lib/coachhelm/focus-areas/load-evidence-revision-status.ts`'s
  `computeEvidenceRevisionStatuses` is the flag-gated batched loader: while
  the flag is off it makes zero `golf_coach_insights` reads; while on, it
  collects the distinct `from_insight_id`s among focus areas that already
  carry a stored `evidence_revision`, fetches each live insight once via
  `fromUntyped`, and maps id -> `'match' | 'changed'` (an id absent from the
  map means "render nothing", uniformly with `'unknown'`).
  Both `intelligence/page.tsx` and `coachhelm/page.tsx`'s focus-area selects
  now route through `fromUntyped` unconditionally (its `any` return made a
  typed/untyped client ternary untypeable; the SELECT COLUMN LIST still only
  adds `evidence_revision` when the flag is on, so with it off the actual
  query text is byte-for-byte unchanged from before slice 1/3). `FocusAreaCard`
  takes a new `evidence_revision_status?: 'match' | 'changed'` field (computed
  by the loader, never a raw DB column) and swaps its slice-1 "Evidence
  snapshot recorded" badge for a `tone="warning"` "Evidence has changed since
  this was approved" badge only when the status is `'changed'`.
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

- **Follow-up eligibility (Pkg 9 gap 2, owner decision 2026-09-23,
  `agent/coachhelm-a9-flow-integration`)**: before this, nothing in the
  codebase named or computed "follow-up eligibility" — the closest real
  mechanism was `findActiveFocusAreaForMetric`'s duplicate-active guard
  (`development.ts`), which answers "is a second area on this metric
  permitted at all", not "should the coach create one now". Owner rule:
  eligible when (`status === 'completed'` OR today is past `target_date`
  while the area is still `active`/`in_progress`/`paused`) AND the player
  has played `>= FOLLOW_UP_ROUNDS_THRESHOLD` (3) completed `golf_rounds`
  since the area's real start (`started_at`, from `acceptFocusArea` — never
  `created_at`; a `'proposed'` area was never accepted, so it never reads as
  "past its target date" here either). Under-threshold areas surface with a
  `"waiting for rounds (n/3)"` label instead of being omitted. Deliberately
  does not feed Package 10 outcome measurement (whether the metric actually
  improved) — eligibility only.
  Split like `due-for-review.ts`/`practice-log-loader.ts`:
  `src/lib/coachhelm/focus-areas/follow-up-eligibility.ts` is the pure core
  (`followUpEligibilityReason`/`computeFollowUpEligibility`, no
  `'server-only'`, importable from a client component) and
  `follow-up-eligibility-loader.ts` is the `'server-only'` `golf_rounds`
  batch read (`loadFollowUpRoundCounts`, chunked + paged per
  `.claude/rules/database.md`), returning `null` — not an empty Map — on a
  read failure so a caller never confuses "read failed" with "zero rounds
  played". Wired into the SAME `DueForReviewPanel` as a second, independent
  section ("Follow-up eligibility", distinct from "Due for review" above):
  `intelligence/page.tsx` calls the loader once (parallel with
  `loadFocusAreaPracticeLogData`), converts the `Map` to a plain
  `Record<string, number> | null` (Maps don't cross the server/client
  boundary), and threads it through `playersDrillProps.followUpRoundCounts`
  → `PlayersGridView` → `DueForReviewPanel`, which classifies client-side
  against the SAME `focusAreas` prop — no new focus-area fetch, only the
  one new `golf_rounds` read.
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
- **`src/lib/coachhelm/v3/reasoning/hypothesis-policy.ts`** (2026-09-23,
  addendum §13, work package A5 slice 1, pure core, not wired to a route
  or component yet) — `buildHypotheses(metrics, facts)` proposes a small,
  named set of candidate explanations (`short_bias`, `rough_gap`,
  `recovery`, `par5_opportunity_loss`, plus a non-family `'insufficient'`
  entry) for a round's shot data, never a fabricated cause and never a
  psychology/fatigue/mechanics inference. It distinguishes `'no_data'`
  (nothing but a stated gap — e.g. `recovery`, which has no metric
  producer today) from `'candidate'` (a real, if uncorroborated, pattern
  match) so a future consumer surface can't read a bare gap as if it were
  weak-but-real evidence; `description` text varies with that state
  (hedged vs. association wording) rather than reading identically
  regardless of confidence. Full contract in
  `docs/architecture/coachhelm-evidence-contract.md`'s "Controlled
  hypotheses" section and `memory/features/coachhelm-ai.md`.
- **`src/lib/coachhelm/v3/eval/shadow-harness.ts`** (2026-09-23, addendum
  §13, work package A10 slice 1, pure, not wired to a route or component):
  `runShadowEvaluation(snapshot)` runs every new v3 family (A2/A3/A4 both
  layers/A5/A6) over one de-identified fixed snapshot and reports
  per-family support status plus two invariant counters that must both be
  `0` — one flagging a hypothesis whose "supported" state isn't actually
  backed by a real supported metric, one flagging a shot or owning claim
  credited to more than one grouped issue. Proven against a real 2×2
  new-vs-established-roster / complete-vs-incomplete-data fixture matrix,
  not just hand-picked numbers. Full contract in
  `docs/architecture/coachhelm-evidence-contract.md`'s "Shadow-mode
  evaluation harness" section and `memory/features/coachhelm-ai.md`.

- **`situational-ranking.ts` slice 2** (2026-09-23, addendum §13, A6 slice
  2, still pure core): sequence packets now gate eligibility on the #2020
  rollup's own per-kind support status instead of one event's own
  resolution, closing a gap where a single hole could found an issue with
  no real population behind it. New `Issue.evidenceKey`, a pure
  `applyMaterialChangeSuppression` (never drops an issue, suppresses only
  a matched, unchanged-or-under-50%-worse intervention, mutation-verified
  at the 50% boundary), and a pure `issueToRankableInsight` adapter that
  proves "one issue, one leading priority" at the ranked-output level.
  Still not wired to a route, component, or live ranking read. Full
  contract in `docs/architecture/coachhelm-evidence-contract.md`'s "Issue
  grouping and ranking-input unification (A6 slice 2)" section and
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
- Chart/label honesty (2026-09-23, Package 11): `ShotAnalysisCard.tsx`'s
  "Key Weaknesses" now filters ranked contexts to `avgSG < 0` before slicing
  the top 3 — the prior derivation only stable-sorted by sample-size tier
  and never excluded a net-positive context, so a strong player could see a
  genuine strength rendered red, unsigned, under "Key Weaknesses". An
  all-positive ranked list now renders an honest "at or above par" note
  instead of hiding the section. `WhyPopover.tsx`'s generated-explanation gap
  label now suffixes strokes/yards/feet the same way its paired comparison
  value already does (`formatComparisonValue`) — only `percent` had a unit
  before.

## §15.2 Regression Fixture Matrix (repair plan, 2026-09-23)

Coverage audit of the repair plan's 43-row fixture matrix against `main`. Each
row cites the test that pins it, or notes the gap. "Real bug" rows are
`it.fails` reproducers added in this pass — not fixed here; see the PR that
introduced this table for the repro and report.

| # | Fixture | Status | Evidence |
|---|---|---|---|
| 1 | Player with 1–2 rounds under a three-round policy | Covered | `analysis-outcome.test.ts:24`, `post-round-trigger.test.ts:149`, `coachhelm-safety-net-reconcile.test.ts:132` (real cron caller: a parked round is excluded from the sweep, no engine call) |
| 2 | Third eligible round arrives | Covered | `coachhelm-safety-net-reconcile.test.ts:149` (real cron caller: "round 3 wakes the player: the never-processed sweep runs it, and its success covers rounds 1–2"); also `post-round-trigger.test.ts` new test "a parked round is not stuck…" |
| 3 | No active membership | Covered | `coachhelm-safety-net-reconcile.test.ts:207` (real cron caller: "no membership stays quiet until a roster row appears, then gets ONE run" — proves no repeated retry) |
| 4 | Team deliberately disabled | Covered | `coachhelm-safety-net-reconcile.test.ts:248` ("team disable stays quiet until both switches are on") and `:268` ("a coach-level disable keeps the round parked even when the team switch is on") — the reconcile sweep IS the repair/backfill path, and both prove it honors the disable |
| 5 | Tentative, unchanged value, newly sufficient sample | Covered | `upsert-tentative-promotion.test.ts:138` |
| 6 | Tentative, moved value, newly sufficient sample | Covered | `upsert-tentative-promotion.test.ts:152` |
| 7 | Sample adequacy fixed while recency decreases | Covered | `confidence-honest-monotone.test.ts:25` |
| 8 | Same evidence scanned on three nights | Covered | `lifecycle-policy.test.ts:109`, `upsert.test.ts:325` (DI-1) |
| 9 | Coach dismisses while worker runs | Covered | `upsert-tentative-promotion.test.ts:214` (CAS race, asserts no push); dismiss writes `lifecycle_state:'archived'` at `src/app/golf/actions/insights.ts:1454` |
| 10 | Old worker finishes after a new revision | **Missing — real bug** | new `it.fails`, `upsert.test.ts` "stale write vs. a concurrent newer revision"; CAS only guards `lifecycle_state`, not revision |
| 11 | Same round revision delivered twice | Covered | `upsert.test.ts:325` (DI-1 dedup), `round-review-system.test.ts:219,243` |
| 12 | Corrected round within 24 hours | Covered | `upsert.test.ts` "corrected-round, same revision key" — resolved per plan §5.2's maturation correction, not a code fix: `evidenceRevisionKey` gates only `metadata.maturation_keys` (lifecycle-policy.ts:119), never the evidence write itself, so a same-day correction is already written/processed on main; it correctly does not add a second maturation confirmation for the same round (§5.2: "require new contributing rounds or meaningful independent opportunities") |
| 13 | Some generators fail, others succeed | Partial | per-generator gate: `generator-base-run-lifecycle.test.ts:217`; orchestrator-level `tier1Generators`/`Promise.allSettled` aggregation untested — `it.todo`, `fixture-matrix-gaps.test.ts` |
| 14 | Missing unit on a legacy shot | Covered | `shot-context.test.ts:53-55` — `normalizeShotValue(128, null/undefined/'')` returns `{kind:'missing', reason:'no_unit'}`, never a silent conversion |
| 15 | Mixed before/after feet and yards | Covered | `ApproachMissGenerator.test.ts:153,280` |
| 16 | OB from tee and mid-hole, entered/here variants | Covered | `use-penalty-handler.test.ts:42` (tee), `:69` (mid-hole, replays from that shot's own spot), `:106-134` ('entered'/'here' origin); undo both-row semantics: `shot-mutation-recovery.test.ts:544,563,583` |
| 17 | Scorecard-only round | Partial | shot-diagnosis abstention covered — `shot-context.test.ts:398-412` (`no_shots_recorded`), `par-opportunities.test.ts:183-193` (`incomplete_sequence` exclusion); "scoring facts permitted" half is an architectural guarantee (`HoleContext` sourced from `golf_holes`, never derived from shots — `build-hole-sequence.ts` module doc), not directly proven end-to-end — `it.todo`, `fixture-matrix-gaps.test.ts` |
| 18 | Nine-hole round | Covered | `composite-rating.test.ts:75`, `scoring-trend.test.ts:28`, `round-regime.test.ts:59`, `putts-per-round.test.ts:14` (18-hole-equivalent normalization); `holes-played-assert.test.ts` (submitted `holes_played` must match actual hole entries — no imaginary holes) |
| 19 | Layup/recovery in long-approach bucket | Covered | `distance-profile.test.ts:219` |
| 20 | Par-3 tee miss | Missing (SQL layer) | exclusion lives in `recompute_golf_round_totals`, no pgTAP fixture — `it.todo`, `fixture-matrix-gaps.test.ts` |
| 21 | Missing miss directions | Partial | `ApproachMissGenerator.test.ts:411` (off-green-only tally) is adjacent, denominator/coverage reporting unconfirmed |
| 22 | Short misses under unknown conditions | Covered | `ApproachMissGenerator.test.ts:363` |
| 23 | Rough/sand shots with no pin geometry | Partial | `composite-w305.test.ts:380` describe block exists, exact fixture unconfirmed |
| 24 | Same event contributing to multiple generators | Missing (no code path) | A6 `groupIssues` (#2003) unmerged and unwired — `it.todo`, `fixture-matrix-gaps.test.ts` |
| 25 | Women's estimated target | Covered | `ApproachMissGenerator.test.ts:223` |
| 26 | Percent headline plus feet standing | Covered | `ApproachMissGenerator.test.ts:331` |
| 27 | Old review created after new review | Covered | `round-review-chronology.test.ts:168,231` |
| 28 | Historical review with later rounds available | Covered | `round-review-as-of.test.ts:158,177` |
| 29 | Status-filtered second page | Covered | `round-review-chronology.test.ts:179` |
| 30 | Two simultaneous missing-review creators | Covered | `round-review-system.test.ts:219,243` |
| 31 | Existing published/annotated review during backfill | Missing (no testable surface) | `scripts/coachhelm-prewarm-round-reviews.ts` has no exported helpers, no test file — `it.todo`, `fixture-matrix-gaps.test.ts` |
| 32 | Known number attached to wrong statistic | Covered | `claim-validator.test.ts:54` (`wrong_field`) |
| 33 | Unsupported claim using an exempt small number | Covered | `claim-validator.test.ts:66` (`unsupported_small_number`) |
| 34 | Correct percentage complement or rounding | Missing (no code path) | no metric-derivation registry exists — `it.todo`, `claim-validator.test.ts` |
| 35 | Correct number for wrong player/team | Covered | `claim-validator.test.ts:124` (`wrong_player`) |
| 36 | LLM provider failure | Covered | two independent surfaces, both tested: `round-review-system.test.ts` "falls back to the rule-based review instead of failing when the CoachHelm/LLM provider throws" (`reviewContent` is built deterministically before the CoachHelm/LLM enhancement is attempted; a thrown provider error is caught and the deterministic content ships with `ai_model_version: 'rule-based-v2'`); and, for round-recap generation, `round-recap-llm-provider-failure.test.ts` (#2019) — a real wiring-level test (only `ai`'s `generateText` mocked, `compose.ts`/`round-recap.ts` real) proving `generateRoundRecap` falls back to `buildDeterministicRecap`'s exact output end to end, persisted via the RPC, call-logged `fallback_to_template`, provenance `source: 'deterministic'`, no LLM text leaked — complements the unit-level `compose.test.ts:312`. (Note: `deterministic-review.ts` is NOT this fallback's live path — that's the prewarm script only; the live fallback is `buildDeterministicRecap` in `round-recap.ts`.) |
| 37 | Cached fallback after transient failure | Partial | two real mechanisms, neither tested: `round-reviews.ts`'s `generateRoundReviewImpl` (`MAX_GENERATION_ATTEMPTS`, likely legacy/no live caller) and the active `useRoundReviewV2.ts` hook (stable read of an existing `summary`, `autoGenAttempted` bounds automatic regeneration to once per mount, deliberate `generate()` still available) — proving the hook needs a renderHook harness, not a fake client — `it.todo`, `fixture-matrix-gaps.test.ts` |
| 38 | Chat fails validation after generating text | Covered | separate mechanism confirmed (not `claim-validator.ts`): `auditNumericClaims` (`chat-provenance.test.ts`, extensive) flags an unsupported number post-generation, wired live-stream-side in `stream/route.test.ts:404-444` (MUST-FIX #1, `data-grounding-flag` emitted on the wire, not just discovered on reload) and `:513`; the flag is durably persisted and replayed on reload, not dropped — `chat-restore.test.ts:31-41` and, at the actual reload ENDPOINT (not just the persistence layer), the new `conversations/[id]/route.test.ts` (#2019) proves a stored failed/ungrounded turn comes back with `status: 'failed'`, its `UNGROUNDED_NOTE` content, and its `data-grounding-flag` UI part all intact |
| 39 | Focus assigned, no practice completion data | Missing (no code path) | no completion-tracking concept in `focus-areas/` — `it.todo`, `fixture-matrix-gaps.test.ts` |
| 40 | Practice improves, course data sparse | Missing (no code path) | `it.todo`, `fixture-matrix-gaps.test.ts` |
| 41 | Two of three follow-ups improve | Missing (no code path) | `it.todo`, `fixture-matrix-gaps.test.ts` |
| 42 | Transfer/assistant coach/multi-team | Partial | write-scoping covered: `upsert-coach-scoping.test.ts:53`; broader read-access-control unconfirmed |
| 43 | Silent night with no new rounds | Covered | `engine_no_recent_rounds` maps to the healthy `waiting_for_data` outcome kind (`analysis-outcome.test.ts:37,137`), routed to info-level logging with `skipSentry:true` and never `logServerError` (`coachhelm-safety-net.test.ts:481-492`), and parks the round without a hard failure stamp (`post-round-trigger.test.ts:181-198`) — the engine never reaches `upsertInsight` on this early-exit path, so nothing is fabricated |

Two real, pre-existing bugs surfaced by this audit (reported, not fixed —
each has an `it.fails` repro in `src/test/coachhelm/v2/insights/upsert.test.ts`):
`updateExisting`'s optimistic CAS (2026-09-22) guards only `lifecycle_state`,
not a revision/content marker, so (a) an older worker's stale write can land
after a newer worker's fresher write when `lifecycle_state` is unchanged
between them, and (b) `evidenceRevisionKey = sample_n|window_end` has no
content component, so a same-day correction that leaves the round count and
window unchanged collides with the pre-correction key and is not counted as
a new maturation confirmation.

- **Missing-evidence-counted-as-measured fix (Package 10 gap audit,
  2026-09-23, `agent/coachhelm-trust-status-null-measured`)**:
  `getInsightEffectivenessSignals` (`event-ledger.ts`) was counting every
  `golf_insight_outcome` row into `sig.measured` regardless of whether
  `improvement` was null. A thin-sample attribution (below
  `attribute.ts`'s `MIN_WINDOW_ROUNDS`) still inserts that row via
  `recordInsightOutcome` with `improvement: null` — insufficient evidence,
  not a real measurement — so an insight resting on only thin-sample
  outcomes could read `'needs_validation'` or, with 3+ such rows and
  `worked === 0`, `'underperforming'`, on zero real evidence. Gated behind
  the new `coachhelm_trust_status_exclude_unmeasured_outcomes` flag
  (default off everywhere, see `config/feature-flags.yml`) pending team
  review of the coach-visible trust-tier change; flag off is byte-identical
  to the prior (buggy) behavior. `worked`, `shown`, and `acted` are
  unaffected; `deriveTrend`'s null-skip was already correct. Write-side
  unrelated: a null-`improvement`/null-`lift` row already never reaches
  `nextWeight` either way.
- **Practice-completion log + coach criteria (Addendum A8 slice 2, folded
  into Pkg 9, 2026-09-23, `agent/coachhelm-a8-practice-log`)**:
  <!-- schema-drift-absent: golf_focus_area_practice_sessions, golf_focus_area_criteria, golf_focus_area_practice_sessions_dedupe_key -->
  `golf_focus_area_practice_sessions` and `golf_focus_area_criteria` are
  named below even though neither is yet in the schema snapshot — the
  migration that creates them has not been applied to production (owner's
  apply queue). Two new, additive, RLS-protected TABLES (both gated behind
  `coachhelm_focus_area_practice_log`, default off everywhere, zero reads
  or writes of either surface while off) added by
  `supabase/migrations/20260923110000_golf_focus_area_practice_log.sql`:
  - `golf_focus_area_criteria` — one row per coach-authored "done"
    definition (`focus_area_id`, `player_id`, `label`, `source: 'coach' |
    'engine'`, `met`, `met_at`, `created_by_user_id`), capped at 10 per
    focus area (checked in the action via a count query, acceptable
    because INSERT is coach-gated at the DB layer). **NOT a jsonb column on
    `golf_player_focus_areas`** — the original design (v1 of this slice) put
    it there, but a db-migration-reviewer pass caught that
    `golf_player_focus_areas_update_player` already lets a player PATCH any
    column on their own focus area row, including a jsonb blob, which would
    make "coach-authored, cap 10" false at the database layer; a separate
    table with its own coach-only RLS closes that gap, and also avoids an
    `ALTER TABLE` (ACCESS EXCLUSIVE lock) on the live, high-traffic
    `golf_player_focus_areas` table. INSERT and UPDATE are both coach-only
    (`criteria_insert_coach`, `criteria_update_coach`: active
    `golf_team_members` + `is_golf_team_coach`, `fa.player_id` must match,
    `fa.status IN ('active','in_progress','paused')`); INSERT additionally
    pins `created_by_user_id = auth.uid()`, deliberately NOT repeated in the
    UPDATE policy's WITH CHECK (that would require the ORIGINAL creating
    coach to be the one marking a criterion met, denying a different
    on-team coach doing normal coaching work). UPDATE is column-restricted
    via `GRANT UPDATE(met, met_at, updated_at)` only — no grant on
    `label`/`source`, so they're immutable after INSERT even for an
    on-team coach; verified with `has_column_privilege`, not
    `has_table_privilege` (the latter is false when only column grants
    exist). `UNIQUE(focus_area_id, lower(label))` is a functional unique
    INDEX, not a constraint (Postgres constraints can't take expressions),
    so PostgREST's `.upsert(onConflict:)` can't target it — the action
    layer catches the resulting `23505` directly and returns "A criterion
    with this label already exists." One row per criterion also means
    `setFocusAreaCriterionMet` is a single-row `UPDATE ... WHERE id = $1 AND
    focus_area_id = $2`, not a compare-and-swap retry loop over a shared
    blob — the CAS pattern from v1 no longer applies.
  - `golf_focus_area_practice_sessions` — an append-only table (not a jsonb
    array, to avoid a read-modify-write losing a concurrent append) logging
    actual practice completions, idempotent on
    `UNIQUE(focus_area_id, client_request_id)` (constraint name
    `golf_focus_area_practice_sessions_dedupe_key` — the mechanical pg_dump
    name was 64 chars, over Postgres's 63-char `NAMEDATALEN` limit) via
    `ON CONFLICT DO NOTHING` (`logFocusAreaPracticeSession`); a repeated
    `client_request_id` returns `{success: true}`, not a failure. SELECT
    mirrors `golf_player_focus_areas`' own visibility by re-running its RLS
    inside an `EXISTS` subquery. INSERT binds the CLAIMED `logged_by_role`
    to what the database can verify — copying the exact branch predicates
    from `golf_player_focus_areas_insert_coach` and
    `golf_player_focus_areas_update_player` (OR'd, each gated on the
    matching `logged_by_role` value) — rather than trusting `logged_by_role`
    as a plain enum the action layer computed correctly; a forged role, a
    forged `logged_by_user_id`, or a `player_id` that doesn't match the
    parent focus area's own player (even for an otherwise-valid on-team
    coach) are all denied at the RLS layer, not just the action layer.
    Append-only at both the RLS and grant layer (no UPDATE/DELETE policy,
    no UPDATE/DELETE grant for `authenticated`).
  - Both new tables' actions map a Postgres `42501` (RLS WITH CHECK denial)
    to a plain `Forbidden` result, never an "outage" log — reaching that
    code means the action's own checks already agreed to the write and the
    world changed underneath it (e.g. a team membership lapsed mid-request).
  - Both `withAdminObserved` wrappers set `observeSoftFailures: false`: a
    flag-off `{success:false, error:'Not enabled'}` result is an expected,
    routine state (the migration isn't applied everywhere yet), not an
    incident — without this, every flag-off call would still write a Bridge
    soft-failure telemetry row.
  - Deliberately a NEW action file, not `development.ts` — that file was
    under concurrent edit by two other in-flight A8 slices (evidence
    revision / evidence badge) when this slice started, and this keeps
    those rebases conflict-free.
  - **Read-side loader + UI (follow-up slice, stacked on this one)**:
    `src/lib/coachhelm/focus-areas/practice-log-loader.ts` is a plain,
    non-`'use server'` server module (not a public action endpoint) —
    `loadFocusAreaPracticeLogData(supabase, focusAreaIds)` batch-loads both
    tables for a set of focus areas in one call, checking the flag FIRST
    (zero `.from()` calls while off, same contract as the actions above)
    and returning `{criteriaByFocusArea, practiceSummaryByFocusArea}` maps
    keyed by `focus_area_id`. Both the coach grid
    (`intelligence/page.tsx`) and the player page (`coachhelm/page.tsx`)
    call it once with every loaded focus area's id and thread the result
    onto each row as `criteria`/`practiceSummary` before handing off to
    `PlayersGridView`/`FocusAreaCard`. Practice sessions are rolled up to
    `{count, lastPracticedAt}` — never the raw per-session rows — so the
    card never grows unbounded. `FocusAreaCard` originally rendered this as
    a read-only checklist (`criteria`, met/unmet via
    `IconCheckCircle2`/`IconCircleDot`) and a one-line practice-log summary,
    both absent/null-safe (render nothing) exactly like `evidence_revision`
    above; the write-side affordances described below replace the checklist
    with an interactive one for a coach and add the log-practice trigger for
    a player, but the same absent/null-safe contract still governs whether
    either renders at all. Focus-area ids are chunked at `chunkIds`'s 200-id
    `ID_CHUNK_SIZE` before each `.in()`, and each chunk is paged past
    PostgREST's 1000-row cap via `fetchAllRows` — the same two-limit
    discipline `load-player-context.ts` already uses for
    `golf_holes`/`golf_shots`.
  - A `db:types` regen PR follows once the owner applies the migration —
    until then `src/lib/types/database.ts` has no row types for either
    table, and both the actions and the loader go through
    `fromUntyped(supabase, table)`.
  - The pgTAP suite
    (`supabase/tests/rls/golf_focus_area_practice_sessions.sql`, despite the
    filename, now covers BOTH new tables) has not been run locally (no
    Docker/local Supabase stack available in this session) — CI's
    "Supabase lint + RLS tests" job is this suite's first real run.
  - **Write-side UI (Addendum A8 slice 3, folded into Pkg 9, 2026-09-23,
    `agent/coachhelm-a8-practice-log-write-ui`, stacked on the read-side
    slice above)**: `FocusAreaCard` gained two new optional callback props,
    each gating its own affordance independently:
    - `onLogPracticeSession` (PLAYER-only — this is the player's own record
      of practice, not something a coach logs on their behalf; hidden for
      role="coach" even if wired). When present and the area is actionable,
      a secondary "Log practice" `Button` opens a `Sheet` (drill, reps,
      note — all optional, mirroring the server action's own validation)
      and submits via `logFocusAreaPracticeSession`. Idempotency:
      `clientRequestId` is generated once per SHEET OPEN
      (`crypto.randomUUID()` with the same manual RFC4122-shaped fallback
      `use-golf-messages.ts` uses, since the server validates with
      `isUuid()` and a malformed fallback would hard-fail rather than
      merely reduce entropy) and REUSED across retries within that open
      session — a failed submit keeps the same id so retrying is a safe
      no-op-or-success against the server's
      `UNIQUE(focus_area_id, client_request_id)` upsert, never a duplicate
      row. A fresh id is only drawn when the sheet is opened again. On
      success the card bumps its own optimistic session-count DELTA (not a
      replacement value, so it composes with whatever count the server
      already reported, including a null summary) and shows a success
      toast; on failure it shows an inline + toast error and leaves the
      sheet open for a retry. The delta clears via a `useEffect` keyed on
      `focusArea.practiceSummary`'s own count/lastPracticedAt, i.e. the
      instant the consumer's post-success `router.refresh()` lands fresh
      server data — never a blanket `recordedValue ?? optimistic` merge
      (unlike `OutcomeCapture`'s pattern), because a session count is
      additive, not a one-way/monotonic verdict.
    - `onSetCriterionMet` (COACH-only, mirroring
      `setFocusAreaCriterionMet`'s own coach-only authorship at the action
      layer). When present and the area is actionable, each criteria row
      becomes an interactive `Checkbox` instead of the static
      icon+label row, calling `onSetCriterionMet` on toggle. Each row
      tracks its own optimistic override + pending state (an
      id-keyed map, not one shared flag) so toggling one criterion never
      disables the others; a failure rolls back only that row and shows an
      error toast. All overrides clear via a `useEffect` keyed on the
      `criteria` array reference — a fresh array only ever arrives via the
      consumer's own post-success `router.refresh()`, i.e. authoritative
      server state, so a confirmed value never lingers stale.
    - Both handlers are wired only when
      `isFlagEnabled('coachhelm_focus_area_practice_log')` is true.
      `isFlagEnabled` is server-only (`import 'server-only'`) and
      `FocusAreaCard`/`DevelopmentDrill`/`PlayersGridView` are all `'use
      client'`, so the boolean is computed once, server-side, in
      `coachhelm/page.tsx` and `intelligence/page.tsx` (a pure flag read,
      outside their best-effort try/catch blocks) and threaded down as a
      plain `practiceLogEnabled` prop — `PlayerCoachHelmHome` ->
      `DevelopmentDrill` on the player path, `playersDrillProps`
      (`PlayersGridViewProps.practiceLogEnabled`) -> `PlayersGridView` ->
      `FocusAreaBoard` on the coach path — rather than each client
      component re-deriving it from the criteria/practiceSummary data
      itself, which can't distinguish "flag off" from "flag on, no data
      yet" (both arrive as `null`). With the flag off the handler props are
      simply never passed down, so nothing new renders and nothing calls
      either action — the same "absent handler = absent affordance"
      contract every other FocusAreaCard action (`onEdit`, `onComplete`,
      `onRecordOutcome`, …) already follows.
    - Both page-level handlers (`DevelopmentDrill`'s
      `handleLogPracticeSession`, `PlayersGridView`'s
      `handleSetCriterionMet`) follow the established thin-wrapper pattern
      (`handleRecordOutcome`): perform the write, `router.refresh()` on
      success, return the raw `{success, error?}` — no toast at that layer,
      since the card owns 100% of its own optimistic state and toast
      display.
    - Component tests:
      `src/components/fairway/pages/coachhelm/FocusAreaCard.practiceLogWrite.test.tsx`
      covers trigger/checkbox visibility (flag-off = handler absent, wrong
      role, non-actionable status), success, failure/rollback, and
      duplicate-submit (no second call while pending; a retry after failure
      reuses the same `clientRequestId`). Testing a `vaul`-based `Sheet` in
      jsdom needs two local polyfills the suite documents inline: jsdom has
      no Pointer Events capture methods, and its `getComputedStyle` returns
      `''` (not `'none'`) for an unset `transform`, which crashes `vaul`'s
      own drag-cleanup code on every open/close — neither is specific to
      this component.
- **Round Review sequence-attribution mount (A4 slice 3b, 2026-09-23,
  `agent/coachhelm-a4-round-review-mount`, stacked on #2015
  `agent/coachhelm-review-stable-read` with #2020
  `agent/a4-sequence-attribution-rollup` merged in)** — a read-only section
  on the Round Review page (`'use client'`) surfacing A4 slice 2's
  `computeSequenceAttribution` rollup, behind
  `coachhelm_a4_sequence_attribution_surface` (default off, all
  environments false). The flag check is the literal first statement in the
  new `'use server'` action
  (`src/app/golf/actions/round-review-sequence-attribution.ts`), before
  `createClient()`/`getUser()`, so the surface makes zero DB calls while
  off. `src/lib/coachhelm/v3/metrics/load-sequence-attribution.ts` wraps
  `loadPlayerContext` (A1 — already chunked at 200, already paginated past
  the 1,000-row PostgREST cap) and `computeSequenceAttribution` in a
  try/catch that returns `null` on any read error, never `[]`; the page
  renders nothing (`SequenceAttributionSection` returns `null`) rather than
  showing an empty or broken block. Auth/authorization reuses
  `verifyPlayerAccess` directly (self-or-coach), matching
  `getPlayerStandingForReviewImpl`'s existing shape in
  `round-review-system.ts`. Only `status === 'supported'` rows render a
  number; `insufficient`/`invalid`/`descriptive_only` rows render "Not
  enough holes yet" and never a value, so a thin sample can't read as a
  finding. Wording stays "observed" per #2023's guard (`sav`/`prov`/`caused
  by`/`guaranteed` all forbidden in this scan root) — the component lives
  under `components/golf/coachhelm/round-review/`, already inside that
  guard's scan roots.
  **Sign convention**: positive means strokes GAINED. This intentionally
  does NOT reuse `ScoringSection.tsx`'s `formatStrokesVsPar` (positive =
  more strokes than par = worse) even un-flipped, and that component is
  unmerged (#2010) besides. It reuses `formatSigned`
  (`src/components/fairway/charts/theme.ts`) exactly as `RoundSGSummary`
  already does elsewhere on the same page for `strokes_gained_total` —
  positive renders `+`, with the words "gained"/"lost" spelled out rather
  than relying on the sign alone. Pinned by a dedicated sign-convention
  test in `SequenceAttributionSection.test.tsx`.
  **Window**: the page has no single existing 12-month convention to
  import (same "opaque, cron-refreshed standing cache with no explicit
  `window_start`/`window_end`" situation A7 already found on the sibling
  Game Fingerprint page) — `sequence-attribution-window.ts` builds an
  independent UTC-safe rolling 12-calendar-month `AnalysisScope`, following
  A7's pattern rather than importing its unmerged
  `distance-profile-window.ts`.

## Tests To Prefer

- `src/test/app/golf/dashboard/coachhelm/**`
- `src/test/coachhelm/v3/**`
- `src/test/coachhelm/v2/post-round-trigger.test.ts`
- `src/test/coachhelm/fixture-matrix-gaps.test.ts` — §15.2 no-code-path rows, delete entries as they gain real coverage
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
