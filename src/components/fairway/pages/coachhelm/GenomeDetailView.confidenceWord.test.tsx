// @vitest-environment jsdom
/**
 * NUM-08: Genome persona rows print confidence as a word ("Solid read"),
 * never a percentage. The engine's confidence is a sample-size ramp, and
 * "100%" read as certainty about the claim.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GenomeDetailView } from './GenomeDetailView';
import { GENOME_DIMENSIONS } from '@/lib/coachhelm/v3/genome/registry';
import type { GenomeVector } from '@/lib/coachhelm/v3/genome/types';

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
    vector[dim.id] = dim.compute({ player_id: 'player-1', recent_rounds_count: 0, rounds: [], hole_scores: [], shots: [] });
  }
  return vector;
}

describe('GenomeDetailView persona confidence (NUM-08)', () => {
  it('prints a confidence word and no percentage', () => {
    render(
      <GenomeDetailView
        playerId="player-1"
        playerName="Luke Wise"
        genome={{ vector: emptyVector(), computed_at: new Date().toISOString(), rounds_basis: 12 }}
        persona={{
          strengths: [
            { dim_id: 'scrambling_rate', label: 'Scrambling', qualitative: 'Wizard', value: 0.6, confidence: 1 },
            { dim_id: 'par3_proficiency', label: 'Par 3s', qualitative: null, value: 3.1, confidence: 0.5 },
          ],
          watchouts: [],
          course_profile: 'Plays short courses well',
        }}
      />,
    );
    expect(screen.getAllByText('Solid read').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Early read').length).toBeGreaterThan(0);
    expect(screen.queryByText('100%')).toBeNull();
    expect(screen.queryByText('50%')).toBeNull();
  });
});
