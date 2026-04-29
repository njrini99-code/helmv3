'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/utils';
import {
  IconCrosshair,
  IconTarget,
  IconFlag,
  IconCircleDot,
  IconTrendingUp,
  IconActivity,
} from '@/components/icons';
import { AnimatePresence, motion } from 'framer-motion';
import { CategoryCard } from './CategoryCard';
import { CategoryDrillDown } from './CategoryDrillDown';

interface TeamCategory {
  id: string;
  label: string;
  teamAvg: number;
  teamAvgLabel: string;
  trend: 'improving' | 'stable' | 'declining';
  insights: Array<{ id: string; message: string; tone: 'positive' | 'negative' | 'neutral' }>;
  players: Array<{
    playerId: string;
    playerName: string;
    avatarUrl: string | null;
    value: number;
    trend: 'improving' | 'stable' | 'declining';
    trendDelta: number;
    needsAttention: boolean;
  }>;
  primaryMetric: string;
  attentionCount: number;
}

interface TeamCategoryViewProps {
  categories: TeamCategory[];
  teamHealth: number;
  lastAnalyzed: string;
  onPlayerClick?: (playerId: string) => void;
}

const categoryIconMap: Record<string, typeof IconCrosshair> = {
  driving: IconCrosshair,
  approach: IconTarget,
  short_game: IconFlag,
  putting: IconCircleDot,
  scoring: IconTrendingUp,
};

/** Format functions per category — these match the server-side definitions
 *  in team-category-insights.ts but are defined here as client-safe functions. */
const categoryFormatMap: Record<string, (v: number) => string> = {
  driving: (v: number) => `${v.toFixed(0)}%`,
  approach: (v: number) => `${v.toFixed(0)}%`,
  short_game: (v: number) => `${v.toFixed(0)}%`,
  putting: (v: number) => v.toFixed(1),
  scoring: (v: number) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)),
};

function getCategoryIcon(id: string) {
  return categoryIconMap[id] ?? IconActivity;
}

function getHealthColor(health: number): string {
  if (health >= 75) return 'text-primary-600';
  if (health >= 50) return 'text-amber-500';
  return 'text-red-500';
}

export function TeamCategoryView({
  categories,
  teamHealth,
  lastAnalyzed,
  onPlayerClick,
}: TeamCategoryViewProps) {
  const [activeTabId, setActiveTabId] = useState<string>(
    categories[0]?.id ?? ''
  );

  const activeCategory = categories.find((c) => c.id === activeTabId);

  if (categories.length === 0) {
    return (
      <div className="surface-matte rounded-3xl p-8 text-center space-y-2">
        <IconActivity size={32} className="mx-auto text-warm-300" />
        <p className="text-warm-900 font-medium">No category data yet</p>
        <p className="text-sm text-warm-500">
          Category intelligence will appear here once your team has logged enough rounds.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="text-sm text-warm-500">Team Health:</span>
          <span
            className={cn(
              'text-lg font-bold tabular-nums',
              getHealthColor(teamHealth)
            )}
          >
            {teamHealth}
            <span className="text-sm font-normal text-warm-400">/100</span>
          </span>
        </div>
        <span className="text-xs text-warm-400">
          Last analyzed: {formatRelativeTime(lastAnalyzed)}
        </span>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        {categories.map((cat) => {
          const Icon = getCategoryIcon(cat.id);
          const isActive = cat.id === activeTabId;

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveTabId(cat.id)}
              className={cn(
                'relative flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 shrink-0 cursor-pointer',
                isActive
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-warm-500 hover:bg-warm-50'
              )}
            >
              <Icon size={16} />
              <span>{cat.label}</span>

              {/* Attention dot */}
              {cat.attentionCount > 0 && (
                <span
                  className={cn(
                    'absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2',
                    isActive
                      ? 'bg-red-400 border-primary-600'
                      : 'bg-red-500 border-white'
                  )}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Active category content */}
      {/* mode="wait" — tab switch crossfade; popLayout was re-measuring on every frame */}
      <AnimatePresence mode="wait">
        {activeCategory && (
          <motion.div
            key={activeCategory.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="space-y-4"
          >
            <CategoryCard category={activeCategory} />
            <CategoryDrillDown
              players={activeCategory.players}
              primaryMetric={activeCategory.primaryMetric}
              formatValue={categoryFormatMap[activeCategory.id]}
              lowerIsBetter={activeCategory.id === 'putting' || activeCategory.id === 'scoring'}
              onPlayerClick={onPlayerClick}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
