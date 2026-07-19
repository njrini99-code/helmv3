/**
 * Regression test for #89 — the qualifier's PLAY status (`status`:
 * upcoming/in_progress/completed) and its SELECTION workflow state
 * (`selectionState`: open/scoring/closed/selected) are two independent state
 * machines (see qualifier-status.ts header + FairwayQualifyingWorkspace.tsx's
 * own "SEPARATE state machine" comment). A coach who reads "Completed" in
 * this page's masthead, then clicks through to the Selection Workspace and
 * sees "Open · accepting entries" for the SAME qualifier, previously got no
 * warning here that the two track separately — it read as a silent
 * contradiction rather than two deliberately independent axes.
 *
 * This does NOT reconcile the two surfaces (FairwayQualifyingWorkspace.tsx —
 * the actual Selection Workspace — is outside this package's file ownership;
 * see round-2 stillOpen notes), but it guards against the mismatch reading as
 * an unexplained bug by naming it explicitly before the coach navigates.
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

import { FairwayQualifierDetail, type FairwayQualifierDetailProps } from '../FairwayQualifierDetail';

function baseProps(
  overrides: Partial<FairwayQualifierDetailProps> = {},
): FairwayQualifierDetailProps {
  return {
    qualifierId: 'q1',
    isCoach: true,
    isPlayer: false,
    name: 'Conference Qualifier',
    status: 'upcoming',
    startDate: '2026-07-01',
    endDate: null,
    entryDeadline: null,
    courseName: null,
    spotsAvailable: null,
    rules: null,
    entrantCount: 2,
    roundsSubmitted: 0,
    canPlayRound: false,
    breakdown: [],
    maxRoundNumber: 0,
    numRounds: 1,
    roundCourses: [],
    selectionState: 'open',
    selectionSlotsTotal: 4,
    selectionSlotsCoachPick: 1,
    selectionsCount: 0,
    ...overrides,
  };
}

describe('FairwayQualifierDetail — selection/play state mismatch note (#89)', () => {
  it('warns when play status is Completed but the roster selection has not reached "selected"', () => {
    mockUseQualifierRealtime.mockReturnValue({
      leaderboard: [],
      qualifier: { status: 'completed' },
      loading: false,
      error: null,
    });

    render(
      <FairwayQualifierDetail
        {...baseProps({ status: 'completed', selectionState: 'closed', selectionsCount: 0 })}
      />,
    );

    expect(screen.getByText(/selection workflow hasn.t caught up/i)).toBeTruthy();
    expect(screen.getByText(/still/i)).toBeTruthy();
  });

  it('does not warn once the roster has been committed (selectionState "selected")', () => {
    mockUseQualifierRealtime.mockReturnValue({
      leaderboard: [],
      qualifier: { status: 'completed' },
      loading: false,
      error: null,
    });

    render(
      <FairwayQualifierDetail
        {...baseProps({ status: 'completed', selectionState: 'selected', selectionsCount: 4 })}
      />,
    );

    expect(screen.queryByText(/selection workflow hasn.t caught up/i)).toBeNull();
  });

  it('does not warn for a non-completed qualifier regardless of selection state', () => {
    mockUseQualifierRealtime.mockReturnValue({
      leaderboard: [],
      qualifier: { status: 'in_progress' },
      loading: false,
      error: null,
    });

    render(
      <FairwayQualifierDetail
        {...baseProps({ status: 'in_progress', selectionState: 'open', selectionsCount: 0 })}
      />,
    );

    expect(screen.queryByText(/selection workflow hasn.t caught up/i)).toBeNull();
  });

  it('is player-invisible — the coach-only selections strip never renders for a player', () => {
    mockUseQualifierRealtime.mockReturnValue({
      leaderboard: [],
      qualifier: { status: 'completed' },
      loading: false,
      error: null,
    });

    render(
      <FairwayQualifierDetail
        {...baseProps({
          isCoach: false,
          isPlayer: true,
          status: 'completed',
          selectionState: 'closed',
          selectionsCount: 0,
        })}
      />,
    );

    expect(screen.queryByText(/selection workflow hasn.t caught up/i)).toBeNull();
  });
});
