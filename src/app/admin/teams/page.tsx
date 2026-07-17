import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchPulseGrid, PULSE_SORTS, type PulseSort, type PulseTeamRow } from '@/lib/admin/data/pulse-grid';
import { Surface, StatusPill, EkgSparkline } from '@/components/fairway';
import { cn } from '@/lib/utils';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelNoData } from '../_components/PanelStates';
import { AutoRefresh } from '../_components/AutoRefresh';
import { LocalTime } from '../_components/LocalTime';
import { TeamsSortChips } from './TeamsSortChips';

export const dynamic = 'force-dynamic';

const SORT_LABEL: Record<PulseSort, string> = {
  attention: 'Needs attention',
  'last-seen': 'Last seen',
  'most-active': 'Most active',
  'most-errors': 'Most errors',
};

const HALO_TONE = { fresh: 'success', cooling: 'neutral', silent: 'danger' } as const;
const HALO_LABEL = { fresh: 'active', cooling: 'cooling', silent: 'silent' } as const;

function parseSort(value: string | string[] | undefined): PulseSort {
  const raw = Array.isArray(value) ? value[0] : value;
  return (PULSE_SORTS as readonly string[]).includes(raw ?? '') ? (raw as PulseSort) : 'attention';
}

function sortHref(sort: PulseSort): string {
  return sort === 'attention' ? '/admin/teams' : `/admin/teams?sort=${sort}`;
}

function TeamRow({ team }: { team: PulseTeamRow }) {
  return (
    <Link
      href={team.threadHref}
      className="flex items-center gap-3 rounded-fw-md px-2 py-3 transition-colors hover:bg-surface-sunken"
    >
      <div className="min-w-0 flex-1 basis-[45%]">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-warm-900">{team.name}</p>
          <StatusPill tone={HALO_TONE[team.halo]} dot size="sm" className="shrink-0">
            {HALO_LABEL[team.halo]}
          </StatusPill>
        </div>
        <p className="mt-1 font-fw-mono text-xs tabular-nums text-warm-500">
          {team.sport} · {team.playerCount} roster ·{' '}
          {team.lastActivityDate ? (
            <>last <LocalTime iso={`${team.lastActivityDate}T12:00:00Z`} variant="date" /></>
          ) : (
            'no activity in 30d'
          )}
          {team.errors30d > 0 ? (
            <span className={cn('ml-2 font-semibold', team.criticalErrors30d > 0 ? 'text-fw-danger' : 'text-warm-700')}>
              {team.errors30d} errors
            </span>
          ) : null}
        </p>
      </div>
      <div className="hidden shrink-0 sm:block">
        <EkgSparkline buckets={team.buckets} halo={team.halo} label={team.name} width={220} height={30} />
      </div>
      <div className="shrink-0 sm:hidden">
        <EkgSparkline buckets={team.buckets} halo={team.halo} label={team.name} width={110} height={28} />
      </div>
    </Link>
  );
}

async function Body({ sort }: { sort: PulseSort }) {
  const grid = await fetchPulseGrid(sort);
  const silentCount = grid.teams.filter((t) => t.halo === 'silent').length;
  const criticalCount = grid.teams.filter((t) => t.criticalErrors30d > 0).length;

  return (
    <div className="space-y-4">
      <Surface padding="sm">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-eyebrow uppercase text-warm-500">teams</p>
            <p className="font-fw-mono text-h2 tabular-nums text-warm-900">{grid.teams.length}</p>
          </div>
          <div>
            <p className="text-eyebrow uppercase text-warm-500">silent 14d+</p>
            <p className="font-fw-mono text-h2 tabular-nums text-warm-900">{silentCount}</p>
          </div>
          <div>
            <p className="text-eyebrow uppercase text-warm-500">critical errors</p>
            <p className={cn('font-fw-mono text-h2 tabular-nums', criticalCount > 0 ? 'text-fw-danger' : 'text-warm-900')}>
              {criticalCount}
            </p>
          </div>
        </div>
        <p className="mt-3 border-t border-warm-200 pt-3 text-caption text-warm-500">{grid.degradedNote}</p>
      </Surface>

      <Surface padding="sm">
        {grid.teams.length === 0 ? (
          <PanelNoData label="No teams yet" description="Golf and baseball teams appear here once created." />
        ) : (
          <div className="divide-y divide-warm-200/60">
            {grid.teams.map((team) => (
              <TeamRow key={team.teamId} team={team} />
            ))}
          </div>
        )}
      </Surface>
    </div>
  );
}

export default async function TeamsPulsePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSuperAdmin();
  const params = await searchParams;
  const sort = parseSort(params.sort);

  return (
    <div className="space-y-4">
      <AutoRefresh intervalMs={60_000} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div data-fw-title-anchor>
          <h1 className="text-h3 font-semibold text-warm-900">Teams pulse</h1>
          <p className="text-body-sm text-warm-500">
            Every team, one 30-day heartbeat — quiet and spiking teams float to the top. Click a row for its full Thread.
          </p>
        </div>
        <TeamsSortChips
          chips={PULSE_SORTS.map((s) => ({
            key: s,
            label: SORT_LABEL[s],
            href: sortHref(s),
            selected: sort === s,
          }))}
        />
      </div>
      <PanelBoundary title="Teams pulse">
        <Body sort={sort} />
      </PanelBoundary>
    </div>
  );
}
