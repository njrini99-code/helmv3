'use client';

/**
 * E-7: Data Completeness Dashboard / Quality Score
 *
 * Shows the quality and completeness of shot-tracking data:
 * - Overall data quality score (percentage of shots with full SG-ready data)
 * - Per-field completeness breakdown
 * - Visual indicators (ring chart + progress bars)
 * - Warning when >20% of shots can't compute SG
 * - Coaching tips for improving data capture
 */

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// ============================================================================
// TYPES
// ============================================================================

export interface ShotCompletenessData {
  totalShots: number;
  totalRounds: number;

  // Per-field completeness (count of shots that have this field)
  hasDistanceBefore: number;
  hasDistanceAfter: number;
  hasLieBefore: number;
  hasLieAfter: number;
  hasClub: number;
  hasResult: number;

  // SG-calculable shots (have all required fields)
  sgReadyShots: number;

  // Shots that used the fallback estimation for distance_after
  fallbackEstimated: number;

  // Per-round breakdown for the quality heatmap
  roundQualities?: {
    roundId: string;
    roundDate: string;
    courseName: string | null;
    totalShots: number;
    sgReadyShots: number;
    qualityPct: number;
  }[];
}

interface DataCompletenessCardProps {
  data: ShotCompletenessData;
  className?: string;
  compact?: boolean;
}

// ============================================================================
// SCORE CALCULATIONS
// ============================================================================

function getOverallQualityScore(data: ShotCompletenessData): number {
  if (data.totalShots === 0) return 0;
  return Math.round((data.sgReadyShots / data.totalShots) * 100);
}

function getQualityLevel(score: number): {
  label: string;
  color: string;
  bgColor: string;
  ringColor: string;
  description: string;
} {
  if (score >= 90) return {
    label: 'Excellent',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    ringColor: '#16A34A',
    description: 'Nearly all shots have full SG data',
  };
  if (score >= 75) return {
    label: 'Good',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    ringColor: '#2563EB',
    description: 'Most shots trackable — minor gaps',
  };
  if (score >= 50) return {
    label: 'Fair',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    ringColor: '#D97706',
    description: 'Significant data gaps affect SG accuracy',
  };
  return {
    label: 'Needs Work',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    ringColor: '#DC2626',
    description: 'Most shots missing key data for SG analysis',
  };
}

// ============================================================================
// QUALITY RING (SVG circular progress)
// ============================================================================

function QualityRing({
  score,
  size = 120,
  strokeWidth = 10,
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const quality = getQualityLevel(score);

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#f1f5f9"
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={quality.ringColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          className={cn('text-2xl font-bold', quality.color)}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
          {score}%
        </motion.span>
        <span className="text-xs text-warm-500 uppercase tracking-wider font-medium">
          Quality
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// FIELD COMPLETENESS BAR
// ============================================================================

function FieldBar({
  label,
  count,
  total,
  important = false,
}: {
  label: string;
  count: number;
  total: number;
  important?: boolean;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const barColor = pct >= 90 ? 'bg-green-500' : pct >= 70 ? 'bg-blue-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className={cn('text-warm-600', important && 'font-medium text-warm-800')}>
          {label}
          {important && <span className="text-red-400 ml-0.5">*</span>}
        </span>
        <span className="text-warm-500 tabular-nums">
          {pct}%
          <span className="text-warm-400 ml-1">({count}/{total})</span>
        </span>
      </div>
      <div className="h-1.5 bg-warm-100 rounded-full overflow-hidden">
        <motion.div
          className={cn('h-full rounded-full', barColor)}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function DataCompletenessCard({
  data,
  className,
  compact = false,
}: DataCompletenessCardProps) {
  const qualityScore = useMemo(() => getOverallQualityScore(data), [data]);
  const quality = useMemo(() => getQualityLevel(qualityScore), [qualityScore]);

  const sgGapPct = data.totalShots > 0
    ? Math.round(((data.totalShots - data.sgReadyShots) / data.totalShots) * 100)
    : 0;
  const showWarning = sgGapPct > 20;

  if (data.totalShots === 0) {
    return (
      <Card className={cn('', className)}>
        <CardContent className="py-8 text-center">
          <div className="w-12 h-12 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-warm-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
            </svg>
          </div>
          <p className="text-sm text-warm-500">No shot data tracked yet</p>
          <p className="text-xs text-warm-400 mt-1">Track shots during rounds to see data quality</p>
        </CardContent>
      </Card>
    );
  }

  // Compact inline version (for embedding in other dashboards)
  if (compact) {
    return (
      <div className={cn('flex items-center gap-3 p-3 rounded-xl border border-warm-200 bg-white', className)}>
        <QualityRing score={qualityScore} size={48} strokeWidth={5} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-warm-900">Data Quality</span>
            <Badge className={cn('text-xs', quality.bgColor, quality.color)}>
              {quality.label}
            </Badge>
          </div>
          <p className="text-xs text-warm-500 mt-0.5">
            {data.sgReadyShots} of {data.totalShots} shots SG-ready
          </p>
        </div>
        {showWarning && (
          <div className="text-amber-500" title="Over 20% of shots missing SG data">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
          </div>
        )}
      </div>
    );
  }

  // Full card version
  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Data Quality Score</CardTitle>
            <CardDescription>
              Completeness of shot-tracking data for SG analysis
            </CardDescription>
          </div>
          <Badge className={cn('text-xs', quality.bgColor, quality.color)}>
            {quality.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Top section: Ring + Summary */}
        <div className="flex items-center gap-6">
          <QualityRing score={qualityScore} />
          <div className="flex-1 space-y-2">
            <p className="text-sm text-warm-600">{quality.description}</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div className="flex justify-between text-warm-500">
                <span>Total Shots</span>
                <span className="font-medium text-warm-700">{data.totalShots}</span>
              </div>
              <div className="flex justify-between text-warm-500">
                <span>Rounds</span>
                <span className="font-medium text-warm-700">{data.totalRounds}</span>
              </div>
              <div className="flex justify-between text-warm-500">
                <span>SG-Ready</span>
                <span className="font-medium text-green-600">{data.sgReadyShots}</span>
              </div>
              <div className="flex justify-between text-warm-500">
                <span>Estimated</span>
                <span className="font-medium text-blue-600">{data.fallbackEstimated}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Warning banner */}
        {showWarning && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg"
          >
            <svg className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="text-xs font-medium text-amber-800">
                {sgGapPct}% of shots can&apos;t calculate Strokes Gained
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Ensure distance to hole is recorded before and after each shot for complete SG analysis.
              </p>
            </div>
          </motion.div>
        )}

        {/* Field breakdown */}
        <div>
          <h4 className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-3">
            Field Completeness
          </h4>
          <div className="space-y-2.5">
            <FieldBar label="Distance to Hole (before)" count={data.hasDistanceBefore} total={data.totalShots} important />
            <FieldBar label="Distance to Hole (after)" count={data.hasDistanceAfter} total={data.totalShots} important />
            <FieldBar label="Lie Type (before)" count={data.hasLieBefore} total={data.totalShots} important />
            <FieldBar label="Lie Type (after)" count={data.hasLieAfter} total={data.totalShots} />
            <FieldBar label="Club Used" count={data.hasClub} total={data.totalShots} />
            <FieldBar label="Shot Result" count={data.hasResult} total={data.totalShots} />
          </div>
          <p className="text-xs text-warm-400 mt-2">
            * Required for Strokes Gained calculations
          </p>
        </div>

        {/* Per-round quality breakdown */}
        {data.roundQualities && data.roundQualities.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-3">
              Recent Round Quality
            </h4>
            <div className="space-y-2">
              {data.roundQualities.slice(0, 5).map((rq) => {
                const rqLevel = getQualityLevel(rq.qualityPct);
                return (
                  <div key={rq.roundId} className="flex items-center gap-3 text-xs">
                    <span className="text-warm-400 w-16 flex-shrink-0">
                      {new Date(rq.roundDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="h-1.5 bg-warm-100 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            rq.qualityPct >= 90 ? 'bg-green-500' :
                            rq.qualityPct >= 70 ? 'bg-blue-500' :
                            rq.qualityPct >= 50 ? 'bg-amber-500' : 'bg-red-500'
                          )}
                          style={{ width: `${rq.qualityPct}%` }}
                        />
                      </div>
                    </div>
                    <span className={cn('w-8 text-right font-medium', rqLevel.color)}>
                      {rq.qualityPct}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tips for improving */}
        {qualityScore < 90 && (
          <div className="bg-warm-50 rounded-lg p-3">
            <h4 className="text-xs font-semibold text-warm-700 mb-2">Tips to Improve Data Quality</h4>
            <ul className="text-xs text-warm-600 space-y-1 ml-3 list-disc">
              {data.hasDistanceBefore < data.totalShots * 0.9 && (
                <li>Record distance to hole before each shot (GPS or rangefinder)</li>
              )}
              {data.hasDistanceAfter < data.totalShots * 0.9 && (
                <li>Track where your ball ends up — the app estimates when missing, but direct entry is more accurate</li>
              )}
              {data.hasLieBefore < data.totalShots * 0.9 && (
                <li>Always tag the lie type (tee, fairway, rough, sand, green)</li>
              )}
              {data.hasClub < data.totalShots * 0.8 && (
                <li>Select the club used for each shot to unlock club analysis</li>
              )}
              {qualityScore >= 70 && (
                <li>You&apos;re close! Focus on the starred (*) fields for the biggest SG accuracy boost</li>
              )}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// HELPER: Calculate completeness from raw shot data
// ============================================================================

export interface RawShotForCompleteness {
  id: string;
  round_id: string;
  hole_id?: string | null;
  shot_number: number;
  distance_to_hole_before?: number | null;
  distance_to_hole_after?: number | null;
  lie_before?: string | null;
  lie_after?: string | null;
  club?: string | null;
  result?: string | null;
  putt_made?: boolean | null;
}

export interface RoundMetaForCompleteness {
  id: string;
  round_date: string;
  course_name?: string | null;
}

/**
 * Compute ShotCompletenessData from raw shot + round arrays.
 * This is a pure function — can be called from server actions or client hooks.
 */
export function computeCompleteness(
  shots: RawShotForCompleteness[],
  rounds: RoundMetaForCompleteness[],
): ShotCompletenessData {
  const totalShots = shots.length;
  const totalRounds = rounds.length;

  let hasDistanceBefore = 0;
  let hasDistanceAfter = 0;
  let hasLieBefore = 0;
  let hasLieAfter = 0;
  let hasClub = 0;
  let hasResult = 0;
  let sgReadyShots = 0;
  let fallbackEstimated = 0;

  // Group shots by round for per-round quality
  const roundShotMap = new Map<string, RawShotForCompleteness[]>();

  for (const shot of shots) {
    const db = shot.distance_to_hole_before != null;
    const da = shot.distance_to_hole_after != null;
    const lb = shot.lie_before != null && shot.lie_before !== '';
    const la = shot.lie_after != null && shot.lie_after !== '';
    const cl = shot.club != null && shot.club !== '';
    const rs = shot.result != null && shot.result !== '';

    if (db) hasDistanceBefore++;
    if (da) hasDistanceAfter++;
    if (lb) hasLieBefore++;
    if (la) hasLieAfter++;
    if (cl) hasClub++;
    if (rs) hasResult++;

    // SG requires: distance_before + (distance_after OR holed) + lie_before
    const isHoled = shot.result === 'holed' || shot.result === 'hole' || shot.putt_made === true;
    const sgReady = db && lb && (da || isHoled);
    if (sgReady) sgReadyShots++;

    // Track rounds
    if (!roundShotMap.has(shot.round_id)) {
      roundShotMap.set(shot.round_id, []);
    }
    roundShotMap.get(shot.round_id)!.push(shot);
  }

  // Build per-round quality
  const roundMeta = new Map(rounds.map(r => [r.id, r]));
  const roundQualities = Array.from(roundShotMap.entries())
    .map(([roundId, roundShots]) => {
      const meta = roundMeta.get(roundId);
      const rSgReady = roundShots.filter(s => {
        const db = s.distance_to_hole_before != null;
        const lb = s.lie_before != null && s.lie_before !== '';
        const isHoled = s.result === 'holed' || s.result === 'hole' || s.putt_made === true;
        const da = s.distance_to_hole_after != null;
        return db && lb && (da || isHoled);
      }).length;

      return {
        roundId,
        roundDate: meta?.round_date || '',
        courseName: meta?.course_name || null,
        totalShots: roundShots.length,
        sgReadyShots: rSgReady,
        qualityPct: roundShots.length > 0 ? Math.round((rSgReady / roundShots.length) * 100) : 0,
      };
    })
    .sort((a, b) => b.roundDate.localeCompare(a.roundDate));

  return {
    totalShots,
    totalRounds,
    hasDistanceBefore,
    hasDistanceAfter,
    hasLieBefore,
    hasLieAfter,
    hasClub,
    hasResult,
    sgReadyShots,
    fallbackEstimated,
    roundQualities,
  };
}
