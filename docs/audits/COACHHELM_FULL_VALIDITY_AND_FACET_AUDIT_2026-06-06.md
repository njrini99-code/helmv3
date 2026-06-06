# CoachHelm — Unified Validity, Accuracy & Every-Facet Audit

**Date:** 2026-06-06 · **Branch:** `fix/birdies-per-round` · **Target:** live prod (read-only)

## Method

Two adversarial multi-agent workflows, **188 agents total**, every material finding independently reproduced (confirmed / refuted / re-graded) against live prod data and the real test suite. Severities below are the **post-verification reconciled** values, not first-pass claims.

| Workflow | Agents | Scope | Confirmed material | Strengths |
|---|---|---|---|---|
| Validity & accuracy (`w9decn1jh`) | 36 | SG/stats math · counterfactual/cohort math · statistical validity · domain calibration · end-to-end fidelity | 22 | 10 |
| Every facet (`wku4acj78`) | 152 | 9 generators + 10 composites + 12 subsystems (assembler, ranking, read-path, standing/cron, registry, UI/tone, security/RLS, data-integrity, edge-cases, performance, test-suite) | 79 | 54 |

Plus a hand-run live reconciliation (SG additivity, pga_delta, counterfactual sign, cache integrity) and a clean `tsc --noEmit` (exit 0) + full test suite (**1498 passed / 24 skipped / 0 failed**).

---

## 0. TL;DR

**The engine's computational core is correct. What a coach actually sees today is unreliable — and the dominant reason is a single deploy-state gap, not broken math.**

The two workflows converged on the **same ranking pathology from opposite ends**:

- **Validity** found the *top* of the feed poisoned: stale **v2 `par_scoring`** rows mix a to-par player value against a raw-stroke team average → physically-impossible `strokes_impact` up to **42.5 strokes/round**, ranking **#1**.
- **Every-facet** found the *bottom* of the feed zeroed: the **H2 `strokes_impact` backfill is committed but not deployed**, so **89 of 194** legitimate v3 insights with a positive counterfactual ship `strokes_impact = 0` → rank **0**.

These are the two halves of one problem. **Result: the highest-leverage real weaknesses are buried at 0 while an impossible 42-stroke phantom sits on top.** The fix is mostly *deploy + clean stale rows*, then a bounded calibration list — no architectural rework.

**One caveat I own:** the prod DDL I applied on 2026-06-05 (cohort + approach-proximity standing migrations) **granted EXECUTE to `anon`/`PUBLIC`** on three SECURITY DEFINER RPCs — a real security regression flagged below (SEC-RLS-1). It needs a REVOKE before anything else.

---

## 1. The cross-validation (why this is high-confidence)

Two workflows that did not share findings independently confirmed the same defects:

| Defect | Validity workflow | Every-facet workflow |
|---|---|---|
| Ranking poisoned by `strokes_impact` | FID-1/FID-2: v2 par_scoring = 42.5/rd ranks #1 | EC-1: v3 backfill undeployed, 89/194 = 0 |
| Tiny-N percentile rails | SV-2: `team_pct` 0/100 at team_n≤2 | EC-2 / lag3putt-2 / PDC-1: "Bottom 1% on a team of one" |
| No counterfactual cap | CF-1/CF-2: 16 rows >2.5/rd, par sum 9.2 | par-type-3: ×10 multiplier dominates |
| `'other'` lie / tail outliers | SG-1/SG-2: flat 3.50, 390ft putts ×3 | (input-validation, P2) |
| Cohort = synthetic artifact | DC-COHORT-1: sg_putting −3.94 | scrambling-cohort-collapse, SC3 |
| Stale-window prose | FID-4: "last 30 days" with no rounds in window | DI-1: 30-day dedup freezes lifecycle |
| Proximity %-as-feet | (root-caused C1/C2 fixed) | SAPG-2: 6 live rows "ball 73 ft from hole" (% shown as ft) |

When two blind audits land on the same line:number, the finding is real.

---

## 2. Overall verdict — can a coach trust it today?

**Conditional. Trust the modern per-metric numbers; do not trust the ranking, the confidence score, the par-scoring cards, or any cohort/team-percentile comparison — and nothing is validated on real data yet.**

### ✅ Trust (validated + tested)
- **SG decomposition & per-metric v3 numbers** — additivity guaranteed by construction (`golf-stats-calculator-shots.ts:2209`, empirical err 0.003); per-shot SG is exactly Broadie's; v3 generator outputs reconcile *exactly* to raw shots ("175+ yd approach 29% = 28/96 in `golf_shots`"). Incomplete data returns `null`, not 0.
- **Assembler cascade** — per-category stroke conservation, first-claimant ownership, SG-only totals, realistic≤Tour invariant — property-tested 315/315.
- **Ranking score *formula*** — `|impact|×confidence×weight×goalBoost×coachability`, NaN/÷0-safe, stable tie-break (48 tests). *(The formula is sound; its inputs are poisoned — §4.)*
- **Write integrity** — upsert/ON CONFLICT everywhere, 0 orphans/duplicates live, atomic round-submit RPC. No destructive writes.
- **RLS read-isolation** on standing + coach-insights; fail-closed cron auth; injection-safe dynamic SQL with pinned `search_path`.
- **Cold-start safety** — 0-round / all-strong players don't get fabricated weaknesses.

### ⚠️ Correct but UNTESTED (green CI ≠ safe)
`generator-base.run()` lifecycle · `synthesizeForPlayer` + read-path dedup · H6 priority re-persist on UPDATE (deleting the line still passes 100% of tests) · all PL/pgSQL standing RPCs + the registry parity guard (never wired into CI) · cross-tenant insight RLS.

### ❌ Broken / dead — not working features
`gen:putt-bias` · `comp:bunker-miss-side-amplifier` · `comp:flyer-lie-over-the-green` · `comp:long-approach-3putt-cascade` · `comp:short-approach-proximity-gap` (shows the *pre-fix bug live*) · `comp:lag-distance-3putt`.

### ⛔ Blocked on data (code sound, source empty/synthetic)
All 5 putt-make-%-by-distance metrics (cache cols 100% NULL) · approach `evidence.detail` not regenerated on prod · round-metrics cohort never computed · **every cohort baseline is a demo artifact** (sg_putting −3.94; some proximities better than Tour).

---

## 3. Per-facet scorecard

### Math / Statistics / Domain (validity workflow)
| Dimension | Verdict |
|---|---|
| SG & stats math | sound_with_caveats |
| Counterfactual & cohort math | sound_with_caveats |
| Statistical validity | **unreliable** (hollow confidence, degenerate percentiles) |
| Domain calibration | sound_with_caveats |
| End-to-end fidelity | **unreliable** (stale/scale-mixed rows reach the coach) |

### Tier-1 Generators (9)
| Facet | Verdict | Tests | Top reconciled issue |
|---|---|---|---|
| approach-miss | caveats | partial | **am-3 (H):** percent `your_value` read as feet the instant `requiresStanding` flips — armed landmine |
| course-mgmt | caveats | partial | **cm-1 (H):** PGA-anchored HIGH "3× Tour" card while counterfactual = gap-to-cohort → `strokes_impact=0` |
| par-type | caveats | partial | **par-type-3 (M):** ×4/×10/×4 holes multiplier makes par-scoring the largest leverage value, dominates top-3 |
| pressure-gap | caveats | partial | **pg-1 (H):** 4 stale HIGH "+6.5 strokes" rows from 0–1 rounds, never retracted; **pg-2:** SQL gate ≠ TS gate |
| putt-bias | **dead_code** | partial | **pb-1 (H):** break-direction cache cols 100% NULL → never emits |
| putt-distance | caveats | partial | **gpd-1 (H):** `comparison_value` hardcoded 0 → "95% vs 0% PGA" inverse; cache cols NULL → dead today |
| scrambling | caveats | partial | **cohort-collapse (M):** 14.8% sand cohort floor suppresses real bunker leaks |
| tee-strategy | caveats | partial | **tee-strat-1 (H):** every row `strokes_impact=0` → "Driver costing you" card shows "~0.0 strokes", ranks last |
| warmup-hole | caveats | partial | **double-surface (M):** dual-fires with front-9-starter (latent) |

### Composite Rules (10)
| Facet | Verdict | Tests | Top reconciled issue |
|---|---|---|---|
| bunker-miss-side-amplifier | **dead_code** | partial | requires a putt-bias insight that can't exist → never fires |
| closing-hole-fatigue | caveats | partial | `peer_delta` mislabel vs own-baseline (4 files) |
| doubles-after-bogey | caveats | partial | **DAB-1 (H):** no MIN_ROUNDS guard → one 15-bogey round = 3.5/rd, ranks #1 urgent |
| flyer-lie-over-the-green | **dead_code** | partial | loader filters `lie_before='light_rough'` (violates CHECK, 0 rows) |
| front-9-starter | caveats | partial | display double with warmup; 0/19 fire (threshold unproven) |
| lag-distance-3putt | **broken** | partial | **lag3putt-2 (H):** team_pct=0 flags elite 94.8% putter weak; **-3 (H):** strokes_impact=0 |
| long-approach-3putt-cascade | **dead_code** | adequate | **DEAD-1 (CRIT):** 100% of approach rows lack `evidence.detail` → `NaN>50` → never fires |
| pressure-decel-chain | caveats | partial | **PDC-1 (H):** team_pct over N=1 flags elite putters weak |
| short-approach-proximity-gap | **broken** | partial | **SAPG-2 (H):** 6 live rows show green-hit % as proximity feet ("ball 73 ft") — pre-fix bug deployed |
| short-side-scrambling-chain | caveats | partial | **sscc-1 (H):** loader excludes real `sand` recoveries; bunker branch always 0%, prose promises "bunker splash" |

### Subsystems (12)
| Facet | Verdict | Tests | Top reconciled issue |
|---|---|---|---|
| assembler | caveats | adequate | **ASM-1 (M):** no cross-metric dedup → v2+v3 par-N rendered twice (14 players). Core cascade correct |
| ranking | caveats | adequate | **RANK-1 (M):** player feed orders by `created_at` only → impact backfill no-op on player cards; 3–4 divergent rankers |
| read-path | caveats | partial | **RP-1 (M):** `insight-evidence.ts` no ownership check → teammate reads peer's round summaries; 100-row pre-rank drops top-impact |
| standing-cron | caveats | **missing** | **SC2 (H):** 5 putt metrics "covered" yield 0 rows; **SC3 (H):** round-metrics RPC computes no cohort |
| metrics-registry | caveats | **missing** | **MR-2 (H):** seed not reproducible from migrations + wrong `config.toml` path → fresh `db reset` = empty `golf_metrics` |
| ui-tone | caveats | partial | **ui-tone-2 (H):** MovementPill paints GREEN ↑ on a worsening leak; "↑399%" labels; percent-axis clamp |
| security-rls | caveats | partial | **SEC-RLS-1/2 (H):** 3 standing RPCs + cache mutators granted anon/PUBLIC EXECUTE |
| data-integrity | caveats | partial | **DI-1 (H):** 30-day dedup window vs global UNIQUE silently drops fresh evidence (lifecycle frozen). Core upsert clean |
| edge-cases | caveats | partial | **EC-1 (CRIT):** H2 backfill not deployed → 89/194 leaks `strokes_impact=0`; **EC-2 (H):** tiny-N percentile rails |
| performance | caveats | **missing** | **PERF-2 (M):** cohort recomputed 17×/chunk + team-select by `created_at` → 96% starvation at scale |
| test-suite | caveats | partial | **RAN: 1498 pass / 24 skip / 0 fail; tsc 0.** Lifecycle/RPC/parity untested (silent-regression risk) |

---

## 4. Confirmed issues by blast radius (deduped across both workflows)

### 🔴 CRITICAL

**1. The ranking pathology (EC-1 + FID-1/FID-2)** — *the* trust-blocker.
- v3 side: only 1/194 insights has nonzero `strokes_impact`; 89 have positive counterfactual but `strokes_impact=0` (60 worth ≥1.0/rd, 30 already priority high/urgent). `generator-base.ts:203-224` computes it; newest prod row stamped 2026-06-06 03:45 → **deployed cron runs pre-fix code**.
- v2 side: stale `par_scoring_parN` rows (scale-mix at `benchmarks.ts:111`) carry |impact| up to 42.53/rd, rank #1; don't dedupe against the v3 `scoring_par_*` aliases.
- **Coach sees:** #1 priority = an impossible 40-stroke par-4 leak; the real top weakness scores 0 and is buried.
- **Fix:** deploy the branch (verify bundle contains the backfill) + filter read path to v3 + hard `|strokes_impact|` ceiling (~8) before ranking + one-time backfill from `evidence.counterfactual` + archive stale v2 rows.

**2. DEAD-1 — long-approach-3putt-cascade never fires** — 100% of 57 approach rows lack `evidence.detail.proximity_when_hit_feet` → `NaN>50` false → 0 fires ever. Root cause: detail-writing code uncommitted/undeployed (`approach-miss.ts:217-220`). Same gap kills short-approach-proximity-gap. **Fix:** deploy + re-run `synthesizeForPlayer`; add a persisted-row round-trip test.

### 🟠 HIGH

**3. SEC-RLS-1/2 — anon/PUBLIC EXECUTE on SECURITY DEFINER RPCs** *(regression I introduced via the 2026-06-05 prod DDL)* — `20260605130000_*.sql:138-140 GRANT ALL … TO anon`; live `=X` (PUBLIC) on all three standing RPCs (`prosecdef=true`, owner `postgres`/bypassrls); same for `refresh_player_stats_cache` / `mark_player_stats_stale`. Unauthenticated RLS-bypassing recompute/DoS + authenticated cache IDOR. **Fix (P0):** `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated; GRANT … TO service_role;` + pgTAP `rpc_grant_hardening` assertion.

**4. MR-2 — `golf_metrics` not reproducible** — baseline CREATEs but never INSERTs; seed only in `migrations_archive/`; `config.toml:63` seed path wrong. Fresh `db reset`/CI shadow DB/DR rebuild → **empty metrics table → silent no-op engine + FK failures**. Prod itself fine (28 rows). **Fix (P0):** numbered idempotent 28-row `INSERT … ON CONFLICT DO NOTHING`; fix seed path.

**5. SC2/SC3 — standing data gaps** — 5 putt-make-% metrics reported "covered" but yield 0 rows (cache cols NULL); round-metrics RPC computes no cohort → pressure/warmup permanently over-stated vs Tour. **Fix:** populate `putt_make_pct_*` in the cache writer (or defer the metrics); add the cohort CTEs to `refresh_player_standing_round_metrics`.

**6. DI-1 — fresh evidence silently dropped** — 30-day dedup lookup vs global UNIQUE + `ignoreDuplicates:true` → recomputed values never land for >30d-old insights (11 stuck rows, lifecycle frozen). **Fix:** drop the `.gte(created_at,cutoff)` on the dedup lookup, or `ignoreDuplicates:false`.

**7. Tiny-N percentile rails (EC-2 / lag3putt-2 / PDC-1 / SV-2)** — `team_pct = PERCENT_RANK()` = 0 for the only/worst row; 43% of standing rows sit at 0/100; a 94.8%-from-3-5ft putter is told "Bottom 1% on your team." **Fix:** gate `teamCohortText`/`ordinalRank` on `team_n≥5`; NULL `team_pct` when `team_n<3`; add an absolute-skill floor to the team_pct composite predicates.

**8. Confidence is hollow (SV-1)** — `recency`/`variance` hard-coded (1.0/0.5) in all 9 generators → confidence collapses to `0.4·(sample/target)+0.45`; encodes round-count only, feeds both the rank multiplier and a hard surface filter. **Fix:** compute real recency (round dates) + variance (per-round stddev), or relabel "sample adequacy."

**9. No counterfactual cap (CF-1/CF-2)** — only a lower-bound suppress (0.3); 16 live rows >2.5/rd; per-par projections sum to 9.2 (the whole round gap); `scoring_par_4` factor=10. **Fix:** per-projection clamp after `compute.ts:81` (ceiling ~2.5; tightest on par-scoring + pressure); cap the *sum* to the SG:Total gap.

**10. Generator framing/zeroing (cm-1, tee-strat-1, lag3putt-3, am-3, DAB-1, pg-1/2/3)** — PGA-anchored HIGH cards with zero leverage; composites + `requiresStanding=false` generators bypass the backfill (strokes_impact=0 → ranked last under an "urgent" title); single-round doubles = 3.5/rd urgent; pressure alerts never retract. **Fixes** itemized in §10.

**11. UI tone polarity (ui-tone-2)** — `approach_direction_*` not in registry, regex misses "direction" → a worsening leak renders **GREEN ↑**; improving leak → amber. Multiple live cards. **Fix:** add `direction|leak|bias` to the negative pattern, or register the family `lower_better`.

**12. SAPG-2 — proximity %-as-feet live** — 6 active rows: "leaving the ball 73 ft from the hole" where 73 is the green-hit *percent*. Deployed code is the pre-fix bug; fix is committed but undeployed; the 6 rows won't self-heal. **Fix:** deploy + explicitly expire the 6 rows.

**13. SG calibration (SG-1)** — unknown lie `'other'` (313 live shots, 78% of rounds) collapses to a flat 3.50 expected with zero distance sensitivity → fabricated ±1 stroke/shot SG that flips sign with distance. **Fix:** map `'other'`/`'recovery'`/unmapped to the rough table or return null.

### 🟡 MEDIUM (selected)
ASM-1 (v2/v3 par-N double-render) · RANK-1/2/4 (divergent rankers, 100-row pre-rank drops top impact) · RP-1 (peer round-summary read) · SC1 (orphan stale standing rows) · sscc-1 (sand recoveries excluded) · SG-2 (yard-putts ×3, 390ft) · DC-SG-1/3 (putting-gap snap, 400yd tee/fairway 0.5-stroke discontinuity) · SG-4 (penalty strokes skipped → SG:Total non-reconcilable on 43% of rounds) · CF-3 (SG "0" = field-median mislabeled "PGA Tour") · ui-tone-3/4 (uncapped "↑399%", percent-axis clamp) · PERF-2/3 (cohort recomputed 17×/chunk, unwrapped `auth.uid()`, 349 advisor warnings) · SV-7 (spurious precision "+0.01 strokes" at SEM 0.18).

---

## 5. Dead & deferred code (NOT working features)

| Item | Why dead | Unblocks on |
|---|---|---|
| gen:putt-bias | break-direction cache cols 100% NULL | aggregator over `golf_shots.putt_break` (5,625 rows exist) |
| comp:bunker-miss-side-amplifier | needs a putt-bias insight that can't exist | putt-bias revival |
| comp:flyer-lie-over-the-green | loader filters `light_rough` (violates CHECK) | rough-severity lie taxonomy (product capture) |
| comp:long-approach-3putt-cascade | `evidence.detail` not on prod rows | **deploy + regenerate** |
| comp:short-approach-proximity-gap | dead + 6 stale pre-fix rows | **deploy + expire stale rows** |
| comp:lag-distance-3putt | lag putt cache cols NULL | cache backfill (SC2) |

**Deferred/dormant (gated by data/threshold):** scrambling-by-lie · rough-severity taxonomy · division/cohort field (cohort = app-population V1) · PGA cohort cluster · front-9-starter / closing-hole-fatigue / pressure-decel-chain dormant on current data · the 2 lag-putt metrics (activated 06-05, 0 rows).

---

## 6. Security

- **SEC-RLS-1/2 (high):** standing RPCs + cache mutators anon/PUBLIC-executable (see §4-3) — re-introduces the class the `20260602165152` rescue closed; no `rpc_grant_hardening` test covers them.
- **RP-1 (medium):** `insight-evidence.ts` leans entirely on RLS → same-team peer reads of round summaries.
- **RP-2 (low):** `searchInsights`/`getInsightsStats`/`getInsightFilterOptions` trust caller `coachId` with no `auth.getUser()` (RLS backstops; defense-in-depth gap).
- **Deferred grant audit (confirmed real):** advisor shows 69 anon-executable + ~91 authenticated-executable SECURITY DEFINER functions.
- **Correct:** RLS read-isolation, pinned `search_path` + injection-safe dynamic SQL, fail-closed cron auth.

---

## 7. Performance at scale

Negligible today (53 players) — all break at ~100×:
- **PERF-2:** standing cron recomputes the identical global cohort **17×/chunk** + selects teams by `created_at ASC` → at >50 teams only the first-created 50 ever refresh (~96% starvation); risks the 300s `maxDuration` at ~5000 players. Fix: materialize the cohort once/run; order by real freshness NULLS FIRST.
- **PERF-3:** 349 `auth_rls_initplan` + 228 `multiple_permissive_policies` warnings; `golf_shots` themes fetch runs 4 OR-ed RLS subqueries/row; N+1 standing loads. Fix: wrap `auth.uid()` as `(SELECT auth.uid())`, merge policies, batch loads.

---

## 8. Test-coverage map

**Ran:** `vitest run src/test/coachhelm src/test/golf/actions` → **190 files, 1498 passed, 24 skipped, 0 failed (15.9s)**; `tsc --noEmit` → exit 0.

**Well-covered:** C1/C2 proximity-vs-percent (incl. negative "never print % as ft"), H1 empty-array guard, H2 backfill pure helpers, cohort fallback, coachability boost + NaN/tie-break (48 tests), read-path app-gate, assembler conservation (315/315).

**Silent-regression gaps (green CI ≠ safe):** `generator-base.run()` lifecycle · `synthesizeForPlayer` + read-path dedup · H6 priority re-persist (deleting the line still passes) · all PL/pgSQL RPCs + `validateMetricRegistry` parity (never wired into CI) · cross-tenant insight RLS · every generator test exercises `composeContent` in isolation, never `aggregate()`/gating.

---

## 9. The demo-data calibration gate (can't be fixed by code)

Prod is ~53 players / 173 rounds, heavily synthetic (cloned fingerprints; cohort `sg_putting` −3.94, sand-save 14.8%, 50-125yd proximity better than Tour). **Computational correctness is proven; real-world calibration is unproven.** Re-run the reconciliation once **≥30 real players × ≥10 real rounds** exist, checking: cohort sg_putting in [−1.5,+0.5]; sand-save 30–45%; proximities *worse* than Tour; counterfactual ceiling realistic after caps; per-par sums ≤ each player's actual gap. **Do not enable cohort-primary counterfactuals before this passes** — add per-metric plausibility bounds (reject cohort sg_putting < −1.0, sand-save < 25%) in the meantime.

---

## 10. Prioritized hardening checklist

### P0 — blocks trustworthy output
1. **Deploy `fix/birdies-per-round`**; verify the bundle contains `generator-base.ts:203-224`. Closes EC-1 (89 zeroed leaks), DEAD-1, SAPG-2, am-1. Add a cron e2e assertion (`≥1 generator row: strokes_impact == counterfactual.strokes_saved_per_round`) + one-time backfill from `evidence.counterfactual`.
2. **REVOKE anon/PUBLIC EXECUTE** on the 3 standing RPCs + cache mutators; grant `service_role` only; pgTAP assertion. *(my regression — do this first)*
3. **Make `golf_metrics` reproducible** — numbered idempotent INSERT migration; fix `config.toml` seed path.
4. **Filter read path to v3 + hard `|strokes_impact|` ceiling (~8) before ranking + render-time clamp/same-unit assert in `EvidencePanel`**; archive stale v2 `par_scoring` rows + expire the 6 short-approach + 4 pressure-gap stale HIGH rows.
5. **Per-metric plausibility bounds on cohort `level_avg`** before it's a counterfactual target; label cohort "provisional."

### P1 — correctness/fidelity a coach sees
6. Fix DI-1 (dedup window). 7. Gate tiny-N percentile messaging (`team_n≥5`) + absolute-skill floor. 8. Populate round-metrics cohort (SC3) + anchor course-mgmt/par-type prose+priority to the cohort the counterfactual uses + cap par-type ×10 leverage. 9. Pressure-gap retraction sweep + unify SQL/TS per-bucket gate. 10. UI tone polarity (`approach_direction_*` → lower_better; cap % labels; domain-aware axis). 11. Guard the am-3 landmine before flipping `requiresStanding`. 12. Cap counterfactuals (CF-1/CF-2). 13. Compute real recency/variance or relabel confidence (SV-1). 14. Diagnostic `strokes_impact` for composites + `requiresStanding=false` generators (tee-strat-1, lag3putt-3). 15. Input validation at write (putt=feet cap ~120; reject 390ft/564yd tails); `'other'`-lie fallback. 16. Ownership-check `insight-evidence.ts` (RP-1) + dedup v2/v3 par families (ASM-1) + unify rankers/apply impact to player feed (RANK-1/2).

### P2 — scale, observability, test debt
17. Standing cron: materialize cohort once/run; freshness ordering; orphan tombstone (PERF-2, SC1). 18. Wrap `auth.uid()`, merge policies, batch standing loads (PERF-3). 19. Wire `validateMetricRegistry` into CI; compare direction/unit/label not just ids (MR-1). 20. Close silent-regression test gaps (run() lifecycle, synthesis+dedup, H6 re-persist, cross-tenant RLS, pgTAP RPCs). 21. Interpolate `getExpectedStrokes` + 400yd handoff (DC-SG-1/3); charge penalty strokes to SG (SG-4); relabel SG "0" → "Field Average" (CF-3). 22. Validate `MIN_DELTA` thresholds against real multi-round data. 23. **Re-run §9 real-data reconciliation before enabling cohort-primary counterfactuals.**

---

*Severities are post-verification reconciled. 13 first-pass findings were downgraded on verify (e.g. am-1/am-2 high→low as deploy-state; ui-tone-1 high→medium; PERF-1 high→low), 1 upgraded (SC2). The two items that most constrain trust today — the undeployed backfill and the dead/stale composite cluster — are **deploy-state and data-population gaps, not source-logic defects**, which is the most actionable framing: a deploy + a bounded calibration list gets the engine to trustworthy, then a real-data gate gets it to validated.*
