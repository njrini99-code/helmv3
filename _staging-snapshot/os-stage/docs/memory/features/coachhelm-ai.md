# Feature: CoachHelm AI

```
feature_id: coachhelm_ai
status: active
criticality: high
last_verified_sha: c567bcd44f8b8e8529640eb2717817174699120f
last_verified_at: 2026-08-21
history_backfill: partial
```

## Purpose

The golf intelligence engine. Turns round, shot, standing, player, and team
context into coach-facing and player-facing insights, recommendations,
narratives, and follow-up surfaces. This doc covers generation/trust
behavior; `coach-intelligence-triage.md` covers what a coach does with the
output.

## User Contract

Every emitted insight is evidence-backed and internally consistent — a
coach or player should never see a claim the engine cannot substantiate.
LLM composition never runs client-side, and a generator failure degrades to
"no insight" rather than a fabricated one.

## Current Behavior

The feature spans two generations, both live:

- **V2** (`src/lib/coachhelm/v2/`): insight mining, prediction, learning,
  NLG, post-round triggers, coach/player feedback loops. Subdirectories:
  `analytics`, `features`, `feedback`, `insights`, `learning`, `mining`,
  `nlg`, `prediction`, `reasoning`, `shot-analysis`, `simulation`, `stats`,
  `trends`.
- **V3** (`src/lib/coachhelm/v3/`): generator framework for composite
  insights, counterfactuals, player genome, provider ingest, goals, intent,
  LLM narratives, practice recommendations, qualifying, and chat.
  Subdirectories: `brief`, `causality`, `chat`, `composite`,
  `counterfactual`, `effectiveness`, `engine`, `foundation`, `generators`,
  `genome`, `goals`, `ingest`, `insights`, `intent`, `llm`, `metrics`,
  `notifications`, `practice-rx`, `qualifying`, `ranking`, `recap`,
  `standing`, `stats`, `themes`.

This week's engine changes, all confirmed on `HEAD`'s ancestry:

- A 90-day trajectory forecast now actually reaches a coach (`3ec0c8b50`,
  #1485/#1563) — previously computed but not surfaced.
- The genome cron stopped re-selecting players it can never compute
  (`4d1f33286`, #1503/#1549) — a refusal-marker approach rather than a
  schema change, so genome-ineligible players stop burning cron cycles
  every run.
- Composite insights bypassed the confidence gate — fixed (`0ddfac0a5`,
  #1510): a composite generator's output was reaching coaches without the
  same confidence threshold other generators enforce.
- A dead cascade rule that could never fire was deleted (`83e2b8328`,
  #1475/#1502) — cleanup, not a behavior change.
- Two routine engine states (success traces) stopped being filed as
  production defects (`3464e4374`) — specifically `v3.llm.budget` success
  logging that was surfacing as a Sentry error.

## Invariants

- LLM work must never run client-side.
- Coach-facing insight reads scope through assigned teams, not broad player
  access; coach-to-team ownership is via `golf_team_coach_staff` — never
  inferred from `golf_coaches.team_id`.
- Player-facing feedback ties to the authenticated player and revalidates
  the affected dashboard surfaces.
- V2/V3 scoring and generator logic stays pure where designed as pure
  engine code; Supabase access belongs in loaders, actions, or orchestration
  boundaries.
- **Evidence contract** (`docs/architecture/coachhelm-evidence-contract.md`,
  active since 2026-05-17): every insight's `evidence` JSON is internally
  consistent — when `comparison_source = X`, `comparison_label` and
  `comparison_value` come from a single `BaselineRegistry` entry for X.
  Generators never hard-code a `comparison_label` string; they look up a
  `BaselineKey` (`${source}.${bucket}`) and spread the registry result. A
  static test (`baseline-registry.test.ts`) fails CI on any hard-coded
  `comparison_source` outside the allowed set (`your_baseline`, `team_avg`,
  `d1_avg`/`d2_avg`/`d3_avg`/`naia_avg`/`juco_avg`, `pga_baseline`,
  `absolute_target` — `peer_percentile` was removed 2026-05-17).
- `MIN_SAMPLE_N = 5` is enforced at the typed `upsertInsight` entry point; a
  pattern with one real observation must not become an insight claiming
  `sample_n: 5`. The legacy `toInsightInput` adapter returns `null` (not a
  clamped value) when sample size is insufficient.
- `upsertInsight` dedups on `(signature, player_id, coach_id, team_id,
  created_at >= cutoff)` — two coaches at different organizations on the
  same transferred athlete each get a distinct row, never a silent
  overwrite.
- Budget-sensitive LLM behavior uses team settings and persisted usage, not
  hardcoded token math.

## Primary Journeys

1. A round completes → post-round trigger fires → tier-1 generators run via
   `Promise.allSettled` (9 generators) → each success/failure logged with
   `action='analyzePlayer.tier1Generator'`.
2. Cron sweep (roster-wide) → genome/pattern/prediction generators run over
   eligible players → refusal markers skip players who can never compute →
   insights upserted with dedup.
3. Coach or player views a surface → reads scoped insight/pattern/prediction
   rows → evidence panel resolves `comparison_source` to a registry label.

## Architecture/Data Flow

```txt
Round/shot/standing/team data
  -> V2 orchestrator (9 tier-1 generators, Promise.allSettled)
     and/or V3 generator framework (composite, genome, counterfactual, ...)
  -> baselineRegistry.get(BaselineKey) for any comparison
  -> upsertInsight (MIN_SAMPLE_N, dedup on signature+player+coach+team+cutoff)
  -> golf_coach_insights / golf_patterns_v2 / golf_predictions
  -> coach/player surfaces (see coach-intelligence-triage.md,
     player-coachhelm-development.md)
```

## Permissions/Tenancy

Coach reads scope through `golf_team_coach_staff`, never through
`golf_coaches.team_id` directly (see Invariants). Player feedback ties to
the authenticated player only.

## Dependencies

supabase, sentry, datadog, an LLM provider (never called client-side).

## Failure Modes

- The orchestrator's `Promise.allSettled` means a single generator failure
  degrades gracefully — `analyzePlayer` returns `generatorSummary:
  {successes, failures}` so callers can react to partial failure.
  `/api/coachhelm/analyze-player` currently returns HTTP 200 with
  `success: false` on engine-level failure; a documented follow-up
  (evidence-contract doc, "partially addressed") will flip this to 5xx when
  `generatorSummary.failures.length > 0` so platform observability sees
  real signal — **not yet done** as of this doc's `last_verified_sha`.
- Generated insight evidence can drift from real data if adapters or
  fallback paths skip citation validation.
- Safety-net fallback behavior can mask generator failures if logs go
  unread.
- The V3 surface is expanding quickly (24 subdirectories as of this pass);
  registry/docs must be updated when new generators, tables, or cron routes
  land, or this doc rots the way the calendar/coach-intelligence docs
  already had to be corrected once.

## Observability Contract

Tier-1 generator failures log via `logServerError` with
`featureArea='coachhelm'`, `playerId`, and `extra: {generator, reason}` —
this is the concrete example the evidence-contract doc gives for the
failure surface. Two classes of false-positive Bridge/Sentry noise were
fixed this week specifically in this feature: `getInsightsForCoach`
(coach-facing read) logging its own success payload as an error
(`cda0a027d`, tracked under `coach-intelligence-triage.md`), and
`v3.llm.budget`'s routine states filing as defects (`3464e4374`).

## Test Contract

- `src/test/coachhelm/**` (v2 and v3 unit tests)
- `src/test/coachhelm/v2/insights/baseline-registry.test.ts` — static guard
  against hard-coded `comparison_source` strings
- `src/test/api/cron/coachhelm*.test.ts` (7 files, shared with
  `coach-intelligence-triage.md`'s test contract)
- `src/test/app/golf/dashboard/coachhelm/**`
- Browser validation for changed coach/player surfaces when UI or route
  behavior changes

## Known Debt/Unknowns

- The evidence-contract doc's own "follow-up" item (flip
  `/api/coachhelm/analyze-player` to 5xx on generator failure) is explicitly
  marked "partially addressed" as of its own text — not independently
  re-verified as complete or incomplete this pass; treat as still open
  unless re-checked.
- This doc's schema-drift banner (`golf_insight_evidence` does not exist)
  is unchanged since 2026-08-19 — re-confirmed this pass (0 matches in
  `database.ts`).
- The prior doc generation's Core Data section named `golf_insight_
  player_feedback`, `golf_insight_generation_log`, `golf_player_focus_
  areas`, and `golf_player_stats_cache` as real; all four re-confirmed
  present (1 match each) this pass — no drift found here.
- V3's 24 subdirectories were enumerated by directory listing only; this
  pass did not open each generator to confirm current behavior beyond the
  6 commits explicitly investigated above. Treat any V3 subsystem not named
  in "Current Behavior" as unverified by this pass, not as "unchanged."

## Incident History

No `memory/incidents/coachhelm_ai/` directory exists yet — backfilled from
`git log` and tonight's `/tmp/claude/night/ledger.md`.

- 90-day trajectory forecast reaching a coach: shipped `3ec0c8b50`.
- Genome cron re-selecting uncomputable players: fixed `4d1f33286`
  (root-caused as `0c82eefb`-adjacent crowd-out risk — 33 eligible vs. 25
  slots, 7 stuck, per tonight's ledger — the refusal marker addresses the
  wasted-cycles symptom, not the slot-crowding question itself).
- Composite insights bypassing the confidence gate: fixed `0ddfac0a5`
  (#1510).
- `v3.llm.budget` routine states misfiled as defects: fixed `3464e4374`.
- Dead cascade rule removed: `83e2b8328` (#1475/#1502) — housekeeping, not
  incident-driven.

## ADR Links

None yet.

## Verification Evidence

- Read in full: `docs/architecture/coachhelm-evidence-contract.md` (81
  lines).
- Confirmed table existence in `database.ts`: `golf_coach_insights` (1),
  `golf_insight_evidence` (**0 — does not exist**), `golf_insight_player_
  feedback` (1), `golf_insight_generation_log` (1), `golf_insight_
  effectiveness` (1), `golf_patterns_v2` (1), `golf_predictions` (1),
  `golf_player_focus_areas` (1), `golf_player_stats_cache` (1).
- Confirmed directory structure via `find`: 14 `v2/` subdirectories, 24
  `v3/` subdirectories.
- Confirmed via `git log -1 --format`: `3ec0c8b50`, `83e2b8328`,
  `4d1f33286`, `3464e4374`, `0ddfac0a5` all resolve to the commit messages
  cited above and are on `HEAD`'s ancestry.
- Did not open individual V3 generator files beyond confirming directory
  existence; did not execute the coachhelm test suite live this pass.
