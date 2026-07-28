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
  layoutTrackLabels,
  STANDING_TRACK_SUBJECT_KEY,
} from '@/components/fairway/modules';
import type { RailBarRow, DivergingRow, TickerItem, CellChipTone } from '@/components/fairway/modules';
import { Sparkline } from '@/components/fairway/charts/Sparkline';
import { TrendChip } from '@/components/fairway/charts/TrendChip';
import { cn } from '@/lib/utils';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import type { PlayerStandingRow } from '@/app/golf/actions/stats-leak-maps-types';
import type { TrendAnalysisResponse } from '@/app/golf/actions/stats-data-types';
import type { StatisticalStrengthWeakness } from '@/lib/golf/strokes-gained';
import { sgToTrackPct, formatSgSigned, buildCategoryTrends, type StatsArea } from './buildStatsViewModel';

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
      // Plots `puttMakePct15_20` — the real 15-20ft bucket. The label matches
      // the field it renders; the PGA tick is the closest available Tour
      // benchmark (`putts_made_15_25ft_pct` — no 15-20ft-exact metric exists)
      // so it stays a reference point rather than an exact-bucket match.
      label: '15-20ft',
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
  // Score-to-par trend (oldest→newest) — the SAME per-category threading every
  // drill's CategoryInsightStrip pulls from, so the bento's compact preview and
  // the drill's own trend chip never disagree.
  const scoringTrend = trendData ? buildCategoryTrends(trendData.trends).scoring : null;

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

  // The Standing chip labels whatever the headline names, so the two are
  // resolved together. Gating the chip on `strengths` while the headline read
  // from `weaknesses` printed "Best" above the player's WEAKEST category —
  // the card announced the leak as the strength.
  const standingFocus: { chip?: { tone: CellChipTone; text: string }; headline?: { value: string } } =
    worstCategory
      ? { chip: { tone: 'leak', text: 'Leak' }, headline: { value: worstCategory.label } }
      : bestCategory
        ? { chip: { tone: 'strength', text: 'Best' }, headline: { value: bestCategory.label } }
        : {};

  return (
    <Bento separated>
      <BentoCell
        label="Core ball striking"
        span={2}
        sentence="The three conversion rates that shape scoring opportunity."
      >
        <div className="grid grid-cols-3 divide-x divide-border-subtle rounded-fw-md border border-border-subtle bg-surface-sunken/45">
          <CoreMetric label="Fairways" value={fmtPct(finite(s?.fairwayPercentage))} />
          <CoreMetric label="GIR" value={fmtPct(finite(s?.girPercentage))} />
          <CoreMetric label="Scrambling" value={fmtPct(finite(s?.scramblingPercentage))} />
        </div>
      </BentoCell>

      <BentoCell
        label="Per 18 holes"
        span={2}
        sentence="Normalized to a full round so every scorecard compares cleanly."
        onOpen={() => stage.open('scoring')}
      >
        <div className="grid grid-cols-3 divide-x divide-border-subtle rounded-fw-md border border-border-subtle bg-surface-sunken/45 pr-5">
          <CoreMetric label="Score avg" value={fmtOne(finite(s?.scoringAverage))} />
          <CoreMetric label="Putts" value={fmtOne(finite(s?.puttsPerRound))} />
          <CoreMetric label="Birdies" value={fmtOne(finite(s?.birdiesPerRound))} />
        </div>
      </BentoCell>

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
        {/* labelWidth 60, not 44: "Fairways" (8 chars) was clipping to
            "Fairw…" — RailBars' label column IS truncate-safe, but 44px
            never gave that specific label a real fit; the other rows here
            ("Par 4"/"Par 5") had margin to spare either way. */}
        <RailBars rows={drivingRows} labelWidth={60} />
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
        headline={{ value: fmtToPar(s?.avgScoreToPar ?? null), unit: '/ 18' }}
        sentence="Average to par by hole type."
        onOpen={() => stage.open('scoring')}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Sparkline
              data={scoringTrend?.series ?? []}
              goodDirection="down"
              label={scoringTrend?.label ?? 'Score to par'}
              width={52}
              height={16}
            />
            {scoringTrend?.delta ? (
              <TrendChip
                direction={
                  scoringTrend.delta.direction === 'flat'
                    ? 'flat'
                    : scoringTrend.delta.good
                      ? 'improving'
                      : 'declining'
                }
                label={scoringTrend.delta.text}
                size="sm"
                numeric
              />
            ) : null}
          </div>
          <DivergingBars rows={scoringDiverging} max={scoringMax} />
        </div>
      </BentoCell>

      <BentoCell
        label="Standing"
        span={2}
        chip={standingFocus.chip}
        headline={standingFocus.headline}
        sentence={
          bestCategory && worstCategory
            ? `Strongest in ${bestCategory.label.toLowerCase()}; leaking most in ${worstCategory.label.toLowerCase()}.`
            : 'Every metric vs PGA Tour and the team.'
        }
        onOpen={() => stage.open('standing')}
      >
        <StandingPinPreview standingByMetric={standingByMetric} />
      </BentoCell>

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

/**
 * StandingPinPreview — a compressed, LIGHT-toned rendition of the spine's
 * `StandingTrack` for the "Standing" bento cell (which sits on `bg-surface`,
 * not the spine's dark accent gradient `StandingTrack` is styled for — its
 * `oklch(1 0 0 / N)` on-dark overlays would be nearly invisible here). Reuses
 * the SAME fixed label-layout pass (`layoutTrackLabels` +
 * `STANDING_TRACK_SUBJECT_KEY`) so You/Team/Tour never collide, just painted
 * in the light-surface idiom `RailBars`/`DivergingBars` already use on this
 * cell grid (`bg-surface-sunken` rail, `bg-accent-500`/`bg-fw-warning` fill).
 * SG: Total is zero-sum (Tour always sits at the rail's center, 50%), so the
 * fill grows from that center — the SAME diverging convention `DivergingBars`
 * uses elsewhere on this page — rather than a from-zero bar that would imply
 * a meaningless "distance from the worst possible score" reading.
 *
 * Honest empty state: no fabricated pin when `sg_total` hasn't computed yet —
 * a muted rail + a one-line caption, never a pin at a guessed position.
 */
function StandingPinPreview({ standingByMetric }: { standingByMetric: Map<string, PlayerStandingRow> }) {
  const sgTotalRow = standingByMetric.get('sg_total');
  const you = finite(sgTotalRow?.player_value ?? null);

  if (you === null) {
    return (
      <div data-slot="standing-pin-preview" data-state="empty" className="mt-0.5 flex flex-col gap-1.5">
        <div aria-hidden="true" className="h-[7px] rounded-full bg-surface-sunken" />
        <p className="font-fw-sans text-eyebrow text-text-tertiary">Fills in after 5+ rounds</p>
      </div>
    );
  }

  const team = finite(sgTotalRow?.team_avg ?? null);
  const youPct = sgToTrackPct(you);
  const teamPct = team === null ? null : sgToTrackPct(team);
  const tourPct = sgToTrackPct(0); // the zero-sum SG anchor — always the rail's center
  const isGain = you >= 0;
  const fillLeft = Math.min(tourPct, youPct);
  const fillWidth = Math.abs(youPct - tourPct);

  const labelPositions = layoutTrackLabels([
    { key: STANDING_TRACK_SUBJECT_KEY, pct: youPct },
    ...(teamPct === null ? [] : [{ key: 'Team', pct: teamPct }]),
    { key: 'Tour', pct: tourPct },
  ]);

  return (
    <div data-slot="standing-pin-preview" className="mt-0.5 flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-fw-mono text-caption font-semibold tabular-nums text-accent-700">
          {formatSgSigned(you)}
        </span>
        <span className="font-fw-sans text-eyebrow font-medium uppercase tracking-[0.08em] text-text-tertiary">
          SG: Total
        </span>
      </div>
      <div className="relative h-[7px] rounded-full bg-surface-sunken">
        {teamPct !== null ? (
          <div
            aria-hidden="true"
            className="absolute -top-0.5 -bottom-0.5 w-[1.5px] bg-text-tertiary"
            style={{ left: `${teamPct}%` }}
          />
        ) : null}
        <div
          aria-hidden="true"
          className="absolute -top-0.5 -bottom-0.5 w-[1.5px] bg-text-secondary"
          style={{ left: `${tourPct}%` }}
        />
        <div
          aria-hidden="true"
          className={cn('absolute inset-y-0 rounded-full', isGain ? 'bg-accent-500' : 'bg-fw-warning')}
          style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }}
        />
        <div
          aria-hidden="true"
          className="absolute top-1/2 h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-500 shadow-soft ring-2 ring-surface"
          style={{ left: `${youPct}%` }}
        />
      </div>
      <div className="relative h-[12px] font-fw-mono text-microbadge normal-case tracking-normal text-text-tertiary">
        {labelPositions.map((pos) => {
          const isSubject = pos.key === STANDING_TRACK_SUBJECT_KEY;
          return (
            <span
              key={pos.key}
              data-slot={isSubject ? 'standing-pin-subject-label' : 'standing-pin-bench-label'}
              className={cn(
                'absolute top-0 -translate-x-1/2 whitespace-nowrap',
                isSubject && 'font-semibold text-accent-700',
              )}
              style={{ left: `${pos.pct}%` }}
            >
              {isSubject ? 'You' : pos.key}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function CoreMetric({ label, value }: { label: string; value: string }) {
  return (
    // px-2 not px-2.5 on mobile: this 3-across grid gives each column
    // ~1/3 of the cell width, and "Scrambling" (the longest of the three
    // labels this renders) was clipping to "SCRAMBLI…" at 390px by a
    // handful of px — the saved padding plus the label's own tighter
    // tracking below closes that gap without touching the value's own
    // sizing/emphasis.
    <div className="min-w-0 px-2 py-2.5 sm:px-3">
      <p className="truncate font-fw-mono text-[1.15rem] font-semibold leading-none tracking-[-0.03em] text-text-primary tabular-nums sm:text-h3">
        {value}
      </p>
      <p className="mt-1.5 truncate font-fw-sans text-[0.6875rem] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
        {label}
      </p>
    </div>
  );
}

function fmtOne(v: number | null): string {
  return v === null ? '—' : v.toFixed(1);
}

function fmtToPar(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—';
  if (Math.abs(v) < 0.05) return 'E';
  return v > 0 ? `+${v.toFixed(2)}` : `−${Math.abs(v).toFixed(2)}`;
}
