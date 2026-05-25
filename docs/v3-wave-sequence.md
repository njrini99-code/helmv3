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
| W9-pt1 | Foundation docs (this PR) | 🟡 in-flight | `wave9-foundation` / PR #41 | 6 docs + 3 baseline docs |
| W9-pt2 | RLS helpers + `golf_metrics` table + seed + extend `golf_coachhelm_settings` | 🟡 in-flight | `wave9-pt2` / PR #42 | 6 migrations (split from 3 per Rule 2 + backfill rule); TS metric registry; dry-run against prod passed |
| W9-pt3 | Provider clients (push/email/flags) + Web Push subscription endpoint + local seed | 🟡 in-flight | `wave9-pt3` | Added `/api/push-subscriptions` POST/DELETE + browser subscribe helper; refactored `task-reminders.ts` to v3 wrapper; installed `@growthbook/growthbook` + `@types/web-push` |
| W10 | PGA standards table + seed | ⬜ | — | Depends on W9 |
| W11 | Player standing table + nightly cron | ⬜ | — | Reads SG from `golf_player_stats_cache` |
| W12 | Standing backfill (one-shot, chunked) | ⬜ | — | Separate PR from W11 |
| W13 | StandingBar component (3 variants, all states) | ⬜ | — | |
| W14 | Wire standing into v2 generators | ⬜ | — | Additive `evidence.standing` |
| W15 | StandingBar adoption — coach surfaces | ⬜ | — | |
| W16 | StandingBar adoption — player surfaces + `/my-standing` | ⬜ | — | |
| W17 | Counterfactual + secondary-line UI | ⬜ | — | Auto-suppress < 0.3 strokes |
| W18 | Goals schema + RLS | ⬜ | — | `golf_goals` table |
| W19 | Goals service + creation flow + suggestions | ⬜ | — | UI + `golf_goal_suggestions` |
| W20 | Focus areas → goals migration | ⬜ | — | One-shot SQL + rename old table |
| W21 | v3 generator base + `engine_version` + first generator | ⬜ | — | Putt-distance |
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
