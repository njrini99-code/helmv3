import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchWorkLogProof } from '@/lib/admin/engineering/work-log';
import { Eyebrow, InlineNotice, StatStrip, StatTile, Skeleton, SkeletonList } from '@/components/fairway';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelNoData, PanelStale } from '../_components/PanelStates';
import { AutoRefresh } from '../_components/AutoRefresh';
import { WorkLogProofCard } from './WorkLogProofCard';

export const dynamic = 'force-dynamic';

const PROOF_SKELETON = (
  <div className="space-y-4">
    <Skeleton className="h-16 w-full max-w-lg rounded-fw-md" />
    <SkeletonList rows={6} />
  </div>
);

async function WorkLogProofBody() {
  const result = await fetchWorkLogProof();

  if (result.status === 'unconfigured') {
    return (
      <PanelNoData
        label="GitHub PR feed not configured"
        description="Set GITHUB_ISSUES_TOKEN (or GITHUB_TOKEN) with pull-request read access."
      />
    );
  }
  if (result.status === 'error' || !result.data) {
    return <PanelStale label="Change-to-proof Work Log" error={result.error} />;
  }

  const { rows, repoLabel, truncated, releaseDataAvailable } = result.data;
  if (rows.length === 0) {
    return <PanelNoData label="No pull requests found" description={`No PRs on ${repoLabel} in the fetched window.`} />;
  }

  const repairCount = rows.filter((r) => r.repairIncidentIds.length > 0).length;
  const shippedCount = rows.filter((r) => r.shippedInRelease).length;

  return (
    <div className="space-y-4">
      {!releaseDataAvailable ? (
        <InlineNotice tone="warning" title="Release ledger unavailable">
          Every PR below still shows what it claims and what it repaired — the release-shipped-in and post-deploy proof
          columns are blank until the Vercel/release read succeeds again.
        </InlineNotice>
      ) : null}
      {truncated ? (
        <InlineNotice tone="info" title="Showing the most recent PRs">
          The fetch window has a cap — this is the most recent set, not the full PR history.
        </InlineNotice>
      ) : null}
      <StatStrip count={3} ariaLabel="Work log proof summary">
        <div className="rounded-xl border border-warm-200/70 bg-surface px-3 py-2">
          <StatTile label="PRs tracked" value={rows.length} tone="neutral" mono />
        </div>
        <div className="rounded-xl border border-warm-200/70 bg-surface px-3 py-2">
          <StatTile label="Repairs" value={repairCount} tone="neutral" mono />
        </div>
        <div className="rounded-xl border border-warm-200/70 bg-surface px-3 py-2">
          <StatTile label="Shipped in a known release" value={shippedCount} tone="neutral" mono />
        </div>
      </StatStrip>
      <div className="space-y-3">
        {rows.map((row) => (
          <WorkLogProofCard key={row.number} row={row} />
        ))}
      </div>
    </div>
  );
}

export default async function WorkLogPage() {
  await requireSuperAdmin();

  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={120_000} />
      <div className="space-y-1">
        <Eyebrow>Engineering OS</Eyebrow>
        <h1 className="text-h2 font-fw-display text-text-primary">Change-to-Proof Work Log</h1>
        <p className="max-w-2xl text-sm text-warm-500">
          Every PR: what it claims, whether it self-reports as a confirmed or corrected repair, which release it shipped
          in, and that release&apos;s post-deploy error delta. Distinct from the PR-timeline view at{' '}
          <span className="font-fw-mono">/admin/work</span> — this view adds the release/proof join.
        </p>
      </div>
      <PanelBoundary title="Change-to-proof Work Log" skeleton={PROOF_SKELETON}>
        <WorkLogProofBody />
      </PanelBoundary>
    </div>
  );
}
