'use client';

import { useState, useEffect, useCallback } from 'react';
import { InsightCard } from './InsightCard';
import { EmptyState } from '@/components/ui/empty-state';
import { IconSparkles, IconRefresh } from '@/components/icons';
import { getActiveInsights, generateTeamInsights } from '@/app/golf/actions/insights';
import type { InsightWithPlayer } from '@/lib/coachhelm/insight-types';

interface InsightsFeedProps {
  limit?: number;
  showGenerateButton?: boolean;
  coachId?: string;
}

function InsightsFeed({ limit = 5, showGenerateButton = true, coachId }: InsightsFeedProps) {
  const [insights, setInsights] = useState<InsightWithPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadInsights = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await getActiveInsights(limit);

    if (result.success) {
      setInsights(result.insights as InsightWithPlayer[]);
    } else {
      setError(result.error || 'Failed to load insights');
    }

    setLoading(false);
  }, [limit]);

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);

    const result = await generateTeamInsights();

    if (result.success) {
      // Reload insights after generation
      await loadInsights();
    } else {
      setError(result.error || 'Failed to generate insights');
    }

    setGenerating(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="space-y-3 w-48">
          <div className="h-4 w-full bg-warm-200 rounded skeleton-shimmer" />
          <div className="h-4 w-3/4 bg-warm-200 rounded skeleton-shimmer" />
          <div className="h-4 w-1/2 bg-warm-200 rounded skeleton-shimmer" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-red-600">{error}</p>
        <button
          onClick={loadInsights}
          className="mt-4 text-sm text-primary-600 hover:text-primary-700 font-medium"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (insights.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState
          variant="compact"
          title="No Active Insights"
          description={
            showGenerateButton
              ? 'Generate insights to get AI-powered coaching recommendations.'
              : 'CoachHelm will analyze your team and surface insights here.'
          }
        />

        {showGenerateButton && (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            <IconSparkles size={18} />
            {generating ? 'Analyzing Team...' : 'Generate Insights'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Generate Button */}
      {showGenerateButton && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-warm-500">
            {insights.length} active insight{insights.length !== 1 ? 's' : ''}
          </p>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-primary-600 bg-primary-50 rounded-lg hover:bg-primary-100 disabled:opacity-50 transition-colors"
          >
            <IconRefresh size={14} className={generating ? 'animate-spin' : ''} />
            {generating ? 'Analyzing...' : 'Refresh'}
          </button>
        </div>
      )}

      {/* Insights List */}
      <div className="space-y-3">
        {insights.map((insight) => (
          <InsightCard
            key={insight.id}
            insight={insight}
            coachId={coachId}
            onUpdate={loadInsights}
          />
        ))}
      </div>
    </div>
  );
}
