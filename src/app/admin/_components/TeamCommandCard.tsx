import Link from 'next/link';
import { Surface, StatTile, StatusPill } from '@/components/fairway';
import { PanelNoData } from './PanelStates';
import { LocalTime } from './LocalTime';
import type { TeamRosterInsight } from '@/lib/admin/data/users';
import { playerTone } from './player-tone';

// Dateline rule — replaces the retired border-l-2 "key panel" left-edge
// stripe. Chrome, not a status signal: a helm-green h-[2px] w-7 rounded-full
// rule above the card title.
function KeyPanelRule() {
  return <span aria-hidden className="mb-3 block h-[2px] w-7 rounded-full bg-accent-500" />;
}

/**
 * Sport-agnostic per-team command card — a mosaic of roster/quiet/profile-gap
 * stats plus the team's top-5 player rows, each linking to the player's
 * account. Shared between /admin/baseball (its own local copy predates this
 * extraction) and /admin/golf (bridge-tab-audit-p0p1 golf Finding 2 — golf
 * had no per-team drill-down at all). New callers should import from here
 * rather than re-declaring a local copy.
 *
 * Timestamps go through `<LocalTime>` (never raw `toLocaleDateString()`) —
 * see LocalTime.tsx's doc comment for the incident this avoids.
 */
export function TeamCommandCard({ team, teamHref }: { team: TeamRosterInsight; teamHref: string }) {
  const quiet = team.players.filter((player) => player.activity30d === 0).length;
  const profileGaps = team.players.filter((player) => player.profileQuality !== 'complete').length;
  const topPlayers = team.players.slice(0, 5);

  return (
    <Surface padding="sm" className="h-full">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <KeyPanelRule />
          <Link
            href={teamHref}
            className="block truncate text-base font-semibold text-warm-900 underline-offset-2 hover:underline"
          >
            {team.name}
          </Link>
          <p className="mt-1 font-fw-mono text-xs text-warm-500">
            {team.playerCount} players · last{' '}
            {team.lastActivity ? <LocalTime iso={team.lastActivity} variant="date" fallback="never" /> : 'never'}
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
