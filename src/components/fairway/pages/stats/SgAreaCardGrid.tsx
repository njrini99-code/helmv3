'use client';

import { cn } from '@/lib/utils';
import { StandingStrip } from '@/components/fairway';
import type { MetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import type { PlayerStandingRow } from '@/app/golf/actions/stats-leak-maps-types';
import { SG_AREA_THEME } from './player-stats-theme';
import { MotionArticle, MotionSpan, useStatsMotion } from './fairway-stats-motion';
import { StatsStaggerGrid, StatsStaggerItem } from './StatsSection';

function formatSg(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—';
  if (value === 0) return 'E';
  const fixed = Math.abs(value).toFixed(2);
  return value > 0 ? `+${fixed}` : `−${fixed}`;
}

export interface SgAreaItem {
  id: string;
  row: PlayerStandingRow;
  cfg: MetricRenderConfig;
}

export interface SgAreaCardGridProps {
  items: SgAreaItem[];
  className?: string;
}

/** 2×2 strokes-gained cards — each area gets its own color lane. */
export function SgAreaCardGrid({ items, className }: SgAreaCardGridProps) {
  const motion = useStatsMotion();
  if (items.length === 0) return null;

  return (
    <StatsStaggerGrid className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2', className)}>
      {items.map(({ id, row, cfg }) => {
        const theme = SG_AREA_THEME[id] ?? {
          label: cfg.display_label,
          tint: 'bg-surface-sunken',
          border: 'border-border-subtle',
          value: 'text-text-primary',
        };
        const raw = row.player_value;
        const sg = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
        const positive = sg != null && sg > 0;
        const negative = sg != null && sg < 0;

        return (
          <StatsStaggerItem key={id}>
            <MotionArticle
              className={cn('flex h-full flex-col gap-3 rounded-card border p-4', theme.tint, theme.border)}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-fw-display text-eyebrow uppercase tracking-[0.12em] text-text-secondary">
                    Strokes gained
                  </p>
                  <h4 className="font-fw-sans text-body font-semibold text-text-primary">{theme.label}</h4>
                </div>
                <MotionSpan
                  className={cn(
                    'font-fw-mono text-h2 font-semibold tabular-nums leading-none',
                    positive ? 'text-fw-success' : negative ? 'text-fw-warning' : theme.value,
                  )}
                  {...motion.valuePop}
                >
                  {formatSg(sg)}
                </MotionSpan>
              </div>
              <StandingStrip
                metric_id={id}
                metric_label={cfg.display_label}
                player_value={row.player_value}
                team_avg={row.team_avg}
                team_n={row.team_n}
                team_pct={row.team_pct}
                pga_value={row.pga_value}
                is_womens={row.is_womens}
                direction={cfg.direction}
                unit={cfg.unit}
                scale={cfg.default_scale}
                size="card"
              />
            </MotionArticle>
          </StatsStaggerItem>
        );
      })}
    </StatsStaggerGrid>
  );
}
