'use client';

/**
 * ============================================================================
 * ShotAnalysisCard — the deep-dive shot instrument (Fairway rebuild, #969/#970/#972)
 * ----------------------------------------------------------------------------
 * DD-01 — one ledger, no gauges: the approach bands are a DistanceLadder,
 * Resilience is a number with its meaning in words (it used to be a Dial with
 * no scale), dead zones are named rather than washed in red, and scrambling
 * prints once.
 *
 * #972 — this card's `shotData` (getPlayerShotContext, coachhelm-data.ts,
 * 90-day default window) is a DIFFERENT loader/window than the cockpit's
 * `initialShotAnalytics` (getPlayerShotAnalytics, shot-analytics.ts — fixed to
 * widen to the same 90-day window instead of reporting a false "no rounds").
 * This card also adds a minimum-sample guard on Key Weaknesses: a 5-6 shot
 * band should never outrank a genuinely large (100+ shot) signal just because
 * its small-sample average happens to look worse.
 * ========================================================================== */

import { InstrumentPanel } from '@/components/fairway/instrument/InstrumentPanel';
import { DistanceLadder } from './DistanceLadder';
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

const RESILIENCE_FORMAT = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Resilience (sequence-analysis.ts): 1.0 means a bad shot does not change the
 * next one; below 1.0 the next shot gets worse, above it the player bounces
 * back. Said in words so the number never stands alone (NUM-30).
 */
function resilienceWord(value: number): string {
  if (value >= 1.05) return 'Bounces back after a bad shot';
  if (value > 0.95) return 'A bad shot does not carry over';
  return 'One bad shot tends to lead to another';
}

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
      <InstrumentPanel depth="base" className={className} header="Shot analysis">
        <InsufficientData
          title="No shot analysis yet"
          description="Log more rounds to unlock shot insights."
          unit="rounds"
        />
      </InstrumentPanel>
    );
  }

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
    <InstrumentPanel depth="base" className={className} header="Shot analysis">
      <div className="space-y-6">
        {resolvedYardageCurve?.buckets && resolvedYardageCurve.buckets.length > 0 && (
          <DistanceLadder
            bands={resolvedYardageCurve.buckets}
            deadZones={resolvedDeadZones}
            windowLabel="last 90 days"
          />
        )}

        {/* Top weaknesses — always rendered when we have weakness data, so a
            player whose ranked contexts are all net-positive sees an honest
            confirmation instead of the section silently disappearing. */}
        {hasWeaknessData && (
          <div className="space-y-2">
            <p className="text-body-sm font-medium text-text-primary">Key weaknesses</p>
            {/* NUM-27: these counts are shot-tracked shots over the last 90
                days, not the all-rounds putting attempts Stats shows. */}
            <p className="text-caption text-text-secondary">Shot-tracked shots, last 90 days.</p>
            {topWeaknesses.length === 0 ? (
              <div className="rounded-fw-md border border-border-subtle bg-surface-sunken px-3 py-2.5">
                <p className="text-caption text-text-secondary">
                  No net-negative contexts. Every tracked situation is at or above par.
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
            {/* Resilience: the number with its meaning, no gauge (DD-01). */}
            {safeResilience != null && (
              <div
                className="rounded-fw-md border border-border-subtle bg-surface-sunken p-3"
                data-slot="deep-dive-resilience"
              >
                <p className="text-body-sm font-medium text-text-primary">Resilience</p>
                <p className="text-caption text-text-secondary">
                  <span className="text-body font-semibold tabular-nums text-text-primary">
                    {RESILIENCE_FORMAT.format(safeResilience)}
                  </span>{' '}
                  {resilienceWord(safeResilience)}
                </p>
                <p className="mt-0.5 text-caption text-text-tertiary">1.0 means a bad shot does not change the next one.</p>
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
