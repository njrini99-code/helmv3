// Shared types + safe-default constants for Slice C of the admin rollup.
//
// Lives outside `rollup-c.ts` because that file is a `'use server'` module —
// Next.js App Router only allows async function exports from `'use server'`
// files. Putting the `EMPTY_ROLLUP_C` constant and the public types here keeps
// the server file compliant while consumers (admin-data.ts, debug routes)
// keep a single import surface.

import type { AdminDashboardData } from '../admin-data';

export interface RollupC {
  userActivity: AdminDashboardData['userActivity'];
  cohortMatrix: AdminDashboardData['cohortMatrix'];
  benchmarks: AdminDashboardData['benchmarks'];
  coachIntelligence: AdminDashboardData['coachIntelligence'];
  sessionHeatmap: AdminDashboardData['sessionHeatmap'];
  infraHealth: AdminDashboardData['infraHealth'];
  errorDetection: AdminDashboardData['errorDetection'];
  freshnessAlerts: AdminDashboardData['freshnessAlerts'];
  playerEngagement: AdminDashboardData['playerEngagement'];
  userJourney: AdminDashboardData['userJourney'];
  stickiness: AdminDashboardData['stickiness'];
  playerFunnel: AdminDashboardData['playerFunnel'];
  /** See {@link computeDemoExclusions} — how many of `users.totalCoaches`/
   *  `totalPlayers` (Slice A) belong only to `DEMO_TEAM_IDS` and must be
   *  subtracted at the admin-data.ts assembly point (audit finding F2). */
  demoExclusions: DemoExclusions;
}

export type AllRoundsMinimal = {
  player_id: string;
  created_at: string;
  team_id: string | null;
};

// ----------------------------------------------------------------------------
// Pure helpers (audit findings F1 + F2, 2026-08-20/21). Kept here — rather
// than inline in rollup-c.ts — specifically so they're unit-testable without
// mocking Supabase: `rollup-c.ts` is a `'use server'` module wrapped in
// `withAdminObserved`, which pulls in its own `createClient()` calls on the
// error path, making the exported entry point expensive to exercise from a
// plain unit test.
// ----------------------------------------------------------------------------

/**
 * Filters an analytics-rollup `users` array down to accounts with a real
 * golf relationship (a `golf_players` or `golf_coaches` row), so
 * BaseballHelm-only accounts — which share the platform-wide `users` table
 * with no sport column — never render on GolfHelm admin surfaces (audit
 * finding F1). `get_admin_analytics_rollup`'s `users_json` carries no
 * linkage field of its own (just id/email/role/created_at/last_seen), but
 * the SAME RPC payload's `players`/`coaches` arrays do, via `user_id` — so
 * this needs no supplementary query or migration.
 *
 * Known limitation, verified against production 2026-08-21: a user who
 * completes `auth.signUp()` but abandons before the FIRST onboarding action
 * writes their `golf_players`/`golf_coaches` row has no row to match on and
 * is excluded here even if they intended to sign up for golf. In production
 * this affected exactly 1 of 164 users — an ambiguous QA-fixture account
 * (`admin-ui-*@golfhelm.local`) with no sport signal anywhere (no golf/
 * baseball row, no `auth.users.raw_user_meta_data.sport`). Every other
 * unlinked account had positive evidence of being a BaseballHelm signup (a
 * `baseball_players`/`baseball_coaches` row, or `sport: 'baseball'` in auth
 * metadata for the 6 that abandoned before that row was written too). A
 * GolfHelm user who abandons AFTER the first onboarding step still gets a
 * row (`onboarding_completed: false`) and is correctly retained here — see
 * `src/app/golf/actions/onboarding.ts` (`golf_players`/`golf_coaches`
 * insert happens well before the final `onboarding_completed: true` step).
 */
export function filterToGolfLinkedUsers<T extends { id: string }>(
  users: T[],
  players: { user_id: string }[],
  coaches: { user_id: string }[],
): T[] {
  const golfLinkedUserIds = new Set<string>();
  for (const p of players) if (p.user_id) golfLinkedUserIds.add(p.user_id);
  for (const c of coaches) if (c.user_id) golfLinkedUserIds.add(c.user_id);
  return users.filter((u) => golfLinkedUserIds.has(u.id));
}

export interface DemoExclusions {
  coaches: number;
  players: number;
  coachesOnboarded: number;
  playersOnboarded: number;
}

export const EMPTY_DEMO_EXCLUSIONS: DemoExclusions = {
  coaches: 0,
  players: 0,
  coachesOnboarded: 0,
  playersOnboarded: 0,
};

/**
 * Computes how many of a rollup's raw coach/player rows belong ONLY to the
 * seed/demo teams (`DEMO_TEAM_IDS` in `./demo-teams`) — audit finding F2.
 *
 * Matched against the SAME population `get_admin_users_rollup`'s
 * `coach_counts`/`player_counts` CTEs count: every `golf_coaches`/
 * `golf_players` row, not just ones with a resolvable `users` row or a
 * single unclaimed team. Deriving from `teamMembers`/`teamCoachStaff`
 * (rather than the team-scoped `userActivity.teams[].members` list, which
 * requires a non-null `user_id`, a matching `users` row, AND that the coach
 * isn't already counted on an earlier team) avoids under-counting.
 */
export function computeDemoExclusions(
  teamMembers: { player_id: string; team_id: string }[],
  teamCoachStaff: { coach_id: string; team_id: string }[],
  players: { id: string; onboarding_completed: boolean }[],
  coaches: { id: string; onboarding_completed: boolean }[],
  demoTeamIds: ReadonlySet<string>,
): DemoExclusions {
  const demoPlayerIds = new Set(
    teamMembers.filter((m) => demoTeamIds.has(m.team_id)).map((m) => m.player_id),
  );
  const demoCoachIds = new Set(
    teamCoachStaff.filter((s) => demoTeamIds.has(s.team_id)).map((s) => s.coach_id),
  );
  let playersOnboarded = 0;
  for (const p of players) {
    if (demoPlayerIds.has(p.id) && p.onboarding_completed) playersOnboarded++;
  }
  let coachesOnboarded = 0;
  for (const c of coaches) {
    if (demoCoachIds.has(c.id) && c.onboarding_completed) coachesOnboarded++;
  }
  return {
    coaches: demoCoachIds.size,
    players: demoPlayerIds.size,
    coachesOnboarded,
    playersOnboarded,
  };
}

export const EMPTY_ROLLUP_C: RollupC = {
  userActivity: {
    teams: [],
    unassigned: [],
    summary: {
      totalUsers: 0,
      neverLoggedIn: 0,
      activeToday: 0,
      activeThisWeek: 0,
      inactivePlus14d: 0,
      churnRisk: 0,
      stuckInOnboarding: 0,
    },
  },
  cohortMatrix: [],
  benchmarks: {
    teamComparisons: [],
    playerTrends: [],
    aiCorrelation: {
      playersWithAI: 0,
      playersWithoutAI: 0,
      avgScoreWithAI: null,
      avgScoreWithoutAI: null,
      avgImprovementWithAI: null,
      avgImprovementWithoutAI: null,
    },
  },
  coachIntelligence: [],
  sessionHeatmap: {
    pageViews: [],
    featureUsage: [],
    sessionStats: {
      avgPagesPerSession: 0,
      avgSessionDurationMin: 0,
      totalSessions7d: 0,
      totalPageViews7d: 0,
    },
    deadFeatures: [],
  },
  infraHealth: {
    apiPerf: [],
    clientErrors: [],
    dbHealth: {
      activeConnections: 0,
      idleConnections: 0,
      dbSizeBytes: 0,
      largestTables: [],
    },
    totals: {
      totalApiCalls7d: 0,
      avgResponseMs: 0,
      p95ResponseMs: 0,
      errorRate: 0,
      totalClientErrors7d: 0,
      measured: false,
    },
  },
  errorDetection: {
    errors24h: 0,
    errors7d: 0,
    unresolvedErrors: 0,
    errorsByType: [],
    errorsByRoute: [],
    errorsByUser: [],
    userExperienceIssues: {
      chunkLoadErrors: 0,
      frameworkWarnings: 0,
      serverErrors: 0,
      authErrors: 0,
    },
    lastErrorAt: null,
    allClear: true,
  },
  freshnessAlerts: {
    churnRiskPlayers: [],
    inactiveTeams: [],
    disengagedCoaches: [],
  },
  playerEngagement: {
    highEngagement: 0,
    mediumEngagement: 0,
    lowEngagement: 0,
    dormant: 0,
    segments: [],
  },
  userJourney: {
    totalSignups: 0,
    completedOnboarding: 0,
    submittedFirstRound: 0,
    activeThisWeek: 0,
  },
  stickiness: { dauMauRatio: 0, dau: 0, wau: 0, mau: 0 },
  playerFunnel: { funnel: [], stuckUsers: [] },
  demoExclusions: EMPTY_DEMO_EXCLUSIONS,
};
