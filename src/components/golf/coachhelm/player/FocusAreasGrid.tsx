'use client';

import { m } from 'framer-motion';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/glass-card';
import {
  IconTarget,
  IconTrendingUp,
  IconTrendingDown,
  IconChevronRight,
  IconActivity,
} from '@/components/icons';

interface FocusArea {
  area: string;
  strokesGained: number;
  trend: 'improving' | 'stable' | 'declining';
  recommendation: string;
}

interface FocusAreasGridProps {
  focusAreas: FocusArea[];
  onAreaClick?: (area: FocusArea) => void;
}

// Format strokes gained/lost for display
function formatStrokesGained(value: number | string | undefined | null): string {
  if (value == null) return '--';
  const num = Number(value);
  if (isNaN(num)) return '--';
  if (num === 0) return '0.0';
  return num > 0 ? `+${num.toFixed(1)}` : num.toFixed(1);
}

// Get trend icon and color
function getTrendConfig(trend: FocusArea['trend']) {
  switch (trend) {
    case 'improving':
      return {
        icon: IconTrendingUp,
        color: 'text-primary-500',
        bgColor: 'bg-primary-50',
        label: 'Improving',
      };
    case 'declining':
      return {
        icon: IconTrendingDown,
        color: 'text-red-500',
        bgColor: 'bg-red-50',
        label: 'Needs Work',
      };
    default:
      return {
        icon: IconActivity,
        color: 'text-warm-400',
        bgColor: 'bg-warm-50',
        label: 'Stable',
      };
  }
}

// Get strokes color based on value
function getStrokesColor(value: number | string) {
  const num = Number(value ?? 0);
  if (num > 0.2) return 'text-primary-600';
  if (num < -0.5) return 'text-red-600';
  if (num < -0.2) return 'text-amber-600';
  return 'text-warm-600';
}

function FocusAreaCardContent({
  focusArea,
  index,
  interactive,
}: {
  focusArea: FocusArea;
  index: number;
  interactive: boolean;
}) {
  const trendConfig = getTrendConfig(focusArea.trend);
  const TrendIcon = trendConfig.icon;
  const strokesColor = getStrokesColor(focusArea.strokesGained);
  const isPositive = Number(focusArea.strokesGained ?? 0) > 0;

  return (
    <>
      {/* Priority indicator */}
      <div className={cn(
        'absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
        index === 0 ? 'bg-primary-100 text-primary-700' :
        index === 1 ? 'bg-primary-50 text-primary-600' :
        'bg-warm-100 text-warm-500'
      )}>
        {index + 1}
      </div>

      {/* Area name and trend */}
      <div className="flex items-center gap-2 mb-3 pr-8">
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center',
          trendConfig.bgColor
        )}>
          <TrendIcon size={16} className={trendConfig.color} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className={cn(
            'font-semibold text-warm-900 text-sm truncate transition-colors',
            interactive && 'group-hover:text-primary-600'
          )}>
            {focusArea.area}
          </h4>
          <span className={cn('text-xs font-medium', trendConfig.color)}>
            {trendConfig.label}
          </span>
        </div>
      </div>

      {/* Strokes gained display */}
      <div className="flex items-baseline gap-1 mb-3">
        <span className={cn('text-2xl font-bold tabular-nums', strokesColor)}>
          {formatStrokesGained(focusArea.strokesGained)}
        </span>
        <span className="text-xs text-warm-500">strokes/round</span>
      </div>

      {/* Visual bar for strokes */}
      <div className="relative h-2 bg-warm-100 rounded-full overflow-clip mb-3">
        <m.div
          initial={{ width: 0 }}
          animate={{
            width: `${Math.min(Math.abs(Number(focusArea.strokesGained ?? 0)) * 20, 100)}%`,
          }}
          transition={{ duration: 0.4, delay: 0.05 + index * 0.03, ease: [0.25, 0.1, 0.25, 1] }}
          className={cn(
            'absolute h-full rounded-full',
            isPositive ? 'bg-primary-400' : 'bg-red-400'
          )}
          style={{
            [isPositive ? 'left' : 'right']: '50%',
            transformOrigin: isPositive ? 'right' : 'left',
          }}
        />
        {/* Center marker */}
        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-warm-300 -translate-x-1/2" />
      </div>

      {/* Recommendation snippet */}
      <p className="text-xs text-warm-500 line-clamp-2 mb-2">
        {focusArea.recommendation}
      </p>

      {/* View details hint (only when interactive) */}
      {interactive && (
        <div className="flex items-center text-xs font-medium text-primary-600 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          View details
          <IconChevronRight size={14} className="ml-1" />
        </div>
      )}
    </>
  );
}

function FocusAreaCard({
  focusArea,
  index,
  onClick,
}: {
  focusArea: FocusArea;
  index: number;
  onClick?: () => void;
}) {
  const interactive = !!onClick;

  const sharedClassName = cn(
    'relative w-full p-4 rounded-xl border text-left transition-all duration-200',
    'glass-standard',
    interactive && 'hover:bg-white/90 hover:shadow-lg hover:-translate-y-0.5 group cursor-pointer'
  );

  if (interactive) {
    return (
      <button onClick={onClick} className={sharedClassName}>
        <FocusAreaCardContent focusArea={focusArea} index={index} interactive />
      </button>
    );
  }

  return (
    <Link href="/golf/dashboard/my-development" className={sharedClassName}>
      <FocusAreaCardContent focusArea={focusArea} index={index} interactive />
    </Link>
  );
}

export function FocusAreasGrid({ focusAreas, onAreaClick }: FocusAreasGridProps) {
  // Empty state
  if (focusAreas.length === 0) {
    return (
      <GlassCard>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
            <IconTarget size={20} className="text-primary-600" />
          </div>
          <div>
            <h3 className="font-semibold text-warm-900">Focus Areas</h3>
            <p className="text-xs text-warm-500">Areas to prioritize in practice</p>
          </div>
        </div>

        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-3">
            <IconTarget size={24} className="text-warm-400" />
          </div>
          <p className="text-sm text-warm-600 mb-1">No focus areas identified yet</p>
          <p className="text-xs text-warm-400">
            Complete more rounds to unlock personalized focus areas
          </p>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard>
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
          <IconTarget size={20} className="text-primary-600" />
        </div>
        <div>
          <h3 className="font-semibold text-warm-900">Focus Areas</h3>
          <p className="text-xs text-warm-500">
            Prioritize these areas in your practice
          </p>
        </div>
      </div>

      {/* Grid of focus areas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {focusAreas.map((area, index) => (
          <FocusAreaCard
            key={area.area}
            focusArea={area}
            index={index}
            onClick={onAreaClick ? () => onAreaClick(area) : undefined}
          />
        ))}
      </div>

      {/* Legend */}
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="flex items-center justify-center gap-6 mt-5 pt-4 border-t border-white/20"
      >
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-primary-400" />
          <span className="text-xs text-warm-500">Gaining strokes</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <span className="text-xs text-warm-500">Losing strokes</span>
        </div>
      </m.div>
    </GlassCard>
  );
}
