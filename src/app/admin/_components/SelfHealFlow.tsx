import Link from 'next/link';
import { StatusPill, type FwStatusTone } from '@/components/fairway';
import {
  describeFlow,
  formatWait,
  FLOW_STAGE_TITLE,
  STALL_CYCLES,
  type FlowSummary,
  type StageFlowState,
  type StalledIncident,
} from '@/lib/admin/selfheal-flow';
import { RailRow, RowFoot, RowHead, RowPath, StateChip } from './Row';
import { PanelAllClear, PanelNoData } from './PanelStates';

/**
 * SELF-HEAL FLOW — where the loop's work is, and where it is stuck.
 *
 * Two presentational pieces over `selfheal-flow.ts`'s pure model:
 *
 *   `SelfHealFlowStrip`   — one cell per automated stage (Diagnose, Repair,
 *                           Close): how many incidents are waiting on it,
 *                           how many of those have STALLED, and the longest
 *                           wait. Counts, deliberately — the Overview already
 *                           has its one attention list and its one incident
 *                           list, and a third list of the same incidents is
 *                           the split this read model exists to remove.
 *
 *   `StalledIncidentList` — the rows themselves, for the Self-heal page,
 *                           which is the loop's own board and the right
 *                           place to name what it has skipped.
 *
 * Both take `canClaimAllClear` for the reason every empty state on the
 * Bridge does: a loop with nothing waiting under a blind source is a loop
 * that could not SEE its backlog, and "idle" under those conditions is a
 * partial count, not a clean one. `sources.ts`'s `canClaimAllClear` decides
 * that upstream; these components only take the answer.
 *
 * COLOUR IS NEVER THE ONLY SIGNAL — every stage cell carries its state as a
 * word beside the pill, same rule as `TruthStrip.tsx` and `AttentionQueue`.
 */

const STATE_TONE: Readonly<Record<StageFlowState, FwStatusTone>> = {
  idle: 'neutral',
  // `info`, not `success`: work waiting inside a cycle is the loop doing its
  // job, and green is reserved on this Bridge for VERIFIED outcomes.
  flowing: 'info',
  stalled: 'warning',
};

export function SelfHealFlowStrip({
  summary,
  canClaimAllClear,
  /** Where the stalled link goes — the Errors tab's stalled lens by default. */
  stalledHref = '/admin/errors?lens=stalled',
}: {
  summary: FlowSummary;
  canClaimAllClear: boolean;
  stalledHref?: string;
}) {
  const words = describeFlow(summary);

  return (
    <div className="min-w-0">
      <div className="grid gap-2 sm:grid-cols-3">
        {summary.stages.map((stage) => (
          <div key={stage.stageId} className="min-w-0 rounded-fw-md bg-surface-sunken px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-eyebrow uppercase tracking-widest text-warm-500">{stage.title}</p>
              <StatusPill tone={STATE_TONE[stage.state]} dot size="sm">
                {stage.state}
              </StatusPill>
            </div>
            <p className="mt-1 font-fw-mono text-xl font-semibold tabular-nums text-warm-900">
              {stage.waiting}
              <span className="ml-1 text-caption font-normal text-warm-500">waiting</span>
            </p>
            <p className="text-caption text-warm-500">
              {stage.stalled > 0 ? (
                <span className="font-semibold text-fw-warning-ink">{stage.stalled} stalled</span>
              ) : (
                'none stalled'
              )}
              {stage.oldestWaitingMs !== null ? ` · longest wait ${formatWait(stage.oldestWaitingMs)}` : ''}
              {stage.unmeasured > 0
                ? ` · ${stage.unmeasured} ${stage.unmeasured === 1 ? 'wait' : 'waits'} unmeasured`
                : ''}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-2 text-caption text-warm-500">
        {words.detail}
        {canClaimAllClear
          ? ''
          : ' At least one source could not be read this refresh, so this backlog may be incomplete.'}
      </p>

      {summary.stalled > 0 ? (
        <p className="mt-1 text-caption">
          <Link
            href={stalledHref}
            className="text-accent-700 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
          >
            Open the {summary.stalled} stalled {summary.stalled === 1 ? 'incident' : 'incidents'}
          </Link>
        </p>
      ) : null}
    </div>
  );
}

export function StalledIncidentList({
  rows,
  limit = 8,
  canClaimAllClear,
  checkedAt,
}: {
  rows: readonly StalledIncident[];
  limit?: number;
  canClaimAllClear: boolean;
  checkedAt: string;
}) {
  if (rows.length === 0) {
    return canClaimAllClear ? (
      <PanelAllClear
        label={`Nothing stalled — every waiting incident is inside ${STALL_CYCLES} cycles of its stage`}
        checkedAt={checkedAt}
      />
    ) : (
      <PanelNoData
        label="Nothing stalled in readable sources"
        description="At least one source could not be read this refresh, so an incident waiting on a stage may be missing from this list."
      />
    );
  }

  const shown = rows.slice(0, limit);

  return (
    <div className="min-w-0">
      <ul className="divide-y divide-warm-200/60">
        {shown.map(({ incident, flow }) => (
          <RailRow key={incident.id} severity={incident.severity}>
            <RowHead clamp={2}>
              {incident.linkTarget ? (
                <Link href={incident.linkTarget} className="hover:underline">
                  {incident.description}
                </Link>
              ) : (
                incident.description
              )}
            </RowHead>
            {/* The flow model's own sentence, verbatim: which stage, how many
                of its cycles, what it did not do. */}
            <RowPath>{flow.why}</RowPath>
            <RowFoot>
              <StateChip tone="warning">
                {flow.stageId ? FLOW_STAGE_TITLE[flow.stageId] : 'stage'}
                {flow.waitingMs !== null ? ` · waited ${formatWait(flow.waitingMs)}` : ''}
              </StateChip>
            </RowFoot>
          </RailRow>
        ))}
      </ul>
      {rows.length > shown.length ? (
        <p className="mt-2 text-caption text-warm-500">
          <Link href="/admin/errors?lens=stalled" className="text-accent-700 underline">
            {rows.length - shown.length} more stalled
          </Link>
        </p>
      ) : null}
    </div>
  );
}
