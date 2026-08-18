// @vitest-environment jsdom
/**
 * ============================================================================
 * GenomeCompareView — the head-to-head compare shows how old its data is
 * ----------------------------------------------------------------------------
 * `loadGenomes` selects `computed_at` and `rounds_basis`
 * (genome/loader.ts:61) and returns both on every `LoadedGenome`.
 * `GenomeDetailView` renders them — "N rounds · last refreshed {ago}" plus a
 * dedicated `RefreshedReadout`. The compare route then builds its props as
 *
 *     { playerId, name, vector: a ? a.vector : null }
 *
 * dropping both fields at the boundary, and `CompareSeries` has no slot for
 * them. So the two-up comparison renders genome vectors with nothing anywhere
 * on the surface saying when they were computed.
 *
 * That is live and it is not a rounding error. Measured 2026-08-17,
 * `golf_player_genome` holds 51 rows whose newest `computed_at` is 2026-07-07
 * — 41 days old, because the nightly cron reported success 47 times while
 * writing nothing (fixed on main in 2e0632326, not yet deployed). A coach
 * opening the single-player view is told "last refreshed Jul 7, 2026". The same
 * coach putting those two players side by side to decide who travels sees the
 * identical six-week-old numbers presented as current.
 *
 * Third instance of the same shape in this repo: a derived extract silently
 * drops a field its loader went to the trouble of selecting, and the surface
 * that lost it is the one used to make the decision.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GenomeCompareView } from './GenomeCompareView';
import { GENOME_DIMENSIONS } from '@/lib/coachhelm/v3/genome/registry';
import type { GenomeVector } from '@/lib/coachhelm/v3/genome/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/golf/dashboard/coachhelm/genome/compare',
}));

// Presentation-only passthrough — this suite targets the compare surface, not
// the shell chrome. Mirrors GenomeDetailView.notTracked.test.tsx.
vi.mock('./CoachHelmShell', () => ({
  CoachHelmShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

/** Every dimension locked — keeps the live-dim count under the radar/chart
 *  threshold so this suite never depends on a recharts measurement jsdom
 *  cannot provide. Freshness must render regardless of how many dims resolved. */
function lockedVector(): GenomeVector {
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

// The real production value: newest computed_at across all 51 rows.
const STALE_ISO = '2026-07-07T08:12:00.000Z';

function renderCompare(over: {
  aComputedAt?: string | null;
  bComputedAt?: string | null;
  aRounds?: number | null;
} = {}) {
  return render(
    <GenomeCompareView
      roster={[
        { id: 'p1', name: 'Cole Bennett' },
        { id: 'p2', name: 'Mason Rivers' },
      ]}
      p1="p1"
      p2="p2"
      seriesA={{
        playerId: 'p1',
        name: 'Cole Bennett',
        vector: lockedVector(),
        computedAt: over.aComputedAt === undefined ? STALE_ISO : over.aComputedAt,
        roundsBasis: over.aRounds === undefined ? 12 : over.aRounds,
      }}
      seriesB={{
        playerId: 'p2',
        name: 'Mason Rivers',
        vector: lockedVector(),
        computedAt: over.bComputedAt === undefined ? STALE_ISO : over.bComputedAt,
        roundsBasis: 9,
      }}
    />,
  );
}

describe('GenomeCompareView — data freshness', () => {
  it('states when each genome was last computed', () => {
    renderCompare();
    // Two players, two independently-computed genomes: a coach must be able to
    // tell that one side is stale without inferring it from the other.
    expect(screen.getAllByText(/Jul 7, 2026/).length).toBeGreaterThanOrEqual(2);
  });

  it('does not claim freshness it was not given', () => {
    // `formatAgo(null)` in GenomeDetailView returns "just now" — the most
    // reassuring possible string for missing data. Whatever the compare
    // surface renders for an unknown timestamp, it must not be that.
    renderCompare({ aComputedAt: null, bComputedAt: null });
    expect(screen.queryByText(/just now/i)).toBeNull();
  });

  it('carries the rounds the genome was built from, like the detail view does', () => {
    // "12 rounds · last refreshed …" is the detail view's caption. A vector
    // computed from 12 rounds and one computed from 9 are not equally
    // trustworthy, and a head-to-head is exactly where that matters.
    renderCompare();
    expect(screen.getByText(/12 rounds/)).toBeInTheDocument();
    expect(screen.getByText(/9 rounds/)).toBeInTheDocument();
  });

  it('renders no freshness line for a player with no genome at all', () => {
    render(
      <GenomeCompareView
        roster={[{ id: 'p1', name: 'Cole Bennett' }, { id: 'p2', name: 'Mason Rivers' }]}
        p1="p1"
        p2="p2"
        seriesA={{
          playerId: 'p1',
          name: 'Cole Bennett',
          vector: null,
          computedAt: null,
          roundsBasis: null,
        }}
        seriesB={{
          playerId: 'p2',
          name: 'Mason Rivers',
          vector: lockedVector(),
          computedAt: STALE_ISO,
          roundsBasis: 9,
        }}
      />,
    );
    // The "no genome computed" chip already covers this player; a refreshed
    // line would be claiming a computation that never happened.
    expect(screen.getAllByText(/Jul 7, 2026/).length).toBe(1);
  });
});
