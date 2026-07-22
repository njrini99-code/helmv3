// @vitest-environment jsdom
/**
 * ============================================================================
 * StandingDrill — Strokes Gained instrument group + CategoryInsightStrip
 * restyle coverage
 * ----------------------------------------------------------------------------
 * Regression coverage for: (1) all 5 sg_* rows (total + 4 sub-components)
 * render through the SAME aligned instrument group, using the real, fixed
 * `StandingTrack` per row (not a duplicated one-off track), separate from
 * the generic per-category `StandingStrip` grid below it; (2) the "What
 * CoachHelm sees" section renders through the shared `CategoryInsightStrip`
 * instead of the old bespoke `CauseEffectCard` grid, still showing (at most)
 * the top-3 patterns by |strokeImpact|.
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/fairway/modules', async () => {
  const actual = await vi.importActual<typeof import('@/components/fairway/modules')>(
    '@/components/fairway/modules',
  );
  return { ...actual, useStage: () => ({ open: vi.fn(), home: vi.fn() }) };
});

import { StandingDrill } from '../StandingDrill';
import type { PlayerStandingRow } from '@/app/golf/actions/stats-leak-maps-types';

function row(metric_id: string, player_value: number, overrides: Partial<PlayerStandingRow> = {}): PlayerStandingRow {
  return {
    metric_id,
    player_value,
    team_avg: null,
    team_n: 0,
    team_pct: null,
    pga_value: 0,
    pga_delta: null,
    ...overrides,
  };
}

function sgStandingRows(): PlayerStandingRow[] {
  return [
    row('sg_total', 0.42, { team_avg: 0.1, team_n: 8, team_pct: 60 }),
    row('sg_ott', 0.2, { team_avg: 0.05, team_n: 8, team_pct: 55 }),
    row('sg_approach', -0.3, { team_avg: -0.1, team_n: 8, team_pct: 30 }),
    row('sg_around_green', 0.05),
    row('sg_putting', -0.1),
  ];
}

describe('StandingDrill — Strokes Gained instrument group', () => {
  it('renders all 4 sg_* rows plus the total inside ONE aligned instrument, using the real StandingTrack per row', () => {
    const { container } = render(
      <StandingDrill standingRows={sgStandingRows()} standingViewerContext="self" />,
    );

    const instrument = container.querySelector('[data-slot="sg-instrument"]');
    expect(instrument).not.toBeNull();

    // Every SG display label renders inside the instrument, aligned decimals
    // via formatSgSigned.
    expect(screen.getByText('SG: Total')).toBeInTheDocument();
    expect(screen.getByText('SG: Off the Tee')).toBeInTheDocument();
    expect(screen.getByText('SG: Approach')).toBeInTheDocument();
    expect(screen.getByText('SG: Around the Green')).toBeInTheDocument();
    expect(screen.getByText('SG: Putting')).toBeInTheDocument();
    expect(screen.getByText('+0.42')).toBeInTheDocument();
    expect(screen.getByText('+0.20')).toBeInTheDocument();
    expect(screen.getByText('−0.30')).toBeInTheDocument();

    // Real `StandingTrack` mounted once per row (its own fixed pin/label
    // machinery, not a re-implementation) — 5 pins for 5 rows.
    const pins = instrument!.querySelectorAll('[data-slot="standing-track-pin"]');
    expect(pins).toHaveLength(5);
  });

  it('never renders the SG metrics a second time in the generic per-category StandingStrip grid', () => {
    render(<StandingDrill standingRows={sgStandingRows()} standingViewerContext="self" />);
    // "SG: Total" appears exactly once (inside the instrument) — the old
    // behavior rendered every SG metric a second time as a `StandingStrip`
    // card in the generic per-category grid.
    expect(screen.getAllByText('SG: Total')).toHaveLength(1);
  });

  it('falls back to the honest cold-start message when there is no standing data at all', () => {
    render(<StandingDrill standingRows={[]} standingViewerContext="self" />);
    expect(
      screen.getByText('The full standing board fills in after 5+ rounds with shot detail.'),
    ).toBeInTheDocument();
  });
});

describe('StandingDrill — "What CoachHelm sees" via CategoryInsightStrip', () => {
  function pattern(id: string, strokeImpact: number, description: string) {
    return {
      id,
      strokeImpact,
      description,
      recommendation: null,
      occurrenceCount: 4,
      patternType: 'conditional',
    } as never;
  }

  it('renders the shared CategoryInsightStrip card with the top-3-by-|strokeImpact| patterns', () => {
    const { container } = render(
      <StandingDrill
        standingRows={[]}
        standingViewerContext="self"
        patterns={[
          pattern('p1', -0.3, 'Small leak'),
          pattern('p2', 1.2, 'Biggest gain'),
          pattern('p3', -0.9, 'Second biggest leak'),
          pattern('p4', 0.1, 'Should be dropped — below top 3'),
        ]}
      />,
    );

    const strip = container.querySelector('[data-slot="category-insight-strip"]');
    expect(strip).not.toBeNull();
    expect(screen.getByText('What CoachHelm sees')).toBeInTheDocument();
    expect(screen.getByText('Biggest gain')).toBeInTheDocument();
    expect(screen.getByText('Second biggest leak')).toBeInTheDocument();
    expect(screen.getByText('Small leak')).toBeInTheDocument();
    expect(screen.queryByText('Should be dropped — below top 3')).not.toBeInTheDocument();
  });

  it('renders no "What CoachHelm sees" section at all when there are no impactful patterns', () => {
    const { container } = render(
      <StandingDrill standingRows={[]} standingViewerContext="self" patterns={[]} />,
    );
    expect(container.querySelector('[data-slot="category-insight-strip"]')).toBeNull();
    expect(screen.queryByText('What CoachHelm sees')).not.toBeInTheDocument();
  });
});
