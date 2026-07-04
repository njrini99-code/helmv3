import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchUsersTab, type RosterPlayerInsight, type TeamRosterInsight } from '@/lib/admin/data/users';
import { Surface, StatTile, StatusPill, SearchField, Button, type FwStatusTone } from '@/components/fairway';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelAllClear, PanelNoData } from '../_components/PanelStates';
import { SportBadge } from '../_components/SportBadge';
import { AutoRefresh } from '../_components/AutoRefresh';

export const dynamic = 'force-dynamic';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-b border-accent-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
      {children}
    </h2>
  );
}

const HEALTH_TONE: Record<TeamRosterInsight['health'], FwStatusTone> = {
  active: 'success',
  cooling: 'warning',
  dormant: 'danger',
};

const PROFILE_TONE: Record<RosterPlayerInsight['profileQuality'], FwStatusTone> = {
  complete: 'success',
  partial: 'warning',
  missing: 'danger',
};

function shortDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString() : 'never';
}

function ActivityBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(8, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-warm-200" aria-hidden>
      <div className="h-full rounded-full bg-accent-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

function TeamRosterPanel({ team }: { team: TeamRosterInsight }) {
  const maxActivity = team.players.reduce((max, player) => Math.max(max, player.activity30d), 0);
  const topPlayers = team.players.slice(0, 8);
  const teamHref = team.sport === 'golf' ? `/admin/teams/${team.teamId}` : `/admin/users?team=${team.teamId}`;

  return (
    <details className="group border-b border-warm-200/70 py-4" open={team.attentionPlayers > 0 || team.health !== 'active'}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-full md:basis-auto">
          <div className="flex flex-wrap items-center gap-2">
            <SportBadge sport={team.sport} />
            <Link href={teamHref} className="truncate font-semibold text-warm-900 hover:underline">
              {team.name}
            </Link>
            <StatusPill tone={HEALTH_TONE[team.health]} dot size="sm">
              {team.health}
            </StatusPill>
          </div>
          <p className="mt-1 font-fw-mono text-xs tabular-nums text-warm-500">
            last activity {shortDate(team.lastActivity)} · {team.playerCount} rostered · {team.errors7d} errors 7d
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-right">
          <span className="rounded-fw-md bg-surface-sunken px-3 py-2">
            <span className="block font-fw-mono text-sm font-bold tabular-nums text-warm-900">
              {team.activePlayers}/{team.players.length}
            </span>
            <span className="text-eyebrow uppercase tracking-widest text-warm-500">active</span>
          </span>
          <span className="rounded-fw-md bg-surface-sunken px-3 py-2">
            <span className="block font-fw-mono text-sm font-bold tabular-nums text-fw-danger">
              {team.attentionPlayers}
            </span>
            <span className="text-eyebrow uppercase tracking-widest text-warm-500">watch</span>
          </span>
          <span className="rounded-fw-md bg-surface-sunken px-3 py-2">
            <span className="block font-fw-mono text-sm font-bold tabular-nums text-warm-900">{team.profileGaps}</span>
            <span className="text-eyebrow uppercase tracking-widest text-warm-500">gaps</span>
          </span>
        </div>
      </summary>

      <div className="mt-4 overflow-x-auto">
        {topPlayers.length === 0 ? (
          <PanelNoData label="No roster rows" description="This team exists, but no active players are attached." />
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-accent-600/25 text-left text-xs uppercase tracking-widest text-warm-500">
                <th className="sticky left-0 z-10 bg-surface py-2 pr-3">Player</th>
                <th className="px-3">Roster</th>
                <th className="px-3">Activity 30d</th>
                <th className="px-3">Last signal</th>
                <th className="px-3">Profile</th>
                <th className="px-3">Errors</th>
                <th className="px-3">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-200/60">
              {topPlayers.map((player) => (
                <tr key={`${player.sport}:${player.playerId}`}>
                  <td className="sticky left-0 z-10 bg-surface py-2 pr-3">
                    {player.href ? (
                      <Link href={player.href} className="font-medium text-warm-900 hover:underline">
                        {player.name}
                      </Link>
                    ) : (
                      <span className="font-medium text-warm-900">{player.name}</span>
                    )}
                    <span className="block truncate text-xs text-warm-500">{player.email ?? 'no email'}</span>
                  </td>
                  <td className="px-3 font-fw-mono text-xs tabular-nums text-warm-600">
                    {player.jerseyNumber ? `#${player.jerseyNumber}` : 'no #'}
                    {player.position ? ` · ${player.position}` : ''}
                  </td>
                  <td className="px-3">
                    <div className="flex items-center gap-2">
                      <span className="font-fw-mono font-semibold tabular-nums text-warm-900">
                        {player.activity30d}
                      </span>
                      <ActivityBar value={player.activity30d} max={maxActivity} />
                    </div>
                  </td>
                  <td className="px-3 font-fw-mono text-xs tabular-nums text-warm-500">
                    {shortDate(player.lastActivity ?? player.lastSeen)}
                  </td>
                  <td className="px-3">
                    <StatusPill tone={PROFILE_TONE[player.profileQuality]} dot={player.profileQuality !== 'complete'} size="sm">
                      {player.profileQuality}
                    </StatusPill>
                  </td>
                  <td className="px-3 font-fw-mono font-semibold tabular-nums text-fw-danger">{player.errors7d}</td>
                  <td className="px-3 text-xs text-warm-600">{player.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {team.players.length > topPlayers.length ? (
          <p className="mt-2 text-xs text-warm-500">
            Showing the first {topPlayers.length} players by errors, activity, then name. Use the team filter for the full roster.
          </p>
        ) : null}
      </div>
    </details>
  );
}

function RosterIntelligence({ teams }: { teams: TeamRosterInsight[] }) {
  const players = teams.flatMap((team) => team.players);
  const watchlist = players
    .filter((player) => player.errors7d > 0 || player.activity30d === 0 || player.profileQuality === 'missing')
    .sort((a, b) => {
      if (a.errors7d !== b.errors7d) return b.errors7d - a.errors7d;
      if (a.profileQuality !== b.profileQuality) return a.profileQuality === 'missing' ? -1 : 1;
      return a.activity30d - b.activity30d;
    })
    .slice(0, 8);
  const golfTeams = teams.filter((team) => team.sport === 'golf').length;
  const baseballTeams = teams.filter((team) => team.sport === 'baseball').length;
  const teamsWithErrors = teams.filter((team) => team.errors7d > 0).length;
  const inactivePlayers = players.filter((player) => player.activity30d === 0).length;
  const profileGaps = players.filter((player) => player.profileQuality !== 'complete').length;

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile label="Teams mapped" value={teams.length} tone="neutral" mono />
        <StatTile label="Players mapped" value={players.length} tone="neutral" mono />
        <StatTile label="Teams with errors" value={teamsWithErrors} tone="neutral" mono />
        <StatTile label="Quiet players" value={inactivePlayers} tone="neutral" mono />
        <StatTile label="Profile gaps" value={profileGaps} tone="neutral" mono />
      </section>

      <Surface padding="sm">
        <SectionLabel>Roster command map</SectionLabel>
        <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <div className="mb-3 flex flex-wrap gap-2 text-xs text-warm-600">
              <StatusPill tone="accent" size="sm">{golfTeams} GolfHelm teams</StatusPill>
              <StatusPill tone="accent" size="sm">{baseballTeams} BaseballHelm teams</StatusPill>
              <StatusPill tone="neutral" size="sm">sorted by team attention</StatusPill>
            </div>
            <div className="divide-y divide-warm-200/70">
              {teams.length === 0 ? (
                <PanelNoData label="No teams yet" description="Teams appear here once a coach creates one." />
              ) : (
                [...teams]
                  .sort((a, b) => {
                    if (a.attentionPlayers !== b.attentionPlayers) return b.attentionPlayers - a.attentionPlayers;
                    if (a.errors7d !== b.errors7d) return b.errors7d - a.errors7d;
                    return a.name.localeCompare(b.name);
                  })
                  .map((team) => <TeamRosterPanel key={`${team.sport}:${team.teamId}`} team={team} />)
              )}
            </div>
          </div>

          <aside className="min-w-0">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-warm-500">Player watchlist</h3>
            {watchlist.length === 0 ? (
              <div className="mt-3">
                <PanelAllClear label="No player-level watch items" checkedAt={new Date().toISOString()} />
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-warm-200/70">
                {watchlist.map((player) => (
                  <li key={`${player.sport}:${player.playerId}`} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <SportBadge sport={player.sport} />
                          {player.href ? (
                            <Link href={player.href} className="truncate font-medium text-warm-900 hover:underline">
                              {player.name}
                            </Link>
                          ) : (
                            <span className="truncate font-medium text-warm-900">{player.name}</span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-warm-500">
                          {player.activity30d === 0 ? 'No recent player signals' : `${player.activity30d} signals 30d`}
                          {player.profileQuality === 'missing' ? ' · missing profile' : ''}
                        </p>
                      </div>
                      {player.errors7d > 0 ? (
                        <StatusPill tone="danger" dot size="sm">
                          {player.errors7d} errors
                        </StatusPill>
                      ) : (
                        <StatusPill tone={PROFILE_TONE[player.profileQuality]} dot={player.profileQuality !== 'complete'} size="sm">
                          {player.profileQuality}
                        </StatusPill>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      </Surface>
    </div>
  );
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSuperAdmin();
  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q : undefined;
  const role = typeof params.role === 'string' ? params.role : undefined;
  const team = typeof params.team === 'string' ? params.team : undefined;

  async function Body() {
    const tab = await fetchUsersTab({ q, role, team });
    const golfCount = tab.users.filter((u) => u.sports.includes('golf')).length;
    const baseballCount = tab.users.filter((u) => u.sports.includes('baseball')).length;

    return (
      <div className="space-y-6">
        <form method="get" className="flex flex-wrap items-center gap-2">
          <SearchField
            name="q"
            defaultValue={q ?? ''}
            placeholder="Search email…"
            aria-label="Search users by email"
            wrapperClassName="max-w-xs"
          />
          <Button type="submit" variant="secondary" size="sm">
            Search
          </Button>
          {q || role || team ? (
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/users">Clear filters</Link>
            </Button>
          ) : null}
          {team ? (
            <span className="font-fw-mono text-xs text-warm-500">filtered to team {team}</span>
          ) : null}
        </form>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Total users" value={tab.users.length} tone="neutral" mono />
          <StatTile label="Golf" value={golfCount} tone="neutral" mono />
          <StatTile label="Baseball" value={baseballCount} tone="neutral" mono />
          <StatTile label="At-risk" value={tab.atRisk.length} tone="neutral" mono goodDirection="down" />
        </section>

        <RosterIntelligence teams={tab.teams} />

        <Surface padding="sm">
          <SectionLabel>Users ({tab.users.length})</SectionLabel>
          <div className="mt-3">
            {tab.users.length === 0 ? (
              <PanelNoData
                label="No users match"
                description="Try a different search, or clear filters to see everyone."
              />
            ) : (
              <ul className="divide-y divide-warm-200/60">
                {tab.users.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="min-w-0 flex-1 basis-full truncate font-medium text-warm-900 hover:underline sm:basis-auto"
                    >
                      {u.email}
                    </Link>
                    <span className="text-xs uppercase text-warm-500">{u.role}</span>
                    <div className="flex gap-1">
                      {u.sports.map((s) => (
                        <SportBadge key={s} sport={s} />
                      ))}
                    </div>
                    <span className="font-fw-mono text-xs tabular-nums text-warm-500">
                      {u.lastSeen ? `seen ${new Date(u.lastSeen).toLocaleDateString()}` : 'never seen'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Surface>

        <Surface padding="sm" className="border-fw-warning/40">
          <SectionLabel>At-risk accounts ({tab.atRisk.length})</SectionLabel>
          <div className="mt-3">
            {tab.atRisk.length === 0 ? (
              <PanelAllClear label="No at-risk accounts" checkedAt={new Date().toISOString()} />
            ) : (
              <ul className="divide-y divide-warm-200/60">
                {tab.atRisk.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                    <StatusPill tone="warning" dot size="sm">
                      {u.lastSeen ? 'at-risk' : 'never seen'}
                    </StatusPill>
                    <Link href={`/admin/users/${u.id}`} className="min-w-0 flex-1 basis-full truncate text-warm-900 hover:underline sm:basis-auto">
                      {u.email}
                    </Link>
                    {/* CRM boundary: link OUT only — zero email capability here. */}
                    <a href="/golf/admin/crm" className="text-xs text-accent-700 underline">
                      Open in CRM →
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Surface>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={60_000} />
      <PanelBoundary title="Users & Teams">
        <Body />
      </PanelBoundary>
    </div>
  );
}
