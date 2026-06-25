'use client';

import { useState } from 'react';
import {
  IconSparkles,
  IconTrendingUp,
  IconTrendingDown,
  IconAlertCircle,
  IconTarget,
  IconChevronDown,
  IconChevronUp,
  IconCheck,
  IconX,
} from '@/components/icons';
import type { BaseballCoachInsight } from '@/lib/types';
import { Button } from '@/components/ui/button';

interface PlayerInsightsPanelProps {
  insights: BaseballCoachInsight[];
  expanded?: boolean;
}

const insightIcons: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  trend: IconTrendingUp,
  decline: IconTrendingDown,
  alert: IconAlertCircle,
  opportunity: IconTarget,
  milestone: IconSparkles,
};

const priorityColors: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  critical: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: 'text-red-500' },
  urgent: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: 'text-red-500' },
  high: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: 'text-amber-500' },
  medium: { bg: 'bg-primary-50', border: 'border-primary-200', text: 'text-primary-700', icon: 'text-primary-500' },
  low: { bg: 'bg-warm-50', border: 'border-warm-200', text: 'text-warm-700', icon: 'text-warm-500' },
};

export function PlayerInsightsPanel({ insights, expanded = false }: PlayerInsightsPanelProps) {
  const [expandedInsights, setExpandedInsights] = useState<Set<string>>(new Set());

  if (insights.length === 0) {
    return (
      <div className="text-center py-6">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary-50 to-primary-100 text-primary-600/80">
          <IconSparkles size={22} />
        </div>
        <p className="text-sm font-medium text-warm-700">No active insights</p>
        <p className="mt-1 text-xs leading-relaxed text-warm-500">
          Insights will appear as we analyze performance data.
        </p>
      </div>
    );
  }

  const toggleExpand = (id: string) => {
    const newSet = new Set(expandedInsights);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedInsights(newSet);
  };

  return (
    <div className="space-y-3">
      {insights.map((insight) => {
        const Icon = insightIcons[insight.insight_type] || IconSparkles;
        const colors = priorityColors[insight.priority] || priorityColors.low;
        const isExpanded = expandedInsights.has(insight.id) || expanded;

        return (
          <div
            key={insight.id}
            className={`rounded-xl border transition-all ${colors?.bg ?? ''} ${colors?.border ?? ''}`}
          >
            <Button variant="ghost"
              onClick={() => toggleExpand(insight.id)}
              className="w-full px-4 py-3 flex items-start gap-3 text-left"
            >
              <div className={`mt-0.5 ${colors?.icon ?? ''}`}>
                <Icon size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-medium text-sm ${colors?.text ?? ''}`}>
                  {insight.title}
                </p>
                {!isExpanded && insight.description && (
                  <p className="text-xs text-warm-500 mt-0.5 line-clamp-1">
                    {insight.description}
                  </p>
                )}
              </div>
              <div className="text-warm-400">
                {isExpanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
              </div>
            </Button>

            {isExpanded && (
              <div className="px-4 pb-4 pt-0">
                {insight.description && (
                  <p className="text-sm text-warm-600 mb-3">
                    {insight.description}
                  </p>
                )}

                {insight.data && typeof insight.data === 'object' && (
                  <div className="bg-cream-100/60 rounded-lg p-3 mb-3">
                    <p className="text-xs font-medium text-warm-500 mb-2">Key Metrics</p>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(insight.data as Record<string, string | number>).slice(0, 4).map(([key, value]) => (
                        <div key={key} className="text-sm">
                          <span className="text-warm-500">{key}: </span>
                          <span className="font-medium text-warm-700">
                            {typeof value === 'number' ? value.toFixed(2) : value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {insight.recommended_action && (
                  <div className="bg-cream-100/60 rounded-lg p-3">
                    <p className="text-xs font-medium text-warm-500 mb-1">Recommended Action</p>
                    <p className="text-sm text-warm-700">{insight.recommended_action}</p>
                  </div>
                )}

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-warm-200/60">
                  <Button variant="primary" className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary-600 bg-primary-50 rounded-lg hover:bg-primary-100 active:bg-primary-200 transition-colors">
                    <IconCheck size={14} />
                    Mark Addressed
                  </Button>
                  <Button variant="ghost" className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-warm-600 bg-warm-100 rounded-lg hover:bg-warm-200 active:bg-warm-300 transition-colors">
                    <IconX size={14} />
                    Dismiss
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
