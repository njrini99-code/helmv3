import { GitPullRequest, ImageUp, Link2, MessageSquarePlus, Tags } from 'lucide-react';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { Eyebrow, Skeleton, SkeletonList, Surface, StatusPill } from '@/components/fairway';
import { PanelBoundary } from '../_components/PanelBoundary';
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
      <div>
        <Eyebrow as="p" tone="accent">
          Ben + Leah
        </Eyebrow>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-warm-900">Submission desk</h1>
            {/* Rule 2 (docs/MOBILE_DOCTRINE.md) — an eyebrow + title + full
                sentence is a desktop cover treatment; below `md` it condenses
                to one line so the intake form (the actual above-fold action)
                isn't pushed down by masthead copy. */}
            <p className="mt-1 line-clamp-1 max-w-3xl text-sm text-warm-600 md:line-clamp-none">
              Capture changes, bugs, additions, screenshots, and source signals as GitHub issues without losing context.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill tone="accent" dot size="sm">
              GitHub-backed
            </StatusPill>
            <StatusPill tone="neutral" size="sm" dot={false}>
              screenshots
            </StatusPill>
            <StatusPill tone="neutral" size="sm" dot={false}>
              signal URL
            </StatusPill>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <PanelBoundary title="Ben + Leah issue intake" skeleton={INTAKE_SKELETON}>
          <BenLeahForm />
        </PanelBoundary>

        <aside className="space-y-4">
          <Surface padding="sm">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">What lands in GitHub</h2>
            <ul className="mt-3 space-y-3 text-sm text-warm-700">
              <li className="flex gap-2">
                <MessageSquarePlus size={16} className="mt-0.5 text-accent-600" aria-hidden />
                <span>Type, category, priority, and the full narrative become the issue body.</span>
              </li>
              <li className="flex gap-2">
                <ImageUp size={16} className="mt-0.5 text-accent-600" aria-hidden />
                <span>Images are accepted. If storage is configured, signed links are embedded in the issue.</span>
              </li>
              <li className="flex gap-2">
                <Link2 size={16} className="mt-0.5 text-accent-600" aria-hidden />
                <span>Signal URL is separate from Page URL, so a Sentry event or log link does not get buried.</span>
              </li>
              <li className="flex gap-2">
                <GitPullRequest size={16} className="mt-0.5 text-accent-600" aria-hidden />
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

      <PanelBoundary title="Issue tracker" skeleton={TRACKER_SKELETON}>
        <BenLeahIssueBoard />
      </PanelBoundary>

      <AutoRefresh intervalMs={60_000} />
    </div>
  );
}
