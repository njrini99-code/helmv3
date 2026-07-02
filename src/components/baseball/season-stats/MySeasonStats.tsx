'use client';

/**
 * MySeasonStats — the current season's box-score-derived line, on the record.
 *
 * Living Annual migration (design-system-living-annual.md §7). PRESENTATION
 * ONLY — same `getMySeasonStats()` server action + `BaseballPlayerSeasonStats`
 * shape, same loading/empty/batting/pitching branches. Batting AVG/OBP/SLG
 * render through the real `<SlashLine>`, OPS through its own `<StatReadout>`,
 * and every counting stat (G/AB/R/H/HR/RBI/BB/SB, W/L/SV/K/BB/H/HR) through
 * `<KPIContentsStrip>` instead of the old hand-rolled mini tiles. ERA/WHIP/K9
 * use the kit's `formatRatio` (keeps the leading zero, `0.98` not `.98` — the
 * ERA convention, distinct from AVG/OBP/SLG) and IP uses `formatInnings`
 * (`6.1` = six-and-a-third) instead of `.toFixed(1)`.
 */
import { useState, useEffect } from 'react';
import { getMySeasonStats } from '@/app/baseball/actions/games';
import type { BaseballPlayerSeasonStats } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  PaperCard,
  Eyebrow,
  SlashLine,
  StatReadout,
  KPIContentsStrip,
  HairlineRule,
  EmptyIssue,
  formatRate,
  formatRatio,
  formatInnings,
} from '@/components/baseball/living-annual';

function SeasonSkeleton() {
  return (
    <PaperCard className="p-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="relative h-20 overflow-hidden rounded-fw-md">
            <div className="absolute inset-0 skeleton-shimmer pointer-events-none" style={{ animationDelay: `${i * 50}ms` }} />
          </div>
        ))}
      </div>
    </PaperCard>
  );
}

export function MySeasonStats() {
  const [stats, setStats] = useState<BaseballPlayerSeasonStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMySeasonStats().then((r) => {
      if (r.success) setStats(r.data ?? null);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <SeasonSkeleton />;
  }

  if (!stats || (stats.ab === 0 && stats.ip === 0)) {
    return <EmptyIssue variant="stats" />;
  }

  const currentYear = new Date().getFullYear();

  return (
    <PaperCard className="p-6" data-testid="my-season-stats">
      <div className="flex items-center justify-between">
        <Eyebrow ink="team">{currentYear} Season</Eyebrow>
        <span className="font-annual text-body-sm text-text-tertiary">{stats.g} games played</span>
      </div>

      {stats.ab > 0 ? (
        <div className="mt-5 flex flex-col gap-4" data-testid="my-season-batting">
          <span className="text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary">Batting</span>

          <div className="flex flex-wrap items-end justify-between gap-6">
            <SlashLine avg={stats.avg ?? NaN} obp={stats.obp ?? NaN} slg={stats.slg ?? NaN} leader="avg" size="md" />
            <div className="flex flex-col items-end gap-1">
              <span className="text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">OPS</span>
              <StatReadout value={stats.ops != null ? formatRate(stats.ops, 3) : '—'} ariaLabel="OPS" className="text-h2" />
            </div>
          </div>

          <KPIContentsStrip
            columns={4}
            items={[
              { label: 'G', value: stats.g },
              { label: 'AB', value: stats.ab },
              { label: 'R', value: stats.r },
              { label: 'H', value: stats.h },
              { label: 'HR', value: stats.hr },
              { label: 'RBI', value: stats.rbi },
              { label: 'BB', value: stats.bb },
              { label: 'SB', value: stats.sb },
            ]}
          />
        </div>
      ) : null}

      {stats.ip > 0 ? (
        <div className={cn('flex flex-col gap-4', stats.ab > 0 && 'mt-8')}>
          {stats.ab > 0 ? <HairlineRule ink="hairline" /> : null}
          <span className="text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary">Pitching</span>

          <KPIContentsStrip
            columns={4}
            items={[
              { label: 'ERA', value: stats.era != null ? formatRatio(stats.era, 2) : '—' },
              { label: 'WHIP', value: stats.whip != null ? formatRatio(stats.whip, 3) : '—' },
              { label: 'K/9', value: stats.k9 != null ? formatRatio(stats.k9, 2) : '—' },
              { label: 'IP', value: formatInnings(stats.ip) },
            ]}
          />
          <KPIContentsStrip
            columns={4}
            items={[
              { label: 'W', value: stats.w },
              { label: 'L', value: stats.l },
              { label: 'SV', value: stats.sv },
              { label: 'K', value: stats.k_thrown },
              { label: 'BB', value: stats.bb_allowed },
              { label: 'H', value: stats.h_allowed },
              { label: 'HR', value: stats.hr_allowed },
            ]}
          />
        </div>
      ) : null}
    </PaperCard>
  );
}
