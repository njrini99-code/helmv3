/**
 * Regression tests for the leaderboard's mobile treatment (P29) and the
 * completed-but-empty state (P91).
 *
 * P29 — below `md`, the standings table used to sit in a bare
 * `overflow-x-auto` wrapper with no scroll affordance, so a phone user saw
 * only POS/PLAYER/ROUNDS (whatever fit the viewport) with no visual cue that
 * AVG/TOTAL/TO PAR existed off-screen. Fixed with a real phone card list
 * (Rule 8) that carries all four competitive columns, alongside the
 * unchanged `md+` table.
 *
 * P91 — a `completed` qualifier with zero scored rounds showed the same
 * forward-looking "Awaiting first round" copy as a qualifier that hasn't
 * started yet. Fixed with an honest completed-with-no-data message.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockUseQualifierRealtime = vi.fn();

vi.mock('@/hooks/golf/use-qualifier-realtime', () => ({
  useQualifierRealtime: (...args: unknown[]) => mockUseQualifierRealtime(...args),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { selection_state: 'open' } }),
        }),
      }),
    }),
  }),
}));

import { FairwayQualifierLeaderboard } from '../FairwayQualifierLeaderboard';

function scoredEntry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'e1',
    qualifier_id: 'q1',
    player_id: 'p1',
    player_name: 'Ada Lovelace',
    position: 1,
    score: 72,
    total_score: 72,
    total_to_par: -1,
    rounds_completed: 1,
    is_tied: false,
    status: 'active',
    notes: null,
    round_id: null,
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

describe('FairwayQualifierLeaderboard — mobile columns (P29)', () => {
  it('renders a phone card list carrying Rounds/Avg/Total/To-par (never a silent drop)', () => {
    mockUseQualifierRealtime.mockReturnValue({
      leaderboard: [scoredEntry()],
      qualifier: { status: 'in_progress' },
      loading: false,
      error: null,
    });

    const { container } = render(
      <FairwayQualifierLeaderboard qualifierId="q1" entrantCount={1} />,
    );

    const phoneList = container.querySelector('ul.md\\:hidden');
    expect(phoneList).toBeTruthy();
    expect(phoneList?.textContent).toContain('Ada Lovelace');
    expect(phoneList?.textContent).toContain('Rounds');
    expect(phoneList?.textContent).toContain('Avg');
    expect(phoneList?.textContent).toContain('Total');
    expect(phoneList?.textContent).toMatch(/to par/i);

    // The md+ table still exists, untouched, behind `hidden md:block`.
    const desktopWrapper = container.querySelector('.hidden.md\\:block');
    expect(desktopWrapper?.querySelector('table')).toBeTruthy();
  });
});

describe('FairwayQualifierLeaderboard — completed-but-empty state (P91)', () => {
  it('reads as COMPLETED, not "awaiting", when a completed qualifier has zero scored rounds', () => {
    mockUseQualifierRealtime.mockReturnValue({
      leaderboard: [],
      qualifier: { status: 'completed' },
      loading: false,
      error: null,
    });

    render(<FairwayQualifierLeaderboard qualifierId="q1" entrantCount={3} />);

    expect(screen.getByText(/completed/i)).toBeTruthy();
    expect(screen.queryByText(/awaiting first round/i)).toBeNull();
  });

  it('still shows the forward-looking "awaiting" copy for a non-completed qualifier with zero scores', () => {
    mockUseQualifierRealtime.mockReturnValue({
      leaderboard: [],
      qualifier: { status: 'upcoming' },
      loading: false,
      error: null,
    });

    render(<FairwayQualifierLeaderboard qualifierId="q1" entrantCount={3} />);

    expect(screen.getByText(/awaiting first round/i)).toBeTruthy();
  });
});
