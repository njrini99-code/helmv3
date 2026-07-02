import Link from 'next/link';
import { StatusPill } from '@/components/fairway';
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
  href: string;
}

/**
 * Shared with W9 (baseball) / W10 (users) — sport-agnostic.
 *
 * PHONE-FORMAT RESPONSIVE (owner directive 2026-07-02): `overflow-x-auto`
 * scopes the horizontal scroll to the table itself (never the page), and the
 * first column stays `sticky` so the team's identity is never scrolled out
 * of view on a 375px viewport. Mirrors the cron-board table pattern in
 * `/admin/jobs`.
 */
export function TeamHealthTable({ teams }: { teams: TeamHealthEntry[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-widest text-warm-500">
            <th className="sticky left-0 z-10 bg-surface py-2 pr-3">Team</th>
            <th className="px-3">Roster</th>
            <th className="px-3">Last activity</th>
            <th className="px-3">Health</th>
            <th className="px-3">Errors 7d</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-warm-200/60">
          {teams.map((t) => (
            <tr key={t.teamId}>
              <td className="sticky left-0 z-10 bg-surface py-2 pr-3">
                <Link href={t.href} className="font-medium text-warm-900 underline-offset-2 hover:underline">
                  {t.name}
                </Link>
              </td>
              <td className="px-3 font-fw-mono tabular-nums">{t.playerCount}</td>
              <td className="px-3 font-fw-mono text-xs tabular-nums text-warm-600">
                {t.lastActivity ? new Date(t.lastActivity).toLocaleDateString() : 'never'}
              </td>
              <td className="px-3">
                <StatusPill tone={HEALTH_TONE[t.health]} dot size="sm">
                  {t.health}
                </StatusPill>
              </td>
              <td className="px-3 font-fw-mono tabular-nums">{t.errors7d}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
