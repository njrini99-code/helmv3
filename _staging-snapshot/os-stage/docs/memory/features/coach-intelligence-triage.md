# Feature: Coach Intelligence Triage

```
feature_id: coach_intelligence_triage
status: active
criticality: high
last_verified_sha: c567bcd44f8b8e8529640eb2717817174699120f
last_verified_at: 2026-08-21
history_backfill: partial
```

## Purpose

The coach-facing operational layer on top of the CoachHelm engine (see
`coachhelm-ai.md` for generation/trust behavior — this doc covers coach
workflows *after* intelligence exists). Canonical surface:
`/golf/dashboard/intelligence`, a Triage Desk — a horizontal daily brief, a
player-grouped open-signal queue, an evidence/action dossier, a
roster-development view, and a compact effectiveness scoreboard.

## User Contract

A coach can scan alerts/patterns/insights by severity and player, act on
them (acknowledge/dismiss/validate/address/resolve/export), and reach
supporting evidence without hunting. Coaching-philosophy settings are a
real input to future prioritization, not cosmetic preferences.

## Current Behavior

- Coaching-philosophy saves use one authoritative hook write path with
  downstream revalidation — settings pages must not add a second
  server-action write for the same patch.
- "Scan team" runs the canonical CoachHelm engine for the active roster; V3
  generators own stable-signature upsert/retraction, and the UI must not
  build a parallel legacy alert feed.
- The Triage Desk is an open-work queue: acknowledged/addressed/resolved
  rows leave the queue but remain available to lifecycle/history and
  effectiveness reads.
- `getInsightsForCoach` used to log its own success payload through the
  error-logging path — fixed this week (`cda0a027d`, #1548): a routine read
  no longer files as a production defect.
- Exposure tracking (feeds the effectiveness scoreboard) used to record a
  view once per render instead of once per day, inflating exposure counts;
  fixed `2bb87f31f` (#1506/#1546).
- Pattern-mining starvation was root-caused this week: a real edge case
  (`0c82eefb`) where a practice-heavy roster (14/16 practice sessions) makes
  round-type pattern conditions structurally inapplicable, and the
  rest/rust signal sits at 0.56 against a 0.6 impact floor (93% of
  threshold) — a gate-calibration question, not a bug, filed as a GitHub
  issue for an owner call. A second starved case (`49ffe06d`) self-resolved
  via the 2026-07-30 retune. Starvation telemetry was also fixed to log
  once per player rather than once per cron tick (`981566fda`, #1553).

## Invariants

- Coach triage reads must be scoped to assigned teams through correct
  coach/team access.
- Acknowledge, dismiss, validate, address, resolve, and bulk actions must
  persist explicit lifecycle state.
- Insight evidence is part of the trust contract; the UI should make
  supporting evidence reachable whenever it exists.
- CoachHelm analytics currently has sparse effectiveness data — UI and
  agents should not assume the dashboard is fully populated.

## Primary Journeys

1. Coach opens the Triage Desk → daily brief → player-grouped open-signal
   queue → drills into an item's evidence/action dossier.
2. Coach acts (acknowledge/dismiss/validate/address/resolve) → lifecycle
   state persists → item leaves the open queue but stays in history.
3. Coach tunes coaching-philosophy settings (sensitivity, thresholds,
   weights, alert toggles) → feeds future generation prioritization.
4. Coach reviews the effectiveness scoreboard → sparse by design in most
   teams today (see Known Debt/Unknowns).

## Architecture/Data Flow

```txt
CoachHelm generates insight/pattern/prediction (see coachhelm-ai.md)
  -> coach triage surfaces read scoped team data
  -> coach acknowledges, dismisses, validates, addresses, resolves, or exports
  -> lifecycle state updates persisted
  -> analytics surfaces measure adoption/effectiveness where data exists
  -> coaching philosophy settings tune future filtering and prioritization
```

## Permissions/Tenancy

Coach triage reads/writes are scoped to teams the coach is staffed on
(`golf_team_coach_staff`), the same discriminator documented under
`auth_onboarding_join`.

## Dependencies

supabase, coachhelm_ai (this feature is entirely downstream of the engine),
datadog, sentry.

## Failure Modes

- Effectiveness analytics can look complete while `golf_insight_effectiveness`
  is genuinely sparse — a dashboard that looks empty may be accurate, not
  broken.
- Bulk lifecycle operations can over-update if team/player scope is wrong.
- Pattern/insight lifecycle labels can drift from DB constraints and UI
  copy.
- Settings changes can silently alter future AI behavior if not reflected
  back into current-state docs.
- An effectiveness-measurement bug (`metricToRoundField`, `src/lib/coachhelm/
  v2/analytics/effectiveness-writer.ts:327`) is a queued fix (#1488, tonight's
  ledger "F2") — not yet shipped as of this doc's `last_verified_sha`: the
  metric-to-round-field mapping needs to become category-keyed across 4
  strokes-gained families with rounds-based windows and labelled/eligible
  coverage in the UI.

## Observability Contract

Coach-facing read/action failures flow through the same
`logServerError`/`admin_events` pipeline as the rest of the platform (see
`admin_platform`). `getInsightsForCoach`'s success-as-error mislog (fixed
this week) is a concrete example of the class of bug this contract exists
to prevent — a "success" trace should never file as a Sentry/Bridge error.

## Test Contract

- `src/test/golf/actions/coachhelm-analytics.test.ts`
- `src/test/coachhelm/v2/**`
- `src/test/api/cron/coachhelm*.test.ts` (7 files confirmed on disk:
  `coachhelm-validation`, `coachhelm-validation-skip-reasons`,
  `coachhelm-insight-lifecycle-archive-anchor`,
  `coachhelm-insight-lifecycle-bounds`, `coachhelm-calibration`,
  `coachhelm-safety-net`, `coachhelm-roster-sweep`)
- Browser checks for alerts, insight filters, pattern-lifecycle actions, and
  settings save.

## Known Debt/Unknowns

- Effectiveness metric mapping (#1488/"F2") is still open per tonight's
  ledger — not independently confirmed shipped in this pass (no matching
  commit found for `metricToRoundField`'s category-keyed rewrite).
- `src/app/golf/actions/signal-groups.ts` exists on disk but is not listed
  in this feature's registry-mapped action set (`memory/registry.yml`'s
  `coach_intelligence_triage` entry lists `alerts.ts`, `pattern-
  management.ts`, `insight-management.ts`, `insight-evidence.ts`,
  `intelligence-dashboard.ts`, `coachhelm-analytics.ts`, `coaching-
  philosophy.ts` — not `signal-groups.ts`). Its relationship to this
  feature's signal-grouping UI was not investigated this pass; flagged as
  a possible registry gap rather than asserted as one.
- The pattern-mining starvation root cause (`0c82eefb`) surfaced a gate-
  calibration question the owner has not yet decided (impact-floor
  threshold vs. a genuinely inapplicable roster shape) — filed as a GitHub
  issue, not resolved.

## Incident History

No `memory/incidents/coach_intelligence_triage/` directory exists yet —
backfilled from `git log` and tonight's `/tmp/claude/night/ledger.md`.

- `getInsightsForCoach` error-mislogging: fixed `cda0a027d` (#1548).
- Exposure-ledger double-counting: fixed `2bb87f31f` (#1506/#1546).
- Pattern-mining starvation: root-caused tonight; one case (`0c82eefb`) is a
  real gate-calibration edge case awaiting an owner decision, the other
  (`49ffe06d`) self-resolved via a prior retune; per-entity dedup telemetry
  fixed `981566fda` (#1553).
- Effectiveness `metricToRoundField` mismapping: open, queued (#1488).

## ADR Links

None yet.

## Verification Evidence

- Confirmed table existence in `database.ts`: `golf_coach_insights` (1),
  `golf_patterns_v2` (1), `golf_predictions` (1), `golf_insight_evidence`
  (**0 — does not exist**), `golf_insight_effectiveness` (1), `golf_insight_
  feedback` (**0 — does not exist**), `golf_prediction_model_performance`
  (1), `golf_coach_philosophy` (1), `golf_learned_behavior` (1) — matches
  the prior doc generation's schema-drift banner exactly (2 non-existent
  identifiers, unchanged since 2026-08-19).
- Confirmed action-file existence: `alerts.ts`, `pattern-management.ts`,
  `insight-management.ts`, `insight-evidence.ts`, `intelligence-
  dashboard.ts`, `coachhelm-analytics.ts`, `coaching-philosophy.ts`, and
  (unmapped in registry) `signal-groups.ts` all present on disk.
- Confirmed via `git log`: `cda0a027d`, `2bb87f31f`, `981566fda` are on
  `HEAD`'s ancestry.
- Confirmed `metricToRoundField` exists at `src/lib/coachhelm/v2/analytics/
  effectiveness-writer.ts:327` and is called at line 459 — read as
  currently unfixed shape, not the category-keyed rewrite the ledger
  describes as pending.
- Confirmed the 7 `src/test/api/cron/coachhelm*.test.ts` files exist.
- Did not execute any test suite live this pass.
