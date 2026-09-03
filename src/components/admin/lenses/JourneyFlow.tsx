import { ChevronRight } from 'lucide-react';
import { Surface, StatusPill, type FwStatusTone } from '@/components/fairway';
import { cn } from '@/lib/utils';
import type { JourneyLens, JourneyStage, SignalConfidence } from '@/lib/admin/lenses/types';

/**
 * JourneyFlow — the dominant visual for the Golf/Baseball/Lift Lab lens
 * pages (brief §20-27's "Journey River" / "Program Execution Flow").
 *
 * Local, minimal primitive: Phase 1's shared `src/components/admin/premium/*`
 * (posture pill, evidence chips, confidence meter) is not present on
 * `origin/agent/bridge-premium-p1` at the time this was written (branch does
 * not exist yet) — this component builds its own small confidence indicator
 * inline. TO BE REPLACED by `premium/ConfidenceMeter` and
 * `premium/EvidenceChips` once that branch lands; the props below
 * (`JourneyStage.confidence`, `.incidents`) are shaped to migrate cleanly.
 *
 * Visual vocabulary follows the brief's §4 vocabulary literally: solid
 * border = durable_and_proven; dashed border = evidence real but proof
 * incomplete (durable_unproven / brief_derived); dotted/hatched border =
 * incidents_only (no durable count exists at all). Color is never the only
 * signal — every state also carries the border style + the sourceNote text.
 */

const CONFIDENCE_BORDER: Record<SignalConfidence, string> = {
  durable_and_proven: 'border-solid border-border-strong',
  durable_unproven: 'border-dashed border-border-strong',
  brief_derived: 'border-dashed border-border-subtle',
  incidents_only: 'border-dotted border-border-subtle',
};

const CONFIDENCE_LABEL: Record<SignalConfidence, string> = {
  durable_and_proven: 'proven',
  durable_unproven: 'unproven',
  brief_derived: 'brief-derived',
  incidents_only: 'incidents only',
};

function formatMetric(value: number | null): string {
  return value === null ? 'Unavailable' : value.toLocaleString();
}

function formatRate(value: number | null): string | null {
  if (value === null) return null;
  return `${Math.round(value * 100)}%`;
}

function incidentTone(count: number | null, criticalCount: number | null): FwStatusTone {
  if (count === null) return 'neutral';
  if (criticalCount !== null && criticalCount > 0) return 'danger';
  if (count > 0) return 'warning';
  return 'success';
}

function StageNode({ stage, isLast }: { stage: JourneyStage; isLast: boolean }) {
  const rate = formatRate(stage.metric.successRate);
  return (
    <div className="flex flex-1 items-stretch gap-2 md:gap-3">
      <Surface
        padding="sm"
        className={cn('flex-1 border-2', CONFIDENCE_BORDER[stage.confidence])}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-warm-500">{stage.label}</p>
          <StatusPill tone={incidentTone(stage.incidents.count, stage.incidents.criticalCount)} size="sm" dot>
            {stage.incidents.count === null ? 'incidents unknown' : `${stage.incidents.count} incident${stage.incidents.count === 1 ? '' : 's'}`}
          </StatusPill>
        </div>
        <p className="mt-2 font-fw-mono text-2xl font-bold tabular-nums text-warm-900">
          {formatMetric(stage.metric.completions ?? stage.metric.attempts)}
        </p>
        {stage.metric.attempts !== null && stage.metric.completions !== null && (
          <p className="font-fw-mono text-xs tabular-nums text-warm-500">
            of {stage.metric.attempts.toLocaleString()} {rate ? `· ${rate}` : ''}
          </p>
        )}
        <p className="mt-2 text-caption leading-4 text-warm-500">
          <span className="font-semibold uppercase tracking-wide text-warm-400">{CONFIDENCE_LABEL[stage.confidence]}</span>{' '}
          {stage.sourceNote}
        </p>
      </Surface>
      {!isLast && (
        <div className="flex shrink-0 items-center justify-center text-warm-300" aria-hidden>
          <ChevronRight className="h-4 w-4 rotate-90 md:h-5 md:w-5 md:rotate-0" />
        </div>
      )}
    </div>
  );
}

export function JourneyFlow({ lens }: { lens: JourneyLens }) {
  return (
    <div>
      <div className="flex flex-col gap-2 md:flex-row md:items-stretch md:gap-0">
        {lens.stages.map((stage, i) => (
          <StageNode key={stage.id} stage={stage} isLast={i === lens.stages.length - 1} />
        ))}
      </div>
      <p className="mt-4 font-fw-mono text-caption text-warm-400">
        {lens.windowDays}-day window · generated{' '}
        <span suppressHydrationWarning>{new Date(lens.generatedAt).toISOString()}</span>
      </p>
    </div>
  );
}
