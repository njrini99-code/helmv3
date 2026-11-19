import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => undefined), logServerEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: vi.fn(() => false) }));

const { readsEnabled, readsEnabledTeams, readsTeams } = await import('../flag');
const { refreshReadsAfterRound, refreshReadsNightly, refreshTeamReads, withTimeLimit } = await import('../run');

/** A client that records every call and answers nothing. */
function spyClient() {
  const calls: string[] = [];
  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      calls.push(String(prop));
      if (prop === 'then') return undefined;
      return () => new Proxy({}, handler);
    },
  };
  return { sb: new Proxy({}, handler) as never, calls };
}

describe('the flag', () => {
  it('is off with the list unset or empty, the registry off, no team, or another team', () => {
    expect(readsEnabled('t1', { flagOn: () => true, teams: undefined })).toBe(false);
    expect(readsEnabled('t1', { flagOn: () => true, teams: '' })).toBe(false);
    expect(readsEnabled('t1', { flagOn: () => false, teams: 't1' })).toBe(false);
    expect(readsEnabled(null, { flagOn: () => true, teams: 't1' })).toBe(false);
    expect(readsEnabled('t2', { flagOn: () => true, teams: 't1' })).toBe(false);
    expect(readsEnabled('t1', { flagOn: () => true, teams: 't1, t3' })).toBe(true);
    expect([...readsTeams(' a,b  c ,')]).toEqual(['a', 'b', 'c']);
    expect(readsEnabledTeams({ flagOn: () => false, teams: 'a' })).toEqual([]);
    expect(readsEnabledTeams({ flagOn: () => true, teams: 'b,a' })).toEqual(['a', 'b']);
  });

  it('is off with the real environment unset (the default everywhere)', () => {
    const saved = process.env.COACHHELM_READS_TEAM_IDS;
    delete process.env.COACHHELM_READS_TEAM_IDS;
    try {
      expect(readsEnabled('t1')).toBe(false);
      expect(readsEnabledTeams()).toEqual([]);
    } finally {
      if (saved !== undefined) process.env.COACHHELM_READS_TEAM_IDS = saved;
    }
  });

  it('the registry has it off everywhere', async () => {
    const { FLAG_REGISTRY } = await import('@/lib/flags/registry.generated');
    const f = FLAG_REGISTRY.find((x) => x.feature_id === 'coachhelm_reads_v1')!;
    expect(f.default).toBe(false);
    expect(f.environment).toEqual({ production: false, preview: false, development: false });
  });
});

describe('the hooks', () => {
  it('after a round: no listed team, no database call at all', async () => {
    const { sb, calls } = spyClient();
    expect(await refreshReadsAfterRound(sb, { playerId: 'p1', roundId: 'r1', flag: { teams: '', flagOn: () => true } })).toEqual([]);
    expect(await refreshReadsAfterRound(sb, { playerId: 'p1', roundId: 'r1', flag: { teams: 't1', flagOn: () => false } })).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('nightly: no listed team, no database call at all', async () => {
    const { sb, calls } = spyClient();
    expect(await refreshReadsNightly(sb, { budgetMs: 1000, flag: { teams: undefined, flagOn: () => true } })).toEqual({ teams: 0, written: 0, held: 0, failed: 0, deferred: 0 });
    expect(calls).toEqual([]);
  });

  it('after a round: a failing read of the player\'s teams never throws', async () => {
    const sb = { from: () => { throw new Error('boom'); } } as never;
    await expect(refreshReadsAfterRound(sb, { playerId: 'p1', roundId: 'r1', flag: { teams: 't1', flagOn: () => true } })).resolves.toEqual([]);
  });

  it('a team whose table is not applied yet is "held", not a failure', async () => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order']) chain[m] = () => chain;
    chain.range = async () => ({ data: null, error: { message: 'relation does not exist', code: '42P01' } });
    const sb = { from: () => chain } as never;
    expect(await refreshTeamReads(sb, { teamId: 't1', trigger: 'nightly' })).toEqual({ kind: 'held', teamId: 't1' });
  });

  it('a slow run is cut at the time limit and its late failure is swallowed', async () => {
    const slow = new Promise<string>((_, reject) => setTimeout(() => reject(new Error('late')), 30));
    expect(await withTimeLimit(slow, 5, () => 'timed_out')).toBe('timed_out');
    await new Promise((r) => setTimeout(r, 40));
    expect(await withTimeLimit(Promise.resolve('done'), 50, () => 'timed_out')).toBe('done');
  });
});
