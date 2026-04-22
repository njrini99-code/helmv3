'use client';

import { useState, useTransition } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/glass-card';
import {
  IconSparkles,
  IconChevronRight,
  IconChevronDown,
  IconCheck,
  IconX,
  IconWarning,
  IconInfo,
  IconTrophy,
  IconHelp,
} from '@/components/icons';
import type { ComposedInsight, InsightTone } from '@/lib/coachhelm/v2/types';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import { EvidencePanel } from '@/components/golf/coachhelm/insights/EvidencePanel';
import { DrillAttachment } from '@/components/golf/coachhelm/insights/DrillAttachment';

/**
 * ComposedInsight does not currently carry a DB id (insights are composed
 * in-memory by the engine). When the feedback loop needs to target a
 * persisted `golf_coach_insights` row, upstream code tags the insight with
 * an `id`. We read it opportunistically — if an id isn't present we skip
 * the feedback handler so the UI doesn't fire a no-op server action.
 *
 * The Insight Quality phase adds `evidence` and `category` to every
 * persisted insight. Those fields are attached by the data fetcher when
 * surfacing evidence-backed insights; older in-memory composed insights
 * simply omit them and the EvidencePanel no-ops.
 */
type InsightWithMaybeId = ComposedInsight & {
  id?: string;
  evidence?: InsightEvidence | null;
  category?: string;
};

export type InsightRating = 'helpful' | 'not_helpful';

export interface AIInsightsPanelProps {
  insights: ComposedInsight[];
  maxDisplay?: number;
  /** Fired when the player reacts to the insight with a qualitative rating. */
  onRate?: (rating: InsightRating, insightId: string) => Promise<void> | void;
  /** Fired when the player marks an insight as acknowledged ("Got It"). */
  onAcknowledge?: (insightId: string) => Promise<void> | void;
  /** Fired when the player dismisses the insight. */
  onDismiss?: (insightId: string) => Promise<void> | void;
}

const toneConfig: Record<InsightTone, {
  icon: typeof IconSparkles;
  bgColor: string;
  borderColor: string;
  iconColor: string;
  accentColor: string;
}> = {
  encouraging: {
    icon: IconTrophy,
    bgColor: 'bg-primary-50/80',
    borderColor: 'border-primary-200',
    iconColor: 'text-primary-600',
    accentColor: 'bg-primary-500',
  },
  neutral: {
    icon: IconInfo,
    bgColor: 'bg-warm-50/80',
    borderColor: 'border-warm-200',
    iconColor: 'text-warm-600',
    accentColor: 'bg-warm-500',
  },
  cautionary: {
    icon: IconWarning,
    bgColor: 'bg-amber-50/80',
    borderColor: 'border-amber-200',
    iconColor: 'text-amber-600',
    accentColor: 'bg-amber-500',
  },
  urgent: {
    icon: IconWarning,
    bgColor: 'bg-red-50/80',
    borderColor: 'border-red-200',
    iconColor: 'text-red-600',
    accentColor: 'bg-red-500',
  },
  celebratory: {
    icon: IconSparkles,
    bgColor: 'bg-purple-50/80',
    borderColor: 'border-purple-200',
    iconColor: 'text-purple-600',
    accentColor: 'bg-purple-500',
  },
};

interface InsightCardProps {
  insight: InsightWithMaybeId;
  index: number;
  onRate?: AIInsightsPanelProps['onRate'];
  onAcknowledge?: AIInsightsPanelProps['onAcknowledge'];
  onDismiss?: AIInsightsPanelProps['onDismiss'];
}

function InsightCard({
  insight,
  index,
  onRate,
  onAcknowledge,
  onDismiss,
}: InsightCardProps) {
  const [expanded, setExpanded] = useState(false);
  // React 19 `useTransition` — gives each button a lightweight pending state
  // while the server action resolves. Individual ref per action so we can
  // disable buttons selectively.
  const [ratingPending, startRating] = useTransition();
  const [ackPending, startAck] = useTransition();
  const [dismissPending, startDismiss] = useTransition();

  const config = toneConfig[insight.tone] || toneConfig.neutral;
  const Icon = config.icon;
  const confidencePercent = Math.round(Number(insight.confidence ?? 0) * 100);
  const [showEvidenceDetails, setShowEvidenceDetails] = useState(false);

  // Only render the feedback row when at least one handler is supplied AND we
  // have an id to target — without an id we'd fire a meaningless call.
  const hasHandler = Boolean(onRate || onAcknowledge || onDismiss);
  const insightId = insight.id;
  const showActions = hasHandler && !!insightId;
  const hasEvidence = Boolean(insight.evidence);

  return (
    <m.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className={cn(
        'relative rounded-xl border overflow-hidden transition-all duration-200',
        config.bgColor,
        config.borderColor,
        expanded && 'shadow-md'
      )}
    >
      {/* Accent bar */}
      <div className={cn('absolute top-0 left-0 right-0 h-0.5', config.accentColor)} />

      {/* Header - clickable to expand */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 text-left flex items-start gap-3"
      >
        {/* Icon */}
        <div className={cn(
          'w-9 h-9 rounded-lg bg-white shadow-sm flex items-center justify-center flex-shrink-0',
          config.iconColor
        )}>
          <Icon size={18} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-warm-900 text-sm mb-1 line-clamp-1">
            {insight.headline}
          </h4>
          <p className="text-xs text-warm-600 line-clamp-2">
            {insight.body}
          </p>

          {/* Compact evidence pill — the single-row summary sits right under
              the body so players see "38% vs 52% D2 avg" before deciding
              whether to expand the card. Renders nothing for legacy
              composed insights that predate the evidence foundation. */}
          {hasEvidence && (
            <EvidencePanel evidence={insight.evidence} compact />
          )}

          {/* Meta info */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-xs text-warm-400 tabular-nums">
              {confidencePercent}% confidence
            </span>
            {insight.strokeImpact != null && (
              <span className={cn(
                'text-xs font-semibold px-2 py-0.5 rounded-full',
                Math.abs(Number(insight.strokeImpact ?? 0)) >= 1.5 ? 'bg-red-100 text-red-700' :
                Math.abs(Number(insight.strokeImpact ?? 0)) >= 0.5 ? 'bg-amber-100 text-amber-700' :
                'bg-warm-100 text-warm-600'
              )}>
                {Number(insight.strokeImpact ?? 0) > 0 ? '+' : ''}{Number(insight.strokeImpact ?? 0).toFixed(1)} strokes
              </span>
            )}
            {insight.reasoning && (
              <span className="text-xs px-1.5 py-0.5 bg-white/70 rounded-full text-warm-500">
                AI Reasoning
              </span>
            )}
          </div>
        </div>

        {/* Expand indicator */}
        <m.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-warm-400 flex-shrink-0"
        >
          <IconChevronDown size={18} />
        </m.div>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ height: { type: 'spring', stiffness: 500, damping: 30 }, opacity: { duration: 0.2 } }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3">
              {/* Full body */}
              <p className="text-sm text-warm-700 leading-relaxed">
                {insight.body}
              </p>

              {/* Show details toggle + expanded evidence grid + attached
                  drills. We keep these behind the expanded view so the card
                  list stays scannable. */}
              {hasEvidence && (
                <div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowEvidenceDetails((s) => !s);
                    }}
                    className="text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
                  >
                    {showEvidenceDetails ? 'Hide details' : 'Show details'}
                  </button>
                  {showEvidenceDetails && (
                    <EvidencePanel evidence={insight.evidence} compact={false} />
                  )}
                </div>
              )}
              {insightId && hasEvidence && (
                <DrillAttachment insightId={insightId} />
              )}

              {/* Evidence metrics */}
              {insight.evidenceMetrics && insight.evidenceMetrics.length > 0 && (
                <div className="grid grid-cols-2 gap-2 mt-3">
                  {insight.evidenceMetrics.map((metric, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-warm-50/50">
                      <span className="text-xs text-warm-500">{metric.label}</span>
                      <span className="text-xs font-bold text-warm-900 tabular-nums">{metric.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Reasoning chain */}
              {insight.reasoning?.reasoningChain && insight.reasoning.reasoningChain.length > 0 && (
                <div className="p-3 bg-white/60 rounded-lg">
                  <h5 className="text-xs font-semibold text-warm-500 uppercase tracking-wide mb-2">
                    How we reached this
                  </h5>
                  <div className="space-y-1.5">
                    {insight.reasoning.reasoningChain.slice(0, 3).map((step, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-primary-100 text-primary-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                          {step.stepNumber}
                        </span>
                        <p className="text-xs text-warm-600">{step.conclusion}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Call to action */}
              {insight.callToAction && (
                <div className="p-3 bg-primary-50/50 border border-primary-100 rounded-lg">
                  <h5 className="text-xs font-semibold text-primary-600 uppercase tracking-wide mb-1">
                    Suggested Action
                  </h5>
                  <p className="text-sm text-warm-700">{insight.callToAction}</p>
                </div>
              )}

              {/* Actions */}
              {showActions && insightId && (
                <div className="flex items-center gap-2 pt-2 flex-wrap">
                  {onRate && (
                    <button
                      type="button"
                      disabled={ratingPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        startRating(() => {
                          void Promise.resolve(onRate('helpful', insightId));
                        });
                      }}
                      className={cn(
                        'flex items-center gap-2 text-xs font-medium text-primary-700 hover:text-primary-800 px-3 py-1.5 rounded-lg bg-primary-100 hover:bg-primary-200 transition-colors',
                        ratingPending && 'opacity-60 pointer-events-none'
                      )}
                    >
                      <IconHelp size={14} />
                      Helpful
                    </button>
                  )}
                  {onAcknowledge && (
                    <button
                      type="button"
                      disabled={ackPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        startAck(() => {
                          void Promise.resolve(onAcknowledge(insightId));
                        });
                      }}
                      className={cn(
                        'flex items-center gap-2 text-xs font-medium text-primary-600 hover:text-primary-700 px-3 py-1.5 rounded-lg bg-primary-50 hover:bg-primary-100 transition-colors',
                        ackPending && 'opacity-60 pointer-events-none'
                      )}
                    >
                      <IconCheck size={14} />
                      Got It
                    </button>
                  )}
                  {onDismiss && (
                    <button
                      type="button"
                      disabled={dismissPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        startDismiss(() => {
                          void Promise.resolve(onDismiss(insightId));
                        });
                      }}
                      className={cn(
                        'flex items-center gap-2 text-xs text-warm-500 hover:text-warm-700 px-3 py-1.5 rounded-lg hover:bg-white/50 active:bg-white/70 transition-colors',
                        dismissPending && 'opacity-60 pointer-events-none'
                      )}
                    >
                      <IconX size={14} />
                      Dismiss
                    </button>
                  )}
                </div>
              )}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </m.div>
  );
}

export function AIInsightsPanel({
  insights,
  maxDisplay = 5,
  onRate,
  onAcknowledge,
  onDismiss,
}: AIInsightsPanelProps) {
  const [showAll, setShowAll] = useState(false);
  const displayInsights = showAll ? insights : insights.slice(0, maxDisplay);
  const hasMore = insights.length > maxDisplay;

  // Empty state
  if (insights.length === 0) {
    return (
      <GlassCard>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
            <IconSparkles size={20} className="text-primary-600" />
          </div>
          <div>
            <h3 className="font-semibold text-warm-900">AI Insights</h3>
            <p className="text-xs text-warm-500">Personalized analysis from CoachHelm</p>
          </div>
        </div>

        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-3">
            <IconInfo size={24} className="text-warm-400" />
          </div>
          <p className="text-sm text-warm-600 mb-1">No insights available yet</p>
          <p className="text-xs text-warm-400">
            Play more rounds to unlock personalized AI insights
          </p>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
            <IconSparkles size={20} className="text-primary-600" />
          </div>
          <div>
            <h3 className="font-semibold text-warm-900">AI Insights</h3>
            <p className="text-xs text-warm-500">
              {insights.length} insight{insights.length !== 1 ? 's' : ''} for your game
            </p>
          </div>
        </div>
      </div>

      {/* Insights list */}
      <div className="space-y-3">
        <AnimatePresence>
          {displayInsights.map((insight, index) => (
            <InsightCard
              key={`${(insight as InsightWithMaybeId).id ?? insight.headline}-${index}`}
              insight={insight as InsightWithMaybeId}
              index={index}
              onRate={onRate}
              onAcknowledge={onAcknowledge}
              onDismiss={onDismiss}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Show all / collapse toggle */}
      {hasMore && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-4 pt-4 border-t border-white/20"
        >
          <button
            onClick={() => setShowAll(!showAll)}
            className="flex items-center justify-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors w-full"
          >
            {showAll ? 'Show fewer insights' : `View all ${insights.length} insights`}
            <IconChevronRight size={16} className={cn('transition-transform', showAll && 'rotate-90')} />
          </button>
        </m.div>
      )}
    </GlassCard>
  );
}
