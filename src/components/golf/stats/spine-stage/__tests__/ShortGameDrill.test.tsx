// @vitest-environment jsdom
/**
 * ============================================================================
 * ShortGameDrill — render tests
 * ----------------------------------------------------------------------------
 * Covers the new wiring: the top-of-drill CategoryInsightStrip (patterns
 * filtered to the `short_game` category via `buildCategoryInsights`), the
 * Efficiency tab's RampMatrix banding (was a plain colorless table), and the
 * new Misses sub-tab (up-and-down by miss direction, up-and-down by lie incl.
 * fringe, and average chip proximity) — all reading the additive
 * golf-stats-calculator-shots.ts fields.
 * Renders real framer-motion (CategoryInsightStrip/RailBars need no mock,
 * matching sibling drill test files). `useStage()` requires a real
 * `StageRouter` ancestor — `next/navigation` is globally mocked in
 * src/test/setup.tsx.
 * ========================================================================== */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ComponentProps } from 'react';

import { StageRouter } from '@/components/fairway/modules';
import { ShortGameDrill } from '../ShortGameDrill';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import type { CategorizablePatternWithImpact } from '../buildStatsViewModel';

type ShortGameDrillProps = ComponentProps<typeof ShortGameDrill>;

function renderShortGame(props: Partial<ShortGameDrillProps> = {}) {
  return render(
    <StageRouter
      param="area"
      homeKey="short-game"
      views={[
        {
          key: 'short-game',
          node: <ShortGameDrill detailedStats={null} {...props} />,
        },
      ]}
    />,
  );
}

function fixtureStats(overrides: Partial<GolfStats> = {}): GolfStats {
  return {
    scramblingPercentage: 55,
    scrambleAttempts: 20,
    scramblesMade: 11,
    scramblingPctFairway: 60,
    scramblingPctRough: 50,
    scramblingPctSand: 45,
    scramblingPct0_10: 70,
    scramblingPct10_20: 50,
    scramblingPct20_30: 30,
    sandSavePercentage: 45,
    sandSaveAttempts: 9,
    sandSavesMade: 4,
    penaltiesPerRound: 0.8,
    atgEfficiencyAvg: 2.35,
    atgEfficiency0_10: 2.1,
    atgEfficiency10_20: 2.6,
    atgEfficiency20_30: 3.0,
    atgEffFairway: 2.2,
    atgEffRough: 2.5,
    atgEffSand: 2.6,
    atgEffByDistanceLie: {
      '0_10': { fairway: 2.1, rough: 2.2, sand: 2.3 },
      '10_20': { fairway: 2.4, rough: 2.5, sand: 2.6 },
      '20_30': { fairway: 2.7, rough: 2.8, sand: 2.9 },
    },
    scramblingByMissDirection: {
      short: { attempts: 10, made: 7, pct: 70, shareOfMisses: 50 },
      long: { attempts: 6, made: 2, pct: 33, shareOfMisses: 30 },
    },
    scramblingMissDirectionTotal: 20,
    scrambleFairwayAttempts: 10,
    scrambleFairwayMade: 7,
    scrambleRoughAttempts: 9,
    scrambleRoughMade: 5,
    scrambleSandAttempts: 5,
    scrambleSandMade: 2,
    scramblingPctFringe: 20,
    scrambleFringeAttempts: 4,
    scrambleFringeMade: 1,
    atgProximityAvg: 6.4,
    atgProximityByLie: { fairway: 5.2, rough: 6.8, sand: 7.5 },
    ...overrides,
  } as unknown as GolfStats;
}

const SHORT_GAME_PATTERN_DESCRIPTION = 'Loses strokes chipping from the rough';
const PUTTING_PATTERN_DESCRIPTION = 'Missing short putts under pressure';

const shortGamePattern: CategorizablePatternWithImpact = {
  id: 'p-short-game',
  strokeImpact: -0.7,
  patternType: 'conditional',
  description: SHORT_GAME_PATTERN_DESCRIPTION,
  recommendation: 'Practice 15-25 yard chips from the rough.',
  outcome: { metric: 'scrambling_pct' },
  conditions: [],
};

const puttingPattern: CategorizablePatternWithImpact = {
  id: 'p-putting',
  strokeImpact: -1.2,
  patternType: 'conditional',
  description: PUTTING_PATTERN_DESCRIPTION,
  outcome: { metric: 'putts_per_round' },
  conditions: [],
};

describe('ShortGameDrill', () => {
  it('renders the core layout with no data (defaults are safe)', () => {
    renderShortGame({ detailedStats: null });
    expect(screen.getByText('Scrambling by distance')).toBeInTheDocument();
    expect(screen.getByText('Short-game visuals')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="category-insight-strip"]')).toBeNull();
  });

  it('surfaces only the short-game-category insight from mixed-category patterns', () => {
    renderShortGame({
      detailedStats: fixtureStats(),
      patterns: [shortGamePattern, puttingPattern],
    });
    const strip = document.querySelector('[data-slot="category-insight-strip"]');
    expect(strip).not.toBeNull();
    expect(within(strip as HTMLElement).getByText(SHORT_GAME_PATTERN_DESCRIPTION)).toBeInTheDocument();
    expect(within(strip as HTMLElement).queryByText(PUTTING_PATTERN_DESCRIPTION)).not.toBeInTheDocument();
  });

  it('omits the CategoryInsightStrip entirely when there are no short-game patterns (honest empty state)', () => {
    renderShortGame({ detailedStats: fixtureStats(), patterns: [] });
    expect(document.querySelector('[data-slot="category-insight-strip"]')).toBeNull();
  });

  it('defaults to the Scrambling detail sub-tab', () => {
    renderShortGame({ detailedStats: fixtureStats() });
    expect(screen.getByText('Scrambling by distance')).toBeInTheDocument();
    expect(screen.queryByText('Short-game efficiency by distance and lie')).not.toBeInTheDocument();
    expect(screen.queryByText('Up-and-down by miss direction')).not.toBeInTheDocument();
  });

  it('gains a third Misses option on the Segmented switcher', () => {
    renderShortGame({ detailedStats: fixtureStats() });
    expect(screen.getByRole('radio', { name: 'Scrambling detail' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Efficiency' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Misses' })).toBeInTheDocument();
  });

  describe('Efficiency tab', () => {
    it('renders a banded RampMatrix (not a plain colorless table)', () => {
      renderShortGame({ detailedStats: fixtureStats() });
      fireEvent.click(screen.getByRole('radio', { name: 'Efficiency' }));

      const matrices = document.querySelectorAll('[data-slot="ramp-matrix"]');
      expect(matrices.length).toBe(1);
      const cells = matrices[0]!.querySelectorAll('td');
      expect(cells.length).toBeGreaterThan(0);

      // Row 1 (0-10 yds), Overall column: 2.10 strokes -> best band (band 4).
      expect(cells[0]!.textContent).toContain('2.10');
      expect(cells[0]!.className).toContain('bg-ramp-4');

      // Row 3 (20+ yds), Overall column: 3.00 strokes -> worst band (band 1).
      // 4 cols per row (Overall/Fairway/Rough/Sand) -> row 3's Overall cell is index 8.
      expect(cells[8]!.textContent).toContain('3.00');
      expect(cells[8]!.className).toContain('bg-ramp-1');
    });

    it('shows an honest em-dash + sunken band for a cell with no data', () => {
      renderShortGame({ detailedStats: fixtureStats({ atgEfficiency0_10: null, atgEffByDistanceLie: {
        '0_10': { fairway: null, rough: null, sand: null },
        '10_20': { fairway: null, rough: null, sand: null },
        '20_30': { fairway: null, rough: null, sand: null },
      } }) });
      fireEvent.click(screen.getByRole('radio', { name: 'Efficiency' }));
      const matrix = document.querySelector('[data-slot="ramp-matrix"]')!;
      const cells = matrix.querySelectorAll('td');
      expect(cells[0]!.textContent).toContain('—');
      expect(cells[0]!.className).toContain('bg-surface-sunken');
    });
  });

  describe('Misses tab', () => {
    it('renders up-and-down by miss direction with per-cell n= badges', () => {
      renderShortGame({ detailedStats: fixtureStats() });
      fireEvent.click(screen.getByRole('radio', { name: 'Misses' }));

      expect(screen.getByText('Up-and-down by miss direction')).toBeInTheDocument();
      const matrices = document.querySelectorAll('[data-slot="ramp-matrix"]');
      expect(matrices.length).toBe(2);

      const missDirCells = matrices[0]!.querySelectorAll('td');
      // Short: 70% pct, n=10 -> band 4 (>=65).
      expect(missDirCells[0]!.textContent).toContain('70%');
      expect(missDirCells[0]!.textContent).toContain('n=10');
      expect(missDirCells[0]!.className).toContain('bg-ramp-4');
      // Long: 33% pct, n=6 -> band 1 (<35).
      expect(missDirCells[1]!.textContent).toContain('33%');
      expect(missDirCells[1]!.className).toContain('bg-ramp-1');
      // Left/Right never happened -> omitted, honest em-dash + band 0 (no badge).
      expect(missDirCells[2]!.textContent).toContain('—');
      expect(missDirCells[2]!.textContent).not.toContain('n=');
      expect(missDirCells[2]!.className).toContain('bg-surface-sunken');
    });

    it('renders the share-of-misses distribution via RailBars', () => {
      renderShortGame({ detailedStats: fixtureStats() });
      fireEvent.click(screen.getByRole('radio', { name: 'Misses' }));
      const railBars = document.querySelector<HTMLElement>('[data-slot="rail-bars"]')!;
      expect(within(railBars).getByText('Short')).toBeInTheDocument();
      expect(within(railBars).getByText('50%')).toBeInTheDocument();
      expect(within(railBars).getByText('Long')).toBeInTheDocument();
      expect(within(railBars).getByText('30%')).toBeInTheDocument();
      // Right had zero direction-tagged attempts -> honest em-dash, not "0%".
      expect(within(railBars).getByText('Right')).toBeInTheDocument();
      expect(within(railBars).getAllByText('—').length).toBeGreaterThan(0);
    });

    it('renders up-and-down by lie including the new Fringe column', () => {
      renderShortGame({ detailedStats: fixtureStats() });
      fireEvent.click(screen.getByRole('radio', { name: 'Misses' }));

      expect(screen.getByText('Up-and-down by lie')).toBeInTheDocument();
      const matrices = document.querySelectorAll<HTMLElement>('[data-slot="ramp-matrix"]');
      const lieMatrix = matrices[1]!;
      expect(within(lieMatrix).getByText('Fringe')).toBeInTheDocument();

      const cells = lieMatrix.querySelectorAll('td');
      // Fairway 60% n=10 -> band 3 (>=50, <65).
      expect(cells[0]!.textContent).toContain('60%');
      expect(cells[0]!.textContent).toContain('n=10');
      // Fringe (4th column) 20% n=4 -> band 1 (<35).
      expect(cells[3]!.textContent).toContain('20%');
      expect(cells[3]!.textContent).toContain('n=4');
      expect(cells[3]!.className).toContain('bg-ramp-1');
    });

    it('renders average chip proximity overall and by lie', () => {
      renderShortGame({ detailedStats: fixtureStats() });
      fireEvent.click(screen.getByRole('radio', { name: 'Misses' }));

      expect(screen.getByText('Proximity after the chip')).toBeInTheDocument();
      expect(screen.getByText('Overall')).toBeInTheDocument();
      // Readout values render with the configured max 1 decimal + unit suffix.
      expect(screen.getByText(/6\.4/)).toBeInTheDocument();
    });

    it('shows an honest "no data" proximity state when no chip has reached the green', () => {
      renderShortGame({
        detailedStats: fixtureStats({
          atgProximityAvg: null,
          atgProximityByLie: { fairway: null, rough: null, sand: null },
        }),
      });
      fireEvent.click(screen.getByRole('radio', { name: 'Misses' }));
      expect(screen.getAllByText('No chips on the green').length).toBeGreaterThan(0);
    });
  });
});
