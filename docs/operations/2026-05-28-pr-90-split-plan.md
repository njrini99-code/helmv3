# PR #90 split plan (round review viz + CoachHelm bug sweep)

**Source:** `hole-shot-path` → `main` (now rebased; HEAD `c1b6cd64`)
**Size:** 33 files, +3009/-46
**Status:** Rebased onto current main. Ready for split execution or single-PR review.

The PR bundles **two unrelated workstreams**. Recommend splitting before merge so reviewers can focus on each.

---

## Strand 1 — Round-review viz (the "new feature" half)

Net-new SVG visualizations. Self-contained under `src/components/golf/coachhelm/{round-review,v3/HoleShotPath,v3/PuttHeatmap}/` plus one page modification.

### Files

| File | Type | Purpose |
|---|---|---|
| `src/components/golf/coachhelm/v3/HoleShotPath/index.tsx` | NEW | Main component — reconstructs every shot on a hole from `golf_shots` |
| `src/components/golf/coachhelm/v3/HoleShotPath/geometry.ts` | NEW | Pure geometry from `lie_after` + `distance_to_hole_after` + `miss_direction` |
| `src/components/golf/coachhelm/v3/HoleShotPath/hazards.tsx` | NEW | Hazard rendering at endpoint where ball ended up |
| `src/components/golf/coachhelm/v3/HoleShotPath/turf.tsx` | NEW | Turf-type backgrounds |
| `src/components/golf/coachhelm/v3/HoleShotPath/types.ts` | NEW | Type definitions |
| `src/components/golf/coachhelm/v3/HoleShotPath/HoleShotPath.test.ts` | NEW | Unit tests |
| `src/components/golf/coachhelm/v3/PuttHeatmap/index.tsx` | NEW | Putt heatmap surface |
| `src/components/golf/coachhelm/v3/PuttHeatmap/geometry.ts` | NEW | Pure geometry for putt clustering |
| `src/components/golf/coachhelm/v3/PuttHeatmap/types.ts` | NEW | Types |
| `src/components/golf/coachhelm/v3/PuttHeatmap/PuttHeatmap.test.ts` | NEW | Unit tests |
| `src/components/golf/coachhelm/round-review/HoleByHoleShotPaths.tsx` | NEW | Round-review orchestrator for the hole-by-hole view |
| `src/components/golf/coachhelm/round-review/RoundStripGrid.tsx` | NEW | At-a-glance 18-hole strip |
| `src/app/golf/(dashboard)/dashboard/rounds/[id]/review/page.tsx` | MODIFIED | Renders the new components |

**Count:** 13 files, all net-new code with tests.

**Recommendation:** Open as `feat/round-review-viz` → small focused PR.

---

## Strand 2 — CoachHelm bug sweep

Modifications across pages + libs + a migration. Each modification fixes a specific behavior.

### Files

| File | Type | Likely purpose |
|---|---|---|
| `supabase/migrations/20260526070000_widen_insight_type_check_for_v3_generators.sql` | NEW | Widens the `insight_type` CHECK to accept new v3 generator types |
| `src/app/golf/(dashboard)/dashboard/alerts/page.tsx` | NEW (per status `A`) | Coach alerts page |
| `src/app/golf/(dashboard)/dashboard/coachhelm/chat/page.tsx` | MODIFIED | Chat page touch |
| `src/app/golf/(dashboard)/dashboard/insights/page.tsx` | MODIFIED | Insights page touch |
| `src/app/golf/(dashboard)/dashboard/intelligence/page.tsx` | MODIFIED | Intelligence page touch |
| `src/app/golf/(dashboard)/dashboard/patterns/page.tsx` | MODIFIED | Patterns page touch |
| `src/app/golf/(dashboard)/dashboard/settings/page.tsx` | MODIFIED | Settings touch |
| `src/app/golf/(dashboard)/dashboard/stats/stats-client.tsx` | MODIFIED | Stats client touch |
| `src/app/golf/actions/coachhelm-data.ts` | MODIFIED | Server action touch |
| `src/app/actions/notification-preferences.ts` | MODIFIED | Notification prefs action |
| `src/components/golf/layout/FeatureUnavailable.tsx` | NEW | Empty-state component |
| `src/components/golf/stats/GolfStatsDisplay.tsx` | MODIFIED | Stats display |
| `src/components/golf/stats/sections/PuttingStats.tsx` | MODIFIED | Putting stats section |
| `src/lib/admin-logger-client.ts` | MODIFIED | Admin logger |
| `src/lib/server-error-logger.ts` | MODIFIED | Server error logger |
| `src/lib/coachhelm/v2/insights/upsert.ts` | MODIFIED | v2 upsert |
| `src/lib/coachhelm/v3/composite/loader.ts` | MODIFIED | **Overlap with PR #120 — composite null guard.** May conflict or duplicate. Check before merging. |
| `src/lib/coachhelm/v3/llm/compose.ts` | MODIFIED | LLM compose |
| `src/lib/notifications/email.ts` | MODIFIED | Email notifications |
| `src/lib/notifications/types.ts` | MODIFIED | Notification types |

**Count:** 20 files, mix of bug fixes + small features (alerts page + FeatureUnavailable component).

**Recommendation:** Open as `fix/coachhelm-bug-sweep-2026-05-26` → focused PR after Strand 1 lands.

### Conflicts to verify before split

- `src/lib/coachhelm/v3/composite/loader.ts` — already touched in PR #120 (the helm-review split). If PR #90's edits to this file are the same null guard, drop them in the split; if they're different, surface the diff for human review.

---

## Suggested execution order

1. **Land Strand 1** (`feat/round-review-viz`) first — net-new code, no risk to existing surfaces, easy to review.
2. **Land PR #120 first** (helm-review app fixes) — already open from this session — so the composite null guard is in main before Strand 2.
3. **Land Strand 2** (`fix/coachhelm-bug-sweep-2026-05-26`) — after #120 lands, the loader.ts conflict is resolved.

---

## Or: merge as-is

If you'd rather skip the split work and accept the bundle, PR #90 is now rebased and MERGEABLE. Tradeoff: harder review, but it's all your code and the rebase was clean.

The branch is at `hole-shot-path` HEAD `c1b6cd64`.
