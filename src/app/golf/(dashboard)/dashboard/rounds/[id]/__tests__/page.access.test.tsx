import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Round detail's access rule: the player who played it, or a coach of a team the round's player is on. The page hands the
 * request to ClubhouseRoundReviewRoute before it reads anything; that route's loader checks the rule (a failed membership
 * read is an outage that denies, never a grant): src/clubhouse/__tests__/round-review.test.tsx, "Round review loader".
 * The Miss Compass's shot rows link here (`/golf/dashboard/rounds/<id>`), so a coach can only open what it allows.
 */

const ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({
  session: { current: null as unknown },
  reads: [] as string[],
}));

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: async () => mocks.session.current }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      mocks.reads.push(table);
      throw new Error(`unexpected read of ${table}`);
    },
  }),
}));
vi.mock('@/clubhouse/routes/round-review', () => ({ ClubhouseRoundReviewRoute: () => null }));

import { ClubhouseRoundReviewRoute } from '@/clubhouse/routes/round-review';
import RoundDetailPage from '../page';

beforeEach(() => {
  mocks.reads.length = 0;
});

describe('Round detail: who may open a round', () => {
  it('the page reads nothing itself and hands the round to the Clubhouse route, whose loader checks the rule', async () => {
    mocks.session.current = { userId: 'u-coach', player: null, coach: { id: 'c-1', organization_id: 'org-1' } };
    const el = (await RoundDetailPage({ params: Promise.resolve({ id: ID }) })) as ReactElement<{ id: string }>;
    expect(el.type).toBe(ClubhouseRoundReviewRoute);
    expect(el.props.id).toBe(ID);
    expect(mocks.reads).toEqual([]);
  });

  it('a signed-out visitor is sent to sign in, and an id that is not a round id is not found, before any read', async () => {
    mocks.session.current = null;
    await expect(RoundDetailPage({ params: Promise.resolve({ id: ID }) })).rejects.toThrow('NEXT_REDIRECT /golf/login');
    await expect(RoundDetailPage({ params: Promise.resolve({ id: 'not-a-round' }) })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mocks.reads).toEqual([]);
  });
});
