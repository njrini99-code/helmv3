'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { getMatchScoreTier, formatMatchScore } from '@/lib/recruiting/match-calculator';
import type { MatchScoreBreakdown } from '@/lib/types';
import { RECRUITING_METRIC_LABELS } from '@/lib/types';
import { IconChevronDown, IconTarget, IconAlertCircle } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeTone } from '@/components/ui/badge';

// Match-score tier → canonical Badge tone (color-faithful). Tiers stay DISTINCT:
// excellent=primary, good=emerald, average=amber, below_average=orange, poor=red.
const TIER_TONE: Record<
  'excellent' | 'good' | 'average' | 'below_average' | 'poor',
  BadgeTone
> = {
  excellent: 'primary',
  good: 'emerald',
  average: 'amber',
  below_average: 'orange',
  poor: 'red',
};

interface MatchScoreBadgeProps {
  score: number;
  breakdown?: MatchScoreBreakdown;
  meetsStandards?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showBreakdown?: boolean;
  className?: string;
}

export function MatchScoreBadge({
  score,
  breakdown,
  meetsStandards = true,
  size = 'md',
  showBreakdown = false,
  className,
}: MatchScoreBadgeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const tier = getMatchScoreTier(score);

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-1.5 text-base',
  };

  // excellent uses the stronger primary-100 tint (Badge primary-soft is -50).
  const tierTintOverride: Record<typeof tier.tier, string> = {
    excellent: 'bg-primary-100',
    good: '',
    average: '',
    below_average: '',
    poor: '',
  };

  // Expandable-button color recipe (keeps the original bg/text/border strings).
  const tierColors = {
    excellent: 'bg-primary-100 text-primary-700 border-primary-200',
    good: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    average: 'bg-amber-50 text-amber-700 border-amber-200',
    below_average: 'bg-orange-50 text-orange-700 border-orange-200',
    poor: 'bg-red-50 text-red-700 border-red-200',
  };

  const tierBgGradient = {
    excellent: 'from-primary-500 to-primary-600',
    good: 'from-emerald-400 to-emerald-500',
    average: 'from-amber-400 to-amber-500',
    below_average: 'from-orange-400 to-orange-500',
    poor: 'from-red-400 to-red-500',
  };

  // Compact badge for list view
  if (!showBreakdown) {
    return (
      <Badge
        tone={TIER_TONE[tier.tier]}
        size="none"
        icon={<IconTarget size={size === 'sm' ? 12 : 16} className="flex-shrink-0" />}
        className={cn(
          'font-semibold',
          sizeClasses[size],
          tierTintOverride[tier.tier],
          !meetsStandards && 'opacity-60',
          className
        )}
      >
        <span className="tabular-nums">{formatMatchScore(score)}</span>
        {!meetsStandards && (
          <IconAlertCircle size={size === "sm" ? 12 : 16} className="flex-shrink-0" />
        )}
      </Badge>
    );
  }

  // Expandable badge with breakdown
  return (
    <div className={cn('relative', className)}>
      <Button variant="ghost"
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'flex items-center gap-2 rounded-xl font-semibold border transition-all',
          sizeClasses[size],
          tierColors[tier.tier],
          isExpanded && 'rounded-b-none',
          !meetsStandards && 'opacity-80'
        )}
      >
        <IconTarget size={16} />
        <span className="tabular-nums">{formatMatchScore(score)}</span>
        <span className="text-xs font-normal opacity-75">{tier.label}</span>
        {breakdown && (
          <IconChevronDown size={16} className={cn("transition-transform", isExpanded && "rotate-180")} />
        )}
      </Button>

      {/* Breakdown dropdown */}
      {isExpanded && breakdown && (
        <div className="absolute top-full left-0 right-0 z-10 bg-white rounded-b-xl border border-t-0 border-warm-200 shadow-lg overflow-hidden">
          {/* Score bar */}
          <div className="p-3 bg-warm-50">
            <div className="h-3 bg-warm-200 rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full bg-gradient-to-r', tierBgGradient[tier.tier])}
                style={{ width: `${score}%` }}
              />
            </div>
          </div>

          {/* Breakdown items */}
          <div className="divide-y divide-warm-100">
            {Object.entries(breakdown).map(([key, detail]) => {
              if (!detail) return null;
              const label = RECRUITING_METRIC_LABELS[key as keyof typeof RECRUITING_METRIC_LABELS];
              return (
                <div key={key} className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-warm-600">{label}</span>
                    <span className="text-xs text-warm-400">×{detail.weight}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-warm-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-500 rounded-full"
                        style={{ width: `${detail.percentile}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-warm-700 tabular-nums w-10 text-right">
                      {detail.percentile}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Standards warning */}
          {!meetsStandards && (
            <div className="px-3 py-2 bg-amber-50 border-t border-amber-100">
              <p className="text-xs text-amber-700 flex items-center gap-1.5">
                <IconAlertCircle size={14} />
                Below minimum standards
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Compact inline match score for player cards in list view.
 */
export function MatchScoreInline({
  score,
  className,
}: {
  score: number;
  className?: string;
}) {
  const tier = getMatchScoreTier(score);

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <div
        className={cn(
          'w-2 h-2 rounded-full',
          tier.tier === 'excellent' && 'bg-primary-500',
          tier.tier === 'good' && 'bg-emerald-500',
          tier.tier === 'average' && 'bg-amber-500',
          tier.tier === 'below_average' && 'bg-orange-500',
          tier.tier === 'poor' && 'bg-red-500'
        )}
      />
      <span className={cn('text-sm font-semibold tabular-nums', tier.color)}>
        {formatMatchScore(score)}
      </span>
    </div>
  );
}

/**
 * Match score progress ring for larger displays.
 */
export function MatchScoreRing({
  score,
  size = 64,
  className,
}: {
  score: number;
  size?: number;
  className?: string;
}) {
  const tier = getMatchScoreTier(score);
  const strokeWidth = size / 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;

  const strokeColors = {
    excellent: 'var(--color-primary-600)',
    good: '#10b981',
    average: '#f59e0b',
    below_average: '#f97316',
    poor: '#ef4444',
  };

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={strokeWidth}
        />
        {/* Progress ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColors[tier.tier]}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn('font-bold tabular-nums', tier.color)} style={{ fontSize: size / 4 }}>
          {Math.round(score)}
        </span>
      </div>
    </div>
  );
}
