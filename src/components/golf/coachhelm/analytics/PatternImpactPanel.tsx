'use client';

/**
 * PatternImpactPanel - Shows patterns detected vs addressed
 *
 * Displays total strokes saved, most impactful patterns,
 * and pattern lifecycle funnel (detected -> confirmed -> addressed -> resolved).
 */

import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { BarChart, Bar, Cell, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '@/lib/utils';
import { ChartShell } from '@/components/ui';
import { ChartTooltip } from '@/components/ui/chart-tooltip';
import {
  IconChartRadar,
  IconCheck,
  IconTrendingUp,
  IconTrendingDown,
} from '@/components/icons';
import type { PatternImpactData, ImpactfulPattern } from '@/app/golf/actions/coachhelm-analytics';

interface PatternImpactPanelProps {
  data: PatternImpactData;
  compact?: boolean;
  className?: string;
}

const LIFECYCLE_COLORS = {
  detected: '#94A3B8',
  confirmed: '#3B82F6',
  addressed: '#F59E0B',
  resolved: '#16A34A',
  dismissed: '#6B7280',
};

const LIFECYCLE_LABELS = {
  detected: 'Detected',
  confirmed: 'Confirmed',
  addressed: 'Addressed',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

export function PatternImpactPanel({
  data,
  compact = false,
  className,
}: PatternImpactPanelProps) {
  const prefersReducedMotion = useReducedMotion();
  const hasPatterns = data.patternsDetected > 0;

  // Prepare lifecycle-distribution chart data (W5B: rendered as a horizontal
  // bar chart, not a donut — synthesis §5, no pie/donut chrome).
  const lifecycleChartData = useMemo(() => {
    return Object.entries(data.lifecycle)
      .filter(([, count]) => count > 0)
      .map(([state, count]) => ({
        name: LIFECYCLE_LABELS[state as keyof typeof LIFECYCLE_LABELS],
        value: count,
        color: LIFECYCLE_COLORS[state as keyof typeof LIFECYCLE_COLORS],
      }));
  }, [data.lifecycle]);

  // Compact view for overview tab
  if (compact) {
    return (
      <div className={cn('space-y-4', className)}>
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <StatCard
            label="Detected"
            value={data.patternsDetected}
            icon={<IconChartRadar size={14} className="text-warm-500" />}
            color="slate"
          />
          <StatCard
            label="Resolved"
            value={data.patternsResolved}
            icon={<IconCheck size={14} className="text-primary-500" />}
            color="green"
          />
          <StatCard
            label="Strokes Saved"
            value={data.totalStrokesSaved.toFixed(1)}
            icon={<IconTrendingUp size={14} className="text-primary-500" />}
            color="primary"
          />
        </div>

        {/* Conversion Rate */}
        <div className="p-3 bg-warm-50 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-warm-500">Resolution Rate</span>
            <span
              className={cn(
                'text-body-sm font-medium',
                data.conversionRate >= 0.5 ? 'text-primary-600' : 'text-amber-600'
              )}
            >
              {Math.round(data.conversionRate * 100)}%
            </span>
          </div>
          <div className="h-1.5 bg-white rounded-full overflow-hidden">
            <motion.div
              className={cn(
                'h-full rounded-full',
                data.conversionRate >= 0.5 ? 'bg-primary-500' : 'bg-amber-500'
              )}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(data.conversionRate * 100, 100)}%` }}
              transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.8, ease: 'easeOut' })}
            />
          </div>
        </div>

        {/* Top Patterns */}
        {data.topPatterns.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-warm-500 uppercase tracking-wide">
              Top Impactful Patterns
            </p>
            {data.topPatterns.slice(0, 2).map((pattern, i) => (
              <PatternRow key={pattern.id} pattern={pattern} index={i} compact />
            ))}
          </div>
        )}

        {!hasPatterns && <EmptyState compact />}
      </div>
    );
  }

  // Full view for patterns tab
  return (
    <div className={cn('space-y-6', className)}>
      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCardLarge
          label="Patterns Detected"
          value={data.patternsDetected}
          subtext="Total found"
        />
        <StatCardLarge
          label="Patterns Addressed"
          value={data.patternsAddressed}
          subtext="Being worked on"
          color={data.patternsAddressed > 0 ? 'amber' : 'slate'}
        />
        <StatCardLarge
          label="Patterns Resolved"
          value={data.patternsResolved}
          subtext="Successfully fixed"
          color={data.patternsResolved > 0 ? 'green' : 'slate'}
        />
        <StatCardLarge
          label="Strokes Saved"
          value={data.totalStrokesSaved.toFixed(1)}
          subtext="Estimated impact"
          color="green"
        />
      </div>

      {/* Lifecycle Funnel and Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Lifecycle Funnel */}
        <div className="bg-cream-100/75 backdrop-blur-xl rounded-2xl border border-white/20 p-4">
          <h4 className="text-sm font-medium text-warm-700 mb-4">Pattern Lifecycle Funnel</h4>
          <LifecycleFunnel data={data.lifecycle} />
          <div className="mt-4 p-3 bg-warm-50 rounded-lg">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-warm-700">Conversion Rate</span>
              <span
                className={cn(
                  'text-body-lg font-medium tracking-[-0.005em]',
                  data.conversionRate >= 0.5 ? 'text-primary-600' : 'text-amber-600'
                )}
              >
                {Math.round(data.conversionRate * 100)}%
              </span>
            </div>
            <p className="text-xs text-warm-500">
              Percentage of detected patterns that are fully resolved
            </p>
          </div>
        </div>

        {/* Lifecycle Distribution Chart — W5B: donut → horizontal bar via
            ChartShell. Each lifecycle state keeps its own semantic color
            (preserved via <Cell>), the per-state count is the bar length, and
            the legend + tooltip carry the same name/value read the donut did. */}
        {lifecycleChartData.length > 0 && (
          <ChartShell
            title="Current Distribution"
            noEntrance
            className="bg-cream-100/75 backdrop-blur-xl border-white/20 rounded-2xl p-4 shadow-none"
          >
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={lifecycleChartData}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                >
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: '#78716c' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 12, fill: '#374151', fontWeight: 500 }}
                    axisLine={false}
                    tickLine={false}
                    width={72}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(120,113,108,0.08)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length || !payload[0]) return null;
                      const d = payload[0].payload as { name: string; value: number };
                      // Counts are integers; " patterns" suffix preserves the
                      // original "5 patterns" reading exactly.
                      return (
                        <ChartTooltip
                          label={d.name}
                          rows={[{ name: '', value: d.value, suffix: ' patterns' }]}
                          formatter={(v) => Math.round(v).toLocaleString()}
                        />
                      );
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                    {lifecycleChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap justify-center gap-3 mt-2">
              {lifecycleChartData.map((d) => (
                <span key={d.name} className="flex items-center gap-1 text-xs text-warm-600">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                  {d.name} ({d.value})
                </span>
              ))}
            </div>
          </ChartShell>
        )}
      </div>

      {/* Top Impactful Patterns */}
      {data.topPatterns.length > 0 && (
        <div className="bg-cream-100/75 backdrop-blur-xl rounded-2xl border border-white/20 overflow-hidden">
          <div className="px-4 py-3 border-b border-warm-100">
            <h4 className="text-sm font-medium text-warm-700">Most Impactful Patterns</h4>
          </div>
          <div className="divide-y divide-warm-100">
            {data.topPatterns.map((pattern, index) => (
              <PatternRow key={pattern.id} pattern={pattern} index={index} />
            ))}
          </div>
        </div>
      )}

      {!hasPatterns && <EmptyState />}
    </div>
  );
}

// Helper Components

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: 'slate' | 'green' | 'primary';
}) {
  const colors = {
    slate: 'bg-warm-50 border-warm-100',
    green: 'bg-primary-50 border-primary-100',
    primary: 'bg-primary-50 border-primary-100',
  };

  return (
    <div className={cn('p-3 rounded-xl border', colors[color])}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-warm-500">{label}</span>
      </div>
      <span className="text-body-lg font-medium tracking-[-0.005em] text-warm-900">{value}</span>
    </div>
  );
}

function StatCardLarge({
  label,
  value,
  subtext,
  color = 'slate',
}: {
  label: string;
  value: string | number;
  subtext: string;
  color?: 'green' | 'amber' | 'slate';
}) {
  return (
    <div className="p-4 bg-warm-50 rounded-xl">
      <p className="text-xs font-medium text-warm-500 uppercase tracking-wide mb-1">{label}</p>
      <p
        className={cn(
          'text-h2 md:text-h1 font-light tabular-nums tracking-[-0.025em]',
          color === 'green' && 'text-primary-600',
          color === 'amber' && 'text-amber-600',
          color === 'slate' && 'text-warm-900'
        )}
      >
        {value}
      </p>
      <p className="text-xs text-warm-400 mt-1">{subtext}</p>
    </div>
  );
}

function LifecycleFunnel({ data }: { data: PatternImpactData['lifecycle'] }) {
  const prefersReducedMotion = useReducedMotion();
  const stages = [
    { key: 'detected', label: 'Detected', value: data.detected, color: LIFECYCLE_COLORS.detected },
    { key: 'confirmed', label: 'Confirmed', value: data.confirmed, color: LIFECYCLE_COLORS.confirmed },
    { key: 'addressed', label: 'Addressed', value: data.addressed, color: LIFECYCLE_COLORS.addressed },
    { key: 'resolved', label: 'Resolved', value: data.resolved, color: LIFECYCLE_COLORS.resolved },
  ];

  const maxValue = Math.max(...stages.map((s) => s.value), 1);

  return (
    <div className="space-y-2">
      {stages.map((stage, index) => {
        const widthPercent = (stage.value / maxValue) * 100;
        const nextStage = stages[index + 1];
        const conversionToNext =
          nextStage && stage.value > 0
            ? Math.round((nextStage.value / stage.value) * 100)
            : null;

        return (
          <div key={stage.key}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-warm-600">{stage.label}</span>
              <span className="text-xs text-warm-500">{stage.value}</span>
            </div>
            <motion.div
              className="h-6 rounded-lg overflow-hidden bg-warm-100"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={prefersReducedMotion ? { duration: 0 } : ({ delay: index * 0.1 })}
            >
              <motion.div
                className="h-full rounded-lg flex items-center justify-end pr-2"
                style={{ backgroundColor: stage.color }}
                initial={{ width: 0 }}
                animate={{ width: `${widthPercent}%` }}
                transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.6, delay: index * 0.1, ease: 'easeOut' })}
              >
                {widthPercent > 20 && (
                  <span className="text-xs font-medium text-white">{stage.value}</span>
                )}
              </motion.div>
            </motion.div>
            {conversionToNext !== null && nextStage && (
              <div className="flex items-center gap-1 mt-1 ml-2">
                <span className="text-xs text-warm-400">
                  {conversionToNext}% to {nextStage.label.toLowerCase()}
                </span>
              </div>
            )}
          </div>
        );
      })}

      {/* Dismissed row (separate) */}
      {data.dismissed > 0 && (
        <div className="pt-2 mt-2 border-t border-warm-100">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-warm-500">Dismissed</span>
            <span className="text-xs text-warm-400">{data.dismissed}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function PatternRow({
  pattern,
  index,
  compact = false,
}: {
  pattern: ImpactfulPattern;
  index: number;
  compact?: boolean;
}) {
  const prefersReducedMotion = useReducedMotion();
  const stateColors: Record<string, { bg: string; text: string }> = {
    detected: { bg: 'bg-warm-100', text: 'text-warm-600' },
    confirmed: { bg: 'bg-blue-100', text: 'text-blue-700' },
    addressed: { bg: 'bg-amber-100', text: 'text-amber-700' },
    resolved: { bg: 'bg-primary-100', text: 'text-primary-700' },
    dismissed: { bg: 'bg-warm-100', text: 'text-warm-500' },
  };

  const stateStyle = stateColors[pattern.lifecycleState] || stateColors.detected;

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={prefersReducedMotion ? { duration: 0 } : ({ delay: index * 0.1 })}
        className="flex items-center justify-between p-2 bg-warm-50 rounded-lg"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm text-warm-700 truncate">{pattern.description}</p>
          <p className="text-xs text-warm-400">{pattern.playerName}</p>
        </div>
        <div className="flex items-center gap-2 ml-2">
          <span
            className={cn(
              'text-xs font-medium',
              pattern.strokesImpact > 0 ? 'text-red-600' : 'text-primary-600'
            )}
          >
            {pattern.strokesImpact > 0 ? '+' : ''}
            {pattern.strokesImpact.toFixed(1)}
          </span>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={prefersReducedMotion ? { duration: 0 } : ({ delay: index * 0.05 })}
      className="px-4 py-3 hover:bg-warm-50 active:bg-warm-100 transition-colors"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-warm-900">{pattern.description}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-warm-500">{pattern.playerName}</span>
            <span className="text-warm-300">|</span>
            <span className="text-xs text-warm-400">
              {Math.round(pattern.confidence * 100)}% confidence
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Strokes Impact */}
          <div className="text-right">
            <div
              className={cn(
                'flex items-center gap-1',
                pattern.strokesImpact > 0 ? 'text-red-600' : 'text-primary-600'
              )}
            >
              {pattern.strokesImpact > 0 ? (
                <IconTrendingDown size={14} />
              ) : (
                <IconTrendingUp size={14} />
              )}
              <span className="text-body-sm font-medium tabular-nums">
                {pattern.strokesImpact > 0 ? '+' : ''}
                {pattern.strokesImpact.toFixed(1)}
              </span>
            </div>
            <span className="text-xs text-warm-400">strokes/round</span>
          </div>

          {/* State Badge */}
          <span
            className={cn(
              'px-2 py-0.5 text-xs font-medium rounded-full',
              stateStyle?.bg ?? 'bg-warm-100',
              stateStyle?.text ?? 'text-warm-600'
            )}
          >
            {LIFECYCLE_LABELS[pattern.lifecycleState as keyof typeof LIFECYCLE_LABELS] ||
              pattern.lifecycleState}
          </span>
        </div>
      </div>

      {/* Dates */}
      <div className="flex items-center gap-4 mt-2 text-xs text-warm-400">
        <span>Detected: {formatDate(pattern.detectedAt)}</span>
        {pattern.resolvedAt && <span>Resolved: {formatDate(pattern.resolvedAt)}</span>}
      </div>
    </motion.div>
  );
}

function EmptyState({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn('text-center', compact ? 'py-4' : 'py-8')}>
      <div
        className={cn(
          'mx-auto mb-3 rounded-xl bg-warm-100 flex items-center justify-center',
          compact ? 'w-10 h-10' : 'w-12 h-12'
        )}
      >
        <IconChartRadar size={compact ? 20 : 24} className="text-warm-400" />
      </div>
      <h4 className={cn('font-medium text-warm-700 mb-1', compact ? 'text-xs' : 'text-sm')}>
        No Patterns Detected
      </h4>
      <p className={cn('text-warm-500 max-w-xs mx-auto', compact ? 'text-xs' : 'text-xs')}>
        Pattern detection requires round data. As players log more rounds, patterns will emerge.
      </p>
    </div>
  );
}

// Utility functions

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
