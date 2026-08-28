import { AlertTriangle } from 'lucide-react';
import { INCIDENT_SOURCE_LABEL, SOURCE_HEALTH_LABEL } from '@/lib/admin/incidents/types';
import type { CoverageSummary } from '@/lib/admin/incidents/sources';

/**
 * The Bridge's blindness beacon.
 *
 * WHY THIS EXISTS. `describeBlindness()` (`src/lib/admin/incidents/sources.ts`)
 * exists because "no incidents found" under an unreadable Sentry is the single
 * most damaging empty state a monitoring surface can show — it converts a
 * broken read into a green screen. This component is the other half of that
 * rule: NO ALL-CLEAR MAY RENDER ANYWHERE ON A PAGE WHILE A REQUIRED SOURCE IS
 * BLIND. It is not this component's job to enforce that (the caller decides
 * what else is on the page); its job is to make the blindness itself
 * impossible to miss when it is true, and to say NOTHING at all when it
 * is not.
 *
 * Returns `null` when `note` is `null` — deliberately not an "all sources
 * healthy" bar. Silence IS the healthy state here. A beacon that always
 * renders something (even a green "all clear") would itself become the kind
 * of confident wrong answer this whole read model exists to stop; see
 * `canClaimAllClear()` in `sources.ts` for the same reasoning applied to the
 * page-level all-clear.
 */
export function BlindnessBeacon({
  note,
  coverage,
}: {
  /** `describeBlindness()`'s output — null means nothing is blind. */
  note: string | null;
  coverage: CoverageSummary;
}) {
  if (note === null) return null;

  const blindCount = coverage.blindSources.length;

  return (
    <div role="alert" className="w-full rounded-xl border border-fw-warning-ring bg-fw-warning-bg px-3 py-2.5">
      <div className="flex items-start gap-2">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-fw-warning-ink" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="break-words text-caption font-medium leading-5 text-warm-800 [overflow-wrap:anywhere]">{note}</p>
          {blindCount > 0 ? (
            // A native <details>/<summary> — no client React state, the
            // browser owns open/closed and the summary is a real, natively
            // focusable and keyboard-activatable control (Enter/Space),
            // same pattern as `KpiSourceNote.tsx` and `PostureDisclosure.tsx`.
            <details className="group mt-1.5">
              <summary
                className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded px-0.5 text-caption font-medium text-fw-warning-ink underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 [&::-webkit-details-marker]:hidden"
              >
                {blindCount} source{blindCount === 1 ? '' : 's'} blind — details
              </summary>
              <ul className="mt-1.5 space-y-1 border-t border-fw-warning-ring/60 pt-1.5">
                {coverage.blindSources.map((source) => (
                  <li key={source} className="flex items-center gap-2 text-caption text-warm-700">
                    <span className="font-fw-mono font-semibold">{INCIDENT_SOURCE_LABEL[source]}</span>
                    <span className="text-warm-500">{SOURCE_HEALTH_LABEL.blind}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}
