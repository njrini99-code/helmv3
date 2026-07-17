import Link from 'next/link';
import { Surface, StatusPill } from '@/components/fairway';
import { PanelNoData } from './PanelStates';
import { LocalTime } from './LocalTime';
import type { RosterPlayerInsight } from '@/lib/admin/data/users';
import { playerTone } from './player-tone';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-b border-accent-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
      {children}
    </h2>
  );
}

/**
 * Sport-agnostic quiet/error-prone/profile-gap player watchlist, sorted by
 * the caller. Shared between /admin/baseball (its own local copy predates
 * this extraction) and /admin/golf (bridge-tab-audit-p0p1 golf Finding 2).
 *
 * Timestamps go through `<LocalTime>` (never raw `toLocaleDateString()`).
 */
export function PlayerWatchlist({
  players,
  title = 'Player-by-player watchlist',
}: {
  players: RosterPlayerInsight[];
  title?: string;
}) {
  return (
    <Surface padding="sm">
      <SectionLabel>{title}</SectionLabel>
      <div className="mt-3 divide-y divide-warm-200/70">
        {players.length === 0 ? (
          <PanelNoData label="No player watch items" description="Players with errors, quiet activity, or missing profiles appear here." />
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
                last{' '}
                {player.lastActivity ?? player.lastSeen ? (
                  <LocalTime iso={(player.lastActivity ?? player.lastSeen) as string} variant="date" fallback="never" />
                ) : (
                  'never'
                )}
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
