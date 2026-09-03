import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { CircuitSummary, CircuitStage } from '@/lib/admin/command-deck/selfheal-circuit';

const STATE_LABEL: Readonly<Record<CircuitStage['state'], string>> = {
  idle: 'IDLE',
  flowing: 'ACTIVE',
  stalled: 'STALLED',
};

const STATE_TONE: Readonly<Record<CircuitStage['state'], string>> = {
  idle: 'text-warm-500',
  flowing: 'text-accent-700',
  stalled: 'text-fw-danger-ink',
};

const CAPABILITY_LABEL: Readonly<Record<CircuitStage['capabilityState'], string>> = {
  proven: 'proven',
  unproven: 'unproven',
  unknown: 'unknown',
};

function StageCard({ stage, isActive }: { stage: CircuitStage; isActive: boolean }) {
  return (
    <div
      className={cn(
        'flex min-w-[150px] flex-1 flex-col gap-1 rounded-lg border px-3 py-2.5',
        isActive ? 'border-accent-500 bg-accent-50' : 'border-warm-200 bg-surface-sunken',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-warm-900">{stage.title}</span>
        {/* One traveling dot on the active stage (brief §3 motion vocabulary) — a
            single static-but-highlighted marker here; the border/background
            above IS the "traveling" state since Phase 2 shows a snapshot, not
            an animated loop across renders. */}
        {isActive ? (
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-accent-600 motion-safe:animate-pulse" />
        ) : null}
      </div>
      <span className={cn('text-eyebrow font-bold uppercase tracking-wide', STATE_TONE[stage.state])}>
        {STATE_LABEL[stage.state]}
      </span>
      <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-caption text-warm-600">
        <dt>Waiting</dt>
        <dd className="text-right font-fw-mono tabular-nums text-warm-900">{stage.waiting}</dd>
        <dt>Stalled</dt>
        <dd className="text-right font-fw-mono tabular-nums text-warm-900">{stage.stalled}</dd>
        <dt>Capability</dt>
        <dd className="text-right text-warm-900">{CAPABILITY_LABEL[stage.capabilityState]}</dd>
      </dl>
      {stage.activeIncident ? (
        <Link
          href={stage.activeIncident.href ?? '/admin/self-heal'}
          className="truncate text-caption text-accent-700 underline"
        >
          {stage.activeIncident.title}
        </Link>
      ) : null}
    </div>
  );
}

/**
 * Self-Heal Circuit summary (brief §18) — Diagnose -> Repair -> Close, the
 * three stages this repo actually automates (see `selfheal-circuit.ts`'s
 * header for why the brief's full six-stage circuit is not rendered here).
 */
export function SelfHealCircuitSummary({ summary }: { summary: CircuitSummary }) {
  return (
    <div className="space-y-2">
      {summary.verdict ? (
        <p className="text-caption text-warm-600">{summary.verdict.detail}</p>
      ) : (
        <p className="text-caption text-fw-warning-ink">Self-heal board could not be read this refresh.</p>
      )}
      <div className="flex flex-wrap gap-2 sm:flex-nowrap">
        {summary.stages.map((stage, i) => (
          <div key={stage.stageId} className="flex flex-1 items-center gap-2">
            <StageCard stage={stage} isActive={summary.activeStageId === stage.stageId} />
            {i < summary.stages.length - 1 ? (
              <span aria-hidden className="hidden shrink-0 text-warm-300 sm:block">
                →
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
