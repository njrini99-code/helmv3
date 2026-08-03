import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const getIntentRanking = vi.fn();
vi.mock('@/app/golf/actions/crm-intent', () => ({
  getIntentRanking: (...args: unknown[]) => getIntentRanking(...args),
}));

import { IntentRankingPanel } from './IntentRankingPanel';

function makeCoach(overrides: Partial<{
  coach_id: string; name: string; school: string | null; stage: string;
  demo_visits: number; replies: number; opens: number; intent_score: number;
  last_intent_at: string | null;
}> = {}) {
  return {
    coach_id: 'c1', name: 'Jamie Coach', school: 'State U', stage: 'contacted',
    demo_visits: 2, replies: 1, opens: 3, intent_score: 14,
    last_intent_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('IntentRankingPanel', () => {
  beforeEach(() => { getIntentRanking.mockReset(); });

  it('shows a loading skeleton before the fetch resolves', () => {
    getIntentRanking.mockReturnValue(new Promise(() => {}));
    render(<IntentRankingPanel onCoachClick={() => {}} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders demo_visits and replies for a ranked coach, and never renders a click count', async () => {
    getIntentRanking.mockResolvedValue({ coaches: [makeCoach()], totalQualifying: 1 });
    render(<IntentRankingPanel onCoachClick={() => {}} />);
    expect(await screen.findByText('Jamie Coach')).toBeInTheDocument();
    expect(screen.getByText('State U')).toBeInTheDocument();
    expect(screen.getByText(/2 demo visits/)).toBeInTheDocument();
    expect(screen.getByText(/1 reply/)).toBeInTheDocument();
    expect(screen.queryByText(/click/i)).not.toBeInTheDocument();
  });

  it('renders a distinct error state (not the empty state) when the fetch rejects', async () => {
    getIntentRanking.mockRejectedValue(new Error('permission denied for view v_crm_coach_signal_summary'));
    render(<IntentRankingPanel onCoachClick={() => {}} />);
    expect(await screen.findByText("Couldn't load intent ranking")).toBeInTheDocument();
    expect(screen.getByText(/permission denied/)).toBeInTheDocument();
    expect(screen.queryByText(/no real intent signal/i)).not.toBeInTheDocument();
  });

  it('renders an honest empty state when the query succeeds with zero rows', async () => {
    getIntentRanking.mockResolvedValue({ coaches: [], totalQualifying: 0 });
    render(<IntentRankingPanel onCoachClick={() => {}} />);
    expect(await screen.findByText(/no real intent signal yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/couldn't load/i)).not.toBeInTheDocument();
  });

  it('calls onCoachClick with the coach_id when a row is clicked', async () => {
    getIntentRanking.mockResolvedValue({
      coaches: [makeCoach({ coach_id: 'coach-42', name: 'Alex Coach', demo_visits: 1, replies: 0, opens: 0 })],
      totalQualifying: 1,
    });
    const onCoachClick = vi.fn();
    const user = userEvent.setup();
    render(<IntentRankingPanel onCoachClick={onCoachClick} />);
    await user.click(await screen.findByText('Alex Coach'));
    expect(onCoachClick).toHaveBeenCalledWith('coach-42');
  });
});
