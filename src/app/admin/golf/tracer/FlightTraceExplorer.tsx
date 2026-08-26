'use client';

import { useState } from 'react';
import { Button, Surface } from '@/components/fairway';
import {
  bridgeGetFlightTrace,
  type FlightTraceDetail,
  type FlightTraceRun,
} from '@/app/admin/actions/golf-tracer';

const STATUS_MARK: Record<string, string> = {
  success: '●',
  started: '◐',
  pending: '◐',
  warning: '▲',
  failure: '●',
  missing: '○',
  skipped: '–',
};

const STATUS_CLASS: Record<string, string> = {
  success: 'text-success-700',
  started: 'text-accent-700',
  pending: 'text-warm-500',
  warning: 'text-warning-700',
  failure: 'text-danger-700',
  missing: 'text-danger-700',
  skipped: 'text-warm-400',
};

function formatWhen(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString();
}

function asString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function TraceTree({ detail }: { detail: FlightTraceDetail }) {
  return (
    <ol className="mt-3 space-y-2 border-l border-warm-200 pl-4" aria-label="Flight trace steps">
      {detail.steps.map((step) => {
        const status = asString(step.status) ?? 'pending';
        const key = asString(step.step_key) ?? 'unknown step';
        const error = asString(step.error_summary);
        const missing = status === 'missing';
        return (
          <li key={`${key}-${asString(step.id) ?? ''}`} className="relative text-sm">
            <span className={`absolute -left-[1.35rem] ${STATUS_CLASS[status] ?? 'text-warm-500'}`} aria-hidden>
              {STATUS_MARK[status] ?? '●'}
            </span>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="font-fw-mono text-xs font-medium text-warm-900">{key}</span>
              <span className={`${STATUS_CLASS[status] ?? 'text-warm-500'} text-xs font-semibold uppercase tracking-wide`}>
                {missing ? 'Not run' : status}
              </span>
            </div>
            {(error || missing) && (
              <p className="mt-0.5 text-xs text-warm-600">
                {error ?? 'This required step never ran after the prior failure.'}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function FlightTraceExplorer({ traces }: { traces: FlightTraceRun[] }) {
  const [selected, setSelected] = useState<FlightTraceDetail | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inspect = async (traceId: string) => {
    setLoadingId(traceId);
    setError(null);
    try {
      setSelected(await bridgeGetFlightTrace(traceId));
    } catch {
      setError('Could not load this trace. The underlying golf operation was not changed.');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <Surface padding="sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-accent-600/25 pb-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">Flight recorder</h2>
          <p className="mt-1 text-xs text-warm-600">Opt-in action traces. Missing means a required stage did not run—not merely that it had no log line.</p>
        </div>
        <span className="font-fw-mono text-xs text-warm-500">{traces.length} recent</span>
      </div>

      {traces.length === 0 ? (
        <p className="py-4 text-sm text-warm-600">No captured traces yet. Local and preview traces are automatic; production is deliberately targeted.</p>
      ) : (
        <ul className="divide-y divide-warm-200/60">
          {traces.map((trace) => (
            <li key={trace.trace_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-fw-mono text-xs font-semibold text-warm-900">{trace.workflow}</p>
                <p className="mt-1 text-xs text-warm-600">
                  {formatWhen(trace.started_at)} · {trace.duration_ms ?? '–'} ms
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
          <TraceTree detail={selected} />
        </div>
      )}
    </Surface>
  );
}
