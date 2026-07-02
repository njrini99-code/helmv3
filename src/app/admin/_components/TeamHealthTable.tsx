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

/** Shared with W9 (baseball) / W10 (users) — sport-agnostic. */
export function TeamHealthTable({ teams }: { teams: TeamHealthEntry[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-widest text-warm-500">
          <th className="py-2">Team</th>
          <th>Roster</th>
          <th>Last activity</th>
          <th>Health</th>
          <th>Errors 7d</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-warm-200/60">
        {teams.map((t) => (
          <tr key={t.teamId}>
            <td className="py-2">
              <Link href={t.href} className="font-medium text-warm-900 underline-offset-2 hover:underline">
                {t.name}
              </Link>
            </td>
            <td className="font-fw-mono tabular-nums">{t.playerCount}</td>
            <td className="font-fw-mono text-xs tabular-nums text-warm-600">
              {t.lastActivity ? new Date(t.lastActivity).toLocaleDateString() : 'never'}
            </td>
            <td>
              <StatusPill tone={HEALTH_TONE[t.health]} dot size="sm">
                {t.health}
              </StatusPill>
            </td>
            <td className="font-fw-mono tabular-nums">{t.errors7d}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
