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
}

export type AllRoundsMinimal = {
  player_id: string;
  created_at: string;
  team_id: string | null;
};

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
};
