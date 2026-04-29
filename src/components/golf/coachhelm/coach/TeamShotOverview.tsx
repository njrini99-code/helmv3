'use client';

import { m } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/glass-card';
import {
  IconTarget,
  IconWarning,
} from '@/components/icons';
import {
  formatShotContext,
  formatLie,
  formatDistanceRange,
} from '@/lib/coachhelm/v2/shot-analysis/format';

interface TeamShotOverviewProps {
  yardageCurve: Array<{
    rangeStart: number;
    rangeEnd: number;
    avgSG: number;
    shotCount: number;
  }>;
  deadZones: Array<{
    rangeStart: number;
    rangeEnd: number;
    deficit: number;
  }>;
  topWeaknesses: Array<{
    context: string;
    lie: string;
    distanceRange: string;
    avgSG: number;
    shotCount: number;
  }>;
}

function isDeadZone(
  rangeStart: number,
  rangeEnd: number,
  deadZones: TeamShotOverviewProps['deadZones'],
): boolean {
  return deadZones.some(
    (dz) => dz.rangeStart === rangeStart && dz.rangeEnd === rangeEnd,
  );
}

function getMaxAbsSG(buckets: TeamShotOverviewProps['yardageCurve']): number {
  if (!buckets.length) return 1;
  return Math.max(
    ...buckets.map((b) => Math.abs(Number(b.avgSG))),
    0.1,
  );
}

export function TeamShotOverview({
  yardageCurve,
  deadZones,
  topWeaknesses,
}: TeamShotOverviewProps) {
  const hasSomething = yardageCurve.length > 0 || topWeaknesses.length > 0;

  if (!hasSomething) {
    return (
      <GlassCard className="relative overflow-hidden" glow="subtle">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary-400 via-primary-500 to-primary-600" />
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <IconTarget size={32} className="text-warm-300 mb-3" />
          <p className="text-sm font-medium text-warm-500">No team shot analysis available</p>
          <p className="text-xs text-warm-400 mt-1">Players need to log rounds with shot data to unlock this view</p>
        </div>
      </GlassCard>
    );
  }

  const maxAbsSG = getMaxAbsSG(yardageCurve);

  return (
    <GlassCard className="relative overflow-hidden" glow="subtle">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary-400 via-primary-500 to-primary-600" />

      <div className="space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
              <IconTarget size={20} className="text-primary-600" />
            </div>
            <div>
              <h3 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em]">Team Shot Analysis</h3>
              <p className="text-xs text-warm-400">Aggregated across all team players</p>
            </div>
          </div>
        </div>

        {/* Yardage curve */}
        {yardageCurve.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-warm-700">Yardage Performance</p>
            <div className="space-y-1.5">
              {yardageCurve.map((bucket, i) => {
                const isDead = isDeadZone(bucket.rangeStart, bucket.rangeEnd, deadZones);
                const barWidth = Math.abs(Number(bucket.avgSG)) / maxAbsSG * 50;
                const isPositive = Number(bucket.avgSG) >= 0;

                return (
                  <m.div
                    key={`${bucket.rangeStart}-${bucket.rangeEnd}`}
                    className={cn(
                      'flex items-center gap-2 px-2 py-1.5 rounded-lg',
                      isDead ? 'bg-red-50/80' : '',
                    )}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <span className="text-xs font-medium text-warm-600 w-20 shrink-0 tabular-nums">
                      {Number(bucket.rangeStart)}-{Number(bucket.rangeEnd)}y
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
                        isPositive ? 'text-primary-600' : 'text-red-500',
                      )}
                    >
                      {isPositive ? '+' : ''}{Number(bucket.avgSG).toFixed(2)}
                    </span>

                    <span className="text-xs text-warm-400 tabular-nums w-10 text-right shrink-0">
                      {Number(bucket.shotCount)}
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

        {/* Dead zones callout */}
        {deadZones.length > 0 && (
          <div className="px-3 py-2 rounded-xl bg-red-50 border border-red-200">
            <p className="text-xs font-medium text-red-700 mb-1">Dead Zones</p>
            <div className="flex flex-wrap gap-2">
              {deadZones.map((dz) => (
                <span
                  key={`${dz.rangeStart}-${dz.rangeEnd}`}
                  className="inline-flex items-center gap-1 text-xs text-red-600 tabular-nums"
                >
                  {Number(dz.rangeStart)}-{Number(dz.rangeEnd)}y
                  <span className="text-red-400">({Number(dz.deficit).toFixed(2)} deficit)</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Top weaknesses */}
        {topWeaknesses.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-warm-700">Key Weaknesses</p>
            <div className="grid gap-2">
              {topWeaknesses.slice(0, 3).map((weakness, i) => (
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
                      {Number(weakness.avgSG).toFixed(2)}
                    </p>
                    <p className="text-xs text-warm-400 tabular-nums">
                      {Number(weakness.shotCount)} shots
                    </p>
                  </div>
                </m.div>
              ))}
            </div>
          </div>
        )}
      </div>
    </GlassCard>
  );
}
