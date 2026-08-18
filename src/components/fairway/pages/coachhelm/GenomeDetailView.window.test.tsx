// @vitest-environment jsdom
/**
 * ============================================================================
 * GenomeDetailView — the rounds basis must name its 90-day window
 * ----------------------------------------------------------------------------
 * Observed in production 2026-08-18, coach Ben Potter viewing Luke Wise
 * (Guilford College Men's Golf). The Genome read:
 *
 *     COMPUTED ON  6 ROUNDS
 *     0 of 8 dimensions live · more land as data matures
 *     MISS-SIDE BIAS / PRESSURE DELTA / ... — "Needs more rounds"
 *
 * while the Game Fingerprint for the SAME player, one tab away, read
 * "Area averages from 16 rounds".
 *
 * Both are correct. `golf_player_genome.rounds_basis` counts only rounds
 * inside `WINDOW_DAYS` (90) — Luke has 16 career rounds but 3 in the trailing
 * 90 days, under the 8-round floor every dimension requires. Verified against
 * production: all_rounds 16, last_90d 3, last_round 2026-07-29.
 *
 * The defect is that NOTHING ON THE SURFACE SAYS SO. A coach reading
 * "Computed on 6 rounds" for a player with 16, next to eight cells insisting
 * he "needs more rounds", concludes the genome is broken or stale — the
 * "out of sync" complaint. The window is the missing word, and it is the
 * difference between a product that looks wrong and one that is legible.
 *
 * This pins the window into the rounds-basis readout so the two surfaces stop
 * silently disagreeing.
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GenomeDetailView } from './GenomeDetailView';
import { GENOME_DIMENSIONS } from '@/lib/coachhelm/v3/genome/registry';
import { GENOME_WINDOW_DAYS, type GenomeVector } from '@/lib/coachhelm/v3/genome/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/golf/dashboard/coachhelm/genome/player-1',
}));

vi.mock('./CoachHelmShell', () => ({
  CoachHelmShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function emptyVector(): GenomeVector {
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

function renderGenome(roundsBasis: number) {
  return render(
    <GenomeDetailView
      playerId="player-1"
      playerName="Luke Wise"
      genome={{
        vector: emptyVector(),
        computed_at: new Date().toISOString(),
        rounds_basis: roundsBasis,
      }}
      persona={null}
    />,
  );
}

describe('GenomeDetailView — rounds basis names its window', () => {
  it('labels the rounds basis as a trailing 90-day window, not a career total', () => {
    renderGenome(6);
    // The window has to appear somewhere in the basis readout — otherwise
    // "6 rounds" reads as the player's career and contradicts the Fingerprint.
    expect(screen.getByText(new RegExp(`last ${GENOME_WINDOW_DAYS} days`, 'i'))).toBeInTheDocument();
  });

  it('still names the window when the basis is zero', () => {
    // The empty state is where a coach is MOST likely to think it is broken.
    renderGenome(0);
    expect(screen.getByText(new RegExp(`last ${GENOME_WINDOW_DAYS} days`, 'i'))).toBeInTheDocument();
  });

  it('exposes the window as a shared constant, not a magic number in the UI', () => {
    expect(GENOME_WINDOW_DAYS).toBe(90);
  });
});
