'use client';

import { m } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/glass-card';
import {
  IconTarget,
  IconWarning,
  IconActivity,
} from '@/components/icons';
import {
  formatShotContext,
  formatLie,
  formatDistanceRange,
} from '@/lib/coachhelm/v2/shot-analysis/format';

interface ShotAnalysisCardProps {
  // Typed props (used when data is pre-parsed)
  yardageCurve?: {
    buckets: Array<{
      rangeStart: number;
      rangeEnd: number;
      avgSG: number;
      shotCount: number;
      greenHitRate: number;
    }>;
  };
  deadZones?: Array<{
    rangeStart: number;
    rangeEnd: number;
    deficit: number;
    shotCount: number;
  }>;
  weaknesses?: Array<{
    context: string;
    lie: string;
    distanceRange: string;
    avgSG: number;
    shotCount: number;
  }>;
  resilience?: number;
  scrambleRate?: number;
  teamScrambleRate?: number;
  // Raw data prop (from server action — parsed internally)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  shotData?: Record<string, any>;
  playerId?: string;
}

function isDeadZone(
  rangeStart: number,
  rangeEnd: number,
  deadZones: ShotAnalysisCardProps['deadZones']
): boolean {
  if (!deadZones) return false;
  return deadZones.some(
    (dz) => dz.rangeStart === rangeStart && dz.rangeEnd === rangeEnd
  );
}

function getMaxAbsSG(buckets: ShotAnalysisCardProps['yardageCurve']): number {
  if (!buckets?.buckets.length) return 1;
  return Math.max(
    ...buckets.buckets.map((b) => Math.abs(b.avgSG)),
    0.1
  );
}

export function ShotAnalysisCard({
  yardageCurve,
  deadZones,
  weaknesses,
  resilience,
  scrambleRate,
  teamScrambleRate,
  shotData,
  playerId: _playerId,
}: ShotAnalysisCardProps) {
  // Resolve props: prefer typed props, fall back to parsing from shotData
  const resolvedYardageCurve = yardageCurve ?? (shotData?.yardageCurve as typeof yardageCurve | undefined);
  const resolvedDeadZones = deadZones ?? (shotData?.deadZones as typeof deadZones | undefined);
  const resolvedWeaknesses = weaknesses ?? (shotData?.weaknesses as typeof weaknesses | undefined);
  // shotData.resilience may be a SequenceAnalysis object (with .resilienceScore) or a raw number
  const rawResilience = resilience ?? shotData?.resilience;
  const parsedResilience = typeof rawResilience === 'object' && rawResilience !== null
    ? Number((rawResilience as Record<string, unknown>).resilienceScore ?? 0)
    : rawResilience != null ? Number(rawResilience) : undefined;
  // Guard against NaN
  const safeResilience = parsedResilience != null && !isNaN(parsedResilience) ? parsedResilience : undefined;
  // shotData.scrambleRate may be a ScrambleAnalysis object (with .scrambleRate field) or a raw number
  const rawScramble = scrambleRate ?? shotData?.scrambleRate;
  const rawScrambleValue = typeof rawScramble === 'object' && rawScramble !== null
    ? Number((rawScramble as Record<string, unknown>).scrambleRate ?? 0)
    : rawScramble != null ? Number(rawScramble) : undefined;
  // scrambleRate from the engine is a 0-1 fraction; convert to 0-100 for display
  const resolvedScrambleRate = rawScrambleValue != null && !isNaN(rawScrambleValue)
    ? (rawScrambleValue <= 1 ? rawScrambleValue * 100 : rawScrambleValue)
    : undefined;
  const resolvedTeamScrambleRate = teamScrambleRate ?? (shotData?.teamScrambleRate != null ? Number(shotData.teamScrambleRate) : undefined);
  const hasSomething = resolvedYardageCurve?.buckets?.length || resolvedWeaknesses?.length || safeResilience != null || resolvedScrambleRate != null;

  if (!hasSomething) {
    return (
      <GlassCard className="relative overflow-hidden" glow="subtle">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary-400 via-primary-500 to-primary-600" />
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <IconTarget size={32} className="text-warm-300 mb-3" />
          <p className="text-sm font-medium text-warm-500">No shot analysis available</p>
          <p className="text-xs text-warm-400 mt-1">Log more rounds to unlock shot insights</p>
        </div>
      </GlassCard>
    );
  }

  const maxAbsSG = getMaxAbsSG(resolvedYardageCurve);
  const topWeaknesses = resolvedWeaknesses?.slice(0, 3) ?? [];

  return (
    <GlassCard className="relative overflow-hidden" glow="subtle">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary-400 via-primary-500 to-primary-600" />

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
            <IconTarget size={20} className="text-primary-600" />
          </div>
          <h3 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em]">Shot Analysis</h3>
        </div>

        {/* Yardage curve */}
        {resolvedYardageCurve?.buckets && resolvedYardageCurve.buckets.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-warm-700">Yardage Performance</p>
            <div className="space-y-1.5">
              {resolvedYardageCurve.buckets.map((bucket, i) => {
                const isDead = isDeadZone(bucket.rangeStart, bucket.rangeEnd, resolvedDeadZones);
                const barWidth = Math.abs(Number(bucket.avgSG ?? 0)) / maxAbsSG * 50;
                const isPositive = Number(bucket.avgSG ?? 0) >= 0;

                return (
                  <m.div
                    key={`${bucket.rangeStart}-${bucket.rangeEnd}`}
                    className={cn(
                      'flex items-center gap-2 px-2 py-1.5 rounded-lg',
                      isDead ? 'bg-red-50/80' : ''
                    )}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <span className="text-xs font-medium text-warm-600 w-20 shrink-0 tabular-nums">
                      {bucket.rangeStart}-{bucket.rangeEnd}y
                    </span>

                    {/* Bar chart centered */}
                    <div className="flex-1 flex items-center h-4">
                      <div className="w-1/2 flex justify-end">
                        {!isPositive && (
                          <m.div
                            className="h-3 rounded-l-sm bg-red-400"
                            initial={{ width: 0 }}
                            animate={{ width: `${barWidth}%` }}
                            transition={{ duration: 0.6, delay: 0.2 + i * 0.05 }}
                          />
                        )}
                      </div>
                      <div className="w-px h-4 bg-warm-300 shrink-0" />
                      <div className="w-1/2">
                        {isPositive && (
                          <m.div
                            className="h-3 rounded-r-sm bg-primary-500"
                            initial={{ width: 0 }}
                            animate={{ width: `${barWidth}%` }}
                            transition={{ duration: 0.6, delay: 0.2 + i * 0.05 }}
                          />
                        )}
                      </div>
                    </div>

                    <span
                      className={cn(
                        'text-xs font-medium tabular-nums w-12 text-right shrink-0',
                        isPositive ? 'text-primary-600' : 'text-red-500'
                      )}
                    >
                      {isPositive ? '+' : ''}{Number(bucket.avgSG ?? 0).toFixed(2)}
                    </span>

                    <span className="text-xs text-warm-400 tabular-nums w-8 text-right shrink-0">
                      {bucket.shotCount}
                    </span>

                    {isDead && (
                      <IconWarning size={12} className="text-red-400 shrink-0" />
                    )}
                  </m.div>
                );
              })}
            </div>
            <div className="flex items-center justify-end gap-4 text-xs text-warm-400 pt-1">
              <span>SG = Strokes Gained</span>
              <span># = Shots</span>
            </div>
          </div>
        )}

        {/* Dead zones callout — always rendered when we have yardage data, so
            a strong player sees a positive confirmation rather than the
            section silently disappearing. */}
        {resolvedYardageCurve?.buckets && resolvedYardageCurve.buckets.length > 0 && (
          resolvedDeadZones && resolvedDeadZones.length > 0 ? (
            <div className="px-3 py-2 rounded-xl bg-red-50 border border-red-200">
              <p className="text-xs font-medium text-red-700 mb-1">Dead Zones</p>
              <div className="flex flex-wrap gap-2">
                {resolvedDeadZones.map((dz) => (
                  <span
                    key={`${dz.rangeStart}-${dz.rangeEnd}`}
                    className="inline-flex items-center gap-1 text-xs text-red-600 tabular-nums"
                  >
                    {dz.rangeStart}-{dz.rangeEnd}y
                    <span className="text-red-400">({Number(dz.deficit ?? 0).toFixed(2)} deficit)</span>
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="px-3 py-2 rounded-xl bg-emerald-50/60 border border-emerald-200/60">
              <p className="text-xs font-medium text-emerald-700 mb-0.5">No dead zones</p>
              <p className="text-xs text-emerald-600/80">
                Yardage performance is consistent — no distance range is bleeding strokes.
              </p>
            </div>
          )
        )}

        {/* Top weaknesses */}
        {topWeaknesses.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-warm-700">Key Weaknesses</p>
            <div className="grid gap-2">
              {topWeaknesses.map((weakness, i) => (
                <m.div
                  key={i}
                  className="flex items-center justify-between p-3 rounded-xl bg-white/40 border border-white/20"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-warm-800 truncate">
                      {formatShotContext({
                        lie: weakness.lie,
                        distanceRange: weakness.distanceRange,
                        context: weakness.context,
                      })}
                    </p>
                    <p className="text-xs text-warm-500">
                      {formatLie(weakness.lie)} &middot; {formatDistanceRange(weakness.distanceRange, weakness.lie)}
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-sm font-medium text-red-500 tabular-nums">
                      {Number(weakness.avgSG ?? 0).toFixed(2)}
                    </p>
                    <p className="text-xs text-warm-400 tabular-nums">
                      {weakness.shotCount} shots
                    </p>
                  </div>
                </m.div>
              ))}
            </div>
          </div>
        )}

        {/* Bottom row: Resilience + Scramble */}
        {(safeResilience != null || resolvedScrambleRate != null) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/10">
            {/* Resilience */}
            {safeResilience != null && (
              <m.div
                className="flex items-center gap-3 p-3 rounded-xl bg-white/40 border border-white/20"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
              >
                <div className="relative w-12 h-12 shrink-0">
                  <svg viewBox="0 0 48 48" className="w-12 h-12 -rotate-90">
                    <circle
                      cx="24"
                      cy="24"
                      r="18"
                      fill="none"
                      strokeWidth="4"
                      className="stroke-warm-100"
                    />
                    <circle
                      cx="24"
                      cy="24"
                      r="18"
                      fill="none"
                      strokeWidth="4"
                      strokeLinecap="round"
                      className={Number(safeResilience ?? 0) >= 1.0 ? 'stroke-primary-500' : 'stroke-amber-500'}
                      strokeDasharray={2 * Math.PI * 18}
                      strokeDashoffset={2 * Math.PI * 18 * (1 - Math.min(Number(safeResilience ?? 0) / 2, 1))}
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[11px] font-medium text-warm-900 tabular-nums">
                    {Number(safeResilience ?? 0).toFixed(1)}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-warm-800">Resilience</p>
                  <p className={cn(
                    'text-xs font-medium',
                    Number(safeResilience ?? 0) >= 1.0 ? 'text-primary-600' : 'text-amber-600'
                  )}>
                    {Number(safeResilience ?? 0) >= 1.0 ? 'Good recovery' : 'Compounds errors'}
                  </p>
                </div>
              </m.div>
            )}

            {/* Scramble rate */}
            {resolvedScrambleRate != null && (
              <m.div
                className="flex items-center gap-3 p-3 rounded-xl bg-white/40 border border-white/20"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
              >
                <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center shrink-0">
                  <IconActivity size={20} className="text-primary-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-warm-800">Scramble Rate</p>
                  <p className="text-xs text-warm-600">
                    <span className="font-medium text-warm-900 tabular-nums">{Number(resolvedScrambleRate ?? 0).toFixed(0)}%</span>
                    {resolvedTeamScrambleRate != null && (
                      <span className="text-warm-400">
                        {' '}(team avg: {resolvedTeamScrambleRate}%)
                      </span>
                    )}
                  </p>
                </div>
              </m.div>
            )}
          </div>
        )}
      </div>
    </GlassCard>
  );
}
