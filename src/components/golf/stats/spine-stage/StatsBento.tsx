'use client';

/**
 * ============================================================================
 * StatsBento — the Player Stats stage home view (spec §5.1 bento)
 * ----------------------------------------------------------------------------
 * Putting / Off the tee / Approach / Short game / Scoring / Standing / Last-10
 * — seven cells on one gapless `Bento` surface. Cell size encodes importance:
 * the area `biggestLeakArea()` picked gets `span2 row2` with a real
 * `RailBars`/`DivergingBars` mini-viz; the rest sit 1×1 with a headline +
 * sentence. Every cell's `onOpen` swaps the stage to its drill view via
 * `useStage()` — no prop-drilled callbacks.
 * ========================================================================== */

import {
  Bento,
  BentoCell,
  RailBars,
  DivergingBars,
  TickerStrip,
  useStage,
} from '@/components/fairway/modules';
import type { RailBarRow, DivergingRow, TickerItem } from '@/components/fairway/modules';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import type { PlayerStandingRow } from '@/app/golf/actions/stats-leak-maps-types';
import type { TrendAnalysisResponse } from '@/app/golf/actions/stats-data-types';
import type { StatisticalStrengthWeakness } from '@/lib/golf/strokes-gained';
import type { StatsArea } from './buildStatsViewModel';

function finite(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}
function fmtPct(n: number | null): string {
  return n === null ? '—' : `${Math.round(n)}%`;
}

export interface StatsBentoProps {
  detailedStats: GolfStats | null;
  standingByMetric: Map<string, PlayerStandingRow>;
  trendData: TrendAnalysisResponse | null;
  strengths: StatisticalStrengthWeakness[];
  weaknesses: StatisticalStrengthWeakness[];
  leakArea: StatsArea;
}

/** PGA tick position (0-100) for a make%/gir%/fairway% row, from the standing map. */
function pgaTickPct(standingByMetric: Map<string, PlayerStandingRow>, metricId: string): number | undefined {
  const v = finite(standingByMetric.get(metricId)?.pga_value ?? null);
  return v === null ? undefined : Math.max(0, Math.min(100, v));
}

export function StatsBento({
  detailedStats,
  standingByMetric,
  trendData,
  strengths,
  weaknesses,
  leakArea,
}: StatsBentoProps) {
  const stage = useStage();
  const s = detailedStats;

  const puttingRows: RailBarRow[] = [
    { label: '0-3ft', pct: finite(s?.puttMakePct0_3) ?? 0, value: fmtPct(finite(s?.puttMakePct0_3)) },
    {
      label: '5-10ft',
      pct: finite(s?.puttMakePct5_10) ?? 0,
      value: fmtPct(finite(s?.puttMakePct5_10)),
      tickPct: pgaTickPct(standingByMetric, 'putts_made_5_10ft_pct'),
    },
    {
      label: '15-25ft',
      pct: finite(s?.puttMakePct15_20) ?? 0,
      value: fmtPct(finite(s?.puttMakePct15_20)),
      tickPct: pgaTickPct(standingByMetric, 'putts_made_15_25ft_pct'),
    },
  ];

  const drivingRows: RailBarRow[] = [
    {
      label: 'Fairways',
      pct: finite(s?.fairwayPercentage) ?? 0,
      value: fmtPct(finite(s?.fairwayPercentage)),
    },
    { label: 'Par 4', pct: finite(s?.fairwayPctPar4) ?? 0, value: fmtPct(finite(s?.fairwayPctPar4)) },
    { label: 'Par 5', pct: finite(s?.fairwayPctPar5) ?? 0, value: fmtPct(finite(s?.fairwayPctPar5)) },
  ];

  const approachRows: RailBarRow[] = [
    {
      label: 'GIR',
      pct: finite(s?.girPercentage) ?? 0,
      value: fmtPct(finite(s?.girPercentage)),
      tickPct: pgaTickPct(standingByMetric, 'gir_pct'),
    },
    { label: 'Par 3', pct: finite(s?.girPctPar3) ?? 0, value: fmtPct(finite(s?.girPctPar3)) },
    { label: 'Par 4', pct: finite(s?.girPctPar4) ?? 0, value: fmtPct(finite(s?.girPctPar4)) },
  ];

  const shortGameRows: RailBarRow[] = [
    { label: 'Scrambling', pct: finite(s?.scramblingPercentage) ?? 0, value: fmtPct(finite(s?.scramblingPercentage)) },
    { label: 'Sand saves', pct: finite(s?.sandSavePercentage) ?? 0, value: fmtPct(finite(s?.sandSavePercentage)) },
  ];

  const scoringDiverging: DivergingRow[] = [
    { label: 'Par 3', delta: s?.scoringByPar.par3.avgToPar ?? 0, display: fmtToPar(s?.scoringByPar.par3.avgToPar ?? null) },
    { label: 'Par 4', delta: s?.scoringByPar.par4.avgToPar ?? 0, display: fmtToPar(s?.scoringByPar.par4.avgToPar ?? null) },
    { label: 'Par 5', delta: s?.scoringByPar.par5.avgToPar ?? 0, display: fmtToPar(s?.scoringByPar.par5.avgToPar ?? null) },
  ];
  const scoringMax = Math.max(1, ...scoringDiverging.map((r) => Math.abs(r.delta)));

  const rounds = trendData?.rounds.slice(-10) ?? [];
  const worstToPar = Math.max(1, ...rounds.map((r) => Math.abs(r.toPar ?? 0)));
  const bestToPar = rounds.length > 0 ? Math.min(...rounds.map((r) => r.toPar ?? 0)) : null;
  const roundsTicker: TickerItem[] = rounds.map((r) => ({
    label: String(r.score ?? '—'),
    heightPct: Math.max(10, 100 - ((r.toPar ?? 0) / worstToPar) * 70),
    emphasis: bestToPar !== null && (r.toPar ?? 0) === bestToPar,
  }));

  const bestCategory = strengths[0] ?? null;
  const worstCategory = weaknesses[0] ?? null;

  return (
    <Bento>
      <BentoCell
        label="Putting"
        chip={leakArea === 'putting' ? { tone: 'leak', text: 'Leak' } : undefined}
        headline={{ value: fmtPct(finite(s?.puttMakePct5_10)), unit: '5-10ft' }}
        sentence="Make rate by distance band, vs the PGA Tour tick."
        span={leakArea === 'putting' ? 2 : 1}
        rows={leakArea === 'putting' ? 2 : 1}
        onOpen={() => stage.open('putting')}
      >
        <RailBars rows={puttingRows} labelWidth={44} />
      </BentoCell>

      <BentoCell
        label="Off the tee"
        chip={leakArea === 'driving' ? { tone: 'leak', text: 'Leak' } : undefined}
        headline={{ value: fmtPct(finite(s?.fairwayPercentage)), unit: 'fairways' }}
        sentence="Fairways hit, overall and by hole type."
        span={leakArea === 'driving' ? 2 : 1}
        rows={leakArea === 'driving' ? 2 : 1}
        onOpen={() => stage.open('driving')}
      >
        <RailBars rows={drivingRows} labelWidth={44} />
      </BentoCell>

      <BentoCell
        label="Approach"
        chip={leakArea === 'approach' ? { tone: 'leak', text: 'Leak' } : undefined}
        headline={{ value: fmtPct(finite(s?.girPercentage)), unit: 'GIR' }}
        sentence="Greens hit in regulation, overall and by hole type."
        span={leakArea === 'approach' ? 2 : 1}
        rows={leakArea === 'approach' ? 2 : 1}
        onOpen={() => stage.open('approach')}
      >
        <RailBars rows={approachRows} labelWidth={44} />
      </BentoCell>

      <BentoCell
        label="Short game"
        chip={leakArea === 'short-game' ? { tone: 'leak', text: 'Leak' } : undefined}
        headline={{ value: fmtPct(finite(s?.scramblingPercentage)), unit: 'scrambling' }}
        sentence="Up-and-down conversion and bunker recovery."
        span={leakArea === 'short-game' ? 2 : 1}
        rows={leakArea === 'short-game' ? 2 : 1}
        onOpen={() => stage.open('short-game')}
      >
        <RailBars rows={shortGameRows} labelWidth={72} />
      </BentoCell>

      <BentoCell
        label="Scoring"
        headline={{ value: fmtToPar(s?.avgScoreToPar ?? null), unit: '/ hole' }}
        sentence="Average to par by hole type."
        onOpen={() => stage.open('scoring')}
      >
        <DivergingBars rows={scoringDiverging} max={scoringMax} />
      </BentoCell>

      <BentoCell
        label="Standing"
        span={2}
        chip={bestCategory ? { tone: 'strength', text: 'Best' } : undefined}
        headline={worstCategory ? { value: worstCategory.label } : undefined}
        sentence={
          bestCategory && worstCategory
            ? `Strongest in ${bestCategory.label.toLowerCase()}; leaking most in ${worstCategory.label.toLowerCase()}.`
            : 'Every metric vs PGA Tour and the team.'
        }
        onOpen={() => stage.open('standing')}
      />

      <BentoCell
        label="Last 10 rounds"
        span={2}
        headline={rounds.length > 0 ? { value: String(rounds.length), unit: 'rounds' } : undefined}
        sentence="Score trend across the most recent rounds."
        onOpen={() => stage.open('rounds')}
      >
        {roundsTicker.length > 0 ? <TickerStrip items={roundsTicker} /> : null}
      </BentoCell>
    </Bento>
  );
}

function fmtToPar(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—';
  if (Math.abs(v) < 0.05) return 'E';
  return v > 0 ? `+${v.toFixed(2)}` : `−${Math.abs(v).toFixed(2)}`;
}
