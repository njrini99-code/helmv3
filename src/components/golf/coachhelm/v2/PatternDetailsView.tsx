'use client';

/**
 * PatternDetailsView - Displays pattern details in "IF X AND Y THEN Z" format
 *
 * Features:
 * - Pattern conditions as logical statements
 * - Statistical metrics: support, confidence, lift
 * - Stroke impact visualization (positive/negative bar)
 * - Occurrence count and trend
 * - Actionability score
 */

import { cn } from '@/lib/utils';
import {
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
  IconTarget,
} from '@/components/icons';
import type { MinedPattern, PatternCondition, ConditionOperator } from '@/lib/coachhelm/v2/types';

interface PatternDetailsViewProps {
  pattern: MinedPattern;
  /** Compact mode for embedding in other views */
  compact?: boolean;
}

const operatorLabels: Record<ConditionOperator, string> = {
  eq: 'equals',
  neq: 'does not equal',
  gt: 'greater than',
  gte: 'at least',
  lt: 'less than',
  lte: 'at most',
  between: 'between',
  in: 'is one of',
  not_in: 'is not one of',
  contains: 'contains',
};

const trendIcons = {
  strengthening: { icon: IconTrendingUp, color: 'text-primary-500', label: 'Strengthening' },
  stable: { icon: IconMinus, color: 'text-warm-400', label: 'Stable' },
  weakening: { icon: IconTrendingDown, color: 'text-amber-500', label: 'Weakening' },
  new: { icon: IconTarget, color: 'text-blue-500', label: 'New' },
};

export function PatternDetailsView({ pattern, compact = false }: PatternDetailsViewProps) {
  const trendInfo = trendIcons[pattern.trend];
  const TrendIcon = trendInfo.icon;
  const isPositiveImpact = pattern.strokeImpact < 0;

  // Build the IF-THEN statement
  const conditions = pattern.conditions.map((c) => formatCondition(c)).join(' AND ');
  const outcome = formatOutcome(pattern);

  if (compact) {
    return (
      <div className="space-y-3">
        {/* Compact IF-THEN */}
        <div className="text-sm">
          <span className="font-medium text-blue-600">IF </span>
          <span className="text-warm-700">{conditions}</span>
          <span className="font-medium text-primary-600"> THEN </span>
          <span className="text-warm-700">{outcome}</span>
        </div>

        {/* Key stats row */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <span className="text-warm-400">Confidence:</span>
            <span className="font-medium text-warm-700">
              {Math.round(pattern.confidence * 100)}%
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-warm-400">Impact:</span>
            <span
              className={cn(
                'font-medium',
                isPositiveImpact ? 'text-primary-600' : 'text-red-600'
              )}
            >
              {isPositiveImpact ? '' : '+'}
              {pattern.strokeImpact.toFixed(1)} strokes
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pattern statement */}
      <div className="bg-gradient-to-r from-warm-50 to-blue-50 border border-warm-200 rounded-xl p-4">
        <h3 className="text-xs font-medium text-warm-500 uppercase tracking-wide mb-3">
          Pattern Statement
        </h3>
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <span className="flex-shrink-0 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
              IF
            </span>
            <p className="text-sm text-warm-700">{conditions}</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="flex-shrink-0 px-2 py-0.5 bg-primary-100 text-primary-700 text-xs font-medium rounded">
              THEN
            </span>
            <p className="text-sm text-warm-700">{outcome}</p>
          </div>
        </div>
      </div>

      {/* Individual conditions breakdown */}
      <div>
        <h3 className="text-sm font-medium text-warm-900 mb-3">Conditions</h3>
        <div className="space-y-2">
          {pattern.conditions.map((condition, i) => (
            <div
              key={i}
              className="flex items-center gap-3 bg-white border border-warm-200 rounded-lg px-3 py-2"
            >
              <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-medium flex items-center justify-center">
                {i + 1}
              </span>
              <div className="flex-1">
                <p className="text-sm text-warm-700">
                  <span className="font-medium">{condition.label || condition.field}</span>{' '}
                  <span className="text-warm-500">{operatorLabels[condition.operator]}</span>{' '}
                  <span className="font-medium">{formatValue(condition.value)}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Statistical metrics */}
      <div>
        <h3 className="text-sm font-medium text-warm-900 mb-3">Statistical Metrics</h3>
        <div className="grid grid-cols-2 gap-4">
          <MetricCard
            label="Support"
            value={`${(pattern.support * 100).toFixed(1)}%`}
            description="How often conditions occur"
          />
          <MetricCard
            label="Confidence"
            value={`${Math.round(pattern.confidence * 100)}%`}
            description="When conditions occur, outcome happens"
          />
          <MetricCard
            label="Lift"
            value={pattern.lift.toFixed(2)}
            description="How much more likely than random"
            highlight={pattern.lift > 2}
          />
          <MetricCard
            label="Conviction"
            value={pattern.conviction.toFixed(2)}
            description="Strength of implication"
          />
        </div>
      </div>

      {/* Stroke impact visualization */}
      <div>
        <h3 className="text-sm font-medium text-warm-900 mb-3">Stroke Impact</h3>
        <div className="bg-white border border-warm-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-warm-600">Strokes per Round</span>
            <span
              className={cn(
                'text-lg font-medium',
                isPositiveImpact ? 'text-primary-600' : 'text-red-600'
              )}
            >
              {isPositiveImpact ? '' : '+'}
              {pattern.strokeImpact.toFixed(1)}
            </span>
          </div>
          {/* Visual bar */}
          <div className="h-4 bg-warm-100 rounded-full overflow-hidden relative">
            <div className="absolute inset-y-0 left-1/2 w-px bg-warm-300" />
            <div
              className={cn(
                'absolute inset-y-0 rounded-full',
                isPositiveImpact
                  ? 'right-1/2 bg-primary-500'
                  : 'left-1/2 bg-red-500'
              )}
              style={{
                width: `${Math.min(Math.abs(pattern.strokeImpact) * 10, 50)}%`,
              }}
            />
          </div>
          <div className="flex items-center justify-between mt-2 text-xs text-warm-400">
            <span>Saves strokes</span>
            <span>Costs strokes</span>
          </div>
        </div>
      </div>

      {/* Occurrence info */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-warm-50 rounded-xl p-4">
          <h4 className="text-xs font-medium text-warm-500 uppercase tracking-wide mb-1">
            Occurrences
          </h4>
          <p className="text-2xl font-medium text-warm-900">
            {pattern.occurrenceCount}
          </p>
          <p className="text-xs text-warm-500 mt-1">
            From {pattern.sampleSize} total rounds
          </p>
        </div>

        <div className="bg-warm-50 rounded-xl p-4">
          <h4 className="text-xs font-medium text-warm-500 uppercase tracking-wide mb-1">
            Trend
          </h4>
          <div className="flex items-center gap-2">
            <TrendIcon size={20} className={trendInfo.color} />
            <span className="text-[17px] font-medium text-warm-900 tracking-[-0.012em]">
              {trendInfo.label}
            </span>
          </div>
          <p className="text-xs text-warm-500 mt-1">
            Last seen: {new Date(pattern.lastOccurrence).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Actionability score */}
      <div className="bg-gradient-to-r from-primary-50 to-primary-50 border border-primary-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-warm-900">Actionability Score</h4>
          <span className="text-lg font-medium text-primary-600">
            {Math.round(pattern.actionability * 100)}%
          </span>
        </div>
        <div className="h-2 bg-primary-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-600 rounded-full"
            style={{ width: `${pattern.actionability * 100}%` }}
          />
        </div>
        <p className="text-xs text-warm-500 mt-2">
          {pattern.actionability >= 0.7
            ? 'Highly actionable - specific practice can address this'
            : pattern.actionability >= 0.4
            ? 'Moderately actionable - requires focused attention'
            : 'Lower actionability - may be situational'}
        </p>
      </div>

      {/* Recommendation */}
      {pattern.recommendation && (
        <div className="border border-warm-200 rounded-xl p-4">
          <h4 className="text-xs font-medium text-warm-500 uppercase tracking-wide mb-2">
            Recommendation
          </h4>
          <p className="text-sm text-warm-700">{pattern.recommendation}</p>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  description,
  highlight = false,
}: {
  label: string;
  value: string;
  description: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'bg-white border rounded-lg p-3',
        highlight ? 'border-primary-200 bg-primary-50' : 'border-warm-200'
      )}
    >
      <p className="text-xs text-warm-500 mb-1">{label}</p>
      <p
        className={cn(
          'text-lg font-medium',
          highlight ? 'text-primary-600' : 'text-warm-900'
        )}
      >
        {value}
      </p>
      <p className="text-xs text-warm-400 mt-1">{description}</p>
    </div>
  );
}

// Helper functions
function formatCondition(condition: PatternCondition): string {
  const field = condition.label || condition.field;
  const op = operatorLabels[condition.operator];
  const value = formatValue(condition.value);
  return `${field} ${op} ${value}`;
}

function formatValue(value: number | string | boolean | number[] | string[]): string {
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  if (typeof value === 'boolean') {
    return value ? 'yes' : 'no';
  }
  return String(value);
}

function formatOutcome(pattern: MinedPattern): string {
  const { outcome } = pattern;
  const direction =
    outcome.direction === 'increase'
      ? 'increases'
      : outcome.direction === 'decrease'
      ? 'decreases'
      : 'is';

  const comparison =
    outcome.comparison === 'vs_baseline'
      ? 'vs baseline'
      : outcome.comparison === 'vs_expected'
      ? 'vs expected'
      : '';

  const magnitude = outcome.magnitude ? ` by ${outcome.magnitude}` : '';

  return `${outcome.metric} ${direction}${magnitude} ${comparison}`.trim();
}
