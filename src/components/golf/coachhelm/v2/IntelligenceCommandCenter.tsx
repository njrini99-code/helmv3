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
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  IconBrain,
  IconBell,
  IconLayers,
  IconChartBar,
  IconMessageSquare,
  IconChartRadar,
  IconTrophy,
} from '@/components/icons';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { InlineNotice } from '@/components/fairway/feedback/InlineNotice';
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
  InsightGroup,
  InsightCategory,
} from '@/lib/coachhelm/v2/types';

// ============================================================================
// TYPES
// ============================================================================

type ICCVariant = 'widget' | 'page';

interface IntelligenceCommandCenterProps {
  /**
   * The team rendered around this command center. NOTE: the Deep-Analysis run is
   * intentionally SESSION-SCOPED, not driven by this prop — `handleAnalyze` calls
   * `generateTeamInsight()` with no args and the server action re-resolves the
   * coach's ACTIVE team via `resolveCoachTeamIdWithCookie` (cookie-aware, so it
   * tracks the men's/women's active-team toggle). Passing `teamId` here would
   * risk analyzing a team other than the one the coach has toggled to. The prop
   * is retained for parity with the surrounding brief (which resolves the same
   * active team server-side, so the displayed and analyzed teams are one source
   * of truth) and for any future per-team display use.
   */
  teamId: string;
  coachId: string;
  initialInsights?: ComposedInsight[];
  initialPatterns?: MinedPattern[];
  initialPredictions?: Array<PerformancePrediction & { playerName?: string }>;
  /** 'widget' = compact dashboard card, 'page' = full intelligence page */
  variant?: ICCVariant;
}

type TabId = 'overview' | 'insights' | 'patterns' | 'predictions';

// ============================================================================
// HELPER: Tone config
// ============================================================================

// Fairway-token tone vocabulary. The CoachHelm AI status palette is GREEN-
// FORWARD (DESIGN-SYSTEM §1): success === the helm accent, warning is warm
// amber, danger is the canonical red, and "info"/celebratory are quiet warm-
// neutral chrome (the system has NO blue/violet). Every class resolves to a
// `--fw-*` token (defined on :root) so the card reads as one cohesive warm
// Fairway surface beneath the brief — solid surfaces for dense data, no glass.
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
    bg: 'bg-fw-danger-bg',
    border: 'border-fw-danger/30',
    icon: 'text-fw-danger',
    badge: 'bg-fw-danger-bg text-fw-danger',
    badgeText: 'Urgent',
    accentBar: 'bg-fw-danger',
    label: 'Needs immediate attention',
  },
  cautionary: {
    bg: 'bg-fw-warning-bg',
    border: 'border-fw-warning/30',
    icon: 'text-fw-warning',
    badge: 'bg-fw-warning-bg text-fw-warning',
    badgeText: 'Watch',
    accentBar: 'bg-fw-warning',
    label: 'Trending concern',
  },
  encouraging: {
    bg: 'bg-fw-success-bg',
    border: 'border-accent-200',
    icon: 'text-fw-success',
    badge: 'bg-fw-success-bg text-fw-success',
    badgeText: 'Positive',
    accentBar: 'bg-accent-500',
    label: 'Good trend',
  },
  celebratory: {
    bg: 'bg-fw-success-bg',
    border: 'border-accent-200',
    icon: 'text-fw-success',
    badge: 'bg-fw-success-bg text-fw-success',
    badgeText: 'Standout',
    accentBar: 'bg-accent-500',
    label: 'Notable achievement',
  },
  neutral: {
    bg: 'bg-surface-sunken',
    border: 'border-border-subtle',
    icon: 'text-text-secondary',
    badge: 'bg-surface-sunken text-text-secondary',
    badgeText: 'Info',
    accentBar: 'bg-border-strong',
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
  variant = 'widget',
}: {
  insights: ComposedInsight[];
  patterns: MinedPattern[];
  variant?: ICCVariant;
}) {
  const isPage = variant === 'page';
  const urgentCount = insights.filter(i => i.tone === 'urgent').length;
  const cautionCount = insights.filter(i => i.tone === 'cautionary').length;
  const positiveCount = insights.filter(i => i.tone === 'encouraging' || i.tone === 'celebratory').length;
  const highImpactPatterns = patterns.filter(p => Math.abs(p.strokeImpact) >= 0.5).length;
  // "Signal pressure" — how much attention THIS analysis surfaced, derived from
  // the open insight/pattern load. Deliberately NOT a second "Team Health /100":
  // the canonical team-health number lives in the brief's PulseStrip
  // (getTeamCategoryInsights.teamHealth). Showing two divergent /100 "health"
  // figures on one screen is a data lie (Nielsen #4 consistency, B4) — this is
  // labelled and scaled as a distinct read so the two never compete.
  const pressureScore = useMemo(() => {
    if (insights.length === 0 && patterns.length === 0) return null;
    let score = 70;
    score -= urgentCount * 15;
    score -= cautionCount * 5;
    score += positiveCount * 5;
    score -= highImpactPatterns * 3;
    return Math.max(0, Math.min(100, score));
  }, [urgentCount, cautionCount, positiveCount, highImpactPatterns, insights.length, patterns.length]);

  if (!pressureScore && insights.length === 0) return null;

  // Higher score = calmer (fewer/softer open signals); lower = more pressure.
  const getPressureColor = (score: number) => {
    if (score >= 80) return 'text-fw-success';
    if (score >= 60) return 'text-fw-warning';
    return 'text-fw-danger';
  };

  const getPressureLabel = (score: number) => {
    if (score >= 80) return 'Quiet';
    if (score >= 60) return 'Some signals';
    return 'High pressure';
  };

  return (
    <div className={cn(
      'grid gap-2 mb-3',
      isPage ? 'grid-cols-2 md:grid-cols-4 gap-4 mb-6' : 'grid-cols-2'
    )}>
      {/* Signal Pressure — analysis-scoped read, NOT a second Team Health/100 */}
      {pressureScore !== null && (
        <div className={cn(
          'bg-surface rounded-xl border border-border-subtle shadow-soft',
          isPage ? 'p-5 rounded-2xl' : 'p-3'
        )}>
          <div className={cn('flex items-center gap-2', isPage ? 'mb-3' : 'mb-1.5')}>
            <div className={cn(
              'rounded-md bg-surface-sunken flex items-center justify-center',
              isPage ? 'w-9 h-9 rounded-lg' : 'w-6 h-6'
            )}>
              <IconBell size={isPage ? 16 : 12} className="text-text-tertiary" />
            </div>
            <span className={cn(
              'font-medium text-text-tertiary uppercase tracking-wider',
              isPage ? 'text-xs' : 'text-xs'
            )}>Signal Pressure</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={cn('font-medium tabular-nums', getPressureColor(pressureScore), isPage ? 'text-4xl' : 'text-2xl')}>{pressureScore}</span>
            <span className={cn('text-text-tertiary', isPage ? 'text-sm' : 'text-xs')}>/100</span>
          </div>
          <span className={cn('font-medium', getPressureColor(pressureScore), isPage ? 'text-sm' : 'text-xs')}>
            {getPressureLabel(pressureScore)}
          </span>
        </div>
      )}

      {/* Quick Counts */}
      <div className={cn(
        'bg-surface rounded-xl border border-border-subtle shadow-soft',
        isPage ? 'p-5 rounded-2xl' : 'p-3'
      )}>
        <div className={cn('flex items-center gap-2', isPage ? 'mb-3' : 'mb-1.5')}>
          <div className={cn(
            'rounded-md bg-surface-sunken flex items-center justify-center',
            isPage ? 'w-9 h-9 rounded-lg' : 'w-6 h-6'
          )}>
            <IconSparkles size={isPage ? 16 : 12} className="text-text-tertiary" />
          </div>
          <span className={cn(
            'font-medium text-text-tertiary uppercase tracking-wider',
            isPage ? 'text-xs' : 'text-xs'
          )}>AI Analysis</span>
        </div>
        <div className={cn('space-y-1', isPage && 'space-y-2')}>
          {urgentCount > 0 && (
            <div className="flex items-center gap-2">
              <div className={cn('rounded-full bg-fw-danger', isPage ? 'w-2 h-2' : 'w-1.5 h-1.5')} />
              <span className={cn('text-fw-danger font-medium', isPage ? 'text-sm' : 'text-xs')}>{urgentCount} urgent</span>
            </div>
          )}
          {cautionCount > 0 && (
            <div className="flex items-center gap-2">
              <div className={cn('rounded-full bg-fw-warning', isPage ? 'w-2 h-2' : 'w-1.5 h-1.5')} />
              <span className={cn('text-fw-warning font-medium', isPage ? 'text-sm' : 'text-xs')}>{cautionCount} watch</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className={cn('rounded-full bg-accent-500', isPage ? 'w-2 h-2' : 'w-1.5 h-1.5')} />
            <span className={cn('text-text-secondary', isPage ? 'text-sm' : 'text-xs')}>{positiveCount} positive</span>
          </div>
        </div>
      </div>

      {/* Page-only: extra stat cards */}
      {isPage && (
        <>
          <div className="bg-surface rounded-2xl border border-border-subtle p-5 shadow-soft">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-lg bg-surface-sunken flex items-center justify-center">
                <IconTrendingUp size={16} className="text-text-tertiary" />
              </div>
              <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Patterns</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-display font-light tabular-nums tracking-[-0.025em] text-text-primary">{patterns.length}</span>
            </div>
            <span className="text-sm text-text-tertiary">
              {highImpactPatterns} high-impact
            </span>
          </div>
          <div className="bg-surface rounded-2xl border border-border-subtle p-5 shadow-soft">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-lg bg-surface-sunken flex items-center justify-center">
                <IconTarget size={16} className="text-text-tertiary" />
              </div>
              <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Insights</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-display font-light tabular-nums tracking-[-0.025em] text-text-primary">{insights.length}</span>
            </div>
            <span className="text-sm text-text-tertiary">total active</span>
          </div>
        </>
      )}
    </div>
  );
});

/**
 * Enhanced Insight Card - Premium insight display with reasoning chain
 */
const EnhancedInsightCard = memo(function EnhancedInsightCard({
  insight,
  onAction,
  variant = 'widget',
}: {
  insight: ComposedInsight;
  onAction?: (action: 'acknowledge' | 'dismiss') => void;
  variant?: ICCVariant;
}) {
  const [expanded, setExpanded] = useState(variant === 'page');
  const isPage = variant === 'page';
  const tone = TONE_CONFIG[insight.tone] || TONE_CONFIG.neutral;
  const confidencePct = Math.round(insight.confidence * 100);

  // Use direct strokeImpact if available, fall back to regex extraction for legacy insights
  let strokeImpact: number | null = insight.strokeImpact ?? null;
  if (strokeImpact === null) {
    const strokeImpactStep = insight.reasoning?.reasoningChain?.find(
      (s: ReasoningStep) => s.type === 'deductive' && s.conclusion?.includes('strokes/round')
    );
    const strokeImpactMatch = strokeImpactStep?.conclusion?.match(/([\d.]+)\s*strokes\/round/);
    strokeImpact = strokeImpactMatch?.[1] ? parseFloat(strokeImpactMatch[1]) : null;
  }

  // Use direct evidenceMetrics if available, fall back to reasoning chain extraction
  const hasDirectEvidence = insight.evidenceMetrics && insight.evidenceMetrics.length > 0;
  const evidenceSteps = hasDirectEvidence
    ? [] // Will render direct evidence instead
    : (insight.reasoning?.reasoningChain || []).filter(
        (s: ReasoningStep) => s.type !== 'deductive' || !s.conclusion?.includes('strokes/round')
      );

  return (
    <div
      className={cn(
        'border overflow-hidden transition-shadow',
        isPage ? 'rounded-2xl' : 'rounded-xl',
        tone.bg, tone.border,
        expanded ? 'shadow-md' : 'shadow-sm hover:shadow-md'
      )}
    >
      {/* Accent bar */}
      <div className={cn(isPage ? 'h-1' : 'h-0.5', tone.accentBar)} />

      {/* Header - always visible */}
      <Button variant="ghost"
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'w-full text-left flex items-start',
          isPage ? 'p-5 gap-4' : 'p-3 gap-2.5'
        )}
      >
        {/* Tone icon */}
        <div className={cn(
          'flex-shrink-0 rounded-lg flex items-center justify-center',
          'bg-surface shadow-soft border border-border-subtle',
          isPage ? 'w-10 h-10' : 'w-7 h-7'
        )}>
          <IconSparkles size={isPage ? 18 : 14} className={tone.icon} />
        </div>

        <div className="flex-1 min-w-0">
          {/* Badge row */}
          <div className={cn('flex items-center gap-2 flex-wrap', isPage ? 'mb-2' : 'mb-1')}>
            <span className={cn(
              'font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full',
              isPage ? 'text-xs px-2 py-1' : 'text-eyebrow',
              tone.badge
            )}>
              {tone.badgeText}
            </span>
            {/* Stroke impact badge */}
            {strokeImpact !== null && strokeImpact > 0 && (
              <span className={cn(
                'font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full tabular-nums',
                isPage ? 'text-xs px-2 py-1' : 'text-eyebrow',
                strokeImpact >= 1.0
                  ? 'bg-fw-danger-bg text-fw-danger'
                  : strokeImpact >= 0.5
                    ? 'bg-fw-warning-bg text-fw-warning'
                    : 'bg-surface-sunken text-text-secondary'
              )}>
                {strokeImpact >= 1.0 ? 'Major' : strokeImpact >= 0.5 ? 'Significant' : 'Minor'}: {strokeImpact.toFixed(1)} strokes/rd
              </span>
            )}
            <span className={cn('text-text-tertiary', isPage ? 'text-xs' : 'text-xs')}>
              {confidencePct}% confidence
            </span>
          </div>

          {/* Headline */}
          <h4 className={cn(
            'font-medium text-text-primary leading-snug mb-0.5',
            isPage ? 'text-base' : 'text-body-sm'
          )}>
            {insight.headline}
          </h4>

          {/* Body preview */}
          <p className={cn(
            'text-text-secondary line-clamp-2 leading-relaxed',
            isPage ? 'text-sm' : 'text-xs'
          )}>
            {insight.body}
          </p>
        </div>

        {/* Expand chevron */}
        <div className={cn('flex-shrink-0 mt-1 text-text-tertiary', expanded && 'rotate-180')}>
          <IconChevronDown size={isPage ? 18 : 14} />
        </div>
      </Button>

      {/* Expanded content */}
      {expanded && (
        <div className="overflow-hidden">
            <div className={cn('pt-0 space-y-2.5', isPage ? 'px-5 pb-5 space-y-4' : 'px-3 pb-3')}>
              {/* Full body */}
              <p className={cn('text-text-secondary leading-relaxed', isPage ? 'text-sm' : 'text-xs')}>
                {insight.body}
              </p>

              {/* Direct evidence metrics (structured data - preferred path) */}
              {hasDirectEvidence && (
                <div>
                  <h5 className={cn(
                    'font-medium text-text-tertiary uppercase tracking-[0.12em]',
                    isPage ? 'text-xs mb-2' : 'text-eyebrow mb-1.5'
                  )}>
                    Evidence
                  </h5>
                  <div className={cn(
                    'grid gap-2',
                    isPage
                      ? (insight.evidenceMetrics!.length <= 3 ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-2 lg:grid-cols-4')
                      : 'grid-cols-2'
                  )}>
                    {insight.evidenceMetrics!.slice(0, isPage ? 8 : 4).map((metric, i) => (
                      <div
                        key={i}
                        className={cn(
                          'bg-surface-sunken rounded-lg border border-border-subtle text-center',
                          isPage ? 'p-3' : 'p-2'
                        )}
                      >
                        <div className={cn(
                          'font-medium text-text-primary tabular-nums',
                          isPage ? 'text-base' : 'text-sm'
                        )}>
                          {String(metric.value)}
                        </div>
                        <div className={cn(
                          'text-text-tertiary leading-tight mt-0.5',
                          isPage ? 'text-xs' : 'text-eyebrow'
                        )}>
                          {metric.label}
                        </div>
                        {metric.benchmark != null && (
                          <div className={cn(
                            'mt-1 font-medium',
                            isPage ? 'text-xs' : 'text-eyebrow',
                            metric.belowBenchmark ? 'text-fw-danger' : 'text-fw-success'
                          )}>
                            vs {metric.benchmark}{String(metric.value).includes('%') ? '%' : ''}
                          </div>
                        )}
                        {metric.trend && (
                          <div className={cn(
                            'mt-0.5 font-medium',
                            isPage ? 'text-xs' : 'text-eyebrow',
                            metric.trend === 'improving' ? 'text-fw-success' :
                            metric.trend === 'declining' ? 'text-fw-danger' :
                            'text-text-tertiary'
                          )}>
                            {metric.trend === 'improving' ? '\u2191 Improving' : metric.trend === 'declining' ? '\u2193 Declining' : '\u2192 Stable'}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Legacy evidence from reasoning chain (fallback for older insights) */}
              {!hasDirectEvidence && evidenceSteps.length > 0 && (
                <div>
                  <h5 className={cn(
                    'font-medium text-text-tertiary uppercase tracking-[0.12em]',
                    isPage ? 'text-xs mb-2' : 'text-eyebrow mb-1.5'
                  )}>
                    Evidence
                  </h5>
                  <div className={cn(
                    'grid gap-2',
                    isPage
                      ? evidenceSteps.length <= 3 ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-2 lg:grid-cols-4'
                      : 'grid-cols-2'
                  )}>
                    {evidenceSteps.slice(0, isPage ? 8 : 4).map((step: ReasoningStep, i: number) => (
                      <div
                        key={i}
                        className={cn(
                          'bg-surface-sunken rounded-lg border border-border-subtle text-center',
                          isPage ? 'p-3' : 'p-2'
                        )}
                      >
                        <div className={cn(
                          'font-medium text-text-primary tabular-nums',
                          isPage ? 'text-base' : 'text-sm'
                        )}>
                          {step.premise?.split(':').slice(1).join(':').trim() || step.premise}
                        </div>
                        <div className={cn(
                          'text-text-tertiary leading-tight mt-0.5',
                          isPage ? 'text-xs' : 'text-eyebrow'
                        )}>
                          {step.premise?.split(':')[0]?.trim() || 'Metric'}
                        </div>
                        {step.inference?.startsWith('Benchmark:') && (
                          <div className={cn(
                            'mt-1 font-medium',
                            isPage ? 'text-xs' : 'text-eyebrow',
                            step.conclusion?.includes('below') ? 'text-fw-danger' :
                            step.conclusion?.includes('above') ? 'text-fw-success' :
                            'text-text-tertiary'
                          )}>
                            vs {step.inference.replace('Benchmark: ', '')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Stroke impact visual bar (if present) */}
              {strokeImpact !== null && strokeImpact > 0 && (
                <div className={cn(
                  'bg-surface-sunken rounded-lg border border-border-subtle',
                  isPage ? 'p-3' : 'p-2'
                )}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={cn(
                      'font-medium text-text-tertiary uppercase tracking-[0.12em]',
                      isPage ? 'text-xs' : 'text-eyebrow'
                    )}>
                      Stroke Impact
                    </span>
                    <span className={cn(
                      'font-medium tabular-nums',
                      isPage ? 'text-sm' : 'text-xs',
                      strokeImpact >= 1.0 ? 'text-fw-danger' : strokeImpact >= 0.5 ? 'text-fw-warning' : 'text-text-secondary'
                    )}>
                      +{strokeImpact.toFixed(1)} strokes/round
                    </span>
                  </div>
                  <div className={cn('bg-surface rounded-full overflow-hidden border border-border-subtle', isPage ? 'h-2' : 'h-1.5')}>
                    <div
                      className={cn(
                        'h-full rounded-full',
                        strokeImpact >= 1.0
                          ? 'bg-fw-danger'
                          : strokeImpact >= 0.5
                            ? 'bg-fw-warning'
                            : 'bg-border-strong'
                      )}
                      style={{ width: `${Math.min(100, (strokeImpact / 2) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Call to action / Recommendation */}
              {insight.callToAction && (
                <div className={cn(
                  'bg-fw-success-bg rounded-lg border border-accent-200',
                  isPage ? 'p-4' : 'p-2.5'
                )}>
                  <div className={cn('flex items-center gap-2', isPage ? 'mb-2' : 'mb-1')}>
                    <IconTarget size={isPage ? 14 : 12} className="text-fw-success" />
                    <span className={cn(
                      'font-medium text-fw-success uppercase tracking-[0.12em]',
                      isPage ? 'text-xs' : 'text-eyebrow'
                    )}>
                      Coach Action Plan
                    </span>
                  </div>
                  <p className={cn('text-text-secondary leading-relaxed', isPage ? 'text-sm' : 'text-xs')}>
                    {insight.callToAction}
                  </p>
                </div>
              )}

              {/* Action buttons */}
              {onAction && (
                <div className={cn('flex gap-2 pt-1', isPage && 'gap-2 pt-2')}>
                  <Button variant="primary"
                    onClick={(e) => { e.stopPropagation(); onAction('acknowledge'); }}
                    className={cn(
                      'flex items-center gap-1 font-medium text-fw-success bg-fw-success-bg hover:bg-accent-100 rounded-lg transition-colors',
                      isPage ? 'text-xs px-4 py-2' : 'text-xs px-2.5 py-1.5'
                    )}
                  >
                    <IconCheck size={isPage ? 14 : 12} /> Got It
                  </Button>
                  <Button variant="ghost"
                    onClick={(e) => { e.stopPropagation(); onAction('dismiss'); }}
                    className={cn(
                      'flex items-center gap-1 text-text-secondary hover:text-text-primary hover:bg-surface-sunken rounded-lg transition-colors',
                      isPage ? 'text-xs px-4 py-2' : 'text-xs px-2.5 py-1.5'
                    )}
                  >
                    <IconX size={isPage ? 14 : 12} /> Dismiss
                  </Button>
                </div>
              )}
            </div>
        </div>
      )}
    </div>
  );
});

// ============================================================================
// CATEGORY LABELS (mirror server-side labels)
// ============================================================================

const CATEGORY_LABELS: Record<InsightCategory, string> = {
  putting: 'Putting',
  ball_striking: 'Ball Striking',
  short_game: 'Short Game',
  course_management: 'Course Management',
  mental_game: 'Mental Game',
  scoring: 'Scoring Trends',
  shot_pattern: 'Shot Patterns',
  team_trend: 'Team Trends',
  general: 'General',
};

const CATEGORY_ICONS: Record<InsightCategory, typeof IconTarget> = {
  putting: IconTarget,
  ball_striking: IconTrendingUp,
  short_game: IconTarget,
  course_management: IconStar,
  mental_game: IconSparkles,
  scoring: IconTrendingDown,
  shot_pattern: IconTarget,
  team_trend: IconUsers,
  general: IconSparkles,
};

/**
 * InsightGroupCard - Groups related insights by category with player chips
 */
const InsightGroupCard = memo(function InsightGroupCard({
  group,
  onDismissGroup,
  onAcknowledgeGroup,
  variant = 'widget',
}: {
  group: InsightGroup;
  onDismissGroup?: (group: InsightGroup) => void;
  onAcknowledgeGroup?: (group: InsightGroup) => void;
  variant?: ICCVariant;
}) {
  const [expanded, setExpanded] = useState(variant === 'page');
  const isPage = variant === 'page';
  const tone = TONE_CONFIG[group.tone] || TONE_CONFIG.neutral;
  const confidencePct = Math.round(group.confidence * 100);
  const CategoryIcon = CATEGORY_ICONS[group.category] || IconSparkles;

  return (
    <div
      className={cn(
        'border overflow-hidden transition-shadow',
        isPage ? 'rounded-2xl' : 'rounded-xl',
        tone.bg, tone.border,
        expanded ? 'shadow-md' : 'shadow-sm hover:shadow-md'
      )}
    >
      {/* Accent bar */}
      <div className={cn(isPage ? 'h-1' : 'h-0.5', tone.accentBar)} />

      {/* Header */}
      <Button variant="ghost"
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'w-full text-left flex items-start',
          isPage ? 'p-5 gap-4' : 'p-3 gap-2.5'
        )}
      >
        {/* Category icon */}
        <div className={cn(
          'flex-shrink-0 rounded-lg flex items-center justify-center',
          'bg-surface shadow-soft border border-border-subtle',
          isPage ? 'w-10 h-10' : 'w-7 h-7'
        )}>
          <CategoryIcon size={isPage ? 18 : 14} className={tone.icon} />
        </div>

        <div className="flex-1 min-w-0">
          {/* Badge row */}
          <div className={cn('flex items-center gap-2 flex-wrap', isPage ? 'mb-2' : 'mb-1')}>
            <span className={cn(
              'font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full',
              isPage ? 'text-xs px-2 py-1' : 'text-eyebrow',
              tone.badge
            )}>
              {tone.badgeText}
            </span>
            <span className={cn(
              'font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-surface-sunken text-text-secondary',
              isPage ? 'text-xs px-2 py-1' : 'text-eyebrow'
            )}>
              {CATEGORY_LABELS[group.category]}
            </span>
            {group.strokeImpact != null && group.strokeImpact > 0 && (
              <span className={cn(
                'font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full tabular-nums',
                isPage ? 'text-xs px-2 py-1' : 'text-eyebrow',
                group.strokeImpact >= 1.0
                  ? 'bg-fw-danger-bg text-fw-danger'
                  : group.strokeImpact >= 0.5
                    ? 'bg-fw-warning-bg text-fw-warning'
                    : 'bg-surface-sunken text-text-secondary'
              )}>
                {group.strokeImpact >= 1.0 ? 'Major' : group.strokeImpact >= 0.5 ? 'Significant' : 'Minor'}: {group.strokeImpact.toFixed(1)} strokes/rd
              </span>
            )}
            <span className={cn('text-text-tertiary', isPage ? 'text-xs' : 'text-xs')}>
              {confidencePct}%
            </span>
          </div>

          {/* Headline */}
          <h4 className={cn(
            'font-medium text-text-primary leading-snug mb-1',
            isPage ? 'text-base' : 'text-body-sm'
          )}>
            {group.headline}
          </h4>

          {/* Player chips */}
          {group.players.length > 0 && (
            <div className={cn('flex items-center gap-1 flex-wrap', isPage ? 'mb-1.5' : 'mb-1')}>
              {group.isTeamWide && (
                <span className={cn(
                  'inline-flex items-center gap-1 font-medium rounded-full border',
                  isPage ? 'text-xs px-2.5 py-0.5' : 'text-eyebrow px-2 py-0.5',
                  'bg-fw-success-bg text-fw-success border-accent-200'
                )}>
                  <IconUsers size={isPage ? 12 : 10} />
                  Team-wide
                </span>
              )}
              {group.players.slice(0, isPage ? 8 : 4).map((p) => (
                <span
                  key={p.playerId}
                  className={cn(
                    'inline-flex items-center font-medium rounded-full border',
                    isPage ? 'text-xs px-2.5 py-0.5' : 'text-eyebrow px-2 py-0.5',
                    'bg-surface-sunken text-text-secondary border-border-subtle'
                  )}
                >
                  {p.playerName}
                </span>
              ))}
              {group.players.length > (isPage ? 8 : 4) && (
                <span className={cn(
                  'text-text-tertiary font-medium',
                  isPage ? 'text-xs' : 'text-eyebrow'
                )}>
                  +{group.players.length - (isPage ? 8 : 4)} more
                </span>
              )}
            </div>
          )}

          {/* Body preview */}
          <p className={cn(
            'text-text-secondary line-clamp-2 leading-relaxed',
            isPage ? 'text-sm' : 'text-xs'
          )}>
            {group.body}
          </p>
        </div>

        {/* Expand chevron */}
        <div className={cn('flex-shrink-0 mt-1 text-text-tertiary', expanded && 'rotate-180')}>
          <IconChevronDown size={isPage ? 18 : 14} />
        </div>
      </Button>

      {/* Expanded content */}
      {expanded && (
        <div className="overflow-hidden">
            <div className={cn('pt-0 space-y-2.5', isPage ? 'px-5 pb-5 space-y-4' : 'px-3 pb-3')}>
              {/* Full body */}
              <p className={cn('text-text-secondary leading-relaxed', isPage ? 'text-sm' : 'text-xs')}>
                {group.body}
              </p>

              {/* Member insights (drill-down) */}
              {group.memberInsights.length > 1 && (
                <div>
                  <h5 className={cn(
                    'font-medium text-text-tertiary uppercase tracking-[0.12em]',
                    isPage ? 'text-xs mb-2' : 'text-eyebrow mb-1.5'
                  )}>
                    Individual Details
                  </h5>
                  <div className={cn('space-y-1.5', isPage && 'space-y-2')}>
                    {group.memberInsights.slice(0, isPage ? 6 : 3).map((mi, i) => (
                      <div
                        key={i}
                        className={cn(
                          'flex items-start gap-2 bg-surface-sunken rounded-lg border border-border-subtle',
                          isPage ? 'text-sm p-3' : 'text-xs p-2'
                        )}
                      >
                        {mi.playerName && (
                          <span className={cn(
                            'flex-shrink-0 inline-flex items-center font-medium rounded-full border bg-surface text-text-secondary border-border-subtle',
                            isPage ? 'text-xs px-2 py-0.5' : 'text-eyebrow px-1.5 py-0.5'
                          )}>
                            {mi.playerName}
                          </span>
                        )}
                        <p className="text-text-secondary leading-relaxed min-w-0">
                          {mi.body || mi.headline}
                        </p>
                      </div>
                    ))}
                    {group.memberInsights.length > (isPage ? 6 : 3) && (
                      <p className={cn('text-text-tertiary', isPage ? 'text-xs' : 'text-eyebrow')}>
                        +{group.memberInsights.length - (isPage ? 6 : 3)} more insights
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Call to action */}
              {group.callToAction && (
                <div className={cn(
                  'bg-fw-success-bg rounded-lg border border-accent-200',
                  isPage ? 'p-4' : 'p-2.5'
                )}>
                  <div className={cn('flex items-center gap-2', isPage ? 'mb-2' : 'mb-1')}>
                    <IconTarget size={isPage ? 14 : 12} className="text-fw-success" />
                    <span className={cn(
                      'font-medium text-fw-success uppercase tracking-[0.12em]',
                      isPage ? 'text-xs' : 'text-eyebrow'
                    )}>
                      Coach Action Plan
                    </span>
                  </div>
                  <p className={cn('text-text-secondary leading-relaxed', isPage ? 'text-sm' : 'text-xs')}>
                    {group.callToAction}
                  </p>
                </div>
              )}

              {/* Action buttons */}
              {(onAcknowledgeGroup || onDismissGroup) && (
                <div className={cn('flex gap-2 pt-1', isPage && 'gap-2 pt-2')}>
                  {onAcknowledgeGroup && (
                    <Button variant="primary"
                      onClick={(e) => { e.stopPropagation(); onAcknowledgeGroup(group); }}
                      className={cn(
                        'flex items-center gap-1 font-medium text-fw-success bg-fw-success-bg hover:bg-accent-100 rounded-lg transition-colors',
                        isPage ? 'text-xs px-4 py-2' : 'text-xs px-2.5 py-1.5'
                      )}
                    >
                      <IconCheck size={isPage ? 14 : 12} /> Got It
                    </Button>
                  )}
                  {onDismissGroup && (
                    <Button variant="ghost"
                      onClick={(e) => { e.stopPropagation(); onDismissGroup(group); }}
                      className={cn(
                        'flex items-center gap-1 text-text-secondary hover:text-text-primary hover:bg-surface-sunken rounded-lg transition-colors',
                        isPage ? 'text-xs px-4 py-2' : 'text-xs px-2.5 py-1.5'
                      )}
                    >
                      <IconX size={isPage ? 14 : 12} /> Dismiss
                    </Button>
                  )}
                </div>
              )}
            </div>
        </div>
      )}
    </div>
  );
});

/**
 * Enhanced Pattern Card - Visual pattern with stroke impact bar
 */
const EnhancedPatternCard = memo(function EnhancedPatternCard({
  pattern,
  variant = 'widget',
}: {
  pattern: MinedPattern;
  variant?: ICCVariant;
}) {
  const isPage = variant === 'page';
  const [expanded, setExpanded] = useState(isPage);
  const isNegative = pattern.strokeImpact > 0;
  const impactAbs = Math.abs(pattern.strokeImpact);
  const impactWidth = Math.min(100, (impactAbs / 2) * 100); // Scale: 2 strokes = 100%
  const confidencePct = Math.round(pattern.confidence * 100);

  const getTypeIcon = () => {
    switch (pattern.patternType) {
      case 'conditional': return <IconStar size={12} className="text-fw-warning" />;
      case 'compound': return <IconSparkles size={12} className="text-fw-success" />;
      case 'anomaly': return <IconAlertCircle size={12} className="text-fw-warning" />;
      case 'temporal': return <IconTrendingUp size={12} className="text-text-secondary" />;
      default: return <IconStar size={12} className="text-text-tertiary" />;
    }
  };

  return (
    <div
      className={cn(
        'bg-surface border border-border-subtle overflow-hidden',
        isPage ? 'rounded-2xl' : 'rounded-xl',
        'shadow-soft hover:shadow-raise transition-shadow'
      )}
    >
      <Button variant="ghost"
        onClick={() => setExpanded(!expanded)}
        className={cn('w-full text-left', isPage ? 'p-5' : 'p-3')}
      >
        {/* Top row: type + trend */}
        <div className={cn('flex items-center gap-2', isPage ? 'mb-2' : 'mb-1.5')}>
          {getTypeIcon()}
          <span className={cn(
            'font-medium text-text-tertiary uppercase tracking-[0.12em]',
            isPage ? 'text-xs' : 'text-eyebrow'
          )}>
            {pattern.patternType}
          </span>
          {pattern.trend === 'strengthening' && (
            <IconTrendingUp size={10} className="text-fw-danger ml-auto" />
          )}
          {pattern.trend === 'weakening' && (
            <IconTrendingDown size={10} className="text-fw-success ml-auto" />
          )}
          <div className={cn('text-text-tertiary ml-auto', expanded && 'rotate-180')}>
            <IconChevronDown size={12} />
          </div>
        </div>

        {/* Description */}
        <p className={cn(
          'font-medium text-text-primary leading-snug mb-2 line-clamp-2',
          isPage ? 'text-sm' : 'text-caption'
        )}>
          {pattern.description || 'Pattern detected in performance data'}
        </p>

        {/* Stroke impact bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className={cn(
              'font-medium tabular-nums',
              isPage ? 'text-sm' : 'text-xs',
              isNegative ? 'text-fw-danger' : 'text-fw-success'
            )}>
              {isNegative ? '+' : '-'}{impactAbs.toFixed(1)} strokes/round
            </span>
            <span className={cn('text-text-tertiary', isPage ? 'text-xs' : 'text-xs')}>
              {confidencePct}%
            </span>
          </div>
          <div className={cn('bg-surface-sunken rounded-full overflow-hidden border border-border-subtle', isPage ? 'h-2' : 'h-1.5')}>
            <div
              className={cn(
                'h-full rounded-full',
                isNegative ? 'bg-fw-danger' : 'bg-accent-500'
              )}
              style={{ width: `${impactWidth}%` }}
            />
          </div>
        </div>
      </Button>

      {/* Expanded */}
      {expanded && (
        <div className="overflow-hidden">
            <div className="px-3 pb-3 space-y-2.5 border-t border-border-subtle pt-2.5">
              {/* Conditions */}
              {pattern.conditions.length > 0 && (
                <div>
                  <span className="text-eyebrow font-medium text-text-tertiary uppercase tracking-wider">
                    When
                  </span>
                  <div className="mt-1 space-y-1">
                    {pattern.conditions.map((c, i) => (
                      <div key={i} className="text-xs text-text-secondary bg-surface-sunken rounded-lg px-2.5 py-1.5">
                        {c.label || `${c.field} ${c.operator} ${c.value}`}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Stats grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <div className="text-center bg-surface-sunken rounded-lg py-2">
                  <div className="text-body-sm font-medium text-text-primary tabular-nums">
                    {Math.round(pattern.support * 100)}%
                  </div>
                  <div className="text-eyebrow text-text-tertiary">Frequency</div>
                </div>
                <div className="text-center bg-surface-sunken rounded-lg py-2">
                  <div className="text-body-sm font-medium text-text-primary tabular-nums">
                    {pattern.lift.toFixed(1)}x
                  </div>
                  <div className="text-eyebrow text-text-tertiary">Lift</div>
                </div>
                <div className="text-center bg-surface-sunken rounded-lg py-2">
                  <div className="text-body-sm font-medium text-text-primary tabular-nums">
                    {pattern.sampleSize}
                  </div>
                  <div className="text-eyebrow text-text-tertiary">Samples</div>
                </div>
              </div>

              {/* Recommendation */}
              {pattern.recommendation && (
                <div className="p-2.5 bg-fw-success-bg rounded-lg border border-accent-200">
                  <div className="flex items-center gap-2 mb-1">
                    <IconTarget size={10} className="text-fw-success" />
                    <span className="text-eyebrow font-medium text-fw-success uppercase">Recommendation</span>
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    {pattern.recommendation}
                  </p>
                </div>
              )}
            </div>
        </div>
      )}
    </div>
  );
});

/**
 * Enhanced Prediction Card - Visual confidence gauge + score distribution
 */
const EnhancedPredictionCard = memo(function EnhancedPredictionCard({
  prediction,
  playerName,
  variant = 'widget',
}: {
  prediction: PerformancePrediction & { playerName?: string };
  playerName?: string;
  variant?: ICCVariant;
}) {
  const isPage = variant === 'page';
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
    <div
      className={cn(
        'bg-surface border border-border-subtle shadow-soft hover:shadow-raise transition-shadow',
        isPage ? 'rounded-2xl p-5' : 'rounded-xl p-3'
      )}
    >
      {/* Header */}
      <div className={cn('flex items-center justify-between', isPage ? 'mb-4' : 'mb-2.5')}>
        <div className="flex items-center gap-2">
          <div className={cn(
            'rounded-md bg-surface-sunken flex items-center justify-center',
            isPage ? 'w-9 h-9 rounded-lg' : 'w-6 h-6'
          )}>
            <IconTarget size={isPage ? 16 : 12} className="text-text-secondary" />
          </div>
          <div>
            <span className={cn(
              'font-medium text-text-tertiary uppercase tracking-[0.12em] block',
              isPage ? 'text-xs' : 'text-eyebrow'
            )}>
              Next Round
            </span>
            {name && (
              <span className={cn('text-text-secondary font-medium', isPage ? 'text-sm' : 'text-xs')}>{name}</span>
            )}
          </div>
        </div>
        <span className={cn(
          'text-xs font-medium px-1.5 py-0.5 rounded-full',
          prediction.trend === 'improving' ? 'bg-fw-success-bg text-fw-success' :
          prediction.trend === 'declining' ? 'bg-fw-danger-bg text-fw-danger' :
          'bg-surface-sunken text-text-secondary'
        )}>
          {prediction.trend === 'improving' ? 'Improving' :
           prediction.trend === 'declining' ? 'Declining' : 'Steady'}
        </span>
      </div>

      {/* Score prediction + confidence gauge */}
      <div className={cn('flex items-center gap-3', isPage ? 'mb-4' : 'mb-3')}>
        <span className={cn(
          'font-medium tabular-nums',
          isPage ? 'text-4xl' : 'text-2xl',
          isNeutral ? 'text-text-secondary' : isPositive ? 'text-fw-success' : 'text-fw-danger'
        )}>
          {formatScore(prediction.predictedValue)}
        </span>

        {/* Mini confidence gauge */}
        <div className="flex-1">
          <div className={cn('flex justify-between text-text-tertiary mb-0.5', isPage ? 'text-xs' : 'text-eyebrow')}>
            <span>Confidence</span>
            <span className="font-medium">{confidencePct}%</span>
          </div>
          <div className={cn('bg-surface-sunken rounded-full overflow-hidden border border-border-subtle', isPage ? 'h-2' : 'h-1.5')}>
            <div
              className={cn(
                'h-full rounded-full',
                confidencePct >= 70 ? 'bg-accent-500' :
                confidencePct >= 50 ? 'bg-fw-warning' : 'bg-fw-danger'
              )}
              style={{ width: `${confidencePct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Range bar */}
      {hasRange && (
        <div className="flex items-center justify-between text-xs text-text-tertiary mb-2.5">
          <span className="tabular-nums">{formatScore(rangeLow)}</span>
          <div className="flex-1 mx-2 h-px bg-border-strong relative">
            <div className="absolute left-1/2 -translate-x-1/2 -top-0.5 w-1.5 h-1.5 rounded-full bg-accent-500" />
          </div>
          <span className="tabular-nums">{formatScore(rangeHigh)}</span>
        </div>
      )}

      {/* Factors */}
      {factors.length > 0 && (
        <div className="space-y-1">
          {factors.slice(0, 3).map((f: { name: string; contribution: number }, i: number) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-text-secondary">{f.name}</span>
              <span className={cn(
                'font-medium tabular-nums',
                f.contribution > 0 ? 'text-fw-danger' : 'text-fw-success'
              )}>
                {f.contribution > 0 ? '+' : ''}{f.contribution.toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Tail risks */}
      {isTailRiskProbs(prediction.tailRisks) && (
        <div className="flex gap-2 mt-2.5 pt-2.5 border-t border-border-subtle">
          <div className="flex-1 text-center bg-fw-danger-bg rounded-lg py-1.5">
            <div className="text-xs text-fw-danger">Blowup</div>
            <div className="text-eyebrow font-medium text-fw-danger tabular-nums">
              {Math.round(prediction.tailRisks.blowupProbability * 100)}%
            </div>
          </div>
          <div className="flex-1 text-center bg-fw-success-bg rounded-lg py-1.5">
            <div className="text-xs text-fw-success">Great Round</div>
            <div className="text-eyebrow font-medium text-fw-success tabular-nums">
              {Math.round(prediction.tailRisks.greatRoundProbability * 100)}%
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

/**
 * Empty state for tabs
 */
function TabEmptyState({ icon, title, description, variant = 'widget' }: { icon: React.ReactNode; title: string; description: string; variant?: ICCVariant }) {
  const isPage = variant === 'page';
  return (
    <div className={cn('flex flex-col items-center text-center', isPage ? 'py-16' : 'py-8')}>
      <div className={cn(
        'rounded-xl bg-surface shadow-soft flex items-center justify-center border border-border-subtle',
        isPage ? 'w-16 h-16 rounded-2xl mb-4' : 'w-10 h-10 mb-2.5'
      )}>
        {icon}
      </div>
      <h4 className={cn('font-medium text-text-primary', isPage ? 'text-lg mb-1' : 'text-body-sm mb-0.5')}>{title}</h4>
      <p className={cn('text-text-tertiary leading-relaxed', isPage ? 'text-sm max-w-xs' : 'text-xs max-w-[200px]')}>{description}</p>
    </div>
  );
}

// ============================================================================
// SURFACE HUB DISCLOSURE
// ============================================================================

/**
 * CoachHelm surface disclosure.
 *
 * The Intelligence Command Center is the front door to the CoachHelm AI
 * layer, but until now it only deep-linked to two of its surfaces (the
 * Intelligence dashboard and Coaching-Intelligence settings). The remaining
 * seven coach-facing CoachHelm surfaces — Alerts, Patterns, Insights,
 * Analytics, AI Chat, Player Genome, and the Qualifying workspace — had no
 * in-product entry point from the command center, so coaches had to know the
 * URLs to reach them.
 *
 * This list is the single source of truth for the 3-column (1 on mobile)
 * surface-card grid rendered on the Overview tab. Each surface is an
 * icon + eyebrow + title + one-line description + link. Adding/removing a
 * surface here is the only change needed; the grid and the regression guard
 * (scripts/__tests__/coachhelm-hub.test.mjs) both read from these hrefs.
 *
 * Audit reference:
 *   docs/operations/2026-05-28-ultra-audit-MASTER-synthesis.md — CoachHelm
 *   surface-discoverability gap (orphaned routes with no in-product link).
 */
const COACHHELM_SURFACES: {
  href: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: typeof IconTarget;
}[] = [
  {
    href: '/golf/dashboard/intelligence',
    eyebrow: 'Command',
    title: 'Intelligence',
    description: 'Team-wide signals, health, and the week at a glance.',
    icon: IconBrain,
  },
  {
    href: '/golf/dashboard/alerts',
    eyebrow: 'Triage',
    title: 'Alerts',
    description: 'Time-sensitive flags that need a coach decision now.',
    icon: IconBell,
  },
  {
    href: '/golf/dashboard/patterns',
    eyebrow: 'Discovery',
    title: 'Patterns',
    description: 'Recurring trends mined from player round data.',
    icon: IconLayers,
  },
  {
    href: '/golf/dashboard/insights',
    eyebrow: 'Analysis',
    title: 'Insights',
    description: 'Evidence-backed coaching insights with reasoning chains.',
    icon: IconSparkles,
  },
  {
    href: '/golf/dashboard/analytics/coachhelm',
    eyebrow: 'Measure',
    title: 'Analytics',
    description: 'Effectiveness of insights and AI coverage over time.',
    icon: IconChartBar,
  },
  {
    href: '/golf/dashboard/coachhelm/chat',
    eyebrow: 'Converse',
    title: 'AI Chat',
    description: 'Ask CoachHelm about any player, stat, or trend.',
    icon: IconMessageSquare,
  },
  {
    href: '/golf/dashboard/coachhelm/genome/compare-players',
    eyebrow: 'Profile',
    title: 'Player Genome',
    description: 'Compare performance fingerprints across your roster.',
    icon: IconChartRadar,
  },
  {
    href: '/golf/dashboard/qualifiers',
    eyebrow: 'Selection',
    title: 'Qualifying',
    description: 'CoachHelm-backed qualifier analysis and lineup calls.',
    icon: IconTrophy,
  },
  {
    href: '/golf/dashboard/settings/coaching-intelligence',
    eyebrow: 'Configure',
    title: 'Coaching Intelligence',
    description: 'Tune philosophy, tone, and which signals fire.',
    icon: IconSettings,
  },
];

/**
 * SurfaceHubGrid - 3-col (1 on mobile) disclosure of every CoachHelm surface.
 * Mirrors the matte surface-card treatment used across the command center
 * (cream-100 plinth, warm hairline border, soft shadow) so it reads as part
 * of the same editorial system rather than a bolt-on nav block.
 */
const SurfaceHubGrid = memo(function SurfaceHubGrid({ variant = 'widget' }: { variant?: ICCVariant }) {
  const isPage = variant === 'page';
  // The grid lives ON one of these surfaces (today: the Command/Intelligence
  // brief at /golf/dashboard/intelligence). The tile whose href IS the current
  // route must NOT render as a Link — a self-link looks broken ("Command
  // Intelligence button doesn't work"). Render it as a non-interactive
  // "You're here" card instead. Route-agnostic: works wherever the grid mounts.
  const pathname = usePathname();
  const isCurrent = (href: string) =>
    pathname === href || pathname === `${href}/`;

  return (
    <div>
      <h3 className={cn(
        'font-medium text-text-tertiary uppercase tracking-wider',
        isPage ? 'text-body-sm mb-4' : 'text-eyebrow mb-2.5'
      )}>
        Explore CoachHelm
      </h3>
      <div className={cn('grid grid-cols-1 md:grid-cols-3', isPage ? 'gap-4' : 'gap-2.5')}>
        {COACHHELM_SURFACES.map((surface) => {
          const SurfaceIcon = surface.icon;
          const current = isCurrent(surface.href);

          const cardInner = (
            <>
              <div className={cn('flex items-center justify-between', isPage ? 'mb-3' : 'mb-2')}>
                <div className={cn(
                  'rounded-lg bg-fw-success-bg flex items-center justify-center',
                  isPage ? 'w-10 h-10' : 'w-8 h-8'
                )}>
                  <SurfaceIcon size={isPage ? 18 : 15} className="text-fw-success" />
                </div>
                {current ? (
                  <span className="text-eyebrow font-medium text-fw-success uppercase tracking-wider">
                    You&apos;re here
                  </span>
                ) : (
                  <IconChevronRight
                    size={isPage ? 16 : 14}
                    className="text-text-tertiary transition-transform group-hover:translate-x-0.5"
                  />
                )}
              </div>
              <span className={cn(
                'block font-medium text-text-tertiary uppercase tracking-wider',
                isPage ? 'text-xs' : 'text-eyebrow'
              )}>
                {surface.eyebrow}
              </span>
              <h4 className={cn(
                'font-medium text-text-primary leading-snug',
                isPage ? 'text-base mt-0.5' : 'text-body-sm'
              )}>
                {surface.title}
              </h4>
              <p className={cn(
                'text-text-secondary leading-relaxed mt-0.5',
                isPage ? 'text-sm' : 'text-xs'
              )}>
                {surface.description}
              </p>
            </>
          );

          // Current surface → static, non-clickable card (no dead self-link).
          if (current) {
            return (
              <div
                key={surface.href}
                aria-current="page"
                className={cn(
                  'block bg-surface-sunken border border-border-subtle shadow-soft',
                  'rounded-fw-md cursor-default',
                  isPage ? 'rounded-2xl p-5' : 'p-3.5'
                )}
              >
                {cardInner}
              </div>
            );
          }

          return (
            <Link
              key={surface.href}
              href={surface.href}
              className={cn(
                'group block bg-surface border border-border-subtle shadow-soft hover:shadow-raise transition-shadow',
                'rounded-fw-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                isPage ? 'rounded-2xl p-5' : 'p-3.5'
              )}
            >
              {cardInner}
            </Link>
          );
        })}
      </div>
    </div>
  );
});

// ============================================================================
// HELPER: Deep-analysis loading skeleton
// ============================================================================

/**
 * Shape-matched loading state for the Deep Analysis run. Mirrors the
 * insights/patterns/predictions card regions so results don't pop in from a
 * blank "Ready to Analyze" block (and so re-analyze shows a shimmer rather than
 * a hard snap-replace). Skeleton-not-spinner, per the premium states bar.
 */
const DeepAnalysisSkeleton = memo(function DeepAnalysisSkeleton({
  isPage,
}: {
  isPage: boolean;
}) {
  const cardCount = isPage ? 4 : 2;
  return (
    <div
      className={cn(isPage ? 'space-y-6' : 'space-y-2.5')}
      aria-hidden="true"
    >
      <div className={cn(
        'grid grid-cols-1 gap-4',
        isPage ? 'lg:grid-cols-2' : ''
      )}>
        {Array.from({ length: cardCount }).map((_, i) => (
          <div
            key={i}
            className="surface-matte rounded-2xl p-5 space-y-3"
          >
            <div className="flex items-start gap-3">
              <Skeleton variant="circular" width={40} height={40} />
              <div className="flex-1 space-y-2">
                <Skeleton variant="text" width="65%" />
                <Skeleton variant="text" width="40%" />
              </div>
            </div>
            <Skeleton variant="rectangular" height={56} className="rounded-lg" />
            <div className="flex gap-2">
              <Skeleton variant="rectangular" width={72} height={24} className="rounded-full" />
              <Skeleton variant="rectangular" width={72} height={24} className="rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function IntelligenceCommandCenter({
  coachId,
  initialInsights = [],
  initialPatterns = [],
  initialPredictions = [],
  variant = 'widget',
}: IntelligenceCommandCenterProps) {
  const isPage = variant === 'page';
  // When this widget is mounted ON the intelligence dashboard itself (the
  // Fairway brief renders it at /golf/dashboard/intelligence), the
  // "View Full Intelligence Dashboard" link below would be a dead self-link —
  // hide it there. It stays useful when the widget is embedded elsewhere.
  const pathname = usePathname();
  const onIntelligencePage = pathname === '/golf/dashboard/intelligence';
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [insights, setInsights] = useState<ComposedInsight[]>(initialInsights);
  const [insightGroups, setInsightGroups] = useState<InsightGroup[]>([]);
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
        // Session-scoped on purpose: generateTeamInsight() re-resolves the
        // coach's ACTIVE team server-side (cookie-aware, honours the men's/
        // women's toggle). We deliberately do NOT pass the `teamId` prop here —
        // see the prop's doc comment for why (single source of truth = the
        // active-team cookie, shared with the surrounding brief).
        const result = await generateTeamInsight();
        if (result.success) {
          setInsights(result.insights || []);
          setInsightGroups(result.insightGroups || []);
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

  const handleGroupAction = useCallback(async (group: InsightGroup, action: 'acknowledge' | 'dismiss') => {
    setInsightGroups(prev => prev.filter(g => g.id !== group.id));
    // Also remove the individual member insights
    const memberHeadlines = new Set(group.memberInsights.map(m => m.headline));
    setInsights(prev => prev.filter(i => !memberHeadlines.has(i.headline)));
    // Persist the action for the primary insight
    try {
      const primaryInsight = group.memberInsights[0];
      if (primaryInsight) {
        const result = action === 'acknowledge'
          ? await acknowledgeComposedInsight(primaryInsight)
          : await dismissComposedInsight(primaryInsight);
        if (!result.success) {
          setInsightGroups(prev => [...prev, group]);
        }
      }
    } catch {
      setInsightGroups(prev => [...prev, group]);
    }
  }, []);

  const hasData = insights.length > 0 || insightGroups.length > 0 || patterns.length > 0 || predictions.length > 0;
  const displayGroups = insightGroups.length > 0;

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: 'overview', label: 'Overview', count: 0 },
    { id: 'insights', label: 'Insights', count: displayGroups ? insightGroups.length : insights.length },
    { id: 'patterns', label: 'Patterns', count: patterns.length },
    { id: 'predictions', label: 'Forecasts', count: predictions.length },
  ];

  return (
    <div className={cn(
      'overflow-hidden',
      isPage ? 'space-y-6 p-6 md:p-8 max-w-6xl mx-auto' : 'space-y-2.5 p-3 md:p-4'
    )}>
      {/* Deep Analysis Header */}
      <div className="surface-matte rounded-3xl p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-fw-success-bg flex items-center justify-center">
              <IconSparkles size={20} className="text-fw-success" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-text-primary">Deep Analysis</h3>
              <p className="text-xs text-text-secondary">
                {lastAnalyzed
                  ? `Last run ${lastAnalyzed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : 'Run full AI analysis on your team'
                }
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/golf/dashboard/settings/coaching-intelligence"
              className="p-2 rounded-lg text-text-tertiary hover:bg-surface-sunken hover:text-text-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              aria-label="CoachHelm Settings"
            >
              <IconSettings size={16} aria-hidden />
            </Link>
            <Button variant="primary"
              onClick={handleAnalyze}
              disabled={isPending}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all',
                isPending
                  ? 'bg-surface-sunken text-text-tertiary cursor-not-allowed'
                  : 'bg-accent-600 text-text-on-accent hover:bg-accent-700 shadow-soft active:scale-[0.98]'
              )}
            >
              {isPending ? (
                <>
                  <IconRefresh size={14} className="animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <IconSparkles size={14} />
                  {hasData ? 'Re-Analyze' : 'Analyze Team'}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Error — on-token Fairway InlineNotice with a plain-language message,
          a tone icon + status bar (non-color channel), and a Retry action that
          re-invokes the analysis (Nielsen #9). */}
      {error && (
        <InlineNotice
          tone="danger"
          title="Analysis didn't finish"
          action={
            <Button
              variant="secondary"
              onClick={handleAnalyze}
              disabled={isPending}
              className="flex items-center gap-1.5"
            >
              <IconRefresh size={14} className={cn(isPending && 'animate-spin')} />
              {isPending ? 'Retrying...' : 'Retry'}
            </Button>
          }
        >
          {error}
        </InlineNotice>
      )}

      {/* Tabs — on re-analyze, keep prior results visible but dimmed under
          aria-busy rather than snap-replacing them (no jarring swap). */}
      {hasData && (
        <div
          aria-busy={isPending}
          className={cn(
            'transition-opacity duration-200',
            isPending && 'pointer-events-none opacity-50'
          )}
        >
        <Tabs
          value={activeTab}
          onChange={(v) => setActiveTab(v as TabId)}
          className={cn(isPage ? 'space-y-6' : 'space-y-2.5')}
        >
          <TabsList aria-label="CoachHelm command center sections" className="grid w-full grid-cols-4">
            {tabs.map((t) => (
              <TabsTrigger key={t.id} value={t.id} badge={t.count > 0 ? t.count : undefined}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

      {/* Tab Content */}
      <TabsContent value="overview" className="mt-0">
        <div className={cn(isPage ? 'space-y-6' : 'space-y-2.5')}>
          <OverviewSummary insights={insights} patterns={patterns} variant={variant} />

          {isPage ? (
            /* Page: two-column layout for top items */
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="text-body-sm font-medium text-text-tertiary uppercase tracking-wider">Top Insights</h3>
                {displayGroups ? (
                  insightGroups.slice(0, 2).map((group) => (
                    <InsightGroupCard
                      key={group.id}
                      group={group}
                      onAcknowledgeGroup={(g) => handleGroupAction(g, 'acknowledge')}
                      onDismissGroup={(g) => handleGroupAction(g, 'dismiss')}
                      variant={variant}
                    />
                  ))
                ) : (
                  <>
                    {sortedInsights[0] && (() => {
                      const first = sortedInsights[0];
                      return (
                        <EnhancedInsightCard
                          insight={first}
                          onAction={(action) => handleInsightAction(first, action)}
                          variant={variant}
                        />
                      );
                    })()}
                    {sortedInsights[1] && (() => {
                      const second = sortedInsights[1];
                      return (
                        <EnhancedInsightCard
                          insight={second}
                          onAction={(action) => handleInsightAction(second, action)}
                          variant={variant}
                        />
                      );
                    })()}
                  </>
                )}
              </div>
              <div className="space-y-4">
                {sortedPatterns[0] && (
                  <>
                    <h3 className="text-body-sm font-medium text-text-tertiary uppercase tracking-wider">Top Pattern</h3>
                    <EnhancedPatternCard pattern={sortedPatterns[0]} variant={variant} />
                  </>
                )}
                {predictions[0] && (
                  <>
                    <h3 className="text-body-sm font-medium text-text-tertiary uppercase tracking-wider mt-4">Next Round Forecast</h3>
                    <EnhancedPredictionCard prediction={predictions[0]} variant={variant} />
                  </>
                )}
              </div>
            </div>
          ) : (
            /* Widget: compact single-column */
            <>
              {displayGroups ? (
                insightGroups[0] && (
                  <InsightGroupCard
                    group={insightGroups[0]}
                    onAcknowledgeGroup={(g) => handleGroupAction(g, 'acknowledge')}
                    onDismissGroup={(g) => handleGroupAction(g, 'dismiss')}
                  />
                )
              ) : (
                sortedInsights[0] && (() => {
                  const topInsight = sortedInsights[0];
                  return (
                    <EnhancedInsightCard
                      insight={topInsight}
                      onAction={(action) => handleInsightAction(topInsight, action)}
                    />
                  );
                })()
              )}
              {sortedPatterns[0] && (
                <EnhancedPatternCard pattern={sortedPatterns[0]} />
              )}
              {predictions[0] && (
                <EnhancedPredictionCard prediction={predictions[0]} />
              )}
              {!onIntelligencePage && (
                <Link
                  href="/golf/dashboard/intelligence"
                  className="flex items-center justify-center gap-2 py-2.5 text-xs font-medium text-fw-success hover:text-accent-700 transition-colors rounded-fw-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                >
                  View Full Intelligence Dashboard
                  <IconChevronRight size={14} />
                </Link>
              )}
            </>
          )}

          {/* Surface disclosure — in-product entry point to every CoachHelm
              surface, for embeds that lack the unified tab strip. On the
              Intelligence page itself (the unified CoachHelm shell), the top
              tabs + Brief already own all this navigation, so the hub here is
              pure scatter ("takes you all over the place") — hide it. */}
          {!onIntelligencePage && <SurfaceHubGrid variant={variant} />}
        </div>
      </TabsContent>

      <TabsContent value="insights" className="mt-0">
        <div className={cn(isPage ? 'space-y-4' : 'space-y-2')}>
          {displayGroups ? (
            <>
              {isPage && (
                <h3 className="text-lg font-medium text-text-primary">
                  Insights ({insightGroups.length} {insightGroups.length === 1 ? 'group' : 'groups'})
                </h3>
              )}
              {isPage ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {insightGroups.map((group) => (
                    <InsightGroupCard
                      key={group.id}
                      group={group}
                      onAcknowledgeGroup={(g) => handleGroupAction(g, 'acknowledge')}
                      onDismissGroup={(g) => handleGroupAction(g, 'dismiss')}
                      variant={variant}
                    />
                  ))}
                </div>
              ) : (
                insightGroups.map((group) => (
                  <InsightGroupCard
                    key={group.id}
                    group={group}
                    onAcknowledgeGroup={(g) => handleGroupAction(g, 'acknowledge')}
                    onDismissGroup={(g) => handleGroupAction(g, 'dismiss')}
                  />
                ))
              )}
            </>
          ) : sortedInsights.length > 0 ? (
            <>
              {isPage && (
                <h3 className="text-lg font-medium text-text-primary">All Insights ({sortedInsights.length})</h3>
              )}
              {isPage ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {sortedInsights.map((insight, i) => (
                    <EnhancedInsightCard
                      key={i}
                      insight={insight}
                      onAction={(action) => handleInsightAction(insight, action)}
                      variant={variant}
                    />
                  ))}
                </div>
              ) : (
                sortedInsights.map((insight, i) => (
                  <EnhancedInsightCard
                    key={i}
                    insight={insight}
                    onAction={(action) => handleInsightAction(insight, action)}
                  />
                ))
              )}
            </>
          ) : (
            <TabEmptyState
              icon={<IconSparkles size={isPage ? 28 : 20} className="text-text-tertiary" />}
              title="No insights yet"
              description="Click 'Analyze Team' to generate AI-powered coaching insights"
              variant={variant}
            />
          )}
        </div>
      </TabsContent>

      <TabsContent value="patterns" className="mt-0">
        <div className={cn(isPage ? 'space-y-4' : 'space-y-2')}>
          {isPage && (
            <h3 className="text-lg font-medium text-text-primary">All Patterns ({sortedPatterns.length})</h3>
          )}
          {sortedPatterns.length > 0 ? (
            isPage ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {sortedPatterns.map(pattern => (
                  <EnhancedPatternCard key={pattern.id} pattern={pattern} variant={variant} />
                ))}
              </div>
            ) : (
              sortedPatterns.map(pattern => (
                <EnhancedPatternCard key={pattern.id} pattern={pattern} />
              ))
            )
          ) : (
            <TabEmptyState
              icon={<IconStar size={isPage ? 28 : 20} className="text-text-tertiary" />}
              title="No patterns detected"
              description="Patterns emerge from analyzing recurring trends in player data"
              variant={variant}
            />
          )}
        </div>
      </TabsContent>

      <TabsContent value="predictions" className="mt-0">
        <div className={cn(isPage ? 'space-y-4' : 'space-y-2')}>
          {isPage && (
            <h3 className="text-lg font-medium text-text-primary">All Forecasts ({predictions.length})</h3>
          )}
          {predictions.length > 0 ? (
            isPage ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {predictions.map((pred, i) => (
                  <EnhancedPredictionCard key={i} prediction={pred} variant={variant} />
                ))}
              </div>
            ) : (
              predictions.map((pred, i) => (
                <EnhancedPredictionCard key={i} prediction={pred} />
              ))
            )
          ) : (
            <TabEmptyState
              icon={<IconTarget size={isPage ? 28 : 20} className="text-text-tertiary" />}
              title="No predictions yet"
              description="Predictions require sufficient round history to generate forecasts"
              variant={variant}
            />
          )}
        </div>
      </TabsContent>
        </Tabs>
        </div>
      )}

      {/* First-run loading — shape-matched skeleton instead of staring at the
          marketing block until results pop in (no spinner-on-blank). */}
      {!hasData && isPending && (
        <DeepAnalysisSkeleton isPage={isPage} />
      )}

      {/* No data state */}
      {!hasData && !isPending && (
        <div className={cn(
          'bg-surface border border-border-subtle shadow-soft',
          isPage ? 'rounded-2xl p-8 md:p-12' : 'rounded-xl p-4'
        )}>
          <div className="flex flex-col items-center text-center">
            <div className={cn(
              'rounded-xl bg-fw-success-bg flex items-center justify-center shadow-soft',
              isPage ? 'w-20 h-20 rounded-2xl mb-5' : 'w-12 h-12 mb-3'
            )}>
              <IconSparkles size={isPage ? 36 : 22} className="text-fw-success" />
            </div>
            <h4 className={cn(
              'font-medium text-text-primary',
              isPage ? 'text-xl mb-2' : 'text-body-sm mb-1'
            )}>
              Ready to Analyze
            </h4>
            <p className={cn(
              'text-text-secondary leading-relaxed',
              isPage ? 'text-base max-w-md mb-6' : 'text-xs max-w-[220px] mb-3'
            )}>
              CoachHelm AI will analyze every shot, cross-reference related stats, identify root causes of stroke leakage, and rank practice priorities by ROI.
            </p>
            <div className={cn('flex flex-wrap justify-center', isPage ? 'gap-2' : 'gap-2')}>
              {['Root Cause Chains', 'Stroke Leakage ROI', 'Break Analysis', 'Par-Type Profiling', 'Predictions'].map(feature => (
                <span key={feature} className={cn(
                  'font-medium text-fw-success bg-fw-success-bg rounded-full',
                  isPage ? 'text-xs px-3 py-1' : 'text-eyebrow px-2 py-0.5'
                )}>
                  {feature}
                </span>
              ))}
            </div>
          </div>

          {/* Surfaces stay reachable even before any analysis has run — the
              tabbed disclosure above is gated behind hasData. Hidden on the
              Intelligence page (the unified shell owns navigation via tabs). */}
          {!onIntelligencePage && (
            <div className={cn(isPage ? 'mt-8' : 'mt-4')}>
              <SurfaceHubGrid variant={variant} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
