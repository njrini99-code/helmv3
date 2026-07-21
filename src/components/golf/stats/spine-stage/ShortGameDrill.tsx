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

import { useState } from 'react';
import { DrillPanel, RailBars, RingGauge, useStage } from '@/components/fairway/modules';
import type { RailBarRow } from '@/components/fairway/modules';
import { Eyebrow, InstrumentPanel, Readout, RadialGauge, Segmented, Surface, chartAriaLabel } from '@/components/fairway';
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
  const [detail, setDetail] = useState<'scrambling' | 'efficiency'>('scrambling');

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

  const efficiencyByDistance = [
    { label: '0-10 yds', key: '0_10', value: finite(s?.atgEfficiency0_10) },
    { label: '10-20 yds', key: '10_20', value: finite(s?.atgEfficiency10_20) },
    { label: '20+ yds', key: '20_30', value: finite(s?.atgEfficiency20_30) },
  ] as const;

  return (
    <DrillPanel title="Short game" backLabel="All areas" onBack={home}>
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Scrambling', value: scramblingPct, unit: '%', digits: 0, awaiting: 'No scrambles' },
            { label: 'Around-green efficiency', value: finite(s?.atgEfficiencyAvg), digits: 2, awaiting: 'No shots' },
            { label: 'Sand saves', value: sandPct, unit: '%', digits: 0, awaiting: 'No bunkers' },
            { label: 'Penalties / round', value: penPerRound, digits: 2, awaiting: 'No rounds' },
          ].map((item) => (
            <InstrumentPanel key={item.label} depth="base" padding="md" className="min-h-[116px]">
              <Readout value={item.value ?? undefined} unit={item.unit} format={{ maximumFractionDigits: item.digits }} label={item.label} size="sm" state={item.value !== null ? 'live' : 'awaiting'} awaitingLabel={item.awaiting} />
            </InstrumentPanel>
          ))}
        </div>

        <Segmented
          value={detail}
          onValueChange={setDetail}
          options={[{ value: 'scrambling', label: 'Scrambling detail' }, { value: 'efficiency', label: 'Efficiency' }]}
          size="lg"
          fullWidth
          aria-label="Short game detail"
        />

        {detail === 'scrambling' ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Surface elevation="shadow" padding="md" className="flex flex-col gap-3">
              <Eyebrow as="h4">Scrambling by distance</Eyebrow>
              <RailBars rows={byDistance} labelWidth={72} />
              <p className="text-caption text-text-tertiary">{scramblesMade} of {scrambleAttempts} total scramble attempts converted</p>
            </Surface>
            <Surface elevation="border" padding="md" className="flex flex-col gap-3">
              <Eyebrow as="h4">Scrambling by lie</Eyebrow>
              <RailBars rows={lieRings.map((ring) => ({ label: ring.label, pct: ring.pct ?? 0, value: fmtPct(ring.pct), dim: ring.pct === null }))} labelWidth={72} />
              <p className="text-caption text-text-tertiary">Sand saves: {s?.sandSavesMade ?? 0} of {sandAtt}</p>
            </Surface>
          </div>
        ) : null}

        {detail === 'efficiency' ? (
          <Surface elevation="shadow" padding="md" className="space-y-4 overflow-hidden">
            <div>
              <Eyebrow as="h4">Short-game efficiency by distance and lie</Eyebrow>
              <p className="mt-1 text-caption text-text-tertiary">Average strokes to hole out. Lower is better.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px] border-separate border-spacing-y-2 text-left">
                <thead className="text-eyebrow uppercase tracking-wide text-text-tertiary"><tr><th className="px-3">Distance</th><th className="px-3">Overall</th><th className="px-3">Fairway</th><th className="px-3">Rough</th><th className="px-3">Sand</th></tr></thead>
                <tbody>{efficiencyByDistance.map((row) => {
                  const split = s?.atgEffByDistanceLie?.[row.key];
                  const val = (n: number | null | undefined) => finite(n) === null ? '—' : finite(n)!.toFixed(2);
                  return <tr key={row.key} className="bg-surface-sunken font-fw-mono text-caption tabular-nums text-text-secondary"><th className="rounded-l-fw-sm px-3 py-3 font-fw-sans font-medium text-text-primary">{row.label}</th><td className="px-3">{val(row.value)}</td><td className="px-3">{val(split?.fairway)}</td><td className="px-3">{val(split?.rough)}</td><td className="rounded-r-fw-sm px-3">{val(split?.sand)}</td></tr>;
                })}</tbody>
              </table>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[{ label: 'Fairway', value: s?.atgEffFairway }, { label: 'Rough', value: s?.atgEffRough }, { label: 'Sand', value: s?.atgEffSand }].map((item) => (
                <InstrumentPanel key={item.label} depth="base" padding="sm"><Readout value={finite(item.value) ?? undefined} format={{ maximumFractionDigits: 2 }} label={`${item.label} efficiency`} size="sm" state={finite(item.value) !== null ? 'live' : 'awaiting'} awaitingLabel="No shots" /></InstrumentPanel>
              ))}
            </div>
          </Surface>
        ) : null}

        <div className="flex flex-col gap-4 border-t border-border-subtle pt-6">
          <Eyebrow as="h3" tone="accent">Short-game visuals</Eyebrow>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
            <RadialGauge title="Scrambling" overline="Short game" value={scramblingPct ?? undefined} max={100} samples={scrambleAttempts} minSamples={1} unit="scrambles" takeaway={scramblingPct !== null ? `${scramblesMade} of ${scrambleAttempts} scrambles converted` : undefined} size="lg" />
            <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-3">
              {lieRings.map((ring) => <LieRing key={ring.label} label={ring.label} pct={ring.pct} />)}
            </div>
          </div>
        </div>
      </div>
    </DrillPanel>
  );
}
