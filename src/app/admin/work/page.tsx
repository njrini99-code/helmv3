import { GitPullRequest, ScrollText } from 'lucide-react';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchWorkLog, type PrLifecycleState } from '@/lib/admin/github-pr-timeline';
import type { WorkArea } from '@/lib/admin/pr-body-parser';
import { Eyebrow, Surface, StatusPill } from '@/components/fairway';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelNoData, PanelStale } from '../_components/PanelStates';
import { AutoRefresh } from '../_components/AutoRefresh';
import { WorkTimeline, AREA_META, STATE_META } from './WorkTimeline';
import { WorkFilterChips, type WorkFilterChip } from './WorkFilterChips';

export const dynamic = 'force-dynamic';

const WORK_AREAS = Object.keys(AREA_META) as WorkArea[];
const PR_STATES = Object.keys(STATE_META) as PrLifecycleState[];

function buildWorkHref(params: { area?: WorkArea; state?: PrLifecycleState }): string {
  const sp = new URLSearchParams();
  if (params.area) sp.set('area', params.area);
  if (params.state) sp.set('state', params.state);
  const qs = sp.toString();
  return qs ? `/admin/work?${qs}` : '/admin/work';
}

async function WorkLogBody({ areaFilter, stateFilter }: { areaFilter?: WorkArea; stateFilter?: PrLifecycleState }) {
  const workLog = await fetchWorkLog();

  if (workLog.status === 'unconfigured') {
    return (
      <PanelNoData
        label="GitHub PR feed not configured"
        description="Set GITHUB_ISSUES_TOKEN (or GITHUB_TOKEN) with pull-request read access."
      />
    );
  }
  if (workLog.status === 'error' || !workLog.data) {
    return <PanelStale label="Work log" error={workLog.error} />;
  }
  const data = workLog.data;
  if (data.entries.length === 0) {
    return (
      <PanelNoData
        label="No pull requests found"
        description="Set GITHUB_PR_AUTHOR_LOGINS to your GitHub username, or open PRs on the configured repo."
      />
    );
  }

  const areaChips: WorkFilterChip[] = [
    { key: 'all', label: 'All areas', href: buildWorkHref({ state: stateFilter }), selected: !areaFilter },
    ...WORK_AREAS.filter((area) => data.counts.byArea[area] > 0).map((area) => ({
      key: area,
      label: AREA_META[area].label,
      href: buildWorkHref({ area, state: stateFilter }),
      selected: areaFilter === area,
      count: data.counts.byArea[area],
    })),
  ];
  const closedCount = Math.max(0, data.counts.total - data.counts.merged - data.counts.open);
  const stateCounts: Record<PrLifecycleState, number> = {
    merged: data.counts.merged,
    open: data.counts.open,
    closed: closedCount,
  };
  const stateChips: WorkFilterChip[] = [
    { key: 'all', label: 'All states', href: buildWorkHref({ area: areaFilter }), selected: !stateFilter },
    ...PR_STATES.filter((state) => stateCounts[state] > 0).map((state) => ({
      key: state,
      label: STATE_META[state].label,
      href: buildWorkHref({ area: areaFilter, state }),
      selected: stateFilter === state,
      count: stateCounts[state],
    })),
  ];

  const filteredEntries = data.entries.filter(
    (entry) => (!areaFilter || entry.parsed.area === areaFilter) && (!stateFilter || entry.state === stateFilter),
  );

  // WorkTimeline's "PRs tracked" / "Merged" / "Open" stat tiles and its "Top
  // areas" chip cluster must describe the SAME set of PRs as the timeline
  // cards rendered below them — recount over `filteredEntries`, not
  // `data.counts` (the platform-wide, pre-filter rollup), so picking an
  // area/state chip narrows every number on the page together instead of
  // narrowing only the card list while the tiles above keep showing the
  // unfiltered totals.
  const filteredCounts = {
    total: filteredEntries.length,
    merged: filteredEntries.filter((entry) => entry.state === 'merged').length,
    open: filteredEntries.filter((entry) => entry.state === 'open').length,
    byArea: Object.fromEntries(
      WORK_AREAS.map((area) => [area, filteredEntries.filter((entry) => entry.parsed.area === area).length]),
    ) as Record<WorkArea, number>,
  };

  return (
    <div className="space-y-4">
      <WorkFilterChips areaChips={areaChips} stateChips={stateChips} />
      {filteredEntries.length === 0 ? (
        <PanelNoData
          label="No PRs match these filters"
          description="Clear the area/state filters to see the full timeline."
        />
      ) : (
        <WorkTimeline
          entries={filteredEntries}
          repoLabel={data.repoLabel}
          authorLogins={data.authorLogins}
          counts={filteredCounts}
          truncated={workLog.truncated ?? false}
          fetchLimit={data.fetchLimit}
        />
      )}
    </div>
  );
}

export default async function WorkLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSuperAdmin();
  const params = await searchParams;
  const areaParam = typeof params.area === 'string' ? params.area : undefined;
  const stateParam = typeof params.state === 'string' ? params.state : undefined;
  const areaFilter = areaParam && (WORK_AREAS as string[]).includes(areaParam) ? (areaParam as WorkArea) : undefined;
  const stateFilter =
    stateParam && (PR_STATES as string[]).includes(stateParam) ? (stateParam as PrLifecycleState) : undefined;

  return (
    <div className="space-y-6">
      <div data-fw-title-anchor>
        <Eyebrow as="p" tone="accent">
          Work log
        </Eyebrow>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-warm-900">Shipping timeline</h1>
            <p className="mt-1 hidden max-w-3xl text-sm text-warm-600 md:block">
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <PanelBoundary title="Your PR timeline">
            <WorkLogBody areaFilter={areaFilter} stateFilter={stateFilter} />
          </PanelBoundary>
        </div>

        <aside className="min-w-0 space-y-4">
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
