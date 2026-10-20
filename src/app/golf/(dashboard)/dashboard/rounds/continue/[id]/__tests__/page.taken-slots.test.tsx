import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Continue Round's type editor: which qualifier round numbers this player's
 * other rounds already hold. A failed read of those slots used to be dropped
 * on the floor, so every round number looked free and the picker defaulted to
 * one the player may already hold. A failed read must offer no qualifier and
 * say the read failed, never "all free".
 */

const ID = '11111111-1111-4111-8111-111111111111';
const QUALIFIER = '22222222-2222-4222-8222-222222222222';

type Result = { data: unknown; error: unknown };

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() },
  takenResult: { current: { data: [], error: null } as Result },
  editorProps: { current: null as Record<string, unknown> | null },
  logServerError: vi.fn(async () => {}),
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
  createClient: async () => ({
    from: (table: string) => {
      const result = (): Result => {
        switch (table) {
          case 'golf_rounds':
            return mocks.takenResult.current;
          case 'golf_qualifier_entries':
            return {
              data: [{ qualifier: { id: QUALIFIER, name: 'Fall qualifier', num_rounds: 3, status: 'active' } }],
              error: null,
            };
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
        maybeSingle: async () => ({
          data: {
            id: ID,
            player_id: 'p-1',
            status: 'in_progress',
            round_type: 'qualifier',
            qualifier_id: QUALIFIER,
            qualifier_round_number: 2,
            holes_played: 18,
            course_id: null,
            course_name: 'Pebble Beach',
            draft_data: null,
            notes: null,
            back_nine: null,
            updated_at: '2026-10-17T12:00:00.000Z',
          },
          error: null,
        }),
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
vi.mock('@/clubhouse/routes/round-continue', () => ({ ClubhouseContinueRoundRoute: () => null }));
vi.mock('@/components/golf/layout/AnimatedPage', () => ({
  AnimatedPage: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../continue-round-client', () => ({
  default: ({ roundTypeEditor }: { roundTypeEditor: ReactNode }) => <>{roundTypeEditor}</>,
}));
vi.mock('@/components/fairway/pages/rounds/RoundTypeEditor', () => ({
  RoundTypeEditor: (props: Record<string, unknown>) => {
    mocks.editorProps.current = props;
    return null;
  },
}));

import ContinueRoundPage from '../page';

async function renderPage() {
  const el = (await ContinueRoundPage({ params: Promise.resolve({ id: ID }) })) as ReactElement;
  render(el);
  return mocks.editorProps.current;
}

describe('Continue Round: taken qualifier slots', () => {
  beforeEach(() => {
    mocks.editorProps.current = null;
    mocks.logServerError.mockClear();
  });

  it('passes the slots other rounds hold to the type editor', async () => {
    mocks.takenResult.current = {
      data: [{ qualifier_id: QUALIFIER, qualifier_round_number: 1 }],
      error: null,
    };

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
      expect.objectContaining({ action: 'continueRound.takenSlots', roundId: ID }),
      'warning',
    );
  });
});
