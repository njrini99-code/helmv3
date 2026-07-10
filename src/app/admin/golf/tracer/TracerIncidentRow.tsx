import { ChevronDown } from 'lucide-react';
import { StatusPill } from '@/components/fairway';
import type { TracerIncident } from '@/app/golf/actions/admin-tracer-data';
import { TRACER_SEVERITY_TONE } from './tracer-shared';

/**
 * One tracer incident, collapsed to severity/title/occurrences/lastSeen —
 * expand-on-click (native `<details>`, no client JS needed) reveals the
 * remediation narrative (`summary`/`whyItHappened`/`howToFix`/
 * `operatorImpact`) the backend already computes but the list previously
 * dropped on the floor. Presentational only — safe to render from a Server
 * Component (the main incidents list) or from inside a Client Component
 * (the round-scoped diagnostic view); no hooks, no 'use client' needed.
 */
export function TracerIncidentRow({ incident }: { incident: TracerIncident }) {
  return (
    <li>
      <details className="group py-2">
        <summary
          className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 text-sm [&::-webkit-details-marker]:hidden"
        >
          <StatusPill tone={TRACER_SEVERITY_TONE[incident.severity]} dot size="sm">
            {incident.severity}
          </StatusPill>
          <span className="min-w-0 flex-1 basis-full truncate text-warm-900 sm:basis-auto">
            {incident.title}
          </span>
          <span className="font-fw-mono text-xs tabular-nums text-warm-600">
            {incident.occurrences} occurrence{incident.occurrences === 1 ? '' : 's'}
          </span>
          <span className="font-fw-mono text-xs tabular-nums text-warm-500">
            {new Date(incident.lastSeen).toLocaleDateString()}
          </span>
          <ChevronDown
            size={14}
            className="shrink-0 text-warm-400 transition-transform duration-150 group-open:rotate-180"
            aria-hidden
          />
        </summary>
        <div className="mt-2 space-y-1.5 rounded-lg bg-surface-sunken p-3 text-xs leading-5 text-warm-700">
          <p><span className="font-semibold text-warm-900">What happened — </span>{incident.summary}</p>
          <p><span className="font-semibold text-warm-900">Why — </span>{incident.whyItHappened}</p>
          <p><span className="font-semibold text-warm-900">How to fix — </span>{incident.howToFix}</p>
          <p><span className="font-semibold text-warm-900">Operator impact — </span>{incident.operatorImpact}</p>
        </div>
      </details>
    </li>
  );
}
