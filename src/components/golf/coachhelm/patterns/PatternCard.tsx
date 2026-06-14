'use client';

import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { AnimatedNumber } from '@/components/ui/animated-number';
import {
  IconChevronDown,
  IconTrendingUp,
  IconTrendingDown,
  IconCheck,
  IconX,
  IconEye,
  IconStar,
  IconSparkles,
  IconAlertCircle,
  IconTarget,
  IconActivity,
} from '@/components/icons';
import { Avatar } from '@/components/ui/avatar';
import type { ExtendedPattern, PatternSeverity } from '@/app/golf/actions/pattern-management';
import { Button, IconButton } from '@/components/ui/button';

// ============================================================================
// TYPES
// ============================================================================

interface PatternCardProps {
  pattern: ExtendedPattern;
  showPlayer?: boolean;
  onValidate?: (pattern: ExtendedPattern) => void;
  onDismiss?: (pattern: ExtendedPattern) => void;
  onViewEvidence?: (pattern: ExtendedPattern) => void;
  onMarkAddressed?: (pattern: ExtendedPattern) => void;
  onResolve?: (pattern: ExtendedPattern) => void;
}

// ============================================================================
// SEVERITY CONFIG
// ============================================================================

const severityConfig: Record<PatternSeverity, {
  bg: string;
  border: string;
  text: string;
  badge: string;
  bar: string;
  label: string;
}> = {
  // Severity ramp routed through the canonical semantic tokens so the same
  // severity reads as ONE hue across PatternCard / status-dot / review icons:
  //   low → neutral (warm), medium & high → warning (amber), critical →
  //   destructive (red). The tokens are flat single colors, so tints use the
  //   alpha-utility convention (`bg-warning/10`) already used app-wide.
  low: {
    bg: 'bg-warm-50',
    border: 'border-warm-200',
    text: 'text-warm-600',
    badge: 'bg-warm-100 text-warm-700',
    bar: 'bg-warm-400',
    label: 'Low',
  },
  medium: {
    bg: 'bg-warning/10',
    border: 'border-warning/30',
    text: 'text-warning',
    badge: 'bg-warning/15 text-warning',
    bar: 'bg-warning',
    label: 'Medium',
  },
  high: {
    bg: 'bg-warning/15',
    border: 'border-warning/40',
    text: 'text-warning',
    badge: 'bg-warning/20 text-warning',
    bar: 'bg-warning',
    label: 'High',
  },
  critical: {
    bg: 'bg-destructive/10',
    border: 'border-destructive/30',
    text: 'text-destructive',
    badge: 'bg-destructive/15 text-destructive',
    bar: 'bg-destructive',
    label: 'Critical',
  },
};

// ============================================================================
// PATTERN CARD COMPONENT
// ============================================================================

export function PatternCard({
  pattern,
  showPlayer = false,
  onValidate,
  onDismiss,
  onViewEvidence,
  onMarkAddressed,
  onResolve,
}: PatternCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);

  const severity = severityConfig[pattern.severity];
  const isNegative = pattern.strokeImpact > 0;
  const impactColor = isNegative ? 'text-destructive' : 'text-primary-600';
  const impactBgColor = isNegative ? 'bg-destructive' : 'bg-primary-500';

  // Pattern type icon
  const getPatternIcon = () => {
    switch (pattern.patternType) {
      case 'conditional':
        return <IconStar size={16} className="text-amber-500" />;
      case 'compound':
        return <IconSparkles size={16} className="text-purple-500" />;
      case 'anomaly':
        return <IconAlertCircle size={16} className="text-orange-500" />;
      case 'sequence':
        return <IconActivity size={16} className="text-blue-500" />;
      case 'temporal':
        return <IconTarget size={16} className="text-cyan-500" />;
      default:
        return <IconStar size={16} className="text-warm-500" />;
    }
  };

  // Trend icon
  const getTrendIcon = () => {
    if (pattern.trend === 'strengthening') {
      return (
        <span className="flex items-center gap-1 text-xs text-destructive">
          <IconTrendingUp size={12} />
          Strengthening
        </span>
      );
    }
    if (pattern.trend === 'weakening') {
      return (
        <span className="flex items-center gap-1 text-xs text-primary-600">
          <IconTrendingDown size={12} />
          Weakening
        </span>
      );
    }
    if (pattern.trend === 'new') {
      return (
        <span className="text-xs text-blue-500 font-medium">New</span>
      );
    }
    return null;
  };

  // Lifecycle badge
  const getLifecycleBadge = () => {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      detected: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Detected' },
      confirmed: { bg: 'bg-primary-100', text: 'text-primary-700', label: 'Confirmed' },
      addressed: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'In Progress' },
      resolved: { bg: 'bg-warm-100', text: 'text-warm-600', label: 'Resolved' },
      dismissed: { bg: 'bg-warm-100', text: 'text-warm-400', label: 'Dismissed' },
    };

    const config = badges[pattern.lifecycleState] ?? badges.detected;
    const bgClass = config?.bg ?? 'bg-blue-100';
    const textClass = config?.text ?? 'text-blue-700';
    const label = config?.label ?? 'Detected';

    return (
      <span className={cn(
        'px-2 py-0.5 rounded-full text-xs font-medium',
        bgClass,
        textClass
      )}>
        {label}
      </span>
    );
  };

  const confidencePercent = Math.round(pattern.confidence * 100);
  const strokeImpactAbs = Math.abs(pattern.strokeImpact);

  // Max bar width for stroke impact visualization
  const maxImpact = 3;
  const impactWidth = Math.min((strokeImpactAbs / maxImpact) * 100, 100);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <Card variant="overlay"
        className={cn(
          'overflow-hidden transition-all',
          pattern.lifecycleState === 'dismissed' && 'opacity-60'
        )}
        padding="none"
        hover={false}
      >
        {/* Severity indicator bar */}
        <div className={cn('h-1', severity.bar)} />

        {/* Main content */}
        <div className="p-4">
          {/* Header row */}
          <div className="flex items-start gap-3">
            {/* Player avatar (if showing) */}
            {showPlayer && (
              <Avatar
                src={pattern.playerAvatarUrl}
                name={pattern.playerName || 'Player'}
                size="sm"
              />
            )}

            {/* Pattern icon */}
            <div className={cn(
              'p-2 rounded-lg flex-shrink-0',
              severity.bg
            )}>
              {getPatternIcon()}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-xs font-medium text-warm-400 uppercase tracking-wide">
                  {pattern.patternType}
                </span>
                {getLifecycleBadge()}
                <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', severity.badge)}>
                  {severity.label}
                </span>
                {getTrendIcon()}
              </div>

              {/* Player name (if showing) */}
              {showPlayer && pattern.playerName && (
                <p className="text-sm font-medium text-warm-800 mb-0.5">
                  {pattern.playerName}
                </p>
              )}

              {/* Description */}
              <p className="text-sm text-warm-700 line-clamp-2">
                {pattern.description || 'Performance pattern detected'}
              </p>

              {/* Stroke impact bar */}
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-warm-500">Stroke Impact</span>
                    <span className={cn('text-sm font-medium', impactColor)}>
                      <AnimatedNumber
                        value={strokeImpactAbs}
                        decimals={1}
                        prefix={isNegative ? '+' : '-'}
                      />
                    </span>
                  </div>
                  <div className="h-2 bg-warm-100 rounded-full overflow-hidden relative">
                    {/* Center line */}
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-warm-300" />
                    {/* Impact bar */}
                    <motion.div
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.5, delay: 0.2 })}
                      className={cn(
                        'h-full rounded-full absolute top-0',
                        impactBgColor,
                        isNegative ? 'right-1/2' : 'left-1/2'
                      )}
                      style={{
                        width: `${impactWidth / 2}%`,
                        [isNegative ? 'right' : 'left']: '50%',
                        transformOrigin: isNegative ? 'right' : 'left',
                      }}
                    />
                  </div>
                </div>

                {/* Confidence meter */}
                <div className="flex-shrink-0 w-16 text-center">
                  <div className="relative w-12 h-12 mx-auto">
                    <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
                      <circle
                        cx="18"
                        cy="18"
                        r="14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        className="text-warm-100"
                      />
                      <motion.circle
                        cx="18"
                        cy="18"
                        r="14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeDasharray={`${confidencePercent * 0.88} 88`}
                        strokeLinecap="round"
                        className="text-primary-500"
                        initial={{ strokeDasharray: '0 88' }}
                        animate={{ strokeDasharray: `${confidencePercent * 0.88} 88` }}
                        transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.5, delay: 0.3 })}
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-warm-700">
                      {confidencePercent}%
                    </span>
                  </div>
                  <span className="text-xs text-warm-500 mt-0.5 block">Confidence</span>
                </div>
              </div>
            </div>

            {/* Expand button */}
            <IconButton variant="default"
              onClick={() => setExpanded(!expanded)}
              aria-label={expanded ? 'Collapse pattern details' : 'Expand pattern details'}
              className="p-2 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-warm-100 active:bg-warm-200 transition-colors"
            >
              <motion.div
                animate={{ rotate: expanded ? 180 : 0 }}
                transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.2 })}
              >
                <IconChevronDown size={20} />
              </motion.div>
            </IconButton>
          </div>

          {/* Expanded section */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={prefersReducedMotion ? { duration: 0 } : ({ height: { type: 'spring', stiffness: 500, damping: 30 }, opacity: { duration: 0.2 } })}
                className="overflow-hidden"
              >
                <div className="pt-4 mt-4 border-t border-warm-100">
                  {/* Conditions - IF */}
                  <div className="mb-4">
                    <h4 className="text-xs font-medium text-warm-500 uppercase tracking-wide mb-2">
                      IF
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {pattern.conditions.map((condition, i) => (
                        <span
                          key={i}
                          className={cn(
                            'px-3 py-1.5 rounded-lg text-sm font-medium',
                            severity.bg,
                            severity.text
                          )}
                        >
                          {condition.label || `${condition.field} ${condition.operator} ${condition.value}`}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Outcome - THEN */}
                  <div className="mb-4">
                    <h4 className="text-xs font-medium text-warm-500 uppercase tracking-wide mb-2">
                      THEN
                    </h4>
                    <span className={cn(
                      'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium',
                      isNegative ? 'bg-destructive/10 text-destructive' : 'bg-primary-100 text-primary-700'
                    )}>
                      {isNegative ? (
                        <IconTrendingDown size={14} />
                      ) : (
                        <IconTrendingUp size={14} />
                      )}
                      {pattern.outcome.metric} {pattern.outcome.direction}s by {pattern.outcome.magnitude?.toFixed(1) || strokeImpactAbs.toFixed(1)} strokes
                    </span>
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div className="text-center p-2 bg-warm-50 rounded-lg">
                      <div className="text-lg font-medium text-warm-800">
                        {Math.round(pattern.support * 100)}%
                      </div>
                      <div className="text-xs text-warm-500">Frequency</div>
                    </div>
                    <div className="text-center p-2 bg-warm-50 rounded-lg">
                      <div className="text-lg font-medium text-warm-800">
                        <AnimatedNumber value={pattern.lift} decimals={1} suffix="x" />
                      </div>
                      <div className="text-xs text-warm-500">Lift</div>
                    </div>
                    <div className="text-center p-2 bg-warm-50 rounded-lg">
                      <div className="text-lg font-medium text-warm-800">
                        {pattern.sampleSize}
                      </div>
                      <div className="text-xs text-warm-500">Samples</div>
                    </div>
                    <div className="text-center p-2 bg-warm-50 rounded-lg">
                      <div className="text-lg font-medium text-warm-800">
                        {pattern.occurrenceCount}
                      </div>
                      <div className="text-xs text-warm-500">Occurrences</div>
                    </div>
                  </div>

                  {/* Recommendation */}
                  {pattern.recommendation && (
                    <div className="p-3 bg-primary-50 rounded-lg border border-primary-100 mb-4">
                      <h4 className="text-xs font-medium text-primary-700 uppercase tracking-wide mb-1">
                        Recommendation
                      </h4>
                      <p className="text-sm text-primary-800">
                        {pattern.recommendation}
                      </p>
                    </div>
                  )}

                  {/* Coach notes */}
                  {pattern.coachNotes && (
                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 mb-4">
                      <h4 className="text-xs font-medium text-blue-700 uppercase tracking-wide mb-1">
                        Coach Notes
                      </h4>
                      <p className="text-sm text-blue-800">
                        {pattern.coachNotes}
                      </p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2">
                    {/* Show different actions based on lifecycle state */}
                    {pattern.lifecycleState === 'detected' && (
                      <>
                        {onValidate && (
                          <Button variant="primary"
                            onClick={() => onValidate(pattern)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-primary-600 hover:bg-primary-50 active:bg-primary-100 transition-colors"
                          >
                            <IconCheck size={14} />
                            Validate
                          </Button>
                        )}
                        {onDismiss && (
                          <Button variant="ghost"
                            onClick={() => onDismiss(pattern)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-warm-500 hover:bg-warm-100 active:bg-warm-200 transition-colors"
                          >
                            <IconX size={14} />
                            Dismiss
                          </Button>
                        )}
                      </>
                    )}

                    {pattern.lifecycleState === 'confirmed' && onMarkAddressed && (
                      <Button variant="ghost"
                        onClick={() => onMarkAddressed(pattern)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-amber-600 hover:bg-amber-50 transition-colors"
                      >
                        <IconTarget size={14} />
                        Mark as Working On
                      </Button>
                    )}

                    {pattern.lifecycleState === 'addressed' && onResolve && (
                      <Button variant="primary"
                        onClick={() => onResolve(pattern)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-primary-600 hover:bg-primary-50 active:bg-primary-100 transition-colors"
                      >
                        <IconCheck size={14} />
                        Mark Resolved
                      </Button>
                    )}

                    {onViewEvidence && (
                      <Button variant="ghost"
                        onClick={() => onViewEvidence(pattern)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-warm-500 hover:bg-warm-100 active:bg-warm-200 transition-colors ml-auto"
                      >
                        <IconEye size={14} />
                        View Evidence
                      </Button>
                    )}
                  </div>

                  {/* Timestamps */}
                  <div className="mt-4 pt-4 border-t border-warm-100 flex flex-wrap gap-4 text-xs text-warm-400">
                    <span>First detected: {new Date(pattern.firstDetected).toLocaleDateString()}</span>
                    <span>Last occurrence: {new Date(pattern.lastOccurrence).toLocaleDateString()}</span>
                    {pattern.validatedAt && (
                      <span>Validated: {new Date(pattern.validatedAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>
    </motion.div>
  );
}
