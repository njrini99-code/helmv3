'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Surface } from '@/components/fairway';
import { EASE_CINEMATIC, DURATION } from '@/lib/coachhelm/v3/motion';
import type { StatsCategory } from '@/components/golf/stats/GolfStatsDisplay';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import type { StatisticalStrengthWeakness } from '@/lib/golf/strokes-gained';
import type {
  TrendAnalysisResponse,
  SprayChartResponse,
  CourseBreakdownResponse,
  WorstHoleResponse,
} from '@/app/golf/actions/stats-data-types';
import type { PlayerLeakMaps, PlayerStandingRow } from '@/app/golf/actions/stats-leak-maps-types';
import { FairwayStatsCategoryNav } from './FairwayStatsCategoryNav';
import { FairwayStatsPanel, buildSgCategoryItems, buildVitalsDeltas } from './FairwayStatsPanels';
import { getCategoryDef } from './player-stats-theme';

export interface FairwayStatsDisplayProps {
  stats: GolfStats;
  playerId?: string;
  isCoachView?: boolean;
  activeCategory: StatsCategory;
  onCategoryChange: (category: StatsCategory) => void;
  trendData: TrendAnalysisResponse | null;
  sprayData: SprayChartResponse | null;
  leakMaps: PlayerLeakMaps | null;
  standingRows: PlayerStandingRow[] | null;
  courseBreakdown: CourseBreakdownResponse | null;
  worstHoleData: WorstHoleResponse | null;
  statisticalStrengths?: StatisticalStrengthWeakness[];
  statisticalWeaknesses?: StatisticalStrengthWeakness[];
}

export function FairwayStatsDisplay({
  stats,
  playerId,
  activeCategory,
  onCategoryChange,
  trendData,
  sprayData,
  leakMaps,
  standingRows,
  courseBreakdown,
  worstHoleData,
  statisticalStrengths,
  statisticalWeaknesses,
}: FairwayStatsDisplayProps) {
  const prefersReducedMotion = useReducedMotion();
  const def = getCategoryDef(activeCategory);
  const sgCategoryItems = useMemo(() => buildSgCategoryItems(standingRows), [standingRows]);
  const vitalsDeltas = useMemo(() => buildVitalsDeltas(trendData), [trendData]);

  return (
    <div className="flex flex-col gap-6 print:hidden">
      <FairwayStatsCategoryNav value={activeCategory} onChange={onCategoryChange} />

      <p className="font-fw-sans text-body-sm text-text-tertiary">{def.hint}</p>

      <Surface padding="none" elevation="shadow" className="overflow-hidden">
        <motion.div
          key={`header-${activeCategory}`}
          className={cn(
            'border-b border-border-subtle bg-gradient-to-r from-accent-600/10 via-accent-600/5 to-surface px-4 py-3 sm:px-6',
            'border-l-[3px]',
            def.accent,
          )}
          initial={prefersReducedMotion ? false : { opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: DURATION.short, ease: EASE_CINEMATIC }}
        >
          <h2 className="font-fw-display text-h3 font-medium tracking-[-0.01em] text-text-primary">
            {def.label}
          </h2>
          <p className="mt-0.5 font-fw-sans text-caption text-text-tertiary">
            {stats.roundsPlayed} rounds · {stats.holesPlayed} holes tracked
          </p>
        </motion.div>

        <div className="px-4 py-6 sm:px-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeCategory}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 12, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0, y: -8, scale: 0.995 }}
              transition={{ duration: DURATION.medium, ease: EASE_CINEMATIC }}
            >
              <FairwayStatsPanel
                category={activeCategory}
                stats={stats}
                playerId={playerId}
                trendData={trendData}
                sprayData={sprayData}
                leakMaps={leakMaps}
                standingRows={standingRows}
                sgCategoryItems={sgCategoryItems}
                vitalsDeltas={vitalsDeltas}
                courseBreakdown={courseBreakdown}
                worstHoleData={worstHoleData}
                statisticalStrengths={statisticalStrengths}
                statisticalWeaknesses={statisticalWeaknesses}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </Surface>

      {stats.roundsPlayed === 0 ? (
        <Surface padding="lg">
          <p className="text-center font-fw-sans text-body-sm text-text-secondary">
            Complete rounds with shot tracking to unlock detailed stats in each category.
          </p>
        </Surface>
      ) : null}
    </div>
  );
}
