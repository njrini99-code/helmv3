import { Badge } from '@/components/fairway';
import { cn } from '@/lib/utils';
import type { FlightTraceRun } from '@/app/admin/actions/golf-tracer';
import { summarizeTraceFleet } from './trace-fleet';
import { EYEBROW_CLASS } from './TraceTree';

/**
 * What the recorded fleet looks like, above the list of individual traces.
 *
 * Without this the tab showed 50 rows and no shape, and the shape is the
 * headline: measured 2026-09-01, 46 of the 50 most recent production traces
 * are missing declared-required steps and 40 of those say `success`. Read row
 * by row that is forty green pills with a small amber badge each.
 *
 * Rendered as TWO independent axes that are never summed — see
 * `trace-fleet.ts` for why. Instrumentation coverage is a fact about how much
 * of the pipeline has call sites wired to the recorder; outcome is a fact
 * about whether the work succeeded. A run can be short and perfectly
 * successful, which is the normal case here, and a strip that added them into
 * one "46 problems" number would be actively misleading.
 */

function Figure({
  value,
  label,
  hint,
  tone = 'neutral',
}: {
  value: string;
  label: string;
  hint?: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  const valueTone = {
    neutral: 'text-warm-900',
    success: 'text-warm-900',
    warning: 'text-fw-warning-ink',
    danger: 'text-fw-danger-ink',
  }[tone];

  return (
    <div className="min-w-0">
      <p className="font-fw-mono text-lg font-semibold tabular-nums leading-none">
        <span className={valueTone}>{value}</span>
      </p>
      <p className="mt-1 text-caption text-warm-600">{label}</p>
      {hint ? <p className="mt-0.5 text-caption text-warm-500">{hint}</p> : null}
    </div>
  );
}

/**
 * A two-part proportional track. Static, no gradient — the widths are the
 * counts and nothing else. `aria-hidden` because the counts either side of it
 * are already stated as text.
 */
function CoverageTrack({ complete, short }: { complete: number; short: number }) {
  const total = complete + short;
  if (total === 0) return null;
  const completePercent = (complete / total) * 100;

  return (
    <div aria-hidden className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-warm-200">
      <div className="bg-fw-success" style={{ width: `${completePercent}%` }} />
      <div className="bg-fw-warning" style={{ width: `${100 - completePercent}%` }} />
    </div>
  );
}

export function TraceFleetStrip({ traces }: { traces: readonly FlightTraceRun[] }) {
  const fleet = summarizeTraceFleet(traces);
  if (fleet.total === 0) return null;

  const healthy = fleet.total - fleet.failed - fleet.warning;

  return (
    <div>
      <h2 className={EYEBROW_CLASS}>Recorded fleet</h2>

      <div className="mt-2 grid gap-4 sm:grid-cols-2">
        {/* Axis 1 — how much of the pipeline is instrumented. */}
        <div className="rounded-fw-md bg-surface-sunken p-3">
          <p className="text-eyebrow font-semibold uppercase tracking-widest text-warm-400">
            Instrumentation coverage
          </p>
          <div className="mt-2 flex items-start gap-5">
            <Figure value={fleet.complete.toLocaleString()} label="fully instrumented" tone="success" />
            <Figure
              value={fleet.short.toLocaleString()}
              label="missing required steps"
              tone={fleet.short > 0 ? 'warning' : 'neutral'}
            />
          </div>
          <CoverageTrack complete={fleet.complete} short={fleet.short} />
          <p className="mt-2 text-caption text-warm-500">
            {fleet.dominantGap ? (
              <>
                {fleet.dominantGap.runs.toLocaleString()} of {fleet.total.toLocaleString()} runs are missing the
                same {fleet.dominantGap.missing} required steps — one uninstrumented region of the pipeline, not
                scattered gaps.
              </>
            ) : (
              <>Every recorded run observed all of its declared-required steps.</>
            )}
          </p>
        </div>

        {/* Axis 2 — whether the work succeeded. Counted separately. */}
        <div className="rounded-fw-md bg-surface-sunken p-3">
          <p className="text-eyebrow font-semibold uppercase tracking-widest text-warm-400">Outcome</p>
          <div className="mt-2 flex items-start gap-5">
            <Figure value={healthy.toLocaleString()} label="succeeded" tone="success" />
            <Figure
              value={fleet.warning.toLocaleString()}
              label="warning"
              tone={fleet.warning > 0 ? 'warning' : 'neutral'}
            />
            <Figure
              value={fleet.failed.toLocaleString()}
              label="failed"
              tone={fleet.failed > 0 ? 'danger' : 'neutral'}
            />
          </div>
          <p className="mt-2 text-caption text-warm-500">
            A short trace is not a failed one. These two panels count different things and are never added
            together — a run can miss most of its declared steps and still do its job, which is the normal case
            while instrumentation is partial.
          </p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-caption text-warm-500">
          Newest {fleet.total.toLocaleString()} traces
          {fleet.workflows.length > 1 ? ', across' : fleet.workflows.length === 1 ? ', from' : ''}
        </span>
        {fleet.workflows.map((workflow) => (
          <Badge key={workflow} tone="neutral" variant="outline" size="sm">
            <span className={cn('font-fw-mono')}>{workflow}</span>
          </Badge>
        ))}
      </div>
    </div>
  );
}
