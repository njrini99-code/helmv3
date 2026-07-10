import Link from 'next/link';
import { StatusPill } from '@/components/fairway';
import { cn } from '@/lib/utils';
import type { TeamHealth } from '@/lib/admin/data/golf';
import { LocalTime } from './LocalTime';

const HEALTH_TONE: Record<TeamHealth, 'success' | 'warning' | 'danger'> = {
  active: 'success',
  cooling: 'warning',
  dormant: 'danger',
};

export interface TeamHealthEntry {
  teamId: string;
  name: string;
  playerCount: number;
  lastActivity: string | null;
  health: TeamHealth;
  errors7d: number;
  /** Optional row target. Golf defaults to `/admin/teams/[id]`; callers with
   *  cross-sport rows can pass a route that understands their team model. */
  href?: string;
}

/**
 * Shared with W9 (baseball) / W10 (users) — sport-agnostic.
 *
 * MOBILE (doctrine Rule 8, 2026-07-10): below `md` each team renders as a
 * full-width tap-through card row (identity + roster/last-activity line +
 * health pill + honest error count) — the min-w table would otherwise force
 * a horizontal scroller on a phone-primary reading surface, which Rule 8
 * bans even when scroll-contained. The table (sticky identity column,
 * `overflow-x-auto` scoped to itself) still owns `md` and up, unchanged.
 *
 * GREEN CONTRACT (Bridge V2, 2026-07-02): a hairline helm-green rule under
 * the header, heavy graphite (never green) numerals for roster/error counts,
 * a genuine-error count painted in the danger token only when it's actually
 * non-zero, and a soft green leader wash + left bar on the cleanest rows
 * (active, zero errors this week) — never on dormant/at-risk ones. Red-first
 * ordering is the CALLER's responsibility (sortTeamsByHealth in
 * `data/golf.ts`) and is left untouched here.
 */
export function TeamHealthTable({ teams }: { teams: TeamHealthEntry[] }) {
  return (
    <>
      {/* Phone: doctrine-8 card rows, whole row is the link. */}
      <div className="divide-y divide-warm-200/60 md:hidden">
        {teams.map((t) => {
          const isLeader = t.health === 'active' && t.errors7d === 0;
          return (
            <Link
              key={t.teamId}
              href={t.href ?? `/admin/teams/${t.teamId}`}
              className={cn(
                'block rounded-fw-md px-2 py-3 transition-colors hover:bg-surface-sunken',
                isLeader && 'bg-accent-50',
              )}
            >
              {/* Dateline rule — replaces the retired border-l-2 leader stripe. */}
              {isLeader && <span aria-hidden className="mb-1 block h-[2px] w-7 rounded-full bg-accent-500" />}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-warm-900">{t.name}</p>
                  <p className="mt-1 font-fw-mono text-xs tabular-nums text-warm-500">
                    {t.playerCount} players · last{' '}
                    {t.lastActivity ? <LocalTime iso={t.lastActivity} variant="date" fallback="never" /> : 'never'}
                  </p>
                </div>
                <StatusPill tone={HEALTH_TONE[t.health]} dot size="sm" className="shrink-0">
                  {t.health}
                </StatusPill>
              </div>
              {t.errors7d > 0 ? (
                <p className="mt-2 font-fw-mono text-xs font-semibold tabular-nums text-fw-danger">
                  {t.errors7d} errors this week
                </p>
              ) : null}
            </Link>
          );
        })}
      </div>

      {/* md+: the original sticky-identity table, byte-for-byte. */}
      <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-accent-600/25 text-left text-xs uppercase tracking-widest text-warm-500">
            <th className="sticky left-0 z-10 bg-surface py-2 pr-3">Team</th>
            <th className="px-3">Roster</th>
            <th className="px-3">Last activity</th>
            <th className="px-3">Health</th>
            <th className="px-3">Errors 7d</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-warm-200/60">
          {teams.map((t) => {
            const isLeader = t.health === 'active' && t.errors7d === 0;
            return (
              <tr key={t.teamId} className={cn(isLeader && 'bg-accent-50')}>
                <td className={cn('sticky left-0 z-10 py-2 pr-3', isLeader ? 'bg-accent-50' : 'bg-surface')}>
                  {/* Dateline rule — replaces the retired border-l-2 leader stripe. */}
                  {isLeader && <span aria-hidden className="mb-1 block h-[2px] w-7 rounded-full bg-accent-500" />}
                  <Link
                    href={t.href ?? `/admin/teams/${t.teamId}`}
                    className="font-medium text-warm-900 underline-offset-2 hover:underline"
                  >
                    {t.name}
                  </Link>
                </td>
                <td className="px-3 font-fw-mono font-semibold tabular-nums text-warm-900">{t.playerCount}</td>
                <td className="px-3 font-fw-mono text-xs tabular-nums text-warm-600">
                  {t.lastActivity ? <LocalTime iso={t.lastActivity} variant="date" fallback="never" /> : 'never'}
                </td>
                <td className="px-3">
                  <StatusPill tone={HEALTH_TONE[t.health]} dot size="sm">
                    {t.health}
                  </StatusPill>
                </td>
                <td
                  className={cn(
                    'px-3 font-fw-mono font-semibold tabular-nums',
                    t.errors7d > 0 ? 'text-fw-danger' : 'text-warm-900',
                  )}
                >
                  {t.errors7d}
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
