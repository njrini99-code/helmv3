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

/** An idle stage with nothing waiting and nothing stalled, so its two counts
 *  can only ever read 0. */
function isQuietStage(stage: CircuitStage): boolean {
  return stage.state === 'idle' && stage.waiting === 0 && stage.stalled === 0;
}

function StageCard({ stage, isActive, compact = false }: { stage: CircuitStage; isActive: boolean; compact?: boolean }) {
  if (compact) {
    // Title, the state word and capability. "Waiting 0 / Stalled 0" restated
    // IDLE as two more zeros; capability is the one fact still worth a line.
    return (
      <div className="flex min-w-[150px] flex-1 flex-col gap-0.5 rounded-lg border border-warm-200 bg-surface-sunken px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-warm-900">{stage.title}</span>
          <span className={cn('text-eyebrow font-bold uppercase tracking-wide', STATE_TONE[stage.state])}>
            {STATE_LABEL[stage.state]}
          </span>
        </div>
        <span className="text-caption text-warm-600">Capability {CAPABILITY_LABEL[stage.capabilityState]}</span>
      </div>
    );
  }
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
          href={stage.activeIncident.href ?? '/admin/errors?view=loop'}
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
 *
 * `proofDebt` (plan §2.4) is a count of incidents whose fix looks solved but
 * is not yet evidenced (`selectProofDebt`, computed once by the caller from
 * the same incident board the rest of this Deck reads — no second model).
 * `undefined`/`null` BOTH render the literal word "unknown", never a `0` —
 * a genuine zero only renders when the caller could actually confirm it (see
 * `CommandDeck.tsx`'s derivation), because a `0` here under an unreadable or
 * blind source would claim "nothing outstanding" when the truth is "we don't
 * know".
 */
export function SelfHealCircuitSummary({
  summary,
  proofDebt = null,
  quiet = false,
}: {
  summary: CircuitSummary;
  proofDebt?: number | null;
  /** Set only under a granted page-level all-clear. Idle stages drop their
   *  zero counts, and a confirmed zero proof debt reads "No proof debt"
   *  instead of a "0" chip linking to an empty lens. An unknown proof debt,
   *  a non-zero one, or any stage with work waiting renders exactly as the
   *  default does. */
  quiet?: boolean;
}) {
  const compactStages = quiet && summary.verdict !== null && summary.stages.every(isQuietStage);
  return (
    <div className="space-y-2">
      {summary.verdict ? (
        <p className="text-caption text-warm-600">{summary.verdict.detail}</p>
      ) : (
        <p className="text-caption text-fw-warning-ink">Self-heal board could not be read this refresh.</p>
      )}
      {quiet && proofDebt === 0 ? (
        <p className="text-caption text-warm-600">No proof debt: no fix is waiting on evidence.</p>
      ) : (
        <Link
          href="/admin/errors?lens=awaiting-proof"
          className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-full border border-warm-200 bg-surface-sunken px-3 py-1 text-caption text-warm-700 transition-colors hover:bg-warm-100"
        >
          <span className="font-fw-mono tabular-nums text-warm-900">
            {proofDebt === null ? 'unknown' : proofDebt}
          </span>
          proof debt
        </Link>
      )}
      <div className="flex flex-wrap gap-2 sm:flex-nowrap">
        {summary.stages.map((stage, i) => (
          // min-w-0 is load-bearing, not defensive. A flex item defaults to
          // `min-width: auto`, which resolves to its CONTENT's min-content
          // width — and StageCard renders the active incident title with
          // `truncate`, whose `white-space: nowrap` makes that min-content
          // width the FULL untruncated title. So the row could not shrink,
          // `truncate` never engaged, and /admin scrolled 433px sideways on a
          // 1534px viewport (measured on production 2026-09-03; /admin/errors
          // at the same width was 0). With min-w-0 the wrapper may shrink,
          // the card is bounded, and truncate finally does its job.
          //
          // `basis-full` below `sm`: with `flex-1` alone the three wrappers
          // shrank to ~110px each on a 390px phone while each card kept its
          // 150px minimum, so the cards overflowed the Surface and the
          // `overflow-x: clip` on <html> cut their values off. Full-width rows
          // on a phone; from `sm` up, `sm:basis-0` restores `flex-1`'s basis
          // and the three-across row is exactly what it was.
          <div key={stage.stageId} className="flex min-w-0 flex-1 basis-full items-center gap-2 sm:basis-0">
            <StageCard stage={stage} isActive={summary.activeStageId === stage.stageId} compact={compactStages} />
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
