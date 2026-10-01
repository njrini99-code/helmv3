/**
 * @vitest-environment node
 *
 * Q-131: Clubhouse can be limited to listed teams for its first activation
 * (HELM_CLUBHOUSE_TEAMS). Unset means the flag alone decides, as before.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
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

const { isClubhouseFor, isClubhouseForTeam, clubhouseTeamAllowlist } = await import('../gate');

beforeEach(() => {
  flag.on = true;
  team.fail = false;
  team.current = { role: 'coach', teamId: 'team-a', coachId: 'c1' };
  session.current = { userId: 'u1', role: 'coach', coach: { id: 'c1' }, player: null };
});
afterEach(() => {
  delete process.env.HELM_CLUBHOUSE_TEAMS;
});

describe('isClubhouseFor with a team allowlist (Q-131)', () => {
  it('with no allowlist the flag alone decides, for both roles', async () => {
    expect(clubhouseTeamAllowlist()).toBeNull();
    expect(await isClubhouseFor('coach')).toBe(true);
    expect(await isClubhouseFor('player')).toBe(true);
    flag.on = false;
    expect(await isClubhouseFor('coach')).toBe(false);
  });

  it('with an allowlist only a listed team gets Clubhouse', async () => {
    process.env.HELM_CLUBHOUSE_TEAMS = ' team-a , team-b ';
    expect(await isClubhouseFor('coach')).toBe(true);
    team.current = { role: 'coach', teamId: 'team-z', coachId: 'c1' };
    expect(await isClubhouseFor('coach')).toBe(false);
  });

  it('the flag off still wins over a listed team', async () => {
    process.env.HELM_CLUBHOUSE_TEAMS = 'team-a';
    flag.on = false;
    expect(await isClubhouseFor('coach')).toBe(false);
  });

  it('no team, no session, a role mismatch or a failed team read all get Fairway', async () => {
    process.env.HELM_CLUBHOUSE_TEAMS = 'team-a';
    team.current = null;
    expect(await isClubhouseFor('coach')).toBe(false);
    team.current = { role: 'player', teamId: 'team-a', playerId: 'p1' };
    expect(await isClubhouseFor('coach')).toBe(false);
    team.fail = true;
    expect(await isClubhouseFor('player')).toBe(false);
    team.fail = false;
    session.current = null;
    expect(await isClubhouseFor('player')).toBe(false);
    expect(await isClubhouseFor(null)).toBe(false);
  });
});

describe('isClubhouseForTeam: a link sent to someone else follows their team, not the sender’s (CH13-24)', () => {
  it('no allowlist: the flag decides', () => {
    expect(isClubhouseForTeam('team-z')).toBe(true);
    expect(isClubhouseForTeam(null)).toBe(true);
    flag.on = false;
    expect(isClubhouseForTeam('team-a')).toBe(false);
  });

  it('with an allowlist: the recipient’s team decides, and no team is Fairway', () => {
    process.env.HELM_CLUBHOUSE_TEAMS = 'team-a';
    expect(isClubhouseForTeam('team-a')).toBe(true);
    expect(isClubhouseForTeam('team-z')).toBe(false);
    expect(isClubhouseForTeam(null)).toBe(false);
  });
});
