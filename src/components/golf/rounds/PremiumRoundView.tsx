'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { getRoundShotDetails, type RoundShotReviewData, type HoleReviewData } from '@/app/golf/actions/golf';
import {
  IconChevronDown,
  IconFlag,
  IconCheck,
  IconX,
  IconWarning,
  IconTarget,
  IconActivity,
  IconTrendingDown,
} from '@/components/icons';

// ============================================================================
// TYPES
// ============================================================================

interface HoleData {
  id: string;
  hole_number: number;
  par: number;
  score: number | null;
  putts: number | null;
  fairway_hit: boolean | null;
  gir: boolean | null;
  penalty_strokes: number | null;
  sand_save: boolean | null;
  up_and_down: boolean | null;
  notes: string | null;
}

interface PremiumRoundViewProps {
  roundId: string;
  playerName: string;
  playerAvatarUrl?: string | null;
  courseName: string | null;
  courseCity: string | null;
  courseState: string | null;
  roundDate: string;
  roundType: string | null;
  totalScore: number | null;
  scoreToPar: number | null;
  totalPutts: number | null;
  totalFairwaysHit: number | null;
  totalFairways: number | null;
  totalGir: number | null;
  totalGirPossible: number | null;
  frontNine: number | null;
  backNine: number | null;
  courseRating: number | null;
  courseSlope: number | null;
  teesPlayed: string | null;
  holes: HoleData[];
  notes: string | null;
}

// ============================================================================
// INSIGHT GENERATION
// ============================================================================

interface HoleInsight {
  headline: string;
  details: string[];
  severity: 'minor' | 'moderate' | 'major'; // +1, +2, +3+
  icon: 'penalty' | 'putt' | 'approach' | 'tee' | 'scramble';
}

function generateHoleInsightFromBasicData(hole: HoleData): HoleInsight | null {
  if (hole.score === null) return null;
  const overPar = hole.score - hole.par;
  if (overPar <= 0) return null;

  const severity: HoleInsight['severity'] = overPar === 1 ? 'minor' : overPar === 2 ? 'moderate' : 'major';
  const details: string[] = [];
  let headline = '';
  let icon: HoleInsight['icon'] = 'approach';

  // Penalty strokes
  if (hole.penalty_strokes && hole.penalty_strokes > 0) {
    headline = hole.penalty_strokes > 1 ? `${hole.penalty_strokes} penalty strokes` : 'Penalty stroke cost a bogey';
    icon = 'penalty';
    details.push(`${hole.penalty_strokes} penalty stroke${hole.penalty_strokes > 1 ? 's' : ''} added`);
  }

  // 3-putt or worse
  if (hole.putts && hole.putts >= 3) {
    if (!headline) headline = `${hole.putts}-putt on the green`;
    icon = 'putt';
    details.push(`${hole.putts} putts to finish the hole`);
  }

  // Missed fairway on par 4/5
  if (hole.par >= 4 && hole.fairway_hit === false) {
    details.push('Missed fairway off the tee');
    if (!headline) {
      headline = 'Missed fairway led to trouble';
      icon = 'tee';
    }
  }

  // Missed GIR
  if (hole.gir === false) {
    details.push('Failed to hit green in regulation');
    if (!headline) {
      headline = 'Missed green in regulation';
      icon = 'approach';
    }
  }

  // Failed up and down
  if (hole.up_and_down === false && hole.gir === false) {
    details.push('Failed to get up and down');
    if (!headline) {
      headline = 'Scramble attempt unsuccessful';
      icon = 'scramble';
    }
  }

  // Fallback headline
  if (!headline) {
    const scoreNames: Record<number, string> = { 1: 'Bogey', 2: 'Double bogey', 3: 'Triple bogey' };
    headline = scoreNames[overPar] || `+${overPar} on this hole`;
  }

  return { headline, details, severity, icon };
}

function generateHoleInsightFromShotData(
  hole: HoleReviewData,
): HoleInsight | null {
  if (hole.score === null) return null;
  const overPar = hole.score - hole.par;
  if (overPar <= 0) return null;

  const severity: HoleInsight['severity'] = overPar === 1 ? 'minor' : overPar === 2 ? 'moderate' : 'major';
  const details: string[] = [];
  let headline = '';
  let icon: HoleInsight['icon'] = 'approach';
  const shots = hole.shots || [];

  // Analyze penalties
  const penaltyShots = shots.filter(s => s.is_penalty);
  if (penaltyShots.length > 0) {
    const penaltyTypes = penaltyShots.map(s => {
      if (s.result === 'water') return 'water';
      if (s.result === 'ob') return 'OB';
      if (s.penalty_type) return s.penalty_type.replace(/_/g, ' ');
      return 'penalty';
    });
    headline = penaltyTypes.includes('water')
      ? 'Found the water'
      : penaltyTypes.includes('OB')
        ? 'Hit it out of bounds'
        : `Penalty: ${penaltyTypes[0]}`;
    icon = 'penalty';
    details.push(`${penaltyShots.length} penalty stroke${penaltyShots.length > 1 ? 's' : ''}`);
  }

  // Analyze tee shot
  const teeShot = shots.find(s => s.shot_type === 'tee');
  if (teeShot) {
    if (teeShot.result === 'rough' || teeShot.result === 'bunker' || teeShot.result === 'miss') {
      const missDir = teeShot.miss_direction ? ` ${teeShot.miss_direction.replace(/_/g, ' ')}` : '';
      details.push(`Tee shot found the ${teeShot.result}${missDir}`);
      if (!headline) {
        headline = `Tee shot into the ${teeShot.result}`;
        icon = 'tee';
      }
    }
    if (teeShot.result === 'water' || teeShot.result === 'ob') {
      if (!headline) {
        headline = teeShot.result === 'water' ? 'Drive found the water' : 'Drive went out of bounds';
        icon = 'penalty';
      }
    }
  }

  // Analyze approach
  const approachShots = shots.filter(s => s.shot_type === 'approach' || s.shot_type === 'layup');
  for (const approach of approachShots) {
    if (approach.result === 'bunker') {
      details.push(`Approach shot found a bunker${approach.miss_direction ? ` (${approach.miss_direction.replace(/_/g, ' ')})` : ''}`);
      if (!headline) {
        headline = 'Approach into the bunker';
        icon = 'approach';
      }
    } else if (approach.result === 'rough' || approach.result === 'miss') {
      const dir = approach.miss_direction ? ` ${approach.miss_direction.replace(/_/g, ' ')}` : '';
      details.push(`Missed green${dir} from ${approach.distance_to_hole_before || '?'} yards`);
      if (!headline) {
        headline = `Missed green from ${approach.distance_to_hole_before || '?'} yards`;
        icon = 'approach';
      }
    }
  }

  // Analyze putting
  const putts = shots.filter(s => s.shot_type === 'putt' || s.shot_type === 'putting');
  if (putts.length >= 3) {
    const firstPutt = putts[0];
    const distStr = firstPutt?.distance_to_hole_before
      ? `from ${firstPutt.distance_to_hole_before} feet`
      : '';
    details.push(`${putts.length}-putted ${distStr}`);
    if (!headline) {
      headline = `${putts.length}-putt ${distStr}`;
      icon = 'putt';
    }
  } else if (putts.length === 2) {
    const firstPutt = putts[0];
    if (firstPutt?.distance_to_hole_before && firstPutt.distance_to_hole_before <= 6) {
      details.push(`Missed short putt from ${firstPutt.distance_to_hole_before} feet`);
      if (!headline) {
        headline = `Missed ${firstPutt.distance_to_hole_before}-footer`;
        icon = 'putt';
      }
    }
  }

  // Analyze scrambling
  const chipPitchShots = shots.filter(s => ['chip', 'pitch', 'bunker'].includes(s.shot_type));
  if (chipPitchShots.length > 0 && hole.green_in_regulation === false) {
    const failedChips = chipPitchShots.filter(s => s.result !== 'green' && s.result !== 'hole' && s.result !== 'holed');
    if (failedChips.length > 0) {
      details.push('Failed to get up and down');
      if (!headline) {
        headline = 'Scramble attempt fell short';
        icon = 'scramble';
      }
    }
  }


  // Fallback
  if (!headline) {
    const scoreNames: Record<number, string> = { 1: 'Bogey', 2: 'Double bogey', 3: 'Triple bogey' };
    headline = scoreNames[overPar] || `+${overPar} on this hole`;
  }

  return { headline, details, severity, icon };
}

// ============================================================================
// INSIGHT ICON COMPONENT
// ============================================================================

function InsightIcon({ type, size = 16 }: { type: HoleInsight['icon']; size?: number }) {
  switch (type) {
    case 'penalty': return <IconWarning size={size} />;
    case 'putt': return <IconFlag size={size} />;
    case 'approach': return <IconTarget size={size} />;
    case 'tee': return <IconActivity size={size} />;
    case 'scramble': return <IconTrendingDown size={size} />;
    default: return <IconWarning size={size} />;
  }
}

// ============================================================================
// SCORE DISPLAY HELPERS
// ============================================================================

function getScoreLabel(score: number | null, par: number): string {
  if (score === null) return '--';
  const diff = score - par;
  if (diff <= -3) return `${Math.abs(diff)} Under`;
  if (diff === -2) return 'Eagle';
  if (diff === -1) return 'Birdie';
  if (diff === 0) return 'Par';
  if (diff === 1) return 'Bogey';
  if (diff === 2) return 'Double';
  if (diff === 3) return 'Triple';
  return `+${diff}`;
}

function getScoreStyles(score: number | null, par: number) {
  if (score === null) return { bg: 'bg-warm-100', text: 'text-warm-500', ring: 'ring-warm-200', dot: 'bg-warm-300' };
  const diff = score - par;
  if (diff <= -2) return { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-200', dot: 'bg-amber-400' };
  if (diff === -1) return { bg: 'bg-primary-50', text: 'text-primary-700', ring: 'ring-primary-200', dot: 'bg-primary-400' };
  if (diff === 0) return { bg: 'bg-warm-50', text: 'text-warm-600', ring: 'ring-warm-200', dot: 'bg-warm-300' };
  if (diff === 1) return { bg: 'bg-red-50', text: 'text-red-600', ring: 'ring-red-200', dot: 'bg-red-400' };
  if (diff === 2) return { bg: 'bg-red-50', text: 'text-red-700', ring: 'ring-red-300', dot: 'bg-red-500' };
  return { bg: 'bg-red-100', text: 'text-red-800', ring: 'ring-red-300', dot: 'bg-red-600' };
}

// ============================================================================
// HOLE CARD COMPONENT
// ============================================================================

function HoleCard({
  hole,
  shotData,
  index,
}: {
  hole: HoleData;
  shotData: HoleReviewData | null;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const overPar = hole.score !== null ? hole.score - hole.par : 0;
  const isBogeyPlus = overPar > 0;
  const styles = getScoreStyles(hole.score, hole.par);
  const label = getScoreLabel(hole.score, hole.par);

  const insight = useMemo(() => {
    if (!isBogeyPlus) return null;
    if (shotData && shotData.shots && shotData.shots.length > 0) {
      return generateHoleInsightFromShotData(shotData);
    }
    return generateHoleInsightFromBasicData(hole);
  }, [hole, shotData, isBogeyPlus]);

  const severityColors = {
    minor: { bg: 'bg-amber-50/80', border: 'border-amber-200/60', icon: 'text-amber-500', text: 'text-amber-800', detail: 'text-amber-600' },
    moderate: { bg: 'bg-orange-50/80', border: 'border-orange-200/60', icon: 'text-orange-500', text: 'text-orange-800', detail: 'text-orange-600' },
    major: { bg: 'bg-red-50/80', border: 'border-red-200/60', icon: 'text-red-500', text: 'text-red-800', detail: 'text-red-600' },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.3 }}
    >
      <div
        className={cn(
          'group relative rounded-2xl border transition-all duration-200',
          isBogeyPlus
            ? 'bg-white border-warm-200 shadow-sm hover:shadow-md cursor-pointer'
            : 'bg-white/60 border-warm-100 hover:bg-white/80',
          expanded && isBogeyPlus && 'shadow-md ring-1 ring-warm-200/50'
        )}
        onClick={() => isBogeyPlus && setExpanded(!expanded)}
      >
        {/* Main row */}
        <div className="flex items-center gap-4 px-5 py-4">
          {/* Hole number + score circle */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-xs font-medium text-warm-400 w-4 text-center">
              {hole.hole_number}
            </div>
            <div className={cn(
              'w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg ring-1',
              styles.bg, styles.text, styles.ring
            )}>
              {hole.score ?? '--'}
            </div>
          </div>

          {/* Par + label */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-warm-900">Par {hole.par}</span>
              <span className={cn(
                'px-2 py-0.5 rounded-full text-xs font-semibold',
                styles.bg, styles.text
              )}>
                {label}
              </span>
            </div>
            {/* Insight headline for bogey+ holes */}
            {insight && (
              <p className={cn('text-xs mt-0.5', severityColors[insight.severity].detail)}>
                {insight.headline}
              </p>
            )}
          </div>

          {/* Quick stats */}
          <div className="hidden sm:flex items-center gap-3 text-xs flex-shrink-0">
            {hole.putts !== null && (
              <div className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-lg',
                hole.putts >= 3 ? 'bg-red-50 text-red-600' : hole.putts <= 1 ? 'bg-primary-50 text-primary-600' : 'bg-warm-50 text-warm-500'
              )}>
                <IconFlag size={12} />
                <span className="font-medium">{hole.putts}</span>
              </div>
            )}
            {hole.par >= 4 && hole.fairway_hit !== null && (
              <div className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-lg',
                hole.fairway_hit ? 'bg-primary-50 text-primary-600' : 'bg-red-50 text-red-500'
              )}>
                {hole.fairway_hit ? <IconCheck size={12} /> : <IconX size={12} />}
                <span className="font-medium">FIR</span>
              </div>
            )}
            {hole.gir !== null && (
              <div className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-lg',
                hole.gir ? 'bg-primary-50 text-primary-600' : 'bg-red-50 text-red-500'
              )}>
                {hole.gir ? <IconCheck size={12} /> : <IconX size={12} />}
                <span className="font-medium">GIR</span>
              </div>
            )}
            {hole.penalty_strokes && hole.penalty_strokes > 0 && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 text-red-600">
                <IconWarning size={12} />
                <span className="font-medium">{hole.penalty_strokes}</span>
              </div>
            )}
          </div>

          {/* Expand indicator for bogey+ */}
          {isBogeyPlus && (
            <motion.div
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="text-warm-300 group-hover:text-warm-400 flex-shrink-0"
            >
              <IconChevronDown size={16} />
            </motion.div>
          )}
        </div>

        {/* Expanded insight panel - only for bogey+ holes */}
        <AnimatePresence>
          {expanded && insight && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ height: { type: 'spring', stiffness: 500, damping: 30 }, opacity: { duration: 0.2 } }}
              className="overflow-hidden"
            >
              <div className={cn(
                'mx-4 mb-4 rounded-xl border p-4',
                severityColors[insight.severity].bg,
                severityColors[insight.severity].border,
              )}>
                {/* Insight header */}
                <div className="flex items-start gap-3">
                  <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                    insight.severity === 'minor' ? 'bg-amber-100' : insight.severity === 'moderate' ? 'bg-orange-100' : 'bg-red-100'
                  )}>
                    <InsightIcon type={insight.icon} size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className={cn('text-sm font-semibold', severityColors[insight.severity].text)}>
                      What went wrong
                    </h4>
                    <p className={cn('text-sm mt-1', severityColors[insight.severity].detail)}>
                      {insight.headline}
                    </p>
                  </div>
                  <div className={cn(
                    'px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider flex-shrink-0',
                    insight.severity === 'minor' ? 'bg-amber-200/60 text-amber-700' :
                    insight.severity === 'moderate' ? 'bg-orange-200/60 text-orange-700' :
                    'bg-red-200/60 text-red-700'
                  )}>
                    +{hole.score! - hole.par}
                  </div>
                </div>

                {/* Detail bullets */}
                {insight.details.length > 0 && (
                  <div className="mt-3 space-y-1.5 pl-11">
                    {insight.details.map((detail, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <div className={cn('w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0', severityColors[insight.severity].icon.replace('text-', 'bg-'))} />
                        <span className={cn('text-xs', severityColors[insight.severity].detail)}>
                          {detail}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Mobile stats row */}
                <div className="sm:hidden mt-3 pt-3 border-t border-current/10 flex items-center gap-3 text-xs">
                  {hole.putts !== null && (
                    <span className={severityColors[insight.severity].detail}>
                      {hole.putts} putt{hole.putts !== 1 ? 's' : ''}
                    </span>
                  )}
                  {hole.par >= 4 && hole.fairway_hit !== null && (
                    <span className={severityColors[insight.severity].detail}>
                      FIR: {hole.fairway_hit ? 'Yes' : 'No'}
                    </span>
                  )}
                  {hole.gir !== null && (
                    <span className={severityColors[insight.severity].detail}>
                      GIR: {hole.gir ? 'Yes' : 'No'}
                    </span>
                  )}
                </div>

                {/* Shot data detail if available */}
                {shotData && shotData.shots && shotData.shots.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-current/10">
                    <p className={cn('text-xs font-medium uppercase tracking-wider mb-2', severityColors[insight.severity].detail)}>
                      Shot sequence
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {shotData.shots.map((shot, i) => {
                        const isProblematic = shot.is_penalty || shot.result === 'bunker' || shot.result === 'water' || shot.result === 'ob' || shot.result === 'rough';
                        return (
                          <div
                            key={i}
                            className={cn(
                              'inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium',
                              isProblematic
                                ? 'bg-white/80 text-red-600 ring-1 ring-red-200'
                                : shot.result === 'hole' || shot.result === 'holed'
                                  ? 'bg-white/80 text-primary-600 ring-1 ring-primary-200'
                                  : 'bg-white/60 text-warm-500 ring-1 ring-warm-200/60'
                            )}
                          >
                            <span className="opacity-50">{i + 1}.</span>
                            {shot.club_type && (
                              <span>{shot.club_type.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())}</span>
                            )}
                            {shot.result && (
                              <span className="opacity-60">&rarr; {shot.result}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ============================================================================
// NINE SUMMARY
// ============================================================================

function NineSummary({ holes, label }: { holes: HoleData[]; label: string }) {
  const totalPar = holes.reduce((sum, h) => sum + h.par, 0);
  const totalScore = holes.reduce((sum, h) => sum + (h.score || 0), 0);
  const bogeys = holes.filter(h => h.score !== null && h.score > h.par).length;
  const birdies = holes.filter(h => h.score !== null && h.score < h.par).length;
  const pars = holes.filter(h => h.score !== null && h.score === h.par).length;
  const toPar = totalScore - totalPar;

  return (
    <div className="flex items-center justify-between px-5 py-3 bg-warm-50/80 rounded-xl border border-warm-100">
      <span className="text-sm font-semibold text-warm-700">{label}</span>
      <div className="flex items-center gap-4 text-xs">
        {birdies > 0 && (
          <span className="text-primary-600 font-medium">{birdies} birdie{birdies !== 1 ? 's' : ''}</span>
        )}
        <span className="text-warm-500">{pars} par{pars !== 1 ? 's' : ''}</span>
        {bogeys > 0 && (
          <span className="text-red-500 font-medium">{bogeys} bogey{bogeys !== 1 ? 's' : ''}+</span>
        )}
        <div className={cn(
          'px-2.5 py-1 rounded-lg font-bold text-sm',
          toPar < 0 ? 'bg-primary-50 text-primary-700' : toPar > 0 ? 'bg-red-50 text-red-600' : 'bg-warm-100 text-warm-600'
        )}>
          {totalScore} ({toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : toPar})
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function PremiumRoundView({
  roundId,
  playerName,
  playerAvatarUrl,
  courseName,
  courseCity,
  courseState,
  roundDate,
  roundType,
  totalScore,
  scoreToPar,
  totalPutts,
  totalFairwaysHit,
  totalFairways,
  totalGir,
  totalGirPossible,
  frontNine,
  backNine,
  courseRating,
  courseSlope,
  teesPlayed,
  holes,
  notes,
}: PremiumRoundViewProps) {
  const [shotData, setShotData] = useState<RoundShotReviewData | null>(null);
  const [shotDataLoading, setShotDataLoading] = useState(true);

  // Load shot data for insights
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setShotDataLoading(true);
      const result = await getRoundShotDetails(roundId);
      if (!cancelled && result.success) {
        setShotData(result.data);
      }
      if (!cancelled) setShotDataLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [roundId]);

  const sortedHoles = useMemo(
    () => [...holes].sort((a, b) => a.hole_number - b.hole_number),
    [holes]
  );

  const frontHoles = sortedHoles.filter(h => h.hole_number <= 9);
  const backHoles = sortedHoles.filter(h => h.hole_number > 9);

  // Map shot data by hole number for quick lookup
  const shotDataByHole = useMemo(() => {
    if (!shotData?.holes) return new Map<number, HoleReviewData>();
    const map = new Map<number, HoleReviewData>();
    for (const h of shotData.holes) {
      map.set(h.hole_number, h);
    }
    return map;
  }, [shotData]);

  const scoreDisplay = scoreToPar === null || scoreToPar === undefined
    ? '--'
    : scoreToPar === 0 ? 'E' : scoreToPar > 0 ? `+${scoreToPar}` : `${scoreToPar}`;

  const scoreColor = scoreToPar === null || scoreToPar === undefined
    ? 'text-warm-600'
    : scoreToPar < 0 ? 'text-primary-600' : scoreToPar > 0 ? 'text-red-600' : 'text-warm-600';

  const totalPenalties = sortedHoles.reduce((sum, h) => sum + (h.penalty_strokes || 0), 0);
  const bogeyPlusCount = sortedHoles.filter(h => h.score !== null && h.score > h.par).length;
  const birdieCount = sortedHoles.filter(h => h.score !== null && h.score < h.par).length;

  const formattedDate = new Date(roundDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="space-y-6">
      {/* Premium Header Card */}
      <Card variant="glass" padding="none" className="overflow-hidden">
        <div className="p-6 sm:p-8">
          {/* Player info + score */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <Avatar
                src={playerAvatarUrl}
                name={playerName}
                size="xl"
              />
              <div>
                <h2 className="text-xl font-semibold text-warm-900">{playerName}</h2>
                <p className="text-sm text-warm-500 mt-0.5">{formattedDate}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm font-medium text-warm-700">{courseName}</span>
                  {courseCity && courseState && (
                    <span className="text-xs text-warm-400">{courseCity}, {courseState}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-2">
                  {roundType && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-warm-100 text-warm-600 capitalize">
                      {roundType.replace(/_/g, ' ')}
                    </span>
                  )}
                  {courseRating && (
                    <span className="text-xs text-warm-400">Rating: {courseRating}</span>
                  )}
                  {courseSlope && (
                    <span className="text-xs text-warm-400">Slope: {courseSlope}</span>
                  )}
                  {teesPlayed && (
                    <span className="text-xs text-warm-400">Tees: {teesPlayed}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Score display */}
            <div className="text-right flex-shrink-0">
              <div className="text-5xl font-bold text-warm-900 tabular-nums">
                {totalScore ?? '--'}
              </div>
              <div className={cn('text-xl font-semibold', scoreColor)}>
                {scoreDisplay}
              </div>
              {frontNine !== null && backNine !== null && (
                <p className="text-xs text-warm-400 mt-1 tabular-nums">
                  {frontNine} / {backNine}
                </p>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div className="mt-6 pt-6 border-t border-warm-200/60 grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div>
              <p className="text-xs text-warm-400 font-medium">Putts</p>
              <p className="text-xl font-semibold text-warm-900 tabular-nums">{totalPutts ?? '--'}</p>
            </div>
            <div>
              <p className="text-xs text-warm-400 font-medium">Fairways</p>
              <p className="text-xl font-semibold text-warm-900 tabular-nums">
                {totalFairwaysHit !== null && totalFairways
                  ? `${totalFairwaysHit}/${totalFairways}`
                  : '--'}
              </p>
              {totalFairwaysHit !== null && totalFairways && totalFairways > 0 && (
                <p className="text-xs text-warm-400">{Math.round((totalFairwaysHit / totalFairways) * 100)}%</p>
              )}
            </div>
            <div>
              <p className="text-xs text-warm-400 font-medium">Greens</p>
              <p className="text-xl font-semibold text-warm-900 tabular-nums">
                {totalGir !== null && totalGirPossible
                  ? `${totalGir}/${totalGirPossible}`
                  : '--'}
              </p>
              {totalGir !== null && totalGirPossible && totalGirPossible > 0 && (
                <p className="text-xs text-warm-400">{Math.round((totalGir / totalGirPossible) * 100)}%</p>
              )}
            </div>
            <div>
              <p className="text-xs text-warm-400 font-medium">Birdies</p>
              <p className="text-xl font-semibold text-primary-600 tabular-nums">{birdieCount}</p>
            </div>
            <div>
              <p className="text-xs text-warm-400 font-medium">Penalties</p>
              <p className={cn('text-xl font-semibold tabular-nums', totalPenalties > 0 ? 'text-red-600' : 'text-warm-900')}>
                {totalPenalties}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Hole-by-Hole Breakdown */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-warm-900">Hole-by-Hole</h3>
            {bogeyPlusCount > 0 && (
              <span className="text-xs text-warm-400">
                {bogeyPlusCount} hole{bogeyPlusCount !== 1 ? 's' : ''} over par &mdash; tap for insights
              </span>
            )}
          </div>
          {shotDataLoading && (
            <div className="flex items-center gap-2 text-xs text-warm-400">
              <span className="flex items-center gap-0.5">
                <span className="w-1 h-1 rounded-full bg-primary-400 skeleton-shimmer" style={{ animationDelay: '0ms' }} />
                <span className="w-1 h-1 rounded-full bg-primary-400 skeleton-shimmer" style={{ animationDelay: '150ms' }} />
                <span className="w-1 h-1 rounded-full bg-primary-400 skeleton-shimmer" style={{ animationDelay: '300ms' }} />
              </span>
              Loading shot data...
            </div>
          )}
        </div>

        {/* Front 9 */}
        {frontHoles.length > 0 && (
          <div className="space-y-2 mb-4">
            <NineSummary holes={frontHoles} label="Front 9" />
            {frontHoles.map((hole, i) => (
              <HoleCard
                key={hole.id}
                hole={hole}
                shotData={shotDataByHole.get(hole.hole_number) || null}
                index={i}
              />
            ))}
          </div>
        )}

        {/* Back 9 */}
        {backHoles.length > 0 && (
          <div className="space-y-2">
            <NineSummary holes={backHoles} label="Back 9" />
            {backHoles.map((hole, i) => (
              <HoleCard
                key={hole.id}
                hole={hole}
                shotData={shotDataByHole.get(hole.hole_number) || null}
                index={i + frontHoles.length}
              />
            ))}
          </div>
        )}

        {sortedHoles.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-warm-100 flex items-center justify-center mb-4">
              <IconFlag className="h-6 w-6 text-warm-400" />
            </div>
            <h3 className="text-lg font-medium text-warm-900 mb-2">No Scorecard Data</h3>
            <p className="text-sm text-warm-500 max-w-sm">
              This round doesn&apos;t have hole-by-hole data yet.
            </p>
          </div>
        )}
      </div>

      {/* Notes */}
      {notes && (
        <Card variant="glass">
          <div className="p-5">
            <p className="text-sm font-medium text-warm-700 mb-2">Round Notes</p>
            <p className="text-sm text-warm-600">{notes}</p>
          </div>
        </Card>
      )}
    </div>
  );
}
