'use client';

/**
 * ============================================================================
 * ShotAnalysisCard — the deep-dive shot instrument (Fairway rebuild, #969/#970/#972)
 * ----------------------------------------------------------------------------
 * #969 — the last piece of legacy chrome in the deep-dive tab: `Card
 * variant="overlay"`, raw divs, a bespoke inline SVG resilience ring. Rebuilt
 * in the Fairway kit (InstrumentPanel bezel + the `Dial` gauge primitive) to
 * match the rest of the cockpit.
 *
 * #970 — the old resilience ring drew its track with `stroke-warm-100`
 * (near-invisible on cream), so a partial fill read as a broken arc. `Dial`
 * always renders a visible faint track regardless of value.
 *
 * #972 — this card's `shotData` (getPlayerShotContext, coachhelm-data.ts,
 * 90-day default window) is a DIFFERENT loader/window than the cockpit's
 * `initialShotAnalytics` (getPlayerShotAnalytics, shot-analytics.ts — fixed to
 * widen to the same 90-day window instead of reporting a false "no rounds").
 * This card also adds a minimum-sample guard on Key Weaknesses: a 5-6 shot
 * band should never outrank a genuinely large (100+ shot) signal just because
 * its small-sample average happens to look worse.
 * ========================================================================== */

import { cn } from '@/lib/utils';
import { InstrumentPanel } from '@/components/fairway/instrument/InstrumentPanel';
import { Dial } from '@/components/fairway/charts/Dial';
import { InsufficientData } from '@/components/fairway/feedback/InsufficientData';
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
  className?: string;
}

// #972 — a band with fewer than this many shots is too thin to trust on its
// own. It can still SHOW (nothing here is hidden), but it is never allowed to
// outrank a robustly-sampled band purely because a handful of shots produced
// a dramatic average. Stable-sorted below any band that clears the bar.
const MIN_WEAKNESS_SAMPLE_SIZE = 8;

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

/**
 * #972 — rank robustly-sampled weaknesses ahead of thin-sample ones. A stable
 * sort (guaranteed by the ES2019 spec) preserves the server's original
 * severity ordering *within* each tier, so this only demotes thin rows —
 * it never reorders on magnitude itself.
 */
function rankWeaknesses(
  weaknesses: NonNullable<ShotAnalysisCardProps['weaknesses']>,
): NonNullable<ShotAnalysisCardProps['weaknesses']> {
  return [...weaknesses].sort((a, b) => {
    const aThin = a.shotCount < MIN_WEAKNESS_SAMPLE_SIZE ? 1 : 0;
    const bThin = b.shotCount < MIN_WEAKNESS_SAMPLE_SIZE ? 1 : 0;
    return aThin - bThin;
  });
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
  className,
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
      <InstrumentPanel depth="base" className={className} eyebrow="Deep dive" header="Shot Analysis">
        <InsufficientData
          title="No shot analysis yet"
          description="Log more rounds to unlock shot insights."
          unit="rounds"
        />
      </InstrumentPanel>
    );
  }

  const maxAbsSG = getMaxAbsSG(resolvedYardageCurve);
  const rankedWeaknesses = resolvedWeaknesses?.length ? rankWeaknesses(resolvedWeaknesses) : [];
  const topWeaknesses = rankedWeaknesses.slice(0, 3);

  return (
    <InstrumentPanel depth="base" className={className} eyebrow="Deep dive" header="Shot Analysis">
      <div className="space-y-6">
        {/* Yardage curve */}
        {resolvedYardageCurve?.buckets && resolvedYardageCurve.buckets.length > 0 && (
          <div className="space-y-2">
            <p className="text-body-sm font-medium text-text-secondary">Yardage Performance</p>
            <div className="space-y-1.5">
              {resolvedYardageCurve.buckets.map((bucket) => {
                const isDead = isDeadZone(bucket.rangeStart, bucket.rangeEnd, resolvedDeadZones);
                const barWidth = Math.abs(Number(bucket.avgSG ?? 0)) / maxAbsSG * 50;
                const isPositive = Number(bucket.avgSG ?? 0) >= 0;

                return (
                  <div
                    key={`${bucket.rangeStart}-${bucket.rangeEnd}`}
                    className={cn(
                      'flex items-center gap-2 rounded-fw-sm px-2 py-1.5',
                      isDead && 'bg-fw-danger-bg'
                    )}
                  >
                    <span className="w-20 shrink-0 font-fw-mono text-caption tabular-nums text-text-secondary">
                      {bucket.rangeStart}-{bucket.rangeEnd}y
                    </span>

                    {/* Bar chart centered */}
                    <div className="flex h-4 flex-1 items-center">
                      <div className="flex w-1/2 justify-end">
                        {!isPositive && (
                          <div
                            className="h-3 rounded-l-sm bg-fw-danger"
                            style={{ width: `${barWidth}%` }}
                          />
                        )}
                      </div>
                      <div className="h-4 w-px shrink-0 bg-border-subtle" />
                      <div className="w-1/2">
                        {isPositive && (
                          <div
                            className="h-3 rounded-r-sm bg-accent-500"
                            style={{ width: `${barWidth}%` }}
                          />
                        )}
                      </div>
                    </div>

                    <span
                      className={cn(
                        'w-12 shrink-0 text-right font-fw-mono text-caption tabular-nums',
                        isPositive ? 'text-fw-success' : 'text-fw-danger'
                      )}
                    >
                      {isPositive ? '+' : ''}{Number(bucket.avgSG ?? 0).toFixed(2)}
                    </span>

                    <span className="w-8 shrink-0 text-right font-fw-mono text-caption tabular-nums text-text-tertiary">
                      {bucket.shotCount}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-end gap-4 pt-1 text-caption text-text-tertiary">
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
            <div className="rounded-fw-md border border-border-subtle bg-fw-danger-bg px-3 py-2.5">
              <p className="mb-1 text-caption font-medium text-fw-danger">Dead Zones</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {resolvedDeadZones.map((dz) => (
                  <span
                    key={`${dz.rangeStart}-${dz.rangeEnd}`}
                    className="inline-flex items-center gap-1 font-fw-mono text-caption tabular-nums text-fw-danger"
                  >
                    {dz.rangeStart}-{dz.rangeEnd}y
                    <span className="opacity-80">({Number(dz.deficit ?? 0).toFixed(2)} deficit)</span>
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-fw-md border border-border-subtle bg-fw-success-bg px-3 py-2.5">
              <p className="mb-0.5 text-caption font-medium text-fw-success">No dead zones</p>
              <p className="text-caption text-text-secondary">
                Yardage performance is consistent, no distance range is bleeding strokes.
              </p>
            </div>
          )
        )}

        {/* Top weaknesses */}
        {topWeaknesses.length > 0 && (
          <div className="space-y-2">
            <p className="text-body-sm font-medium text-text-secondary">Key Weaknesses</p>
            <div className="grid gap-2">
              {topWeaknesses.map((weakness, i) => {
                const thin = weakness.shotCount < MIN_WEAKNESS_SAMPLE_SIZE;
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-fw-md border border-border-subtle bg-surface-sunken p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-body-sm font-medium text-text-primary">
                        {formatShotContext({
                          lie: weakness.lie,
                          distanceRange: weakness.distanceRange,
                          context: weakness.context,
                        })}
                      </p>
                      <p className="text-caption text-text-tertiary">
                        {formatLie(weakness.lie)} · {formatDistanceRange(weakness.distanceRange, weakness.lie)}
                        {thin ? ' · small sample' : ''}
                      </p>
                    </div>
                    <div className="ml-3 shrink-0 text-right">
                      <p className="font-fw-mono text-body-sm font-medium tabular-nums text-fw-danger">
                        {Number(weakness.avgSG ?? 0).toFixed(2)}
                      </p>
                      <p className="font-fw-mono text-caption tabular-nums text-text-tertiary">
                        {weakness.shotCount} shots
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Bottom row: Resilience + Scramble */}
        {(safeResilience != null || resolvedScrambleRate != null) && (
          <div className="grid grid-cols-1 gap-3 border-t border-border-subtle pt-4 sm:grid-cols-2">
            {/* Resilience */}
            {safeResilience != null && (
              <div className="flex items-center gap-3 rounded-fw-md border border-border-subtle bg-surface-sunken p-3">
                <Dial
                  label="Resilience"
                  value={Math.min(Number(safeResilience ?? 0) / 2, 1)}
                  benchmark={0.5}
                  goodDirection="up"
                  valueFormatter={() => Number(safeResilience ?? 0).toFixed(1)}
                  size={88}
                />
                <p
                  className={cn(
                    'text-caption font-medium',
                    Number(safeResilience ?? 0) >= 1.0 ? 'text-fw-success' : 'text-fw-warning'
                  )}
                >
                  {Number(safeResilience ?? 0) >= 1.0 ? 'Good recovery' : 'Compounds errors'}
                </p>
              </div>
            )}

            {/* Scramble rate */}
            {resolvedScrambleRate != null && (
              <div className="flex items-center gap-3 rounded-fw-md border border-border-subtle bg-surface-sunken p-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-fw-md bg-accent-50 text-accent-700">
                  <span className="font-fw-mono text-caption font-semibold tabular-nums">
                    {Number(resolvedScrambleRate ?? 0).toFixed(0)}%
                  </span>
                </div>
                <div>
                  <p className="text-body-sm font-medium text-text-primary">Scramble Rate</p>
                  <p className="text-caption text-text-secondary">
                    <span className="font-fw-mono font-medium tabular-nums text-text-primary">
                      {Number(resolvedScrambleRate ?? 0).toFixed(0)}%
                    </span>
                    {resolvedTeamScrambleRate != null && (
                      <span className="text-text-tertiary">
                        {' '}(team avg: {resolvedTeamScrambleRate}%)
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </InstrumentPanel>
  );
}
