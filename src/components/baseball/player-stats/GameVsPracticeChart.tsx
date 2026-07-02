'use client';

/**
 * GameVsPracticeChart — practice vs. game slash-line comparison.
 *
 * Living Annual migration (execution plan §3.1 my-stats: "GameVsPractice →
 * paired StatReadout/SlashLine, NOT ClimbArc" — this is a side-by-side
 * comparison, not a trend over time). Was a recharts weekly-bucketed bar
 * chart of AVG only; this now derives a full practice-side and game-side
 * `<SlashLine>` (AVG/OBP/SLG) from the SAME raw `BaseballPlayerStats[]` the
 * caller already fetched — no new reads — plus the game-minus-practice AVG
 * gap as a single `<StatReadout>` figure (positive reads green, the "shows up
 * bigger for the games that count" tell).
 */
import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { PaperCard, Eyebrow, SlashLine, StatReadout, HairlineRule, EmptyIssue, formatRate } from '@/components/baseball/living-annual';
import type { BaseballPlayerStats } from '@/lib/types';

interface GameVsPracticeChartProps {
  stats: BaseballPlayerStats[];
  className?: string;
}

interface SideTotals {
  atBats: number;
  hits: number;
  walks: number;
  hbp: number;
  sacFlies: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  sessions: number;
}

function emptyTotals(): SideTotals {
  return { atBats: 0, hits: 0, walks: 0, hbp: 0, sacFlies: 0, doubles: 0, triples: 0, homeRuns: 0, sessions: 0 };
}

/** Same AVG/OBP/SLG formulas used across the my-stats surface, aggregated over a side's totals. */
function deriveSlash(t: SideTotals): { avg: number; obp: number; slg: number } {
  const pa = t.atBats + t.walks + t.hbp + t.sacFlies;
  const totalBases = t.hits + t.doubles + t.triples * 2 + t.homeRuns * 3;
  return {
    avg: t.atBats > 0 ? t.hits / t.atBats : NaN,
    obp: pa > 0 ? (t.hits + t.walks + t.hbp) / pa : NaN,
    slg: t.atBats > 0 ? totalBases / t.atBats : NaN,
  };
}

function SideColumn({ label, totals, className }: { label: string; totals: SideTotals; className?: string }) {
  const slash = deriveSlash(totals);
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <Eyebrow ink="team">{label}</Eyebrow>
      <SlashLine avg={slash.avg} obp={slash.obp} slg={slash.slg} leader="avg" size="md" />
      <div className="flex items-baseline gap-2">
        <StatReadout value={totals.atBats} decimals={0} ariaLabel={`${label} at-bats`} className="text-body-sm" />
        <span className="text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">
          AB · {totals.sessions} {totals.sessions === 1 ? 'session' : 'sessions'}
        </span>
      </div>
    </div>
  );
}

export function GameVsPracticeChart({ stats, className }: GameVsPracticeChartProps) {
  const { practice, game } = useMemo(() => {
    const p = emptyTotals();
    const g = emptyTotals();
    stats.forEach((s) => {
      const bucket = s.stat_type === 'game' ? g : s.stat_type === 'practice' ? p : null;
      if (!bucket) return;
      bucket.atBats += s.at_bats;
      bucket.hits += s.hits;
      bucket.walks += s.walks;
      bucket.hbp += s.hit_by_pitch;
      bucket.sacFlies += s.sacrifice_flies;
      bucket.doubles += s.doubles;
      bucket.triples += s.triples;
      bucket.homeRuns += s.home_runs;
      bucket.sessions += 1;
    });
    return { practice: p, game: g };
  }, [stats]);

  if (stats.length === 0) {
    return <EmptyIssue variant="stats" className={className} />;
  }

  const practiceSlash = deriveSlash(practice);
  const gameSlash = deriveSlash(game);
  const gap =
    Number.isFinite(practiceSlash.avg) && Number.isFinite(gameSlash.avg) ? gameSlash.avg - practiceSlash.avg : null;

  return (
    <PaperCard className={cn('p-6', className)}>
      <Eyebrow ink="team">Game vs Practice</Eyebrow>

      <div className="mt-4 grid grid-cols-1 gap-8 sm:grid-cols-2">
        <SideColumn label="Practice" totals={practice} />
        <SideColumn label="Game" totals={game} className="sm:border-l sm:border-[color:var(--hairline)] sm:pl-8" />
      </div>

      {gap !== null ? (
        <>
          <HairlineRule ink="hairline" className="mt-6" />
          <div className="mt-4 flex items-center justify-between">
            <span className="text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary">
              Game vs. practice gap
            </span>
            <StatReadout
              value={`${gap >= 0 ? '+' : ''}${formatRate(gap, 3)}`}
              ariaLabel="Game versus practice average gap"
              className={cn('text-body-lg', gap >= 0 && 'text-grade-plus')}
            />
          </div>
        </>
      ) : null}
    </PaperCard>
  );
}
