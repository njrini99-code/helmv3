'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Surface, StatusPill, Badge } from '@/components/fairway';
import { cn } from '@/lib/utils';
import {
  bridgeGetFlightTrace,
  type FlightTraceDetail,
  type FlightTraceRun,
} from '@/app/admin/actions/golf-tracer';
import { PanelNoData, PanelStale } from '../../_components/PanelStates';
import { LocalTime } from '../../_components/LocalTime';
import { CopyReportButton } from '../../_components/CopyReportButton';
import {
  buildFlightWaterfall,
  flightStepStatusTone,
  isPlausibleTraceId,
  FLIGHT_REQUIREDNESS_LABEL,
  type FlightWaterfallSegment,
} from './tracer-shared';

/** One step segment — a status-colored chip carrying its requiredness badge,
 *  elapsed time (only when the row's own timestamps allow computing one),
 *  and — for a failed step — its error inline with a copy control. A ghost
 *  segment (a required step the trace never recorded) gets a dashed border
 *  so the gap reads as a gap, not as a step that merely looks quiet. */
function FlightStepSegment({ segment }: { segment: FlightWaterfallSegment }) {
  const tone = flightStepStatusTone(segment.status);
  const hasError = segment.status === 'failure' && (segment.errorCode || segment.errorSummary);
  return (
    <div
      className={cn(
        'flex w-40 shrink-0 flex-col gap-1.5 rounded-lg border px-2.5 py-2 text-xs',
        segment.isGhost
          ? 'border-dashed border-fw-danger/40 bg-fw-danger-bg/30'
          : 'border-border-subtle bg-surface',
      )}
    >
      <div className="flex items-center justify-between gap-1.5">
        <StatusPill tone={tone} size="sm" dot>
          {segment.isGhost ? 'not run' : segment.status}
        </StatusPill>
      </div>
      <p className="truncate font-fw-mono text-caption font-medium text-warm-900" title={segment.key}>
        {segment.key}
      </p>
      <Badge tone="neutral" variant="outline" size="sm" className="w-fit">
        {FLIGHT_REQUIREDNESS_LABEL[segment.requiredness]}
      </Badge>
      {segment.elapsedMs !== null && (
        <p className="font-fw-mono text-caption tabular-nums text-warm-500">{segment.elapsedMs.toLocaleString()} ms</p>
      )}
      {segment.isGhost && (
        <p className="text-caption leading-4 text-fw-danger-ink">
          Required step never ran — likely after a prior failure.
        </p>
      )}
      {hasError && (
        <div className="flex items-start gap-1.5 rounded-md bg-fw-danger-bg/70 px-2 py-1.5">
          <p className="min-w-0 flex-1 break-words text-caption leading-4 text-fw-danger-ink">
            {segment.errorCode && <span className="font-fw-mono font-semibold">{segment.errorCode}</span>}
            {segment.errorCode && segment.errorSummary ? ' — ' : ''}
            {segment.errorSummary}
          </p>
          <CopyReportButton
            variant="icon"
            size="sm"
            report={[segment.errorCode, segment.errorSummary].filter(Boolean).join(' — ') || segment.key}
            aria-label={`Copy error for step ${segment.key}`}
          />
        </div>
      )}
    </div>
  );
}

/** Steps grouped into horizontal layer lanes — hand-rolled divs, no chart
 *  library. Shares one overflow-x-auto container across all lanes so the
 *  scrollbar spans the widest lane; on phone each lane's layer label stacks
 *  above its step row instead of sitting beside it. */
function FlightWaterfall({ workflow, steps }: { workflow: string; steps: Array<Record<string, unknown>> }) {
  const lanes = buildFlightWaterfall(workflow, steps);
  if (lanes.length === 0) {
    return <p className="mt-3 text-xs text-warm-600">No steps recorded for this trace.</p>;
  }
  return (
    <div className="mt-3 overflow-x-auto" aria-label={`Step waterfall for ${workflow}`}>
      <div className="space-y-3 pb-1">
        {lanes.map((lane) => (
          <div key={lane.layer} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
            <p className="shrink-0 font-fw-mono text-caption font-semibold uppercase tracking-wide text-warm-500 sm:w-28 sm:pt-2">
              {lane.layer.replace(/_/g, ' ')}
            </p>
            <div className="flex flex-nowrap gap-2">
              {lane.segments.map((segment) => (
                <FlightStepSegment key={segment.key} segment={segment} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FlightTraceExplorer({
  traces,
  unavailableReason = null,
  initialTraceId = null,
}: {
  traces: FlightTraceRun[];
  /** Non-null when the list fetch itself failed (see `loadFlightTraces` in
   *  page.tsx) — distinct from a genuinely empty, reachable trace store. */
  unavailableReason?: string | null;
  /** From `?trace=<uuid>` — the deep-link target error pages point at.
   *  Preselects and loads this trace once, on mount. */
  initialTraceId?: string | null;
}) {
  const [selected, setSelected] = useState<FlightTraceDetail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inspect = useCallback(async (traceId: string) => {
    setLoadingId(traceId);
    setSelectedId(traceId);
    setError(null);
    try {
      const detail = await bridgeGetFlightTrace(traceId);
      if (!detail) {
        setSelected(null);
        setError(`Trace ${traceId} was not found — it may have aged out, or the id in this link is wrong.`);
        return;
      }
      setSelected(detail);
    } catch {
      setSelected(null);
      setError('Could not load this trace. The underlying golf operation was not changed.');
    } finally {
      setLoadingId(null);
    }
  }, []);

  useEffect(() => {
    if (!initialTraceId) return;
    if (!isPlausibleTraceId(initialTraceId)) {
      setSelectedId(initialTraceId);
      setError(`The trace id in this link ("${initialTraceId}") isn't a valid trace identifier.`);
      return;
    }
    void inspect(initialTraceId);
    // Deliberately fires once for the id present when this explorer first
    // mounted; `inspect` is a stable useCallback with no reactive captures,
    // and re-running this on every render would fight a later manual click.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTraceId]);

  return (
    <Surface padding="sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-accent-600/25 pb-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">Flight recorder</h2>
          <p className="mt-1 text-xs text-warm-600">Opt-in action traces. Missing means a required stage did not run—not merely that it had no log line.</p>
        </div>
        <span className="font-fw-mono text-xs text-warm-500">{traces.length} recent</span>
      </div>

      {unavailableReason ? (
        <div className="py-4">
          <PanelStale label="Flight recorder" error={unavailableReason} />
        </div>
      ) : traces.length === 0 ? (
        <div className="py-4">
          <PanelNoData
            label="No flight traces yet"
            description="Production recording is opt-in — traces appear once a round submit runs with the recorder armed, or an admin supplies a trace id directly."
          />
        </div>
      ) : (
        <ul className="divide-y divide-warm-200/60">
          {traces.map((trace) => (
            <li
              key={trace.trace_id}
              className={cn(
                'flex flex-wrap items-center justify-between gap-3 py-3',
                selectedId === trace.trace_id && '-mx-2 rounded-lg bg-accent-50/60 px-2',
              )}
            >
              <div className="min-w-0">
                <p className="font-fw-mono text-xs font-semibold text-warm-900">{trace.workflow}</p>
                <p className="mt-1 text-xs text-warm-600">
                  <LocalTime iso={trace.started_at} variant="datetime" /> · {trace.duration_ms ?? '–'} ms
                  {trace.failure_step ? ` · failed at ${trace.failure_step}` : ''}
                  {trace.missing_required_step_count ? ` · ${trace.missing_required_step_count} missing` : ''}
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => void inspect(trace.trace_id)} disabled={loadingId === trace.trace_id}>
                {loadingId === trace.trace_id ? 'Loading…' : 'Inspect'}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-3 text-sm text-danger-700">{error}</p>}
      {selected && (
        <div className="mt-4 rounded-xl border border-warm-200 bg-cream-50 p-4">
          <div className="flex flex-wrap justify-between gap-2">
            <p className="font-fw-mono text-xs font-semibold text-warm-900">{selected.run.workflow}</p>
            <p className="font-fw-mono text-xs text-warm-600">{selected.run.trace_id}</p>
          </div>
          <FlightWaterfall workflow={String(selected.run.workflow)} steps={selected.steps} />
        </div>
      )}
    </Surface>
  );
}
