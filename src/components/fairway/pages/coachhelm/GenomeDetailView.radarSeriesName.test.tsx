// @vitest-environment jsdom
/**
 * ============================================================================
 * GenomeDetailView — the hero radar's series name (Package 11)
 * ----------------------------------------------------------------------------
 * The plotted value is normalizeForRadar()'s per-dimension [0,1] "good-axis"
 * score (lib/coachhelm/v3/genome/normalize.ts) rounded to 0-100 — a linear or
 * symmetric mapping specific to each dimension (e.g. `1 - |miss_side_bias|`,
 * a fixed [-3, 3] → [0, 1] map for pressure_delta), never a rank against a
 * population. Labeling it "Percentile" claims a statistical meaning the value
 * doesn't have. Every other GenomeRadar caller already overrides the shared
 * primitive's misleading "Percentile" default to "Score"
 * (ProfileDrill.tsx, FairwayMyGameProfile.tsx) — GenomeDetailView was the one
 * caller left on the default.
 * ========================================================================== */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GenomeDetailView } from './GenomeDetailView';
import type { GenomeVector } from '@/lib/coachhelm/v3/genome/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/golf/dashboard/coachhelm/genome/player-1',
}));

vi.mock('./CoachHelmShell', () => ({
  CoachHelmShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

/** 3 live dimensions — the radar's own `enough` floor (needs >= 3 to plot). */
function threeLiveDimsVector(): GenomeVector {
  return {
    miss_side_bias: { value: 0.1, confidence: 0.9 },
    scrambling_rate: { value: 0.55, confidence: 0.9 },
    driver_usage: { value: 0.6, confidence: 0.9 },
  };
}

describe('GenomeDetailView — hero radar series name', () => {
  it('labels the plotted value "Score", not "Percentile"', () => {
    render(
      <GenomeDetailView
        playerId="player-1"
        playerName="Test Player"
        genome={{ vector: threeLiveDimsVector(), computed_at: new Date().toISOString(), rounds_basis: 6 }}
        persona={null}
      />,
    );

    // The accessible table fallback carries the series name as a column
    // header (GenomeRadar → ChartFrame's `tableData.columns[1].label`).
    const toggle = screen.getAllByRole('button', { name: 'View as table' })[0];
    expect(toggle).toBeDefined();
    fireEvent.click(toggle!);

    expect(screen.getByRole('columnheader', { name: 'Score' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Percentile' })).toBeNull();
  });
});
