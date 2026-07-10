import Link from 'next/link';
import { StatusPill } from '@/components/fairway';
import { cn } from '@/lib/utils';
import type { TeamHealth } from '@/lib/admin/data/golf';

const HEALTH_TONE: Record<TeamHealth, 'success' | 'warning' | 'danger'> = {
  active: 'success',
  cooling: 'warning',
  dormant: 'danger',
};

// Attention-first ordering, mirroring TeamHealthTable's red-first convention
// (data/golf.ts sortTeamsByHealth) — dormant players surface before cooling
// before active, so a coach's eyes land on who needs a nudge first.
const HEALTH_SORT_RANK: Record<TeamHealth, number> = { dormant: 0, cooling: 1, active: 2 };

/** Display-ready roster row for this page — merges the pinned
 *  `TeamDetailRosterRow` (name, jersey, rounds30d, activityStatus, href)
 *  with the score/to-par supplement `page.tsx` fetches separately (the V2
 *  data module's team-scoped `golf_rounds` query selects only
 *  `player_id, created_at`, not `total_score`/`score_to_par` — see
 *  `fetchTeamPageExtras`). */
export interface RosterDisplayRow {
  playerId: string;
  name: string;
  jerseyNumber: number | null;
  lastRoundScore: number | null;
  lastRoundToPar: number | null;
  rounds30d: number;
  activityStatus: TeamHealth;
  href: string;
}

function sortRoster(roster: readonly RosterDisplayRow[]): RosterDisplayRow[] {
  return [...roster].sort((a, b) =>
    a.activityStatus === b.activityStatus
      ? b.rounds30d - a.rounds30d
      : HEALTH_SORT_RANK[a.activityStatus] - HEALTH_SORT_RANK[b.activityStatus],
  );
}

function formatToPar(toPar: number | null): string {
  if (toPar === null) return '—';
  if (toPar === 0) return 'E';
  return toPar > 0 ? `+${toPar}` : String(toPar);
}

/**
 * Team roster — GREEN CONTRACT: heavy graphite (warm-900, bold, tabular)
 * numerals for scores/rounds, a soft green wash + 2px left bar on the
 * team's leaders (most rounds logged in the last 30 days, active), and a
 * muted (never red-background) treatment for dormant players — red stays
 * reserved for genuine errors, not a quiet roster.
 *
 * PHONE-FORMAT RESPONSIVE: same sticky-first-column pattern as
 * TeamHealthTable (`overflow-x-auto` on the table only, never the page).
 */
export function RosterTable({ roster }: { roster: RosterDisplayRow[] }) {
  const sorted = sortRoster(roster);
  const maxRounds30d = roster.reduce((max, r) => Math.max(max, r.rounds30d), 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-accent-600/25 text-left text-xs uppercase tracking-widest text-warm-500">
            <th className="sticky left-0 z-10 bg-surface py-2 pr-3">Player</th>
            <th className="px-3">Jersey</th>
            <th className="px-3">Last round</th>
            <th className="px-3">Rounds 30d</th>
            <th className="px-3">Activity</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-warm-200/60">
          {sorted.map((r) => {
            const isLeader = maxRounds30d > 0 && r.activityStatus === 'active' && r.rounds30d === maxRounds30d;
            const isDormant = r.activityStatus === 'dormant';
            return (
              <tr key={r.playerId} className={cn(isLeader && 'bg-accent-50')}>
                <td className={cn('sticky left-0 z-10 py-2 pr-3', isLeader ? 'bg-accent-50' : 'bg-surface')}>
                  {/* Dateline rule — replaces the retired border-l-2 leader stripe. */}
                  {isLeader && <span aria-hidden className="mb-1 block h-[2px] w-7 rounded-full bg-accent-500" />}
                  <Link
                    href={r.href}
                    className={cn(
                      'font-medium underline-offset-2 hover:underline',
                      isDormant ? 'text-warm-500' : 'text-warm-900',
                    )}
                  >
                    {r.name}
                  </Link>
                </td>
                <td className="px-3 font-fw-mono tabular-nums text-warm-600">{r.jerseyNumber ?? '—'}</td>
                <td className="px-3 font-fw-mono tabular-nums text-warm-900">
                  {r.lastRoundScore !== null ? (
                    <>
                      <span className="font-semibold">{r.lastRoundScore}</span>{' '}
                      <span className="text-xs text-warm-500">({formatToPar(r.lastRoundToPar)})</span>
                    </>
                  ) : (
                    <span className="text-warm-500">no rounds</span>
                  )}
                </td>
                <td className="px-3 font-fw-mono font-semibold tabular-nums text-warm-900">{r.rounds30d}</td>
                <td className="px-3">
                  <StatusPill tone={HEALTH_TONE[r.activityStatus]} dot size="sm">
                    {r.activityStatus}
                  </StatusPill>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
