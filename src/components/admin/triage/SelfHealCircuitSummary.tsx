/**
 * Bridge Premium Phase 3 — the "full Self-Heal Circuit" summary strip.
 *
 * A compact, per-stage counts view sitting above the existing detailed
 * `SelfHealCircuit` (`src/app/admin/self-heal/_components/SelfHealCircuit.tsx`,
 * which stays as the drill-down — this is deliberately NOT a second circuit
 * diagram, see the brief's §44 "no second self-heal lifecycle"). It answers
 * the one question the existing page splits across two sections: what is
 * waiting on THIS stage right now, alongside whether the stage is proven and
 * what it last did.
 *
 * `to be replaced by premium/<name>` — no shared `src/components/admin/
 * premium/*` stat-strip primitive existed on `agent/bridge-premium-p1` as of
 * this PR (branch not yet pushed); this is a local, minimal implementation
 * following the page's own existing `rounded-fw-md bg-surface-sunken`
 * card idiom (see `ThroughputStep`/`LocalRunnerStage` in
 * `src/app/admin/self-heal/page.tsx`) rather than introducing a new one.
 */
import { formatWait } from '@/lib/admin/selfheal-flow';
import { StatusPill, InlineNotice } from '@/components/fairway';
import { VERDICT_TONE } from '@/app/admin/self-heal/_components/SelfHealCircuit';
import type { SelfHealCircuitStage, SelfHealCircuitView } from '@/lib/admin/triage/self-heal-circuit';

const CAPABILITY_LABEL: Record<SelfHealCircuitStage['capabilityState'], string> = {
  proven: 'Proven',
  unproven: 'Unproven',
  unknown: 'Unknown',
};

const CAPABILITY_TONE: Record<SelfHealCircuitStage['capabilityState'], 'success' | 'warning' | 'neutral'> = {
  proven: 'success',
  unproven: 'warning',
  unknown: 'neutral',
};

function formatOutcome(stage: SelfHealCircuitStage): string {
  if (stage.currentRunInProgress) return 'Running now';
  if (!stage.lastOutcome) return 'No recorded outcome yet';
  if (stage.lastOutcome.blockedReason) return `Blocked — ${stage.lastOutcome.blockedReason}`;
  if (stage.lastOutcome.note) return stage.lastOutcome.note;
  if (stage.lastOutcome.facts.length > 0) return `${stage.lastOutcome.facts.length} fact(s) recorded`;
  return 'Ran with nothing to report';
}

function StageTile({ stage }: { stage: SelfHealCircuitStage }) {
  return (
    <div className="min-w-0 flex-1 rounded-fw-md border border-warm-200 bg-surface p-3 md:max-w-[20rem]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-warm-900">{stage.title}</span>
          {stage.currentRunInProgress ? (
            <StatusPill tone="info" dot size="sm">
              running
            </StatusPill>
          ) : null}
        </div>
        <StatusPill tone={CAPABILITY_TONE[stage.capabilityState]} size="sm">
          {CAPABILITY_LABEL[stage.capabilityState]}
        </StatusPill>
      </div>

      <dl className="mt-2 space-y-1 text-caption">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-warm-500">Waiting / stalled</dt>
          <dd className="font-fw-mono tabular-nums text-warm-700">
            {stage.waiting} / {stage.stalled}
            {stage.stalled > 0 ? (
              <span className="ml-1 text-fw-danger-ink">
                {stage.oldestWaitingMs !== null ? `oldest ${formatWait(stage.oldestWaitingMs)}` : ''}
              </span>
            ) : null}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-warm-500">Last outcome</dt>
          <dd className="min-w-0 max-w-[12rem] truncate text-right text-warm-600" title={formatOutcome(stage)}>
            {formatOutcome(stage)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-warm-500">Budget</dt>
          <dd className="text-right text-warm-500">not tracked</dd>
        </div>
        {stage.repairLink ? (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-warm-500">Repair quality</dt>
            <dd className="text-right">
              <a
                href={stage.repairLink.url}
                target="_blank"
                rel="noreferrer"
                className="font-fw-mono text-fw-accent-ink underline underline-offset-2"
              >
                PR #{stage.repairLink.number}
              </a>
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

export function SelfHealCircuitSummary({ view }: { view: SelfHealCircuitView }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={VERDICT_TONE[view.verdictTone]} dot size="md">
          {view.verdictLabel}
        </StatusPill>
        <span className="text-sm text-warm-600">{view.verdictDetail}</span>
      </div>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        {view.stages.map((stage) => (
          <StageTile key={stage.stageId} stage={stage} />
        ))}
      </div>
      {view.unreadable.length > 0 ? (
        <InlineNotice tone="warning" title="Some stages could not be read" className="mt-3">
          {view.unreadable.join(', ')} — treat as unknown, not healthy.
        </InlineNotice>
      ) : null}
    </div>
  );
}
