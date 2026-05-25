# CoachHelm v3 — Wave Sequence Tracker

> **Live ship-status doc.** The full per-wave spec lives in [`docs/v3-master-plan.md` Part XXIII](./v3-master-plan.md). This file is the running ledger of what has shipped, what is in flight, and what is next. Update it as part of every wave's PR.

---

## Pre-Wave Verifications

| Task | Status | Resolved | Outcome |
|---|---|---|---|
| **A** — W29 qualifying UI scope | ✅ Resolved | 2026-05-24 | New v3 route at `dashboard/coachhelm/qualifying/[id]`; existing `qualifiers/[id]` gets only a "Manage selections" link. See plan Part XV.0. |
| **B** — web-push client already installed | ✅ Resolved | 2026-05-24 | `web-push@^3.6.7` and `resend@^6.7.0` already installed; only `@growthbook/growthbook` still needs install. Subscription persistence endpoint to be confirmed in W9-pt3. |

---

## Wave Ledger

Legend: `⬜ pending` · `🟡 in-flight` · `✅ merged + deployed + verified` · `⚪ deferred`

| # | Wave | Status | Branch / PR | Notes |
|---|---|---|---|---|
| W9-pt1 | Foundation docs (this PR) | ✅ merged 2026-05-25 | PR #41 | 6 docs + 3 baseline docs |
| W9-pt2 | RLS helpers + `golf_metrics` table + seed + extend `golf_coachhelm_settings` | ✅ merged + applied + verified 2026-05-25 | PR #42 | Prod verify: helpers=5, metrics=28, sg=5, putting=9, new_cols=3, new_checks=2 |
| W9-pt3 | Provider clients (push/email/flags) + Web Push subscription endpoint + local seed | ✅ merged 2026-05-25 | PR #43 | + Database types regen for W9-pt2; VAPID env vars set on Vercel (prod + dev; preview pending dashboard) |
| W10 | PGA standards table + seed | ✅ merged + applied + verified 2026-05-25 | PR #44 | Prod verify: 28 rows, 24 Tour-populated, 19 D1-populated, 0 orphan FKs. + Database types regen for `golf_pga_standards` |
| W11 | Player standing table + nightly cron | ✅ merged + applied + verified 2026-05-25 | PR #45 | Prod verify: RPC against all teams produced 171 rows across 15 metrics for 14 active players. + Database types regen for `golf_player_standing` + `refresh_player_standing` RPC. Cron schedule added in followup PR. |
| W12 | Standing backfill (one-shot, chunked) | ✅ merged + executed 2026-05-25 | PR #47 | `/api/cron/v3/standing-backfill` route shipped. Backfill formally executed against prod RPC: 171 rows refreshed across 15 metrics for 14 active players. Most-recent computed_at = 2026-05-25 03:36 UTC. |
| W13 | StandingBar component (3 variants, all states) | 🟡 in-flight | `wave13` | `src/components/golf/coachhelm/v3/StandingBar/` — index dispatcher + Card/Inline/Hero + types + utils. 38 tests passing (5 render-state matrix × 3 variants + utils unit tests). Visual review still needed on running dev server. |
| W14 | Wire standing into v2 generators | 🟡 in-flight | `wave14` | 1 helper (`standing-injection.ts`) + 6 v2 mining file modifications. Active injection in PuttDistance, Scrambling, ParType, WarmupHole, PressureGap. Future-ready imports in approach-analytics + tee-strategy. Helper no-ops when standing data isn't populated yet. |
| W15 | StandingBar adoption — coach surfaces | 🟡 in-flight | `wave15` | New `metric-config.ts` lookup; EvidencePanel renders v3 StandingBar (compact + expanded) when `evidence.standing` exists, falls through to legacy BenchmarkScale otherwise. Covers all coach insight surfaces (InsightCard → InsightsFeed → CoachAlertCenter → PlayerInsightClient). 2 new tests. |
| W16 | StandingBar adoption — player surfaces + `/my-standing` | 🟡 in-flight | `wave16` | New `/dashboard/my-standing/{page,loading}.tsx` — player-facing matrix grouped by category (SG / Putting / Approach / Short Game / Scoring / Course Mgmt / Pressure). Player CoachHelm dashboard auto-gets StandingBar via W15's EvidencePanel modification (no new wiring needed). |
| W17 | Counterfactual + secondary-line UI | 🟡 in-flight | `wave17` | `v3/counterfactual/` module (types + lookup-tables for 28 metrics + compute + baseline-loader) + `CounterfactualLine` component. Auto-suppressed below 0.3 strokes/round per locked decision. Wired into `/my-standing`. EvidencePanel integration deferred until parent surfaces fetch baseline. 14 unit tests. |
| W18 | Goals schema + RLS | 🟡 in-flight | `wave18` | golf_goals table created in prod (30 cols, 7 CHECKs, 3 indexes, 3 RLS policies, window_days generated). Database types regenerated (+142 lines). Empty until W19 service/UI + W20 focus_areas backfill. |
| W19 | Goals service + creation flow + suggestions | 🟡 in-flight | `wave19` | golf_goal_suggestions table live + RLS. v3/goals/ types + loader, server actions (createGoal, pauseGoal, abandonGoal, resumeGoal, accept/dismiss suggestion). GoalCard + GoalCreationModal components. 6 GoalCard tests. Engine-driven suggestion writer + evaluator cron deferred to a W19-followup. |
| W20 | Focus areas → goals migration | 🟡 in-flight | `wave20` | One-shot SQL: 5 of 7 active focus_areas mapped + migrated to golf_goals (2 unmapped — "Bounce-back %" + "Fairways hit %" have no v3 metric). All as coach-assigned mandatory + shared. Rename `_deprecated_` deferred until /my-development reads from goals. |
| W21 | v3 generator base + `engine_version` + first generator | 🟡 in-flight | `wave21` | engine_version column + check constraint + index live; 266 existing insights labeled 'v2' via default. BaseGenerator abstract class auto-injects standing + counterfactual + v3: prefix + engine_version stamp via upsertInsightV3 wrapper. PuttDistanceGenerator (3 buckets). 5 unit tests. |
| W22 | v3 generators: putt-bias + scrambling + approach-miss | ⬜ | — | |
| W23 | v3 generators: tee-strategy + par-type + course-mgmt | ⬜ | — | |
| W24 | v3 generators: pressure-gap + warmup-hole | ⬜ | — | |
| W25 | v2 → v3 generator CUTOVER | ⬜ | — | Orchestrator switch; delete 9 v2 generators |
| W26 | v2 sunset (code only — NO table drops) | ⬜ | — | `v2/reasoning/*`, `v2/nlg/*` |
| W27 | Coach intent + roster pill + drawer | ⬜ | — | `golf_coach_player_intent` |
| W28 | Composite insights v1 (12 rules + synthesis) | ⬜ | — | |
| W29 | Qualifying & travel workspace | ⬜ | — | **New v3 route — see Part XV.0** |
| W30 | LLM service + round review + budget + admin dashboard | ⬜ | — | |
| W31 | LLM hero narrative on player dashboard | ⬜ | — | |
| W32 | Coach chat backend + UI + 12 tool routes | ⬜ | — | |
| W33 | Player genome schema + nightly compute | ⬜ | — | |
| W34 | Player genome UI (player + coach + compare) | ⬜ | — | |
| W35 | Outcome causality schema + attribution cron | ⬜ | — | Feeds existing effectiveness table |
| W36 | Outcome causality wired into ranking | ⬜ | — | |
| W37 | Weekly coach email + cron + template | ⬜ | — | Whoop-style, Sunday 18:00 local |
| W38 | Practice Rx + `impacts_metric_id` on drills | ⬜ | — | LLM-driven plans |
| W39 | Auto-ingest: Arccos | ⬜ | — | |
| W40 | Auto-ingest: Garmin | ⬜ | — | |
| W41 | Auto-ingest: TrackMan + `golf_practice_sessions` | ⬜ | — | |
| W42 | Notifications preferences + per-category routing | ⬜ | — | |

---

## Update Protocol

Every wave PR must update this file:
1. Set the wave's status to 🟡 when the PR is opened.
2. Set to ✅ when merged + deployed + verified in prod (with the prod SELECT that proves it landed).
3. Add a notes column entry for any deviation from the plan.

If a wave's scope changes vs. Part XXIII, the master plan is amended in the same PR — never lie to this file by silently adjusting.
