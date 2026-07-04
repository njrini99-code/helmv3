import { GitPullRequest, ImageUp, Link2, MessageSquarePlus } from 'lucide-react';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { Eyebrow, Surface, StatusPill } from '@/components/fairway';
import { PanelBoundary } from '../_components/PanelBoundary';
import { BenLeahForm } from './BenLeahForm';

export const dynamic = 'force-dynamic';

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
            <p className="mt-1 max-w-3xl text-sm text-warm-600">
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
        <PanelBoundary title="Ben + Leah issue intake">
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
            <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">Best submission shape</h2>
            <p className="mt-3 text-sm text-warm-700">
              One issue per request. Include the account, team, player, browser, page, and what decision or workflow is blocked.
            </p>
          </Surface>
        </aside>
      </div>
    </div>
  );
}
