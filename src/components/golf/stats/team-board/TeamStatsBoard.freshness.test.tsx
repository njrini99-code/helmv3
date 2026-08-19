import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TeamStatsBoard } from './TeamStatsBoard';

describe('TeamStatsBoard freshness', () => {
  it('shows the source status for coach signal chips', () => {
    render(
      <TeamStatsBoard
        teamName="Guilford College"
        players={[]}
        intelligenceByPlayer={{}}
        leakMaps={null}
        standingByPlayer={new Map()}
        teamRounds30d={0}
        freshness={{
          roundRefreshMinutes: 5,
          statsCacheAsOf: '2026-08-18T16:00:00.000Z',
          statsCacheStale: true,
          standingAsOf: '2026-08-18T02:20:46.000Z',
          oldestSignalInsightAsOf: '2026-08-17T19:00:00.000Z',
        }}
      />,
    );

    expect(screen.getByText(/round results refresh within 5 min/i)).toBeVisible();
    expect(screen.getByText(/stats cache as of 2026-08-18 16:00 utc/i)).toBeVisible();
    expect(screen.getByText(/rank snapshot as of 2026-08-18 02:20 utc/i)).toBeVisible();
    expect(screen.getByText(/trend signals begin after 8 completed rounds/i)).toBeVisible();
    expect(screen.getByRole('link', { name: /^ask coachhelm$/i })).toHaveAttribute(
      'href',
      '/golf/dashboard/coachhelm/chat',
    );
  });
});
