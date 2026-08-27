import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { bridgeListFlightTraces, type FlightTraceRun } from '@/app/admin/actions/golf-tracer';
import { InlineNotice } from '@/components/fairway';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelPageSkeleton } from '../_components/PanelSkeletons';
import { PanelNoData } from '../_components/PanelStates';
import { AutoRefresh } from '../_components/AutoRefresh';
import { TracesClient } from './TracesClient';

export const dynamic = 'force-dynamic';

/**
 * Helm Bridge — Flight Recorder.
 *
 * This is the "Visual Trace Explorer" from
 * `docs/superpowers/plans/2026-08-25-golf-flight-recorder.md`: one golf round
 * mutation, rendered as the containment tree it actually is — client → server
 * action → RPC → in-transaction checkpoints → verification → background work —
 * with steps that never ran shown explicitly rather than absent.
 *
 * WHY ITS OWN TAB RATHER THAN A PANEL IN /admin/golf/tracer
 * ---------------------------------------------------------
 * The Golf Tracer answers "which rounds are stuck and what incidents fired" —
 * a per-round operational triage view over `admin_events`. This answers "walk
 * me through one execution and show me where it diverged". They share a data
 * source and nothing else; the trace explorer was living as a panel three
 * screens into a page built for the other question, which is why it was easy to
 * believe it had never been built at all.
 */
async function loadTraces(): Promise<{ traces: FlightTraceRun[]; unavailable: string | null }> {
  try {
    return { traces: await bridgeListFlightTraces(), unavailable: null };
  } catch (error) {
    // "Store unreachable" and "no traces yet" are opposite facts that render
    // identically as an empty list. Never let the first read as the second.
    return {
      traces: [],
      unavailable: error instanceof Error ? error.message : 'Trace store unreachable.',
    };
  }
}

async function TracesPanel() {
  const { traces, unavailable } = await loadTraces();

  if (unavailable) {
    return <InlineNotice tone="danger">{unavailable}</InlineNotice>;
  }

  if (traces.length === 0) {
    return (
      <PanelNoData
        label="No traces recorded yet"
        description="The flight recorder is armed per-request and gated by HELM_FLIGHT_RECORDER_ENABLED. With that unset in an environment, golf round mutations run normally and record nothing — so an empty list here means tracing is off, not that nothing has happened."
      />
    );
  }

  return <TracesClient traces={traces} />;
}

export default async function TracesPage() {
  await requireSuperAdmin();

  return (
    <div className="space-y-5">
      <AutoRefresh intervalMs={60_000} />
      <div>
        <h1 className="text-lg font-semibold text-warm-900">Flight Recorder</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-warm-600">
          One golf round mutation, traced end to end — and the steps that never
          ran, shown rather than omitted.
        </p>
      </div>
      <PanelBoundary title="Flight Recorder" skeleton={<PanelPageSkeleton />}>
        <TracesPanel />
      </PanelBoundary>
    </div>
  );
}
