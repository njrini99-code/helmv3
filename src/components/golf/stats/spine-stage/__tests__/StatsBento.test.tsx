// @vitest-environment jsdom
/**
 * ============================================================================
 * StatsBento — Standing pin preview + Scoring trend mini-viz coverage
 * ----------------------------------------------------------------------------
 * Regression coverage for "no bento cell is ever text-only": the Standing
 * cell (span2, previously headline+sentence with zero visual) carries a
 * bare `StandingBars` readout for `sg_total` (`StandingPinPreview` —
 * replaced 2026-09-10, its own hand-rolled 11px dot marker was the one
 * dot-on-a-rail render in this sweep no `StandingTrack`/`StandingBar` `rg`
 * search would have caught), and the Scoring cell gets a Sparkline+
 * TrendChip row ahead of its existing `DivergingBars`. Both are pure-render
 * assertions against real data — no mocked internals beyond `useStage`
 * (StageRouter context isn't mounted in this test, same pattern the module
 * kit's own consumers use for a bare unit render).
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/fairway/modules', async () => {
  const actual = await vi.importActual<typeof import('@/components/fairway/modules')>(
    '@/components/fairway/modules',
  );
  return { ...actual, useStage: () => ({ open: vi.fn(), home: vi.fn() }) };
});

import { StatsBento } from '../StatsBento';
import type { PlayerStandingRow } from '@/app/golf/actions/stats-leak-maps-types';
import type { TrendAnalysisResponse } from '@/app/golf/actions/stats-data-types';
import type { StatisticalStrengthWeakness } from '@/lib/golf/strokes-gained';

function row(overrides: Partial<PlayerStandingRow> & { metric_id: string; player_value: number }): PlayerStandingRow {
  return {
    team_avg: null,
    team_n: 0,
    team_pct: null,
    pga_value: 0,
    pga_delta: null,
    ...overrides,
  };
}

describe('StatsBento — Standing pin preview', () => {
  it('renders an honest empty state (no fabricated readout) when sg_total is missing', () => {
    render(
      <StatsBento
        detailedStats={null}
        standingByMetric={new Map()}
        trendData={null}
        strengths={[]}
        weaknesses={[]}
        leakArea="putting"
      />,
    );
    expect(screen.getByText('Fills in after 5+ rounds')).toBeInTheDocument();
    expect(screen.queryByText('SG: Total')).not.toBeInTheDocument();
  });

  it('renders a bare StandingBars with You/Team/Field Avg rows when sg_total exists', () => {
    const standing = new Map<string, PlayerStandingRow>([
      ['sg_total', row({ metric_id: 'sg_total', player_value: 0.42, team_avg: 0.1, team_n: 8, team_pct: 60 })],
    ]);
    const { container } = render(
      <StatsBento
        detailedStats={null}
        standingByMetric={standing}
        trendData={null}
        strengths={[]}
        weaknesses={[]}
        leakArea="putting"
      />,
    );
    const preview = container.querySelector('[data-slot="standing-pin-preview"]') as HTMLElement;
    const figure = preview.querySelector('[data-slot="standing-bars"]') as HTMLElement;
    expect(figure).toBeTruthy();
    // Bare (no nested card) — this cell already sits on the bento's own
    // `bg-surface` tile.
    expect(figure.getAttribute('data-frame')).toBe('bare');
    expect(screen.getByText('SG: Total')).toBeInTheDocument();

    const rowsBlock = figure.querySelector('[data-slot="standing-bars-rows"]') as HTMLElement;
    expect(rowsBlock.textContent).toContain('You');
    expect(rowsBlock.textContent).toContain('Team');
    // sg_* metrics always compare against "Field Avg", never "Tour"/"PGA" —
    // the same `pgaReferenceLabel` convention every other sg_* consumer uses.
    expect(rowsBlock.textContent).toContain('Field Avg');
    // formatValue('strokes') is plain fixed-2dp — no signed "+" prefix.
    expect(rowsBlock.textContent).toContain('0.42');
  });

  it('omits the Team row when there is no team average (cold-start), but still renders Field Avg', () => {
    const standing = new Map<string, PlayerStandingRow>([
      ['sg_total', row({ metric_id: 'sg_total', player_value: -0.6 })],
    ]);
    const { container } = render(
      <StatsBento
        detailedStats={null}
        standingByMetric={standing}
        trendData={null}
        strengths={[]}
        weaknesses={[]}
        leakArea="putting"
      />,
    );
    const preview = container.querySelector('[data-slot="standing-pin-preview"]') as HTMLElement;
    const figure = preview.querySelector('[data-slot="standing-bars"]') as HTMLElement;
    const rowsBlock = figure.querySelector('[data-slot="standing-bars-rows"]') as HTMLElement;
    expect(rowsBlock.textContent).not.toContain('Team');
    expect(rowsBlock.textContent).toContain('Field Avg');
    expect(rowsBlock.textContent).toContain('-0.60');
  });
});

describe('StatsBento — Standing cell chip/headline pairing', () => {
  function category(
    label: string,
    overrides: Partial<StatisticalStrengthWeakness> = {},
  ): StatisticalStrengthWeakness {
    return {
      category: label,
      subcategory: 'putting',
      label,
      detail: '',
      strokeImpact: 0,
      playerValue: 0,
      benchmark: 0,
      unit: 'strokes/round',
      confidence: 1,
      ...overrides,
    };
  }

  it('labels the weakest category as a leak, never as the player’s best', () => {
    render(
      <StatsBento
        detailedStats={null}
        standingByMetric={new Map()}
        trendData={null}
        strengths={[category('SG Approach', { subcategory: 'approach' })]}
        weaknesses={[category('SG Putting')]}
        leakArea="putting"
      />,
    );

    const headline = screen.getByText('SG Putting');
    const cell = headline.closest('[data-slot="bento-cell"]')!;
    expect(cell).toHaveTextContent('Leak');
    expect(cell).not.toHaveTextContent('Best');
  });

  it('falls back to the strongest category when there is no weakness to report', () => {
    render(
      <StatsBento
        detailedStats={null}
        standingByMetric={new Map()}
        trendData={null}
        strengths={[category('SG Approach', { subcategory: 'approach' })]}
        weaknesses={[]}
        leakArea="putting"
      />,
    );

    const headline = screen.getByText('SG Approach');
    expect(headline.closest('[data-slot="bento-cell"]')).toHaveTextContent('Best');
  });
});

describe('StatsBento — Scoring cell trend mini-viz', () => {
  function fixtureTrend(): TrendAnalysisResponse {
    return {
      rounds: [],
      trends: {
        score: [
          { date: '2026-01-01', value: 3, roundId: 'r1', courseName: 'c' },
          { date: '2026-01-08', value: 1, roundId: 'r2', courseName: 'c' },
          { date: '2026-01-15', value: -1, roundId: 'r3', courseName: 'c' },
        ],
        gir: [],
        fairway: [],
        putts: [],
      },
      rollingAverages: { score5: [], score10: [], score20: [] },
      periodComparison: {
        windowDays: 30,
        last30Days: { roundCount: 3, scoringAvg: 74, girPct: 58, fairwayPct: 62, puttsPerRound: 30 },
        previous30Days: { roundCount: 3, scoringAvg: 76, girPct: 55, fairwayPct: 60, puttsPerRound: 31 },
      },
      personalBests: { bestScore: null, longestDrive: null, mostBirdies: null } as never,
    } as unknown as TrendAnalysisResponse;
  }

  it('renders an improving TrendChip when the score-to-par series falls (lower is better)', () => {
    render(
      <StatsBento
        detailedStats={null}
        standingByMetric={new Map()}
        trendData={fixtureTrend()}
        strengths={[]}
        weaknesses={[]}
        leakArea="putting"
      />,
    );
    // Score-to-par went 3 -> -1 (oldest -> newest): a 4-stroke IMPROVEMENT
    // (lower is better), rendered as the signed magnitude "−4.0".
    const chip = screen.getByText('−4.0');
    expect(chip.closest('[data-slot="trend-chip"]')).toHaveAttribute('data-direction', 'improving');
  });

  it('still renders a real Sparkline (never a text-only cell) when there is no trend data at all', () => {
    const { container } = render(
      <StatsBento
        detailedStats={null}
        standingByMetric={new Map()}
        trendData={null}
        strengths={[]}
        weaknesses={[]}
        leakArea="putting"
      />,
    );
    const sparkline = container.querySelector('[data-slot="sparkline"]');
    expect(sparkline).not.toBeNull();
    expect(sparkline).toHaveAttribute('data-state', 'insufficient-data');
  });
});
