'use client';

/**
 * CoachHelm Intelligence Command Center
 *
 * The premium AI coaching intelligence hub - replaces the basic V2InsightsFeed
 * with a full-featured command center showing team health, smart alerts,
 * AI insights with reasoning chains, predictions with visual confidence,
 * and actionable patterns with stroke impact visualization.
 */

import { useState, useTransition, useMemo, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  IconSparkles,
  IconRefresh,
  IconChevronRight,
  IconTrendingUp,
  IconTrendingDown,
  IconTarget,
  IconAlertCircle,
  IconCheck,
  IconX,
  IconChevronDown,
  IconStar,
  IconUsers,
  IconSettings,
} from '@/components/icons';
import {
  generateTeamInsight,
  recordInteraction,
  acknowledgeComposedInsight,
  dismissComposedInsight,
} from '@/app/golf/actions/insights';
import type {
  ComposedInsight,
  MinedPattern,
  PerformancePrediction,
  TailRiskProbabilities,
  InsightTone,
  ReasoningStep,
} from '@/lib/coachhelm/v2/types';

// ============================================================================
// TYPES
// ============================================================================

interface IntelligenceCommandCenterProps {
  teamId: string;
  coachId: string;
  initialInsights?: ComposedInsight[];
  initialPatterns?: MinedPattern[];
  initialPredictions?: Array<PerformancePrediction & { playerName?: string }>;
}

type TabId = 'overview' | 'insights' | 'patterns' | 'predictions';

// ============================================================================
// ANIMATION VARIANTS
// ============================================================================

const fadeIn = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] as const },
};

// ============================================================================
// HELPER: Tone config
// ============================================================================

const TONE_CONFIG: Record<InsightTone, {
  bg: string;
  border: string;
  icon: string;
  badge: string;
  badgeText: string;
  accentBar: string;
  label: string;
}> = {
  urgent: {
    bg: 'bg-red-50/80',
    border: 'border-red-200/60',
    icon: 'text-red-600',
    badge: 'bg-red-100 text-red-700',
    badgeText: 'Urgent',
    accentBar: 'bg-gradient-to-r from-red-500 to-rose-500',
    label: 'Needs immediate attention',
  },
  cautionary: {
    bg: 'bg-amber-50/80',
    border: 'border-amber-200/60',
    icon: 'text-amber-600',
    badge: 'bg-amber-100 text-amber-700',
    badgeText: 'Watch',
    accentBar: 'bg-gradient-to-r from-amber-500 to-orange-500',
    label: 'Trending concern',
  },
  encouraging: {
    bg: 'bg-green-50/80',
    border: 'border-green-200/60',
    icon: 'text-green-600',
    badge: 'bg-green-100 text-green-700',
    badgeText: 'Positive',
    accentBar: 'bg-gradient-to-r from-green-500 to-emerald-500',
    label: 'Good trend',
  },
  celebratory: {
    bg: 'bg-violet-50/80',
    border: 'border-violet-200/60',
    icon: 'text-violet-600',
    badge: 'bg-violet-100 text-violet-700',
    badgeText: 'Standout',
    accentBar: 'bg-gradient-to-r from-violet-500 to-purple-500',
    label: 'Notable achievement',
  },
  neutral: {
    bg: 'bg-slate-50/80',
    border: 'border-slate-200/60',
    icon: 'text-slate-600',
    badge: 'bg-slate-100 text-slate-600',
    badgeText: 'Info',
    accentBar: 'bg-gradient-to-r from-slate-400 to-slate-500',
    label: 'Informational',
  },
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Overview Summary - Shows at-a-glance AI health metrics
 */
const OverviewSummary = memo(function OverviewSummary({
  insights,
  patterns,
}: {
  insights: ComposedInsight[];
  patterns: MinedPattern[];
}) {
  const urgentCount = insights.filter(i => i.tone === 'urgent').length;
  const cautionCount = insights.filter(i => i.tone === 'cautionary').length;
  const positiveCount = insights.filter(i => i.tone === 'encouraging' || i.tone === 'celebratory').length;
  const highImpactPatterns = patterns.filter(p => Math.abs(p.strokeImpact) >= 0.5).length;
  const healthScore = useMemo(() => {
    if (insights.length === 0 && patterns.length === 0) return null;
    let score = 70;
    score -= urgentCount * 15;
    score -= cautionCount * 5;
    score += positiveCount * 5;
    score -= highImpactPatterns * 3;
    return Math.max(0, Math.min(100, score));
  }, [urgentCount, cautionCount, positiveCount, highImpactPatterns, insights.length, patterns.length]);

  if (!healthScore && insights.length === 0) return null;

  const getHealthColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-amber-600';
    return 'text-red-600';
  };

  const getHealthLabel = (score: number) => {
    if (score >= 80) return 'Strong';
    if (score >= 60) return 'Attention Needed';
    return 'Concerns Detected';
  };

  return (
    <motion.div {...fadeIn} className="grid grid-cols-2 gap-2 mb-3">
      {/* Team Health Score */}
      {healthScore !== null && (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-white/40 p-3 shadow-sm">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center">
              <IconUsers size={12} className="text-slate-500" />
            </div>
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Team Health</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className={cn('text-2xl font-bold tabular-nums', getHealthColor(healthScore))}>{healthScore}</span>
            <span className="text-[10px] text-slate-400">/100</span>
          </div>
          <span className={cn('text-[10px] font-medium', getHealthColor(healthScore))}>
            {getHealthLabel(healthScore)}
          </span>
        </div>
      )}

      {/* Quick Counts */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-white/40 p-3 shadow-sm">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center">
            <IconSparkles size={12} className="text-slate-500" />
          </div>
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">AI Analysis</span>
        </div>
        <div className="space-y-1">
          {urgentCount > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs text-red-600 font-medium">{urgentCount} urgent</span>
            </div>
          )}
          {cautionCount > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span className="text-xs text-amber-600 font-medium">{cautionCount} watch</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span className="text-xs text-slate-500">{positiveCount} positive</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
});

/**
 * Enhanced Insight Card - Premium insight display with reasoning chain
 */
const EnhancedInsightCard = memo(function EnhancedInsightCard({
  insight,
  onAction,
}: {
  insight: ComposedInsight;
  onAction?: (action: 'acknowledge' | 'dismiss') => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const tone = TONE_CONFIG[insight.tone] || TONE_CONFIG.neutral;
  const confidencePct = Math.round(insight.confidence * 100);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={cn(
        'rounded-xl border overflow-hidden transition-shadow',
        tone.bg, tone.border,
        expanded ? 'shadow-md' : 'shadow-sm hover:shadow-md'
      )}
    >
      {/* Accent bar */}
      <div className={cn('h-0.5', tone.accentBar)} />

      {/* Header - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-3 flex items-start gap-2.5"
      >
        {/* Tone icon */}
        <div className={cn(
          'flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center',
          'bg-white/80 shadow-sm border border-white/50'
        )}>
          <IconSparkles size={14} className={tone.icon} />
        </div>

        <div className="flex-1 min-w-0">
          {/* Badge row */}
          <div className="flex items-center gap-1.5 mb-1">
            <span className={cn('text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full', tone.badge)}>
              {tone.badgeText}
            </span>
            <span className="text-[10px] text-slate-400">
              {confidencePct}% confidence
            </span>
          </div>

          {/* Headline */}
          <h4 className="text-[13px] font-semibold text-slate-900 leading-snug mb-0.5">
            {insight.headline}
          </h4>

          {/* Body preview */}
          <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
            {insight.body}
          </p>
        </div>

        {/* Expand chevron */}
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          className="flex-shrink-0 mt-1 text-slate-300"
        >
          <IconChevronDown size={14} />
        </motion.div>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-0 space-y-2.5">
              {/* Full body */}
              <p className="text-xs text-slate-600 leading-relaxed">
                {insight.body}
              </p>

              {/* Reasoning chain */}
              {insight.reasoning?.reasoningChain && insight.reasoning.reasoningChain.length > 0 && (
                <div>
                  <h5 className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    AI Reasoning
                  </h5>
                  <div className="space-y-1">
                    {insight.reasoning.reasoningChain.slice(0, 3).map((step: ReasoningStep, i: number) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 text-[11px] bg-white/60 rounded-lg p-2 border border-white/50"
                      >
                        <div className={cn(
                          'flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold',
                          step.type === 'deductive' ? 'bg-blue-100 text-blue-600' :
                          step.type === 'inductive' ? 'bg-green-100 text-green-600' :
                          'bg-purple-100 text-purple-600'
                        )}>
                          {step.stepNumber}
                        </div>
                        <div className="min-w-0">
                          <span className="text-[9px] font-medium text-slate-400 uppercase">
                            {step.type}
                          </span>
                          <p className="text-slate-600 leading-relaxed">
                            {step.conclusion}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Call to action */}
              {insight.callToAction && (
                <div className="p-2.5 bg-white/60 rounded-lg border border-white/50">
                  <div className="flex items-center gap-1.5 mb-1">
                    <IconTarget size={12} className="text-green-600" />
                    <span className="text-[9px] font-bold text-green-700 uppercase tracking-wider">
                      Next Step
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-700 leading-relaxed">
                    {insight.callToAction}
                  </p>
                </div>
              )}

              {/* Action buttons */}
              {onAction && (
                <div className="flex gap-1.5 pt-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); onAction('acknowledge'); }}
                    className="flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-100 hover:bg-green-200 px-2.5 py-1.5 rounded-lg transition-colors"
                  >
                    <IconCheck size={12} /> Got It
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onAction('dismiss'); }}
                    className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-700 hover:bg-white/60 px-2.5 py-1.5 rounded-lg transition-colors"
                  >
                    <IconX size={12} /> Dismiss
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

/**
 * Enhanced Pattern Card - Visual pattern with stroke impact bar
 */
const EnhancedPatternCard = memo(function EnhancedPatternCard({
  pattern,
}: {
  pattern: MinedPattern;
}) {
  const [expanded, setExpanded] = useState(false);
  const isNegative = pattern.strokeImpact > 0;
  const impactAbs = Math.abs(pattern.strokeImpact);
  const impactWidth = Math.min(100, (impactAbs / 2) * 100); // Scale: 2 strokes = 100%
  const confidencePct = Math.round(pattern.confidence * 100);

  const getTypeIcon = () => {
    switch (pattern.patternType) {
      case 'conditional': return <IconStar size={12} className="text-amber-500" />;
      case 'compound': return <IconSparkles size={12} className="text-violet-500" />;
      case 'anomaly': return <IconAlertCircle size={12} className="text-orange-500" />;
      case 'temporal': return <IconTrendingUp size={12} className="text-blue-500" />;
      default: return <IconStar size={12} className="text-slate-400" />;
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={cn(
        'bg-white/80 rounded-xl border border-slate-200/60 overflow-hidden',
        'shadow-sm hover:shadow-md transition-shadow'
      )}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-3"
      >
        {/* Top row: type + trend */}
        <div className="flex items-center gap-1.5 mb-1.5">
          {getTypeIcon()}
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
            {pattern.patternType}
          </span>
          {pattern.trend === 'strengthening' && (
            <IconTrendingUp size={10} className="text-red-400 ml-auto" />
          )}
          {pattern.trend === 'weakening' && (
            <IconTrendingDown size={10} className="text-green-400 ml-auto" />
          )}
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            className="text-slate-300 ml-auto"
          >
            <IconChevronDown size={12} />
          </motion.div>
        </div>

        {/* Description */}
        <p className="text-[12px] font-medium text-slate-800 leading-snug mb-2 line-clamp-2">
          {pattern.description || 'Pattern detected in performance data'}
        </p>

        {/* Stroke impact bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className={cn(
              'text-xs font-bold tabular-nums',
              isNegative ? 'text-red-600' : 'text-green-600'
            )}>
              {isNegative ? '+' : '-'}{impactAbs.toFixed(1)} strokes/round
            </span>
            <span className="text-[10px] text-slate-400">
              {confidencePct}%
            </span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${impactWidth}%` }}
              transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
              className={cn(
                'h-full rounded-full',
                isNegative
                  ? 'bg-gradient-to-r from-red-400 to-red-500'
                  : 'bg-gradient-to-r from-green-400 to-green-500'
              )}
            />
          </div>
        </div>
      </button>

      {/* Expanded */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2.5 border-t border-slate-100/80 pt-2.5">
              {/* Conditions */}
              {pattern.conditions.length > 0 && (
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                    When
                  </span>
                  <div className="mt-1 space-y-1">
                    {pattern.conditions.map((c, i) => (
                      <div key={i} className="text-[11px] text-slate-600 bg-slate-50/80 rounded-lg px-2.5 py-1.5">
                        {c.label || `${c.field} ${c.operator} ${c.value}`}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center bg-slate-50/80 rounded-lg py-2">
                  <div className="text-sm font-bold text-slate-800 tabular-nums">
                    {Math.round(pattern.support * 100)}%
                  </div>
                  <div className="text-[9px] text-slate-400">Frequency</div>
                </div>
                <div className="text-center bg-slate-50/80 rounded-lg py-2">
                  <div className="text-sm font-bold text-slate-800 tabular-nums">
                    {pattern.lift.toFixed(1)}x
                  </div>
                  <div className="text-[9px] text-slate-400">Lift</div>
                </div>
                <div className="text-center bg-slate-50/80 rounded-lg py-2">
                  <div className="text-sm font-bold text-slate-800 tabular-nums">
                    {pattern.sampleSize}
                  </div>
                  <div className="text-[9px] text-slate-400">Samples</div>
                </div>
              </div>

              {/* Recommendation */}
              {pattern.recommendation && (
                <div className="p-2.5 bg-green-50/80 rounded-lg border border-green-100/60">
                  <div className="flex items-center gap-1.5 mb-1">
                    <IconTarget size={10} className="text-green-600" />
                    <span className="text-[9px] font-bold text-green-700 uppercase">Recommendation</span>
                  </div>
                  <p className="text-[11px] text-green-800 leading-relaxed">
                    {pattern.recommendation}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

/**
 * Enhanced Prediction Card - Visual confidence gauge + score distribution
 */
const EnhancedPredictionCard = memo(function EnhancedPredictionCard({
  prediction,
  playerName,
}: {
  prediction: PerformancePrediction & { playerName?: string };
  playerName?: string;
}) {
  const name = playerName || prediction.playerName;
  const confidencePct = Math.round((prediction.calibratedConfidence ?? prediction.confidence) * 100);
  const rangeLow = prediction.predictionRange?.low ?? prediction.predictedRangeLow;
  const rangeHigh = prediction.predictionRange?.high ?? prediction.predictedRangeHigh;
  const hasRange = Number.isFinite(rangeLow) && Number.isFinite(rangeHigh);
  const factors = prediction.factors ?? prediction.keyFactors ?? [];

  const isPositive = prediction.predictedValue < 0;
  const isNeutral = Math.abs(prediction.predictedValue) < 0.5;

  const formatScore = (v: number) => v === 0 ? 'E' : v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1);

  const isTailRiskProbs = (r: typeof prediction.tailRisks): r is TailRiskProbabilities =>
    r !== undefined && !Array.isArray(r) && 'blowupProbability' in r;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white/80 rounded-xl border border-slate-200/60 p-3 shadow-sm hover:shadow-md transition-shadow"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-blue-50 flex items-center justify-center">
            <IconTarget size={12} className="text-blue-600" />
          </div>
          <div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
              Next Round
            </span>
            {name && (
              <span className="text-[11px] text-slate-600 font-medium">{name}</span>
            )}
          </div>
        </div>
        <span className={cn(
          'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
          prediction.trend === 'improving' ? 'bg-green-100 text-green-700' :
          prediction.trend === 'declining' ? 'bg-red-100 text-red-700' :
          'bg-slate-100 text-slate-600'
        )}>
          {prediction.trend === 'improving' ? 'Improving' :
           prediction.trend === 'declining' ? 'Declining' : 'Steady'}
        </span>
      </div>

      {/* Score prediction + confidence gauge */}
      <div className="flex items-center gap-3 mb-3">
        <span className={cn(
          'text-2xl font-bold tabular-nums',
          isNeutral ? 'text-slate-700' : isPositive ? 'text-green-600' : 'text-red-600'
        )}>
          {formatScore(prediction.predictedValue)}
        </span>

        {/* Mini confidence gauge */}
        <div className="flex-1">
          <div className="flex justify-between text-[9px] text-slate-400 mb-0.5">
            <span>Confidence</span>
            <span className="font-medium">{confidencePct}%</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${confidencePct}%` }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className={cn(
                'h-full rounded-full',
                confidencePct >= 70 ? 'bg-green-500' :
                confidencePct >= 50 ? 'bg-amber-500' : 'bg-red-500'
              )}
            />
          </div>
        </div>
      </div>

      {/* Range bar */}
      {hasRange && (
        <div className="flex items-center justify-between text-[10px] text-slate-400 mb-2.5">
          <span className="tabular-nums">{formatScore(rangeLow)}</span>
          <div className="flex-1 mx-2 h-px bg-slate-200 relative">
            <div className="absolute left-1/2 -translate-x-1/2 -top-0.5 w-1.5 h-1.5 rounded-full bg-blue-500" />
          </div>
          <span className="tabular-nums">{formatScore(rangeHigh)}</span>
        </div>
      )}

      {/* Factors */}
      {factors.length > 0 && (
        <div className="space-y-1">
          {factors.slice(0, 3).map((f: { name: string; contribution: number }, i: number) => (
            <div key={i} className="flex items-center justify-between text-[11px]">
              <span className="text-slate-500">{f.name}</span>
              <span className={cn(
                'font-medium tabular-nums',
                f.contribution > 0 ? 'text-red-500' : 'text-green-500'
              )}>
                {f.contribution > 0 ? '+' : ''}{f.contribution.toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Tail risks */}
      {isTailRiskProbs(prediction.tailRisks) && (
        <div className="flex gap-2 mt-2.5 pt-2.5 border-t border-slate-100">
          <div className="flex-1 text-center bg-red-50/60 rounded-lg py-1.5">
            <div className="text-[10px] text-red-400">Blowup</div>
            <div className="text-xs font-bold text-red-600 tabular-nums">
              {Math.round(prediction.tailRisks.blowupProbability * 100)}%
            </div>
          </div>
          <div className="flex-1 text-center bg-green-50/60 rounded-lg py-1.5">
            <div className="text-[10px] text-green-400">Great Round</div>
            <div className="text-xs font-bold text-green-600 tabular-nums">
              {Math.round(prediction.tailRisks.greatRoundProbability * 100)}%
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
});

/**
 * Empty state for tabs
 */
function TabEmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center py-8 text-center">
      <div className="w-10 h-10 rounded-xl bg-white/80 shadow-sm flex items-center justify-center mb-2.5 border border-white/50">
        {icon}
      </div>
      <h4 className="text-[13px] font-semibold text-slate-700 mb-0.5">{title}</h4>
      <p className="text-[11px] text-slate-400 max-w-[200px] leading-relaxed">{description}</p>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function IntelligenceCommandCenter({
  teamId: _teamId,
  coachId,
  initialInsights = [],
  initialPatterns = [],
  initialPredictions = [],
}: IntelligenceCommandCenterProps) {
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [insights, setInsights] = useState<ComposedInsight[]>(initialInsights);
  const [patterns, setPatterns] = useState<MinedPattern[]>(initialPatterns);
  const [predictions, setPredictions] = useState<Array<PerformancePrediction & { playerName?: string }>>(initialPredictions);
  const [error, setError] = useState<string | null>(null);
  const [lastAnalyzed, setLastAnalyzed] = useState<Date | null>(null);

  // Sort insights: urgent first, then cautionary, then rest
  const sortedInsights = useMemo(() => {
    const priority: Record<string, number> = { urgent: 0, cautionary: 1, neutral: 2, encouraging: 3, celebratory: 4 };
    return [...insights].sort((a, b) => (priority[a.tone] ?? 5) - (priority[b.tone] ?? 5));
  }, [insights]);

  // Sort patterns by stroke impact (highest first)
  const sortedPatterns = useMemo(() =>
    [...patterns].sort((a, b) => Math.abs(b.strokeImpact) - Math.abs(a.strokeImpact)),
  [patterns]);

  const handleAnalyze = useCallback(() => {
    startTransition(async () => {
      setError(null);
      try {
        const result = await generateTeamInsight();
        if (result.success) {
          setInsights(result.insights || []);
          setPatterns(result.patterns || []);
          setPredictions(result.predictions || []);
          setLastAnalyzed(new Date());
          try { await recordInteraction(coachId, 'coach', 'action', 'generate_insights'); } catch { /* non-critical */ }
        } else {
          setError(result.error || 'Analysis failed');
        }
      } catch {
        setError('Unable to analyze team. Check connection and try again.');
      }
    });
  }, [coachId]);

  const handleInsightAction = useCallback(async (insight: ComposedInsight, action: 'acknowledge' | 'dismiss') => {
    setInsights(prev => prev.filter(i => i !== insight));
    try {
      const result = action === 'acknowledge'
        ? await acknowledgeComposedInsight(insight)
        : await dismissComposedInsight(insight);
      if (!result.success) {
        setInsights(prev => [...prev, insight]);
        setError(`Failed to ${action} insight`);
      }
    } catch {
      setInsights(prev => [...prev, insight]);
    }
  }, []);

  const hasData = insights.length > 0 || patterns.length > 0 || predictions.length > 0;

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: 'overview', label: 'Overview', count: 0 },
    { id: 'insights', label: 'Insights', count: insights.length },
    { id: 'patterns', label: 'Patterns', count: patterns.length },
    { id: 'predictions', label: 'Forecasts', count: predictions.length },
  ];

  return (
    <div className="space-y-2.5 overflow-hidden p-3 md:p-4">
      {/* Command Center Header */}
      <div className="relative overflow-hidden rounded-xl border border-white/50 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-3 shadow-lg">
        {/* Ambient effects */}
        <div className="absolute -right-6 -top-6 w-20 h-20 rounded-full bg-primary-500/20 blur-2xl pointer-events-none" />
        <div className="absolute -left-4 -bottom-4 w-16 h-16 rounded-full bg-blue-500/15 blur-xl pointer-events-none" />

        <div className="relative z-10">
          {/* Top row */}
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-primary-500/25">
                <IconSparkles size={14} className="text-white" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white leading-tight">CoachHelm AI</h3>
                <p className="text-[9px] text-white/40 uppercase tracking-[0.15em]">Intelligence Engine</p>
              </div>
            </div>
            <Link
              href="/golf/dashboard/settings/coaching-intelligence"
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="CoachHelm Settings"
            >
              <IconSettings size={14} className="text-white/40" />
            </Link>
          </div>

          {/* Analyze button */}
          <button
            onClick={handleAnalyze}
            disabled={isPending}
            className={cn(
              'w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-all',
              isPending
                ? 'bg-white/10 text-white/40 cursor-not-allowed'
                : 'bg-gradient-to-r from-primary-500 to-emerald-500 text-white shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 active:scale-[0.98]'
            )}
          >
            {isPending ? (
              <>
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                  <IconRefresh size={13} />
                </motion.div>
                Analyzing Team...
              </>
            ) : (
              <>
                <IconSparkles size={13} />
                {hasData ? 'Re-Analyze Team' : 'Analyze Team'}
              </>
            )}
          </button>

          {/* Status line */}
          {lastAnalyzed && (
            <p className="text-[9px] text-white/30 text-center mt-1.5 uppercase tracking-wider">
              Last analyzed {lastAnalyzed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200/60 bg-red-50/80 px-3 py-2 text-[11px] text-red-600">
          {error}
        </div>
      )}

      {/* Tabs */}
      {hasData && (
        <div className="flex gap-0.5 rounded-lg border border-white/50 bg-white/60 backdrop-blur-sm p-0.5 shadow-sm">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1 px-1.5 py-1.5 text-[10px] font-bold rounded-md transition-all uppercase tracking-wider',
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-400 hover:text-slate-600'
              )}
            >
              <span className="truncate">{tab.label}</span>
              {tab.count > 0 && (
                <span className={cn(
                  'text-[8px] min-w-[16px] h-4 flex items-center justify-center px-1 rounded-full',
                  activeTab === tab.id
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-slate-200/60 text-slate-500'
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === 'overview' && hasData && (
          <motion.div key="overview" {...fadeIn} className="space-y-2.5">
            <OverviewSummary insights={insights} patterns={patterns} />

            {/* Top insight */}
            {sortedInsights[0] && (() => {
              const topInsight = sortedInsights[0];
              return (
                <EnhancedInsightCard
                  insight={topInsight}
                  onAction={(action) => handleInsightAction(topInsight, action)}
                />
              );
            })()}

            {/* Top pattern */}
            {sortedPatterns[0] && (
              <EnhancedPatternCard pattern={sortedPatterns[0]} />
            )}

            {/* Top prediction */}
            {predictions[0] && (
              <EnhancedPredictionCard prediction={predictions[0]} />
            )}

            {/* View all link */}
            <Link
              href="/golf/dashboard/insights"
              className="flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-semibold text-primary-600 hover:text-primary-700 transition-colors"
            >
              View Full Intelligence Dashboard
              <IconChevronRight size={14} />
            </Link>
          </motion.div>
        )}

        {activeTab === 'insights' && (
          <motion.div key="insights" {...fadeIn} className="space-y-2">
            {sortedInsights.length > 0 ? (
              sortedInsights.map((insight, i) => (
                <EnhancedInsightCard
                  key={i}
                  insight={insight}
                  onAction={(action) => handleInsightAction(insight, action)}
                />
              ))
            ) : (
              <TabEmptyState
                icon={<IconSparkles size={20} className="text-slate-300" />}
                title="No insights yet"
                description="Click 'Analyze Team' to generate AI-powered coaching insights"
              />
            )}
          </motion.div>
        )}

        {activeTab === 'patterns' && (
          <motion.div key="patterns" {...fadeIn} className="space-y-2">
            {sortedPatterns.length > 0 ? (
              sortedPatterns.map(pattern => (
                <EnhancedPatternCard key={pattern.id} pattern={pattern} />
              ))
            ) : (
              <TabEmptyState
                icon={<IconStar size={20} className="text-slate-300" />}
                title="No patterns detected"
                description="Patterns emerge from analyzing recurring trends in player data"
              />
            )}
          </motion.div>
        )}

        {activeTab === 'predictions' && (
          <motion.div key="predictions" {...fadeIn} className="space-y-2">
            {predictions.length > 0 ? (
              predictions.map((pred, i) => (
                <EnhancedPredictionCard key={i} prediction={pred} />
              ))
            ) : (
              <TabEmptyState
                icon={<IconTarget size={20} className="text-slate-300" />}
                title="No predictions yet"
                description="Predictions require sufficient round history to generate forecasts"
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* No data state */}
      {!hasData && !isPending && (
        <div className="bg-white/60 backdrop-blur-sm rounded-xl border border-white/40 p-4">
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-50 to-emerald-50 flex items-center justify-center mb-3 shadow-sm">
              <IconSparkles size={22} className="text-primary-500" />
            </div>
            <h4 className="text-[13px] font-semibold text-slate-800 mb-1">
              Ready to Analyze
            </h4>
            <p className="text-[11px] text-slate-400 max-w-[220px] leading-relaxed mb-3">
              CoachHelm AI will mine patterns, discover causal relationships, and predict performance trends across your team.
            </p>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {['Pattern Mining', 'Causal Discovery', 'Predictions', 'Shot Analysis'].map(feature => (
                <span key={feature} className="text-[9px] font-medium text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">
                  {feature}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
