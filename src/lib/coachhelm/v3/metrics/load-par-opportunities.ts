import 'server-only';

import { loadPlayerContext, type PlayerContextDeps } from '../context/load-player-context';
import type { AnalysisScope } from '../context/types';
import { computeParOpportunities } from './par-opportunities';
import type { MetricResult } from './types';

/**
 * Server-only composition root for the A7 Scoring surface (addendum §13
 * slice 2): `loadPlayerContext` (A1, pure DB read) feeds
 * `computeParOpportunities` (A3, pure metric core) directly, with no surface
 * concerns in between — mirrors `load-distance-profile.ts`'s (A2) shape
 * exactly.
 *
 * `computeParOpportunities`'s own scope contract (see its doc comment):
 * `facts` is self-scoped internally; `holes` is NOT (`HoleContext` carries
 * no date field) and must already be window/cutoff/completed-status
 * filtered by the caller. `loadPlayerContext` is that filter — it already
 * queries `golf_rounds` with `status = 'completed'` and
 * `window_start`/`window_end` bounding `round_date`, and excludes a hole
 * whose own `created_at` is after `scope.analysis_cutoff` — so the `holes`
 * array this passes through already satisfies that contract.
 *
 * Deliberately thin: if this file grows conditionals beyond composing the
 * two existing pure functions, that logic belongs in one of them instead.
 */
export async function loadParOpportunities(
  scope: AnalysisScope,
  deps: PlayerContextDeps,
): Promise<MetricResult[]> {
  const { shots, holes } = await loadPlayerContext(scope, deps);
  return computeParOpportunities(shots, holes, scope);
}
