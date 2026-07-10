import Link from 'next/link';
import { AlertTriangle, Activity, SearchCheck, Users, ShieldCheck, RadioTower } from 'lucide-react';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchErrorsTab } from '@/lib/admin/data/errors';
import { fetchUsersTab, type RosterPlayerInsight, type TeamRosterInsight } from '@/lib/admin/data/users';
import { Surface, StatTile, StatusPill } from '@/components/fairway';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelNoData } from '../_components/PanelStates';
import { KpiTile } from '../_components/KpiTile';
import { TeamHealthTable } from '../_components/TeamHealthTable';
import { AutoRefresh } from '../_components/AutoRefresh';

export const dynamic = 'force-dynamic';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-b border-accent-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
      {children}
    </h2>
  );
}

// Dateline rule — replaces the retired border-l-2 "key panel" left-edge
// stripe. Chrome, not a status signal: a helm-green h-[2px] w-7 rounded-full
// rule above the card title.
function KeyPanelRule() {
  return <span aria-hidden className="mb-3 block h-[2px] w-7 rounded-full bg-accent-500" />;
}

function lastSeenLabel(value: string | null) {
  if (!value) return 'never';
  return new Date(value).toLocaleDateString();
}

function playerTone(player: RosterPlayerInsight): 'success' | 'warning' | 'danger' | 'neutral' {
  if (player.errors7d > 0 || player.profileQuality === 'missing') return 'danger';
  if (player.activity30d === 0 || player.profileQuality === 'partial') return 'warning';
  return 'success';
}

function TeamCommandCard({ team }: { team: TeamRosterInsight }) {
  const quiet = team.players.filter((player) => player.activity30d === 0).length;
  const profileGaps = team.players.filter((player) => player.profileQuality !== 'complete').length;
  const topPlayers = team.players.slice(0, 5);

  return (
    <Surface padding="sm" className="h-full">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <KeyPanelRule />
          <Link
            href={`/admin/users?team=${team.teamId}`}
            className="block truncate text-base font-semibold text-warm-900 underline-offset-2 hover:underline"
          >
            {team.name}
          </Link>
          <p className="mt-1 font-fw-mono text-xs text-warm-500">
            {team.playerCount} players · last {lastSeenLabel(team.lastActivity)}
          </p>
        </div>
        <StatusPill tone={team.errors7d > 0 || team.attentionPlayers > 0 ? 'warning' : 'success'} dot size="sm">
          {team.attentionPlayers > 0 ? `${team.attentionPlayers} watch` : 'clear'}
        </StatusPill>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <StatTile label="Active" value={team.activePlayers} tone="neutral" mono />
        <StatTile label="Quiet" value={quiet} tone="neutral" mono goodDirection="down" />
        <StatTile label="Profile gaps" value={profileGaps} tone="neutral" mono goodDirection="down" />
      </div>

      <div className="mt-4 divide-y divide-warm-200/60">
        {topPlayers.length === 0 ? (
          <PanelNoData label="No players attached" description="Roster rows appear once active memberships exist." />
        ) : (
          topPlayers.map((player) => (
            <div key={`${team.teamId}:${player.playerId}`} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                {player.href ? (
                  <Link href={player.href} className="truncate text-sm font-medium text-warm-900 hover:underline">
                    {player.name}
                  </Link>
                ) : (
                  <p className="truncate text-sm font-medium text-warm-900">{player.name}</p>
                )}
                <p className="truncate font-fw-mono text-xs text-warm-500">
                  {player.position ?? 'no position'} · {player.detail}
                </p>
              </div>
              <StatusPill tone={playerTone(player)} size="sm" dot>
                {player.errors7d > 0 ? `${player.errors7d} errors` : player.activity30d > 0 ? `${player.activity30d} signals` : 'quiet'}
              </StatusPill>
            </div>
          ))
        )}
      </div>
    </Surface>
  );
}

function PlayerWatchlist({ players }: { players: RosterPlayerInsight[] }) {
  return (
    <Surface padding="sm">
      <SectionLabel>Player-by-player watchlist</SectionLabel>
      <div className="mt-3 divide-y divide-warm-200/70">
        {players.length === 0 ? (
          <PanelNoData label="No player watch items" description="Baseball players with errors, quiet activity, or missing profiles appear here." />
        ) : (
          players.map((player) => (
            <div key={`${player.teamId}:${player.playerId}`} className="grid gap-3 py-3 2xl:grid-cols-[minmax(0,1fr)_120px_120px_120px] 2xl:items-center">
              <div className="min-w-0">
                {player.href ? (
                  <Link href={player.href} className="text-sm font-semibold text-warm-900 underline-offset-2 hover:underline">
                    {player.name}
                  </Link>
                ) : (
                  <p className="text-sm font-semibold text-warm-900">{player.name}</p>
                )}
                <p className="mt-1 truncate text-xs text-warm-500">
                  {player.email ?? 'no email'} · {player.position ?? 'no position'} · {player.detail}
                </p>
              </div>
              <span className="font-fw-mono text-xs tabular-nums text-warm-600">
                {player.activity30d} signals 30d
              </span>
              <span className="font-fw-mono text-xs tabular-nums text-warm-600">
                last {lastSeenLabel(player.lastActivity ?? player.lastSeen)}
              </span>
              <StatusPill tone={playerTone(player)} dot size="sm">
                {player.profileQuality}
              </StatusPill>
            </div>
          ))
        )}
      </div>
    </Surface>
  );
}

async function BaseballBody() {
  const [usersTab, errorsTab] = await Promise.all([
    fetchUsersTab({}),
    fetchErrorsTab({ sport: 'baseball', windowHours: 168 }),
  ]);

  const teams = usersTab.teams.filter((team) => team.sport === 'baseball');
  const players = teams.flatMap((team) => team.players);
  const activePlayers = players.filter((player) => player.activity30d > 0).length;
  const quietPlayers = players.filter((player) => player.activity30d === 0).length;
  const profileGaps = players.filter((player) => player.profileQuality !== 'complete').length;
  const teamsWithErrors = teams.filter((team) => team.errors7d > 0).length;
  const recentErrors = errorsTab.incidents.length;
  const mappedRoutes = errorsTab.incidents.filter((incident) => incident.route || incident.actionName || incident.feature).length;
  const watchlist = players
    .filter((player) => player.errors7d > 0 || player.activity30d === 0 || player.profileQuality !== 'complete')
    .sort((a, b) => {
      if (a.errors7d !== b.errors7d) return b.errors7d - a.errors7d;
      if (a.profileQuality !== b.profileQuality) return a.profileQuality === 'missing' ? -1 : 1;
      return a.activity30d - b.activity30d;
    })
    .slice(0, 12);
  const topTeams = [...teams]
    .sort((a, b) => {
      if (a.attentionPlayers !== b.attentionPlayers) return b.attentionPlayers - a.attentionPlayers;
      if (a.errors7d !== b.errors7d) return b.errors7d - a.errors7d;
      return b.playerCount - a.playerCount;
    })
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <Surface padding="sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <KeyPanelRule />
              <p className="text-xs font-semibold uppercase tracking-widest text-warm-500">Baseball command center</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-normal text-warm-900">
                Team-by-team, player-by-player visibility
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-warm-600">
                Baseball is now a real Helm Bridge operating view: roster posture, quiet players, profile gaps, and
                production errors are pulled from the same sources as Users, Errors, and Overview.
              </p>
            </div>
            <StatusPill tone={recentErrors > 0 || profileGaps > 0 ? 'warning' : 'success'} dot size="sm">
              {recentErrors > 0 ? 'watch errors' : 'launch ready'}
            </StatusPill>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiTile label="Teams" value={teams.length} href="/admin/users?sport=baseball" />
            <KpiTile label="Players" value={players.length} href="/admin/users?sport=baseball" />
            <KpiTile label="Active 30d" value={activePlayers} href="/admin/users?sport=baseball" />
            <KpiTile
              label="Errors 7d"
              value={recentErrors}
              href="/admin/errors?sport=baseball&window=168"
              tone={recentErrors > 0 ? 'warning' : 'neutral'}
              goodDirection="down"
            />
          </div>
        </Surface>

        <Surface padding="sm">
          <SectionLabel>Signal quality</SectionLabel>
          <div className="mt-3 space-y-3">
            {[
              { icon: Users, label: 'Quiet players', value: quietPlayers, href: '/admin/users?sport=baseball&attention=quiet' },
              { icon: SearchCheck, label: 'Profile gaps', value: profileGaps, href: '/admin/users?sport=baseball&attention=profile' },
              { icon: AlertTriangle, label: 'Teams with errors', value: teamsWithErrors, href: '/admin/errors?sport=baseball&window=168' },
              { icon: ShieldCheck, label: 'Mapped incidents', value: `${mappedRoutes}/${recentErrors}`, href: '/admin/errors?sport=baseball&window=168' },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex items-center justify-between gap-3 rounded-fw-md border border-warm-200 bg-surface-sunken px-3 py-2 transition-colors hover:bg-surface"
                >
                  <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-warm-800">
                    <Icon size={15} className="text-accent-600" aria-hidden />
                    {item.label}
                  </span>
                  <span className="font-fw-mono text-sm font-semibold tabular-nums text-warm-900">{item.value}</span>
                </Link>
              );
            })}
          </div>
        </Surface>
      </section>

      <Surface padding="sm">
        <SectionLabel>Team command map</SectionLabel>
        <div className="mt-3">
          {teams.length === 0 ? (
            <PanelNoData label="No baseball teams yet" description="Teams appear here once a coach creates one." />
          ) : (
            <TeamHealthTable teams={teams.map((team) => ({ ...team, href: `/admin/users?team=${team.teamId}` }))} />
          )}
        </div>
      </Surface>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid gap-4 lg:grid-cols-2">
          {topTeams.length === 0 ? (
            <Surface padding="sm">
              <PanelNoData label="No team cards yet" description="Team cards appear when baseball teams have roster membership." />
            </Surface>
          ) : (
            topTeams.map((team) => <TeamCommandCard key={team.teamId} team={team} />)
          )}
        </div>

        <div className="space-y-4">
          <PlayerWatchlist players={watchlist} />
          <Surface padding="sm">
            <SectionLabel>Error trace hooks</SectionLabel>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <StatTile label="Incidents 7d" value={recentErrors} tone="neutral" mono goodDirection="down" />
              <StatTile label="RLS denials 24h" value={errorsTab.rlsDenials24h} tone="neutral" mono goodDirection="down" />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/admin/errors?sport=baseball&window=168"
                className="inline-flex items-center gap-2 rounded-full border border-warm-200 bg-surface-sunken px-3 py-1.5 text-xs font-medium text-warm-800 hover:bg-surface"
              >
                <RadioTower size={14} aria-hidden />
                Open baseball errors
              </Link>
              <Link
                href="/admin/users?sport=baseball&attention=watch"
                className="inline-flex items-center gap-2 rounded-full border border-warm-200 bg-surface-sunken px-3 py-1.5 text-xs font-medium text-warm-800 hover:bg-surface"
              >
                <Activity size={14} aria-hidden />
                Open launch watchlist
              </Link>
            </div>
          </Surface>
        </div>
      </section>
    </div>
  );
}

export default async function BaseballTabPage() {
  await requireSuperAdmin();
  return (
    <div className="space-y-6">
      <AutoRefresh />
      <PanelBoundary title="Baseball">
        <BaseballBody />
      </PanelBoundary>
    </div>
  );
}
