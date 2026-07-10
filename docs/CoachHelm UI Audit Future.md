<!--
STATUS: SUPERSEDED
DATE: 2026-07-10
SUPERSEDED BY / WHY: CoachHelm UI/data-mapping doc dated 2026-05-29, superseded by later, more comprehensive passes: docs/audits/COACHHELM_FULL_VALIDITY_AND_FACET_AUDIT_2026-06-06.md and COACHHELM_MASTER_ENGINE_FEATURE_REMEDIATION_AUDIT_2026-06-21.md.
KEPT FOR HISTORY -- do not delete this file.
-->

# CoachHelm UI Audit — Future

> **What this is:** every CoachHelm UI surface mapped to its **real production data** (prod `qmnssrrolpinvwjjnufo`), plus a prioritized "what to fix / build next" plan.
> **Date:** 2026-05-29 · **Source:** live read-only prod scan + `main` source tree · **Scope:** `src/components/golf/coachhelm/**` + `/golf/dashboard` routes (~110 UI components).

**Legend:** 🟢 live with real, fresh data · 🟡 works but data is thin/stale · 🔴 UI built but data empty / broken / unused

---

## 🏌️ Player-facing features

| Feature | Route | Backing data (prod) | Status |
|---|---|---|---|
| Player CoachHelm dashboard | `/coachhelm` | aggregates insights (437) | 🟢 |
| Hero Narrative (LLM) | `/coachhelm`, `/hub` | `llm_calls`: 48 hero calls, 46 verified, latest 00:59 today (Haiku 4.5) | 🟢 |
| My Standing (PGA + Team + You) | `/my-standing` | `golf_player_standing`: 199 rows | 🟢 |
| My Game Profile / Genome | `/my-game-profile` | `golf_player_genome`: 37 rows, **`rounds_basis=0`, all values null** | 🔴 |
| My Development (Goals) | `/my-development` | `golf_goals`: 5 · `goal_suggestions`: 56 | 🟡 |
| Round Review | `/rounds/[id]/review` | `golf_round_reviews`: 52, all `generation_method="v1"`, latest May 19 | 🟡 |
| ↳ Round-Review LLM card | (same) | 0 LLM round-review calls (only hero + chat use LLM) | 🔴 |
| ↳ HoleShotPath / PuttHeatmap viz | (same) | renders from `golf_shots` (real shot/distance data) | 🟢 |
| What-If / Counterfactual | player dashboard | computed on-the-fly from lookup tables; `onSimulate` wired today (#189) | 🟢 |
| Shot analysis & trends | `/coachhelm` | `golf_shots` + `golf_player_stats_cache` | 🟢 |
| My Qualifiers | `/my-qualifiers` | `qualifier_entries`: 7 · `qualifiers`: 1 | 🟡 |
| My Insights | `/my-insights` | redirect → insights feed | 🟢 |

## 🧑‍🏫 Coach-facing features

| Feature | Route | Backing data (prod) | Status |
|---|---|---|---|
| Insights feed | `/insights` | `golf_coach_insights`: 437 (286 last 7d, latest today, v2+v3) | 🟢 |
| Patterns | `/patterns` | `golf_patterns_v2`: 18,442 | 🟢 |
| Intelligence Hub | `/intelligence` | aggregates insights/patterns | 🟢 |
| Alerts | `/alerts` | driven by insights + philosophy | 🟢 |
| CoachHelm Analytics | `/analytics/coachhelm` | `insight_effectiveness`: 1,749 · `prediction_model_performance`: 177 | 🟡 (attribution panels empty — see below) |
| Coach Chat (LLM) | `/coachhelm/chat` | `chat_conversations`: 5 · `messages`: 9 · `llm_calls` chat: 3 (Sonnet 4.6, latest 02:41 today); team-context + key fixed today (#190/#191) | 🟢 |
| Player Genome viewer + Compare | `/coachhelm/genome/[playerId]`, `/genome/compare` | same `golf_player_genome` (null vectors) | 🔴 |
| Qualifying / Lineup Board | `/coachhelm/qualifying/[id]`, `/qualifiers*` | `qualifiers`: 1 · `entries`: 7 · `selections`: 0 | 🟡 |
| Coach Intent (IntentPill / IntentDrawer) | roster / player views | `golf_coach_player_intent`: 0 | 🔴 |
| Coaching Intelligence Settings (Philosophy) | `/settings/coaching-intelligence` | `golf_coach_philosophy`: 3 coaches | 🟢 (low adoption) |
| Development Plans | `/development` | `focus_areas`: 8 · `goals`: 5 | 🟡 |
| Per-player insight view | `/players/[playerId]` | insights feed (437) | 🟢 |
| Predictions (feeds forecasts/analytics) | — | `golf_predictions`: 548; validation last ran April 23 | 🟡 |

## 🔁 Shared surfaces (render on both, audience-aware)

| Feature | Data | Status |
|---|---|---|
| Standing Bars | 199 rows | 🟢 |
| Insight cards | 437 | 🟢 |
| Goals (player + coach) | 5 goals / 56 suggestions | 🟡 |
| Genome | 37 null vectors | 🔴 |
| Round reviews | 52, v1, stale | 🟡 |
| Counterfactual line | on-the-fly, wired today | 🟢 |
| Practice Rx (drills on insights) | `drill_attachments`: 647 ✅ · `practice_sessions`: 0 | 🟡 |

---

## Surfaces where the UI is ready but the backend is empty/broken

1. **🔴 Genome** (player *My Game Profile* + coach *Genome viewer/Compare*) — `golf_player_genome` has 37 rows but every vector is null with `rounds_basis=0`. The nightly cron runs but computes nothing.
2. **🔴 Outcome causality** — `golf_insight_outcome_attribution` & `golf_coachhelm_coach_weights` = 0 rows, leaving the Analytics "did our advice work?" panels empty. **Root cause:** the `approach_direction_*` metric isn't registered in `golf_metrics` → the `causality-attribute` cron throws "unknown metric" (50-event Sentry storm). This is the #1 competitive differentiator and it's dark.
3. **🔴 LLM Round-Review card** — reviews are still v1 templates; the Claude composer isn't generating. Hero Narrative + Coach Chat are the only live LLM surfaces.
4. **🔴 Coach Intent** — `golf_coach_player_intent` = 0. Fully built; no coach has set a single intent (adoption, not a bug).

## The live, healthy core (real data right now)

Insights (437, fresh today) · Patterns (18.4K) · Standing Bars (199) · Hero Narrative LLM · Coach Chat LLM · shot-level analysis + HoleShotPath/PuttHeatmap viz · 28-metric registry with PGA baselines.

---

## Future — prioritized plan

### P0 — feed the surfaces that are already built (highest leverage)
- **Fix the genome cron** so it computes real vectors (investigate why `rounds_basis=0` — likely a round-lookup/window bug). Unblocks player *My Game Profile* + coach *Genome viewer/Compare* in one shot.
- **Fix the causality metric mismatch** — register the `approach_direction_*` metric IDs in `golf_metrics` (or remap the ApproachMiss generator to registered IDs) so `causality-attribute` stops erroring and `outcome_attribution` + `coach_weights` start populating. Lights up the Analytics effectiveness panels + the engine's self-grading loop.
- **Wire the LLM Round-Review composer** so new reviews use Claude (currently v1 templates, stale since May 19) — completes the 3rd promised LLM surface.
- **Restart prediction validation** — predictions are flowing (548) but self-grading stalled in April.

### P1 — adoption (features work; usage is the gap)
- **Coach Intent** (0 used) — surface the IntentPill prompt where coaches already work (roster, insights) so they set intents; the engine already consumes them for tone/gating.
- **Goals** (5 created, 56 suggested) — push engine suggestions harder into the player + coach flows.
- **Qualifying board** (1 qualifier, 0 selections) — onboard a real qualifier so the lineup workspace replaces the Sheet.
- **Practice Rx** — `practice_sessions` = 0; drills already attach (647) — close the loop so sessions get logged.
- **Player feedback** — `insight_player_feedback` = 0; add the thumbs-up/down capture so the learning loop has signal.

### P2 — depth / polish
- Genome **compare** depth, counterfactual coverage on more insight types, round-review viz on more rounds.
- SG display sanity pass (cache stores cumulative sums — confirm UI divides by rounds; `driving_distance_average`/`approach_proximity_average` are null on some rows).

---

*Generated from a live prod scan on 2026-05-29. Read-only; no production data was modified.*
