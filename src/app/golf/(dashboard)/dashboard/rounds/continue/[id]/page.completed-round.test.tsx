import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Continue Round for a round that is no longer in progress (the Fairway page
 * production serves). The submit action's response re-renders this page after
 * the round completes; a redirect() thrown there surfaced as React #441 and
 * the route's error boundary ("We couldn't load your saved scorecard") for a
 * round that had saved. The page must hand off with a client replace instead.
 */

const ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() },
  round: { current: null as Record<string, unknown> | null },
  clubhouse: vi.fn(async () => false),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => mocks.router,
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('@/lib/auth/session', () => ({
  getGolfSessionProfile: async () => ({ userId: 'u-1', player: { id: 'p-1' } }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: mocks.round.current, error: null }),
    };
    return { from: () => query };
  },
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));
vi.mock('@/clubhouse/gate', () => ({ isClubhouseFor: mocks.clubhouse }));
vi.mock('@/clubhouse/routes/round-continue', () => ({ ClubhouseContinueRoundRoute: () => null }));
vi.mock('./continue-round-client', () => ({ default: () => null }));
vi.mock('@/components/fairway/pages/rounds/RoundTypeEditor', () => ({ RoundTypeEditor: () => null }));

import ContinueRoundPage from './page';

describe('Continue Round: a round that is no longer in progress', () => {
  beforeEach(() => {
    mocks.router.replace.mockClear();
    mocks.clubhouse.mockClear();
  });

  it.each(['completed', 'abandoned'])('a %s round hands off to its page without throwing a redirect', async (status) => {
    mocks.round.current = { id: ID, player_id: 'p-1', status };

    const el = (await ContinueRoundPage({ params: Promise.resolve({ id: ID }) })) as ReactElement;
    render(el);

    expect(mocks.router.replace).toHaveBeenCalledWith(`/golf/dashboard/rounds/${ID}`);
    expect(screen.getByRole('link', { name: 'View round' })).toHaveAttribute('href', `/golf/dashboard/rounds/${ID}`);
    expect(screen.getByRole('status')).toHaveTextContent('This round is complete');
    // Decided before any UI branch: the Fairway page answers without asking
    // which UI the player is on.
    expect(mocks.clubhouse).not.toHaveBeenCalled();
  });

  it('a round that does not exist is still a 404', async () => {
    mocks.round.current = null;
    await expect(ContinueRoundPage({ params: Promise.resolve({ id: ID }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
