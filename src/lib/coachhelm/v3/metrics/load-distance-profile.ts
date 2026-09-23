import 'server-only';

import { loadPlayerContext, type PlayerContextDeps } from '../context/load-player-context';
import type { AnalysisScope } from '../context/types';
import { computeDistanceProfile } from './distance-profile';
import type { MetricResult } from './types';

/**
 * Server-only composition root for the A7 distance-profile surface (addendum
 * §13 slice 1): `loadPlayerContext` (A1, pure DB read) feeds
 * `computeDistanceProfile` (A2, pure metric core) directly, with no surface
 * concerns in between. Callers (a page loader or route handler) turn the
 * `MetricResult[]` into a view model — this module never does that itself,
 * so it stays reusable for any future distance-profile surface.
 *
 * Deliberately thin: if this file grows conditionals beyond composing the
 * two existing pure functions, that logic belongs in one of them instead.
 */
export async function loadDistanceProfile(
  scope: AnalysisScope,
  deps: PlayerContextDeps,
): Promise<MetricResult[]> {
  const { shots, holes } = await loadPlayerContext(scope, deps);
  return computeDistanceProfile(shots, scope, holes);
}
