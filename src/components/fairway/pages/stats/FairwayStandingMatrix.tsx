'use client';

import { StandingStrip } from '@/components/fairway';
import type { PlayerStandingRow } from '@/app/golf/actions/stats-leak-maps-types';
import { StatsSection, StatsStaggerGrid, StatsStaggerItem } from './StatsSection';
import { STANDING_CATEGORY_ORDER, groupStandingRows } from './fairway-stats-metric-category';

export function FairwayStandingMatrix({
  standingRows,
  title = 'Full standing matrix',
  description = 'You vs team and Tour across every tracked metric.',
  compact = false,
}: {
  standingRows: PlayerStandingRow[] | null;
  title?: string;
  description?: string;
  compact?: boolean;
}) {
  const byCategory = groupStandingRows(standingRows);
  const totalRows = Array.from(byCategory.values()).reduce((a, b) => a + b.length, 0);
  if (totalRows === 0) return null;

  return (
    <StatsSection title={title} description={description} accent="accent">
      <div className="flex flex-col gap-8">
        {STANDING_CATEGORY_ORDER.filter((g) => (byCategory.get(g.category) ?? []).length > 0).map((group) => {
          const rows = byCategory.get(group.category) ?? [];
          return (
            <div key={group.category} className="flex flex-col gap-3">
              <div>
                <p className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary">
                  {group.label}
                </p>
                {!compact ? (
                  <p className="mt-0.5 font-fw-sans text-caption text-text-tertiary">{group.description}</p>
                ) : null}
              </div>
              <StatsStaggerGrid className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {rows.map(({ id, standing, cfg }) => (
                  <StatsStaggerItem key={id}>
                    <StandingStrip
                    key={id}
                    metric_id={id}
                    metric_label={cfg.display_label}
                    player_value={standing.player_value}
                    team_avg={standing.team_avg}
                    team_n={standing.team_n}
                    team_pct={standing.team_pct}
                    pga_value={standing.pga_value}
                    is_womens={standing.is_womens}
                    direction={cfg.direction}
                    unit={cfg.unit}
                    scale={cfg.default_scale}
                    size="card"
                    />
                  </StatsStaggerItem>
                ))}
              </StatsStaggerGrid>
            </div>
          );
        })}
      </div>
    </StatsSection>
  );
}
