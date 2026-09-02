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

import type { IncidentClass } from '@/lib/admin/incident-classification';
import { INCIDENT_CLASS_ORDER } from '@/lib/admin/incident-classification';

import type { IncidentLens, IncidentLensCounts, UnifiedIncident } from './types';
import { INCIDENT_LENSES } from './types';
import { deriveIncidentFlow } from '@/lib/admin/selfheal-flow';

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
    case 'stalled':
      // Judged against the board's OWN clock (`computedAt`), not an ambient
      // `Date.now()`: a lens predicate has to give one answer wherever it
      // runs, and the incident already carries the instant it was computed
      // at. `deriveIncidentFlow` places a failed read off the loop, so an
      // incident nobody could read can never land in this lens.
      return deriveIncidentFlow(incident, Date.parse(incident.computedAt)).stalled;
    case 'awaiting-proof':
      // A `source-blind` gap is not a fix awaiting proof — it is a read that
      // failed. Admitting it here let an unreadable Sentry inflate "a fix
      // exists, the evidence does not" with incidents that have no fix at
      // all, and the proof-debt overflow link then pointed at a lens whose
      // count did not match the panel's. Every other gap kind does describe
      // work that looks solved.
      return (
        incident.lifecycle.state === 'awaiting-proof' ||
        incident.lifecycle.state === 'awaiting-deploy' ||
        incident.lifecycle.state === 'merged' ||
        incident.proofGaps.some((gap) => gap.kind !== 'source-blind')
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


// ---------------------------------------------------------------------------
// The class facet
// ---------------------------------------------------------------------------

/**
 * The `?kind=` facet, applied to the SAME list the lens rail filters.
 *
 * Lens and kind are orthogonal facets over one model — lens slices by
 * lifecycle and attention, kind slices by what the classifier decided the
 * incident IS — so both narrow the canonical queue and neither forks it into a
 * second list.
 *
 * This exists because for a while it did not. The Errors page still parsed
 * `?kind=`, still rendered the chips, and still offered "Show everything" in
 * the suppressed notice, but nothing downstream consulted the value: the
 * canonical queue is built from `IncidentFeedFilters`, which has no `kind`
 * field. Every one of those controls was inert, and the notice's "N held back"
 * described a list the operator was no longer looking at. A control that does
 * nothing is worse than a missing one — it teaches the operator that the queue
 * is curated when it is not.
 *
 * `undefined` means "the default view": actionable classes only, which is what
 * the notice's count is measured against. `'all'` means no class filtering.
 */
export function matchesKind(incident: UnifiedIncident, kind: string | undefined): boolean {
  if (kind === 'all') return true;
  if (kind === undefined) return incident.actionable;
  return incident.klass === kind;
}

export function applyIncidentFacets(
  incidents: readonly UnifiedIncident[],
  lens: IncidentLens,
  kind: string | undefined,
): UnifiedIncident[] {
  return incidents.filter(
    (incident) => matchesLens(incident, lens) && matchesKind(incident, kind),
  );
}

/**
 * Lens counts measured over the list the `?kind=` facet leaves behind — the
 * numbers the rail must show while that facet is active.
 *
 * `countLenses` over the unfaceted board is right for a board-level fact and
 * wrong for a rail sitting above a faceted list: it told an operator
 * "Regressions 4" while the list under `?kind=telemetry` showed one. The
 * feature doc's rule is that a count beside a filter is measured over the
 * list that filter actually narrows, and `applyIncidentFacets` is what
 * narrows it — so this counts through the same predicate, by construction.
 */
export function countLensesForKind(
  incidents: readonly UnifiedIncident[],
  kind: string | undefined,
): IncidentLensCounts {
  return countLenses(incidents.filter((incident) => matchesKind(incident, kind)));
}

/**
 * What the default view is holding back, counted over the CANONICAL list and
 * broken down by class. Ordered by `INCIDENT_CLASS_ORDER` so the chips do not
 * reshuffle between renders.
 */
export function suppressedByClass(
  incidents: readonly UnifiedIncident[],
): Array<{ klass: IncidentClass; count: number }> {
  const held = incidents.filter((incident) => !incident.actionable);
  return INCIDENT_CLASS_ORDER.map((klass) => ({
    klass,
    count: held.filter((incident) => incident.klass === klass).length,
  })).filter((entry) => entry.count > 0);
}
