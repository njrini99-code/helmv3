import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchUsersTab, USER_ROLES, type RosterPlayerInsight, type TeamRosterInsight } from '@/lib/admin/data/users';
import { Surface, Inset, StatTile, StatStrip, StatusPill, SearchField, Button, type FwStatusTone } from '@/components/fairway';
import { FairwayLargeTitle } from '@/components/fairway/app-shell';
import { cn } from '@/lib/utils';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelPageSkeleton } from '../_components/PanelSkeletons';
import { PanelAllClear, PanelNoData } from '../_components/PanelStates';
import { SportBadge } from '../_components/SportBadge';
import { AutoRefresh } from '../_components/AutoRefresh';
import { LocalTime } from '../_components/LocalTime';
import { UserRoleFilterChips, type RoleChip } from './UserRoleFilterChips';

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

/** Viewer-local date, matching the fix elsewhere in Bridge (LocalTime.tsx's
 *  doc comment — a raw `toLocaleDateString()` call inside a Server Component
 *  bakes the SERVER's (UTC) timezone into the SSR HTML for every viewer). */
function LastActivityDate({ iso }: { iso: string | null }) {
  return iso ? <LocalTime iso={iso} variant="date" fallback="never" /> : <>never</>;
}

function ActivityBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(8, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-warm-200" aria-hidden>
      <div className="h-full rounded-full bg-accent-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

function TeamRosterPanel({ team, activeTeamId }: { team: TeamRosterInsight; activeTeamId?: string }) {
  const maxActivity = team.players.reduce((max, player) => Math.max(max, player.activity30d), 0);
  // The "?team=<id>" filter is the promised escape hatch for teams with more
  // than 8 players (see the hint text below) — honor that promise by
  // lifting the slice for the team the URL is actually scoped to, instead of
  // capping every team's roster unconditionally regardless of the filter.
  const isFocused = Boolean(activeTeamId) && activeTeamId === team.teamId;
  const topPlayers = isFocused ? team.players : team.players.slice(0, 8);
  const teamHref = team.sport === 'golf' ? `/admin/teams/${team.teamId}` : `/admin/users?team=${team.teamId}`;

  return (
    <details
      className="group border-b border-warm-200/70 py-4"
      open={isFocused || team.attentionPlayers > 0 || team.health !== 'active'}
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-full md:basis-auto">
          <div className="flex flex-wrap items-center gap-2">
            <SportBadge sport={team.sport} />
            {/* min-w-0 on the Link — it's a flex item of this row alongside
                the badge/pill; without it, truncate never engages for a
                long team name (default flex min-width:auto pins it to its
                full content width). */}
            <Link href={teamHref} className="min-w-0 truncate font-semibold text-warm-900 hover:underline">
              {team.name}
            </Link>
            <StatusPill tone={HEALTH_TONE[team.health]} dot size="sm">
              {team.health}
            </StatusPill>
          </div>
          <p className="mt-1 font-fw-mono text-xs tabular-nums text-warm-500">
            last activity <LastActivityDate iso={team.lastActivity} /> · {team.playerCount} rostered · {team.errors7d} errors 7d
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
            <span className="block font-fw-mono text-sm font-bold tabular-nums text-fw-danger-ink">
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

      <div className="mt-4">
        {topPlayers.length === 0 ? (
          <PanelNoData label="No roster rows" description="This team exists, but no active players are attached." />
        ) : (
          <>
            {/* Phone (doctrine rule 8): identity + key-stat CARDS, not a
                min-w table inside overflow-x-auto — that's a phone-scroll
                surface, not the doctrine treatment, on a reading surface
                this dense. Whole row is the tap-through when a detail page
                exists (ActivityFeed's "EVERYTHING CLICKS" convention). */}
            <ul className="space-y-2 md:hidden">
              {topPlayers.map((player) => {
                const meta = [
                  player.jerseyNumber ? `#${player.jerseyNumber}` : 'no #',
                  player.position,
                  player.detail,
                ]
                  .filter(Boolean)
                  .join(' · ');
                const rowContent = (
                  <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-warm-900">{player.name}</p>
                      <p className="mt-0.5 break-words text-xs text-warm-500">{player.email ?? 'no email'}</p>
                      <p className="mt-1.5 font-fw-mono text-xs tabular-nums text-warm-500">{meta}</p>
                      <p className="mt-0.5 text-xs text-warm-400">
                        last signal <LastActivityDate iso={player.lastActivity ?? player.lastSeen} />
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <StatusPill
                        tone={PROFILE_TONE[player.profileQuality]}
                        dot={player.profileQuality !== 'complete'}
                        size="sm"
                      >
                        {player.profileQuality}
                      </StatusPill>
                      <div className="flex items-center gap-1.5">
                        <span className="font-fw-mono text-sm font-semibold tabular-nums text-warm-900">
                          {player.activity30d}
                        </span>
                        <ActivityBar value={player.activity30d} max={maxActivity} />
                      </div>
                      {player.errors7d > 0 ? (
                        <span className="font-fw-mono text-xs font-semibold tabular-nums text-fw-danger-ink">
                          {player.errors7d} errors
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
                return (
                  <li key={`card:${player.sport}:${player.playerId}`}>
                    {player.href ? (
                      <Inset
                        as={Link}
                        href={player.href}
                        padding="sm"
                        className={cn(
                          'flex items-start gap-2 transition-colors hover:bg-surface',
                          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500',
                        )}
                      >
                        {rowContent}
                        <ChevronRight size={16} className="mt-1 shrink-0 text-warm-300" aria-hidden />
                      </Inset>
                    ) : (
                      <Inset padding="sm">{rowContent}</Inset>
                    )}
                  </li>
                );
              })}
            </ul>

            {/* Tablet/desktop: dense table, contained to its own scroller. */}
            <div className="hidden overflow-x-auto md:block">
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
                        <LastActivityDate iso={player.lastActivity ?? player.lastSeen} />
                      </td>
                      <td className="px-3">
                        <StatusPill tone={PROFILE_TONE[player.profileQuality]} dot={player.profileQuality !== 'complete'} size="sm">
                          {player.profileQuality}
                        </StatusPill>
                      </td>
                      <td className="px-3 font-fw-mono font-semibold tabular-nums text-fw-danger-ink">{player.errors7d}</td>
                      <td className="px-3 text-xs text-warm-600">{player.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {!isFocused && team.players.length > topPlayers.length ? (
          <p className="mt-2 text-xs text-warm-500">
            Showing the first {topPlayers.length} players by errors, activity, then name.{' '}
            <Link href={`/admin/users?team=${team.teamId}`} className="underline hover:text-warm-700">
              Use the team filter for the full roster.
            </Link>
          </p>
        ) : null}
      </div>
    </details>
  );
}

function RosterIntelligence({
  teams,
  sport,
  attention,
  activeTeamId,
}: {
  teams: TeamRosterInsight[];
  sport?: 'golf' | 'baseball';
  attention?: 'watch' | 'profile' | 'quiet' | 'demo';
  activeTeamId?: string;
}) {
  const filteredTeams = teams
    .filter((team) => !sport || team.sport === sport)
    .filter((team) => {
      if (attention === 'watch') return team.attentionPlayers > 0 || team.errors7d > 0;
      if (attention === 'profile') return team.profileGaps > 0;
      if (attention === 'quiet') return team.players.some((player) => player.activity30d === 0);
      if (attention === 'demo') {
        const teamText = team.name.toLowerCase();
        return teamText.includes('demo') || team.players.some((player) => `${player.name} ${player.email ?? ''}`.toLowerCase().includes('demo'));
      }
      return true;
    });
  const players = filteredTeams.flatMap((team) => team.players);
  const watchlist = players
    .filter((player) => player.errors7d > 0 || player.activity30d === 0 || player.profileQuality === 'missing')
    .sort((a, b) => {
      if (a.errors7d !== b.errors7d) return b.errors7d - a.errors7d;
      if (a.profileQuality !== b.profileQuality) return a.profileQuality === 'missing' ? -1 : 1;
      return a.activity30d - b.activity30d;
    })
    .slice(0, 8);
  const golfTeams = filteredTeams.filter((team) => team.sport === 'golf').length;
  const baseballTeams = filteredTeams.filter((team) => team.sport === 'baseball').length;
  const teamsWithErrors = filteredTeams.filter((team) => team.errors7d > 0).length;
  const inactivePlayers = players.filter((player) => player.activity30d === 0).length;
  const profileGaps = players.filter((player) => player.profileQuality !== 'complete').length;

  return (
    <div className="space-y-4">
      {/* StatStrip, not a hand-rolled grid — 5 peers on phone is exactly the
          "ragged trailing cell" case (rows of 2/2/1) the primitive exists to
          avoid (MOBILE_DOCTRINE rules 3 + 11); phone gets one snap-rail,
          desktop keeps the original md:grid-cols-5. */}
      <StatStrip count={5} mdColumns={5} ariaLabel="Roster overview KPIs">
        <StatTile label="Teams mapped" value={teams.length} tone="neutral" mono />
        <StatTile label="Players mapped" value={players.length} tone="neutral" mono />
        <StatTile label="Teams with errors" value={teamsWithErrors} tone="neutral" mono />
        <StatTile label="Quiet players" value={inactivePlayers} tone="neutral" mono />
        <StatTile label="Profile gaps" value={profileGaps} tone="neutral" mono />
      </StatStrip>

      <Surface padding="sm">
        <SectionLabel>Roster command map</SectionLabel>
        <div className="mt-3 flex flex-wrap gap-2">
          {([
            ['/admin/users', 'All rosters'],
            ['/admin/users?sport=baseball', 'Baseball'],
            ['/admin/users?sport=golf', 'Golf'],
            ['/admin/users?attention=watch', 'Watch items'],
            ['/admin/users?attention=profile', 'Profile gaps'],
            ['/admin/users?attention=quiet', 'Quiet players'],
            ['/admin/users?attention=demo', 'Demo readiness'],
          ] as const).map(([href, label]) => (
            <Button key={href} asChild variant="secondary" size="sm">
              <Link href={href}>{label}</Link>
            </Button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap gap-2 text-xs text-warm-600">
              <StatusPill tone="accent" size="sm">{golfTeams} GolfHelm teams</StatusPill>
              <StatusPill tone="accent" size="sm">{baseballTeams} BaseballHelm teams</StatusPill>
              <StatusPill tone="neutral" size="sm">sorted by team attention</StatusPill>
            </div>
            <div className="divide-y divide-warm-200/70">
              {filteredTeams.length === 0 ? (
                <PanelNoData label="No matching teams" description="Clear the roster filters or choose another command view." />
              ) : (
                [...filteredTeams]
                  .sort((a, b) => {
                    if (a.attentionPlayers !== b.attentionPlayers) return b.attentionPlayers - a.attentionPlayers;
                    if (a.errors7d !== b.errors7d) return b.errors7d - a.errors7d;
                    return a.name.localeCompare(b.name);
                  })
                  .map((team) => (
                    <TeamRosterPanel key={`${team.sport}:${team.teamId}`} team={team} activeTeamId={activeTeamId} />
                  ))
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
                          {/* min-w-0 — flex item of this row alongside the
                              badge; without it truncate never engages for a
                              long player name (see TeamRosterPanel's
                              matching fix above). */}
                          {player.href ? (
                            <Link href={player.href} className="min-w-0 truncate font-medium text-warm-900 hover:underline">
                              {player.name}
                            </Link>
                          ) : (
                            <span className="min-w-0 truncate font-medium text-warm-900">{player.name}</span>
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
  const sport = params.sport === 'golf' || params.sport === 'baseball' ? params.sport : undefined;
  const attention =
    params.attention === 'watch' ||
    params.attention === 'profile' ||
    params.attention === 'quiet' ||
    params.attention === 'demo'
      ? params.attention
      : undefined;

  // Role chips preserve every OTHER active filter (q/team/sport/attention)
  // while toggling `role` — a bare `?role=coach` link would silently drop
  // whatever else the operator had already narrowed down to.
  function roleChipHref(nextRole: string | null): string {
    const sp = new URLSearchParams();
    if (q) sp.set('q', q);
    if (nextRole) sp.set('role', nextRole);
    if (team) sp.set('team', team);
    if (sport) sp.set('sport', sport);
    if (attention) sp.set('attention', attention);
    const qs = sp.toString();
    return qs ? `/admin/users?${qs}` : '/admin/users';
  }
  const roleChips: RoleChip[] = [
    { key: 'all', label: 'All roles', href: roleChipHref(null), selected: !role },
    ...USER_ROLES.map((r) => ({ key: r, label: r, href: roleChipHref(r), selected: role === r })),
  ];

  async function Body() {
    const tab = await fetchUsersTab({ q, role, team });
    const golfCount = tab.users.filter((u) => u.sports.includes('golf')).length;
    const baseballCount = tab.users.filter((u) => u.sports.includes('baseball')).length;

    return (
      <div className="space-y-6">
        <FairwayLargeTitle
          title="Users & Teams"
          eyebrow="Platform"
          meta={`${tab.totalUsersCount} accounts · ${tab.teams.length} teams`}
        />
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
          {q || role || team || sport || attention ? (
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/users">Clear filters</Link>
            </Button>
          ) : null}
          {team ? (
            <span className="font-fw-mono text-xs text-warm-500">filtered to team {team}</span>
          ) : null}
          {sport ? (
            <span className="font-fw-mono text-xs text-warm-500">sport {sport}</span>
          ) : null}
          {attention ? (
            <span className="font-fw-mono text-xs text-warm-500">view {attention}</span>
          ) : null}
        </form>

        <UserRoleFilterChips chips={roleChips} />

        <StatStrip count={4} mdColumns={4} ariaLabel="User directory KPIs">
          <StatTile label="Total users" value={tab.totalUsersCount} tone="neutral" mono />
          <StatTile label="Golf" value={golfCount} tone="neutral" mono />
          <StatTile label="Baseball" value={baseballCount} tone="neutral" mono />
          <StatTile label="At-risk" value={tab.atRisk.length} tone="neutral" mono goodDirection="down" />
        </StatStrip>
        {tab.totalUsersCount > tab.users.length ? (
          <p className="text-xs text-warm-500">
            Showing the {tab.users.length} most recently seen users (capped view — {tab.totalUsersCount} total match
            this filter). Golf/Baseball/At-risk counts reflect only this capped set.
          </p>
        ) : null}

        <RosterIntelligence teams={tab.teams} sport={sport} attention={attention} activeTeamId={team} />

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
                      {u.lastSeen ? <>seen <LocalTime iso={u.lastSeen} variant="date" fallback="never" /></> : 'never seen'}
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
      <PanelBoundary title="Users & Teams" skeleton={<PanelPageSkeleton rows={8} />}>
        <Body />
      </PanelBoundary>
    </div>
  );
}
