import 'server-only';

import { loadPlayerContext, type PlayerContextDeps } from '../context/load-player-context';
import type { AnalysisScope } from '../context/types';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { computeSequenceAttribution } from './sequence-attribution';
import type { MetricResult } from './types';

/**
 * Server-only composition root for the A4 slice 3b Round Review mount:
 * `loadPlayerContext` (A1, pure DB read — already chunks id lists at 200
 * via `chunkIds`/`ID_CHUNK_SIZE` and paginates every read past PostgREST's
 * 1000-row response cap via `fetchAllRows`) feeds `computeSequenceAttribution`
 * (A4 slice 2) directly. Mirrors `load-par-opportunities.ts`'s (A7) shape —
 * with one deliberate difference: that loader lets a read error propagate
 * (its own page-level caller decides what "failed" means); THIS loader
 * returns `null` on any read error instead of throwing, and never `[]`.
 * `[]` here would be indistinguishable from "computed, zero rows" (a real,
 * renderable state — e.g. a round with only `sequence_hole_coverage` at
 * `status: 'invalid'`), whereas `null` is the ONLY signal the Round Review
 * mount can use to hide the section outright on a genuine read failure
 * (`page.tsx`'s pattern for every other addendum on this page is
 * failure-silent — never surface a raw fetch error to a player/coach).
 *
 * `computeSequenceAttribution`'s own scope contract (see its doc comment):
 * `facts` is self-scoped internally; `holes` is NOT (`HoleContext` carries
 * no date field) and must already be window/cutoff/completed-status
 * filtered by the caller. `loadPlayerContext` is that filter.
 */
export async function loadSequenceAttribution(
  scope: AnalysisScope,
  deps: PlayerContextDeps,
): Promise<MetricResult[] | null> {
  try {
    const { shots, holes } = await loadPlayerContext(scope, deps);
    return computeSequenceAttribution(shots, holes, scope);
  } catch (err) {
    void logServerError(
      `[loadSequenceAttribution] read failed for ${scope.player_id}: ${describeError(err)}`,
      { action: 'metrics.loadSequenceAttribution', featureArea: 'coachhelm' },
      'warning',
    );
    return null;
  }
}
