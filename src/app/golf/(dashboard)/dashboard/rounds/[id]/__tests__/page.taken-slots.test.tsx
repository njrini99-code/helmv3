import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Round detail's type editor: which qualifier round numbers this player's
 * other rounds already hold, and which qualifiers the player is entered in.
 * A failed read of the slots used to degrade to "nothing taken", so every
 * round number looked free and the picker defaulted to one the player may
 * already hold; a failed read of the entries said "you aren't in any open
 * qualifier". A failed read must offer no qualifier and say the read failed.
 */

const ID = '11111111-1111-4111-8111-111111111111';
const QUALIFIER = '22222222-2222-4222-8222-222222222222';

type Result = { data: unknown; error: unknown };

const mocks = vi.hoisted(() => ({
  takenResult: { current: { data: [], error: null } as Result },
  entriesResult: { current: { data: [], error: null } as Result },
  detailProps: { current: null as Record<string, unknown> | null },
  logServerError: vi.fn(async () => {}),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('@/lib/auth/session', () => ({
  getGolfSessionProfile: async () => ({ userId: 'u-1', player: { id: 'p-1' }, coach: null }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      const result = (): Result => {
        switch (table) {
          case 'golf_rounds':
            return mocks.takenResult.current;
          case 'golf_qualifier_entries':
            return mocks.entriesResult.current;
          default:
            return { data: [], error: null };
        }
      };
      const query: Record<string, unknown> = {
        select: () => query,
        eq: () => query,
        neq: () => query,
        in: () => query,
        order: () => query,
        maybeSingle: async () =>
          table === 'golf_rounds'
            ? {
                data: {
                  id: ID,
                  player_id: 'p-1',
                  status: 'completed',
                  round_type: 'practice',
                  qualifier_id: null,
                  qualifier_round_number: null,
                  course_name: 'Pebble Beach',
                  round_date: '2026-10-01',
                  ai_recap: 'A recap.',
                  player: { first_name: 'Nick', last_name: 'Rini', avatar_url: null },
                },
                error: null,
              }
            : { data: null, error: null },
        then: (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve(result()).then(resolve, reject),
      };
      return query;
    },
  }),
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: mocks.logServerError }));
vi.mock('@/clubhouse/gate', () => ({ isClubhouseFor: async () => false }));
vi.mock('@/lib/auth/get-golf-dashboard-role', () => ({ getGolfDashboardRole: async () => 'player' }));
vi.mock('@/clubhouse/routes/round-review', () => ({ ClubhouseRoundReviewRoute: () => null }));
vi.mock('@/lib/golf/resolve-team-server', () => ({ resolveCoachTeamIdWithCookie: async () => null }));
vi.mock('@/components/fairway/pages/rounds/FairwayRoundDetail', () => ({
  FairwayRoundDetail: (props: Record<string, unknown>) => {
    mocks.detailProps.current = props;
    return null;
  },
}));

import RoundDetailPage from '../page';

async function renderPage() {
  const el = (await RoundDetailPage({ params: Promise.resolve({ id: ID }) })) as ReactElement;
  render(el);
  return mocks.detailProps.current;
}

const entered = {
  data: [{ qualifier: { id: QUALIFIER, name: 'Fall qualifier', num_rounds: 3, status: 'active' } }],
  error: null,
};

describe('Round detail: qualifier options for the type editor', () => {
  beforeEach(() => {
    mocks.detailProps.current = null;
    mocks.logServerError.mockClear();
    mocks.entriesResult.current = entered;
  });

  it('passes the slots other rounds hold', async () => {
    mocks.takenResult.current = { data: [{ qualifier_id: QUALIFIER, qualifier_round_number: 1 }], error: null };

    const props = await renderPage();

    expect(props?.qualifierReadFailed).toBe(false);
    expect(props?.qualifierOptions).toEqual([
      expect.objectContaining({ id: QUALIFIER, numRounds: 3, takenRoundNumbers: [1] }),
    ]);
  });

  it('a failed read of taken slots offers no qualifier and reports the read failure', async () => {
    mocks.takenResult.current = { data: null, error: { message: 'canceling statement due to statement timeout' } };

    const props = await renderPage();

    expect(props?.qualifierReadFailed).toBe(true);
    expect(props?.qualifierOptions).toEqual([]);
    expect(mocks.logServerError).toHaveBeenCalledWith(
      expect.stringContaining('taken qualifier slots read failed'),
      expect.objectContaining({ action: 'roundDetail.takenSlots' }),
      'warning',
    );
  });

  it('a failed read of the player\'s qualifier entries reports the read failure, not "no qualifier"', async () => {
    mocks.entriesResult.current = { data: null, error: { message: 'connection reset' } };
    mocks.takenResult.current = { data: [], error: null };

    const props = await renderPage();

    expect(props?.qualifierReadFailed).toBe(true);
    expect(props?.qualifierOptions).toEqual([]);
  });
});
