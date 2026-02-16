'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/glass-card';
import {
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
  IconSparkles,
  IconCheck,
  IconX,
  IconTarget,
  IconActivity,
} from '@/components/icons';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { ExtendedPattern } from '@/app/golf/actions/pattern-management';

// ============================================================================
// TYPES
// ============================================================================

interface PatternTimelineProps {
  patterns: ExtendedPattern[];
}

interface TimelineEvent {
  date: string;
  dateFormatted: string;
  patternId: string;
  type: 'detected' | 'confirmed' | 'addressed' | 'resolved' | 'dismissed';
  patternType: string;
  description: string;
  playerName?: string;
  strokeImpact: number;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatFullDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ============================================================================
// PATTERN TIMELINE COMPONENT
// ============================================================================

export function PatternTimeline({ patterns }: PatternTimelineProps) {
  // Build timeline events from patterns
  const timelineEvents = useMemo(() => {
    const events: TimelineEvent[] = [];

    for (const pattern of patterns) {
      // First detected event
      events.push({
        date: pattern.firstDetected,
        dateFormatted: formatFullDate(pattern.firstDetected),
        patternId: pattern.id,
        type: 'detected',
        patternType: pattern.patternType,
        description: pattern.description || 'Pattern detected',
        playerName: pattern.playerName,
        strokeImpact: pattern.strokeImpact,
      });

      // Add lifecycle events
      if (pattern.validatedAt) {
        events.push({
          date: pattern.validatedAt,
          dateFormatted: formatFullDate(pattern.validatedAt),
          patternId: pattern.id,
          type: 'confirmed',
          patternType: pattern.patternType,
          description: 'Pattern confirmed by coach',
          playerName: pattern.playerName,
          strokeImpact: pattern.strokeImpact,
        });
      }

      if (pattern.addressedAt) {
        events.push({
          date: pattern.addressedAt,
          dateFormatted: formatFullDate(pattern.addressedAt),
          patternId: pattern.id,
          type: 'addressed',
          patternType: pattern.patternType,
          description: 'Working on pattern',
          playerName: pattern.playerName,
          strokeImpact: pattern.strokeImpact,
        });
      }

      if (pattern.resolvedAt) {
        events.push({
          date: pattern.resolvedAt,
          dateFormatted: formatFullDate(pattern.resolvedAt),
          patternId: pattern.id,
          type: 'resolved',
          patternType: pattern.patternType,
          description: 'Pattern resolved',
          playerName: pattern.playerName,
          strokeImpact: pattern.strokeImpact,
        });
      }

      if (pattern.dismissedAt) {
        events.push({
          date: pattern.dismissedAt,
          dateFormatted: formatFullDate(pattern.dismissedAt),
          patternId: pattern.id,
          type: 'dismissed',
          patternType: pattern.patternType,
          description: pattern.dismissedReason || 'Pattern dismissed',
          playerName: pattern.playerName,
          strokeImpact: pattern.strokeImpact,
        });
      }
    }

    // Sort by date descending (newest first)
    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [patterns]);

  // Build chart data - pattern frequency over time
  const chartData = useMemo(() => {
    const dateCounts = new Map<string, { detected: number; resolved: number }>();

    // Get last 30 days
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0]!;
      dateCounts.set(dateKey, { detected: 0, resolved: 0 });
    }

    // Count events per day
    for (const event of timelineEvents) {
      const dateKey = new Date(event.date).toISOString().split('T')[0]!;
      const existing = dateCounts.get(dateKey);
      if (existing) {
        if (event.type === 'detected') {
          existing.detected++;
        } else if (event.type === 'resolved') {
          existing.resolved++;
        }
      }
    }

    return Array.from(dateCounts.entries()).map(([date, counts]) => ({
      date,
      dateFormatted: formatDate(date),
      detected: counts.detected,
      resolved: counts.resolved,
      net: counts.detected - counts.resolved,
    }));
  }, [timelineEvents]);

  // Pattern trend summary
  const trendSummary = useMemo(() => {
    const last7Days = timelineEvents.filter(e => {
      const eventDate = new Date(e.date);
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return eventDate >= weekAgo;
    });

    const detected = last7Days.filter(e => e.type === 'detected').length;
    const resolved = last7Days.filter(e => e.type === 'resolved').length;
    const net = detected - resolved;

    return {
      detected,
      resolved,
      net,
      trend: net > 0 ? 'increasing' as const : net < 0 ? 'decreasing' as const : 'stable' as const,
    };
  }, [timelineEvents]);

  // Event type config
  const eventConfig: Record<TimelineEvent['type'], {
    icon: React.ReactNode;
    bg: string;
    border: string;
    text: string;
    label: string;
  }> = {
    detected: {
      icon: <IconSparkles size={14} />,
      bg: 'bg-blue-100',
      border: 'border-blue-300',
      text: 'text-blue-700',
      label: 'Detected',
    },
    confirmed: {
      icon: <IconCheck size={14} />,
      bg: 'bg-primary-100',
      border: 'border-primary-300',
      text: 'text-primary-700',
      label: 'Confirmed',
    },
    addressed: {
      icon: <IconTarget size={14} />,
      bg: 'bg-amber-100',
      border: 'border-amber-300',
      text: 'text-amber-700',
      label: 'In Progress',
    },
    resolved: {
      icon: <IconCheck size={14} />,
      bg: 'bg-primary-100',
      border: 'border-primary-300',
      text: 'text-primary-700',
      label: 'Resolved',
    },
    dismissed: {
      icon: <IconX size={14} />,
      bg: 'bg-warm-100',
      border: 'border-warm-300',
      text: 'text-warm-500',
      label: 'Dismissed',
    },
  };

  if (patterns.length === 0) {
    return (
      <GlassCard padding="lg" hover={false}>
        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-4">
            <IconActivity size={24} className="text-warm-400" />
          </div>
          <h3 className="text-lg font-medium text-warm-900 mb-2">
            No timeline data
          </h3>
          <p className="text-sm text-warm-500">
            Pattern timeline will appear as patterns are detected and managed.
          </p>
        </div>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-6">
      {/* Trend summary card */}
      <GlassCard padding="md" hover={false}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-warm-500 mb-1">Last 7 Days</h3>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-semibold text-warm-900">
                  {trendSummary.detected}
                </span>
                <span className="text-sm text-warm-500">detected</span>
              </div>
              <div className="text-warm-300">|</div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-semibold text-primary-600">
                  {trendSummary.resolved}
                </span>
                <span className="text-sm text-warm-500">resolved</span>
              </div>
            </div>
          </div>

          <div className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg',
            trendSummary.trend === 'increasing' && 'bg-red-50 text-red-700',
            trendSummary.trend === 'decreasing' && 'bg-primary-50 text-primary-700',
            trendSummary.trend === 'stable' && 'bg-warm-50 text-warm-600',
          )}>
            {trendSummary.trend === 'increasing' && <IconTrendingUp size={20} />}
            {trendSummary.trend === 'decreasing' && <IconTrendingDown size={20} />}
            {trendSummary.trend === 'stable' && <IconMinus size={20} />}
            <span className="font-medium capitalize">
              {trendSummary.trend === 'increasing' ? 'Patterns Increasing' :
               trendSummary.trend === 'decreasing' ? 'Patterns Resolving' :
               'Stable'}
            </span>
          </div>
        </div>
      </GlassCard>

      {/* Chart */}
      <GlassCard padding="md" hover={false}>
        <h3 className="text-sm font-medium text-warm-700 mb-4">Pattern Activity (Last 30 Days)</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis
                dataKey="dateFormatted"
                tick={{ fontSize: 11, fill: '#78716c' }}
                tickLine={false}
                axisLine={{ stroke: '#e7e5e4' }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#78716c' }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e7e5e4',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                }}
                labelStyle={{ fontWeight: 600, marginBottom: 4 }}
              />
              <ReferenceLine y={0} stroke="#a8a29e" strokeDasharray="3 3" />
              <Line
                type="monotone"
                dataKey="detected"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                name="Detected"
              />
              <Line
                type="monotone"
                dataKey="resolved"
                stroke="#22c55e"
                strokeWidth={2}
                dot={false}
                name="Resolved"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      {/* Timeline events */}
      <GlassCard padding="md" hover={false}>
        <h3 className="text-sm font-medium text-warm-700 mb-4">Recent Activity</h3>
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-2 bottom-2 w-px bg-warm-200" />

          {/* Events */}
          <div className="space-y-4">
            {timelineEvents.slice(0, 20).map((event, index) => {
              const config = eventConfig[event.type];

              return (
                <motion.div
                  key={`${event.patternId}-${event.type}-${index}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-start gap-3 relative"
                >
                  {/* Event dot */}
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 relative z-10',
                    config.bg,
                    config.text
                  )}>
                    {config.icon}
                  </div>

                  {/* Event content */}
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={cn(
                        'text-xs font-medium px-2 py-0.5 rounded-full',
                        config.bg,
                        config.text
                      )}>
                        {config.label}
                      </span>
                      <span className="text-xs text-warm-400">
                        {event.dateFormatted}
                      </span>
                    </div>

                    <p className="text-sm text-warm-700 line-clamp-1">
                      {event.description}
                    </p>

                    {event.playerName && (
                      <p className="text-xs text-warm-500 mt-0.5">
                        {event.playerName}
                        {event.strokeImpact !== 0 && (
                          <span className={cn(
                            'ml-2',
                            event.strokeImpact > 0 ? 'text-red-500' : 'text-primary-600'
                          )}>
                            {event.strokeImpact > 0 ? '+' : ''}{event.strokeImpact.toFixed(1)} strokes
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>

          {timelineEvents.length > 20 && (
            <div className="mt-4 text-center">
              <span className="text-sm text-warm-500">
                And {timelineEvents.length - 20} more events...
              </span>
            </div>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
