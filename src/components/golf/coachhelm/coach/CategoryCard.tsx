'use client';

import { cn } from '@/lib/utils';
import { IconTrendingUp, IconTrendingDown, IconMinus } from '@/components/icons';
import { motion } from 'framer-motion';
import { EmptyState } from '@/components/ui/empty-state';

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

interface CategoryCardProps {
  category: TeamCategory;
}

const trendConfig = {
  improving: {
    icon: IconTrendingUp,
    label: 'Improving',
    color: 'text-primary-600',
    bg: 'bg-primary-50',
    border: 'border-primary-200',
  },
  stable: {
    icon: IconMinus,
    label: 'Stable',
    color: 'text-warm-500',
    bg: 'bg-warm-50',
    border: 'border-warm-200',
  },
  declining: {
    icon: IconTrendingDown,
    label: 'Declining',
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
  },
} as const;

const insightDotColor = {
  positive: 'bg-primary-500',
  negative: 'bg-red-500',
  neutral: 'bg-amber-500',
} as const;

export function CategoryCard({ category }: CategoryCardProps) {
  const trend = trendConfig[category.trend];
  const TrendIcon = trend.icon;

  if (!category) {
    return (
      <div className="surface-matte rounded-3xl p-6">
        <EmptyState
          variant="minimal"
          type="generic"
          description="No category data available yet."
        />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="surface-matte rounded-3xl p-6 space-y-5"
    >
      {/* Header: Team average + trend */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-h1 md:text-h1 font-light tabular-nums tracking-[-0.025em] text-warm-900">
            {category.teamAvgLabel}
          </p>
        </div>

        <div
          className={cn(
            'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium border',
            trend.bg,
            trend.color,
            trend.border
          )}
        >
          <TrendIcon size={14} />
          <span>{trend.label}</span>
        </div>
      </div>

      {/* Insights list */}
      {category.insights.length > 0 ? (
        <div className="space-y-2.5">
          <p className="text-eyebrow font-medium uppercase tracking-[0.12em] opacity-80 text-warm-400">
            Insights
          </p>
          <ul className="space-y-2">
            {category.insights.map((insight) => (
              <li key={insight.id} className="flex items-start gap-2.5">
                <span
                  className={cn(
                    'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                    insightDotColor[insight.tone]
                  )}
                />
                <span className="text-sm text-warm-700 leading-relaxed">
                  {insight.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <EmptyState
          variant="minimal"
          type="generic"
          description="No insights for this category yet. As shots roll in, AI insights will appear here."
        />
      )}
    </motion.div>
  );
}
