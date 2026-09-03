/**
 * Trace -> incident correlation for `/admin/traces` (Bridge Premium Phase 3).
 *
 * The Flight Recorder already carries real per-step timings — the
 * containment tree in `trace-tree.ts` IS the Execution Waterfall's data;
 * nothing needed rebuilding there. What is genuinely missing is the "Phase 0
 * title for the incident it belongs to" the Phase 3 dispatch asks for, and
 * nothing in this repo currently links a `FlightTraceRun` to a
 * `UnifiedIncident`.
 *
 * WHY THIS IS DELIBERATELY CONSERVATIVE. `UnifiedIncident` carries no round
 * id, and `FlightTraceRun.failure_step` (a workflow STEP KEY, e.g.
 * `'server_action'`) is not the same vocabulary as `UnifiedIncident.errorCode`
 * (a provider error code). Guessing a link from a workflow name or a time
 * window ALONE is exactly the "similar message strings, same time" merge the
 * brief forbids for incident correlation (§8), and a wrong link here is
 * worse than none — it puts a stranger's human title on this trace.
 *
 * The one STRUCTURALLY SOUND signal available is `IncidentSourceEvidence.ref`
 * — a deep-link reference some sources attach — compared against
 * `FlightTraceRun.round_id`. When a source's `ref` is literally the same
 * round id the trace ran against, that is not a guess. Everything else stays
 * unlinked rather than reaching for a weaker heuristic. If `ref` never
 * carries a round id in production, this correlator will honestly report "no
 * linked incident" for every trace — a real, visible gap to close with a
 * dedicated round-id column, not something to paper over with a fuzzier
 * match here.
 */

import { cachedIncidentBoard } from '@/lib/admin/incidents/fetch';
import { DEFAULT_INCIDENT_WINDOW_HOURS } from '@/lib/admin/data/incident-feed';
import type { UnifiedIncident } from '@/lib/admin/incidents/types';
import type { FlightTraceRun } from '@/app/admin/actions/golf-tracer';

export interface TraceIncidentLink {
  incidentId: string;
  /** The Phase 0 human title — never the raw technical signature. */
  title: string;
  /** In-Bridge detail route, or null when the only home is an external tool. */
  href: string | null;
  severity: UnifiedIncident['severity'];
}

/** Pure. `incidents` is whatever window the caller already fetched. */
export function correlateTraceToIncident(
  trace: Pick<FlightTraceRun, 'round_id'>,
  incidents: readonly UnifiedIncident[],
): TraceIncidentLink | null {
  if (!trace.round_id) return null;

  const match = incidents.find((incident) => incident.sources.some((s) => s.ref === trace.round_id));
  if (!match) return null;

  return {
    incidentId: match.id,
    title: match.title,
    href: match.linkTarget,
    severity: match.severity,
  };
}

/** One link per trace, keyed by `trace_id` — the shape a client component can
 *  receive without carrying full `UnifiedIncident` objects to the browser. */
export function correlateTracesToIncidents(
  traces: readonly Pick<FlightTraceRun, 'trace_id' | 'round_id'>[],
  incidents: readonly UnifiedIncident[],
): Readonly<Record<string, TraceIncidentLink | null>> {
  const links: Record<string, TraceIncidentLink | null> = {};
  for (const trace of traces) {
    links[trace.trace_id] = correlateTraceToIncident(trace, incidents);
  }
  return links;
}

/** I/O + pure derivation, composed — reads the same incident window every
 *  other Bridge surface does, memoised per request via `cachedIncidentBoard`. */
export async function fetchTraceIncidentLinks(
  traces: readonly Pick<FlightTraceRun, 'trace_id' | 'round_id'>[],
): Promise<Readonly<Record<string, TraceIncidentLink | null>>> {
  const board = await cachedIncidentBoard(DEFAULT_INCIDENT_WINDOW_HOURS);
  return correlateTracesToIncidents(traces, board.incidents);
}
