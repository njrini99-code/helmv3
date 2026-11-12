import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Round detail's own access rule (page.tsx, before the round is shown): the player who played it, or a coach of a team the
 * round's player is on. Anyone else is sent to the dashboard, and a failed membership read is an outage that denies, never a
 * grant. The Miss Compass's shot rows link here (`/golf/dashboard/rounds/<id>`), so a coach can only open what this allows.
 * With Clubhouse on, the page hands the request to ClubhouseRoundReviewRoute before it reads anything; that route's loader
 * checks the same rule (src/clubhouse/__tests__/round-review.test.tsx, "Round review loader").
 */

const ID = '11111111-1111-4111-8111-111111111111';
const OWN_TEAM = 'team-own';

type Filters = Array<[string, unknown]>;
type Session = { userId: string; player: { id: string } | null; coach: { id: string; organization_id: string } | null };

const mocks = vi.hoisted(() => ({
  session: { current: null as unknown as Session },
  roundPlayer: { current: 'p-own' },
  teamId: { current: 'team-own' as string | null },
  membershipError: { current: null as unknown },
  clubhouse: { current: false },
  reads: [] as Array<{ table: string; filters: Array<[string, unknown]> }>,
  rendered: { current: false },
  resolveTeam: vi.fn(),
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
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: async () => mocks.session.current }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      const read = { table, filters: [] as Filters };
      mocks.reads.push(read);
      const query: Record<string, unknown> = {
        select: () => query,
        eq: (col: string, value: unknown) => (read.filters.push([col, value]), query),
        neq: () => query,
        in: () => query,
        order: () => query,
        maybeSingle: async () => {
          if (table === 'golf_rounds') return { data: { id: ID, player_id: mocks.roundPlayer.current, status: 'completed', round_type: 'practice', qualifier_id: null, qualifier_round_number: null, course_name: 'Hilltop', round_date: '2026-11-04', player: { first_name: 'Jonah', last_name: 'Okafor', avatar_url: null } }, error: null };
          if (table === 'golf_team_members') {
            if (mocks.membershipError.current) return { data: null, error: mocks.membershipError.current };
            const on = (col: string) => read.filters.find(([k]) => k === col)?.[1];
            // A member only for the coach's own team and a player on it: the answer depends on both filters the page sends.
            return { data: on('team_id') === OWN_TEAM && on('player_id') === 'p-own' ? { id: 'm-1' } : null, error: null };
          }
          return { data: null, error: null };
        },
        then: (resolve: (r: { data: unknown; error: unknown }) => unknown, reject: (e: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
      };
      return query;
    },
  }),
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: mocks.logServerError }));
vi.mock('@/clubhouse/gate', () => ({ isClubhouseFor: async () => mocks.clubhouse.current }));
vi.mock('@/lib/auth/get-golf-dashboard-role', () => ({ getGolfDashboardRole: async () => (mocks.session.current?.coach ? 'coach' : 'player') }));
vi.mock('@/clubhouse/routes/round-review', () => ({ ClubhouseRoundReviewRoute: () => null }));
vi.mock('@/lib/golf/resolve-team-server', () => ({
  resolveCoachTeamIdWithCookie: async (...args: unknown[]) => {
    mocks.resolveTeam(...args);
    return mocks.teamId.current;
  },
}));
vi.mock('@/components/fairway/pages/rounds/FairwayRoundDetail', () => ({
  FairwayRoundDetail: () => {
    mocks.rendered.current = true;
    return null;
  },
}));

import { ClubhouseRoundReviewRoute } from '@/clubhouse/routes/round-review';
import RoundDetailPage from '../page';

const coach: Session = { userId: 'u-coach', player: null, coach: { id: 'c-1', organization_id: 'org-1' } };
const player: Session = { userId: 'u-player', player: { id: 'p-own' }, coach: null };

async function open() {
  const el = (await RoundDetailPage({ params: Promise.resolve({ id: ID }) })) as ReactElement;
  render(el);
}
const membership = () => mocks.reads.find((r) => r.table === 'golf_team_members');

beforeEach(() => {
  mocks.roundPlayer.current = 'p-own';
  mocks.teamId.current = OWN_TEAM;
  mocks.membershipError.current = null;
  mocks.clubhouse.current = false;
  mocks.reads.length = 0;
  mocks.rendered.current = false;
  mocks.resolveTeam.mockClear();
  mocks.logServerError.mockClear();
});

describe('Round detail: who may open a round', () => {
  it('a coach opens a round of a player on their own team, checked against that team and that player', async () => {
    mocks.session.current = coach;
    await open();
    expect(mocks.rendered.current).toBe(true);
    expect(mocks.resolveTeam).toHaveBeenCalledWith(expect.anything(), 'org-1', 'c-1');
    expect(membership()?.filters).toEqual(expect.arrayContaining([['team_id', OWN_TEAM], ['player_id', 'p-own']]));
  });

  it('a coach is sent to the dashboard from a round whose player is on another team', async () => {
    mocks.session.current = coach;
    mocks.roundPlayer.current = 'p-other-team';
    await expect(open()).rejects.toThrow('NEXT_REDIRECT /golf/dashboard');
    expect(mocks.rendered.current).toBe(false);
    expect(membership()?.filters).toEqual(expect.arrayContaining([['team_id', OWN_TEAM], ['player_id', 'p-other-team']]));
  });

  it('a coach of another team is sent away from the same round, whatever round id they hold', async () => {
    mocks.session.current = coach;
    mocks.teamId.current = 'team-other';
    await expect(open()).rejects.toThrow('NEXT_REDIRECT /golf/dashboard');
    expect(mocks.rendered.current).toBe(false);
  });

  it('a coach whose team cannot be resolved is sent away, with no membership read to grant it', async () => {
    mocks.session.current = coach;
    mocks.teamId.current = null;
    await expect(open()).rejects.toThrow('NEXT_REDIRECT /golf/dashboard');
    expect(membership()).toBeUndefined();
    expect(mocks.rendered.current).toBe(false);
  });

  it('a failed membership read denies and says it could not check: an outage, never a grant', async () => {
    mocks.session.current = coach;
    mocks.membershipError.current = { message: 'canceling statement due to statement timeout' };
    await expect(open()).rejects.toThrow("Couldn't verify your access to this round.");
    expect(mocks.rendered.current).toBe(false);
    expect(mocks.logServerError).toHaveBeenCalledWith(expect.stringContaining('coach access check failed'), expect.objectContaining({ action: 'roundDetail.coachAccessCheck' }));
  });

  it('a player opens their own round', async () => {
    mocks.session.current = player;
    await open();
    expect(mocks.rendered.current).toBe(true);
  });

  it('a player is sent to the dashboard from a teammate’s round', async () => {
    mocks.session.current = player;
    mocks.roundPlayer.current = 'p-teammate';
    await expect(open()).rejects.toThrow('NEXT_REDIRECT /golf/dashboard');
    expect(mocks.rendered.current).toBe(false);
    // A player has no coach row: no team membership is asked, so none can let them in.
    expect(membership()).toBeUndefined();
  });

  it('with Clubhouse on, the page reads nothing itself and hands the round to the Clubhouse route, whose loader checks the same rule', async () => {
    mocks.session.current = coach;
    mocks.clubhouse.current = true;
    mocks.roundPlayer.current = 'p-other-team';
    const el = (await RoundDetailPage({ params: Promise.resolve({ id: ID }) })) as ReactElement<{ id: string }>;
    expect(el.type).toBe(ClubhouseRoundReviewRoute);
    expect(el.props.id).toBe(ID);
    expect(mocks.reads).toEqual([]);
  });
});
