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

/** Convert snake_case or camelCase to readable Title Case */
function formatLabel(text: string): string {
  return text
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// Stagger children animation
const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.05 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const },
  },
};

// Grade color mapping
const gradeColors: Record<string, { bg: string; text: string; border: string; ring: string; glow: string }> = {
  A: { bg: 'bg-primary-50', text: 'text-primary-700', border: 'border-primary-200', ring: 'ring-primary-500/20', glow: 'shadow-primary-500/15' },
  B: { bg: 'bg-primary-50', text: 'text-primary-700', border: 'border-primary-200', ring: 'ring-primary-500/20', glow: 'shadow-primary-500/15' },
  C: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', ring: 'ring-amber-500/20', glow: 'shadow-amber-500/15' },
  D: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', ring: 'ring-orange-500/20', glow: 'shadow-orange-500/15' },
  F: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', ring: 'ring-red-500/20', glow: 'shadow-red-500/15' },
};

const sentimentLabel: Record<string, string> = {
  positive: 'Strong Round',
  neutral: 'Solid Round',
  challenging: 'Tough Round',
};

// Score-to-par color for scorecard
function scoreToPairColor(stp: number): string {
  if (stp <= -2) return 'bg-amber-400 text-white'; // eagle+
  if (stp === -1) return 'bg-primary-500 text-white'; // birdie
  if (stp === 0) return 'bg-warm-100 text-warm-800'; // par
  if (stp === 1) return 'bg-red-200 text-red-800'; // bogey
  return 'bg-red-400 text-white'; // double+
}

function formatScoreToPar(stp: number): string {
  if (stp === 0) return 'E';
  return stp > 0 ? `+${stp}` : `${stp}`;
}

function comparisonArrow(cmp: StatComparison): { icon: string; color: string; label: string } {
  if (cmp === 'above') return { icon: '\u2191', color: 'text-primary-600', label: 'Above avg' };
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

  // Loading state — shimmer skeleton
  if (loading) {
    return (
      <div className={cn('rounded-2xl border border-warm-200 bg-white/70 backdrop-blur-xl p-6', className)}>
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-gradient-to-br from-warm-200 to-warm-100 rounded-xl animate-pulse" />
            <div className="space-y-2">
              <div className="h-4 w-28 bg-warm-200 rounded-lg animate-pulse" />
              <div className="h-3 w-20 bg-warm-100 rounded animate-pulse" />
            </div>
          </div>
          <div className="h-16 bg-gradient-to-r from-warm-100 via-warm-50 to-warm-100 rounded-xl animate-pulse" />
          <div className="grid grid-cols-9 gap-1.5">
            {Array.from({ length: 18 }).map((_, i) => (
              <div key={i} className="h-10 bg-warm-100 rounded-lg animate-pulse" style={{ animationDelay: `${i * 40}ms` }} />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 bg-warm-50 rounded-xl border border-warm-100 animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !needsGeneration) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn('rounded-2xl border border-red-200 bg-red-50/80 backdrop-blur-xl p-6', className)}
      >
        <div className="flex items-start gap-3">
          <div className="p-2 bg-red-100 rounded-lg">
            <IconAlertCircle size={18} className="text-red-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-red-900">Unable to load review</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
            <Button variant="secondary" size="sm" onClick={generate} disabled={generating} className="mt-3">
              <IconRefresh size={14} className={cn('mr-2', generating && 'animate-spin')} />
              Try Again
            </Button>
          </div>
        </div>
      </motion.div>
    );
  }

  // Needs generation prompt
  if (needsGeneration) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className={cn('rounded-2xl border border-dashed border-warm-300 bg-white/50 backdrop-blur-xl p-10', className)}
      >
        <div className="flex flex-col items-center justify-center text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center mb-5 shadow-lg shadow-primary-500/25"
          >
            <IconSparkles size={28} className="text-white" />
          </motion.div>
          <motion.h3
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="text-xl font-semibold text-warm-900 mb-2"
          >
            Round Review
          </motion.h3>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="text-sm text-warm-500 max-w-sm mb-7"
          >
            Get a detailed performance breakdown with scoring analysis, putting stats, driving data, and improvement priorities.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
          >
            <Button
              onClick={generate}
              disabled={generating}
              className="bg-gradient-to-r from-primary-600 to-primary-600 hover:from-primary-700 hover:to-primary-700 shadow-lg shadow-primary-500/20 hover:shadow-primary-500/30 transition-all duration-300"
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
          </motion.div>
          {error && <p className="text-xs text-red-500 mt-3">{error}</p>}
        </div>
      </motion.div>
    );
  }

  // Generating overlay
  if (generating) {
    return (
      <div className={cn('rounded-2xl border border-warm-200 bg-white/70 backdrop-blur-xl p-6', className)}>
        <div className="flex flex-col items-center justify-center py-10">
          <div className="relative">
            <motion.div
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
              className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/25"
            >
              <IconSparkles size={28} className="text-white" />
            </motion.div>
            <motion.div
              animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0, 0.3] }}
              transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
              className="absolute -inset-3 bg-primary-500/15 rounded-3xl"
            />
          </div>
          <h3 className="text-lg font-semibold text-warm-900 mt-7 mb-2">Analyzing Round...</h3>
          <p className="text-sm text-warm-500 text-center max-w-xs">
            Computing shot analytics, putting breakdown, and improvement priorities.
          </p>
          <motion.div
            className="mt-5 h-1 w-48 bg-warm-100 rounded-full overflow-hidden"
          >
            <motion.div
              animate={{ x: ['-100%', '100%'] }}
              transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
              className="h-full w-1/2 bg-gradient-to-r from-transparent via-primary-500 to-transparent rounded-full"
            />
          </motion.div>
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
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className={cn('space-y-5', className)}
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl shadow-lg shadow-primary-500/20">
            <IconSparkles size={18} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-warm-900">Round Review</h2>
            <p className="text-xs text-warm-500">
              {hasV2Data ? 'CoachHelm Intelligence' : 'Shot-Level Analytics'}
            </p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={generate} disabled={generating} title="Regenerate review" aria-label="Regenerate review" className="hover:bg-warm-100 transition-colors">
          <IconRefresh size={14} className={cn(generating && 'animate-spin')} />
        </Button>
      </motion.div>

      <AnimatePresence mode="wait">
        {/* Rule-based content (always primary — data-dense) */}
        {hasRuleBasedData && ruleBasedContent && (
          <motion.div
            key="rule-based-review"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0 }}
            className="space-y-5"
          >
            {/* Grade + Summary */}
            <motion.div variants={fadeUp}>
              <GradeSummaryCard content={ruleBasedContent} />
            </motion.div>

            {/* Scorecard */}
            {ruleBasedContent.holeByHole && ruleBasedContent.holeByHole.length > 0 && (
              <motion.div variants={fadeUp}>
                <ScorecardStrip holes={ruleBasedContent.holeByHole} frontBack={ruleBasedContent.frontBackSplit} />
              </motion.div>
            )}

            {/* Scoring Distribution + Momentum side by side on desktop */}
            <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ScoringDistribution dist={ruleBasedContent.scoringDistribution} totalHoles={ruleBasedContent.holeByHole?.length ?? 18} />
              {ruleBasedContent.momentumData && ruleBasedContent.momentumData.length > 0 && (
                <MomentumChart data={ruleBasedContent.momentumData} />
              )}
            </motion.div>

            {/* Key Stats Grid */}
            {ruleBasedContent.keyStats && ruleBasedContent.keyStats.length > 0 && (
              <motion.div variants={fadeUp}>
                <KeyStatsGrid stats={ruleBasedContent.keyStats} />
              </motion.div>
            )}

            {/* Game Breakdown: Putting + Driving + Short Game */}
            <motion.div variants={fadeUp}>
              <GameBreakdownSection
                putting={ruleBasedContent.puttingBreakdown}
                driving={ruleBasedContent.drivingAnalysis}
                shortGame={ruleBasedContent.shortGameAnalysis}
              />
            </motion.div>

            {/* Improvement Opportunities */}
            {ruleBasedContent.strokesToGain && ruleBasedContent.strokesToGain.length > 0 && (
              <motion.div variants={fadeUp}>
                <StrokesToGainCard items={ruleBasedContent.strokesToGain} />
              </motion.div>
            )}

            {/* Highlights + Improvements */}
            <motion.div variants={fadeUp}>
              <HighlightsAndImprovements
                highlights={ruleBasedContent.highlights}
                improvements={ruleBasedContent.areasForImprovement}
              />
            </motion.div>

            {/* Recommendations */}
            {ruleBasedContent.recommendations && ruleBasedContent.recommendations.length > 0 && (
              <motion.div variants={fadeUp}>
                <RecommendationsCard recs={ruleBasedContent.recommendations} />
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Fallback V1 Review Content */}
        {!hasRuleBasedData && hasV1Data && review && (
          <motion.div
            key="v1-review"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <div className="rounded-2xl border border-warm-200 bg-white/80 backdrop-blur-sm p-5">
              <h3 className="text-sm font-semibold text-warm-900 mb-3">Summary</h3>
              <p className="text-sm text-warm-600 leading-relaxed">{review.summary}</p>
              {review.primaryTakeaway && (
                <div className="mt-4 p-3 bg-primary-50 rounded-lg border border-primary-100">
                  <p className="text-sm font-medium text-primary-900">Key Takeaway: {review.primaryTakeaway}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* V2 CoachHelm Intelligence Section */}
      {hasV2Data && v2Review && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="space-y-5 pt-2"
        >
          <div className="flex items-center gap-3 px-1">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary-300/60 to-transparent" />
            <div className="flex items-center gap-2 px-3 py-1.5 bg-primary-50/80 rounded-full border border-primary-200/40">
              <IconSparkles size={12} className="text-primary-600" />
              <span className="text-[11px] font-semibold text-primary-700 uppercase tracking-wider">AI Intelligence</span>
            </div>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary-300/60 to-transparent" />
          </div>
          <V2ReviewSummary review={v2Review} />
          {v2Review.prediction && <V2PredictionCard prediction={v2Review.prediction} />}
          {v2Review.patternsApplied && v2Review.patternsApplied.length > 0 && (
            <V2PatternsSection patterns={v2Review.patternsApplied} />
          )}
          {v2Review.causalInsights && v2Review.causalInsights.length > 0 && (
            <V2CausalInsights insights={v2Review.causalInsights} />
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/** Strip NaN% artifacts from text stored in DB by earlier versions */
function sanitizeNaN(text: string): string {
  return text
    .replace(/\bNaN%/g, '—')
    .replace(/\bNaN\b/g, '—')
    .replace(/\s+—\s+of rounds with\s+—\s+reliability\.?/gi, '')
    .replace(/This occurs in\s+—\s+of rounds with\s+—\s+reliability\.?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Grade + Summary */
function GradeSummaryCard({ content }: { content: RoundReviewContent }) {
  const gc = gradeColors[content.overallGrade] ?? gradeColors['C']!;
  const cleanSummary = sanitizeNaN(content.summary);
  return (
    <div className="rounded-2xl border border-warm-200 bg-white/80 backdrop-blur-sm p-6 shadow-sm">
      <div className="flex items-start gap-5">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            'flex-shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center border-2 ring-4 shadow-lg',
            gc.bg, gc.text, gc.border, gc.ring, gc.glow,
          )}
        >
          <span className="text-3xl font-bold">{content.overallGrade}</span>
        </motion.div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={cn(
              'text-xs font-semibold px-3 py-1 rounded-full',
              content.sentiment === 'positive' && 'bg-primary-100 text-primary-700',
              content.sentiment === 'neutral' && 'bg-amber-100 text-amber-700',
              content.sentiment === 'challenging' && 'bg-red-100 text-red-700',
            )}>
              {sentimentLabel[content.sentiment] ?? content.sentiment}
            </span>
          </div>
          <p className="text-sm text-warm-700 leading-relaxed">{cleanSummary}</p>
        </div>
      </div>
    </div>
  );
}

/** Visual Scorecard Strip */
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

  const renderNine = (nineHoles: HoleBreakdown[], label: string, totalScore: number, totalPar: number, halfStats: typeof frontBack.front) => (
    <div className="mb-4 last:mb-0">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-center">
          <thead>
            <tr>
              <th className="text-[10px] font-semibold text-warm-400 uppercase w-12 text-left py-2">{label}</th>
              {nineHoles.map(h => (
                <th key={h.hole} className="text-[11px] font-semibold text-warm-500 py-2 w-[calc((100%-96px)/9)]">
                  {h.hole}
                </th>
              ))}
              <th className="text-[10px] font-semibold text-warm-500 uppercase w-12 py-2">Tot</th>
            </tr>
          </thead>
          <tbody>
            {/* Par row */}
            <tr className="border-t border-warm-100">
              <td className="text-[10px] text-warm-400 text-left py-1.5">Par</td>
              {nineHoles.map(h => (
                <td key={h.hole} className="text-[11px] text-warm-400 py-1.5">{h.par}</td>
              ))}
              <td className="text-[11px] text-warm-500 font-medium py-1.5">{totalPar}</td>
            </tr>
            {/* Score row */}
            <tr>
              <td className="text-[10px] text-warm-500 font-medium text-left py-2">Score</td>
              {nineHoles.map((h, i) => (
                <td key={h.hole} className="py-2">
                  <motion.span
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.05 * i, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className={cn(
                      'inline-flex items-center justify-center w-7 h-7 text-xs font-bold rounded-lg transition-shadow',
                      scoreToPairColor(h.scoreToPar),
                    )}
                  >
                    {h.score}
                  </motion.span>
                </td>
              ))}
              <td className="py-2">
                <span className={cn(
                  'text-sm font-bold',
                  totalScore <= totalPar ? 'text-primary-700' : 'text-red-600',
                )}>
                  {totalScore}
                </span>
              </td>
            </tr>
            {/* Putts row */}
            <tr className="border-t border-warm-50">
              <td className="text-[10px] text-warm-400 text-left py-1.5">Putts</td>
              {nineHoles.map(h => (
                <td key={h.hole} className={cn(
                  'text-[11px] py-1.5 font-medium',
                  h.threePutt ? 'text-red-500 font-bold' : h.onePutt ? 'text-primary-600' : 'text-warm-400',
                )}>
                  {h.putts}
                </td>
              ))}
              <td className="text-[11px] text-warm-500 font-medium py-1.5">{halfStats.putts}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="rounded-2xl border border-warm-200 bg-white/80 backdrop-blur-sm p-5 shadow-sm">
      <h3 className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-4 flex items-center gap-2">
        <IconFlag size={14} />
        Scorecard
      </h3>

      {renderNine(front, 'Out', frontScore, frontPar, frontBack.front)}
      {back.length > 0 && (
        <>
          <div className="h-px bg-warm-100 my-2" />
          {renderNine(back, 'In', backScore, backPar, frontBack.back)}
        </>
      )}

      {/* Totals row */}
      <div className="mt-3 pt-3 border-t border-warm-200 flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          <div>
            <span className="text-warm-400">Front: </span>
            <span className="font-semibold text-warm-800">{frontScore}</span>
            <span className="text-warm-400 ml-1">({formatScoreToPar(frontScore - frontPar)})</span>
          </div>
          {back.length > 0 && (
            <div>
              <span className="text-warm-400">Back: </span>
              <span className="font-semibold text-warm-800">{backScore}</span>
              <span className="text-warm-400 ml-1">({formatScoreToPar(backScore - backPar)})</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-warm-400">
            {frontBack.front.gir + frontBack.back.gir}/{frontBack.front.girTotal + frontBack.back.girTotal} GIR
          </span>
          <span className="text-warm-400">
            {frontBack.front.fairways + frontBack.back.fairways}/{frontBack.front.fairwayTotal + frontBack.back.fairwayTotal} FW
          </span>
        </div>
      </div>

      {/* Scorecard legend */}
      <div className="mt-3 flex items-center gap-3 text-[10px]">
        <div className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-amber-400" /> <span className="text-warm-400">Eagle+</span></div>
        <div className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-primary-500" /> <span className="text-warm-400">Birdie</span></div>
        <div className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-warm-100" /> <span className="text-warm-400">Par</span></div>
        <div className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-red-200" /> <span className="text-warm-400">Bogey</span></div>
        <div className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-red-400" /> <span className="text-warm-400">Double+</span></div>
      </div>
    </div>
  );
}

/** Scoring Distribution Bar */
function ScoringDistribution({
  dist,
  totalHoles,
}: {
  dist: RoundReviewContent['scoringDistribution'];
  totalHoles: number;
}) {
  const segments = [
    { label: 'Eagle+', count: dist.eagles.length, color: 'bg-amber-400', text: 'text-amber-700' },
    { label: 'Birdie', count: dist.birdies.length, color: 'bg-primary-500', text: 'text-primary-700' },
    { label: 'Par', count: dist.pars.length, color: 'bg-warm-300', text: 'text-warm-700' },
    { label: 'Bogey', count: dist.bogeys.length, color: 'bg-red-300', text: 'text-red-700' },
    { label: 'Double+', count: dist.doublePlus.length, color: 'bg-red-500', text: 'text-red-700' },
  ].filter(s => s.count > 0);

  return (
    <div className="rounded-2xl border border-warm-200 bg-white/80 backdrop-blur-sm p-5 shadow-sm">
      <h3 className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-4 flex items-center gap-2">
        <IconChartBar size={14} />
        Scoring Distribution
      </h3>
      <div className="flex rounded-xl overflow-hidden h-9 mb-3">
        {segments.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ width: 0 }}
            animate={{ width: `${(s.count / totalHoles) * 100}%` }}
            transition={{ delay: 0.2 + i * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className={cn('flex items-center justify-center text-xs font-bold text-white', s.color)}
            style={{ minWidth: s.count > 0 ? '32px' : 0 }}
          >
            {s.count}
          </motion.div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
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

/** Key Stats Grid */
function KeyStatsGrid({ stats }: { stats: RoundReviewContent['keyStats'] }) {
  return (
    <div className="rounded-2xl border border-warm-200 bg-white/80 backdrop-blur-sm p-5 shadow-sm">
      <h3 className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-4 flex items-center gap-2">
        <IconChartBar size={14} />
        Key Stats
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {stats.map((stat, i) => {
          const cmp = comparisonArrow(stat.comparison);
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * i, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                'p-3.5 rounded-xl border transition-colors',
                stat.comparison === 'above' && 'bg-primary-50/60 border-primary-100',
                stat.comparison === 'below' && 'bg-red-50/60 border-red-100',
                stat.comparison === 'average' && 'bg-warm-50/60 border-warm-100',
              )}
            >
              <p className="text-[11px] font-medium text-warm-500 mb-0.5">{formatLabel(stat.label)}</p>
              <p className="text-2xl font-bold text-warm-900 tabular-nums">{stat.value}</p>
              <p className={cn('text-[11px] font-semibold mt-0.5', cmp.color)}>
                {cmp.icon} {cmp.label}
              </p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/** Momentum Chart */
function MomentumChart({ data }: { data: RoundReviewContent['momentumData'] }) {
  if (data.length === 0) return null;
  const values = data.map(d => d.rollingScoreToPar);
  const min = Math.min(...values, -1);
  const max = Math.max(...values, 1);
  const range = max - min || 1;

  return (
    <div className="rounded-2xl border border-warm-200 bg-white/80 backdrop-blur-sm p-5 shadow-sm">
      <h3 className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-4 flex items-center gap-2">
        <IconActivity size={14} />
        Round Momentum
      </h3>
      <div className="relative h-28">
        {/* Zero/even par line */}
        <div
          className="absolute left-0 right-0 border-t border-dashed border-warm-200"
          style={{ top: `${((max - 0) / range) * 100}%` }}
        >
          <span className="absolute -left-0.5 -top-2.5 text-[9px] font-medium text-warm-400">E</span>
        </div>
        {/* SVG line */}
        <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${data.length - 1} ${range}`} preserveAspectRatio="none">
          {/* Fill below the line */}
          <defs>
            <linearGradient id="momentumGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(34,197,94)" stopOpacity="0.2" />
              <stop offset="100%" stopColor="rgb(34,197,94)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon
            fill="url(#momentumGrad)"
            points={`0,${range} ${data.map((d, i) => `${i},${max - d.rollingScoreToPar}`).join(' ')} ${data.length - 1},${range}`}
          />
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth="0.12"
            strokeLinejoin="round"
            strokeLinecap="round"
            className="text-primary-500"
            points={data.map((d, i) => `${i},${max - d.rollingScoreToPar}`).join(' ')}
          />
        </svg>
        {/* Dots */}
        <div className="absolute inset-0 flex items-end">
          {data.map((d, i) => {
            const pct = ((max - d.rollingScoreToPar) / range) * 100;
            const isLast = i === data.length - 1;
            return (
              <div key={d.hole} className="flex-1 relative" style={{ height: '100%' }}>
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.03 * i, duration: 0.3 }}
                  className={cn(
                    'absolute rounded-full -translate-x-1/2',
                    isLast ? 'w-3 h-3 ring-2 ring-white shadow-sm' : 'w-1.5 h-1.5',
                    d.rollingScoreToPar <= 0 ? 'bg-primary-500' : 'bg-red-400',
                  )}
                  style={{ top: `${pct}%`, left: '50%' }}
                />
                {(i % 3 === 0 || isLast) && (
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[8px] text-warm-400 font-medium">
                    {d.hole}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex justify-between mt-2 text-[10px] text-warm-400">
        <span>Hole 1</span>
        <span className={cn(
          'font-bold text-xs',
          (values[values.length - 1] ?? 0) <= 0 ? 'text-primary-600' : 'text-red-500',
        )}>
          Final: {formatScoreToPar(values[values.length - 1] ?? 0)}
        </span>
        <span>Hole {data[data.length - 1]?.hole ?? 18}</span>
      </div>
    </div>
  );
}

/** Game Breakdown — Putting, Driving, Short Game */
function GameBreakdownSection({
  putting,
  driving,
  shortGame,
}: {
  putting: RoundReviewContent['puttingBreakdown'];
  driving: RoundReviewContent['drivingAnalysis'];
  shortGame: RoundReviewContent['shortGameAnalysis'];
}) {
  const hasDriving = driving && (driving.avgDistance !== null || driving.fairwayPct !== null);
  const hasShortGame = shortGame && (shortGame.scrambleAttempts > 0 || shortGame.sandAttempts > 0);
  const hasPutting = !!putting;

  if (!hasPutting && !hasDriving && !hasShortGame) return null;

  return (
    <div className="rounded-2xl border border-warm-200 bg-white/80 backdrop-blur-sm overflow-hidden shadow-sm">
      {/* Putting */}
      {hasPutting && (
        <div className="p-5">
          <h3 className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <IconTarget size={14} />
            Putting
          </h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { value: putting.totalPutts, label: 'Total Putts', bg: 'bg-warm-50', textColor: 'text-warm-900' },
              { value: putting.onePuttCount, label: 'One-Putts', bg: 'bg-primary-50/80', textColor: 'text-primary-700' },
              { value: putting.avgFirstPuttDist !== null ? `${putting.avgFirstPuttDist}ft` : '--', label: 'Avg 1st Putt', bg: 'bg-warm-50', textColor: 'text-warm-900' },
            ].map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 * i, duration: 0.35 }}
                className={cn('text-center p-3 rounded-xl', item.bg)}
              >
                <div className={cn('text-2xl font-bold tabular-nums', item.textColor)}>{item.value}</div>
                <div className="text-[10px] text-warm-500 font-medium mt-0.5">{item.label}</div>
              </motion.div>
            ))}
          </div>

          {/* Distance ranges */}
          <div className="border border-warm-100 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-warm-50/80">
                  <th className="text-left px-3 py-2.5 font-semibold text-warm-600">Distance</th>
                  <th className="text-center px-3 py-2.5 font-semibold text-warm-600">Attempts</th>
                  <th className="text-center px-3 py-2.5 font-semibold text-warm-600">Made</th>
                  <th className="text-center px-3 py-2.5 font-semibold text-warm-600">Make %</th>
                </tr>
              </thead>
              <tbody>
                {putting.ranges.map(r => (
                  <tr key={r.label} className="border-t border-warm-50 hover:bg-warm-50/40 transition-colors">
                    <td className="px-3 py-2.5 font-medium text-warm-800">{r.label}</td>
                    <td className="px-3 py-2.5 text-center text-warm-600 tabular-nums">{r.attempts}</td>
                    <td className="px-3 py-2.5 text-center text-warm-600 tabular-nums">{r.made}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={cn(
                        'font-semibold tabular-nums',
                        r.pct >= 80 ? 'text-primary-600' : r.pct >= 40 ? 'text-warm-700' : 'text-red-500',
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
          {putting.threePuttHoles.length > 0 && (
            <div className="mt-3 p-3.5 bg-red-50/60 rounded-xl border border-red-100">
              <div className="text-xs font-semibold text-red-700 mb-2">
                {putting.threePuttHoles.length} Three-Putt{putting.threePuttHoles.length > 1 ? 's' : ''}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {putting.threePuttHoles.map(tp => (
                  <span key={tp.hole} className="text-[11px] px-2.5 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">
                    #{tp.hole}{tp.firstPuttFeet ? ` (${Math.round(tp.firstPuttFeet)}ft)` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Driving */}
      {hasDriving && (
        <div className={cn('p-5', hasPutting && 'border-t border-warm-100')}>
          <h3 className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <IconBolt size={14} />
            Driving
          </h3>
          <div className="grid grid-cols-3 gap-3 mb-3">
            {driving.avgDistance !== null && (
              <div className="text-center p-3 rounded-xl bg-warm-50">
                <div className="text-2xl font-bold text-warm-900 tabular-nums">{driving.avgDistance}y</div>
                <div className="text-[10px] text-warm-500 font-medium mt-0.5">Avg Distance</div>
              </div>
            )}
            {driving.longestDrive && (
              <div className="text-center p-3 rounded-xl bg-warm-50">
                <div className="text-2xl font-bold text-warm-900 tabular-nums">{driving.longestDrive.distance}y</div>
                <div className="text-[10px] text-warm-500 font-medium mt-0.5">Longest (#{driving.longestDrive.hole})</div>
              </div>
            )}
            {driving.fairwayPct !== null && (
              <div className="text-center p-3 rounded-xl bg-warm-50">
                <div className={cn(
                  'text-2xl font-bold tabular-nums',
                  driving.fairwayPct >= 60 ? 'text-primary-700' : driving.fairwayPct >= 45 ? 'text-warm-900' : 'text-red-600',
                )}>
                  {driving.fairwayPct}%
                </div>
                <div className="text-[10px] text-warm-500 font-medium mt-0.5">Fairway Hit</div>
              </div>
            )}
          </div>

          {/* Miss pattern */}
          {driving.missPattern.total > 0 && (
            <div className="p-3.5 bg-warm-50 rounded-xl">
              <div className="text-[11px] font-medium text-warm-600 mb-2">Miss Direction ({driving.missPattern.total} misses)</div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-warm-700 w-8">Left</span>
                <div className="flex-1 h-3.5 bg-warm-200 rounded-full overflow-hidden flex">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${driving.missPattern.total > 0 ? Math.round((driving.missPattern.left / driving.missPattern.total) * 100) : 0}%` }}
                    transition={{ delay: 0.3, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    className="bg-blue-400 h-full rounded-l-full"
                  />
                  <div className="flex-1" />
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${driving.missPattern.total > 0 ? Math.round((driving.missPattern.right / driving.missPattern.total) * 100) : 0}%` }}
                    transition={{ delay: 0.3, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    className="bg-orange-400 h-full rounded-r-full"
                  />
                </div>
                <span className="text-[11px] font-semibold text-warm-700 w-8 text-right">Right</span>
              </div>
              <div className="flex justify-between mt-1.5 text-[10px] text-warm-500">
                <span>{driving.missPattern.left} ({driving.missPattern.total > 0 ? Math.round((driving.missPattern.left / driving.missPattern.total) * 100) : 0}%)</span>
                <span>{driving.missPattern.right} ({driving.missPattern.total > 0 ? Math.round((driving.missPattern.right / driving.missPattern.total) * 100) : 0}%)</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Short Game */}
      {hasShortGame && (
        <div className={cn('p-5', (hasPutting || hasDriving) && 'border-t border-warm-100')}>
          <h3 className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <IconTarget size={14} />
            Short Game
          </h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            {shortGame.scramblePct !== null && (
              <div className="text-center p-3.5 rounded-xl bg-warm-50">
                <div className={cn(
                  'text-2xl font-bold tabular-nums',
                  shortGame.scramblePct >= 50 ? 'text-primary-700' : 'text-warm-900',
                )}>
                  {shortGame.scramblePct}%
                </div>
                <div className="text-[10px] text-warm-500 font-medium mt-0.5">
                  Scramble ({shortGame.scrambleSuccesses}/{shortGame.scrambleAttempts})
                </div>
              </div>
            )}
            {shortGame.sandAttempts > 0 && (
              <div className="text-center p-3.5 rounded-xl bg-warm-50">
                <div className={cn(
                  'text-2xl font-bold tabular-nums',
                  (shortGame.sandSavePct ?? 0) >= 50 ? 'text-primary-700' : 'text-warm-900',
                )}>
                  {shortGame.sandSavePct !== null ? `${shortGame.sandSavePct}%` : '--'}
                </div>
                <div className="text-[10px] text-warm-500 font-medium mt-0.5">
                  Sand Save ({shortGame.sandSuccesses}/{shortGame.sandAttempts})
                </div>
              </div>
            )}
          </div>

          {shortGame.upAndDownDetails.length > 0 && (
            <div className="space-y-1.5">
              {shortGame.upAndDownDetails.map((ud, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * i }}
                  className="flex items-center gap-2.5 text-xs px-3 py-2 rounded-lg bg-warm-50/50 border border-warm-100/50"
                >
                  <span className={cn(
                    'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold',
                    ud.success ? 'bg-primary-100 text-primary-700' : 'bg-red-100 text-red-600',
                  )}>
                    {ud.success ? '\u2713' : '\u2717'}
                  </span>
                  <span className="font-medium text-warm-800">#{ud.hole}</span>
                  <span className="text-warm-500">{formatLabel(ud.from)}</span>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Highlights + Improvement */
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
        <div className="rounded-2xl border border-primary-100 bg-primary-50/40 backdrop-blur-sm p-5 shadow-sm">
          <h3 className="text-xs font-semibold text-primary-700 uppercase tracking-wider mb-3 flex items-center gap-2">
            <IconTrendingUp size={14} />
            Highlights
          </h3>
          <div className="space-y-2">
            {highlights.map((h, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 * i, duration: 0.35 }}
                className="p-3.5 rounded-xl bg-white/80 border border-primary-100 shadow-sm"
              >
                <div className="text-xs font-semibold text-warm-900">{formatLabel(h.title)}</div>
                <p className="text-[11px] text-warm-600 mt-1 leading-relaxed">{h.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      )}
      {improvements && improvements.length > 0 && (
        <div className="rounded-2xl border border-amber-100 bg-amber-50/40 backdrop-blur-sm p-5 shadow-sm">
          <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-3 flex items-center gap-2">
            <IconWarning size={14} />
            Areas to Work On
          </h3>
          <div className="space-y-2">
            {improvements.map((area, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 * i, duration: 0.35 }}
                className="p-3.5 rounded-xl bg-white/80 border border-amber-100 shadow-sm"
              >
                <div className="text-xs font-semibold text-warm-900">{formatLabel(area.area)}</div>
                <p className="text-[11px] text-warm-600 mt-1 leading-relaxed">{area.recommendation}</p>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Strokes to Gain Priority */
function StrokesToGainCard({ items }: { items: StrokesToGainItem[] }) {
  return (
    <div className="rounded-2xl border border-warm-200 bg-white/80 backdrop-blur-sm p-5 shadow-sm">
      <h3 className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-4 flex items-center gap-2">
        <IconBolt size={14} className="text-blue-600" />
        Biggest Improvement Opportunities
      </h3>
      <div className="space-y-2.5">
        {items.map((item, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 * i, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-3 p-3.5 rounded-xl bg-warm-50/50 border border-warm-100 hover:bg-warm-50 transition-colors"
          >
            <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center border border-blue-200/50 shadow-sm">
              <span className="text-base font-bold text-blue-700 tabular-nums">
                {item.potentialStrokes > 0 ? `-${item.potentialStrokes}` : item.potentialStrokes}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-warm-900">{formatLabel(item.category)}</div>
              <p className="text-[11px] text-warm-600 mt-0.5 leading-relaxed">{item.description}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/** Recommendations */
function RecommendationsCard({ recs }: { recs: string[] }) {
  return (
    <div className="rounded-2xl border border-warm-200 bg-white/80 backdrop-blur-sm p-5 shadow-sm">
      <h3 className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-4 flex items-center gap-2">
        <IconSparkles size={14} className="text-primary-600" />
        Practice Recommendations
      </h3>
      <div className="space-y-2.5">
        {recs.map((rec, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 * i, duration: 0.35 }}
            className="flex items-start gap-3 p-3.5 rounded-xl bg-warm-50/50 border border-warm-100/50"
          >
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 text-white flex items-center justify-center text-[10px] font-bold mt-0.5 shadow-sm">
              {i + 1}
            </span>
            <p className="text-xs text-warm-700 leading-relaxed">{rec}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
