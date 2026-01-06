'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { IconCheck, IconX, IconChevronDown, IconChevronUp, IconSparkles } from '@/components/icons';
import { GlassCard } from '@/components/ui/glass-card';
import type { InsightWithPlayer } from '@/lib/coachhelm/insight-types';
import { getInsightConfig, getPriorityColor, formatInsightAge } from '@/lib/coachhelm/insight-types';
import { acknowledgeInsight, dismissInsight, resolveInsight } from '@/app/golf/actions/insights';
import { Avatar } from '@/components/ui/avatar';

interface InsightCardProps {
  insight: InsightWithPlayer;
  onUpdate?: () => void;
}

export function InsightCard({ insight, onUpdate }: InsightCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

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

  return (
    <GlassCard
      className={cn(
        'transition-all duration-200',
        expanded && 'ring-2 ring-green-500/20'
      )}
      padding="none"
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 text-left hover:bg-slate-50/50 transition-colors"
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
              <h4 className="font-medium text-slate-900 text-sm leading-tight">
                {insight.title}
              </h4>
              <span className="text-xs text-slate-400 flex-shrink-0">
                {formatInsightAge(insight.created_at)}
              </span>
            </div>

            <p className="text-sm text-slate-600 line-clamp-2">
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
                <span className="text-xs text-slate-500">
                  {insight.player.first_name} {insight.player.last_name}
                </span>
              </div>
            )}
          </div>

          {/* Expand Icon */}
          <div className="flex-shrink-0 text-slate-400">
            {expanded ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
          </div>
        </div>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-100">
          {/* Full Description */}
          <div className="pt-3">
            <p className="text-sm text-slate-700 leading-relaxed">
              {insight.description}
            </p>
          </div>

          {/* Recommendation */}
          {insight.recommendation && (
            <div className="bg-green-50 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <IconSparkles size={16} className="text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-green-900 mb-1">Recommendation</p>
                  <p className="text-sm text-green-800 leading-relaxed">
                    {insight.recommendation}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Metadata (if available) */}
          {insight.metadata && Object.keys(insight.metadata).length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(insight.metadata).map(([key, value]) => {
                if (typeof value === 'number' || typeof value === 'string') {
                  return (
                    <div key={key} className="bg-slate-50 rounded p-2">
                      <p className="text-xs text-slate-500 capitalize">
                        {key.replace(/_/g, ' ')}
                      </p>
                      <p className="text-sm font-medium text-slate-900">
                        {typeof value === 'number' ? value.toFixed(1) : value}
                      </p>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={handleResolve}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <IconCheck size={16} />
              Resolve
            </button>
            <button
              onClick={handleAcknowledge}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors"
            >
              Acknowledge
            </button>
            <button
              onClick={handleDismiss}
              disabled={loading}
              className="px-3 py-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors"
              title="Dismiss"
            >
              <IconX size={16} />
            </button>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
