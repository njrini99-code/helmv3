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
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/empty-state';
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
  const prefersReducedMotion = useReducedMotion();
  const [activeTabId, setActiveTabId] = useState<string>(
    categories[0]?.id ?? ''
  );

  const activeCategory = categories.find((c) => c.id === activeTabId);

  if (categories.length === 0) {
    return (
      <EmptyState
        variant="card"
        icon={<IconActivity size={28} />}
        title="No category data yet"
        description="Category intelligence will appear here once your team has logged enough rounds."
      />
    );
  }

  return (
    <Tabs
      value={activeTabId}
      onChange={setActiveTabId}
      className="space-y-5"
    >
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="text-sm text-warm-500">Team Health:</span>
          <span
            className={cn(
              'text-body-lg font-medium tracking-[-0.005em] tabular-nums',
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
      <TabsList
        className="flex w-fit max-w-full gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide"
      >
        {categories.map((cat) => {
          const Icon = getCategoryIcon(cat.id);

          return (
            <TabsTrigger
              key={cat.id}
              value={cat.id}
              className="shrink-0"
              icon={<Icon size={16} />}
            >
              <span>{cat.label}</span>

              {/* Attention dot */}
              {cat.attentionCount > 0 && (
                <span
                  className={cn(
                    'absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2',
                    'bg-red-500 border-white',
                    'group-data-[state=active]:bg-red-400 group-data-[state=active]:border-primary-600'
                  )}
                />
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>

      {/* Active category content — kept outside TabsContent so the existing
          AnimatePresence crossfade works the same way it did before. The
          Tabs root still drives `activeTabId` for keyboard nav and ARIA. */}
      <AnimatePresence mode="wait">
        {activeCategory && (
          <motion.div
            key={activeCategory.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.25, ease: 'easeOut' })}
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
    </Tabs>
  );
}
