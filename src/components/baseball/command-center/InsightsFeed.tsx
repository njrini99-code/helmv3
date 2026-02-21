'use client';

import { useState, useTransition } from 'react';
import type { BaseballCoachInsight } from '@/lib/types';
import {
  IconAlertCircle,
  IconTrendingUp,
  IconTrendingDown,
  IconBolt,
  IconCheck,
  IconX,
} from '@/components/icons';
import { dismissInsight, markInsightAddressed } from '@/app/baseball/actions/insights';

interface InsightsFeedProps {
  insights: BaseballCoachInsight[];
}

const insightIcons: Record<string, typeof IconAlertCircle> = {
  performance_decline: IconTrendingDown,
  performance_surge: IconTrendingUp,
  pressure_gap: IconAlertCircle,
  streak_hot: IconBolt,
  streak_cold: IconTrendingDown,
  plateau: IconAlertCircle,
  breakout_candidate: IconBolt,
  position_opportunity: IconAlertCircle,
  development_milestone: IconCheck,
  comparison_alert: IconAlertCircle,
};

const priorityColors: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  urgent: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  high: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  medium: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  low: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
};

export function InsightsFeed({ insights }: InsightsFeedProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [handledIds, setHandledIds] = useState<Set<string>>(new Set());

  const handleAcknowledge = (insightId: string) => {
    startTransition(async () => {
      const result = await markInsightAddressed(insightId);
      if (result.success) {
        setHandledIds(prev => new Set(prev).add(insightId));
        setExpandedId(null);
      }
    });
  };

  const handleDismiss = (insightId: string) => {
    startTransition(async () => {
      const result = await dismissInsight(insightId);
      if (result.success) {
        setHandledIds(prev => new Set(prev).add(insightId));
        setExpandedId(null);
      }
    });
  };

  // Filter out handled insights and sort by priority (critical/urgent first)
  const sortedInsights = [...insights]
    .filter(i => !handledIds.has(i.id))
    .sort((a, b) => {
      const priorityOrder: Record<string, number> = { critical: 0, urgent: 0, high: 1, medium: 2, low: 3 };
      return (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3);
    });

  if (sortedInsights.length === 0) {
    return (
      <div className="glass-standard rounded-2xl p-6">
        <h3 className="font-semibold text-slate-900 mb-4">Insights</h3>
        <div className="text-center py-8">
          <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-3">
            <IconCheck size={20} className="text-primary-600" />
          </div>
          <p className="text-sm text-slate-600">All clear!</p>
          <p className="text-xs text-slate-400 mt-1">
            No insights requiring attention right now.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-standard rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900">Insights</h3>
        <span className="text-xs text-slate-500">
          {sortedInsights.length} active
        </span>
      </div>

      <div className="space-y-3">
        {sortedInsights.slice(0, 5).map((insight) => {
          const Icon = insightIcons[insight.insight_type] || IconAlertCircle;
          const colors = priorityColors[insight.priority] ?? priorityColors.low!;
          const isExpanded = expandedId === insight.id;

          return (
            <div
              key={insight.id}
              className={`rounded-lg border p-3 transition-all cursor-pointer ${colors.bg} ${colors.border}`}
              onClick={() => setExpandedId(isExpanded ? null : insight.id)}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${colors.bg}`}
                >
                  <Icon size={16} className={colors.text} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-medium ${colors.text}`}>
                      {insight.title}
                    </p>
                    <span
                      className={`text-micro uppercase font-semibold px-1.5 py-0.5 rounded ${
                        insight.priority === 'urgent'
                          ? 'bg-red-200 text-red-800'
                          : insight.priority === 'high'
                          ? 'bg-amber-200 text-amber-800'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {insight.priority}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                    {insight.description}
                  </p>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-slate-200/50">
                      <p className="text-xs font-medium text-slate-700 mb-1">
                        Recommendation:
                      </p>
                      <p className="text-xs text-slate-600">
                        {insight.recommendation}
                      </p>

                      {/* Actions */}
                      <div className="flex gap-2 mt-3">
                        <button
                          disabled={isPending}
                          className="flex items-center gap-1 px-2 py-1 text-xs rounded-md
                                     bg-white border border-slate-200 text-slate-600
                                     hover:bg-slate-50 active:bg-slate-100 transition-colors disabled:opacity-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAcknowledge(insight.id);
                          }}
                        >
                          <IconCheck size={12} />
                          {isPending ? 'Saving...' : 'Acknowledge'}
                        </button>
                        <button
                          disabled={isPending}
                          className="flex items-center gap-1 px-2 py-1 text-xs rounded-md
                                     bg-white border border-slate-200 text-slate-400
                                     hover:bg-slate-50 active:bg-slate-100 transition-colors disabled:opacity-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDismiss(insight.id);
                          }}
                        >
                          <IconX size={12} />
                          {isPending ? 'Saving...' : 'Dismiss'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {sortedInsights.length > 5 && (
          <button className="w-full text-center text-sm text-primary-600 hover:text-primary-700 py-2">
            View all {sortedInsights.length} insights
          </button>
        )}
      </div>
    </div>
  );
}
