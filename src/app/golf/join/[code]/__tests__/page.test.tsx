/**
 * @vitest-environment node
 *
 * /golf/join/[code]: the code in the address is whatever was pasted. Whatever it holds, the redirects it feeds carry one
 * code and nothing else (no extra parameter, no other destination), in any case, with spaces or dashes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

class Redirected extends Error {
  constructor(public to: string) {
    super(to);
  }
}
const redirect = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({ user: null as null | { id: string; email: string }, team: [] as unknown[], player: null as unknown }));

vi.mock('next/navigation', () => ({ redirect }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));
vi.mock('@/lib/golf/coach-entry-path', () => ({ resolveGolfCoachEntry: vi.fn() }));
vi.mock('@/clubhouse/routes/auth', () => ({ ClubhouseJoinInvalidRoute: () => 'invalid', ClubhouseJoinTeamRoute: () => 'team' }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    rpc: async () => ({ data: state.team, error: null }),
    from: (table: string) => {
      const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: table === 'golf_players' ? state.player : null, error: null }) };
      return chain;
    },
  }),
}));

import Page from '../page';

beforeEach(() => {
  redirect.mockReset();
  redirect.mockImplementation((to: string) => {
    throw new Redirected(to);
  });
  state.user = null;
  state.team = [];
  state.player = null;
});

const go = async (code: string) => {
  try {
    await Page({ params: Promise.resolve({ code }) });
  } catch (e) {
    if (e instanceof Redirected) return e.to;
    throw e;
  }
  return null;
};

describe('a signed-out visitor is sent to sign up with the code, and only the code', () => {
  it('lower case, a dash and a space become one clean code', async () => {
    expect(await go('k7pq-x4mn%20')).toBe('/golf/signup?returnTo=%2Fgolf%2Fjoin%2FK7PQX4MN');
  });

  it('a pasted "&next=" cannot add a parameter or a destination', async () => {
    const to = await go(encodeURIComponent('K7PQX4MN&returnTo=https://evil.test'));
    expect(to).not.toContain('evil');
    expect(new URL(to!, 'https://app.test').searchParams.get('next')).toBeNull();
    expect(new URL(to!, 'https://app.test').searchParams.get('returnTo')).toMatch(/^\/golf\/join\/[A-Z0-9]+$/);
  });

  it('a malformed escape does not throw', async () => {
    await expect(go('%E0%A4%A')).resolves.toMatch(/^\/golf\/signup\?returnTo=/);
  });
});

describe('a new player is sent on to onboarding with the code encoded', () => {
  it('once the code names a team', async () => {
    state.user = { id: 'u1', email: 'a@school.test' };
    state.team = [{ id: 't1', name: 'Men’s Golf' }];
    expect(await go('k7pqx4mn')).toBe('/golf/player?joinCode=K7PQX4MN');
  });
});
