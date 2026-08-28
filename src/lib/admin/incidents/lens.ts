/**
 * Which lens an incident belongs to.
 *
 * FILTERS OVER ONE MODEL, never separate datasets — which is the whole point.
 * The Reliability tab stopped being a competing incident list the moment its
 * rows became a lens over these same incidents, and the only way that stays
 * true is if every lens is a predicate over `UnifiedIncident` rather than its
 * own query.
 *
 * Split out of `fetch.ts` so it is PURE and directly unit-testable: that
 * module is `server-only` and pulls in the Supabase admin client, GitHub and
 * Vercel readers, so a test of "does the awaiting-proof lens include a merged
 * incident" would have had to stand all of that up first. The counting rules
 * are the part most likely to drift from what a screen shows, so they are the
 * part that most needs a test with no I/O in it.
 */

import type { IncidentLens, IncidentLensCounts, UnifiedIncident } from './types';
import { INCIDENT_LENSES } from './types';

export function matchesLens(incident: UnifiedIncident, lens: IncidentLens): boolean {
  switch (lens) {
    case 'actionable':
      return (
        incident.actionable &&
        incident.lifecycle.state !== 'resolved' &&
        incident.lifecycle.state !== 'not-a-defect'
      );
    case 'reliability':
      // Corroborated, OR witnessed by a non-app observer. The second clause
      // matters: a Supabase-only permission fault is exactly the signal the
      // Reliability tab exists for, and it has only one source.
      return (
        incident.corroboration >= 2 ||
        incident.sources.some(
          (s) => s.source !== 'app' && s.health !== 'blind' && s.health !== 'unknown',
        )
      );
    case 'repairable':
      return incident.lifecycle.state === 'repairable';
    case 'needs-evidence':
      return incident.lifecycle.state === 'needs-evidence';
    case 'regressions':
      return incident.lifecycle.state === 'regressed';
    case 'awaiting-proof':
      return (
        incident.lifecycle.state === 'awaiting-proof' ||
        incident.lifecycle.state === 'awaiting-deploy' ||
        incident.lifecycle.state === 'merged' ||
        incident.proofGaps.length > 0
      );
    case 'all':
      return true;
  }
}

export function applyLens(
  incidents: readonly UnifiedIncident[],
  lens: IncidentLens,
): UnifiedIncident[] {
  return incidents.filter((incident) => matchesLens(incident, lens));
}

export function countLenses(incidents: readonly UnifiedIncident[]): IncidentLensCounts {
  const counts = {} as IncidentLensCounts;
  for (const lens of INCIDENT_LENSES) {
    counts[lens] = incidents.filter((incident) => matchesLens(incident, lens)).length;
  }
  return counts;
}

