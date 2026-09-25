// @vitest-environment jsdom
/**
 * FairwayPlayerInsight (Scouting tab) opens summary first: one card carrying
 * the rating, verdict and standing bars; the plan, tracking and trajectory
 * sit closed; "Message player" is the one primary action.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FairwayPlayerInsight } from './FairwayPlayerInsight';
import { GolfUserProvider, type GolfUserData } from '@/contexts/golf-user-context';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/app/golf/actions/insight-delivery', () => ({ getInsightsForCoach: vi.fn().mockResolvedValue([]) }));
vi.mock('@/app/golf/actions/insight-attribution', () => ({ getInsightAttributionReadout: vi.fn().mockResolvedValue(null) }));
vi.mock('@/app/golf/actions/insights', () => ({
  acknowledgeInsight: vi.fn(),
  dismissInsight: vi.fn(),
  refreshPlayerAnalysisAsCoach: vi.fn(),
}));
vi.mock('@/app/golf/actions/development', () => ({ createFocusAreaFromInsight: vi.fn() }));
vi.mock('@/components/golf/coachhelm/coach', () => ({
  PrescribedPracticePlanCard: () => <div data-testid="plan-card" />,
}));
vi.mock('@/components/golf/coachhelm/player/TrajectoryCard', () => ({
  TrajectoryCard: () => <div data-testid="trajectory-card" />,
}));

const coachUser: GolfUserData = { role: 'coach', userId: 'u-coach', name: 'Coach X', coachId: 'c-1' };

function renderScouting(rounds: unknown[]) {
  return render(
    <GolfUserProvider userData={coachUser}>
      <FairwayPlayerInsight
        player={{ id: 'p1', first_name: 'Owen', last_name: 'Reed', avatar_url: null, graduation_year: 2027, handicap: 2.1 }}
        compositeRating={72}
        categoryBreakdown={{ teeGame: 80, approach: 55, shortGame: 60, putting: 70, scoring: 65 }}
        trendSummary={{ trend: 'stable', recentAvg: 74, previousAvg: 74, streakCount: 0, streakType: 'neutral' }}
        playerStatus="Stable"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rounds={rounds as any}
        patterns={[]}
        insights={[]}
        focusAreas={[]}
        predictions={[]}
        themes={[]}
        embedded
      />
    </GolfUserProvider>,
  );
}

const round = {
  id: 'r1',
  created_at: '2026-09-01T00:00:00Z',
  round_date: '2026-09-01',
  total_score: 74,
  holes_played: 18,
  course_name: 'Kiawah',
  score_to_par: 2,
  total_fairways_hit: 9,
  total_gir: 11,
  total_putts: 30,
};

describe('FairwayPlayerInsight summary-first layout', () => {
  it('carries the standing bars inside the summary card', () => {
    const { container } = renderScouting([round]);
    const standing = container.querySelector('[data-slot="scouting-standing"]');
    expect(standing).not.toBeNull();
    expect(standing).toHaveTextContent('Approach');
  });

  it('shows no standing bars for a player with no rounds', () => {
    const { container } = renderScouting([]);
    expect(container.querySelector('[data-slot="scouting-standing"]')).toBeNull();
    expect(screen.getByText('Awaiting first round')).toBeInTheDocument();
  });

  it('keeps the plan, tracking and trajectory closed until asked for', () => {
    renderScouting([round]);
    expect(screen.queryByTestId('plan-card')).toBeNull();
    expect(screen.queryByTestId('trajectory-card')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /The plan/ }));
    expect(screen.getByTestId('plan-card')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /What we’re tracking/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('has one primary action: Message player', () => {
    const { container } = renderScouting([round]);
    const primaries = [...container.querySelectorAll('[data-variant="primary"]')];
    expect(primaries).toHaveLength(1);
    expect(primaries[0]).toHaveTextContent('Message player');
  });
});
