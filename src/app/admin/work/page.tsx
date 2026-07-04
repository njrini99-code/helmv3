import { GitPullRequest, ScrollText } from 'lucide-react';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchWorkLog } from '@/lib/admin/github-pr-timeline';
import { Eyebrow, Surface, StatusPill } from '@/components/fairway';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelNoData, PanelStale } from '../_components/PanelStates';
import { AutoRefresh } from '../_components/AutoRefresh';
import { WorkTimeline } from './WorkTimeline';

export const dynamic = 'force-dynamic';

export default async function WorkLogPage() {
  await requireSuperAdmin();
  const workLog = await fetchWorkLog();

  return (
    <div className="space-y-6">
      <div>
        <Eyebrow as="p" tone="accent">
          Work log
        </Eyebrow>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-warm-900">Shipping timeline</h1>
            <p className="mt-1 max-w-3xl text-sm text-warm-600">
              A partner-readable history of your pull requests — what broke, what shipped, and which Helm surface it touched.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill tone="accent" dot size="sm">
              PR template
            </StatusPill>
            <StatusPill tone="neutral" dot={false} size="sm">
              no AI summaries
            </StatusPill>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <PanelBoundary title="Your PR timeline">
          {workLog.status === 'unconfigured' ? (
            <PanelNoData
              label="GitHub PR feed not configured"
              description="Set GITHUB_ISSUES_TOKEN (or GITHUB_TOKEN) with pull-request read access."
            />
          ) : workLog.status === 'error' || !workLog.data ? (
            <PanelStale label="Work log" error={workLog.error} />
          ) : workLog.data.entries.length === 0 ? (
            <PanelNoData
              label="No pull requests found"
              description="Set GITHUB_PR_AUTHOR_LOGINS to your GitHub username, or open PRs on the configured repo."
            />
          ) : (
            <WorkTimeline
              entries={workLog.data.entries}
              repoLabel={workLog.data.repoLabel}
              authorLogins={workLog.data.authorLogins}
              counts={workLog.data.counts}
            />
          )}
        </PanelBoundary>

        <aside className="space-y-4">
          <Surface padding="sm">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">How summaries work</h2>
            <ul className="mt-3 space-y-3 text-sm text-warm-700">
              <li className="flex gap-2">
                <ScrollText size={16} className="mt-0.5 shrink-0 text-accent-600" aria-hidden />
                <span>
                  <strong className="font-medium text-warm-900">Problem</strong> comes from the PR&apos;s{' '}
                  <code className="text-xs">Partner-readable summary</code> (before &quot;What changed&quot;).
                </span>
              </li>
              <li className="flex gap-2">
                <GitPullRequest size={16} className="mt-0.5 shrink-0 text-accent-600" aria-hidden />
                <span>
                  <strong className="font-medium text-warm-900">Fix / outcome</strong> comes from the partner block after
                  &quot;What changed&quot;, or the <code className="text-xs">Git Activity Timeline note</code>.
                </span>
              </li>
            </ul>
            <p className="mt-3 text-xs text-warm-500">
              Fill those sections on every PR — partners see the same text here without opening GitHub.
            </p>
          </Surface>

          <Surface padding="sm">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">Area tags</h2>
            <p className="mt-3 text-sm text-warm-700">
              Set the <code className="text-xs">Area</code> line in the template:{' '}
              <code className="text-xs">golf</code>, <code className="text-xs">baseball</code>,{' '}
              <code className="text-xs">coachhelm</code>, <code className="text-xs">mission-control</code>, etc.
            </p>
            <p className="mt-2 text-xs text-warm-500">
              If Area is blank, Helm Bridge infers from the PR title (e.g. <code className="text-xs">fix(golf):</code>).
            </p>
          </Surface>

          <Surface padding="sm">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">Filter to your PRs</h2>
            <p className="mt-3 text-sm text-warm-700">
              Optional env: <code className="text-xs">GITHUB_PR_AUTHOR_LOGINS</code> (comma-separated GitHub usernames).
              Without it, the feed shows all repo PRs.
            </p>
          </Surface>
        </aside>
      </div>

      <AutoRefresh intervalMs={120_000} />
    </div>
  );
}
