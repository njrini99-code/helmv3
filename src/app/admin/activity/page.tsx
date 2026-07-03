import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchGolfActivity } from '@/lib/admin/data/activity';
import { classifyKpiTone, ERRORS_24H_RED_AT } from '@/lib/admin/data/overview';
import { Button, Surface, SkeletonStat, SkeletonList, InlineNotice } from '@/components/fairway';
import { PanelBoundary } from '../_components/PanelBoundary';
import { KpiTile } from '../_components/KpiTile';
import { fetchActivityTodayStats, fetchTeamOptions } from './_data';
import {
  parseActivityFilters,
  searchParamsToURLSearchParams,
  kindChipHref,
  teamFilterHref,
  loadMoreHref,
} from './filters';
import { ACTIVITY_KIND_META, kindMeta } from './kind-meta';
import { ActivityKindFilterChips, type ActivityKindChip } from './ActivityKindFilterChips';
import { TeamFilterControl, type TeamFilterOption } from './TeamFilterControl';
import { ActivityFeed } from './ActivityFeed';

export const dynamic = 'force-dynamic';

const STATS_SKELETON = (
  <div className="grid grid-cols-2 items-stretch gap-3 sm:grid-cols-4">
    <SkeletonStat />
    <SkeletonStat />
    <SkeletonStat />
    <SkeletonStat />
  </div>
);

const TEAM_FILTER_SKELETON = <div className="h-10 w-full animate-pulse rounded-fw-sm bg-surface-sunken sm:w-56" />;

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSuperAdmin();
  const params = await searchParams;
  const filters = parseActivityFilters(params);
  const current = searchParamsToURLSearchParams(params);

  async function StatsStrip() {
    const stats = await fetchActivityTodayStats();
    return (
      <div className="grid grid-cols-2 items-stretch gap-3 sm:grid-cols-4">
        <KpiTile
          label="Rounds today"
          value={stats.rounds.today}
          delta={stats.rounds.delta}
          href="/admin/activity?type=round_submitted"
        />
        <KpiTile
          label="Sign-ins today"
          value={stats.signIns.today}
          delta={stats.signIns.delta}
          href="/admin/activity?type=sign_in"
        />
        <KpiTile
          label="New users today"
          value={stats.newUsers.today}
          delta={stats.newUsers.delta}
          href="/admin/activity?type=signup"
        />
        <KpiTile
          label="Errors today"
          value={stats.errors.today}
          delta={stats.errors.delta}
          href="/admin/activity?type=error"
          goodDirection="down"
          tone={classifyKpiTone(stats.errors.today, ERRORS_24H_RED_AT)}
        />
      </div>
    );
  }

  async function TeamFilterAsync() {
    const teams = await fetchTeamOptions();
    const options: TeamFilterOption[] = [
      { value: 'all', label: 'All teams', href: teamFilterHref(current, null) },
      ...teams.map((t) => ({ value: t.id, label: t.name, href: teamFilterHref(current, t.id) })),
    ];
    return <TeamFilterControl options={options} value={filters.teamId ?? 'all'} />;
  }

  async function Feed() {
    const result = await fetchGolfActivity({
      types: filters.type ? [filters.type] : undefined,
      teamId: filters.teamId ?? undefined,
      cursor: filters.cursor ?? undefined,
    });
    return (
      <>
        {result.degradedKinds.length > 0 ? (
          <InlineNotice tone="warning" title="Some sources are temporarily unavailable" className="mb-4">
            {result.degradedKinds.map((k) => kindMeta(k).chipLabel).join(', ')} couldn&apos;t be fetched for
            this page — the rest of the feed is unaffected.
          </InlineNotice>
        ) : null}
        <ActivityFeed items={result.items} now={new Date()} />
        {result.nextCursor ? (
          <div className="mt-4 flex justify-center">
            <Button asChild variant="secondary" size="sm">
              <Link href={loadMoreHref(current, result.nextCursor)}>Load more</Link>
            </Button>
          </div>
        ) : null}
      </>
    );
  }

  const kindChips: ActivityKindChip[] = [
    { key: 'all', label: 'All', href: kindChipHref(current, 'all'), selected: filters.type === null },
    ...ACTIVITY_KIND_META.map((m) => ({
      key: m.kind,
      label: m.chipLabel,
      href: kindChipHref(current, m.kind),
      selected: filters.type === m.kind,
    })),
  ];

  return (
    <div className="min-w-0 space-y-4">
      <div className="min-w-0">
        <h2 className="mb-2 border-b border-accent-600/25 pb-1.5 text-xs font-semibold uppercase tracking-widest text-warm-500">
          Today
        </h2>
        <PanelBoundary title="Today's activity" skeleton={STATS_SKELETON}>
          <StatsStrip />
        </PanelBoundary>
      </div>

      <Surface as="section" padding="sm" className="min-w-0 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ActivityKindFilterChips chips={kindChips} />
          <div className="min-w-0">
            <PanelBoundary title="Team filter" skeleton={TEAM_FILTER_SKELETON}>
              <TeamFilterAsync />
            </PanelBoundary>
          </div>
        </div>
      </Surface>

      <Surface as="section" padding="sm" className="min-w-0">
        <h2 className="mb-3 border-b border-accent-600/25 pb-1.5 text-xs font-semibold uppercase tracking-widest text-warm-500">
          Everything golf is doing
        </h2>
        <PanelBoundary title="Activity feed" skeleton={<SkeletonList rows={8} />}>
          <Feed />
        </PanelBoundary>
      </Surface>
    </div>
  );
}
