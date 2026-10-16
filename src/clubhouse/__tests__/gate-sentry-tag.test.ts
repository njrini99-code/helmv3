/**
 * @vitest-environment node
 *
 * Release review blocker 5: the browser tags a Clubhouse session `ui=clubhouse` (chTagSession, lib/track.ts), and
 * the server now tags the request it decided Clubhouse for, so a canary's server errors can be told from Fairway's.
 * The tag goes on the isolation scope, which Sentry's HTTP server integration clones for each incoming request
 * (@sentry/core integrations/http/server-subscription.js), so it covers that request and no other.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const sentry = vi.hoisted(() => ({ setTag: vi.fn(), currentSetTag: vi.fn(), down: false }));
vi.mock('@sentry/nextjs', () => ({
  getIsolationScope: () => {
    if (sentry.down) throw new Error('sentry down');
    return { setTag: sentry.setTag };
  },
  getCurrentScope: () => ({ setTag: sentry.currentSetTag }),
  setTag: sentry.currentSetTag,
}));
const flag = vi.hoisted(() => ({ on: true }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => flag.on }));
const session = vi.hoisted(() => ({ current: { userId: 'u1', role: 'coach', coach: { id: 'c1' }, player: null } as unknown }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: async () => session.current }));
const team = vi.hoisted(() => ({ current: { role: 'coach', teamId: 'team-a', coachId: 'c1' } as unknown, fail: false }));
vi.mock('../routes/team', () => ({
  resolveClubhouseTeam: async () => {
    if (team.fail) throw new Error('read failed');
    return team.current;
  },
}));

const { isClubhouseFor } = await import('../gate');

beforeEach(() => {
  flag.on = true;
  sentry.down = false;
  sentry.setTag.mockClear();
  sentry.currentSetTag.mockClear();
  team.fail = false;
  team.current = { role: 'coach', teamId: 'team-a', coachId: 'c1' };
  session.current = { userId: 'u1', role: 'coach', coach: { id: 'c1' }, player: null };
});
afterEach(() => {
  delete process.env.HELM_CLUBHOUSE_TEAMS;
});

describe('isClubhouseFor tags the server request ui=clubhouse (blocker 5)', () => {
  it('a Clubhouse decision tags the request’s isolation scope with the browser’s tag, name and value, for both roles', async () => {
    expect(await isClubhouseFor('coach')).toBe(true);
    expect(sentry.setTag).toHaveBeenLastCalledWith('ui', 'clubhouse');
    team.current = { role: 'player', teamId: 'team-a', playerId: 'p1' };
    expect(await isClubhouseFor('player')).toBe(true);
    expect(sentry.setTag).toHaveBeenCalledTimes(2);
    // Not the current scope, which a nested withScope would drop before the error is captured.
    expect(sentry.currentSetTag).not.toHaveBeenCalled();
  });

  it('a canary team on the allowlist is tagged', async () => {
    process.env.HELM_CLUBHOUSE_TEAMS = 'team-a';
    expect(await isClubhouseFor('coach')).toBe(true);
    expect(sentry.setTag).toHaveBeenCalledWith('ui', 'clubhouse');
  });

  it('a Fairway decision tags nothing: a team off the allowlist, a failed team read, no session, the flag off, another role', async () => {
    process.env.HELM_CLUBHOUSE_TEAMS = 'team-a';
    team.current = { role: 'coach', teamId: 'team-z', coachId: 'c1' };
    expect(await isClubhouseFor('coach')).toBe(false);
    team.fail = true;
    expect(await isClubhouseFor('coach')).toBe(false);
    team.fail = false;
    session.current = null;
    expect(await isClubhouseFor('coach')).toBe(false);
    delete process.env.HELM_CLUBHOUSE_TEAMS;
    flag.on = false;
    expect(await isClubhouseFor('coach')).toBe(false);
    flag.on = true;
    expect(await isClubhouseFor(null)).toBe(false);
    expect(sentry.setTag).not.toHaveBeenCalled();
  });

  it('a Sentry failure never changes the answer', async () => {
    sentry.down = true;
    expect(await isClubhouseFor('coach')).toBe(true);
    process.env.HELM_CLUBHOUSE_TEAMS = 'team-a';
    expect(await isClubhouseFor('coach')).toBe(true);
  });
});
