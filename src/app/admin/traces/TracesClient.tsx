'use client';

import { useCallback, useEffect, useState } from 'react';
import { Surface, Inset, StatusPill, Badge, InlineNotice } from '@/components/fairway';
import { cn } from '@/lib/utils';
import {
  bridgeGetFlightTrace,
  type FlightTraceDetail,
  type FlightTraceRun,
} from '@/app/admin/actions/golf-tracer';
import { LocalTime } from '../_components/LocalTime';
import { TraceTree, EYEBROW_CLASS } from './TraceTree';
import { TraceFleetStrip } from './TraceFleetStrip';
import { stepCoverage } from './trace-fleet';

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
      {/* The shape of the whole recording, above the individual rows. Without
          it the list is 50 mostly-green pills and the fact that 46 of them
          skipped most of the pipeline is only visible by reading every badge. */}
      <Surface>
        <Inset>
          <TraceFleetStrip traces={traces} />
        </Inset>
      </Surface>

      <Surface>
        <Inset>
          <h2 className={EYEBROW_CLASS}>Traces</h2>
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
                    'flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-xs transition-colors motion-reduce:transition-none',
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
                  {/* Observed against declared, per run. Absent — never zero —
                      when either count is missing, so an unknown denominator
                      can't render as a confident fraction. */}
                  {(() => {
                    const coverage = stepCoverage(run);
                    return coverage ? (
                      <span
                        title={`${coverage.observed} of ${coverage.expected} declared steps recorded`}
                        className="shrink-0 font-fw-mono text-caption tabular-nums text-warm-400"
                      >
                        {coverage.observed}/{coverage.expected}
                      </span>
                    ) : null;
                  })()}
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
            <h2 className={EYEBROW_CLASS}>Workflow tree</h2>
            {detail && (
              <span className="font-fw-mono text-caption text-warm-500">
                {String(detail.run.trace_id)}
              </span>
            )}
          </div>
          {/* Says what the CODE contains — checkable — and nothing about the live
              value of HELM_FLIGHT_RECORDER_ENABLED, which is a deploy-time
              environment fact this page cannot read. An earlier draft asserted
              the flag was already on in production and named only the submit
              call site; both were wrong, and it shipped as operator-facing copy
              rather than a comment. */}
          <p className="mt-1 max-w-xl text-caption text-warm-500">
            Only call sites wired to the recorder produce observed steps. Today
            that is <span className="font-fw-mono">db.submit_round_atomic</span>{' '}
            and <span className="font-fw-mono">db.save_partial_round_atomic</span>,
            plus the fallback rescue path — every other step in each workflow is
            declared but has no call site yet. A tree that is mostly MISSING
            therefore means those steps are not instrumented, not that something
            failed.
          </p>

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
              // `detail.run` — never the `traces` row list — is the KPI
              // strip's duration source. `selectedId` commits (and repaints)
              // a render frame BEFORE the `load` effect below flips `loading`
              // and replaces `detail`, so a list-derived lookup would show the
              // newly-clicked trace's duration above the PREVIOUS trace's
              // still-rendered tree. Sourcing both from the same `detail`
              // object makes that a structural impossibility rather than a
              // race to avoid.
              <TraceTree
                steps={detail.steps}
                workflow={String(detail.run.workflow ?? '')}
                run={detail.run}
              />
            )}
          </div>
        </Inset>
      </Surface>
    </div>
  );
}
