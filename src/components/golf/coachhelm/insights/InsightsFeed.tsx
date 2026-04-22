'use client';

/**
 * InsightsFeed (coach) — migrated to the unified `InsightCard` primitive under
 * Wave 1A of the Insight Delivery phase. Fetches evidence-backed rows via
 * `getInsightsForCoach` and renders each with `audience='coach'`.
 *
 * Legacy behavior replaced:
 *   - Legacy InsightCard (coach) — deleted.
 *   - Legacy "Create Focus Area" inline button — now driven through the
 *     primitive's coach action set via `onAction('create_focus_area', ...)`.
 *
 * Contract: docs/superpowers/plans/2026-04-22-insight-delivery/00-design-contract.md
 */
import { useState, useEffect, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  InsightCard,
  type InsightAction,
} from '@/components/golf/coachhelm/insight-card';
import {
  getInsightsForCoach,
  type EvidenceInsight,
} from '@/app/golf/actions/insight-delivery';
import { EmptyState } from '@/components/ui/empty-state';
import { IconSparkles, IconRefresh } from '@/components/icons';
import {
  acknowledgeInsight,
  dismissInsight,
  generateTeamInsights,
} from '@/app/golf/actions/insights';
import { createFocusAreaFromInsight } from '@/app/golf/actions/development';

interface InsightsFeedProps {
  coachId: string;
  limit?: number;
  showGenerateButton?: boolean;
}

export function InsightsFeed({
  coachId,
  limit = 5,
  showGenerateButton = true,
}: InsightsFeedProps) {
  const router = useRouter();
  const [insights, setInsights] = useState<EvidenceInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startActionTransition] = useTransition();

  const loadInsights = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await getInsightsForCoach(coachId, { limit });
      setInsights(rows);
    } catch {
      setError('Failed to load insights');
    } finally {
      setLoading(false);
    }
  }, [coachId, limit]);

  useEffect(() => {
    void loadInsights();
  }, [loadInsights]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const result = await generateTeamInsights();
      if (!result.success) {
        setError(result.error || 'Failed to generate insights');
      }
    } catch {
      setError('Failed to generate insights');
    } finally {
      setGenerating(false);
      await loadInsights();
    }
  };

  const handleCoachAction = useCallback(
    (action: InsightAction, insightId: string) => {
      // Optimistic remove: drop the row immediately for acknowledge/dismiss/
      // create_focus_area, then fire the server action. Fall back to the list
      // refresh if the server call fails.
      const prev = insights;
      startActionTransition(async () => {
        try {
          if (action === 'acknowledged') {
            setInsights((rows) => rows.filter((r) => r.id !== insightId));
            const res = await acknowledgeInsight(insightId);
            if (!res.success) setInsights(prev);
          } else if (action === 'dismissed') {
            setInsights((rows) => rows.filter((r) => r.id !== insightId));
            const res = await dismissInsight(insightId);
            if (!res.success) setInsights(prev);
          } else if (action === 'create_focus_area') {
            const target = insights.find((i) => i.id === insightId);
            if (!target) return;
            const res = await createFocusAreaFromInsight({
              insight_id: target.id,
              player_id: target.player_id,
              coach_id: coachId,
              title: target.title,
              description: target.content ?? '',
              insight_type: (target.category as string | undefined) ?? 'general',
            });
            if (res.success) {
              router.push('/golf/dashboard/development');
            }
          }
        } catch {
          setInsights(prev);
        }
      });
    },
    [coachId, insights, router],
  );

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

      <div className="space-y-3">
        {insights.map((insight) => (
          <InsightCard
            key={insight.id}
            insight={insight}
            density="default"
            audience="coach"
            showActions
            onAction={handleCoachAction}
          />
        ))}
      </div>
    </div>
  );
}
