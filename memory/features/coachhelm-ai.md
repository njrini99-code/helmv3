# Feature: CoachHelm AI

<!-- schema-drift-banner -->
> **⚠️ 1 identifier named below does not exist in the database.**
> Verified 2026-08-19 against production. `golf_insight_evidence`
>
> It is described here as if live. Do not query, type, or build on it —
> check `src/lib/types/database.ts` (or `memory/glossary.md`'s AUTOGEN blocks)
> before trusting any table name in this file. Declared absent
> below so `npm run docs:schema-drift` exempts them structurally
> instead of carrying them in the numeric baseline. Removing this
> reference entirely is a ratchet-down — re-run
> `node scripts/check-doc-schema-drift.mjs --update` after.

<!-- schema-drift-absent: golf_insight_evidence -->


## Status

- active

## Current State

CoachHelm is the golf intelligence layer. It turns round, shot, standing, player, and team context into coach-facing and player-facing insights, recommendations, narratives, and follow-up surfaces.

The feature currently spans two generations:

- **V2**: established insight mining, prediction, learning, NLG, post-round triggers, and coach/player feedback loops.
- **V3**: newer generator framework for composite insights, counterfactuals, player genome, provider ingest, goals, intent, LLM narratives, practice recommendations, qualifying, and chat.

## Primary Entry Points

### Routes

- `src/app/golf/(dashboard)/dashboard/coachhelm/**`
- `src/app/golf/(dashboard)/dashboard/analytics/coachhelm/**`

### Components

- `src/components/golf/coachhelm/**`

### Actions And APIs

- `src/app/golf/actions/coachhelm-data.ts`
- `src/app/golf/actions/coachhelm-analytics.ts`
- `src/app/golf/actions/insight-delivery.ts`
- `src/app/golf/actions/insight-management.ts`
- `src/app/golf/actions/intelligence-dashboard.ts`
- `src/app/golf/actions/player-feedback.ts`
- `src/app/golf/actions/v3/**`
- `src/app/api/cron/coachhelm*.ts`
- `src/app/api/cron/v3/**`

### Engine Code

- `src/lib/coachhelm/v2/**`
- `src/lib/coachhelm/v3/**`

## Core Data

- `golf_coach_insights`
- `golf_insight_evidence`
- `golf_insight_player_feedback`
- `golf_insight_generation_log`
- `golf_insight_effectiveness`
- `golf_patterns_v2`
- `golf_predictions`
- `golf_player_focus_areas`
- `golf_player_stats_cache`
- V3 tables such as CoachHelm settings, player genome, ingest, qualifying, budget, chat, and outcome attribution tables.

Use `memory/context/golfhelm-database.md` for exact columns and `memory/glossary.md` for table lookup.

## Business Rules

- LLM work must never run client-side.
- Coach-facing insight reads must scope through assigned teams, not broad player access.
- Player-facing feedback must be tied to the authenticated player and revalidate the affected dashboard surfaces.
- Coach-to-team ownership is via `golf_team_coach_staff`; do not infer it from `golf_coaches.team_id`.
- V2/V3 scoring and generator logic should stay pure where designed as pure engine code; Supabase access belongs in loaders, actions, or orchestration boundaries.
- Insight lifecycle is decided only by `src/lib/coachhelm/v2/insights/lifecycle-policy.ts` (see `docs/architecture/coachhelm-evidence-contract.md`). A `tentative` row is promoted to `detected` on the first write whose freshly recomputed confidence clears the 0.4 floor; the nightly lifecycle cron only demotes/archives/resolves and never promotes. Promotion is pausable per team via `golf_team_coachhelm_settings.preferences.tentative_promotion_enabled = false`.
- Honest-mode confidence (`factors_measured=false`) is `sample_adequacy × freshness` (`honest_v2`); it is a support score, never a probability, and can never rise as evidence ages.
- Citations, evidence, and baseline comparisons are part of the trust contract. Do not emit fabricated comparisons or uncited claims.
- Claim honesty (2026-09-12, repair plan Package 2): prose states what was
  measured, hands unmeasured causes to the coach as a check, and frames the
  action as a recommendation (`approachAxisReading` observation/check/action in
  `v3/engine/diagnosis.ts`; the round builders in `v2/orchestrator.ts`; the
  short-side and pressure-decel composites). Heuristic severities go in
  `ComposedInsight.rankScore`, never `strokeImpact`. A row whose `your_value`
  is not the registry quantity for its metric id declares `evidence.polarity`
  (approach_miss: green-hit percent under `approach_proximity_*ft`). Women's
  cohort anchors ship as `comparison_source: 'estimated_target'` with a
  `target (est.)` label. Specific-hole rankings key on (`course_id`,
  `hole_number`); derived tee distances carry `distance_method:
  'derived_progress'`. The metric identity table lives in
  `docs/architecture/coachhelm-evidence-contract.md`.
- Standing Tour basis (2026-09-12, addendum A2 read level): the three
  `approach_proximity_*` standing rows are on-green-only player values
  against the Tour's all-shot figure. `v3/standing/tour-basis.ts` names them
  and every standing loader stamps `pga_omitted: true` with
  `pga_omitted_reason: 'basis_mismatch'`, so no tile, goal target, or engine
  suggestion compares them to Tour (the team tick stays — same basis).
  `StandingStrip`/`StandingBar` caption the omission (`pgaOmissionNote`).
  Moving the RPC to all-shot proximity is Package 7B; until then do not
  re-add a Tour comparison for these ids anywhere.
- Severity ordering (2026-09-12, N5): `golf_coach_insights.priority` is TEXT
  and sorts alphabetically at the database. Never `.order('priority')`. Rank
  feeds with `rankEvidenceInsights`; order a "sort by priority" list with
  `compareBySeverity` from `v3/ranking/score.ts` over the full set, then
  paginate.
- Budget-sensitive LLM behavior should use team settings and persisted usage, not hardcoded token math.
- Post-round analysis returns a typed `AnalysisOutcome` (repair plan R3,
  2026-09-12; `src/lib/coachhelm/v3/engine/analysis-outcome.ts`):
  `succeeded | partial | waiting_for_data | not_applicable | disabled |
  retryable_failure | permanent_failure`, each with a retry policy. The engine
  (`triggerPlayerInsightsAfterRoundImpl`) names its own state with a `code`
  on every `success: false` envelope and preserves a caught exception as
  `cause`; `postRoundTrigger`, the safety-net cron, the pgmq consumer and the
  roster sweep branch on that code. No consumer may classify an outcome from
  the message text, and no expected state (under the round floor, no roster,
  switched off) may be stamped as a failure — it parks the round. The safety
  net's never-processed sweep selects only rows with a NULL reason; parked
  rows wake on a newer analyzed round (coverage), a new active membership,
  or both CoachHelm switches being on, or (floor-parked) the player's
  completed-round count meeting the coach's current `min_rounds_for_signal`,
  so a coach lowering the floor wakes them on the next tick; transient
  failures retry one tick apart up to `RETRY_MAX_ATTEMPTS` and then stay
  failed as `:exhausted`. A failed wake-decision read is logged and leaves
  the round parked.

## UI Contract

- Coach views need fast triage: new, acknowledged, dismissed, resolved, and priority states must be visible.
- Player views need clear actionability: what changed, why it matters, and what to do next.
- Loading states should use skeletons that match final layout.
- Empty states should stay compact and explain whether there is no data, no permission, or no insight yet. The Ask page's `ProgramOpening` renders a compact honest empty state when the program pulse has no items (2026-08-26) — it must never return nothing and leave the column blank.
- Mobile views must use the shared app shell, Standard or Action headers, and bottom-nav clearance from `AGENTS.md`.
- The Ask composer autofocuses only on fine-pointer (desktop) clients (2026-08-26). On touch, no CoachHelm surface may focus a text input on open — iOS answers that focus with a keyboard over an unread page.
- The phone Ask drawer (`CoachHelmDrawer`) lifts by `--keyboard-height` and the composer drops its home-indicator pad while `body.keyboard-open` (2026-09-02) — the WebView never resizes for the keyboard, so a `bottom-0` drawer put the composer under the keys exactly like the messages screen.
- A question started on the Brief tab (`CoachIntelligenceHome` → `?q=` → the Ask page) auto-submits exactly once through `PromptComposer`'s own `submit()` (2026-09-02) — it previously only pre-filled the composer, so the coach had to press Send a second time on the page it navigated to. `AskSurface` strips `q` from the URL the moment the submit is kicked off, before the server has minted a conversation, so a refresh or back-navigation in that window cannot resend it. `PromptComposer` also now restores the just-submitted text into the field on a failed turn (never on success) instead of the previous unconditional clear-on-submit, so a failure does not force retyping. See `src/components/golf/coachhelm/chat/PromptComposer.tsx`, `CoachHelmChat.tsx` (`autoSubmitInitialInput`), and `AskSurface.tsx`.
- A route's `loading.tsx` reserves the page's paint at t=0 — for a
  `'use client'` page holding its own `loading` state that is that
  component's loading branch, not its settled layout. A route whose
  `page.tsx` is a pure `permanentRedirect` shim renders `bg-canvas` only:
  no geometry, and no real `<h1>` for a screen that never mounts.
  Reference implementation: `dashboard/alerts/loading.tsx`.

## Known Risk Areas

- Generated insight evidence can drift from real data if adapters or fallback paths skip citation validation.
- **Coach chat's grounding audit (`auditNumericClaims`, `src/lib/coachhelm/v3/chat/provenance.ts`) is precision-sensitive: a false positive discards a correct answer exactly like a real fabrication does, and both look identical to the coach.** Issue #1540 / repair plan N15 (2026-09-22): ~46% of chat replies (33 of the last 30 days, all-time 33 failed/29 complete/8 null) were marked `'failed'`, almost all real, tool-sourced answers wrongly flagged. Two dominant causes, both fixed:
  1. `collectNumbers` only walked numeric leaves, so `get_player_insights`' own pre-composed prose (`detail.insights[].content`/`.title` — team averages, attempt counts, even that insight's own PGA Tour comparison) was invisible to the audit; a chat turn that faithfully restated an insight's own wording was flagged as fabricating it. Fixed by scanning string leaves for numeric substrings too (skipping whole-string UUIDs/ISO timestamps so an id never "supports" an unrelated number).
  2. A distance-band bucket label with both bounds over 12 (`'15-25 ft'`, `'10-15 ft'` — see `PUTT_DISTANCE_BUCKETS`, `metrics-catalog.ts`) read as two bare numeric claims, one of them negative once the hyphen was misread as a sign. Fixed by registering a series point's `bucket` label the same way tool prose numbers are registered.
  3. Separately, the audit only ever saw the CURRENT request's fresh tool calls — a model answering from a prior turn's already-fetched data (no new tool call this turn) had no anchors for numbers the coach had already been shown. `chat/stream/route.ts`'s `priorTurnEvidence()` now seeds the audit from THIS conversation's own persisted `ui_parts` (never the client-sent thread — that would let a forged request inject fake "evidence").
  A `'failed'` row now also records why: `golf_coachhelm_llm_calls.citations` carries `{reason: 'verification_failed', unmatched_tokens}` (mirrors `compose.ts`'s shape) instead of `null`, and the live stream carries a `data-grounding-flag` part with the same note appended to `content` on persistence — before this fix the flag only ever reached the DB row, so a coach watching the answer stream in never saw it until a reload; `restore.ts`'s `REPLAYABLE` set now also includes `data-grounding-flag`, so the flag survives a reload instead of only the original streaming session. See `src/test/coachhelm/v3/chat-provenance.test.ts` for the reproduced false positives.

  Independent review of the fix (2026-09-22) found the live audit itself had a real regression: it checked `result.text`, which in `ai` 7.0.79 is the LAST agent step's text only (`StreamTextResult#text`), so a fabrication planted in an earlier step of a multi-step turn was invisible to it, and `onFinish` reused that narrow verdict instead of re-checking the full persisted text. Fixed by accumulating every `text-delta` chunk in the stream-forwarding loop and auditing exactly that string in both places. A provider error or a dropped connection mid-generation is now also tracked explicitly (`streamErrored`) and forces the turn to `'failed'` regardless of what the numeric audit finds — previously a stream error could leave a partial, unaudited answer stored as `'complete'`. `priorTurnEvidence` (cross-turn evidence carryover) now validates every stored envelope with `ToolEnvelope.safeParse` before trusting its shape (a legacy or forged `ui_parts` blob can no longer crash the turn). Player-scoping is two-phase: it splits carryover into `shared` (team/round-level evidence with no player entity — always safe) and `deferred` (anything player-scoped, or entity-less, e.g. `get_player_insights`, which returns no `entity` at all and so cannot be assumed safe). `execute` then unions the current turn's own tagged player id(s) with `deferred`'s before deciding whether to fold `deferred` in, so the current turn's context — not just prior turns' — governs the decision (a number about player A must not "support" a claim about player B). This is a heuristic bounded by what's tagged: an entity-less envelope secretly about a second, untagged player is indistinguishable from one about the single tagged player. Carryover is capped to the last 5 assistant turns via a bounded, descending `listRecentMessages` query (avoiding both PostgREST's 1,000-row cap and an unbounded evidence window), and the pairwise-differencing anchor cap (`PAIRWISE_ANCHOR_CAP`) now evicts its oldest member instead of silently disabling differencing once exceeded. Known, accepted, self-only risk (not changed here): `chat_messages_coach_only` is a `FOR ALL` RLS policy, so a coach can edit their own persisted `ui_parts`, including a stored evidence envelope.
- Safety-net fallback behavior can mask generator failures if logs are ignored.
- Course-management "worst holes" and hole-1 "warmup" insights require at
  least five samples, matching the persisted insight writer's Rule 1
  validation contract (`upsertInsight` throws `InsightEvidenceRefusal` below
  the floor). `generateWorstHolesInsights` and `generateWarmupHoleInsight`
  (`src/lib/coachhelm/v2/mining/course-management.ts`) route that refusal
  through `isEvidenceRefusal()` and log it as a quiet, non-paging event —
  the same pattern `v3/composite/synthesis.ts` uses. Before this was wired
  up, the refusal reached `logServerError` unconditionally and paged as a
  production incident (fingerprint `ea766422`, "worst_holes upsert failed").
- A completed round's CoachHelm terminal state is written only through the
  service-only `record_round_coachhelm_terminal_state` RPC. It may update
  processing metadata but cannot modify score, shots, identity, or status.
- Round-review feedback and player acknowledgement paths can become stale if revalidation misses player or coach routes.
- V3 feature surface is expanding quickly; registry/docs must be updated when new generators, tables, or cron routes land.
- **`CoachHelmSubNav.tsx`'s header comment can lag the `COACH_TABS` array it
  describes.** A skeleton or nav consumer that hand-draws the tab strip from
  the file's header comment rather than importing `COACH_TABS`
  (`src/components/fairway/pages/coachhelm/CoachHelmSubNav.tsx`) can drift —
  one skeleton was written against a stale "single Brief tab" claim while the
  array actually carried two (`brief` + `ask`), and the strip grew a second
  tab on hydrate. `resolveTabFromPath` branches on `tabs.length === 1`, so
  this matters beyond cosmetics. Only `PLAYER_TABS` is genuinely one tab.
  When a consumer needs the coach tab count, read the array, never the file
  header. (STU, source: `coachhelm-subnav-doc-contradicts-code.md` dated
  2026-08-15; verified 2026-09-05 that `COACH_TABS` is still the live
  constant name in that file.)
- **The 2026-07-19 "Spine & Stage" redesign is the current architecture for
  CoachHelm, Stats and Round Review**, and its 8 legacy routes
  (my-development, my-game-profile, my-standing, alerts, insights, patterns,
  development, analytics) are now permanent-redirect shims forwarding query
  params onto `?area=`/`?view=` — treat those params as the canonical nav for
  these surfaces rather than resurrecting the retired tab routes. New summary
  UI on these pages should compose from `src/components/fairway/modules/`
  (present in this repo) rather than reintroducing a DetailGrid-style text
  table. (STU, source: `spine-stage-redesign.md` dated 2026-07-20; verified
  2026-09-05 that `src/components/fairway/modules/` exists.)
- **A "Rendered more hooks than during the previous render" / React #310
  report on this surface is not automatically the same bug twice.** On
  `/golf/dashboard/stats` it was a Turbopack HMR/Fast-Refresh and stale-chunk
  deploy-churn artifact (exhaustive audit found zero rules-of-hooks
  violations) — but the identical error message on
  `/golf/dashboard/qualifiers/new` was a real production crash, caused by
  `FairwayCoursePicker` calling `useReducedMotion()` directly instead of
  `useReducedMotionGuard()` (the guard defaults `null` — framer-motion's
  SSR/pre-hydration value — to `false`, avoiding a server/client render
  mismatch). Before dismissing a "more hooks" report as the known false
  positive, check the route, the Sentry `environment` tag, `handled`, and
  whether the chunk hashes are prod- or localhost-shaped. Any use of
  `useReducedMotion()` in this codebase should go through
  `useReducedMotionGuard()` from `@/lib/coachhelm/v3/motion`. (STU, source:
  `coachhelm-stats-hooks-310-false-positive.md` dated 2026-07-30, updated
  2026-08-19; verified 2026-09-05 that src/lib/coachhelm/v3/motion exists.)
- **Outcome measurement now covers v3 insights** (2026-09-22,
  `agent/coachhelm-outcome-measure`): `backfillInsightOutcomes`
  (`v2/analytics/effectiveness-writer.ts`) previously only mapped v2-era
  metric names to round columns, so `outcome_status`/`OutcomeBadge` were
  effectively NULL on every v3-authored insight. It now also resolves v3
  `evidence.metric` ids through the v3 metric registry
  (`lookupMetricSource`/`averageInWindow`/`improvementSign`), keeps the
  legacy mapping as a fallback, and leaves intentional-null metrics
  unmeasured on purpose. It also now populates
  `outcome_metric_name`/`outcome_metric_before`/`outcome_metric_after`, not
  just `outcome_status`. Candidate selection is paginated and
  pre-filtered to measurable rows (`FETCH_PAGE_SIZE`/`MAX_FETCH_PAGES`) so a
  page of permanently-unmeasurable rows can't starve the per-tick backfill
  budget — same pattern as the `causality-attribute` cron.
- **Learned personalization of v2 alert thresholds is wired but flagged off**
  (2026-09-22, `agent/coachhelm-learning-cleanup`): `BehaviorLearner`'s
  `getLearnedPreferences()`/`getPersonalizedThreshold` are now consulted in
  `orchestrator.ts`'s `generateAlerts()`, but only applied to
  `philosophy.declineThreshold`/`pressureGapThreshold` when the
  `coachhelm_learned_personalization` feature flag (default OFF in every
  environment, see `config/feature-flags.yml`) is on. With the flag off the
  computed thresholds are shadow-logged
  (`coachhelm.learned_personalization.shadow`) instead of applied, so alert
  generation is unchanged until an owner turns the flag on with evidence to
  support it. Also fixed upstream: `'feedback'`-type interactions (from
  `rateInsight`) are now correctly bucketed into `BehaviorLearner`'s
  ack/dismiss counts, and `rateInsightImpl` now records a real `insight_type`
  in interaction metadata so per-type bucketing works.
- **v2 coach-alert family (bubble_player, pattern_detected, streak,
  surge_player, plateau, tournament_pressure, closing_holes, par_3_issues,
  recurring_weakness, team_trend, scoring_decline) is still live-written,
  100% dark on read** — no v3 successor exists yet, `engine_version` is
  never stamped `v3` for these, so `applyInsightVisibility` excludes them
  from every coach/player surface. Planned retirement PR (sequenced after
  `agent/coachhelm-outcomes` lands on main) not yet done as of 2026-09-22.

## Tests To Prefer

- Unit tests under `src/test/coachhelm/**`.
- Cron/API tests under `src/test/api/cron/coachhelm*.test.ts`.
- Component tests under `src/test/app/golf/dashboard/coachhelm/**`.
- Browser validation for changed coach/player surfaces when UI or route behavior changes.

## Related Docs

- `memory/context/coachhelm-ai.md`
- `memory/context/golfhelm-features.md`
- `docs/architecture/coachhelm-evidence-contract.md`
- `docs/v3-research-golf-domain.md`
- `docs/v3-testing-standards.md`
