'use client';

/**
 * ============================================================================
 * ShortGameDrill — `?area=short-game` (spec §5.1)
 * ----------------------------------------------------------------------------
 * Scrambling by lie + by distance (`RailBars`) plus sand-save and penalty
 * headline readouts.
 * ========================================================================== */

import { DrillPanel, RailBars, useStage } from '@/components/fairway/modules';
import type { RailBarRow } from '@/components/fairway/modules';
import { InstrumentPanel, Readout } from '@/components/fairway';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';

function finite(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}
function fmtPct(n: number | null): string {
  return n === null ? '—' : `${Math.round(n)}%`;
}

export interface ShortGameDrillProps {
  detailedStats: GolfStats | null;
}

export function ShortGameDrill({ detailedStats }: ShortGameDrillProps) {
  const { home } = useStage();
  const s = detailedStats;

  const byLie: RailBarRow[] = [
    { label: 'Fairway', pct: finite(s?.scramblingPctFairway) ?? 0, value: fmtPct(finite(s?.scramblingPctFairway)) },
    { label: 'Rough', pct: finite(s?.scramblingPctRough) ?? 0, value: fmtPct(finite(s?.scramblingPctRough)) },
    { label: 'Sand', pct: finite(s?.scramblingPctSand) ?? 0, value: fmtPct(finite(s?.scramblingPctSand)) },
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
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4">
          <RailBars rows={byLie} labelWidth={64} />
          <RailBars rows={byDistance} labelWidth={64} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <InstrumentPanel depth="base" padding="md">
            <Readout
              value={sandPct ?? undefined}
              unit="%"
              label="Sand saves"
              size="md"
              state={sandAtt > 0 ? 'live' : 'awaiting'}
              awaitingLabel="No bunkers"
            />
          </InstrumentPanel>
          <InstrumentPanel depth="base" padding="md">
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
    </DrillPanel>
  );
}
