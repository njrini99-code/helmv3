import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { StatusPill, Inset } from '@/components/fairway';
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
 * PHONE-FORMAT RESPONSIVE (doctrine rule 8): below `md` this is identity +
 * key-stat CARDS, not a min-w table inside overflow-x-auto — a min-w table
 * is never the phone treatment on this reading surface. `md:` and up keeps
 * the dense table, sticky-first-column pattern shared with TeamHealthTable
 * (`overflow-x-auto` on the table only, never the page).
 */
export function RosterTable({ roster }: { roster: RosterDisplayRow[] }) {
  const sorted = sortRoster(roster);
  const maxRounds30d = roster.reduce((max, r) => Math.max(max, r.rounds30d), 0);

  return (
    <>
      <ul className="space-y-2 md:hidden">
        {sorted.map((r) => {
          const isLeader = maxRounds30d > 0 && r.activityStatus === 'active' && r.rounds30d === maxRounds30d;
          const isDormant = r.activityStatus === 'dormant';
          return (
            <li key={r.playerId}>
              <Inset
                as={Link}
                href={r.href}
                padding="sm"
                className={cn(
                  'flex items-start gap-2 transition-colors hover:bg-surface',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500',
                  isLeader && 'bg-accent-50 hover:bg-accent-100/70',
                )}
              >
                <div className="min-w-0 flex-1">
                  {/* Dateline rule — replaces the retired border-l-2 leader stripe. */}
                  {isLeader && <span aria-hidden className="mb-1 block h-[2px] w-7 rounded-full bg-accent-500" />}
                  <p className={cn('truncate font-medium', isDormant ? 'text-warm-500' : 'text-warm-900')}>{r.name}</p>
                  <p className="mt-1 font-fw-mono text-xs tabular-nums text-warm-500">
                    {r.jerseyNumber ? `#${r.jerseyNumber}` : 'no #'} ·{' '}
                    {r.lastRoundScore !== null ? (
                      <>
                        {r.lastRoundScore} ({formatToPar(r.lastRoundToPar)})
                      </>
                    ) : (
                      'no rounds'
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <StatusPill tone={HEALTH_TONE[r.activityStatus]} dot size="sm">
                    {r.activityStatus}
                  </StatusPill>
                  <span className="font-fw-mono text-xs font-semibold tabular-nums text-warm-900">
                    {r.rounds30d} rounds 30d
                  </span>
                </div>
                <ChevronRight size={16} className="mt-1 shrink-0 text-warm-300" aria-hidden />
              </Inset>
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto md:block">
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
    </>
  );
}
