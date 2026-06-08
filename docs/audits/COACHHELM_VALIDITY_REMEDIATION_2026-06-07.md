# CoachHelm Validity Audit + Remediation — 2026-06-07

Follow-up to the full stat-correctness pass (pagination + cache alignment + SG
penalties). After regenerating all CoachHelm artifacts on the corrected,
un-truncated data, a read-only **31-agent validity workflow** (one auditor per
generator/dimension + adversarial verification of every flagged issue)
recomputed each insight's numbers from raw tables, judged root-cause validity,
and checked impact/ranking. Result: **16 confirmed issues, 3 partial, 1
refuted**. The numbers themselves were largely correct (putt_distance,
par_scoring, scrambling, tee_strategy all matched ground truth to the tenth);
the real defects were in **impact ranking, a read-path leak, and stale rows the
regen does not clean**.

## Fixed (code)

| # | Finding | Fix |
|---|---------|-----|
| 1 | **Read-path leak** — `loadEvidenceBackedInsights` (insights.ts) had no engine_version/status scope, so 31 stale **v2** rows (impossible strokes_impact up to ~42/rd) leaked into the player feed and, even after the score.ts ceiling clamp, ranked **#1–#3** above every correct v3 insight. | Added `.or('engine_version.eq.v3,signature.like.v3:%')` — the same scope every `insight-delivery.ts` fetcher already uses. |
| 2 | **par_scoring phantom impact** — composeContent seeded `strokes_impact` with a gap-to-**par** diagnostic (1.0–1.5). When the counterfactual is suppressed (player at/better than cohort) the base keeps that seed → a non-weakness floats to the top (**17/42 active rows across 9 players**). | par-type.ts now seeds `strokes_impact: 0`; the base backfills the real (capped) gap-to-**cohort** value only when there's genuine leverage. Removed the dead `cappedDiagnosticStrokes`. |
| 3 | **putt_bias metric mis-stamp** — `evidence.metric` came from the constructor arg while title/value/signature came from the data-derived weakest direction → **7/7 rows** stamped the wrong metric. | Stamp from the computed weakest direction; both orchestrator instances now emit an identical correct row (dedup harmless). |

`typecheck` clean; **2290 coachhelm/insights/actions tests pass** (ParType +
PuttBias contract tests updated to the new seed-0 / computed-metric contract).

## Fixed (data / prod)

| Finding | Fix |
|---------|-----|
| **putt_distance StandingBar stale** — `golf_player_standing` was last computed before the cache correction, so the EvidencePanel StandingBar (e.g. Nick 3-5 ft 60.5%) contradicted the insight headline (46.5%). | Refreshed standing (all teams) → re-regenerated so insights embed the fresh snapshot. Nick 3-5 ft standing now 46.5%. |
| **penalty rate ~23% low** — `refresh_player_stats_cache` wrote `golf_round_stats_cache.penalty_strokes = COALESCE(r.total_penalties, SUM(h.penalty_strokes))`, trusting a **drifted** round column (Nick 9) over the canonical per-hole sum (11 = is_penalty = engine). | Migration `20260608140000`: derive from `SUM(golf_holes.penalty_strokes)`. Recomputed all players; the trigger cascades to `penalty_strokes_per_round`. Nick course_management penalty now 0.76 (was 0.6). |
| **pressure_gap (Nick)** — a stale row claimed "−0.3 strokes (better under pressure)" / "10 practice rounds"; true delta is **+3.4 worse**, and he has only 2 practice rounds. The generator correctly gates (<3 practice) so it no longer emits, but the pre-fix row stayed `active`/`detected`. | Archived (preserves the row + coach history; hidden from the feed). The generator math is correct; the row was a pre-fix artifact the regen doesn't clean. |
| **composite stale (Larsen short_side_scrambling_chain)** — visible `detected` row no longer emitted on corrected data. | Archived. The other flagged composites (Taylor doubles_after_bogey @3.5, 6× short_approach_proximity_gap) were **already** `lifecycle_state='archived'` (hidden) — no action needed. |

## Refuted

- **approach_miss (Grace/Lily) "stale"** — false positive. The audit recomputed
  over *all* rounds; the generator correctly applies a **90-day window**. Lily's
  oldest round (2026-03-09) is one day outside the window, so 55 attempts (not
  64) is correct.

## Deferred (design decision, low harm)

- **putt_bias / warmup_hole `strokes_impact` hard-pinned 0** (`requiresStanding=false`
  diagnostics with no counterfactual). These **under-rank** a genuine weakness
  (bury, not falsely surface), so they mislead less than #1–#2 did. Giving them a
  principled impact estimate needs a counterfactual/standing source — a product
  decision, tracked separately.

## Systemic note

The regen (`scripts/regen-coachhelm-from-corrected-stats.ts`) refreshes every
signature its generators **emit**, but does **not** archive active rows the
current data no longer supports (pressure_gap Nick, the composites). Consider
adding a post-regen sweep that archives non-coach-touched `detected` rows not
touched by the latest run.

## Verification method

Every confirmed number was recomputed directly from `golf_shots`/`golf_holes`/
`golf_rounds` (SQL has no PostgREST 1000-row cap) against the engine's round set
(`completed AND total_score IS NOT NULL`) and matched value-for-value for two
players (Nick Rini 1092 shots, Grace Saunders women's) before each fix.
