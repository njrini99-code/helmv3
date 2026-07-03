import Link from 'next/link';
import { StatusPill } from '@/components/fairway';
import { cn } from '@/lib/utils';
import type { TeamHealth } from '@/lib/admin/data/golf';

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
  /**
   * @deprecated Ignored — every row now links to the team's own
   * `/admin/teams/[id]` page (Bridge V2 owner directive, 2026-07-02). Kept
   * on the interface so existing callers (`/admin/golf`, `/admin/users`)
   * that still pass a computed `href` don't need to change.
   */
  href?: string;
}

/**
 * Shared with W9 (baseball) / W10 (users) — sport-agnostic.
 *
 * PHONE-FORMAT RESPONSIVE (owner directive 2026-07-02): `overflow-x-auto`
 * scopes the horizontal scroll to the table itself (never the page), and the
 * first column stays `sticky` so the team's identity is never scrolled out
 * of view on a 375px viewport. Mirrors the cron-board table pattern in
 * `/admin/jobs`.
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
    <div className="overflow-x-auto">
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
              <tr key={t.teamId} className={cn(isLeader && 'border-l-2 border-l-accent-500 bg-accent-50')}>
                <td className={cn('sticky left-0 z-10 py-2 pr-3', isLeader ? 'bg-accent-50' : 'bg-surface')}>
                  <Link
                    href={`/admin/teams/${t.teamId}`}
                    className="font-medium text-warm-900 underline-offset-2 hover:underline"
                  >
                    {t.name}
                  </Link>
                </td>
                <td className="px-3 font-fw-mono font-semibold tabular-nums text-warm-900">{t.playerCount}</td>
                <td className="px-3 font-fw-mono text-xs tabular-nums text-warm-600">
                  {t.lastActivity ? new Date(t.lastActivity).toLocaleDateString() : 'never'}
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
  );
}
