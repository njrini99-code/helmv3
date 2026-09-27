import { GitPullRequest, ImageUp, Link2, MessageSquarePlus, Tags } from 'lucide-react';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { Skeleton, SkeletonList, Surface } from '@/components/fairway';
import { PanelBoundary } from '../_components/PanelBoundary';
import { TabHeader } from '../_components/TabHeader';
import { AutoRefresh } from '../_components/AutoRefresh';
import { BenLeahForm } from './BenLeahForm';
import { BenLeahIssueBoard } from './BenLeahIssueBoard';

export const dynamic = 'force-dynamic';

// BenLeahForm is a client component and so never suspends on first paint —
// but its chunk CAN suspend on a soft navigation into /admin/ben-leah, which
// is the only moment this fallback is reachable. Shaped like the bare <form>
// it fronts (no Surface: the form renders its own outer element).
const INTAKE_SKELETON = (
  <div className="space-y-4">
    <Skeleton className="h-3 w-28" />
    <Skeleton className="h-10 w-full rounded-fw-md" />
    <Skeleton className="h-10 w-full rounded-fw-md" />
    <Skeleton className="h-32 w-full rounded-fw-md" />
    <Skeleton className="h-10 w-40 rounded-fw-md" />
  </div>
);

// The board opens with a StatusPill cluster, then the issue rows.
const TRACKER_SKELETON = (
  <div className="space-y-4">
    <Skeleton className="h-6 w-56 rounded-full" />
    <SkeletonList rows={5} />
  </div>
);

export default async function BenLeahPage() {
  await requireSuperAdmin();

  return (
    <div className="space-y-6">
      {/* One header. The eyebrow + second title + three feature-badge pills
          ("GitHub-backed", "screenshots", "signal URL") restated what the
          "What lands in GitHub" card below already lists, in accent colour
          that on the Bridge means severity. */}
      <TabHeader
        title="Ben + Leah"
        description="Capture changes, bugs, additions, screenshots, and source signals as GitHub issues without losing context."
      />

      {/* One grid, DOM order form → tracker → help. On a phone the three
          "how it works" cards used to sit between the intake form and the
          issue tracker, so the tracker (the thing you come back to check)
          was three cards further down. Desktop placement is unchanged: the
          aside is pinned beside the form in row 1, the tracker spans row 2. */}
      <div className="grid gap-x-4 gap-y-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <PanelBoundary title="Ben + Leah issue intake" skeleton={INTAKE_SKELETON}>
            <BenLeahForm />
          </PanelBoundary>
        </div>

        <div className="min-w-0 lg:col-span-2 lg:row-start-2">
          <PanelBoundary title="Issue tracker" skeleton={TRACKER_SKELETON}>
            <BenLeahIssueBoard />
          </PanelBoundary>
        </div>

        <aside className="min-w-0 space-y-4 lg:col-start-2 lg:row-start-1">
          <Surface padding="sm">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">What lands in GitHub</h2>
            <ul className="mt-3 space-y-3 text-sm text-warm-700">
              <li className="flex gap-2">
                <MessageSquarePlus size={16} className="mt-0.5 shrink-0 text-accent-600" aria-hidden />
                <span>Type, category, priority, and the full narrative become the issue body.</span>
              </li>
              <li className="flex gap-2">
                <ImageUp size={16} className="mt-0.5 shrink-0 text-accent-600" aria-hidden />
                <span>Images are accepted. If storage is configured, signed links are embedded in the issue.</span>
              </li>
              <li className="flex gap-2">
                <Link2 size={16} className="mt-0.5 shrink-0 text-accent-600" aria-hidden />
                <span>Signal URL is separate from Page URL, so a Sentry event or log link does not get buried.</span>
              </li>
              <li className="flex gap-2">
                <GitPullRequest size={16} className="mt-0.5 shrink-0 text-accent-600" aria-hidden />
                <span>Submissions go to the configured GitHub repo issues tab.</span>
              </li>
            </ul>
          </Surface>

          <Surface padding="sm">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">Status labels (GitHub)</h2>
            <ul className="mt-3 space-y-2 text-sm text-warm-700">
              <li className="flex gap-2">
                <Tags size={16} className="mt-0.5 shrink-0 text-accent-600" aria-hidden />
                <span><code className="text-xs">status:in-progress</code> or <code className="text-xs">status:triaged</code> — work started</span>
              </li>
              <li className="flex gap-2">
                <Tags size={16} className="mt-0.5 shrink-0 text-accent-600" aria-hidden />
                <span><code className="text-xs">status:in-production</code> — confirmed live (manual)</span>
              </li>
              <li className="flex gap-2">
                <Tags size={16} className="mt-0.5 shrink-0 text-accent-600" aria-hidden />
                <span><code className="text-xs">status:wontfix</code> — closed without shipping</span>
              </li>
            </ul>
            <p className="mt-3 text-xs text-warm-500">
              New submissions start as <code className="text-xs">status:triaged</code>. Use the tracker dropdown to move issues through the workflow — labels are created automatically in GitHub.
            </p>
          </Surface>

          <Surface padding="sm">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">Best submission shape</h2>
            <p className="mt-3 text-sm text-warm-700">
              One issue per request. Include the account, team, player, browser, page, and what decision or workflow is blocked.
            </p>
          </Surface>
        </aside>
      </div>

      <AutoRefresh intervalMs={60_000} />
    </div>
  );
}
