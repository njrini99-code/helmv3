'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  IconSparkles,
  IconRefresh,
  IconAlertCircle,
  IconChartBar,
  IconTrendingUp,
  IconTarget,
  IconWarning,
  IconFlag,
  IconActivity,
  IconBolt,
} from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useRoundReviewV2 } from '@/hooks/coachhelm/useRoundReviewV2';

import { V2ReviewSummary } from './round-review/V2ReviewSummary';
import { V2PatternsSection } from './round-review/V2PatternsSection';
import { V2CausalInsights } from './round-review/V2CausalInsights';
import { V2PredictionCard } from './round-review/V2PredictionCard';

import type { RoundReviewContent, HoleBreakdown, StatComparison, StrokesToGainItem } from '@/app/golf/actions/round-review-system';

interface RoundReviewViewerProps {
  roundId: string;
  isCoach?: boolean;
  className?: string;
}

// Grade color mapping
const gradeColors: Record<string, { bg: string; text: string; border: string; ring: string }> = {
  A: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', ring: 'ring-emerald-500/20' },
  B: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', ring: 'ring-green-500/20' },
  C: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', ring: 'ring-amber-500/20' },
  D: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', ring: 'ring-orange-500/20' },
  F: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', ring: 'ring-red-500/20' },
};

const sentimentLabel: Record<string, string> = {
  positive: 'Strong Round',
  neutral: 'Solid Round',
  challenging: 'Tough Round',
};

// Score-to-par color for scorecard
function scoreToPairColor(stp: number): string {
  if (stp <= -2) return 'bg-amber-400 text-white'; // eagle+
  if (stp === -1) return 'bg-green-500 text-white'; // birdie
  if (stp === 0) return 'bg-warm-200 text-warm-800'; // par
  if (stp === 1) return 'bg-red-300 text-white'; // bogey
  return 'bg-red-500 text-white'; // double+
}

function formatScoreToPar(stp: number): string {
  if (stp === 0) return 'E';
  return stp > 0 ? `+${stp}` : `${stp}`;
}

function comparisonArrow(cmp: StatComparison): { icon: string; color: string; label: string } {
  if (cmp === 'above') return { icon: '\u2191', color: 'text-green-600', label: 'Above avg' };
  if (cmp === 'below') return { icon: '\u2193', color: 'text-red-600', label: 'Below avg' };
  return { icon: '\u2014', color: 'text-warm-400', label: 'Average' };
}

export function RoundReviewViewer({ roundId, isCoach, className }: RoundReviewViewerProps) {
  const {
    review,
    ruleBasedContent,
    v2Review,
    loading,
    generating,
    error,
    generate,
    needsGeneration,
  } = useRoundReviewV2(roundId, isCoach);

  // Loading state
  if (loading) {
    return (
      <div className={cn('rounded-2xl border border-warm-200 bg-white/70 backdrop-blur-xl p-6', className)}>
        <div className="animate-pulse space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 bg-warm-200 rounded-lg" />
            <div className="h-5 w-32 bg-warm-200 rounded" />
          </div>
          <div className="h-12 bg-warm-100 rounded-lg" />
          <div className="grid grid-cols-9 gap-1">
            {Array.from({ length: 18 }).map((_, i) => (
              <div key={i} className="h-10 bg-warm-100 rounded" />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 bg-warm-100 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !needsGeneration) {
    return (
      <div className={cn('rounded-2xl border border-red-200 bg-red-50 p-6', className)}>
        <div className="flex items-start gap-3">
          <IconAlertCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-red-900">Unable to load review</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
            <Button variant="secondary" size="sm" onClick={generate} disabled={generating} className="mt-3">
              <IconRefresh size={14} className={cn('mr-2', generating && 'animate-spin')} />
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Needs generation prompt
  if (needsGeneration) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn('rounded-2xl border border-dashed border-warm-300 bg-white/50 backdrop-blur-xl p-8', className)}
      >
        <div className="flex flex-col items-center justify-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center mb-4 shadow-lg shadow-green-500/20">
            <IconSparkles size={24} className="text-white" />
          </div>
          <h3 className="text-lg font-semibold text-warm-900 mb-2">Round Review</h3>
          <p className="text-sm text-warm-500 max-w-sm mb-6">
            Get a detailed performance breakdown with scoring analysis, putting stats, driving data, and improvement priorities.
          </p>
          <Button
            onClick={generate}
            disabled={generating}
            className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
          >
            {generating ? (
              <>
                <IconRefresh size={16} className="mr-2 animate-spin" />
                Analyzing Round...
              </>
            ) : (
              <>
                <IconSparkles size={16} className="mr-2" />
                Generate Review
              </>
            )}
          </Button>
          {error && <p className="text-xs text-red-500 mt-3">{error}</p>}
        </div>
      </motion.div>
    );
  }

  // Generating overlay
  if (generating) {
    return (
      <div className={cn('rounded-2xl border border-warm-200 bg-white/70 backdrop-blur-xl p-6', className)}>
        <div className="flex flex-col items-center justify-center py-8">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/20">
              <IconSparkles size={28} className="text-white animate-pulse" />
            </div>
            <div className="absolute -inset-2 bg-green-500/20 rounded-3xl animate-ping" />
          </div>
          <h3 className="text-lg font-medium text-warm-900 mt-6 mb-2">Analyzing Round...</h3>
          <p className="text-sm text-warm-500 text-center max-w-xs">
            Computing shot analytics, putting breakdown, and improvement priorities.
          </p>
        </div>
      </div>
    );
  }

  const hasV2Data = v2Review !== null;
  const hasRuleBasedData = ruleBasedContent !== null;
  const hasV1Data = review !== null;

  if (!hasV2Data && !hasRuleBasedData && !hasV1Data) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('space-y-4', className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl shadow-lg shadow-green-500/20">
            <IconSparkles size={18} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-warm-900">Round Review</h2>
            <p className="text-xs text-warm-500">
              {hasV2Data ? 'CoachHelm Intelligence' : 'Shot-Level Analytics'}
            </p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={generate} disabled={generating} title="Regenerate review">
          <IconRefresh size={14} className={cn(generating && 'animate-spin')} />
        </Button>
      </div>

      <AnimatePresence mode="wait">
        {/* Rule-based content (always primary — data-dense) */}
        {hasRuleBasedData && ruleBasedContent && (
          <motion.div
            key="rule-based-review"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {/* 2a. Grade + Summary */}
            <GradeSummaryCard content={ruleBasedContent} />

            {/* 2b. Visual Scorecard */}
            {ruleBasedContent.holeByHole && ruleBasedContent.holeByHole.length > 0 && (
              <ScorecardStrip holes={ruleBasedContent.holeByHole} frontBack={ruleBasedContent.frontBackSplit} />
            )}

            {/* 2c. Scoring Distribution */}
            <ScoringDistribution dist={ruleBasedContent.scoringDistribution} totalHoles={ruleBasedContent.holeByHole?.length ?? 18} />

            {/* 2d. Key Stats Grid */}
            {ruleBasedContent.keyStats && ruleBasedContent.keyStats.length > 0 && (
              <KeyStatsGrid stats={ruleBasedContent.keyStats} />
            )}

            {/* 2e. Momentum Chart */}
            {ruleBasedContent.momentumData && ruleBasedContent.momentumData.length > 0 && (
              <MomentumChart data={ruleBasedContent.momentumData} />
            )}

            {/* 2f. Putting Analysis */}
            {ruleBasedContent.puttingBreakdown && (
              <PuttingAnalysis data={ruleBasedContent.puttingBreakdown} />
            )}

            {/* 2g. Driving Analysis */}
            {ruleBasedContent.drivingAnalysis && (
              <DrivingAnalysis data={ruleBasedContent.drivingAnalysis} />
            )}

            {/* 2h. Short Game */}
            {ruleBasedContent.shortGameAnalysis && (
              <ShortGameCard data={ruleBasedContent.shortGameAnalysis} />
            )}

            {/* 2i. Highlights + Improvement */}
            <HighlightsAndImprovements
              highlights={ruleBasedContent.highlights}
              improvements={ruleBasedContent.areasForImprovement}
            />

            {/* 2j. Strokes to Gain */}
            {ruleBasedContent.strokesToGain && ruleBasedContent.strokesToGain.length > 0 && (
              <StrokesToGainCard items={ruleBasedContent.strokesToGain} />
            )}

            {/* 2k. Recommendations */}
            {ruleBasedContent.recommendations && ruleBasedContent.recommendations.length > 0 && (
              <RecommendationsCard recs={ruleBasedContent.recommendations} />
            )}
          </motion.div>
        )}

        {/* Fallback V1 Review Content */}
        {!hasRuleBasedData && hasV1Data && review && (
          <motion.div
            key="v1-review"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <div className="rounded-xl border border-warm-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-warm-900 mb-3">Summary</h3>
              <p className="text-sm text-warm-600 leading-relaxed">{review.summary}</p>
              {review.primaryTakeaway && (
                <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-100">
                  <p className="text-sm font-medium text-green-900">Key Takeaway: {review.primaryTakeaway}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2l. V2 CoachHelm Section (conditional, guarded) */}
      {hasV2Data && v2Review && (
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-2 px-1">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-purple-200 to-transparent" />
            <span className="text-xs font-medium text-purple-600 px-2">CoachHelm AI</span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-purple-200 to-transparent" />
          </div>
          <V2ReviewSummary review={v2Review} />
          {v2Review.patternsApplied && v2Review.patternsApplied.length > 0 && (
            <V2PatternsSection patterns={v2Review.patternsApplied} />
          )}
          {v2Review.prediction && <V2PredictionCard prediction={v2Review.prediction} />}
          {v2Review.causalInsights && v2Review.causalInsights.length > 0 && (
            <V2CausalInsights insights={v2Review.causalInsights} />
          )}
        </div>
      )}
    </motion.div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/** 2a. Grade + Summary */
function GradeSummaryCard({ content }: { content: RoundReviewContent }) {
  const gc = gradeColors[content.overallGrade] ?? gradeColors['C']!;
  return (
    <div className="rounded-xl border border-warm-200 bg-white p-5">
      <div className="flex items-start gap-4">
        <div className={cn(
          'flex-shrink-0 w-16 h-16 rounded-xl flex items-center justify-center border-2 ring-4',
          gc.bg, gc.text, gc.border, gc.ring,
        )}>
          <span className="text-3xl font-bold">{content.overallGrade}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={cn(
              'text-xs font-semibold px-2.5 py-0.5 rounded-full',
              content.sentiment === 'positive' && 'bg-green-100 text-green-700',
              content.sentiment === 'neutral' && 'bg-amber-100 text-amber-700',
              content.sentiment === 'challenging' && 'bg-red-100 text-red-700',
            )}>
              {sentimentLabel[content.sentiment] ?? content.sentiment}
            </span>
          </div>
          <p className="text-sm text-warm-700 leading-relaxed">{content.summary}</p>
        </div>
      </div>
    </div>
  );
}

/** 2b. Visual Scorecard Strip */
function ScorecardStrip({
  holes,
  frontBack,
}: {
  holes: HoleBreakdown[];
  frontBack: RoundReviewContent['frontBackSplit'];
}) {
  const front = holes.filter(h => h.hole <= 9);
  const back = holes.filter(h => h.hole >= 10);
  const frontScore = frontBack.front.score;
  const backScore = frontBack.back.score;
  const frontPar = front.reduce((s, h) => s + h.par, 0);
  const backPar = back.reduce((s, h) => s + h.par, 0);

  return (
    <div className="rounded-xl border border-warm-200 bg-white p-4 overflow-x-auto">
      <h3 className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-3 flex items-center gap-2">
        <IconFlag size={14} />
        Scorecard
      </h3>

      {/* Front 9 */}
      <div className="mb-3">
        <div className="flex items-center gap-1 mb-1">
          <span className="text-[10px] font-semibold text-warm-400 uppercase w-10 flex-shrink-0">OUT</span>
          <div className="grid grid-cols-9 gap-1 flex-1">
            {front.map(h => (
              <div key={h.hole} className="text-center">
                <div className="text-[10px] text-warm-400 font-medium">{h.hole}</div>
              </div>
            ))}
          </div>
          <span className="text-[10px] font-semibold text-warm-400 w-10 text-center flex-shrink-0">TOT</span>
        </div>
        {/* Par row */}
        <div className="flex items-center gap-1 mb-1">
          <span className="text-[10px] text-warm-400 w-10 flex-shrink-0">Par</span>
          <div className="grid grid-cols-9 gap-1 flex-1">
            {front.map(h => (
              <div key={h.hole} className="text-center text-[11px] text-warm-500">{h.par}</div>
            ))}
          </div>
          <span className="text-[11px] text-warm-500 w-10 text-center flex-shrink-0">{frontPar}</span>
        </div>
        {/* Score row */}
        <div className="flex items-center gap-1 mb-1">
          <span className="text-[10px] text-warm-400 w-10 flex-shrink-0">Score</span>
          <div className="grid grid-cols-9 gap-1 flex-1">
            {front.map(h => (
              <div key={h.hole} className={cn(
                'text-center text-[11px] font-bold rounded py-0.5',
                scoreToPairColor(h.scoreToPar),
              )}>
                {h.score}
              </div>
            ))}
          </div>
          <span className={cn(
            'text-[11px] font-bold w-10 text-center flex-shrink-0 rounded py-0.5',
            frontScore <= frontPar ? 'text-green-700' : 'text-red-600',
          )}>
            {frontScore}
          </span>
        </div>
        {/* Putts row */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-warm-400 w-10 flex-shrink-0">Putts</span>
          <div className="grid grid-cols-9 gap-1 flex-1">
            {front.map(h => (
              <div key={h.hole} className={cn(
                'text-center text-[10px]',
                h.threePutt ? 'text-red-500 font-semibold' : h.onePutt ? 'text-green-600 font-semibold' : 'text-warm-400',
              )}>
                {h.putts}
              </div>
            ))}
          </div>
          <span className="text-[10px] text-warm-500 w-10 text-center flex-shrink-0">
            {frontBack.front.putts}
          </span>
        </div>
      </div>

      {/* Back 9 */}
      {back.length > 0 && (
        <div>
          <div className="flex items-center gap-1 mb-1">
            <span className="text-[10px] font-semibold text-warm-400 uppercase w-10 flex-shrink-0">IN</span>
            <div className="grid grid-cols-9 gap-1 flex-1">
              {back.map(h => (
                <div key={h.hole} className="text-center">
                  <div className="text-[10px] text-warm-400 font-medium">{h.hole}</div>
                </div>
              ))}
            </div>
            <span className="text-[10px] font-semibold text-warm-400 w-10 text-center flex-shrink-0">TOT</span>
          </div>
          <div className="flex items-center gap-1 mb-1">
            <span className="text-[10px] text-warm-400 w-10 flex-shrink-0">Par</span>
            <div className="grid grid-cols-9 gap-1 flex-1">
              {back.map(h => (
                <div key={h.hole} className="text-center text-[11px] text-warm-500">{h.par}</div>
              ))}
            </div>
            <span className="text-[11px] text-warm-500 w-10 text-center flex-shrink-0">{backPar}</span>
          </div>
          <div className="flex items-center gap-1 mb-1">
            <span className="text-[10px] text-warm-400 w-10 flex-shrink-0">Score</span>
            <div className="grid grid-cols-9 gap-1 flex-1">
              {back.map(h => (
                <div key={h.hole} className={cn(
                  'text-center text-[11px] font-bold rounded py-0.5',
                  scoreToPairColor(h.scoreToPar),
                )}>
                  {h.score}
                </div>
              ))}
            </div>
            <span className={cn(
              'text-[11px] font-bold w-10 text-center flex-shrink-0 rounded py-0.5',
              backScore <= backPar ? 'text-green-700' : 'text-red-600',
            )}>
              {backScore}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-warm-400 w-10 flex-shrink-0">Putts</span>
            <div className="grid grid-cols-9 gap-1 flex-1">
              {back.map(h => (
                <div key={h.hole} className={cn(
                  'text-center text-[10px]',
                  h.threePutt ? 'text-red-500 font-semibold' : h.onePutt ? 'text-green-600 font-semibold' : 'text-warm-400',
                )}>
                  {h.putts}
                </div>
              ))}
            </div>
            <span className="text-[10px] text-warm-500 w-10 text-center flex-shrink-0">
              {frontBack.back.putts}
            </span>
          </div>
        </div>
      )}

      {/* Front/Back Summary */}
      <div className="mt-3 pt-3 border-t border-warm-100 grid grid-cols-2 gap-4 text-xs">
        <div>
          <span className="text-warm-400">Front 9:</span>{' '}
          <span className="font-semibold text-warm-800">{frontScore}</span>{' '}
          <span className="text-warm-400">({formatScoreToPar(frontScore - frontPar)})</span>
          <span className="text-warm-300 mx-1.5">|</span>
          <span className="text-warm-400">{frontBack.front.gir}/{frontBack.front.girTotal} GIR</span>
          <span className="text-warm-300 mx-1.5">|</span>
          <span className="text-warm-400">{frontBack.front.fairways}/{frontBack.front.fairwayTotal} FW</span>
        </div>
        {back.length > 0 && (
          <div>
            <span className="text-warm-400">Back 9:</span>{' '}
            <span className="font-semibold text-warm-800">{backScore}</span>{' '}
            <span className="text-warm-400">({formatScoreToPar(backScore - backPar)})</span>
            <span className="text-warm-300 mx-1.5">|</span>
            <span className="text-warm-400">{frontBack.back.gir}/{frontBack.back.girTotal} GIR</span>
            <span className="text-warm-300 mx-1.5">|</span>
            <span className="text-warm-400">{frontBack.back.fairways}/{frontBack.back.fairwayTotal} FW</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** 2c. Scoring Distribution Bar */
function ScoringDistribution({
  dist,
  totalHoles,
}: {
  dist: RoundReviewContent['scoringDistribution'];
  totalHoles: number;
}) {
  const segments = [
    { label: 'Eagle+', count: dist.eagles.length, color: 'bg-amber-400', text: 'text-amber-700' },
    { label: 'Birdie', count: dist.birdies.length, color: 'bg-green-500', text: 'text-green-700' },
    { label: 'Par', count: dist.pars.length, color: 'bg-warm-300', text: 'text-warm-700' },
    { label: 'Bogey', count: dist.bogeys.length, color: 'bg-red-300', text: 'text-red-700' },
    { label: 'Double+', count: dist.doublePlus.length, color: 'bg-red-500', text: 'text-red-700' },
  ].filter(s => s.count > 0);

  return (
    <div className="rounded-xl border border-warm-200 bg-white p-4">
      <h3 className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-3 flex items-center gap-2">
        <IconChartBar size={14} />
        Scoring Distribution
      </h3>
      {/* Stacked bar */}
      <div className="flex rounded-lg overflow-hidden h-8 mb-3">
        {segments.map(s => (
          <div
            key={s.label}
            className={cn('flex items-center justify-center text-[11px] font-bold text-white transition-all', s.color)}
            style={{ width: `${(s.count / totalHoles) * 100}%`, minWidth: s.count > 0 ? '28px' : 0 }}
          >
            {s.count}
          </div>
        ))}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map(s => (
          <div key={s.label} className="flex items-center gap-1.5 text-xs">
            <span className={cn('w-2.5 h-2.5 rounded-sm', s.color)} />
            <span className={cn('font-medium', s.text)}>{s.count} {s.label}{s.count !== 1 ? 's' : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 2d. Key Stats Grid */
function KeyStatsGrid({ stats }: { stats: RoundReviewContent['keyStats'] }) {
  return (
    <div className="rounded-xl border border-warm-200 bg-white p-4">
      <h3 className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-3 flex items-center gap-2">
        <IconChartBar size={14} />
        Key Stats
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {stats.map((stat, i) => {
          const cmp = comparisonArrow(stat.comparison);
          return (
            <div
              key={i}
              className={cn(
                'p-3 rounded-lg border',
                stat.comparison === 'above' && 'bg-green-50/50 border-green-100',
                stat.comparison === 'below' && 'bg-red-50/50 border-red-100',
                stat.comparison === 'average' && 'bg-warm-50 border-warm-100',
              )}
            >
              <p className="text-[11px] font-medium text-warm-500">{stat.label}</p>
              <p className="text-xl font-bold text-warm-900 mt-0.5">{stat.value}</p>
              <p className={cn('text-[11px] font-semibold mt-0.5', cmp.color)}>
                {cmp.icon} {cmp.label}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 2e. Momentum Chart — CSS-based cumulative score line */
function MomentumChart({ data }: { data: RoundReviewContent['momentumData'] }) {
  if (data.length === 0) return null;
  const values = data.map(d => d.rollingScoreToPar);
  const min = Math.min(...values, -1);
  const max = Math.max(...values, 1);
  const range = max - min || 1;

  return (
    <div className="rounded-xl border border-warm-200 bg-white p-4">
      <h3 className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-3 flex items-center gap-2">
        <IconActivity size={14} />
        Momentum
      </h3>
      <div className="relative h-24">
        {/* Zero line */}
        <div
          className="absolute left-0 right-0 border-t border-dashed border-warm-200"
          style={{ top: `${((max - 0) / range) * 100}%` }}
        >
          <span className="absolute -left-1 -top-2.5 text-[9px] text-warm-400">E</span>
        </div>
        {/* Points and lines */}
        <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${data.length - 1} ${range}`} preserveAspectRatio="none">
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth="0.15"
            className="text-green-500"
            points={data.map((d, i) => `${i},${max - d.rollingScoreToPar}`).join(' ')}
          />
        </svg>
        {/* Dot labels */}
        <div className="absolute inset-0 flex items-end">
          {data.map((d, i) => {
            const pct = ((max - d.rollingScoreToPar) / range) * 100;
            const isLast = i === data.length - 1;
            return (
              <div key={d.hole} className="flex-1 relative" style={{ height: '100%' }}>
                <div
                  className={cn(
                    'absolute w-1.5 h-1.5 rounded-full -translate-x-1/2',
                    d.rollingScoreToPar <= 0 ? 'bg-green-500' : 'bg-red-400',
                  )}
                  style={{ top: `${pct}%`, left: '50%' }}
                />
                {(i % 3 === 0 || isLast) && (
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[8px] text-warm-400">
                    {d.hole}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-warm-400">
        <span>Hole 1</span>
        <span className={cn(
          'font-semibold',
          (values[values.length - 1] ?? 0) <= 0 ? 'text-green-600' : 'text-red-500',
        )}>
          Final: {formatScoreToPar(values[values.length - 1] ?? 0)}
        </span>
        <span>Hole {data[data.length - 1]?.hole ?? 18}</span>
      </div>
    </div>
  );
}

/** 2f. Putting Analysis */
function PuttingAnalysis({ data }: { data: RoundReviewContent['puttingBreakdown'] }) {
  return (
    <div className="rounded-xl border border-warm-200 bg-white p-4">
      <h3 className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-3 flex items-center gap-2">
        <IconTarget size={14} />
        Putting Breakdown
      </h3>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center p-2 rounded-lg bg-warm-50">
          <div className="text-2xl font-bold text-warm-900">{data.totalPutts}</div>
          <div className="text-[10px] text-warm-500">Total Putts</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-green-50">
          <div className="text-2xl font-bold text-green-700">{data.onePuttCount}</div>
          <div className="text-[10px] text-green-600">One-Putts</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-warm-50">
          <div className="text-2xl font-bold text-warm-900">{data.avgFirstPuttDist !== null ? `${data.avgFirstPuttDist}ft` : '--'}</div>
          <div className="text-[10px] text-warm-500">Avg 1st Putt</div>
        </div>
      </div>

      {/* Distance ranges table */}
      <div className="border border-warm-100 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-warm-50">
              <th className="text-left px-3 py-2 font-semibold text-warm-600">Distance</th>
              <th className="text-center px-3 py-2 font-semibold text-warm-600">Attempts</th>
              <th className="text-center px-3 py-2 font-semibold text-warm-600">Made</th>
              <th className="text-center px-3 py-2 font-semibold text-warm-600">Make %</th>
            </tr>
          </thead>
          <tbody>
            {data.ranges.map(r => (
              <tr key={r.label} className="border-t border-warm-50">
                <td className="px-3 py-2 font-medium text-warm-800">{r.label}</td>
                <td className="px-3 py-2 text-center text-warm-600">{r.attempts}</td>
                <td className="px-3 py-2 text-center text-warm-600">{r.made}</td>
                <td className="px-3 py-2 text-center">
                  <span className={cn(
                    'font-semibold',
                    r.pct >= 80 ? 'text-green-600' : r.pct >= 40 ? 'text-warm-700' : 'text-red-500',
                  )}>
                    {r.attempts > 0 ? `${r.pct}%` : '--'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Three-putt callouts */}
      {data.threePuttHoles.length > 0 && (
        <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-100">
          <div className="text-xs font-semibold text-red-700 mb-1">
            {data.threePuttHoles.length} Three-Putt{data.threePuttHoles.length > 1 ? 's' : ''}
          </div>
          <div className="flex flex-wrap gap-2">
            {data.threePuttHoles.map(tp => (
              <span key={tp.hole} className="text-[11px] px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
                #{tp.hole}{tp.firstPuttFeet ? ` (${Math.round(tp.firstPuttFeet)}ft)` : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** 2g. Driving Analysis */
function DrivingAnalysis({ data }: { data: RoundReviewContent['drivingAnalysis'] }) {
  const hasData = data.avgDistance !== null || data.fairwayPct !== null;
  if (!hasData) return null;

  const totalMisses = data.missPattern.total;
  const leftPct = totalMisses > 0 ? Math.round((data.missPattern.left / totalMisses) * 100) : 0;
  const rightPct = totalMisses > 0 ? Math.round((data.missPattern.right / totalMisses) * 100) : 0;

  return (
    <div className="rounded-xl border border-warm-200 bg-white p-4">
      <h3 className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-3 flex items-center gap-2">
        <IconBolt size={14} />
        Driving
      </h3>
      <div className="grid grid-cols-3 gap-3 mb-4">
        {data.avgDistance !== null && (
          <div className="text-center p-2 rounded-lg bg-warm-50">
            <div className="text-2xl font-bold text-warm-900">{data.avgDistance}y</div>
            <div className="text-[10px] text-warm-500">Avg Distance</div>
          </div>
        )}
        {data.longestDrive && (
          <div className="text-center p-2 rounded-lg bg-warm-50">
            <div className="text-2xl font-bold text-warm-900">{data.longestDrive.distance}y</div>
            <div className="text-[10px] text-warm-500">Longest (#{data.longestDrive.hole})</div>
          </div>
        )}
        {data.fairwayPct !== null && (
          <div className="text-center p-2 rounded-lg bg-warm-50">
            <div className={cn(
              'text-2xl font-bold',
              data.fairwayPct >= 60 ? 'text-green-700' : data.fairwayPct >= 45 ? 'text-warm-900' : 'text-red-600',
            )}>
              {data.fairwayPct}%
            </div>
            <div className="text-[10px] text-warm-500">Fairway Hit</div>
          </div>
        )}
      </div>

      {/* Miss pattern */}
      {totalMisses > 0 && (
        <div className="p-3 bg-warm-50 rounded-lg">
          <div className="text-[11px] font-medium text-warm-600 mb-2">Miss Direction ({totalMisses} misses)</div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-warm-700 w-10">Left</span>
            <div className="flex-1 h-4 bg-warm-200 rounded-full overflow-hidden flex">
              <div className="bg-blue-400 h-full transition-all" style={{ width: `${leftPct}%` }} />
              <div className="flex-1" />
              <div className="bg-orange-400 h-full transition-all" style={{ width: `${rightPct}%` }} />
            </div>
            <span className="text-[11px] font-semibold text-warm-700 w-10 text-right">Right</span>
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-warm-500">
            <span>{data.missPattern.left} ({leftPct}%)</span>
            <span>{data.missPattern.right} ({rightPct}%)</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** 2h. Short Game */
function ShortGameCard({ data }: { data: RoundReviewContent['shortGameAnalysis'] }) {
  if (data.scrambleAttempts === 0 && data.sandAttempts === 0) return null;

  return (
    <div className="rounded-xl border border-warm-200 bg-white p-4">
      <h3 className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-3 flex items-center gap-2">
        <IconTarget size={14} />
        Short Game
      </h3>
      <div className="grid grid-cols-2 gap-3 mb-3">
        {data.scramblePct !== null && (
          <div className="text-center p-3 rounded-lg bg-warm-50">
            <div className={cn(
              'text-2xl font-bold',
              data.scramblePct >= 50 ? 'text-green-700' : 'text-warm-900',
            )}>
              {data.scramblePct}%
            </div>
            <div className="text-[10px] text-warm-500">
              Scramble ({data.scrambleSuccesses}/{data.scrambleAttempts})
            </div>
          </div>
        )}
        {data.sandAttempts > 0 && (
          <div className="text-center p-3 rounded-lg bg-warm-50">
            <div className={cn(
              'text-2xl font-bold',
              (data.sandSavePct ?? 0) >= 50 ? 'text-green-700' : 'text-warm-900',
            )}>
              {data.sandSavePct !== null ? `${data.sandSavePct}%` : '--'}
            </div>
            <div className="text-[10px] text-warm-500">
              Sand Save ({data.sandSuccesses}/{data.sandAttempts})
            </div>
          </div>
        )}
      </div>

      {/* Up-and-down detail list */}
      {data.upAndDownDetails.length > 0 && (
        <div className="space-y-1">
          {data.upAndDownDetails.map((ud, i) => (
            <div key={i} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-warm-50/50">
              <span className={cn(
                'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold',
                ud.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600',
              )}>
                {ud.success ? '\u2713' : '\u2717'}
              </span>
              <span className="font-medium text-warm-800">#{ud.hole}</span>
              <span className="text-warm-500">{ud.from}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 2i. Highlights + Improvement */
function HighlightsAndImprovements({
  highlights,
  improvements,
}: {
  highlights: RoundReviewContent['highlights'];
  improvements: RoundReviewContent['areasForImprovement'];
}) {
  if ((!highlights || highlights.length === 0) && (!improvements || improvements.length === 0)) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {highlights && highlights.length > 0 && (
        <div className="rounded-xl border border-green-100 bg-green-50/30 p-4">
          <h3 className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-3 flex items-center gap-2">
            <IconTrendingUp size={14} />
            Highlights
          </h3>
          <div className="space-y-2">
            {highlights.map((h, i) => (
              <div key={i} className="p-2.5 rounded-lg bg-white/80 border border-green-100">
                <div className="text-xs font-semibold text-warm-900">{h.title}</div>
                <p className="text-[11px] text-warm-600 mt-0.5">{h.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {improvements && improvements.length > 0 && (
        <div className="rounded-xl border border-amber-100 bg-amber-50/30 p-4">
          <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-3 flex items-center gap-2">
            <IconWarning size={14} />
            Areas to Work On
          </h3>
          <div className="space-y-2">
            {improvements.map((area, i) => (
              <div key={i} className="p-2.5 rounded-lg bg-white/80 border border-amber-100">
                <div className="text-xs font-semibold text-warm-900">{area.area}</div>
                <p className="text-[11px] text-warm-600 mt-0.5">{area.recommendation}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** 2j. Strokes to Gain Priority */
function StrokesToGainCard({ items }: { items: StrokesToGainItem[] }) {
  return (
    <div className="rounded-xl border border-warm-200 bg-gradient-to-br from-blue-50/50 to-white p-4">
      <h3 className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-3 flex items-center gap-2">
        <IconBolt size={14} className="text-blue-600" />
        Biggest Improvement Opportunities
      </h3>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-white border border-warm-100">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <span className="text-lg font-bold text-blue-700">
                {item.potentialStrokes > 0 ? `-${item.potentialStrokes}` : item.potentialStrokes}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-warm-900">{item.category}</div>
              <p className="text-[11px] text-warm-600 mt-0.5">{item.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 2k. Recommendations */
function RecommendationsCard({ recs }: { recs: string[] }) {
  return (
    <div className="rounded-xl border border-warm-200 bg-white p-4">
      <h3 className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-3 flex items-center gap-2">
        <IconSparkles size={14} className="text-green-600" />
        Recommendations
      </h3>
      <div className="space-y-2">
        {recs.map((rec, i) => (
          <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-warm-50">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-[10px] font-bold mt-0.5">
              {i + 1}
            </span>
            <p className="text-xs text-warm-700 leading-relaxed">{rec}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
