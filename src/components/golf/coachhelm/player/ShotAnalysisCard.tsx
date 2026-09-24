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
import { formatMetric, formatMetricText } from '@/lib/golf/metrics/display-registry';

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

/** getPlayerShotContext reads the last 90 days (its periodDays default). */
const SCRAMBLE_WINDOW = 'last_90_days' as const;

/**
 * The engine's scramble rate (0–1 fraction, or a ScrambleAnalysis whose
 * `.scrambleRate` is null with no attempts) as a 0–100 percent. Null stays
 * null: no attempts is "no data", never 0%.
 */
export function resolveScramblePercent(raw: unknown): number | undefined {
  const value =
    typeof raw === 'object' && raw !== null
      ? (raw as Record<string, unknown>).scrambleRate
      : raw;
  if (value == null) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  // A value above 1 cannot be a fraction, so it is already a percent.
  return n > 1 ? n : n * 100;
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
  // shotData.scrambleRate may be a ScrambleAnalysis object (with a
  // .scrambleRate field that is NULL when there were no scramble attempts) or
  // a raw number. Both are the engine's 0–1 fraction (calculateScrambleRate).
  const resolvedScrambleRate = resolveScramblePercent(scrambleRate ?? shotData?.scrambleRate);
  // Same 0–1 contract; unwired today (no caller supplies it).
  const resolvedTeamScrambleRate = resolveScramblePercent(teamScrambleRate ?? shotData?.teamScrambleRate);
  const scramble =
    resolvedScrambleRate != null
      ? formatMetric('scrambling_pct', resolvedScrambleRate, { window: SCRAMBLE_WINDOW })
      : null;
  const teamScramble =
    resolvedTeamScrambleRate != null ? formatMetric('scrambling_pct', resolvedTeamScrambleRate) : null;
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
  // Only a genuinely negative avgSG is a weakness. The server-ranked list is
  // sorted ascending by severity but never filters out a positive average —
  // for a strong player where every context clears the sample-size bar, the
  // "least good, still positive" contexts would otherwise render red under
  // "Key Weaknesses" with an unsigned number that reads as a loss.
  const rankedWeaknesses = resolvedWeaknesses?.length
    ? rankWeaknesses(resolvedWeaknesses).filter((w) => Number(w.avgSG ?? 0) < 0)
    : [];
  const topWeaknesses = rankedWeaknesses.slice(0, 3);
  const hasWeaknessData = !!resolvedWeaknesses?.length;

  return (
    <InstrumentPanel depth="base" className={className} eyebrow="Deep dive" header="Shot Analysis">
      <div className="space-y-6">
        {/* Yardage curve */}
        {resolvedYardageCurve?.buckets && resolvedYardageCurve.buckets.length > 0 && (
          <div className="space-y-2">
            <p className="text-body-sm font-medium text-text-secondary">Approach by distance</p>
            <p className="text-caption text-text-secondary">
              Shot-level strokes gained per approach shot, last 90 days. Tee shots and putts are left out.
            </p>
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
                    <span className="w-20 shrink-0 text-caption tabular-nums text-text-secondary">
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
                        'w-12 shrink-0 text-right text-caption tabular-nums',
                        isPositive ? 'text-fw-success-ink' : 'text-fw-danger-ink'
                      )}
                    >
                      {formatMetricText('sg_approach', Number(bucket.avgSG ?? 0))}
                    </span>

                    <span className="w-8 shrink-0 text-right text-caption tabular-nums text-text-tertiary">
                      {bucket.shotCount}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-end gap-4 pt-1 text-caption text-text-tertiary">
              <span>SG a shot</span>
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
              <p className="mb-1 text-caption font-medium text-fw-danger-ink">Dead Zones</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {resolvedDeadZones.map((dz) => (
                  <span
                    key={`${dz.rangeStart}-${dz.rangeEnd}`}
                    className="inline-flex items-center gap-1 text-caption tabular-nums text-fw-danger-ink"
                  >
                    {dz.rangeStart}-{dz.rangeEnd}y
                    <span>({formatMetricText('sg_approach', -Math.abs(Number(dz.deficit ?? 0)))} a shot)</span>
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-fw-md border border-border-subtle bg-fw-success-bg px-3 py-2.5">
              <p className="mb-0.5 text-caption font-medium text-fw-success-ink">No dead zones</p>
              <p className="text-caption text-text-secondary">
                Yardage performance is consistent, no distance range is bleeding strokes.
              </p>
            </div>
          )
        )}

        {/* Top weaknesses — always rendered when we have weakness data, so a
            player whose ranked contexts are all net-positive sees an honest
            confirmation instead of the section silently disappearing. */}
        {hasWeaknessData && (
          <div className="space-y-2">
            <p className="text-body-sm font-medium text-text-secondary">Key Weaknesses</p>
            {/* NUM-27: these counts are shot-tracked shots over the last 90
                days, not the all-rounds putting attempts Stats shows. */}
            <p className="text-caption text-text-secondary">Shot-tracked shots, last 90 days.</p>
            {topWeaknesses.length === 0 ? (
              <div className="rounded-fw-md border border-border-subtle bg-fw-success-bg px-3 py-2.5">
                <p className="text-caption text-text-secondary">
                  No net-negative contexts — every tracked situation is at or above par.
                </p>
              </div>
            ) : (
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
                      <p className="text-body-sm font-medium tabular-nums text-fw-danger-ink">
                        {formatMetricText('sg_total', Number(weakness.avgSG ?? 0))}
                      </p>
                      <p className="text-caption tabular-nums text-text-tertiary">
                        {weakness.shotCount} shots
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
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
                    Number(safeResilience ?? 0) >= 1.0 ? 'text-fw-success-ink' : 'text-fw-warning-ink'
                  )}
                >
                  {Number(safeResilience ?? 0) >= 1.0 ? 'Good recovery' : 'Compounds errors'}
                </p>
              </div>
            )}

            {/* Scramble rate: ONE readout (the duplicated box + line is gone,
                DD-01), with its window named. This is the live 90-day read
                (calculateScrambleRate); Stats and the Fingerprint show the
                all-rounds cache value, so the chip is what keeps the two
                numbers from reading as a contradiction (NUM-20). */}
            {scramble != null && !scramble.missing && (
              <div
                className="flex items-center gap-3 rounded-fw-md border border-border-subtle bg-surface-sunken p-3"
                data-slot="deep-dive-scramble"
              >
                <div>
                  <p className="text-body-sm font-medium text-text-primary">
                    {scramble.label}
                    {scramble.windowChip ? ` · ${scramble.windowChip}` : ''}
                  </p>
                  <p className="text-caption text-text-secondary">
                    <span className="text-body font-semibold tabular-nums text-text-primary">
                      {scramble.text}
                    </span>
                    {teamScramble != null && !teamScramble.missing && (
                      <span className="text-text-secondary">
                        {' '}(team avg: {teamScramble.text})
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
