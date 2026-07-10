import { describe, it, expect } from 'vitest';
import { classifyAtRisk, deriveUserSports, computeTotalUsersCount } from '@/lib/admin/data/users';

const now = new Date('2026-07-01T12:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400_000).toISOString();

describe('classifyAtRisk', () => {
  it('active when seen within 14d', () => {
    expect(classifyAtRisk({ lastSeen: daysAgo(3), createdAt: daysAgo(100) }, now)).toBe('active');
  });
  it('at-risk past 14d inactivity', () => {
    expect(classifyAtRisk({ lastSeen: daysAgo(20), createdAt: daysAgo(100) }, now)).toBe('at-risk');
  });
  it('never-seen when lastSeen is null and account is older than 3d (grace for fresh signups)', () => {
    expect(classifyAtRisk({ lastSeen: null, createdAt: daysAgo(10) }, now)).toBe('never-seen');
    expect(classifyAtRisk({ lastSeen: null, createdAt: daysAgo(1) }, now)).toBe('active');
  });
});

describe('deriveUserSports', () => {
  it('returns both sports when a user has a presence in both', () => {
    expect(deriveUserSports({ golf: true, baseball: true })).toEqual(['golf', 'baseball']);
  });

  it('returns golf only when the user has no baseball presence', () => {
    expect(deriveUserSports({ golf: true, baseball: false })).toEqual(['golf']);
  });

  it('returns an empty array when the user has no sport presence at all', () => {
    expect(deriveUserSports({ golf: false, baseball: false })).toEqual([]);
  });

  // Regression: fetchUserDetail previously derived `sports` from team
  // memberships instead of direct golf_players/golf_coaches presence, so a
  // player with a golf_players row but zero golf_team_members rows (never
  // joined a team, or fully removed) showed a golf badge on the directory
  // list but none on their own detail page. Both call sites now share this
  // one helper — a player-only, teamless account must still resolve to
  // ['golf'] regardless of which call site derived the `has.golf` flag.
  it('is true for a player with no team membership, as long as they have a golf_players row', () => {
    // fetchUserDetail passes has.golf = Boolean(golfPlayerId || golfCoachId)
    // — independent of any team membership lookup.
    expect(deriveUserSports({ golf: true, baseball: false })).toEqual(['golf']);
  });
});

describe('computeTotalUsersCount', () => {
  // Regression: with no team filter, the SQL `count: 'exact'` (pre-500-cap,
  // scoped only to {q, role}) is the honest "N total" figure — it's allowed
  // to exceed `users.length` (that's exactly what "capped view" means).
  it('uses the SQL count when there is no team filter', () => {
    expect(computeTotalUsersCount({}, 850, 500)).toBe(850);
  });

  it('falls back to users.length when the SQL count is null and there is no team filter', () => {
    expect(computeTotalUsersCount({}, null, 42)).toBe(42);
  });

  // Regression: `filters.team` is applied client-side against the already
  // {q, role}-filtered/capped `users` array and never reaches the SQL count
  // query, so the SQL count is unscoped to the team and must NOT be used
  // once a team filter is active — a 20-person team must show 20, not the
  // platform-wide 850, even though the SQL count still reports 850.
  it('ignores the unscoped SQL count and uses users.length once a team filter is active', () => {
    expect(computeTotalUsersCount({ team: 'team-123' }, 850, 20)).toBe(20);
  });

  it('uses users.length for a team filter even when the SQL count happens to already equal users.length', () => {
    expect(computeTotalUsersCount({ team: 'team-123' }, 20, 20)).toBe(20);
  });
});
