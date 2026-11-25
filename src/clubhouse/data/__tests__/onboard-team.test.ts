import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * /golf/player?joinCode=: the team the link names is read on the server, so a player who signed in on another phone
 * sees which team they are joining from the first question. A code that does not resolve is kept (finishing says why),
 * and a lookup that fails never fails the page. A stand-in for Supabase, not a database test. Synthetic data only.
 */
const rpc = vi.hoisted(() => vi.fn());
const logged = vi.hoisted(() => vi.fn());
function from() {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: () => Promise.resolve({ data: null, error: null }) };
  return chain;
}
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from, rpc }) }));
vi.mock('@/lib/auth/resilient-get-user', () => ({ getUserResilient: async () => ({ user: { id: 'u1', email: 'p@example.test', user_metadata: {} } }) }));
vi.mock('../../lib/track-server', () => ({ chLogServer: logged }));

import { loadPlayerOnboard } from '../onboard';

beforeEach(() => {
  rpc.mockReset();
  logged.mockClear();
});

async function seed(joinCode?: string | null) {
  const load = await loadPlayerOnboard(joinCode);
  if (load.kind !== 'ready') throw new Error(`expected ready, got ${load.kind}`);
  return load.seed;
}

describe('loadPlayerOnboard · the team from the link', () => {
  it('names the team the code resolves to, with the code as the server will use it', async () => {
    rpc.mockResolvedValue({ data: [{ id: 't1', name: 'Men’s Golf' }], error: null });
    const s = await seed('k7pq-x4mn');
    expect(rpc).toHaveBeenCalledWith('golf_team_by_join_code', { p_code: 'K7PQX4MN' });
    expect(s).toMatchObject({ code: 'K7PQX4MN', teamName: 'Men’s Golf' });
  });

  it('keeps a code that names no team, with no name', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await seed('ZZZZ9999')).toMatchObject({ code: 'ZZZZ9999', teamName: null });
  });

  it('a lookup that fails keeps the code and does not fail the page', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'timeout' } });
    expect(await seed('K7PQX4MN')).toMatchObject({ code: 'K7PQX4MN', teamName: null });
    // A client that rejects instead of answering with an error (a thenable, as the real query builder is).
    rpc.mockReturnValue({ then: (_ok: unknown, bad: (e: Error) => void) => bad(new Error('network')) });
    expect(await seed('K7PQX4MN')).toMatchObject({ code: 'K7PQX4MN', teamName: null });
    expect(logged).toHaveBeenCalledTimes(2);
  });

  it('no code on the link adds nothing and asks nothing', async () => {
    const s = await seed();
    expect(rpc).not.toHaveBeenCalled();
    expect('code' in s).toBe(false);
  });

  it('a link with only junk in it is no code', async () => {
    const s = await seed('--');
    expect(rpc).not.toHaveBeenCalled();
    expect('code' in s).toBe(false);
  });
});
