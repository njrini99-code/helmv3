'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { IconCheck, IconX, IconChevronDown, IconChevronUp, IconSparkles, IconTarget } from '@/components/icons';
import { GlassCard } from '@/components/ui/glass-card';
import type { InsightWithPlayer } from '@/lib/coachhelm/insight-types';
import { getInsightConfig, getPriorityColor, formatInsightAge } from '@/lib/coachhelm/insight-types';
import { acknowledgeInsight, dismissInsight, resolveInsight } from '@/app/golf/actions/insights';
import { createFocusAreaFromInsight } from '@/app/golf/actions/development';
import { Avatar } from '@/components/ui/avatar';

interface InsightCardProps {
  insight: InsightWithPlayer;
  coachId?: string;
  onUpdate?: () => void;
}

export function InsightCard({ insight, coachId, onUpdate }: InsightCardProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creatingFocusArea, setCreatingFocusArea] = useState(false);

  const config = getInsightConfig(insight.insight_type);
  const priorityColor = getPriorityColor(insight.priority);

  const handleAcknowledge = async () => {
    setLoading(true);
    const result = await acknowledgeInsight(insight.id);
    setLoading(false);
    if (result.success && onUpdate) {
      onUpdate();
    }
  };

  const handleDismiss = async () => {
    setLoading(true);
    const result = await dismissInsight(insight.id);
    setLoading(false);
    if (result.success && onUpdate) {
      onUpdate();
    }
  };

  const handleResolve = async () => {
    setLoading(true);
    const result = await resolveInsight(insight.id);
    setLoading(false);
    if (result.success && onUpdate) {
      onUpdate();
    }
  };

  const handleCreateFocusArea = async () => {
    // Only allow if we have a player and coach
    if (!insight.player_id || !coachId) {
      return;
    }

    setCreatingFocusArea(true);
    const result = await createFocusAreaFromInsight({
      insight_id: insight.id,
      player_id: insight.player_id,
      coach_id: coachId,
      title: insight.title,
      description: insight.description,
      insight_type: insight.insight_type,
    });
    setCreatingFocusArea(false);

    if (result.success) {
      // Navigate to development page to see the new focus area
      router.push('/golf/dashboard/development');
      if (onUpdate) {
        onUpdate();
      }
    }
  };

  // Determine if we can show the Create Focus Area button
  // Only show for player-specific insights (not team-level)
  const canCreateFocusArea = insight.player_id && coachId &&
    !['team_trend', 'roster_recommendation'].includes(insight.insight_type);

  return (
    <GlassCard
      className={cn(
        'transition-all duration-200',
        expanded && 'ring-2 ring-primary-500/20'
      )}
      padding="none"
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 text-left hover:bg-warm-50/50 transition-colors"
      >
        <div className="flex items-start gap-3">
          {/* Icon & Priority Badge */}
          <div className="relative flex-shrink-0">
            <div
              className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center text-lg',
                priorityColor === 'red' && 'bg-red-100',
                priorityColor === 'orange' && 'bg-orange-100',
                priorityColor === 'yellow' && 'bg-yellow-100',
                priorityColor === 'blue' && 'bg-blue-100'
              )}
            >
              {config.icon}
            </div>
            {insight.priority === 'urgent' && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h4 className="font-medium text-warm-900 text-sm leading-tight">
                {insight.title}
              </h4>
              <span className="text-xs text-warm-400 flex-shrink-0">
                {formatInsightAge(insight.created_at)}
              </span>
            </div>

            <p className="text-sm text-warm-600 line-clamp-2">
              {insight.description}
            </p>

            {/* Player Info */}
            {insight.player && (
              <div className="flex items-center gap-2 mt-2">
                <Avatar
                  src={insight.player.avatar_url}
                  name={`${insight.player.first_name} ${insight.player.last_name}`}
                  size="xs"
                />
                <span className="text-xs text-warm-500">
                  {insight.player.first_name} {insight.player.last_name}
                </span>
              </div>
            )}
          </div>

          {/* Expand Icon */}
          <div className="flex-shrink-0 text-warm-400">
            {expanded ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
          </div>
        </div>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-warm-100">
          {/* Full Description */}
          <div className="pt-3">
            <p className="text-sm text-warm-700 leading-relaxed">
              {insight.description}
            </p>
          </div>

          {/* Recommendation */}
          {insight.recommendation && (
            <div className="bg-primary-50 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <IconSparkles size={16} className="text-primary-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-primary-900 mb-1">Recommendation</p>
                  <p className="text-sm text-primary-800 leading-relaxed">
                    {insight.recommendation}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* V2 Engine Badge & Confidence */}
          {insight.metadata?.v2_engine && (
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2 py-0.5 bg-purple-100 text-purple-600 rounded-full font-medium">
                AI Powered
              </span>
              {typeof insight.metadata.confidence === 'number' && (
                <span className="text-warm-500">
                  {Math.round((insight.metadata.confidence as number) * 100)}% confidence
                </span>
              )}
            </div>
          )}

          {/* Metadata (if available) */}
          {insight.metadata && Object.keys(insight.metadata).length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(insight.metadata).map(([key, value]) => {
                // Skip internal V2 fields from display
                if (['v2_engine', 'confidence', 'tone', 'reasoning_steps', 'pattern_id'].includes(key)) {
                  return null;
                }
                if (typeof value === 'number' || typeof value === 'string') {
                  return (
                    <div key={key} className="bg-warm-50 rounded p-2">
                      <p className="text-xs text-warm-500 capitalize">
                        {key.replace(/_/g, ' ')}
                      </p>
                      <p className="text-sm font-medium text-warm-900">
                        {typeof value === 'number' ? value.toFixed(1) : value}
                      </p>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          )}

          {/* Create Focus Area - Primary Action for Player-Specific Insights */}
          {canCreateFocusArea && (
            <div className="pt-2 border-t border-warm-100">
              <button
                onClick={handleCreateFocusArea}
                disabled={loading || creatingFocusArea}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                <IconTarget size={16} />
                {creatingFocusArea ? 'Creating...' : 'Create Focus Area'}
              </button>
              <p className="text-xs text-warm-500 text-center mt-1.5">
                Turn this insight into an actionable development plan
              </p>
            </div>
          )}

          {/* Secondary Actions */}
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={handleResolve}
              disabled={loading || creatingFocusArea}
              className={cn(
                'flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg disabled:opacity-50 transition-colors',
                canCreateFocusArea
                  ? 'flex-1 bg-warm-100 text-warm-700 hover:bg-warm-200'
                  : 'flex-1 bg-primary-600 text-white hover:bg-primary-700'
              )}
            >
              <IconCheck size={16} />
              Resolve
            </button>
            <button
              onClick={handleAcknowledge}
              disabled={loading || creatingFocusArea}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-warm-100 text-warm-700 text-sm font-medium rounded-lg hover:bg-warm-200 disabled:opacity-50 transition-colors"
            >
              Acknowledge
            </button>
            <button
              onClick={handleDismiss}
              disabled={loading || creatingFocusArea}
              className="px-3 py-2 bg-warm-100 text-warm-500 rounded-lg hover:bg-warm-200 disabled:opacity-50 transition-colors"
              title="Dismiss"
              aria-label="Dismiss insight"
            >
              <IconX size={16} />
            </button>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
