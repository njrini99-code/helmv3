'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { coachHelmRoutes } from '@/lib/coachhelm/fairway-routes';
import type { TeamPlayerStats } from '@/app/golf/(dashboard)/dashboard/stats/team/page';
import type { FairwayTeamStatsPlayerIntelligence } from '@/components/fairway/pages/coachhelm/FairwayTeamStats';

function fmtNum(v: number | null, d = 1): string {
  if (v === null || Number.isNaN(v)) return '—';
  return v.toFixed(d);
}

function fmtPct(v: number | null): string {
  if (v === null || Number.isNaN(v)) return '—';
  return `${v.toFixed(1)}%`;
}

function trendLabel(trend: number | null): { text: string; cls: string } {
  if (trend === null || Number.isNaN(trend)) return { text: '—', cls: 'text-text-tertiary' };
  if (Math.abs(trend) < 0.3) return { text: 'Steady', cls: 'text-text-tertiary' };
  return trend < 0
    ? { text: `↘ ${Math.abs(trend).toFixed(1)}`, cls: 'text-fw-success' }
    : { text: `↗ ${trend.toFixed(1)}`, cls: 'text-fw-warning' };
}

export interface TeamLeaderboardTableProps {
  players: TeamPlayerStats[];
  intelligenceByPlayer: Record<string, FairwayTeamStatsPlayerIntelligence>;
  className?: string;
}

/** Dense, scannable roster table — the coach's primary stats comparison view. */
export function TeamLeaderboardTable({
  players,
  intelligenceByPlayer,
  className,
}: TeamLeaderboardTableProps) {
  if (players.length === 0) return null;

  return (
    <div
      className={cn(
        'overflow-x-auto rounded-card border border-border-subtle bg-surface shadow-soft',
        className,
      )}
    >
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead>
          <tr className="border-b border-border-subtle bg-surface-sunken">
            <th className="px-4 py-3 font-fw-display text-eyebrow font-medium uppercase tracking-[0.1em] text-text-secondary">
              Player
            </th>
            <th className="px-3 py-3 text-right font-fw-display text-eyebrow font-medium uppercase tracking-[0.1em] text-text-secondary">
              Rds
            </th>
            <th className="px-3 py-3 text-right font-fw-display text-eyebrow font-medium uppercase tracking-[0.1em] text-text-secondary">
              Avg
            </th>
            <th className="px-3 py-3 text-right font-fw-display text-eyebrow font-medium uppercase tracking-[0.1em] text-text-secondary">
              Best
            </th>
            <th className="px-3 py-3 text-right font-fw-display text-eyebrow font-medium uppercase tracking-[0.1em] text-text-secondary">
              FW%
            </th>
            <th className="px-3 py-3 text-right font-fw-display text-eyebrow font-medium uppercase tracking-[0.1em] text-text-secondary">
              GIR%
            </th>
            <th className="px-3 py-3 text-right font-fw-display text-eyebrow font-medium uppercase tracking-[0.1em] text-text-secondary">
              Putts
            </th>
            <th className="px-3 py-3 text-right font-fw-display text-eyebrow font-medium uppercase tracking-[0.1em] text-text-secondary">
              Trend
            </th>
            <th className="px-3 py-3 text-right font-fw-display text-eyebrow font-medium uppercase tracking-[0.1em] text-text-secondary">
              Comp
            </th>
          </tr>
        </thead>
        <tbody>
          {players.map((p, i) => {
            const name = `${p.first_name} ${p.last_name}`.trim() || 'Player';
            const intel = intelligenceByPlayer[p.id];
            const composite = intel?.composite ?? null;
            const trend = trendLabel(p.scoring_trend);
            return (
              <tr
                key={p.id}
                className={cn(
                  'border-b border-border-subtle/70 transition-colors last:border-0 hover:bg-surface-tint',
                  i % 2 === 1 && 'bg-canvas/40',
                )}
              >
                <td className="px-4 py-3">
                  <Link
                    href={coachHelmRoutes.playerStats(p.id)}
                    className="font-fw-sans text-body-sm font-medium text-text-primary hover:text-accent-700"
                  >
                    {name}
                  </Link>
                  {p.graduation_year ? (
                    <span className="ml-2 font-fw-sans text-caption text-text-tertiary">
                      &apos;{String(p.graduation_year).slice(-2)}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-3 text-right font-fw-mono text-body-sm tabular-nums text-text-primary">
                  {p.rounds_played}
                </td>
                <td className="px-3 py-3 text-right font-fw-mono text-body-sm tabular-nums text-text-primary">
                  {fmtNum(p.scoring_average, 1)}
                </td>
                <td className="px-3 py-3 text-right font-fw-mono text-body-sm tabular-nums text-text-primary">
                  {p.best_round != null ? Math.round(p.best_round) : '—'}
                </td>
                <td className="px-3 py-3 text-right font-fw-mono text-body-sm tabular-nums text-text-primary">
                  {fmtPct(p.fairway_pct)}
                </td>
                <td className="px-3 py-3 text-right font-fw-mono text-body-sm tabular-nums text-text-primary">
                  {fmtPct(p.gir_pct)}
                </td>
                <td className="px-3 py-3 text-right font-fw-mono text-body-sm tabular-nums text-text-primary">
                  {fmtNum(p.putts_per_round, 1)}
                </td>
                <td className={cn('px-3 py-3 text-right font-fw-mono text-body-sm tabular-nums', trend.cls)}>
                  {trend.text}
                </td>
                <td className="px-3 py-3 text-right font-fw-mono text-body-sm tabular-nums text-text-primary">
                  {composite != null ? Math.round(composite) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
