/**
 * PlayerPracticeClient — the "From your coach" section shows the reviews the
 * server returned for this player and nothing when there are none (the held
 * player-read policy unapplied reads as none).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PlayerPracticeClient } from '@/components/baseball/practice-player/PlayerPracticeClient';
import type { PlayerPracticeView } from '@/app/baseball/actions/practice';

function practice(overrides: Partial<PlayerPracticeView> = {}): PlayerPracticeView {
  return {
    id: 'practice-1',
    title: 'Tuesday plan',
    focus: null,
    publishedAt: null,
    calendarDate: null,
    calendarStartTime: null,
    calendarEndTime: null,
    location: null,
    totalMinutes: 0,
    blocks: [],
    myAttendanceStatus: null,
    coachReviews: [],
    ...overrides,
  };
}

describe('PlayerPracticeClient coach reviews', () => {
  it('shows the coach reviews shared with the player under the open practice', () => {
    render(
      <PlayerPracticeClient
        practices={[
          practice({
            coachReviews: [
              {
                id: 'r1',
                practiceId: 'practice-1',
                focusArea: 'Two-strike approach',
                conclusion: 'Chase rate fell after the two-strike station.',
                verdict: 'worked',
              },
            ],
          }),
        ]}
      />,
    );
    expect(screen.getByRole('region', { name: 'From your coach' })).toBeTruthy();
    expect(screen.getByText('Two-strike approach')).toBeTruthy();
    expect(screen.getByText('Chase rate fell after the two-strike station.')).toBeTruthy();
    expect(screen.getByText('Worked')).toBeTruthy();
  });

  it('draws no review section and no error when there are none', () => {
    render(<PlayerPracticeClient practices={[practice()]} />);
    expect(screen.queryByRole('region', { name: 'From your coach' })).toBeNull();
    expect(screen.queryByText(/could not load/i)).toBeNull();
  });
});
