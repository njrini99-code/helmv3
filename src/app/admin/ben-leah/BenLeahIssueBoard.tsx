import Link from 'next/link';
import { GitPullRequest, Rocket } from 'lucide-react';
import {
  fetchBenLeahIssueBoard,
  type BenLeahTrackStatus,
} from '@/lib/admin/ben-leah-issues';
import { PanelNoData, PanelStale } from '../_components/PanelStates';
import { StatusPill, StatTile, StatStrip, type FwStatusTone } from '@/components/fairway';
import { BenLeahIssueTable } from './BenLeahIssueTable';

const TRACK_META: Record<
  BenLeahTrackStatus,
  { label: string; tone: FwStatusTone; description: string }
> = {
  open: {
    label: 'Open',
    tone: 'warning',
    description: 'Still open on GitHub — waiting for work.',
  },
  in_progress: {
    label: 'In progress',
    tone: 'info',
    description: 'Label status:in-progress or status:triaged on the issue.',
  },
  in_production: {
    label: 'In production',
    tone: 'success',
    description: 'Closed and shipped, or label status:in-production.',
  },
  fixed_pending_deploy: {
    label: 'Fixed · pending deploy',
    tone: 'warning',
    description: 'Closed on GitHub; production has not deployed since the fix.',
  },
  fixed: {
    label: 'Fixed',
    tone: 'success',
    description: 'Closed on GitHub (deploy timing unknown).',
  },
  wont_fix: {
    label: "Won't fix",
    tone: 'neutral',
    description: 'Label status:wontfix on the issue.',
  },
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function githubIntegrationTone(status: string): FwStatusTone {
  if (status === 'ok') return 'success';
  if (status === 'unconfigured') return 'warning';
  return 'danger';
}

export async function BenLeahIssueBoard() {
  const board = await fetchBenLeahIssueBoard();

  if (board.status === 'unconfigured') {
    return (
      <PanelNoData
        label="GitHub issue tracker not configured"
        description="Set GITHUB_ISSUES_TOKEN in production so Helm Bridge can list ben-leah issues."
      />
    );
  }

  if (board.status === 'error' || !board.data) {
    return <PanelStale label="Ben + Leah issue tracker" error={board.error} />;
  }

  const { issues, counts, repoLabel, repoIssuesUrl, productionCommitSha, productionReadyAt, fetchedAt } = {
    ...board.data,
    fetchedAt: board.fetchedAt,
  };

  const openCount = counts.open + counts.in_progress;
  const shippedCount = counts.in_production;
  const pendingDeployCount = counts.fixed_pending_deploy;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <StatusPill tone={githubIntegrationTone(board.status)} dot size="sm">
            GitHub {board.status === 'ok' ? 'live' : 'stale'}
          </StatusPill>
          <StatusPill tone={productionReadyAt ? 'success' : 'neutral'} dot={Boolean(productionReadyAt)} size="sm">
            {productionReadyAt
              ? `prod ${productionCommitSha?.slice(0, 7) ?? 'build'}`
              : 'prod timing n/a'}
          </StatusPill>
          {fetchedAt ? (
            <StatusPill tone="neutral" dot={false} size="sm">
              checked {new Date(fetchedAt).toLocaleTimeString()}
            </StatusPill>
          ) : null}
        </div>
        <Link
          href={repoIssuesUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-accent-700 hover:underline"
        >
          <GitPullRequest size={14} aria-hidden />
          All issues on {repoLabel}
        </Link>
      </div>

      {/* StatStrip (Mobile Doctrine rules 2/3/11) — the shared phone-shape
          primitive for KPI rows: a 2x2 grid below `md` instead of 4 stacked
          full-width rows, so the KPI count doesn't eat the scroll budget
          before the issue list is reached. REPAIR (verified defect): desktop
          is NOT byte-identical to the prior hand-rolled `grid gap-3
          sm:grid-cols-2 lg:grid-cols-4` recipe — column count at `sm`/`lg`
          is unchanged, but StatStrip's own `sm:gap-x-8 sm:gap-y-7` (32px/
          28px) unconditionally replaces the old flat `gap-3` (12px) at every
          breakpoint from `sm` up (src/components/fairway/charts/
          StatStrip.tsx:248, grid branch — this call has count=4, so it never
          hits the rail branch's own `sm:gap-x-8 sm:gap-y-7` at line 144).
          That gap widening is accepted here as a shared-primitive tradeoff —
          StatStrip.tsx is out of this packet's edit scope — not asserted as
          unchanged. */}
      <StatStrip count={4}>
        {(
          [
            ['Open / in progress', openCount, 'Needs attention'],
            ['In production', shippedCount, 'Shipped or labeled'],
            ['Pending deploy', pendingDeployCount, 'Closed, not on prod yet'],
            ['Total tracked', issues.length, 'Last 50 updates'],
          ] as const
        ).map(([label, value, caption]) => (
          <div key={label} className="rounded-xl border border-warm-200/70 bg-surface px-3 py-2">
            <StatTile label={label} value={value} tone="neutral" mono />
            <p className="mt-1 text-xs text-warm-500">{caption}</p>
          </div>
        ))}
      </StatStrip>

      {productionReadyAt ? (
        <p className="flex items-center gap-2 text-xs text-warm-500">
          <Rocket size={14} className="text-accent-600" aria-hidden />
          Production last ready {formatWhen(new Date(productionReadyAt).toISOString())}
          {productionCommitSha ? ` · ${productionCommitSha.slice(0, 7)}` : null}
          . Closed issues after that time show as <span className="font-medium text-warm-700">In production</span>.
        </p>
      ) : (
        <p className="text-xs text-warm-500">
          Set VERCEL_API_TOKEN to correlate closed issues with production deploy timing. Without it, status uses GitHub labels only.
        </p>
      )}

      {issues.length === 0 ? (
        <PanelNoData
          label="No Ben + Leah issues yet"
          description="Submissions from this tab create GitHub issues tagged ben-leah. Submit the first one above."
        />
      ) : (
        <BenLeahIssueTable issues={issues} />
      )}

      {/* Stays 1-up below `sm`: the longest legend label ("Fixed · pending
          deploy") is a `whitespace-nowrap` StatusPill sharing its row with a
          count — at a 390px viewport a 2-up grid leaves that pill ~145px of
          content width for a label that needs ~160px, which would spill out
          of the sunken-well card (defect class 1: non-shrinkable chip in a
          too-narrow row). Full-width rows are the safe compaction here. */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {(Object.keys(TRACK_META) as BenLeahTrackStatus[]).map((status) => (
          <div key={status} className="rounded-fw-md bg-surface-sunken px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <StatusPill tone={TRACK_META[status].tone} dot size="sm">
                {TRACK_META[status].label}
              </StatusPill>
              <span className="font-fw-mono text-sm tabular-nums text-warm-900">{counts[status]}</span>
            </div>
            <p className="mt-1 text-xs text-warm-500">{TRACK_META[status].description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
