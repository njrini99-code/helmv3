# CoachHelm Phase 2 — Deferred E/F plan (band reconciliation, standing, persistence)

> **Status:** DESIGNED + prod-verified, NOT built. Parked under the "do only high
> confidence" constraint (2026-06-01). The high-confidence subset already shipped on
> branch `feat/coachhelm-theme-insights`: the legacy-band **guard test** (`8b78c885`)
> and **E0 approach-unit fix** (`db4107b9`). Everything below is the remainder —
> mostly migrations + the user's prod re-gen, which is why it was deferred.
> Source: the `coachhelm-EF-design-recon` workflow (5 maps + 3 adversarial verifications,
> verified against prod `qmnssrrolpinvwjjnufo`).

## Why deferred
- **E1–E5 lag-putt chain** needs additive cache columns + a **cache-refresh SQL function** + an **RPC binding change** + generator emit, and its correctness is only confirmable via a **prod cache-recompute + insight re-gen** (standing is snapshotted into `golf_coach_insights.evidence` at write time — `generator-base.ts:114-143`, read back at `assemble.ts:336-377` — so seed/RPC alone changes nothing for the 51 approach / 12 tee / 3 putt rows already on disk).
- **F** `theme_id` ≈ duplicate of `category` for v3 rows (marginal value now) + a read-path deploy-ordering wrinkle; the edge half is unsafe.

## HARD PROHIBITIONS (the silent-corruption vectors)
- **Never** edit `getPuttDistanceBucket` or any `GolfStats.puttMakePct*`/`approachProx*` band field (`golf-stats-calculator-shots.ts` ~464-489, fields ~222-314). Legacy stays on `15_20`/`20_plus`; v3 stays on `15_25`/`25_plus`; they coexist. The new guard test (`8b78c885`) will fail loudly if this is violated.
- **Never** rename v3 metric IDs (`putts_made_*`, `approach_proximity_*ft`) — persisted in 53 `golf_coach_insights.evidence` rows + `golf_pga_standards`/`golf_drills`/`golf_goals`. Fix values, not names (E0 already did this for approach units).
- **Never** change the `upsertInsight` dedup target (`signature,player_id,coach_id,team_id`) or introduce DELETE-then-INSERT.
- **Never** alter existing `refresh_player_standing` bindings, the `rounds_played>=5` gate, or the PGA-null filter — only append.
- **Do NOT** edit the archived original v3 seed migrations — ship new migrations only.
- **Do NOT** seed `golf_pga_standards` for the 4 `putt_miss_bias_*` metrics (no public PGA benchmark; diagnostic-only is correct).

## E — band reconciliation + deferred standing (ordered, each additive)

**E1 — add v3-edge putt cache columns** (additive DDL, must land before backfill)
```sql
-- up
ALTER TABLE public.golf_player_stats_cache
  ADD COLUMN IF NOT EXISTS putt_make_pct_15_25ft numeric,
  ADD COLUMN IF NOT EXISTS putt_make_pct_25_plus_ft numeric;
-- down
ALTER TABLE public.golf_player_stats_cache
  DROP COLUMN IF EXISTS putt_make_pct_15_25ft,
  DROP COLUMN IF EXISTS putt_make_pct_25_plus_ft;
```

**E2 — populate the new columns in the cache-refresh** (NOT the TS calculator; the cache is written by a separate SQL process). Compute `15_25` = made/total over 15≤d≤25, `25_plus` = d>25, in the same pass as the legacy bands. `CREATE OR REPLACE FUNCTION` (preserve prior body in the down). **Blocker:** only 1 of 14 players currently has any non-null `putt_make_pct_*` → the re-gen must include a **full cache recompute**.

**E3 — add the two lag RPC bindings + refresh-list parity.** `CREATE OR REPLACE FUNCTION public.refresh_player_standing(uuid[])` adding `putts_made_15_25ft_pct → putt_make_pct_15_25ft` and `putts_made_25_plus_ft_pct → putt_make_pct_25_plus_ft` to `v_bindings` (down restores the prior 15-binding body verbatim). Code parity: move those two IDs from `STANDING_REFRESH_DEFERRED_METRIC_IDS` (`src/lib/coachhelm/v3/standing/refresh.ts:62-78`) into `STANDING_REFRESH_METRIC_IDS` (:32-34) in the SAME commit. PGA baselines exist live (15.4 / 5.5), so rows land automatically once the cache columns are non-null.

**E4 — generator + orchestrator emit the two lag buckets.** `src/lib/coachhelm/v3/generators/putt-distance.ts` — extend `PuttBucketKey` (:33), `BUCKET_TO_METRIC_ID` (:35-39), `BUCKET_TO_CACHE_COLUMN` (:41-45 → new columns), `BUCKET_LABEL` (:47-51) with `15_25ft`/`25_plus_ft`. `src/lib/coachhelm/v2/orchestrator.ts:230-234` — add `new PuttDistanceGenerator(playerId, '15_25ft')` and `('25_plus_ft')`. `requiresStanding` stays default true. This makes rows with signature `v3:putt_distance:15_25ft`/`:25_plus_ft`, satisfying `isWeakLagPutt` (`lag-distance-3putt.ts:14-27`) so the `lag_distance_3putt` composite can finally `detect()`. No change needed to metric-config/pga-standards/leak-maps/composite rules (all already speak `15_25`/`25_plus`).

**E5 — approach-proximity + scrambling-rough/fairway standing (DEFER — HARD group).** Needs a NEW shot-level standing source (the RPC reads only the cache, which has no per-bucket approach columns / no per-lie scrambling columns) + flipping `approach-miss.ts` `requiresStanding` + new scrambling generators. Land lag-putt (E1-E4) first; this is a separate, larger play. (E0 — the approach-unit fix — is the prerequisite and is already shipped.)

## F — persist the cascade

**F1+F2+F3 — `theme_id` only** (the edge half is deferred):
```sql
-- up
ALTER TABLE public.golf_coach_insights ADD COLUMN IF NOT EXISTS theme_id text;
CREATE INDEX IF NOT EXISTS idx_insights_theme
  ON public.golf_coach_insights (player_id, theme_id) WHERE theme_id IS NOT NULL;
-- down
DROP INDEX IF EXISTS public.idx_insights_theme;
ALTER TABLE public.golf_coach_insights DROP COLUMN IF EXISTS theme_id;
```
- Write-path (additive, non-destructive): `InsightInput.theme_id?` (`v2/insights/types.ts`); set it in `upsert.ts` insertNew/updateExisting; pass `theme_id: this.category` (`generator-base.ts:146-155`) and `rule.category` (`synthesis.ts:120-129`). `theme_id` is NOT in the dedup key.
- Read-path: `assemble.ts` prefer `row.theme_id` else `row.category` (thread through `EvidenceInsight` + `INSIGHT_SELECT` + `mapRowLoose`). **DEPLOY ORDERING:** the F1 migration MUST be applied before the read-path code (which `SELECT`s `theme_id`) is deployed, or the query errors on a missing column.

**F4 — `golf_insight_edges` (DO NOT build now).** Scalar `parent_insight_id` is lossy for the many-to-many cascade + an FK-archival hazard + id-churn dangling-edge hazard, and prod has exactly 1 cascade row. If ever built: an RLS-enabled `golf_insight_edges(parent_id, child_id, relation, ordinal)` table (FK `ON DELETE CASCADE`), written from `synthesis.ts`, read in `assemble.ts` as prefer-persisted-with-fallback. Read-time edge assembly stays the source of truth.

## Migration manifest (user runs, in order)
1. `e1_cache_putt_lag_columns.sql` — add the two cache columns (before backfill).
2. `e2_cache_refresh_putt_lag_population.sql` — `CREATE OR REPLACE` cache-refresh to populate them.
3. `e3_refresh_player_standing_add_lag_bindings.sql` — append the two lag bindings.
4. `f1_golf_coach_insights_theme_id.sql` — add `theme_id` + partial index.

## RE-GEN STEP (the prod op E is coupled to)
After migrations 1–3 land: (a) **full cache recompute** (only 1/14 players populated today), (b) **standing-refresh cron** (populates `putts_made_15_25ft_pct`/`25_plus_ft`), (c) **v3 insight re-generation** (orchestrator + composite synthesis) so lag insights write, snapshot standing/counterfactual into `evidence`, and `lag_distance_3putt` fires. The 51 approach + 12 tee + 3 putt rows on disk gain magnitude/standing ONLY after this. `theme_id` (migration 4) backfills for new rows on the same re-gen; existing rows stay NULL and use the read-path `category` fallback (no separate backfill UPDATE; do NOT wire a backfill into a request path).

## Recommended build order when greenlit (each gated: tsc + tests + next build + legacy guard)
E1+E2 → E3 (+ refresh.ts parity) → E4 (generator+orchestrator + composite detect test) → F1+F2+F3. Each independently revertible (migrations have downs; code is additive).
