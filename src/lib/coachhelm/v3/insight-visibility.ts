/**
 * Single source of truth for which `golf_coach_insights` rows are
 * product-visible. Shared by the delivery read paths
 * (`src/app/golf/actions/insight-delivery.ts`) and the causality
 * attribution cron (`/api/cron/v3/causality-attribute`) so the learning
 * loop can only ever train on rows a coach or player could actually see
 * (to-95 audit P1: attribution must not learn from archived, dismissed,
 * or stale v2 rows the product has decided not to surface).
 */

/**
 * Read-path engine filter (audit EC-1 / FID-1/FID-2). Surfaces must only
 * render the modern v3 system. Stale v2 rows (e.g. the `par_scoring_parN`
 * rows that mix a to-par player value against a raw-stroke team average →
 * an impossible 42-stroke `strokes_impact`) poison ranking and must never
 * reach a coach/player. Applied via PostgREST `.or()`: a row qualifies if
 * it was stamped `engine_version='v3'` OR carries a `v3:%` signature
 * (belt-and-suspenders for the handful of rows where one field lags the
 * other). Stale v2 rows match neither and are excluded in-DB.
 */
export const V3_ENGINE_FILTER = 'engine_version.eq.v3,signature.like.v3:%' as const;

/** Lifecycle states the UI is allowed to surface. `tentative` is pre-maturity
 *  and should never be shown to a player; `archived` rows are soft-deleted. */
export const VISIBLE_LIFECYCLE_STATES = ['detected', 'matured', 'addressed', 'resolved'] as const;

/**
 * Structural shape of the (only) three PostgREST filter-builder methods this
 * helper chains. The supabase builders are nominally typed per-table, but the
 * `.or()` / `.in()` / `.neq()` signatures are identical across every builder,
 * so we describe just the subset we need to invoke them safely inside.
 */
interface InsightVisibilityFilterable {
  or(filter: string): InsightVisibilityFilterable;
  in(column: string, values: readonly string[]): InsightVisibilityFilterable;
  neq(column: string, value: string): InsightVisibilityFilterable;
}

/**
 * The ONE product-visibility contract every `golf_coach_insights` reader
 * outside the canonical delivery layer must apply. Chains, in order:
 *
 *   1. `.or(V3_ENGINE_FILTER)`              — modern v3 engine only (no stale v2)
 *   2. `.in('lifecycle_state', VISIBLE…)`   — no `tentative`/`archived` rows
 *   3. `.neq('status', 'dismissed')`        — no coach-dismissed rows
 *
 * Status-only filtering (`status='active'`) is NOT a substitute: v3 stale-scope
 * retraction archives by `lifecycle_state` while leaving `status='active'`, so
 * a lifecycle filter is load-bearing. Routing every reader through this single
 * helper means a future change to the shared constants propagates everywhere.
 *
 * Generic over the builder type so it composes with any PostgREST filter
 * builder (typed table query, `.select()` result, count query) — call it
 * mid-chain and keep chaining: `applyInsightVisibility(q).eq('coach_id', id)`.
 *
 * The generic `Q` is passed straight through to the return type so the result
 * keeps every other builder method (`.eq`, `.order`, `.range`, `.gte`, …). We
 * deliberately do NOT constrain `Q` with `extends`: the fully-typed supabase
 * `PostgrestFilterBuilder` is so deeply recursive that an `extends` constraint
 * against it tripped TS2589 ("excessively deep"). Instead we invoke the three
 * methods through a narrow structural cast inside the body — the operators are
 * identical across every builder, so this is sound at runtime.
 */
export function applyInsightVisibility<Q>(query: Q): Q {
  return (query as InsightVisibilityFilterable)
    .or(V3_ENGINE_FILTER)
    .in('lifecycle_state', [...VISIBLE_LIFECYCLE_STATES])
    .neq('status', 'dismissed') as Q;
}
