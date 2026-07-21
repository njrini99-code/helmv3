'use client';

/**
 * ============================================================================
 * ShortGameDrill — `?area=short-game` (spec §5.1)
 * ----------------------------------------------------------------------------
 * HERO — a scrambling instrument cluster: one large `RadialGauge` reading
 * overall `scramblingPercentage` (an honest "awaiting" dial when there are no
 * scramble attempts yet) with a "n of n made" mono sub-line, flanked by three
 * small `RingGauge` rings for the fairway/rough/sand splits. A lie with no
 * attempts renders a dim ghost ring + em-dash rather than a fabricated 0%.
 *
 * Below the hero: scrambling by distance (`RailBars`) plus sand-save and
 * penalty headline readouts. The old by-lie `RailBars` row was dropped — it
 * now exactly duplicates the three flanking rings above.
 * ========================================================================== */

import { DrillPanel, RailBars, RingGauge, useStage } from '@/components/fairway/modules';
import type { RailBarRow } from '@/components/fairway/modules';
import { Eyebrow, InstrumentPanel, Readout, RadialGauge, Surface, chartAriaLabel } from '@/components/fairway';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';

function finite(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}
function fmtPct(n: number | null): string {
  return n === null ? '—' : `${Math.round(n)}%`;
}

/**
 * A dim, honest placeholder for a lie ring with no recorded attempts — a
 * static sunken track + em-dash, never a fabricated 0% arc. Mirrors
 * `RingGauge`'s geometry so it reads as the same instrument, just asleep.
 */
function GhostRing({ size }: { size: number }) {
  const strokeWidth = Math.max(2, size / 7.5);
  const r = size / 2 - strokeWidth / 2 - 1;
  return (
    <span
      role="img"
      aria-label="No scramble attempts recorded"
      className="inline-flex items-center gap-2 opacity-40"
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="shrink-0">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--fw-color-surface-sunken)"
          strokeWidth={strokeWidth}
        />
      </svg>
      <b className="font-fw-mono text-body-sm font-normal not-italic tabular-nums text-text-tertiary">
        —
      </b>
    </span>
  );
}

/** One flanking lie ring — label above, ring (or ghost) below. */
function LieRing({ label, pct }: { label: string; pct: number | null }) {
  // `RingGauge`/`GhostRing` carry their own generic role="img" aria-label
  // (a composite score / a bare "no attempts" string) that says nothing
  // about scrambling or which lie this is. Hide that inner label from the
  // accessibility tree and speak a real one — "<Lie> scrambling: N%" or
  // "<Lie> scrambling: no attempts recorded" — from this wrapper instead.
  const ariaLabel = chartAriaLabel(
    `${label} scrambling`,
    pct === null ? 'No attempts recorded' : `${Math.round(pct)}%`,
  );
  return (
    <InstrumentPanel depth="base" padding="sm" className="flex flex-col items-center gap-2">
      <span className="font-fw-sans text-caption font-medium uppercase tracking-[0.08em] text-text-tertiary">
        {label}
      </span>
      <span role="img" aria-label={ariaLabel}>
        <span aria-hidden="true">
          {pct === null ? <GhostRing size={48} /> : <RingGauge value={pct} size={48} />}
        </span>
      </span>
    </InstrumentPanel>
  );
}

export interface ShortGameDrillProps {
  detailedStats: GolfStats | null;
}

export function ShortGameDrill({ detailedStats }: ShortGameDrillProps) {
  const { home } = useStage();
  const s = detailedStats;

  const scramblingPct = finite(s?.scramblingPercentage);
  const scrambleAttempts = s?.scrambleAttempts ?? 0;
  const scramblesMade = s?.scramblesMade ?? 0;

  const lieRings: Array<{ label: string; pct: number | null }> = [
    { label: 'Fairway', pct: finite(s?.scramblingPctFairway) },
    { label: 'Rough', pct: finite(s?.scramblingPctRough) },
    { label: 'Sand', pct: finite(s?.scramblingPctSand) },
  ];

  const byDistance: RailBarRow[] = [
    { label: '0-10 yds', pct: finite(s?.scramblingPct0_10) ?? 0, value: fmtPct(finite(s?.scramblingPct0_10)) },
    { label: '10-20 yds', pct: finite(s?.scramblingPct10_20) ?? 0, value: fmtPct(finite(s?.scramblingPct10_20)) },
    { label: '20-30 yds', pct: finite(s?.scramblingPct20_30) ?? 0, value: fmtPct(finite(s?.scramblingPct20_30)) },
  ];

  const sandPct = finite(s?.sandSavePercentage);
  const sandAtt = s?.sandSaveAttempts ?? 0;
  const penPerRound = finite(s?.penaltiesPerRound);

  return (
    <DrillPanel title="Short game" backLabel="All areas" onBack={home}>
      <div className="flex flex-col gap-6">
        {/* HERO — scrambling instrument cluster */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="flex flex-col items-center gap-2">
            <RadialGauge
              title="Scrambling"
              overline="Short game"
              value={scramblingPct ?? undefined}
              max={100}
              samples={scrambleAttempts}
              minSamples={1}
              unit="scrambles"
              takeaway={
                scramblingPct !== null
                  ? `${scramblesMade} of ${scrambleAttempts} scrambles converted`
                  : undefined
              }
              size="lg"
            />
            {scramblingPct !== null ? (
              <p className="font-fw-mono text-caption tabular-nums text-text-tertiary">
                {scramblesMade} of {scrambleAttempts} made
              </p>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-3">
            {lieRings.map((ring) => (
              <LieRing key={ring.label} label={ring.label} pct={ring.pct} />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Surface elevation="shadow" padding="md" className="flex flex-col gap-3">
            <Eyebrow as="h4">Scrambling by distance</Eyebrow>
            <RailBars rows={byDistance} labelWidth={64} />
          </Surface>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InstrumentPanel depth="raised" padding="md" className="min-h-[132px]">
              <Readout
                value={sandPct ?? undefined}
                unit="%"
                label="Sand saves"
                size="md"
                state={sandAtt > 0 ? 'live' : 'awaiting'}
                awaitingLabel="No bunkers"
              />
            </InstrumentPanel>
            <InstrumentPanel depth="base" padding="md" className="min-h-[132px]">
              <Readout
                value={penPerRound ?? undefined}
                label="Penalties / round"
                size="md"
                state={penPerRound != null ? 'live' : 'awaiting'}
                awaitingLabel="No rounds"
              />
            </InstrumentPanel>
          </div>
        </div>
      </div>
    </DrillPanel>
  );
}
