import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const flagOn = vi.fn<(id: string) => boolean>();
vi.mock('@/lib/flags', () => ({ isFlagEnabled: (id: string) => flagOn(id) }));
const logServerError = vi.fn();
vi.mock('@/lib/server-error-logger', () => ({ logServerError: (...a: unknown[]) => logServerError(...a) }));

import {
  coachhelmTeamAllowlist,
  currentCoachHelmTeams,
  isCoachHelmFlagEnabled,
  loadCanaryPlayerTeams,
  loadPlayerTeamIds,
  runWithCoachHelmTeams,
  withPlayerCoachHelmTeams,
} from '../canary';

const FLAG = 'coachhelm_support_v1';

/** A client whose golf_team_members read resolves to `result`. */
function client(result: { data: unknown; error: { message: string } | null }) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in']) chain[m] = vi.fn(() => chain);
  chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return { from: vi.fn(() => chain) } as never;
}

beforeEach(() => {
  flagOn.mockReset().mockReturnValue(true);
  logServerError.mockReset();
  delete process.env.HELM_COACHHELM_TEAMS;
});
afterEach(() => {
  delete process.env.HELM_COACHHELM_TEAMS;
});

describe('no allowlist: the global flag decides', () => {
  it.each([undefined, '', ' , ', '*', 'team-a,*'])('HELM_COACHHELM_TEAMS=%j', (value) => {
    if (value !== undefined) process.env.HELM_COACHHELM_TEAMS = value;
    expect(coachhelmTeamAllowlist()).toBeNull();
    expect(isCoachHelmFlagEnabled(FLAG)).toBe(true);
    flagOn.mockReturnValue(false);
    expect(isCoachHelmFlagEnabled(FLAG)).toBe(false);
  });

  it('runs a per-player entry point without making a client', async () => {
    const getClient = vi.fn();
    await expect(withPlayerCoachHelmTeams('p1', getClient, async () => currentCoachHelmTeams())).resolves.toBeUndefined();
    expect(getClient).not.toHaveBeenCalled();
  });

  it('a batch job reads nothing', async () => {
    const sb = client({ data: [], error: null });
    await expect(loadCanaryPlayerTeams(sb)).resolves.toBeNull();
    expect((sb as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
  });
});

describe('with a team list', () => {
  beforeEach(() => {
    process.env.HELM_COACHHELM_TEAMS = ' team-a , team-b ';
  });

  it('parses and trims the list', () => {
    expect(coachhelmTeamAllowlist()).toEqual(new Set(['team-a', 'team-b']));
  });

  it('a listed team is on', () => {
    expect(runWithCoachHelmTeams(['team-x', 'team-b'], () => isCoachHelmFlagEnabled(FLAG))).toBe(true);
  });

  it('an unlisted team is off', () => {
    expect(runWithCoachHelmTeams(['team-x'], () => isCoachHelmFlagEnabled(FLAG))).toBe(false);
  });

  it('no scope is off', () => {
    expect(isCoachHelmFlagEnabled(FLAG)).toBe(false);
    expect(runWithCoachHelmTeams([], () => isCoachHelmFlagEnabled(FLAG))).toBe(false);
  });

  it('the flag off is off even for a listed team', () => {
    flagOn.mockReturnValue(false);
    expect(runWithCoachHelmTeams(['team-a'], () => isCoachHelmFlagEnabled(FLAG))).toBe(false);
  });

  it('scopes nest and do not leak across async calls', async () => {
    const seen: Array<boolean> = [];
    await Promise.all([
      runWithCoachHelmTeams(['team-a'], async () => {
        await new Promise((r) => setTimeout(r, 5));
        seen.push(isCoachHelmFlagEnabled(FLAG));
        runWithCoachHelmTeams(['team-x'], () => seen.push(isCoachHelmFlagEnabled(FLAG)));
        seen.push(isCoachHelmFlagEnabled(FLAG));
      }),
      runWithCoachHelmTeams(['team-x'], async () => {
        await new Promise((r) => setTimeout(r, 1));
        seen.push(isCoachHelmFlagEnabled(FLAG));
      }),
    ]);
    // team-x finishes first (off), then team-a (on), its nested team-x (off), team-a again (on).
    expect(seen).toEqual([false, true, false, true]);
    expect(currentCoachHelmTeams()).toBeUndefined();
  });

  it('a player on a listed team runs on', async () => {
    const sb = client({ data: [{ team_id: 'team-a' }], error: null });
    await expect(withPlayerCoachHelmTeams('p1', () => sb, async () => isCoachHelmFlagEnabled(FLAG))).resolves.toBe(true);
  });

  it('a team read error fails closed', async () => {
    const sb = client({ data: null, error: { message: 'boom' } });
    await expect(loadPlayerTeamIds(sb, 'p1')).resolves.toEqual([]);
    await expect(withPlayerCoachHelmTeams('p1', () => sb, async () => isCoachHelmFlagEnabled(FLAG))).resolves.toBe(false);
    expect(logServerError).toHaveBeenCalled();
  });

  it('a client that cannot be made fails closed', async () => {
    const getClient = () => Promise.reject(new Error('no cookies'));
    await expect(withPlayerCoachHelmTeams('p1', getClient, async () => isCoachHelmFlagEnabled(FLAG))).resolves.toBe(false);
  });

  it('a batch job maps canary players to their listed teams, and a read error maps none', async () => {
    const ok = client({ data: [{ player_id: 'p1', team_id: 'team-a' }, { player_id: 'p1', team_id: 'team-b' }], error: null });
    await expect(loadCanaryPlayerTeams(ok)).resolves.toEqual(new Map([['p1', ['team-a', 'team-b']]]));
    const bad = client({ data: null, error: { message: 'boom' } });
    await expect(loadCanaryPlayerTeams(bad)).resolves.toEqual(new Map());
  });
});
