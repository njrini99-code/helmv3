'use client';

import { useState, useTransition } from 'react';
import type { BaseballCoachInsight, BaseballInsightCategory } from '@/lib/types';
import {
  IconAlertCircle,
  IconTrendingUp,
  IconTrendingDown,
  IconBolt,
  IconCheck,
  IconX,
  IconRefresh,
  IconThumbsUp,
  IconThumbsDown,
  IconUsers,
  IconTarget,
  IconActivity,
} from '@/components/icons';
import {
  dismissInsight,
  markInsightAddressed,
  generateTeamInsights,
  submitInsightFeedback,
} from '@/app/baseball/actions/insights';

interface InsightsFeedProps {
  insights: BaseballCoachInsight[];
  teamId: string;
  coachId: string;
}

const insightIcons: Record<string, typeof IconAlertCircle> = {
  performance_decline: IconTrendingDown,
  performance_surge: IconTrendingUp,
  pressure_gap: IconAlertCircle,
  streak_hot: IconBolt,
  streak_cold: IconTrendingDown,
  plateau: IconAlertCircle,
  breakout_candidate: IconBolt,
  position_opportunity: IconTarget,
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

const categoryConfig: Record<BaseballInsightCategory, { label: string; icon: typeof IconActivity; color: string }> = {
  performance: { label: 'Performance', icon: IconActivity, color: 'text-blue-600' },
  recruiting: { label: 'Recruiting', icon: IconTarget, color: 'text-purple-600' },
  team_health: { label: 'Team Health', icon: IconUsers, color: 'text-primary-600' },
};

type CategoryFilter = 'all' | BaseballInsightCategory;

export function InsightsFeed({ insights, teamId, coachId }: InsightsFeedProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isGenerating, setIsGenerating] = useState(false);
  const [handledIds, setHandledIds] = useState<Set<string>>(new Set());
  const [feedbackGiven, setFeedbackGiven] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [generationResult, setGenerationResult] = useState<{ count: number; show: boolean } | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerationResult(null);
    try {
      const result = await generateTeamInsights(teamId, coachId);
      if (result.success) {
        setGenerationResult({ count: result.insightsGenerated || 0, show: true });
        // Clear handledIds since we have fresh insights
        setHandledIds(new Set());
        // Auto-hide success message after 3 seconds
        setTimeout(() => setGenerationResult(prev => prev ? { ...prev, show: false } : null), 3000);
      }
    } finally {
      setIsGenerating(false);
    }
  };

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

  const handleFeedback = (insightId: string, feedback: 'helpful' | 'not_helpful') => {
    startTransition(async () => {
      const result = await submitInsightFeedback(insightId, feedback);
      if (result.success) {
        setFeedbackGiven(prev => new Set(prev).add(insightId));
      }
    });
  };

  // Get category from metadata
  const getCategory = (insight: BaseballCoachInsight): BaseballInsightCategory | null => {
    const metadata = insight.metadata as Record<string, unknown> | undefined;
    const category = metadata?.category as BaseballInsightCategory | undefined;
    return category || null;
  };

  // Filter out handled insights, apply category filter, and sort by priority
  const sortedInsights = [...insights]
    .filter(i => !handledIds.has(i.id))
    .filter(i => categoryFilter === 'all' || getCategory(i) === categoryFilter)
    .sort((a, b) => {
      const priorityOrder: Record<string, number> = { critical: 0, urgent: 0, high: 1, medium: 2, low: 3 };
      return (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3);
    });

  // Count by category for filter badges
  const categoryCount = {
    all: insights.filter(i => !handledIds.has(i.id)).length,
    performance: insights.filter(i => !handledIds.has(i.id) && getCategory(i) === 'performance').length,
    recruiting: insights.filter(i => !handledIds.has(i.id) && getCategory(i) === 'recruiting').length,
    team_health: insights.filter(i => !handledIds.has(i.id) && getCategory(i) === 'team_health').length,
  };

  return (
    <div className="glass-standard rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900">AI Insights</h3>
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg
                     bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800
                     disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <IconRefresh size={14} className={isGenerating ? 'animate-spin' : ''} />
          {isGenerating ? 'Analyzing...' : 'Generate'}
        </button>
      </div>

      {/* Generation Result Toast */}
      {generationResult?.show && (
        <div className="mb-4 p-3 bg-primary-50 border border-primary-200 rounded-lg flex items-center gap-2">
          <IconCheck size={16} className="text-primary-600" />
          <span className="text-sm text-primary-700">
            Generated {generationResult.count} new insight{generationResult.count !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Category Filter Pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        {(['all', 'performance', 'recruiting', 'team_health'] as const).map((cat) => {
          const isActive = categoryFilter === cat;
          const count = categoryCount[cat];
          const config = cat !== 'all' ? categoryConfig[cat] : null;

          return (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-colors
                ${isActive
                  ? 'bg-primary-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
            >
              {config && <config.icon size={12} />}
              {cat === 'all' ? 'All' : config?.label}
              <span className={`ml-1 ${isActive ? 'text-primary-200' : 'text-slate-400'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {sortedInsights.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-3">
            <IconCheck size={20} className="text-primary-600" />
          </div>
          <p className="text-sm text-slate-600">
            {categoryFilter === 'all' ? 'All clear!' : `No ${categoryConfig[categoryFilter as BaseballInsightCategory]?.label.toLowerCase()} insights`}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {categoryFilter === 'all'
              ? 'No insights requiring attention right now.'
              : 'Try selecting a different category or generate new insights.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedInsights.slice(0, 5).map((insight) => {
            const Icon = insightIcons[insight.insight_type] || IconAlertCircle;
            const colors = priorityColors[insight.priority] ?? priorityColors.low!;
            const isExpanded = expandedId === insight.id;
            const category = getCategory(insight);
            const categoryInfo = category ? categoryConfig[category] : null;
            const hasFeedback = feedbackGiven.has(insight.id) ||
              (insight.metadata as Record<string, unknown> | undefined)?.feedback != null;

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
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`text-sm font-medium ${colors.text}`}>
                        {insight.title}
                      </p>
                      <span
                        className={`text-micro uppercase font-semibold px-1.5 py-0.5 rounded ${
                          insight.priority === 'urgent' || insight.priority === 'critical'
                            ? 'bg-red-200 text-red-800'
                            : insight.priority === 'high'
                            ? 'bg-amber-200 text-amber-800'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {insight.priority}
                      </span>
                      {categoryInfo && (
                        <span className={`flex items-center gap-1 text-micro ${categoryInfo.color}`}>
                          <categoryInfo.icon size={10} />
                          {categoryInfo.label}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                      {insight.description}
                    </p>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-slate-200/50">
                        {(insight.recommendation || insight.recommended_action) && (
                          <>
                            <p className="text-xs font-medium text-slate-700 mb-1">
                              Recommendation:
                            </p>
                            <p className="text-xs text-slate-600 mb-3">
                              {insight.recommendation || insight.recommended_action}
                            </p>
                          </>
                        )}

                        {/* Actions */}
                        <div className="flex flex-wrap gap-2">
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

                          {/* Feedback Buttons */}
                          {!hasFeedback && (
                            <div className="flex items-center gap-1 ml-auto">
                              <span className="text-micro text-slate-400 mr-1">Helpful?</span>
                              <button
                                disabled={isPending}
                                className="p-1 rounded hover:bg-primary-100 text-slate-400 hover:text-primary-600 transition-colors disabled:opacity-50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleFeedback(insight.id, 'helpful');
                                }}
                                title="Helpful"
                              >
                                <IconThumbsUp size={14} />
                              </button>
                              <button
                                disabled={isPending}
                                className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleFeedback(insight.id, 'not_helpful');
                                }}
                                title="Not helpful"
                              >
                                <IconThumbsDown size={14} />
                              </button>
                            </div>
                          )}
                          {hasFeedback && (
                            <span className="text-micro text-slate-400 ml-auto flex items-center gap-1">
                              <IconCheck size={12} className="text-primary-500" />
                              Thanks for feedback
                            </span>
                          )}
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
      )}
    </div>
  );
}
