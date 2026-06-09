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
