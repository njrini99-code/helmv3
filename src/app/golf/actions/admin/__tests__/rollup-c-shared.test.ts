import { describe, it, expect } from 'vitest';
import {
  filterToGolfLinkedUsers,
  computeDemoExclusions,
} from '@/app/golf/actions/admin/rollup-c.shared';

// Audit findings F1 (cross-sport user pollution) and F2 (demo-team
// pollution) — bridge-audit-people.md, 2026-08-20. These tests exercise the
// two pure helpers rollup-c.ts calls right after the RPC response lands, so
// they cover every downstream consumer (PeopleTab's summary KPIs, the
// "Unassigned" directory, TeamUserDirectory, and the re-engagement email
// button's recipient set, which is built entirely from `unassigned` +
// `teams[].members` — both derived from the same filtered `data.users`).

describe('filterToGolfLinkedUsers — audit finding F1', () => {
  it('drops a BaseballHelm-only user and keeps a golf-linked one', () => {
    const users = [
      { id: 'golf-player-1', email: 'p1@golf.test' },
      { id: 'golf-coach-1', email: 'c1@golf.test' },
      { id: 'baseball-only-1', email: 'b1@baseball.test' },
    ];
    const players = [{ user_id: 'golf-player-1' }];
    const coaches = [{ user_id: 'golf-coach-1' }];

    const result = filterToGolfLinkedUsers(users, players, coaches);

    expect(result.map((u) => u.id).sort()).toEqual(['golf-coach-1', 'golf-player-1']);
  });

  it('excludes a baseball-only user even when they are eligible for the 14d+ re-engagement email', () => {
    // Mirrors the exact population PeopleTab.tsx's `inactive14dRecipients`
    // is built from (userActivity.unassigned + teams[].members). A user
    // that never makes it past this filter can never reach that recipient
    // list, so this doubles as the "email-eligible set excludes non-golf
    // users" assertion (audit brief item (b)) — there's no separate filter
    // downstream that could let one back in.
    const baseballUser = {
      id: 'baseball-inactive',
      email: 'inactive@baseball.test',
      daysSinceLastSeen: 30,
    };
    const golfUser = { id: 'golf-inactive', email: 'inactive@golf.test', daysSinceLastSeen: 30 };
    const users = [baseballUser, golfUser];
    const players = [{ user_id: 'golf-inactive' }];
    const coaches: { user_id: string }[] = [];

    const result = filterToGolfLinkedUsers(users, players, coaches);

    expect(result).toEqual([golfUser]);
  });

  it('excludes a user with no golf row at all, even an ambiguous one (documented limitation, not a feature)', () => {
    // The helper has no positive "this is baseball" signal to check for —
    // it only keeps users it CAN prove are golf-linked, via a
    // golf_players/golf_coaches row. A user with no row anywhere (in
    // production: a single QA-fixture account with no sport signal at all)
    // is excluded the same as a confirmed BaseballHelm user. See
    // filterToGolfLinkedUsers' doc comment for why this tradeoff was
    // accepted rather than adding an auth.users metadata lookup.
    const users = [{ id: 'no-row-anywhere', email: 'orphan@test.local' }];
    const result = filterToGolfLinkedUsers(users, [], []);
    expect(result).toEqual([]);
  });

  it('is a no-op when every user is golf-linked', () => {
    const users = [{ id: 'a' }, { id: 'b' }];
    const players = [{ user_id: 'a' }];
    const coaches = [{ user_id: 'b' }];
    expect(filterToGolfLinkedUsers(users, players, coaches)).toEqual(users);
  });
});

describe('computeDemoExclusions — audit finding F2', () => {
  const DEMO_IDS = new Set(['demo-team-1', 'demo-team-2']);

  it('reproduces the exact production counts (14 players / 4 coaches, all onboarded)', () => {
    // Values recomputed directly against production 2026-08-21:
    //   select count(*) from golf_team_members where status='active'
    //     and team_id in (<demo ids>)                                -> 14
    //   select count(*) from golf_team_coach_staff where team_id in (<demo ids>) -> 4
    // both fully onboarded in the seed data.
    const teamMembers = [
      ...Array.from({ length: 14 }, (_, i) => ({ player_id: `dp${i}`, team_id: 'demo-team-1' })),
      { player_id: 'real-player-1', team_id: 'real-team-1' },
    ];
    const teamCoachStaff = [
      ...Array.from({ length: 4 }, (_, i) => ({ coach_id: `dc${i}`, team_id: 'demo-team-2' })),
      { coach_id: 'real-coach-1', team_id: 'real-team-1' },
    ];
    const players = [
      ...Array.from({ length: 14 }, (_, i) => ({ id: `dp${i}`, onboarding_completed: true })),
      { id: 'real-player-1', onboarding_completed: false },
    ];
    const coaches = [
      ...Array.from({ length: 4 }, (_, i) => ({ id: `dc${i}`, onboarding_completed: true })),
      { id: 'real-coach-1', onboarding_completed: true },
    ];

    const result = computeDemoExclusions(teamMembers, teamCoachStaff, players, coaches, DEMO_IDS);

    expect(result).toEqual({
      coaches: 4,
      players: 14,
      coachesOnboarded: 4,
      playersOnboarded: 14,
    });
  });

  it('does not count a demo-team row still pending onboarding', () => {
    const teamMembers = [{ player_id: 'dp1', team_id: 'demo-team-1' }];
    const players = [{ id: 'dp1', onboarding_completed: false }];

    const result = computeDemoExclusions(teamMembers, [], players, [], DEMO_IDS);

    expect(result.players).toBe(1);
    expect(result.playersOnboarded).toBe(0);
  });

  it('is unaffected by team_members rows with no golf_players match, and does not require a user_id', () => {
    // The population this must match is `FROM golf_players` /
    // `FROM golf_coaches` (the RPC's raw COUNT(*) aggregates) — rows here
    // carry no `user_id` at all, unlike userActivity.teams[].members, which
    // would silently drop a row like this (rollup-c.ts:517/555 both
    // `continue` on a missing user_id).
    const teamMembers = [{ player_id: 'dp-no-user', team_id: 'demo-team-1' }];
    const players = [{ id: 'dp-no-user', onboarding_completed: true }];

    const result = computeDemoExclusions(teamMembers, [], players, [], DEMO_IDS);

    expect(result).toEqual({ coaches: 0, players: 1, coachesOnboarded: 0, playersOnboarded: 1 });
  });

  it('does not double-count or drop a coach staffing a demo team AND a real team', () => {
    const teamCoachStaff = [
      { coach_id: 'multi-team-coach', team_id: 'demo-team-1' },
      { coach_id: 'multi-team-coach', team_id: 'real-team-1' },
    ];
    const coaches = [{ id: 'multi-team-coach', onboarding_completed: true }];

    const result = computeDemoExclusions([], teamCoachStaff, [], coaches, DEMO_IDS);

    // Still counted once as a demo exclusion because they DO staff a demo
    // team — unlike the userActivity member list, which would have already
    // claimed them on whichever team it iterated first and silently
    // excluded them from a second team's member count (rollup-c.ts:556).
    expect(result.coaches).toBe(1);
    expect(result.coachesOnboarded).toBe(1);
  });

  it('returns all zeros when no team is a demo team', () => {
    const teamMembers = [{ player_id: 'p1', team_id: 'real-team-1' }];
    const teamCoachStaff = [{ coach_id: 'c1', team_id: 'real-team-1' }];
    const players = [{ id: 'p1', onboarding_completed: true }];
    const coaches = [{ id: 'c1', onboarding_completed: true }];

    const result = computeDemoExclusions(teamMembers, teamCoachStaff, players, coaches, DEMO_IDS);

    expect(result).toEqual({ coaches: 0, players: 0, coachesOnboarded: 0, playersOnboarded: 0 });
  });
});
