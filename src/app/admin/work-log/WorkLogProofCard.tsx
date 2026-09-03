import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import type { WorkLogProofRow } from '@/lib/admin/engineering/work-log';
import { StatusPill, Surface, type FwStatusTone } from '@/components/fairway';
import { LocalTime } from '../_components/LocalTime';

const AREA_LABEL: Record<WorkLogProofRow['area'], string> = {
  golf: 'GolfHelm',
  baseball: 'BaseballHelm',
  coachhelm: 'CoachHelm',
  bridge: 'Helm Bridge',
  platform: 'Platform',
  mobile: 'Mobile',
  shared: 'Shared',
  unknown: 'Cross-cutting',
};

const STATE_TONE: Record<WorkLogProofRow['state'], FwStatusTone> = {
  merged: 'success',
  open: 'info',
  closed: 'neutral',
};

const VERDICT_TONE: Record<WorkLogProofRow['repairVerdict'], FwStatusTone> = {
  confirmed: 'success',
  corrected: 'warning',
  'not-reviewed': 'neutral',
};

/** Renders the release/proof line only from what's actually known — never a
 *  fabricated "shipped" claim when the release ledger could not be read. */
function ReleaseProofLine({ row }: { row: WorkLogProofRow }) {
  if (row.state !== 'merged') return null;
  if (row.notYetDeployed) {
    return <p className="text-xs text-warm-500">Merged — not yet deployed in a known release.</p>;
  }
  if (!row.shippedInRelease) {
    return <p className="text-xs text-warm-500">Release match unknown — release ledger unavailable or out of window.</p>;
  }
  const { verdict, gatheringSignal, errorsAfter2h, delta, commitSha, deployedAt } = row.shippedInRelease;
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs text-warm-600">
      <span>
        Shipped {commitSha ? <span className="font-fw-mono">{commitSha.slice(0, 9)}</span> : 'release'} ·{' '}
        <LocalTime iso={new Date(deployedAt).toISOString()} />
      </span>
      {gatheringSignal ? (
        <StatusPill tone="neutral" size="sm" dot={false}>Still gathering signal</StatusPill>
      ) : (
        <StatusPill tone={verdict.tone} size="sm" dot={false}>
          {verdict.label}
          {typeof delta === 'number' && errorsAfter2h != null ? ` (${errorsAfter2h} errors, Δ${delta >= 0 ? '+' : ''}${delta})` : ''}
        </StatusPill>
      )}
    </p>
  );
}

export function WorkLogProofCard({ row }: { row: WorkLogProofRow }) {
  return (
    <Surface padding="sm" className="min-w-0 border border-warm-200/70">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="neutral" size="sm" dot={false}>{AREA_LABEL[row.area]}</StatusPill>
            <StatusPill tone={STATE_TONE[row.state]} size="sm">{row.state}</StatusPill>
            {row.repairIncidentIds.length > 0 ? (
              <StatusPill tone={VERDICT_TONE[row.repairVerdict]} size="sm" dot={false}>
                repair · {row.repairVerdict}
              </StatusPill>
            ) : null}
          </div>
          <Link
            href={row.htmlUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-w-0 items-center gap-1.5 text-sm font-medium text-text-primary hover:text-accent-700"
          >
            <span className="truncate">
              #{row.number} {row.title}
            </span>
            <ExternalLink size={12} className="shrink-0 text-text-tertiary" aria-hidden />
          </Link>
          <ReleaseProofLine row={row} />
        </div>
      </div>
    </Surface>
  );
}
