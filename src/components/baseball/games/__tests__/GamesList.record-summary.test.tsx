import type { AnchorHTMLAttributes } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { BaseballGame } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Regression guard for #438 + the season W-L mismatch: the record header must
// treat ties as their own bucket and only surface "-NT" when N > 0. The record
// is now sourced from `getTeamSeasonRecord` (a full-season selector, independent
// of any display `limit`) so the "Recent Games" widget and the full Games page
// can never disagree — the header renders exactly what that selector returns.
// ─────────────────────────────────────────────────────────────────────────────

const getTeamGames = vi.fn();
const getTeamSeasonRecord = vi.fn();
const deleteGame = vi.fn();

vi.mock('@/app/baseball/actions/games', () => ({
  getTeamGames: (...args: unknown[]) => getTeamGames(...args),
  getTeamSeasonRecord: (...args: unknown[]) => getTeamSeasonRecord(...args),
  deleteGame: (...args: unknown[]) => deleteGame(...args),
}));

vi.mock('./GameCard', () => ({
  GameCard: ({ game }: { game: BaseballGame }) => <div data-testid={`game-${game.id}`} />,
}));

// next/link's prefetch effect calls `new IntersectionObserver(...)`, which
// jsdom does not implement. Stub it to a plain anchor so GamesList can be
// rendered in isolation without pulling in Next's client runtime.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@/components/ui/sonner', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

import { GamesList } from '../GamesList';

function makeGame(overrides: Partial<BaseballGame>): BaseballGame {
  return {
    id: overrides.id ?? 'game-1',
    team_id: 'team-1',
    event_id: null,
    game_date: '2026-04-01',
    game_type: 'game',
    opponent_name: 'Rival U',
    location: null,
    home_away: 'home',
    our_score: null,
    opponent_score: null,
    innings_played: 9,
    status: 'completed',
    notes: null,
    weather: null,
    created_by: null,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  getTeamGames.mockReset();
  getTeamSeasonRecord.mockReset();
  deleteGame.mockReset();
  // Default: the display list carries the games; the record comes from its own
  // selector. Individual tests override the record.
  getTeamGames.mockResolvedValue({ success: true, data: [] });
});

describe('GamesList record summary', () => {
  it('renders a tie as its own bucket (never folded into losses)', async () => {
    const games: BaseballGame[] = [
      makeGame({ id: 'w-1', our_score: 5, opponent_score: 2 }),
      makeGame({ id: 'l-1', our_score: 1, opponent_score: 4 }),
      makeGame({ id: 't-1', our_score: 3, opponent_score: 3 }),
    ];
    getTeamGames.mockResolvedValue({ success: true, data: games });
    getTeamSeasonRecord.mockResolvedValue({
      success: true,
      data: { played: 3, wins: 1, losses: 1, ties: 1 },
    });

    render(<GamesList teamId="team-1" />);

    await waitFor(() => {
      expect(screen.getByText('3 played · 1W-1L-1T')).toBeInTheDocument();
    });
  });

  it('omits the tie segment when there are no ties', async () => {
    getTeamSeasonRecord.mockResolvedValue({
      success: true,
      data: { played: 2, wins: 1, losses: 1, ties: 0 },
    });

    render(<GamesList teamId="team-1" />);

    await waitFor(() => {
      expect(screen.getByText('2 played · 1W-1L')).toBeInTheDocument();
    });
  });

  it('reflects the FULL-season record even when the display list is limited', async () => {
    // The "Recent Games" widget passes limit={5}; the record must still be the
    // full-season figure from the selector, not derived from the shown games.
    getTeamGames.mockResolvedValue({
      success: true,
      data: [makeGame({ id: 'w-1', our_score: 5, opponent_score: 2 })],
    });
    getTeamSeasonRecord.mockResolvedValue({
      success: true,
      data: { played: 6, wins: 5, losses: 0, ties: 1 },
    });

    render(<GamesList teamId="team-1" limit={5} />);

    await waitFor(() => {
      expect(screen.getByText('6 played · 5W-0L-1T')).toBeInTheDocument();
    });
  });
});
