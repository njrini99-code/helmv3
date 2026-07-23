// @vitest-environment jsdom
/**
 * ============================================================================
 * GenomeDetailView — "Not tracked" vs "Needs more rounds" dimension cells
 * ----------------------------------------------------------------------------
 * The `weather_sensitivity_stub` genome dimension is a PERMANENT stub — no
 * weather/temperature data source exists at all, so it can never resolve no
 * matter how many rounds a player logs. Every other locked dimension in the
 * grid genuinely just needs more sample size and WILL resolve. Before this
 * fix, both rendered the identical "Needs more rounds" + lock-icon cell,
 * silently promising coaches the weather spoke would eventually fill in.
 *
 * This pins:
 *   - the weather cell renders a distinct "Not tracked" treatment (its own
 *     aria-label, a dash/off icon instead of a lock, and the honest
 *     "Awaiting weather data" copy from the dimension's own compute()),
 *   - an ordinary calibrating dimension keeps the existing "Needs more
 *     rounds" + lock-icon treatment, unchanged,
 *   - the two are never rendered identically.
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GenomeDetailView } from './GenomeDetailView';
import { GENOME_DIMENSIONS } from '@/lib/coachhelm/v3/genome/registry';
import type { GenomeVector } from '@/lib/coachhelm/v3/genome/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/golf/dashboard/coachhelm/genome/player-1',
}));

// Presentation-only passthrough — this suite targets the dimension grid, not
// the shell chrome (mirrors the established pattern in
// FairwayCoachHelmSignals.lifecycle.integration.test.tsx).
vi.mock('./CoachHelmShell', () => ({
  CoachHelmShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function emptyVector(): GenomeVector {
  // Every dimension locked (value: null) — including weather, whose own
  // compute() always returns `{ value: null, label: 'Awaiting weather data' }`.
  // Keeping every dim locked also keeps live-dim count under 3, so the hero
  // renders the InsufficientData fallback instead of mounting the recharts
  // GenomeRadar (irrelevant to this suite, and recharts needs a
  // getBoundingClientRect stub jsdom doesn't provide by default).
  const vector: GenomeVector = {};
  for (const dim of GENOME_DIMENSIONS) {
    vector[dim.id] = dim.compute({
      player_id: 'player-1',
      recent_rounds_count: 0,
      rounds: [],
      hole_scores: [],
      shots: [],
    });
  }
  return vector;
}

describe('GenomeDetailView — dimension grid: not-tracked vs calibrating', () => {
  it('renders the weather stub as "Not tracked" — distinct from an ordinary calibrating dim', () => {
    render(
      <GenomeDetailView
        playerId="player-1"
        playerName="Test Player"
        genome={{ vector: emptyVector(), computed_at: new Date().toISOString(), rounds_basis: 2 }}
        persona={null}
      />,
    );

    // The permanent stub: its own aria-label + the honest "Awaiting weather
    // data" copy sourced straight from the dimension's compute() output.
    const weatherCell = screen.getByLabelText('Weather sensitivity: not tracked');
    expect(weatherCell).toBeInTheDocument();
    expect(weatherCell.textContent).toContain('Awaiting weather data');

    // An ordinary locked dim (e.g. miss_side_bias, needs more rounds — WILL
    // resolve with more sample size) keeps the pre-existing treatment.
    const missBiasDim = GENOME_DIMENSIONS.find((d) => d.id === 'miss_side_bias')!;
    const calibratingCell = screen.getByLabelText(`${missBiasDim.label}: needs more rounds`);
    expect(calibratingCell).toBeInTheDocument();
    expect(calibratingCell.textContent).toContain('Needs more rounds');

    // Never rendered identically.
    expect(weatherCell.textContent).not.toEqual(calibratingCell.textContent);
    expect(
      screen.queryByLabelText('Weather sensitivity: needs more rounds'),
    ).not.toBeInTheDocument();
  });
});
