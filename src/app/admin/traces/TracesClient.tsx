'use client';

import { useCallback, useEffect, useState } from 'react';
import { Surface, Inset, StatusPill, Badge, Eyebrow, InlineNotice } from '@/components/fairway';
import { cn } from '@/lib/utils';
import {
  bridgeGetFlightTrace,
  type FlightTraceDetail,
  type FlightTraceRun,
} from '@/app/admin/actions/golf-tracer';
import { LocalTime } from '../_components/LocalTime';
import { TraceTree } from './TraceTree';

function runTone(run: FlightTraceRun) {
  if (run.status === 'failure' || run.failure_step) return 'danger' as const;
  if (run.missing_required_step_count > 0) return 'warning' as const;
  if (run.status === 'success') return 'success' as const;
  return 'neutral' as const;
}

export function TracesClient({ traces }: { traces: readonly FlightTraceRun[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(traces[0]?.trace_id ?? null);
  const [detail, setDetail] = useState<FlightTraceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (traceId: string) => {
    setLoading(true);
    setError(null);
    try {
      setDetail(await bridgeGetFlightTrace(traceId));
    } catch (err) {
      // Surfaced, never swallowed: "couldn't load the trace" and "the trace has
      // no steps" look identical on screen unless one of them says so.
      setError(err instanceof Error ? err.message : 'Could not load this trace.');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) void load(selectedId);
  }, [selectedId, load]);

  return (
    <div className="space-y-4">
      <Surface>
        <Inset>
          <Eyebrow as="h2">Traces</Eyebrow>
          <div className="mt-2 overflow-x-auto">
            <div className="min-w-[34rem] space-y-1">
              {traces.map((run) => (
                /* Dense trace-list row; <Button>'s min-h-[44px] and hover
                   styling fight the compact selectable-row rhythm. Same
                   documented exception as TraceTree. */
                // eslint-disable-next-line helm/no-raw-button
                <button
                  key={run.trace_id}
                  type="button"
                  onClick={() => setSelectedId(run.trace_id)}
                  aria-current={run.trace_id === selectedId ? 'true' : undefined}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-xs transition-colors',
                    'hover:bg-warm-100/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-500',
                    run.trace_id === selectedId && 'bg-warm-100',
                  )}
                >
                  <StatusPill tone={runTone(run)} size="sm" dot>
                    {run.status}
                  </StatusPill>
                  <span className="font-fw-mono text-caption text-warm-900">{run.workflow}</span>
                  <span className="text-warm-500">
                    <LocalTime iso={run.started_at} />
                  </span>
                  <span className="font-fw-mono tabular-nums text-warm-500">
                    {run.duration_ms !== null ? `${run.duration_ms.toLocaleString()} ms` : '—'}
                  </span>
                  {run.failure_step && (
                    <Badge tone="danger" variant="outline" size="sm">
                      failed at {run.failure_step}
                    </Badge>
                  )}
                  {run.missing_required_step_count > 0 && (
                    <Badge tone="warning" variant="outline" size="sm">
                      {run.missing_required_step_count} never ran
                    </Badge>
                  )}
                  <span className="ml-auto shrink-0 font-fw-mono text-caption text-warm-400">
                    {run.trace_id.slice(0, 8)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </Inset>
      </Surface>

      <Surface>
        <Inset>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Eyebrow as="h2">Workflow tree</Eyebrow>
            {detail && (
              <span className="font-fw-mono text-caption text-warm-500">
                {String(detail.run.trace_id)}
              </span>
            )}
          </div>

          <div className="mt-3">
            {error && <InlineNotice tone="danger">{error}</InlineNotice>}
            {!error && loading && (
              <p className="py-6 text-center text-caption text-warm-500">Loading trace…</p>
            )}
            {!error && !loading && !detail && (
              <p className="py-6 text-center text-caption text-warm-500">
                Select a trace to see its tree.
              </p>
            )}
            {!error && !loading && detail && (
              <TraceTree steps={detail.steps} workflow={String(detail.run.workflow ?? '')} />
            )}
          </div>
        </Inset>
      </Surface>
    </div>
  );
}
