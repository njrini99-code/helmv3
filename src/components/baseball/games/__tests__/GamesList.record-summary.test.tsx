import type { AnchorHTMLAttributes } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { BaseballGame } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Regression guard for #438: GamesList used to compute
// `losses = completedGames.length - wins`, so a tied game (our_score ===
// opponent_score) silently fell into the loss bucket and the header
// ("X played · YW ZL") misstated the team record. The fix must treat ties
// as their own bucket and only surface "-NT" in the header when N > 0.
// ─────────────────────────────────────────────────────────────────────────────

const getTeamGames = vi.fn();
const deleteGame = vi.fn();

vi.mock('@/app/baseball/actions/games', () => ({
  getTeamGames: (...args: unknown[]) => getTeamGames(...args),
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
  deleteGame.mockReset();
});

describe('GamesList record summary', () => {
  it('counts a tied game as a tie, not a loss', async () => {
    const games: BaseballGame[] = [
      makeGame({ id: 'w-1', our_score: 5, opponent_score: 2 }),
      makeGame({ id: 'l-1', our_score: 1, opponent_score: 4 }),
      makeGame({ id: 't-1', our_score: 3, opponent_score: 3 }),
    ];
    getTeamGames.mockResolvedValue({ success: true, data: games });

    render(<GamesList teamId="team-1" />);

    await waitFor(() => {
      expect(screen.getByText('3 played · 1W-1L-1T')).toBeInTheDocument();
    });
  });

  it('omits the tie segment when there are no ties', async () => {
    const games: BaseballGame[] = [
      makeGame({ id: 'w-1', our_score: 5, opponent_score: 2 }),
      makeGame({ id: 'l-1', our_score: 1, opponent_score: 4 }),
    ];
    getTeamGames.mockResolvedValue({ success: true, data: games });

    render(<GamesList teamId="team-1" />);

    await waitFor(() => {
      expect(screen.getByText('2 played · 1W-1L')).toBeInTheDocument();
    });
  });
});
