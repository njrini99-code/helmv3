import { fetchWorkLogProof } from '@/lib/admin/engineering/work-log';
import { InlineNotice, StatStrip, StatTile, Skeleton, SkeletonList } from '@/components/fairway';
import { PanelNoData, PanelStale } from '../../_components/PanelStates';
import { WorkLogProofCard } from './WorkLogProofCard';

/** Reserved by the host page's PanelBoundary — a stat strip over a PR list. */
export const PROOF_SKELETON = (
  <div className="space-y-4">
    <Skeleton className="h-16 w-full max-w-lg rounded-fw-md" />
    <SkeletonList rows={6} />
  </div>
);

/**
 * The change-to-proof view of the Work log — every PR joined to the release it
 * shipped in and that release's post-deploy error delta.
 *
 * WAS `/admin/work-log`, a second Platform tab beside `/admin/work` whose own
 * page copy had to explain the difference in prose ("Distinct from the
 * PR-timeline view at /admin/work — this view adds the release/proof join").
 * A page that has to tell you which of two tabs you want is two framings of one
 * subject: same PR feed, one more join. It is now `/admin/work?view=proof`.
 */
export async function WorkProofView() {
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
