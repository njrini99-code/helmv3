<!--
STATUS: SUPERSEDED
DATE: 2026-07-10
SUPERSEDED BY / WHY: Entry point for the whole docs/superpowers/plans/2026-04-21-coachhelm-fix/ directory (17 files: team plans, HANDOFF, PHASE-3/4-DONE, TEAM-A..F-DONE, typecheck-baseline.txt) — a completed-wave April CoachHelm fix effort ("close all 33 review findings"), absorbed into and superseded by docs/audits/COACHHELM_FULL_VALIDITY_AND_FACET_AUDIT_2026-06-06.md and COACHHELM_MASTER_ENGINE_FEATURE_REMEDIATION_AUDIT_2026-06-21.md. This header applies to the entire directory.
KEPT FOR HISTORY -- do not delete this file.
-->

# CoachHelm Fix — Multi-Team Orchestration

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement these plans. Each team plan uses checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every bug surfaced by the 2026-04-21 parallel-investigator audit of the CoachHelm V3 engine and the coach + player dashboards. Restore the feedback loop, fix schema drift, fix RLS holes for player reads, fix engine logic bugs, harden build & observability.

**Architecture:** Six independent team plans. Team A (DB foundation) is a dependency for Teams B/C/E. Teams D, F can start immediately in parallel with A. Each team owns disjoint files — no merge conflicts.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (Postgres 17, project `qmnssrrolpinvwjjnufo`/`Helm-Production`), Vitest, Playwright.

---

## Live-DB-verified findings summary

The 2026-04-21 audit was run against stale migration files. **Several "critical" findings were FALSE POSITIVES** once verified against live production. The corrected baseline:

### Audit findings DISPROVEN by live DB

| Audit claim | Live-DB reality |
|---|---|
| RLS uses `golf_coaches.team_id` (broken) | FALSE. Production policies correctly use `golf_team_coach_staff` joins or `gc.organization_id = gt.organization_id`. Audit was reading old migration files. |
| `golf_predictions` unreadable to anyone | FALSE. Has correct player + coach SELECT policies. |
| Trigger `trg_update_round_stats_cache` uses nonexistent `round_status` column | FALSE. Live trigger uses `WHEN ((new.status = 'completed'::text))` — correct. |
| `golf_player_baselines` RLS entirely broken | PARTIAL. Coach access works; **player access broken** because `auth.uid() = player_id` will never match (player_id is `golf_players.id`, not `auth.users.id`). |

### Audit findings CONFIRMED by live DB

| ID | Confirmed bug | Severity |
|---|---|---|
| LIVE-1 | **`golf_global_patterns` table does not exist** in production. `cross-learner.ts:556-573` writes to phantom table. | CRITICAL |
| LIVE-2 | `golf_player_insight_preferences` table does not exist | HIGH |
| LIVE-3 | `golf_insight_effectiveness` SELECT policy is `USING (true)` — **any authenticated user reads any team's analytics** | CRITICAL |
| LIVE-4 | `golf_coach_behavior_log` INSERT policy is `WITH CHECK (true)` — any auth user pollutes any coach's log | HIGH |
| LIVE-5 | `golf_coach_behavior_log` SELECT uses `coach_id = auth.uid()` — never matches (coach_id is `golf_coaches.id`) | HIGH |
| LIVE-6 | `golf_player_baselines` & `golf_percentile_cache` SELECT use `auth.uid() = player_id` — players cannot read own baselines | HIGH |
| LIVE-7 | `golf_team_coachhelm_settings` uses `gc.organization_id = gt.organization_id` (org-wide) — coach in same org reads any team's settings | MEDIUM |
| LIVE-8 | Schema drift in 7+ action files — code references columns that don't exist (`description`, `recommendation`, `source_insight_id`, `prediction_type`, `title`, `timeframe`, `golf_players.team_id`, `golf_patterns_v2.team_id`, `pattern_name`) | CRITICAL (per file) |
| LIVE-9 | `golf_learned_behavior` schema mismatch. Live: `entity_type, entity_id, interaction_type, target_type, metadata, timestamp`. Code writes: `interactions, preferences, learned_thresholds, engagement_patterns, content_preferences, ...` | CRITICAL |
| LIVE-10 | `golf_coach_behavior_log` table has `created_at` column. Code at `feedback/coach-behavior.ts:155` inserts `timestamp` field | CRITICAL |
| LIVE-11 | `golf_round_reviews` has 6 overlapping SELECT policies (legacy + helper-based + admin) — actual access is OR of all. Hard to reason about. | MEDIUM |
| LIVE-12 | `golf_coachhelm_settings` has BOTH `user_id` AND `coach_id` AND `team_id` — schema chaos. RLS uses `coach_id` correctly but inserts may use `user_id`. | MEDIUM |
| LIVE-13 | `golf_announcement_documents` and `golf_announcement_tasks` policies use a malformed subquery `SELECT golf_announcements.team_id FROM golf_coaches` (returns nothing meaningful but happens to be permissive enough) | LOW |
| LIVE-14 | Operator-precedence bug in `shot-pattern-miner.ts:682` makes actionability always 0.9 | HIGH |
| LIVE-15 | `lie-specific-analysis.ts:487-490` — second `lower === 'l'` branch unreachable, all "long" misclassified as "left" | HIGH |
| LIVE-16 | NaN root cause at `pattern-miner.ts:411,480` — masked by NLG sanitizeText | MEDIUM |
| LIVE-17 | `gate.ts:142-150,228-236` fails open on DB error | HIGH |
| LIVE-18 | `ShotStateIntelligence.loadShotStates` queries every round platform-wide | CRITICAL |
| LIVE-19 | `OutcomeValidator.validate()`, `ConfidenceCalibrator.update()`, `BehaviorLearner` never invoked. Calibrator state in-memory, wiped on cold start. Feedback loop is a no-op. | CRITICAL |
| LIVE-20 | Player feedback loop missing: `AIInsightsPanel` rendered without `onAcknowledge`/`onDismiss`; no `rateInsightAsPlayer` action | CRITICAL |
| LIVE-21 | `revalidatePath('/golf/reviews/${id}')` in `round-reviews.ts:787,865,1238` — route doesn't exist | HIGH |
| LIVE-22 | `submitGolfRoundComprehensive` doesn't revalidate `/golf/dashboard/coachhelm` or `/my-qualifiers` or `/my-development` | HIGH |
| LIVE-23 | Fire-and-forget engine trigger at `golf.ts:1655` — Vercel kills mid-execution | HIGH |
| LIVE-24 | Hardcoded thresholds ignore `CoachPhilosophy.declineThreshold`/`pressureGapThreshold` | HIGH |
| LIVE-25 | `verifyPlayerAccess` picks first team in coach's org — duplicated in 4 files | HIGH |
| LIVE-26 | 6 tables (`api_call_logs`, `auth_metrics_hourly`, `background_job_logs`, `error_rate_hourly`, `golf_platform_metrics_daily`, `golf_tracer_health_snapshot`) have RLS enabled but **zero policies** — completely inaccessible to anything but service role | MEDIUM |
| LIVE-27 | View `crm_email_events` is `SECURITY DEFINER` — escalation risk | MEDIUM |
| LIVE-28 | 30+ functions with mutable `search_path` — SQL injection surface | MEDIUM |
| LIVE-29 | Public storage buckets `avatars` and `documents` allow listing | LOW |
| LIVE-30 | Leaked password protection disabled in Supabase Auth | LOW |
| LIVE-31 | `next.config.mjs:31` `typescript.ignoreBuildErrors: true` | HIGH |
| LIVE-32 | 336 `console.error` calls bypass Sentry — handled errors invisible | HIGH |

---

## Team boundaries (file ownership — NO overlaps)

### Team A — Database Foundation
**Owns:** `supabase/migrations/2026042*_*.sql` (new migrations only); `src/lib/types/database.ts` (regenerated); `memory/context/golfhelm-database.md` (re-snapshot)
**Touches:** SQL only. **Blocks: B, C, E.** Must finish before they merge their type-dependent code.
**Plan:** `01-team-a-database-foundation.md`

### Team B — Engine Correctness
**Owns:** `src/lib/coachhelm/v2/{orchestrator,gate}.ts`, `src/lib/coachhelm/v2/mining/**`, `src/lib/coachhelm/v2/nlg/**`, `src/lib/coachhelm/v2/prediction/**`, `src/lib/coachhelm/v2/learning/**`, `src/lib/coachhelm/v2/feedback/coach-behavior.ts`, related tests under `src/test/coachhelm/v2/**`
**Depends on:** Team A schema migrations + types regen.
**Plan:** `02-team-b-engine-correctness.md`

### Team C — Coach Screens & Action-Layer Schema Drift
**Owns:** `src/app/golf/actions/{insight-management,intelligence-dashboard,coachhelm-analytics,pattern-management,development,alerts,insights}.ts`, `src/lib/auth/verify-player-access.ts` (NEW), screens under `src/app/golf/(dashboard)/dashboard/{alerts,patterns,insights,intelligence,analytics,settings,development}/**`
**Depends on:** Team A.
**Plan:** `03-team-c-coach-screens.md`

### Team D — Player Feedback Loop
**Owns:** `src/app/golf/actions/player-feedback.ts` (NEW), `src/components/golf/coachhelm/player/AIInsightsPanel.tsx`, `src/app/golf/(dashboard)/dashboard/coachhelm/components/PlayerCoachHelmDashboard.tsx`, `src/app/golf/(dashboard)/dashboard/rounds/[id]/review/page.tsx`, `src/app/golf/actions/round-reviews.ts` (revalidatePath fixes only)
**Depends on:** Team A (only for `golf_insight_player_feedback` table from Team A migration).
**Plan:** `04-team-d-player-feedback-loop.md`

### Team E — Engine Durability & Background Jobs
**Owns:** `src/app/api/cron/coachhelm-calibration/route.ts` (NEW), `src/app/api/cron/coachhelm-validation/route.ts` (NEW), `src/lib/coachhelm/v2/feedback/{outcome-tracker,confidence-calibrator,insight-scorer}.ts`, `src/app/golf/actions/golf.ts` (only the round-submit trigger block at lines ~1623-1671), `vercel.json` (cron schedule)
**Depends on:** Team A schema; coordinate with Team B on `confidence-calibrator` ownership (B owns logic, E owns persistence).
**Plan:** `05-team-e-engine-durability.md`

### Team F — Build & Observability Hardening
**Owns:** `next.config.mjs`, `src/lib/server-error-logger.ts`, `src/lib/error-monitoring.ts`, `src/lib/auth/rate-limit.ts`, `instrumentation.ts`, `src/lib/datadog/index.ts`, `pre-deploy-check.sh`, `.github/workflows/ci.yml`
**Depends on:** Nothing — can start day 1 in parallel with all teams.
**Plan:** `06-team-f-build-observability.md`

---

## Dependency graph

```
                ┌──────────────────────┐
                │  Team A: DB Foundation │ ← BLOCKS B, C, E
                └──────────┬─────────────┘
                           │
         ┌─────────────────┼──────────────────┐
         ▼                 ▼                  ▼
    ┌─────────┐       ┌─────────┐       ┌─────────┐
    │ Team B  │       │ Team C  │       │ Team E  │
    │ Engine  │       │ Coach   │       │ Cron    │
    │ Logic   │       │ Screens │       │ Jobs    │
    └─────────┘       └─────────┘       └─────────┘

    ┌─────────┐       ┌─────────┐
    │ Team D  │       │ Team F  │   ← can start day 1
    │ Player  │       │ Build/  │
    │ Loop    │       │ Obsv    │
    └─────────┘       └─────────┘
```

## Execution order (recommended)

**Day 1 (parallel):** Team A + Team D + Team F start
**Day 2 (after A's migrations land):** Teams B, C, E start
**Final:** All teams converge on `main` via PR

## Conventions every team follows

1. **Run live-DB verification first.** Each plan starts with a `mcp__plugin_supabase_supabase__execute_sql` query to confirm the bug still reproduces against `qmnssrrolpinvwjjnufo` before touching code.
2. **TDD.** Write failing test → confirm it fails → minimal fix → confirm test passes → commit.
3. **Type-pinned selects only.** No `select('*')` in new code. No `(supabase as any)` casts.
4. **No `console.error` for handled errors.** Use `logServerError` from `src/lib/server-error-logger.ts`. If that module needs upgrading, that's Team F's job.
5. **Server actions:** every mutation calls `revalidatePath` for *all* affected screens, not just the obvious one.
6. **Worktree per team** if your harness supports it. Branch naming: `fix/coachhelm-team-{a|b|c|d|e|f}`.
7. **Commit cadence:** small commits; conventional commits (`fix:`, `feat:`, `refactor:`, `chore:`); each task ends with its own commit.

## Coordination touchpoints (between-team handshakes)

| When | Who | What |
|---|---|---|
| After A finishes migration `20260421_canonical_coachhelm_schema.sql` | A → B, C, E | Post the new types file path; B/C/E pull and start |
| After A creates `golf_insight_player_feedback` table | A → D | D can wire feedback action |
| Mid-Team-B and mid-Team-C if both want to touch `src/lib/types/index.ts` | B ↔ C | Negotiate via PR, not direct file lock |
| Before E removes fire-and-forget block from `golf.ts` | E → B, D | Confirm new workflow trigger replaces the call |
| Daily | All | 1 standup msg in shared channel: "done / next / blocked" |

## Done criteria

A team is "done" when:
- [ ] All `- [ ]` checkboxes ticked
- [ ] `npm run typecheck` passes from repo root with NO errors (`ignoreBuildErrors` flipped to `false` by Team F end-of-Phase-1)
- [ ] `npm run test -- <team's test files>` passes
- [ ] `npm run lint -- <team's files>` passes
- [ ] PR opened and reviewed by 1 other team's lead
- [ ] Live-DB verification queries documented in PR show the bug no longer reproduces
- [ ] No new `(supabase as any)` casts introduced
- [ ] No new `console.error` for handled errors

## Anti-goals (explicitly out of scope)

- iOS/TestFlight blockers (icon 404, Xcode signing, Info.plist permissions, version string) — separate plan
- Bundle bloat (recharts/framer-motion/jspdf/html2canvas) — separate perf plan
- 4,124 slate color usages, page-header consolidation, login mobile responsiveness — separate UX plan
- 3 god files refactor (`golf.ts` 4720 lines, `admin-data.ts`, `insights.ts`) — separate refactor plan
- 13+ documented IDOR/auth gaps in `REVIEW.md` (`getDocument`, baseball stats, OAuth state, etc.) — separate security plan (Team C will fix the CoachHelm-adjacent ones; the rest are out of scope)

These are real and documented in the audit, but bundling them into "fix CoachHelm" would balloon the plan past what 6 teams can finish coherently.
