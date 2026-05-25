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
| W12 | Standing backfill (one-shot, chunked) | 🟡 in-flight | `wave12` | `/api/cron/v3/standing-backfill` route. Iterates all teams in TEAMS_PER_CHUNK batches, calls refresh_player_standing RPC. Operator-triggered after deploy. Same idempotency guarantees as W11 cron. |
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
