'use client';

/**
 * RoundReviewDisplay - Complete AI-generated round analysis display
 *
 * Features:
 * - Summary section with sentiment indicator
 * - Expandable sections with Framer Motion
 * - Highlights, Areas for Improvement, Key Stats, Recommendations
 * - Share/Export functionality
 * - Mobile-friendly design
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { Button } from '@/components/ui/button';
import {
  IconSparkles,
  IconChevronDown,
  IconChevronUp,
  IconTrendingUp,
  IconTrendingDown,
  IconTarget,
  IconCheck,
  IconStar,
} from '@/components/icons';
import type {
  RoundReviewContent,
  ReviewSentiment,
  OverallGrade,
  StatComparison,
} from '@/app/golf/actions/round-review-system';

// ============================================================================
// TYPES
// ============================================================================

interface RoundReviewDisplayProps {
  review: RoundReviewContent;
  courseName?: string;
  roundDate?: string;
  score?: number;
  scoreToPar?: number;
  onShare?: () => void;
  onExport?: () => void;
  isShared?: boolean;
  className?: string;
}

interface ExpandableSectionProps {
  title: string;
  icon: React.ReactNode;
  defaultExpanded?: boolean;
  children: React.ReactNode;
  badge?: React.ReactNode;
}

// ============================================================================
// SENTIMENT & GRADE HELPERS
// ============================================================================

const sentimentConfig: Record<
  ReviewSentiment,
  { bg: string; text: string; icon: string; label: string }
> = {
  positive: {
    bg: 'bg-primary-100',
    text: 'text-primary-700',
    icon: 'text-primary-600',
    label: 'Great Round',
  },
  neutral: {
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    icon: 'text-blue-600',
    label: 'Solid Round',
  },
  challenging: {
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    icon: 'text-amber-600',
    label: 'Room to Grow',
  },
};

const gradeConfig: Record<
  OverallGrade,
  { bg: string; text: string; border: string }
> = {
  A: { bg: 'bg-primary-500', text: 'text-white', border: 'border-primary-600' },
  B: { bg: 'bg-blue-500', text: 'text-white', border: 'border-blue-600' },
  C: { bg: 'bg-amber-500', text: 'text-white', border: 'border-amber-600' },
  D: { bg: 'bg-orange-500', text: 'text-white', border: 'border-orange-600' },
  F: { bg: 'bg-red-500', text: 'text-white', border: 'border-red-600' },
};

const comparisonConfig: Record<
  StatComparison,
  { icon: React.ReactNode; color: string; label: string }
> = {
  above: {
    icon: <IconTrendingUp size={14} />,
    color: 'text-primary-600',
    label: 'Above avg',
  },
  below: {
    icon: <IconTrendingDown size={14} />,
    color: 'text-amber-600',
    label: 'Below avg',
  },
  average: {
    icon: <IconTarget size={14} />,
    color: 'text-warm-500',
    label: 'On pace',
  },
};

// ============================================================================
// EXPANDABLE SECTION COMPONENT
// ============================================================================

function ExpandableSection({
  title,
  icon,
  defaultExpanded = true,
  children,
  badge,
}: ExpandableSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="border border-white/20 rounded-xl overflow-clip bg-cream-100/60 backdrop-blur-sm">
      <Button variant="ghost"
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'w-full flex items-center justify-between px-4 py-3',
          'hover:bg-cream-100/68 transition-colors',
          'text-left'
        )}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center text-primary-600">
            {icon}
          </div>
          <span className="font-medium text-warm-900">{title}</span>
          {badge}
        </div>
        <div className="text-warm-400">
          {isExpanded ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
        </div>
      </Button>
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ height: { type: 'spring', stiffness: 500, damping: 30 }, opacity: { duration: 0.2 } }}
          >
            <div className="px-4 pb-4 pt-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function RoundReviewDisplay({
  review,
  courseName,
  roundDate,
  score,
  scoreToPar,
  onShare,
  onExport,
  isShared = false,
  className,
}: RoundReviewDisplayProps) {
  const sentimentStyle = sentimentConfig[review.sentiment];
  const gradeStyle = gradeConfig[review.overallGrade];

  // Format score to par for display
  const formatScoreToPar = (stp: number | undefined) => {
    if (stp === undefined || stp === null) return '';
    if (stp === 0) return 'E';
    return stp > 0 ? `+${stp}` : `${stp}`;
  };

  // Format date — manual parsing to avoid timezone shift (new Date("2026-03-15") = midnight UTC = Mar 14 in US)
  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '';
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const parts = dateStr.split('T')[0]?.split('-');
    if (parts && parts.length === 3) {
      const y = parseInt(parts[0]!, 10);
      const m = parseInt(parts[1]!, 10) - 1;
      const d = parseInt(parts[2]!, 10);
      const date = new Date(y, m, d); // Local timezone construction
      return `${days[date.getDay()]}, ${months[m]} ${d}, ${y}`;
    }
    return dateStr;
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header with Summary */}
      <Card variant="overlay" padding="md" className="overflow-hidden" glow="subtle">
        {/* Top bar with grade and sentiment */}
        <div className="flex items-center justify-between mb-4">
          {/* Grade Badge */}
          <div
            className={cn(
              'w-14 h-14 rounded-xl flex items-center justify-center',
              'font-medium text-2xl shadow-lg',
              gradeStyle.bg,
              gradeStyle.text
            )}
          >
            {review.overallGrade}
          </div>

          {/* Sentiment Badge */}
          <div
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium',
              sentimentStyle.bg,
              sentimentStyle.text
            )}
          >
            <IconSparkles size={14} className={sentimentStyle.icon} />
            {sentimentStyle.label}
          </div>
        </div>

        {/* Round Info */}
        {(courseName || roundDate || score !== undefined) && (
          <div className="flex items-center gap-4 mb-4 pb-4 border-b border-white/20">
            {score !== undefined && (
              <div className="text-center">
                <div className="text-h1 md:text-display font-light text-warm-900 tracking-[-0.025em]">{score}</div>
                {scoreToPar !== undefined && (
                  <div
                    className={cn(
                      'text-sm font-medium',
                      scoreToPar < 0
                        ? 'text-primary-600'
                        : scoreToPar > 0
                          ? 'text-amber-600'
                          : 'text-warm-500'
                    )}
                  >
                    {formatScoreToPar(scoreToPar)}
                  </div>
                )}
              </div>
            )}
            <div className="flex-1">
              {courseName && (
                <div className="font-medium text-warm-900 text-lg">{courseName}</div>
              )}
              {roundDate && (
                <div className="text-sm text-warm-500">{formatDate(roundDate)}</div>
              )}
            </div>
          </div>
        )}

        {/* Summary Text */}
        <div className="prose prose-sm prose-slate max-w-none">
          <p className="text-warm-700 leading-relaxed m-0">{review.summary}</p>
        </div>

        {/* AI Badge */}
        <div className="mt-4 pt-4 border-t border-white/20 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-warm-500">
            <IconSparkles size={12} className="text-purple-500" />
            AI-Powered Analysis
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {onShare && !isShared && (
              <Button variant="ghost"
                onClick={onShare}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium',
                  'bg-cream-100/68 hover:bg-cream-100/82 active:bg-cream-50/92 text-warm-700',
                  'transition-colors border border-warm-200/45'
                )}
              >
                Share with Coach
              </Button>
            )}
            {isShared && (
              <span className="flex items-center gap-2 text-xs text-primary-600 font-medium">
                <IconCheck size={14} />
                Shared with Coach
              </span>
            )}
            {onExport && (
              <Button variant="ghost"
                onClick={onExport}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium',
                  'bg-cream-100/68 hover:bg-cream-100/82 active:bg-cream-50/92 text-warm-700',
                  'transition-colors border border-warm-200/45'
                )}
              >
                Export
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Highlights Section — defensively filters out items that look like
          weaknesses smuggled in by older stored reviews. The action-layer
          fix gates on `tone`, but reviews stored before that fix can still
          contain "Severe Misses" / "regression" headlines that were merged
          into highlights pre-fix. */}
      {(() => {
        const filteredHighlights = review.highlights.filter((h) => {
          const text = `${h.title ?? ''} ${h.description ?? ''}`.toLowerCase();
          // Skip rows whose copy clearly describes a weakness — these
          // belong in Areas for Improvement, not Highlights.
          const weaknessTokens = ['severe miss', 'too many', 'weakness', 'regress', 'declin', 'poor ', 'worst'];
          return !weaknessTokens.some((tok) => text.includes(tok));
        });
        if (filteredHighlights.length === 0) return null;
        return (
          <ExpandableSection
            title="Highlights"
            icon={<IconStar size={16} />}
            badge={
              <span className="px-2 py-0.5 bg-primary-100 text-primary-700 text-xs rounded-full font-medium">
                {filteredHighlights.length}
              </span>
            }
          >
            <div className="space-y-3">
              {filteredHighlights.map((highlight, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex gap-3 p-3 rounded-lg bg-primary-50/50 border border-primary-100"
                >
                  <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                    <IconCheck size={14} className="text-primary-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-warm-900 text-sm">
                        {highlight.title}
                      </div>
                      <span
                        className={
                          highlight.source === 'trend'
                            ? 'inline-flex items-center text-eyebrow font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-warm-100 text-warm-600 border border-warm-200 flex-shrink-0'
                            : 'inline-flex items-center text-eyebrow font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary-100 text-primary-700 border border-primary-200 flex-shrink-0'
                        }
                      >
                        {highlight.source === 'trend' ? '90-day trend' : 'This round'}
                      </span>
                    </div>
                    <p className="text-sm text-warm-600 mt-0.5">
                      {highlight.description}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </ExpandableSection>
        );
      })()}

      {/* Areas for Improvement Section */}
      {review.areasForImprovement.length > 0 && (
        <ExpandableSection
          title="Areas for Improvement"
          icon={<IconTarget size={16} />}
          badge={
            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">
              {review.areasForImprovement.length}
            </span>
          }
        >
          <div className="space-y-3">
            {review.areasForImprovement.map((area, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="p-3 rounded-lg bg-amber-50/50 border border-amber-100"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-warm-900 text-sm">{area.area}</div>
                  <span
                    className={
                      area.source === 'trend'
                        ? 'inline-flex items-center text-eyebrow font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-warm-100 text-warm-600 border border-warm-200 flex-shrink-0'
                        : 'inline-flex items-center text-eyebrow font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary-100 text-primary-700 border border-primary-200 flex-shrink-0'
                    }
                  >
                    {area.source === 'trend' ? '90-day trend' : 'This round'}
                  </span>
                </div>
                <p className="text-sm text-warm-600 mt-1">{area.recommendation}</p>
              </motion.div>
            ))}
          </div>
        </ExpandableSection>
      )}

      {/* Key Stats Section */}
      {review.keyStats.length > 0 && (
        <ExpandableSection
          title="Key Stats"
          icon={<IconTrendingUp size={16} />}
          defaultExpanded={true}
        >
          <div className="grid grid-cols-2 gap-3">
            {review.keyStats.map((stat, index) => {
              const comparison = comparisonConfig[stat.comparison];
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.08 }}
                  className={cn(
                    'p-3 rounded-lg border',
                    'bg-cream-100/68 border-warm-200/45'
                  )}
                >
                  <div className="text-xs text-warm-500 font-medium mb-1">
                    {stat.label}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-h3 font-medium text-warm-900 tracking-[-0.012em]">
                      {stat.value}
                    </span>
                    <div className={cn('flex items-center gap-1', comparison.color)}>
                      {comparison.icon}
                      <span className="text-xs font-medium">{comparison.label}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </ExpandableSection>
      )}

      {/* Recommendations Section */}
      {review.recommendations.length > 0 && (
        <ExpandableSection
          title="Recommendations"
          icon={<IconSparkles size={16} />}
        >
          <div className="space-y-2">
            {review.recommendations.map((rec, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-start gap-3 py-2"
              >
                <div className="w-5 h-5 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-medium text-primary-600">
                    {index + 1}
                  </span>
                </div>
                <p className="text-sm text-warm-700 flex-1">{rec}</p>
              </motion.div>
            ))}
          </div>
        </ExpandableSection>
      )}

      {/* ================================================================ */}
      {/* Section 2.1: Visual Scorecard */}
      {/* ================================================================ */}
      {review.holeByHole && review.holeByHole.length > 0 && (
        <ExpandableSection
          title="Scorecard"
          icon={<IconTarget size={16} />}
          defaultExpanded={true}
          badge={
            <span className="px-2 py-0.5 bg-warm-100 text-warm-600 text-xs rounded-full font-medium">
              {review.holeByHole.length} holes
            </span>
          }
        >
          <div className="space-y-3">
            {/* Front 9 */}
            <div>
              <div className="text-xs font-medium text-warm-500 mb-1.5 uppercase tracking-wider">Front 9</div>
              <div className="grid grid-cols-10 gap-1">
                {review.holeByHole.filter(h => h.hole <= 9).map((h) => {
                  const bg =
                    h.scoreToPar <= -2 ? 'bg-amber-400/80 text-amber-900' :
                    h.scoreToPar === -1 ? 'bg-primary-500/80 text-white' :
                    h.scoreToPar === 0 ? 'bg-warm-100 text-warm-700' :
                    h.scoreToPar === 1 ? 'bg-orange-400/80 text-white' :
                    'bg-red-500/80 text-white';
                  return (
                    <div key={h.hole} className={cn('rounded-lg text-center py-1.5 px-0.5', bg)}>
                      <div className="text-micro opacity-70">H{h.hole}</div>
                      <div className="text-body-sm font-medium">{h.score}</div>
                      <div className="flex justify-center gap-0.5 mt-0.5 min-h-[12px]">
                        {h.threePutt && <span className="text-eyebrow">3P</span>}
                        {h.onePutt && <span className="text-eyebrow">1P</span>}
                        {h.penalties > 0 && <span className="text-eyebrow">P</span>}
                      </div>
                    </div>
                  );
                })}
                {/* Front 9 total */}
                <div className="rounded-lg text-center py-1.5 px-0.5 bg-warm-200/60 text-warm-800 border border-warm-300/50">
                  <div className="text-micro opacity-70">OUT</div>
                  <div className="text-body-sm font-medium">
                    {review.holeByHole.filter(h => h.hole <= 9).reduce((s, h) => s + h.score, 0)}
                  </div>
                  <div className="min-h-[12px]" />
                </div>
              </div>
            </div>
            {/* Back 9 */}
            {review.holeByHole.filter(h => h.hole >= 10).length > 0 && (
              <div>
                <div className="text-xs font-medium text-warm-500 mb-1.5 uppercase tracking-wider">Back 9</div>
                <div className="grid grid-cols-10 gap-1">
                  {review.holeByHole.filter(h => h.hole >= 10).map((h) => {
                    const bg =
                      h.scoreToPar <= -2 ? 'bg-amber-400/80 text-amber-900' :
                      h.scoreToPar === -1 ? 'bg-primary-500/80 text-white' :
                      h.scoreToPar === 0 ? 'bg-warm-100 text-warm-700' :
                      h.scoreToPar === 1 ? 'bg-orange-400/80 text-white' :
                      'bg-red-500/80 text-white';
                    return (
                      <div key={h.hole} className={cn('rounded-lg text-center py-1.5 px-0.5', bg)}>
                        <div className="text-micro opacity-70">H{h.hole}</div>
                        <div className="text-body-sm font-medium">{h.score}</div>
                        <div className="flex justify-center gap-0.5 mt-0.5 min-h-[12px]">
                          {h.threePutt && <span className="text-eyebrow">3P</span>}
                          {h.onePutt && <span className="text-eyebrow">1P</span>}
                          {h.penalties > 0 && <span className="text-eyebrow">P</span>}
                        </div>
                      </div>
                    );
                  })}
                  {/* Back 9 total */}
                  <div className="rounded-lg text-center py-1.5 px-0.5 bg-warm-200/60 text-warm-800 border border-warm-300/50">
                    <div className="text-micro opacity-70">IN</div>
                    <div className="text-body-sm font-medium">
                      {review.holeByHole.filter(h => h.hole >= 10).reduce((s, h) => s + h.score, 0)}
                    </div>
                    <div className="min-h-[12px]" />
                  </div>
                </div>
              </div>
            )}
            {/* Legend */}
            <div className="flex flex-wrap gap-3 pt-1 text-micro text-warm-500">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-400/80" /> Eagle+</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-primary-500/80" /> Birdie</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-warm-100" /> Par</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-400/80" /> Bogey</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500/80" /> Double+</span>
            </div>
          </div>
        </ExpandableSection>
      )}

      {/* ================================================================ */}
      {/* Section 2.2: Front 9 / Back 9 Split */}
      {/* ================================================================ */}
      {review.frontBackSplit && (
        <ExpandableSection
          title="Front 9 vs Back 9"
          icon={<IconTrendingUp size={16} />}
          defaultExpanded={false}
        >
          {(() => {
            const { front, back } = review.frontBackSplit;
            const frontBetter = front.score <= back.score;
            return (
              <div className="grid grid-cols-2 gap-3">
                {/* Front 9 */}
                <div className={cn(
                  'p-3 rounded-xl border',
                  frontBetter ? 'bg-primary-50/50 border-primary-200/50' : 'bg-cream-100/68 border-warm-200/45'
                )}>
                  <div className="text-xs font-medium text-warm-500 mb-2 uppercase">Front 9</div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-warm-600">Score</span>
                      <span className="font-medium text-warm-900">{front.score}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-warm-600">Putts</span>
                      <span className="font-medium text-warm-900">{front.putts}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-warm-600">GIR</span>
                      <span className="font-medium text-warm-900">{front.gir}/{front.girTotal}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-warm-600">Fairways</span>
                      <span className="font-medium text-warm-900">{front.fairways}/{front.fairwayTotal}</span>
                    </div>
                  </div>
                </div>
                {/* Back 9 */}
                <div className={cn(
                  'p-3 rounded-xl border',
                  !frontBetter ? 'bg-primary-50/50 border-primary-200/50' : 'bg-cream-100/68 border-warm-200/45'
                )}>
                  <div className="text-xs font-medium text-warm-500 mb-2 uppercase">Back 9</div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-warm-600">Score</span>
                      <span className="font-medium text-warm-900">{back.score}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-warm-600">Putts</span>
                      <span className="font-medium text-warm-900">{back.putts}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-warm-600">GIR</span>
                      <span className="font-medium text-warm-900">{back.gir}/{back.girTotal}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-warm-600">Fairways</span>
                      <span className="font-medium text-warm-900">{back.fairways}/{back.fairwayTotal}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </ExpandableSection>
      )}

      {/* ================================================================ */}
      {/* Section 2.3: Putting Distance Breakdown */}
      {/* ================================================================ */}
      {review.puttingBreakdown && review.puttingBreakdown.ranges.some(r => r.attempts > 0) && (
        <ExpandableSection
          title="Putting Breakdown"
          icon={<IconTarget size={16} />}
          defaultExpanded={false}
          badge={
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
              {review.puttingBreakdown.totalPutts} putts
            </span>
          }
        >
          <div className="space-y-4">
            {/* Distance breakdown bars */}
            <div className="space-y-2">
              {review.puttingBreakdown.ranges.filter(r => r.attempts > 0).map((range, i) => (
                <motion.div
                  key={range.label}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 }}
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-warm-700">{range.label}</span>
                    <span className="text-warm-500">{range.made}/{range.attempts} ({range.pct}%)</span>
                  </div>
                  <div className="h-3 bg-warm-100 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-primary-500 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${range.pct}%` }}
                      transition={{ delay: i * 0.08 + 0.2, duration: 0.5 }}
                    />
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/20">
              {review.puttingBreakdown.avgFirstPuttDist !== null && (
                <div className="p-2 rounded-lg bg-cream-100/68 text-center">
                  <div className="text-xs text-warm-500">Avg 1st Putt</div>
                  <div className="text-body-lg font-medium tracking-[-0.005em] text-warm-900">{review.puttingBreakdown.avgFirstPuttDist}ft</div>
                </div>
              )}
              <div className="p-2 rounded-lg bg-cream-100/68 text-center">
                <div className="text-xs text-warm-500">One-Putts</div>
                <div className="text-body-lg font-medium tracking-[-0.005em] text-primary-600">{review.puttingBreakdown.onePuttCount}</div>
              </div>
            </div>

            {/* Three-putt detail */}
            {review.puttingBreakdown.threePuttHoles.length > 0 && (
              <div className="pt-2 border-t border-white/20">
                <div className="text-xs font-medium text-amber-700 mb-1">Three-Putts</div>
                <div className="flex flex-wrap gap-2">
                  {review.puttingBreakdown.threePuttHoles.map(tp => (
                    <span key={tp.hole} className="px-2 py-1 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                      #{tp.hole} {tp.firstPuttFeet ? `from ${Math.round(tp.firstPuttFeet)}ft` : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ExpandableSection>
      )}

      {/* ================================================================ */}
      {/* Section 2.4: Strokes-to-Gain Priority */}
      {/* ================================================================ */}
      {review.strokesToGain && review.strokesToGain.length > 0 && (
        <ExpandableSection
          title="Improvement Priorities"
          icon={<IconTrendingUp size={16} />}
          defaultExpanded={false}
          badge={
            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-medium">
              <AnimatedNumber
                value={review.strokesToGain.reduce((s, item) => s + item.potentialStrokes, 0)}
                decimals={1}
                suffix=" strokes"
              />
            </span>
          }
        >
          <div className="space-y-2">
            {review.strokesToGain.map((item, index) => (
              <motion.div
                key={item.category}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-start gap-3 p-3 rounded-lg bg-cream-100/68 border border-warm-200/45"
              >
                <div className={cn(
                  'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-eyebrow font-medium',
                  index === 0 ? 'bg-red-100 text-red-700' :
                  index === 1 ? 'bg-amber-100 text-amber-700' :
                  'bg-warm-100 text-warm-600'
                )}>
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm text-warm-900">{item.category}</span>
                    <span className={cn(
                      'text-body-sm font-medium',
                      item.potentialStrokes >= 2 ? 'text-red-600' :
                      item.potentialStrokes >= 1 ? 'text-amber-600' :
                      'text-warm-600'
                    )}>
                      <AnimatedNumber value={item.potentialStrokes} decimals={1} />
                    </span>
                  </div>
                  <p className="text-xs text-warm-600 mt-0.5">{item.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </ExpandableSection>
      )}

      {/* ================================================================ */}
      {/* Section 2.5: Momentum Chart */}
      {/* ================================================================ */}
      {review.momentumData && review.momentumData.length > 0 && (
        <ExpandableSection
          title="Momentum"
          icon={<IconTrendingUp size={16} />}
          defaultExpanded={false}
        >
          {(() => {
            const data = review.momentumData;
            const maxVal = Math.max(...data.map(d => Math.abs(d.rollingScoreToPar)), 1);
            const chartHeight = 120;
            const midY = chartHeight / 2;
            return (
              <div className="space-y-2">
                {/* Chart */}
                <div className="relative" style={{ height: chartHeight }}>
                  {/* Zero line */}
                  <div
                    className="absolute left-0 right-0 border-t border-warm-300 border-dashed"
                    style={{ top: midY }}
                  />
                  <div className="absolute left-0 text-micro text-warm-400" style={{ top: midY - 14 }}>E</div>
                  {/* Bars */}
                  <div className="flex items-end justify-between h-full pl-4">
                    {data.map((d) => {
                      const val = d.rollingScoreToPar;
                      const barH = Math.abs(val) / maxVal * (chartHeight / 2 - 4);
                      const isOver = val > 0;
                      return (
                        <div
                          key={d.hole}
                          className="flex flex-col items-center relative"
                          style={{ flex: 1 }}
                        >
                          {/* Bar above or below zero */}
                          <div
                            className="absolute left-1/2 -translate-x-1/2"
                            style={{
                              top: isOver ? midY - barH : midY,
                              height: barH || 1,
                              width: '60%',
                              maxWidth: 20,
                            }}
                          >
                            <div className={cn(
                              'w-full h-full rounded-sm',
                              isOver ? 'bg-red-400/70' : val < 0 ? 'bg-primary-500/70' : 'bg-warm-300'
                            )} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* Hole labels */}
                <div className="flex justify-between pl-4 text-eyebrow text-warm-400">
                  {data.map(d => (
                    <span key={d.hole} className="text-center" style={{ flex: 1 }}>{d.hole}</span>
                  ))}
                </div>
                {/* Current status */}
                <div className="text-center text-xs text-warm-500 pt-1">
                  Finished at{' '}
                  <span className={cn(
                    'font-medium',
                    data[data.length - 1]!.rollingScoreToPar < 0 ? 'text-primary-600' :
                    data[data.length - 1]!.rollingScoreToPar > 0 ? 'text-red-600' :
                    'text-warm-700'
                  )}>
                    {data[data.length - 1]!.rollingScoreToPar === 0 ? 'E' :
                     data[data.length - 1]!.rollingScoreToPar > 0 ? `+${data[data.length - 1]!.rollingScoreToPar}` :
                     `${data[data.length - 1]!.rollingScoreToPar}`}
                  </span>
                </div>
              </div>
            );
          })()}
        </ExpandableSection>
      )}

      {/* ================================================================ */}
      {/* Section 2.6: Driving & Penalty Analysis */}
      {/* ================================================================ */}
      {(review.drivingAnalysis || review.penaltyAnalysis) && (
        <ExpandableSection
          title="Driving & Penalties"
          icon={<IconTarget size={16} />}
          defaultExpanded={false}
        >
          <div className="space-y-4">
            {/* Driving stats */}
            {review.drivingAnalysis && (
              <div>
                <div className="text-xs font-medium text-warm-500 mb-2 uppercase tracking-wider">Driving</div>
                <div className="grid grid-cols-2 gap-2">
                  {review.drivingAnalysis.avgDistance !== null && (
                    <div className="p-2.5 rounded-lg bg-cream-100/68 border border-warm-200/45">
                      <div className="text-xs text-warm-500">Avg Distance</div>
                      <div className="text-body-lg font-medium tracking-[-0.005em] text-warm-900">{review.drivingAnalysis.avgDistance}y</div>
                    </div>
                  )}
                  {review.drivingAnalysis.longestDrive && (
                    <div className="p-2.5 rounded-lg bg-cream-100/68 border border-warm-200/45">
                      <div className="text-xs text-warm-500">Longest Drive</div>
                      <div className="text-body-lg font-medium tracking-[-0.005em] text-warm-900">{review.drivingAnalysis.longestDrive.distance}y</div>
                      <div className="text-micro text-warm-400">Hole #{review.drivingAnalysis.longestDrive.hole}</div>
                    </div>
                  )}
                </div>
                {/* Miss pattern */}
                {review.drivingAnalysis.missPattern.total > 0 && (
                  <div className="mt-3">
                    <div className="text-xs text-warm-500 mb-1.5">Miss Pattern</div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-warm-600 w-8">L: {review.drivingAnalysis.missPattern.left}</span>
                      <div className="flex-1 h-4 bg-warm-100 rounded-full overflow-hidden flex">
                        {review.drivingAnalysis.missPattern.total > 0 && (
                          <>
                            <div
                              className="h-full bg-blue-400 rounded-l-full"
                              style={{ width: `${(review.drivingAnalysis.missPattern.left / review.drivingAnalysis.missPattern.total) * 100}%` }}
                            />
                            <div
                              className="h-full bg-orange-400 rounded-r-full"
                              style={{ width: `${(review.drivingAnalysis.missPattern.right / review.drivingAnalysis.missPattern.total) * 100}%` }}
                            />
                          </>
                        )}
                      </div>
                      <span className="text-xs text-warm-600 w-8 text-right">R: {review.drivingAnalysis.missPattern.right}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Penalty analysis */}
            {review.penaltyAnalysis && review.penaltyAnalysis.total > 0 && (
              <div className="pt-3 border-t border-white/20">
                <div className="text-xs font-medium text-warm-500 mb-2 uppercase tracking-wider">Penalties</div>
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-red-50/50 border border-red-200/50">
                    <div className="text-xs text-red-600">Strokes Lost</div>
                    <div className="text-h3 font-medium text-red-700 tracking-[-0.012em]">{review.penaltyAnalysis.strokesLost}</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 flex-1">
                    {review.penaltyAnalysis.holes.map(p => (
                      <span key={p.hole} className="px-2 py-1 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
                        #{p.hole} ({p.count})
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </ExpandableSection>
      )}
    </div>
  );
}
