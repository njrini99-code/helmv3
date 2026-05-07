'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAdminRollupA, type RollupA } from './admin/rollup-a';
import { fetchAdminRollupB, type RollupB } from './admin/rollup-b';
import { fetchAdminRollupC } from './admin/rollup-c';
import { EMPTY_ROLLUP_C, type RollupC } from './admin/rollup-c.shared';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import {
  computeActivation,
  computeMedianTTFV,
  computeWoWGrowth,
  type TTFVRecord,
} from '@/lib/admin/metrics';
import {
  groupIncidents,
  type GroupedIncident,
  type RawIncident,
  type IncidentSeverity,
} from '@/lib/admin/incident-grouping';

// ============================================
// ADMIN DASHBOARD ROLLUP (single-call RPC)
// ============================================
//
// Auth + role check runs first via the user-scoped supabase-ssr client. The
// RPC itself ALSO enforces admin-only access (migration 00004) by checking
// `users WHERE id = auth.uid() AND role = 'admin'` — this only resolves when
// the call carries the admin's JWT, which is exactly what the user-scoped
// client provides.
//
// Previous implementation wrapped this in `unstable_cache` and used the
// service_role client inside the cache body (because unstable_cache forbids
// request-scoped state). After the perf fix landed and the function actually
// began executing instead of timing out, that path tripped the SECURITY
// DEFINER admin gate: service_role JWTs leave `auth.uid()` NULL, so the
// `users.id = auth.uid()` predicate matched zero rows and the function
// raised 'Forbidden' (code=42501) — 509 occurrences in ~1.5h. The RPC is
// cheap (<100ms post-perf-fix) and only runs once per admin page load, so we
// drop the cache and call directly via the user-scoped client.

/** Shape returned by `public.get_admin_dashboard_rollup()` (see migration
 *  20260421000001_admin_dashboard_rollup.sql). */
export interface AdminDashboardRollup {
  generated_at: string;
  users: {
    total: number;
    admins: number;
    coaches: number;
    players: number;
    new_last_7d: number;
    new_last_30d: number;
    active_1h: number;
    active_24h: number;
    active_7d: number;
    active_30d: number;
  };
  rounds: {
    total_rounds: number;
    rounds_last_7d: number;
    rounds_last_30d: number;
    active_players: number;
    players_active_30d: number;
    at_risk_players: number;
  };
  rounds_today: number;
  teams: {
    golf_teams: number;
    golf_teams_new_30d: number;
    golf_teams_active: number;
    baseball_teams: number;
  };
  onboarding: {
    coaches_onboarded: number;
    players_onboarded: number;
    coaches_total: number;
    players_total: number;
  };
  signup_trend_30d: { date: string; count: number }[];
}

/** Server-side entrypoint: admin check, then one RPC round-trip via the
 *  user-scoped client so the SECURITY DEFINER `auth.uid()` gate inside
 *  `get_admin_dashboard_rollup` resolves to the invoking admin (and not
 *  NULL, as it would under the service_role JWT). */
export async function getAdminDashboardRollup(): Promise<AdminDashboardRollup> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: userRow } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (userRow?.role !== 'admin') throw new Error('Forbidden');

  // .bind() preserves `this` on the proxy; without it some bundler outputs
  // detach the rpc method from its parent client and the auth header gets
  // dropped on the underlying fetch. Same pattern as fetchAdminRollupA / C.
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    fn: 'get_admin_dashboard_rollup',
  ) => Promise<{ data: AdminDashboardRollup | null; error: unknown }>;
  const { data, error } = await rpc('get_admin_dashboard_rollup');
  if (error) throw error instanceof Error ? error : new Error(describeError(error));
  if (!data) throw new Error('Empty rollup response');
  return data;
}

/** Kept for API compatibility; the rollup is no longer cached so this is a
 *  no-op apart from the broader `revalidatePath('/golf/admin')` invalidation
 *  the rest of the codebase already uses for admin-surfaced mutations. */
export async function invalidateAdminDashboardRollup(): Promise<void> {
  revalidatePath('/golf/admin');
}

// ============================================
// TYPES
// ============================================

type DashboardIncidentStatus = 'open' | 'active' | 'resolved' | 'historical';

interface DashboardErrorIncident {
  id: string;
  eventIds: string[];
  title: string;
  message: string;
  severity: string;
  status: DashboardIncidentStatus;
  summary: string;
  diagnosisBasis: string;
  likelyCause: string;
  userImpact: string;
  nextStep: string;
  featureArea: string;
  action: string | null;
  route: string | null;
  url: string | null;
  source: string | null;
  stack: string | null;
  userId: string | null;
  userEmail: string | null;
  createdAt: string;
  firstSeen: string;
  lastSeen: string;
  occurrences: number;
  affectedUsers: number;
  errorCode: string | null;
  errorHint: string | null;
  errorDetails: string | null;
  requestId: string | null;
  roundId: string | null;
  playerId: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  copySummary: string;
}

export interface AdminDashboardData {
  health: {
    activeUsers24h: number;
    activeUsers7d: number;
    activeUsers30d: number;
    roundsThisWeek: number;
    roundReviewsThisWeek: number;
    insightsThisWeek: number;
    systemErrors7d: number;
    avgResponseTimeMs: number;
    dataFreshness: 'live' | 'stale' | 'error';
    lastRoundSubmitted: string | null;
    lastInsightGenerated: string | null;
    roundsToday: number;
    diagnostics: {
      label: string;
      status: 'healthy' | 'warning' | 'critical';
      detail: string;
    }[];
    // Real platform health from auth sessions + DB
    realActiveUsers1h: number;
    realActiveUsers24h: number;
    realActiveUsers7d: number;
    realActiveUsers30d: number;
    activeSessions: number;
    totalSessions: number;
    totalAuthUsers: number;
    usersSignedInToday: number;
    usersNeverSignedIn: number;
    dbSizeBytes: number;
    activeConnections: number;
    idleConnections: number;
    largestTables: { table_name: string; size_bytes: number; row_count: number }[];
  };
  users: {
    totalCoaches: number;
    totalPlayers: number;
    totalAdmins: number;
    coachOnboardingRate: number;
    playerOnboardingRate: number;
    activeTeams: number;
    signupsByWeek: { week: string; count: number }[];
    newUsersThisWeek: number;
    newUsersLastWeek: number;
    playersByOnboarding: { status: string; count: number }[];
    playersByStatus: { status: string; count: number }[];
    playersByYear: { year: string; count: number }[];
  };
  growth: {
    userGrowthRate: number;
    roundGrowthRate: number;
    teamGrowthThisMonth: number;
    churnedPlayers30d: number;
    retentionCohorts: { week: number; retained: number; total: number; rate: number }[];
    avgRoundsPerActivePlayer: number;
    topFeatureByAdoption: string;
    npsProxy: number;
    platformHealthScore: number;
    /** Per-input breakdown of how `platformHealthScore` was computed. Each
     *  entry is one of the four equal-weighted inputs (25% each). `value` is
     *  the raw metric (already scaled into 0–100), `contribution` is its
     *  contribution to the final score (`value * weight`, summed = score). */
    platformHealthBreakdown: {
      key: string;
      label: string;
      description: string;
      weight: number;
      rawValue: number;
      rawDisplay: string;
      value: number;
      contribution: number;
    }[];
  };
  usage: {
    roundsByType: { type: string; count: number }[];
    roundsByWeek: { week: string; count: number }[];
    totalShots: number;
    totalRounds: number;
    avgShotsPerRound: number;
    featureAdoption: { feature: string; count: number }[];
    roundsCompletionRate: number;
    verifiedRoundsRate: number;
  };
  coachhelm: {
    insightsByWeek: { week: string; count: number }[];
    reviewsByWeek: { week: string; count: number }[];
    modelPerformance: {
      model_type: string;
      accuracy_rate: number | null;
      calibration_score: number | null;
      predictions_made: number | null;
    }[];
    insightEffectiveness: {
      insight_type: string;
      action_rate: number | null;
      improvement_rate: number | null;
      effectiveness_score: number | null;
    }[];
    totalPatternsDetected: number;
    totalPredictionsMade: number;
    totalReviewsAllTime: number;
    avgInsightsPerGeneration: number;
    coachPhilosophyAdoption: number;
  };
  teams: {
    id: string;
    name: string;
    orgName: string | null;
    playerCount: number;
    coachCount: number;
    roundsThisWeek: number;
    avgScore: number | null;
    topPlayer: { name: string; avg: number } | null;
  }[];
  scoring: {
    platformScoringAvg: number | null;
    platformFairwayPct: number | null;
    platformGirPct: number | null;
    platformPuttsPerRound: number | null;
    topPerformers: {
      name: string;
      teamName: string | null;
      scoringAvg: number;
      roundsPlayed: number;
    }[];
    scoringDistribution: { bucket: string; count: number }[];
    recentBestRounds: {
      playerName: string;
      courseName: string | null;
      score: number;
      toPar: number;
      date: string | null;
    }[];
  };
  engagement: {
    dailyActiveUsers: { date: string; count: number }[];
    weeklyRetention: number;
    avgRoundsPerPlayer: number;
    playersWithNoRounds: number;
    coachesUsingInsights: number;
    eventAttendanceRate: number | null;
  };
  activity: {
    recentSignups: { id: string; email: string; role: string | null; created_at: string | null }[];
    recentRounds: {
      id: string;
      player_name: string;
      course_name: string | null;
      total_score: number | null;
      total_to_par: number | null;
      round_type: string | null;
      created_at: string | null;
    }[];
    recentInsights: {
      id: string;
      insight_type: string | null;
      insights_generated: number | null;
      created_at: string | null;
    }[];
    recentAdminEvents: {
      id: string;
      eventType: string;
      severity: string;
      title: string;
      message: string | null;
      userEmail: string | null;
      url: string | null;
      resolved: boolean;
      createdAt: string;
    }[];
    recentAuditEvents: {
      id: string;
      action: string;
      tableName: string | null;
      recordId: string | null;
      userEmail: string | null;
      createdAt: string;
    }[];
  };
  // New: Full user directory with team + activity
  userDirectory: {
    id: string;
    email: string;
    role: string | null;
    createdAt: string | null;
    firstName: string | null;
    lastName: string | null;
    teamName: string | null;
    teamId: string | null;
    lastRoundDate: string | null;
    lastActiveAt: string | null;
    totalRounds: number;
    onboardingCompleted: boolean;
  }[];
  // New: Full team roster detail
  teamRosters: {
    id: string;
    name: string;
    orgName: string | null;
    coaches: { id: string; firstName: string; lastName: string; email: string }[];
    players: {
      id: string;
      firstName: string;
      lastName: string;
      email: string | null;
      gradYear: number | null;
      lastRoundDate: string | null;
      totalRounds: number;
      scoringAvg: number | null;
      onboardingCompleted: boolean;
    }[];
  }[];
  // New: Daily signups (last 30 days)
  signupsByDay: { date: string; count: number }[];
  // New: Daily visits/active users (last 30 days, based on rounds submitted)
  visitsByDay: { date: string; count: number }[];
  // Round completion funnel
  funnel: {
    roundsStarted: number;
    roundsCompleted: number;
    roundsWithScore: number;
    roundsReviewed: number;
    roundsWithInsights: number;
  };
  // Shot data quality
  dataQuality: {
    totalShots: number;
    shotsWithDistance: number;
    shotsWithLie: number;
    shotsWithClub: number;
    distancePercentage: number;
    liePercentage: number;
    clubPercentage: number;
  };
  // User journey
  userJourney: {
    totalSignups: number;
    completedOnboarding: number;
    submittedFirstRound: number;
    activeThisWeek: number;
  };
  // Feature stickiness (DAU/MAU)
  stickiness: {
    dauMauRatio: number;
    dau: number;
    wau: number;
    mau: number;
  };
  // Player engagement segments
  playerEngagement: {
    highEngagement: number;
    mediumEngagement: number;
    lowEngagement: number;
    dormant: number;
    segments: { label: string; count: number; color: string }[];
  };
  // CoachHelm ROI
  coachhelmRoi: {
    coachesUsingAI: number;
    coachesNotUsingAI: number;
    avgScoreAICoachPlayers: number | null;
    avgScoreNonAICoachPlayers: number | null;
    scoreDifference: number | null;
  };
  // Error tracking
  errorLogs: {
    totalErrors7d: number;
    criticalErrors7d: number;
    incidentCounts: {
      open: number;
      active: number;
      resolved: number;
      historical: number;
      repeated: number;
      openCritical: number;
      resolvedRecently: number;
    };
    recentErrors: DashboardErrorIncident[];
    /**
     * Tighter regrouping of `recentErrors` keyed by a stable signature
     * (severity + errorCode + normalised route + message prefix). One card
     * per signature in the System tab Incident Command Feed instead of one
     * card per occurrence. Keep `recentErrors` around for code that still
     * iterates the per-incident list (legacy stats tiles, copy summary).
     */
    groupedIncidents: GroupedIncident[];
    errorsByDay: { date: string; count: number }[];
    bySeverity: { severity: string; count: number }[];
    topErrors: {
      message: string;
      severity: string;
      occurrences: number;
      firstSeen: string;
      lastSeen: string;
      affectedUsers: number;
    }[];
    errorSummaryDegraded?: boolean;
    adminEventSummaryDegraded?: boolean;
  };
  // Audit log
  auditLog: {
    totalEvents7d: number;
    recentEvents: {
      id: string;
      userId: string | null;
      userEmail: string | null;
      action: string;
      tableName: string | null;
      recordId: string | null;
      oldData: Record<string, unknown> | null;
      newData: Record<string, unknown> | null;
      createdAt: string;
    }[];
  };
  // Login security
  loginSecurity: {
    failedLogins7d: number;
    lockedAccounts: number;
    recentAttempts: {
      email: string;
      failedAttempts: number;
      lastAttempt: string | null;
      lockedUntil: string | null;
    }[];
  };
  // Baseball data (merged from command center)
  baseball: {
    totalPlayers: number;
    totalCoaches: number;
    watchlistStages: Record<string, number>;
    recruitingActivePlayers: number;
    commitments: number;
    videos30d: number;
    engagementEvents30d: number;
    messages30d: number;
    conversations30d: number;
    playersOnboarded: number;
    coachesOnboarded: number;
    totalTeams: number;
    totalEvents: number;
    totalCamps: number;
    recruitingActivatedPlayers: number;
  };
  // Total platform users (from users table — single source of truth)
  totalPlatformUsers: number;
  // Demo requests
  demoRequests: {
    total: number;
    pending: number;
    contacted: number;
    recentRequests: {
      name: string;
      email: string;
      organization: string | null;
      interestType: string | null;
      status: string;
      createdAt: string;
    }[];
  };
  // Golf communication metrics
  golfCommunication: {
    totalAnnouncements: number;
    announcementAckRate: number | null;
    totalGolfMessages: number;
    totalConversations: number;
  };
  // Platform strokes gained averages
  strokesGained: {
    sgTotal: number | null;
    sgTee: number | null;
    sgApproach: number | null;
    sgAroundGreen: number | null;
    sgPutting: number | null;
  };
  // Needs attention items
  needsAttention: {
    label: string;
    severity: 'info' | 'warning' | 'critical';
    detail: string;
    tab: string;
  }[];
  // --- NEW: Enhanced analytics ---
  // Cohort retention matrix (8-week cohorts)
  cohortMatrix: {
    cohortWeek: string;
    cohortSize: number;
    retentionByWeek: number[];
  }[];
  // Coach intelligence
  coachIntelligence: {
    id: string;
    name: string;
    teamName: string | null;
    totalPlayers: number;
    roundsReviewed: number;
    totalPlayerRounds: number;
    reviewRate: number;
    avgResponseTimeHours: number | null;
    insightsViewed: number;
    lastActiveAt: string | null;
    philosophyConfigured: boolean;
  }[];
  // Player dropoff funnel
  playerFunnel: {
    funnel: {
      stage: string;
      count: number;
      percentage: number;
      dropoffFromPrevious: number;
      dropoffPct: number;
    }[];
    stuckUsers: {
      stage: string;
      users: {
        id: string;
        name: string;
        email: string;
        daysSinceSignup: number;
        lastActiveAt: string | null;
      }[];
    }[];
  };
  // Session heatmap
  sessionHeatmap: {
    pageViews: { pagePath: string; viewCount: number; uniqueUsers: number }[];
    featureUsage: { featureName: string; useCount: number; uniqueUsers: number }[];
    sessionStats: { avgPagesPerSession: number; avgSessionDurationMin: number; totalSessions7d: number; totalPageViews7d: number };
    deadFeatures: string[];
  };
  // Infra health
  infraHealth: {
    apiPerf: { actionName: string; avgDurationMs: number; p95DurationMs: number; callCount: number; errorRate: number }[];
    clientErrors: { message: string; occurrences: number; lastSeen: string; affectedPages: string[] }[];
    dbHealth: { activeConnections: number; idleConnections: number; dbSizeBytes: number; largestTables: { tableName: string; sizeBytes: number; rowCount: number }[] };
    totals: { totalApiCalls7d: number; avgResponseMs: number; p95ResponseMs: number; errorRate: number; totalClientErrors7d: number };
  };
  // Data freshness alerts
  freshnessAlerts: {
    churnRiskPlayers: { id: string; name: string; teamName: string | null; daysSinceLastRound: number; totalRounds: number; lastRoundDate: string | null }[];
    inactiveTeams: { id: string; name: string; playerCount: number; daysSinceAnyLogin: number; lastActivityDate: string | null }[];
    disengagedCoaches: { id: string; name: string; teamName: string | null; daysSinceInsightCheck: number; totalInsightsAvailable: number; lastInsightCheckDate: string | null }[];
  };
  // Comparative benchmarks
  benchmarks: {
    teamComparisons: { id: string; name: string; playerCount: number; avgScore: number | null; avgFairwayPct: number | null; avgGirPct: number | null; avgPuttsPerRound: number | null; roundsThisMonth: number; improvementTrend: number | null }[];
    playerTrends: { id: string; name: string; teamName: string | null; scoringHistory: { month: string; avg: number }[]; currentAvg: number | null; previousAvg: number | null; improvement: number | null }[];
    aiCorrelation: { playersWithAI: number; playersWithoutAI: number; avgScoreWithAI: number | null; avgScoreWithoutAI: number | null; avgImprovementWithAI: number | null; avgImprovementWithoutAI: number | null };
  };
  // User auth details (last login from auth.users)
  userAuthDetails: {
    userId: string;
    lastSignInAt: string | null;
    lastSeen: string | null;
  }[];
  // Admin events (real-time event tracking)
  adminEvents: {
    totalEvents7d: number;
    errorCount7d: number;
    criticalCount7d: number;
    unresolvedCount: number;
    eventsByType: Record<string, number>;
    eventsBySeverity: Record<string, number>;
    eventsByDay: { date: string; count: number }[];
    recentEvents: {
      id: string;
      eventType: string;
      severity: string;
      title: string;
      message: string | null;
      userId: string | null;
      userEmail: string | null;
      url: string | null;
      resolved: boolean;
      createdAt: string;
    }[];
    unresolvedCritical: {
      id: string;
      eventType: string;
      title: string;
      message: string | null;
      createdAt: string;
    }[];
  };
  // Enhanced user activity with team grouping
  userActivity: {
    teams: {
      teamId: string;
      teamName: string;
      season: string;
      memberCount: number;
      activeCount: number;
      avgRoundsPerPlayer: number;
      lastTeamActivity: string | null;
      healthStatus: 'healthy' | 'warning' | 'critical';
      members: {
        id: string;
        email: string;
        name: string | null;
        role: string;
        created_at: string;
        last_seen: string | null;
        daysSinceLastSeen: number | null;
        activityStatus: 'active_today' | 'active_week' | 'active_month' | 'inactive' | 'never';
        roundsEntered: number;
        lastRoundDate: string | null;
        avgScore: number | null;
        insightsReceived: number;
        roundReviews: number;
        onboardingCompleted: boolean;
      }[];
    }[];
    unassigned: {
      id: string;
      email: string;
      name: string | null;
      role: string;
      created_at: string;
      last_seen: string | null;
      daysSinceLastSeen: number | null;
      activityStatus: 'active_today' | 'active_week' | 'active_month' | 'inactive' | 'never';
      onboardingCompleted: boolean;
    }[];
    summary: {
      totalUsers: number;
      neverLoggedIn: number;
      activeToday: number;
      activeThisWeek: number;
      inactivePlus14d: number;
      churnRisk: number;
      stuckInOnboarding: number;
    };
  };
  // Error detection and classification
  errorDetection: {
    errors24h: number;
    errors7d: number;
    unresolvedErrors: number;
    errorsByType: { type: string; count: number; lastOccurred: string }[];
    errorsByRoute: { route: string; count: number }[];
    errorsByUser: { userId: string | null; email: string | null; count: number }[];
    userExperienceIssues: {
      chunkLoadErrors: number;
      frameworkWarnings: number;
      serverErrors: number;
      authErrors: number;
    };
    lastErrorAt: string | null;
    allClear: boolean;
  };
  // BI Dashboard
  bi: BIDashboardData;
  // Degraded state flags (RPC functions unavailable)
  errorSummaryDegraded?: boolean;
  adminEventSummaryDegraded?: boolean;
  /** A Slice-B sub-RPC timed out or errored — at least one of baseball /
   *  errors / teams subtrees in rollupB is populated with empty defaults.
   *  Read by the UI to show a "degraded mode" banner instead of crashing. */
  rollupBDegraded?: boolean;
  /** The single analytics RPC that powers Slice C timed out or errored. All
   *  analytics widgets (coach intelligence, heatmap, funnel, etc.) will show
   *  empty data with an explanatory banner. */
  rollupCDegraded?: boolean;
  // Stats cache freshness
  statsCacheLastUpdated?: string | null;
}

interface DashboardErrorContext {
  action: string | null;
  route: string | null;
  url: string | null;
  featureArea: string | null;
  source: string | null;
  requestId: string | null;
  roundId: string | null;
  playerId: string | null;
  userId: string | null;
  userEmail: string | null;
  errorCode: string | null;
  errorHint: string | null;
  errorDetails: string | null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function normalizeIncidentMessage(message: string): string {
  return message
    .trim()
    .toLowerCase()
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, ':uuid')
    .replace(/\b[a-f0-9]{16,}\b/gi, ':id')
    .replace(/\b\d{5,}\b/g, ':id')
    .replace(/\s+/g, ' ');
}

function normalizeIncidentPath(pathOrUrl: string | null): string {
  if (!pathOrUrl) return '';

  const rawPath = (() => {
    try {
      return new URL(pathOrUrl, 'http://localhost').pathname;
    } catch {
      return pathOrUrl.split('?')[0]?.split('#')[0] ?? pathOrUrl;
    }
  })();

  const segments = rawPath
    .split('/')
    .filter(Boolean)
    .map((segment) => (
      /^[0-9]+$/.test(segment)
      || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)
      || /^[a-f0-9]{16,}$/i.test(segment)
        ? ':id'
        : segment
    ));

  return segments.length > 0 ? `/${segments.join('/')}` : '/';
}

function buildDashboardErrorContext(rawContext: unknown): DashboardErrorContext {
  const context = asObject(rawContext);
  return {
    action: asString(context?.action),
    route: asString(context?.route),
    url: asString(context?.url),
    featureArea: asString(context?.featureArea),
    source: asString(context?.source),
    requestId: asString(context?.requestId),
    roundId: asString(context?.roundId),
    playerId: asString(context?.playerId),
    userId: asString(context?.userId),
    userEmail: asString(context?.userEmail),
    errorCode: asString(context?.errorCode),
    errorHint: asString(context?.errorHint),
    errorDetails: asString(context?.errorDetails),
  };
}

function mergeDashboardErrorContext(
  primary: DashboardErrorContext,
  fallback: DashboardErrorContext,
): DashboardErrorContext {
  return {
    action: primary.action ?? fallback.action,
    route: primary.route ?? fallback.route,
    url: primary.url ?? fallback.url,
    featureArea: primary.featureArea ?? fallback.featureArea,
    source: primary.source ?? fallback.source,
    requestId: primary.requestId ?? fallback.requestId,
    roundId: primary.roundId ?? fallback.roundId,
    playerId: primary.playerId ?? fallback.playerId,
    userId: primary.userId ?? fallback.userId,
    userEmail: primary.userEmail ?? fallback.userEmail,
    errorCode: primary.errorCode ?? fallback.errorCode,
    errorHint: primary.errorHint ?? fallback.errorHint,
    errorDetails: primary.errorDetails ?? fallback.errorDetails,
  };
}

function normalizeIncidentKey(
  message: string,
  routeOrUrl: string | null,
  action: string | null,
  errorCode: string | null
): string {
  return [
    normalizeIncidentMessage(message),
    normalizeIncidentPath(routeOrUrl),
    action ?? '',
    errorCode ?? '',
  ].join('::');
}

function toFeatureAreaLabel(featureArea: string | null, url: string | null, message: string): string {
  const normalizedArea = featureArea?.toLowerCase() ?? '';
  const normalizedUrl = (url ?? '').toLowerCase();
  const normalizedMessage = message.toLowerCase();

  if (normalizedArea === 'shot_tracking' || normalizedMessage.includes('round submit') || normalizedMessage.includes('continue round')) {
    return 'Shot Tracking';
  }
  if (normalizedArea === 'stats_cache' || normalizedMessage.includes('stats cache') || normalizedMessage.includes('refresh_player_stats_cache')) {
    return 'Stats Cache';
  }
  if (normalizedArea === 'coachhelm_ai') {
    return 'CoachHelm AI';
  }
  if (normalizedArea === 'calendar' || normalizedUrl.includes('/calendar')) {
    return 'Calendar';
  }
  if (normalizedArea === 'admin_crm') {
    return 'Admin CRM';
  }
  if (normalizedUrl.includes('/admin')) {
    return 'Admin';
  }

  return 'Platform';
}

function deriveIncidentNarrative(
  message: string,
  featureArea: string,
  action: string | null,
  url: string | null,
  errorCode: string | null,
): Pick<DashboardErrorIncident, 'title' | 'summary' | 'diagnosisBasis' | 'likelyCause' | 'userImpact' | 'nextStep'> {
  const normalized = message.toLowerCase();

  if (normalized.includes('stack depth limit exceeded')) {
    return {
      title: 'Round submit recursion failure',
      summary: 'The round submit transaction hit PostgreSQL\'s stack-depth guard and aborted before the save path could finish.',
      diagnosisBasis: 'Matched the explicit PostgreSQL message "stack depth limit exceeded" in the round submit path.',
      likelyCause: 'A database function or trigger in the round submit flow is recursing or re-entering too deeply.',
      userImpact: 'Players can see submit failures or repeated save attempts while finishing a round.',
      nextStep: 'Inspect submit_round_atomic and any triggers/functions it calls for recursive writes or self-referencing cache refresh logic.',
    };
  }

  if (normalized.includes('created_at') && normalized.includes('ambiguous')) {
    return {
      title: 'Stats refresh query is ambiguous',
      summary: 'The round submit flow reached a SQL statement that referenced created_at without a table alias, so Postgres rejected it.',
      diagnosisBasis: 'Matched the Postgres parser error that mentions "created_at" together with "ambiguous".',
      likelyCause: 'A joined stats-cache query or RPC orders or filters by created_at without qualifying the source table.',
      userImpact: 'Round submits can fail even when the underlying hole and shot data is otherwise valid.',
      nextStep: 'Review refresh_player_stats_cache and related SQL for unqualified created_at references.',
    };
  }

  if (normalized.includes('putt_details_distance_feet_check')) {
    return {
      title: 'Putt detail rejected by DB constraint',
      summary: 'A putt detail row was rejected because the submitted distance exceeded the database constraint.',
      diagnosisBasis: 'Matched the named database constraint `putt_details_distance_feet_check` in the captured error text.',
      likelyCause: 'The app derived or forwarded a putt distance outside the allowed range for putt_details.distance_feet.',
      userImpact: 'Players can lose a round submit when a long putt or converted distance is out of bounds.',
      nextStep: 'Compare derivePuttDistanceFeet and the putt_details constraint against the actual values being inserted.',
    };
  }

  if (normalized.includes('approach_miss_details_lie_type_check')) {
    return {
      title: 'Approach detail rejected by DB constraint',
      summary: 'An approach miss detail row used a lie_type value the database constraint did not allow.',
      diagnosisBasis: 'Matched the named database constraint `approach_miss_details_lie_type_check` in the captured error text.',
      likelyCause: 'The shot tracking flow emitted a lie label that no longer matched the allowed approach_miss_details values.',
      userImpact: 'Players can see round submit failures on otherwise valid approach shots.',
      nextStep: 'Compare the approach miss lie mapping in the app with the current DB constraint values.',
    };
  }

  if (normalized.includes('continue round')) {
    return {
      title: 'Continue-round rehydration failed',
      summary: 'The server could not fully reload the in-progress round state needed to resume tracking.',
      diagnosisBasis: 'Matched the continue-round path name in the message body or captured action context.',
      likelyCause: 'A DB read failed while loading the round, holes, shots, or shot detail records.',
      userImpact: 'Players may see a broken continue-round screen or missing tracked progress.',
      nextStep: 'Check the affected round ID and validate the round, hole, shot, putt, and approach detail queries.',
    };
  }

  if (
    normalized.includes('refresh_player_stats_cache')
    || normalized.includes('mark_player_stats_stale')
    || normalized.includes('recalculate_round_strokes_gained')
    || normalized.includes('update_player_stats_strokes_gained')
    || normalized.includes('stats cache')
  ) {
    return {
      title: 'Stats cache repair failed',
      summary: 'The post-round cache refresh or strokes-gained repair path failed and the derived stats may now be stale.',
      diagnosisBasis: 'Matched a known cache-repair function or a message that explicitly mentions stats cache work.',
      likelyCause: 'A cache RPC errored, timed out, or returned data that did not reconcile with live round totals.',
      userImpact: 'Dashboard stats can stay stale or inconsistent after a save or submit.',
      nextStep: 'Check the named cache RPC/function and compare live round totals with golf_player_stats_cache for the affected player.',
    };
  }

  if (
    normalized.includes('unauthorized')
    || normalized.includes('forbidden')
    || normalized.includes('jwt')
    || normalized.includes('auth session')
  ) {
    return {
      title: 'Access control or auth failure',
      summary: 'The request failed before the feature could complete because authentication or authorization state was rejected.',
      diagnosisBasis: 'Matched auth-specific language in the error message or context, including JWT/session/forbidden terms.',
      likelyCause: 'The user session expired, the request lacked a valid auth token, or the server denied the user role.',
      userImpact: 'Users can hit redirects, red error states, or blocked actions even though the page rendered.',
      nextStep: 'Inspect the auth state, user role, and the protected action or route shown below.',
    };
  }

  if (normalized.includes('chunkloaderror') || normalized.includes('loading chunk') || normalized.includes('failed to fetch dynamically imported module')) {
    return {
      title: 'Frontend asset mismatch after deploy',
      summary: 'The client tried to load a JavaScript chunk that no longer matched the active deployment.',
      diagnosisBasis: 'Matched known chunk-loading phrases that usually appear when a user has stale assets after a deploy.',
      likelyCause: 'The browser still had an older app shell or chunk manifest cached while the deployment changed underneath it.',
      userImpact: 'Users can see red-screen loader failures until they refresh and pull the latest assets.',
      nextStep: 'Check the current deployment, confirm cache headers, and compare the failing chunk URL with the latest build.',
    };
  }

  if (normalized.includes('timeout') || normalized.includes('timed out')) {
    return {
      title: 'Request timeout or slow dependency',
      summary: 'The request exceeded an expected execution window and failed before the response could complete.',
      diagnosisBasis: 'Matched timeout language in the captured error message.',
      likelyCause: 'A downstream query, RPC, network dependency, or external service is responding too slowly.',
      userImpact: 'Users can see long waits followed by failures or partial state updates.',
      nextStep: 'Check the route/action timing, DB query performance, and any external service calls attached to this request.',
    };
  }

  if ((url ?? '').includes('/api/') || normalized.includes('route handler') || normalized.includes('api')) {
    return {
      title: 'API route failure',
      summary: 'A server route handler failed while processing a request.',
      diagnosisBasis: 'The captured route/message points to an API or route-handler execution path.',
      likelyCause: 'The handler threw an exception, rejected a payload, or failed against a downstream dependency.',
      userImpact: 'Users can see failed saves, missing data, or red-letter API responses in the app.',
      nextStep: 'Inspect the failing route, request context, and raw error details below.',
    };
  }

  if (normalized.includes('round submit') || action === 'submitGolfRoundComprehensive') {
    return {
      title: 'Round submit failed',
      summary: 'The server could not finish the round submit transaction.',
      diagnosisBasis: 'Matched the round submit action name or message content captured by the server trace.',
      likelyCause: 'A database RPC, trigger, validation rule, or downstream cache refresh step rejected the payload.',
      userImpact: 'Players likely saw the round save or submit fail.',
      nextStep: 'Review submitGolfRoundComprehensive, submit_round_atomic, and the raw error details below.',
    };
  }

  return {
    title: `${featureArea} incident`,
    summary: 'The admin dashboard received a server-side error event with enough context to review but not a known specialized pattern.',
    diagnosisBasis: action || url
      ? `Using captured context from ${action ?? 'an unknown action'} on ${normalizeIncidentPath(url)} because the message did not match a specialized rule.`
      : 'No specialized pattern matched, so the diagnosis is based on the raw message and captured trace metadata.',
    likelyCause: action
      ? `The ${action} path threw an error and the trace was captured for review.`
      : 'The request failed in a server path that did not match a specialized diagnosis rule.',
    userImpact: url
      ? `Users interacting with ${url} may have seen a failure or stale data.`
      : 'Users may have hit a failure in the affected feature area.',
    nextStep: errorCode
      ? `Start with the raw message, error code ${errorCode}, and the stack/context below.`
      : 'Start with the raw message and stack/context below.',
  };
}

function buildIncidentCopySummary(incident: DashboardErrorIncident): string {
  return [
    `Severity: ${incident.severity.toUpperCase()}`,
    `Status: ${incident.status.toUpperCase()}`,
    `Title: ${incident.title}`,
    `Area: ${incident.featureArea}`,
    `Summary: ${incident.summary}`,
    `Diagnosis basis: ${incident.diagnosisBasis}`,
    `Likely cause: ${incident.likelyCause}`,
    `User impact: ${incident.userImpact}`,
    `Next step: ${incident.nextStep}`,
    `Occurrences: ${incident.occurrences}`,
    `Affected users: ${incident.affectedUsers}`,
    `First seen: ${incident.firstSeen}`,
    `Last seen: ${incident.lastSeen}`,
    incident.action ? `Action: ${incident.action}` : null,
    incident.route ? `Route: ${incident.route}` : null,
    incident.url ? `URL: ${incident.url}` : null,
    incident.source ? `Source: ${incident.source}` : null,
    incident.errorCode ? `Error code: ${incident.errorCode}` : null,
    incident.errorHint ? `Hint: ${incident.errorHint}` : null,
    incident.errorDetails ? `Details: ${incident.errorDetails}` : null,
    incident.requestId ? `Request ID: ${incident.requestId}` : null,
    incident.roundId ? `Round ID: ${incident.roundId}` : null,
    incident.playerId ? `Player ID: ${incident.playerId}` : null,
    incident.userEmail ? `User: ${incident.userEmail}` : null,
    incident.resolvedAt ? `Resolved at: ${incident.resolvedAt}` : null,
    incident.resolvedBy ? `Resolved by: ${incident.resolvedBy}` : null,
    `Raw message: ${incident.message}`,
    incident.stack ? `Stack:\n${incident.stack}` : null,
  ].filter(Boolean).join('\n');
}

const DASHBOARD_SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  error: 1,
  warning: 2,
  info: 3,
};

function normalizeDashboardSeverity(severity: string | null | undefined): 'critical' | 'error' | 'warning' | 'info' {
  const normalized = severity?.toLowerCase();
  if (normalized === 'critical' || normalized === 'error' || normalized === 'warning' || normalized === 'info') {
    return normalized;
  }
  return 'error';
}

function extractErrorRoute(url: string | null): string | null {
  if (!url) return null;
  return normalizeIncidentPath(url);
}

interface AdminEventIncidentResolution {
  resolvedAt: string | null;
  resolvedBy: string | null;
}

interface AdminEventIncidentRecord {
  id: string;
  event_type: string;
  severity: string;
  title: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  user_id: string | null;
  user_email: string | null;
  url: string | null;
  resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

function buildAdminEventIncidentKey(event: Pick<AdminEventIncidentRecord, 'title' | 'message' | 'metadata' | 'url'>): string {
  const metadata = asObject(event.metadata);
  const context = buildDashboardErrorContext(event.metadata);
  const keyMessage =
    asString(metadata?.originalMessage)
    ?? asString(metadata?.message)
    ?? event.message
    ?? event.title;

  return normalizeIncidentKey(
    keyMessage,
    context.route ?? event.url ?? context.url,
    context.action,
    context.errorCode,
  );
}

export async function resolveDashboardIncident(input: {
  incidentKey: string;
  title: string;
  message: string;
  severity: string;
  route: string | null;
  url: string | null;
  action: string | null;
  featureArea: string;
  errorCode: string | null;
  source: string | null;
  eventIds?: string[];
}): Promise<{
  success: boolean;
  resolvedCount: number;
  message: string;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if ((userData?.role as string) !== 'admin') throw new Error('Forbidden');

  const adminDb = createAdminClient();

  // If caller provided event IDs directly (e.g. from tracer incidents which
  // already know the exact events), resolve them without re-fetching + key matching.
  let matchingIds: string[] = [];
  if (input.eventIds && input.eventIds.length > 0) {
    matchingIds = input.eventIds;
  } else {
    const { data, error } = await adminDb
      .from('admin_events')
      .select('id, event_type, severity, title, message, metadata, user_id, user_email, url, resolved, resolved_at, resolved_by, created_at')
      .eq('event_type', 'error')
      .eq('resolved', false)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      return { success: false, resolvedCount: 0, message: `Could not load incident events: ${error.message}` };
    }

    matchingIds = ((data ?? []) as AdminEventIncidentRecord[])
      .filter((event) => buildAdminEventIncidentKey(event) === input.incidentKey)
      .map((event) => event.id);
  }

  const resolvedAt = new Date().toISOString();
  if (matchingIds.length > 0) {
    const { error: updateError } = await adminDb
      .from('admin_events')
      .update({
        resolved: true,
        resolved_at: resolvedAt,
        resolved_by: user.id,
      })
      .in('id', matchingIds);

    if (updateError) {
      return { success: false, resolvedCount: 0, message: `Could not resolve incident: ${updateError.message}` };
    }

    revalidatePath('/golf/admin');
    return {
      success: true,
      resolvedCount: matchingIds.length,
      message: `Marked incident resolved and closed ${matchingIds.length} admin event${matchingIds.length === 1 ? '' : 's'}.`,
    };
  }

  const { error: insertError } = await adminDb
    .from('admin_events')
    .insert({
      event_type: 'error',
      severity: normalizeDashboardSeverity(input.severity),
      title: input.title,
      message: input.message,
      metadata: {
        originalMessage: input.message,
        message: input.message,
        route: input.route,
        url: input.url,
        action: input.action,
        featureArea: input.featureArea,
        errorCode: input.errorCode,
        source: input.source ?? 'admin_dashboard_manual_resolution',
        resolutionSource: 'admin_dashboard',
        manualResolved: true,
      },
      user_id: user.id,
      user_email: user.email ?? null,
      url: input.url,
      resolved: true,
      resolved_at: resolvedAt,
      resolved_by: user.id,
    });

  if (insertError) {
    return { success: false, resolvedCount: 0, message: `Could not create resolution record: ${insertError.message}` };
  }

  revalidatePath('/golf/admin');
  return {
    success: true,
    resolvedCount: 1,
    message: 'Marked incident resolved and created a manual resolution record for the dashboard feed.',
  };
}

// ============================================
// ADMIN INCIDENTS — cursor-paginated feed
// ============================================
//
// The Overview tab still uses the single-shot fetch baked into the rollup
// pipeline (rawAdminErrorEvents / errorLogs). This separate exported action
// powers the System tab's incident feed where the row count grows unbounded
// over time and pulling everything per render becomes the bottleneck.
//
// Cursor is the `created_at` ISO string of the last row in the previous page.
// The feed is ordered DESC, so paging forward means `created_at < cursor`.
// Limit is clamped to [1, 200]; default is 50.

/** Active, non-info admin_event row in the shape consumed by the System tab
 *  incident list. Shape is camelCased and free of any `any`.
 *
 *  `admin_events` has no `status` column on the DB side — `resolved=false`
 *  is the canonical "active" signal. We surface a synthesized
 *  `status: 'active'` so the consuming UI matches the dashboard's existing
 *  active/open/resolved/historical vocabulary. */
export interface AdminIncident {
  id: string;
  eventType: string;
  severity: 'critical' | 'error' | 'warning';
  status: 'active';
  title: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  userId: string | null;
  userEmail: string | null;
  url: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
}

export interface GetAdminIncidentsParams {
  cursor?: string;
  limit?: number;
}

export interface GetAdminIncidentsResult {
  items: AdminIncident[];
  nextCursor: string | null;
}

/** Raw row shape returned by Supabase before camelCasing. Kept private — the
 *  exported `AdminIncident` is the public contract. */
interface AdminIncidentRow {
  id: string;
  event_type: string;
  severity: string;
  title: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  user_id: string | null;
  user_email: string | null;
  url: string | null;
  resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

const ADMIN_INCIDENTS_DEFAULT_LIMIT = 50;
const ADMIN_INCIDENTS_MAX_LIMIT = 200;

function clampIncidentLimit(n: number | undefined): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return ADMIN_INCIDENTS_DEFAULT_LIMIT;
  const truncated = Math.trunc(n);
  if (truncated < 1) return 1;
  if (truncated > ADMIN_INCIDENTS_MAX_LIMIT) return ADMIN_INCIDENTS_MAX_LIMIT;
  return truncated;
}

function normalizeIncidentSeverity(input: string): 'critical' | 'error' | 'warning' {
  // The DB filter restricts to these three already; this tightens the type for
  // callers and keeps an unexpected value from leaking through.
  if (input === 'critical' || input === 'error' || input === 'warning') return input;
  return 'error';
}

/** Cursor-paginated incident feed for the System tab. Filters to active
 *  (status='active') admin_events at error/warning/critical severity, ordered
 *  by created_at DESC. The cursor is the created_at of the last item on the
 *  previous page; pass it back in to walk further into the past. */
export async function getAdminIncidents(
  params: GetAdminIncidentsParams = {},
): Promise<GetAdminIncidentsResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: userRow } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if ((userRow?.role as string | undefined) !== 'admin') throw new Error('Forbidden');

  const limit = clampIncidentLimit(params.limit);
  const admin = createAdminClient();

  // `admin_events` has no `status` column; `resolved=false` is the active
  // signal. The exported `AdminIncident.status` is synthesized below.
  let query = admin
    .from('admin_events')
    .select(
      'id, event_type, severity, title, message, metadata, user_id, user_email, url, resolved, resolved_at, resolved_by, created_at',
    )
    .in('severity', ['critical', 'error', 'warning'])
    .eq('resolved', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (params.cursor) {
    query = query.lt('created_at', params.cursor);
  }

  const { data, error } = await query;
  if (error) {
    void logServerError(
      `[admin-data] getAdminIncidents query failed: ${describeError(error)}`,
      { action: 'admin_data.getAdminIncidents', featureArea: 'admin' },
    );
    throw error instanceof Error ? error : new Error(describeError(error));
  }

  const rows = (data ?? []) as unknown as AdminIncidentRow[];
  const items: AdminIncident[] = rows.map((row) => ({
    id: row.id,
    eventType: row.event_type,
    severity: normalizeIncidentSeverity(row.severity),
    status: 'active',
    title: row.title,
    message: row.message,
    metadata: row.metadata,
    userId: row.user_id,
    userEmail: row.user_email,
    url: row.url,
    resolved: row.resolved,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    createdAt: row.created_at,
  }));

  // Only emit a cursor when the page filled exactly — a short page means we
  // hit the end and there's nothing left to fetch.
  const lastItem = items[items.length - 1];
  const nextCursor = items.length === limit && lastItem ? lastItem.createdAt : null;

  return { items, nextCursor };
}

// ============================================
// BI DASHBOARD TYPES
// ============================================

export interface BIDashboardData {
  growth: {
    signupsByDay: { date: string; count: number }[];
    signupsByWeek: { week: string; count: number }[];
    activatedPlayers: number;
    activatedCoaches: number;
    playerActivationRate: number;
    coachActivationRate: number;
    overallActivationRate: number;
    medianTTFVDays: number | null;
    activationFunnel: BIFunnelStep[];
    userGrowthRateWoW: number;
    roundGrowthRateWoW: number;
  };
  retention: {
    d1: { retained: number; total: number; rate: number };
    d7: { retained: number; total: number; rate: number };
    d30: { retained: number; total: number; rate: number };
    cohortMatrix: { cohortWeek: string; cohortSize: number; retentionByWeek: number[] }[];
    dauRounds: number;
    wauRounds: number;
    mauRounds: number;
    dauLogins: number;
    wauLogins: number;
    mauLogins: number;
    stickinessRounds: number;
    stickinessLogins: number;
    coachWeeklyRetention: number;
    playerWeeklyRetention: number;
  };
  usage: {
    featureAdoption: { feature: string; allTime: number; last30d: number; category: string }[];
    deadFeatures: string[];
    featureRetentionCorrelation: { feature: string; retentionWith: number; retentionWithout: number; lift: number }[];
    objectCreationByWeek: { week: string; rounds: number; events: number; messages: number }[];
  };
  funnel: {
    playerOnboarding: BIFunnelStep[];
    coachOnboarding: BIFunnelStep[];
    biggestPlayerDropoff: { from: string; to: string; dropoff: number; pct: number } | null;
    biggestCoachDropoff: { from: string; to: string; dropoff: number; pct: number } | null;
    errorsByFeatureArea: { area: string; count: number; critical: number; recentErrors: { message: string; severity: string; created_at: string; url: string }[] }[];
  };
  health: {
    teamHealthScores: BITeamHealth[];
    powerUsers: { count: number; pct: number; ids: string[] };
    atRiskAccounts: BIAtRiskAccount[];
    conversionProxies: BIConversionProxy[];
  };
  vercel: { visitors24h: number; visitors7d: number; visitors30d: number } | null;
}

export interface BIFunnelStep {
  step: string;
  count: number;
  pctOfTop: number;
  conversionFromPrev: number;
  dropoff: number;
  dropoffPct: number;
}

export interface BITeamHealth {
  teamId: string;
  teamName: string;
  orgName: string | null;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  playerCount: number;
  activePlayerCount: number;
  roundsThisMonth: number;
  riskLevel: 'healthy' | 'at_risk' | 'critical';
}

export interface BIAtRiskAccount {
  type: 'player' | 'coach' | 'team';
  id: string;
  name: string;
  teamName: string | null;
  riskScore: number;
  riskSignals: string[];
  daysSinceLastActive: number;
}

export interface BIConversionProxy {
  teamId: string;
  teamName: string;
  score: number;
  tier: 'high' | 'medium' | 'low';
  signals: {
    playerCount: number;
    activePlayerPct: number;
    roundsPerWeek: number;
    aiAdoption: boolean;
    tenureDays: number;
  };
}

// ============================================
// INTERNAL TYPES
// ============================================

interface PlatformHealthStatsResult {
  active_users_1h: number;
  active_users_24h: number;
  active_users_7d: number;
  active_users_30d: number;
  active_sessions: number;
  total_sessions: number;
  total_auth_users: number;
  users_signed_in_today: number;
  users_never_signed_in: number;
  db_size_bytes: number;
  largest_tables: { table_name: string; size_bytes: number; row_count: number }[] | null;
  active_connections: number;
  idle_connections: number;
}

// ============================================
// HELPERS
// ============================================

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function todayStart(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// ============================================
// VERCEL ANALYTICS HELPER
// ============================================

async function fetchVercelAnalytics(): Promise<{ visitors24h: number; visitors7d: number; visitors30d: number } | null> {
  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) return null;

  try {
    const teamId = process.env.VERCEL_TEAM_ID;
    const baseUrl = 'https://api.vercel.com/v1/web/insights/stats';

    const fetchPeriod = async (from: string, to: string) => {
      const params = new URLSearchParams({ projectId, from, to });
      if (teamId) params.set('teamId', teamId);
      const res = await fetch(`${baseUrl}?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        next: { revalidate: 900 },
      });
      if (!res.ok) return 0;
      const data = await res.json();
      return data?.data?.visitors ?? data?.visitors ?? 0;
    };

    const now = new Date().toISOString();
    const [v24h, v7d, v30d] = await Promise.all([
      fetchPeriod(daysAgo(1), now),
      fetchPeriod(daysAgo(7), now),
      fetchPeriod(daysAgo(30), now),
    ]);
    return { visitors24h: v24h, visitors7d: v7d, visitors30d: v30d };
  } catch {
    return null;
  }
}

// ============================================
// BI FUNNEL HELPER
// ============================================

function buildFunnelSteps(stages: { step: string; count: number }[]): BIFunnelStep[] {
  if (stages.length === 0) return [];
  const topCount = stages[0]!.count || 1;
  return stages.map((s, i) => {
    const prevCount = i === 0 ? s.count : stages[i - 1]!.count;
    const dropoff = Math.max(prevCount - s.count, 0);
    return {
      step: s.step,
      count: s.count,
      pctOfTop: topCount > 0 ? Math.round((s.count / topCount) * 1000) / 10 : 0,
      conversionFromPrev: prevCount > 0 ? Math.round((s.count / prevCount) * 1000) / 10 : 0,
      dropoff,
      dropoffPct: prevCount > 0 ? Math.round((dropoff / prevCount) * 1000) / 10 : 0,
    };
  });
}
// ============================================
// MAIN DATA FETCHER
// ============================================

/**
 * Aggregates the full `AdminDashboardData` shape consumed by the admin
 * dashboard UI. Behind the scenes this delegates to three parallel rollup
 * RPCs (`fetchAdminRollupA/B/C`) plus kept calls for Vercel analytics and
 * `get_platform_health_stats`. Replaces ~93 ad-hoc queries with ~10
 * Supabase round-trips.
 */
export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const startTime = performance.now();

  // 1. Auth gate — MUST live outside the cache (reads cookies).
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: userRow } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if ((userRow?.role as string) !== 'admin') throw new Error('Forbidden');

  // 2. Kick off Slice A + Slice B in parallel — Slice C needs Slice A's
  //    `allRoundsMinimal` so it runs in the next wave.
  //    Rollup A is REQUIRED (auth + roundsMinimal fuels rollupC). Rollup B
  //    and C can degrade to safe empties without crashing the page —
  //    Postgres statement_timeout on one of their RPCs is recoverable.
  let rollupA: RollupA;
  let rollupB: RollupB;
  try {
    [rollupA, rollupB] = await Promise.all([
      fetchAdminRollupA().catch((e) => {
        void logServerError(`[admin-data] fetchAdminRollupA threw: ${describeError(e)}`, { action: 'admin_data.getAdminDashboardData', metadata: { stack: e?.stack } });
        throw new Error(`rollupA failed: ${describeError(e)}`);
      }),
      fetchAdminRollupB(),
    ]);
  } catch (e) {
    // Only rollupA failures reach here; rollupB gracefully degrades internally.
    void logServerError(`[admin-data] rollupA failed: ${describeError(e)}`, { action: 'admin_data.getAdminDashboardData' });
    throw e;
  }

  const rollupBDegraded =
    rollupB.degradation.baseballRollupDegraded ||
    rollupB.degradation.errorsRollupDegraded ||
    rollupB.degradation.teamsRollupDegraded;

  // 3. Slice C + kept calls (Vercel HTTP + platform health RPC + one-off
  //    shot-quality counts) run in parallel. `dataQuality` is not owned by
  //    any slice — we issue a single grouped query.
  let rollupCDegraded = false;
  const [rollupC, vercelAnalytics, platformHealth, dataQualityRaw] = await Promise.all([
    fetchAdminRollupC(rollupA.allRoundsMinimal).catch((e) => {
      void logServerError(
        `[admin-data] fetchAdminRollupC threw: ${describeError(e)}`,
        { action: 'admin_data.getAdminDashboardData', metadata: { stack: e?.stack } },
      );
      rollupCDegraded = true;
      return EMPTY_ROLLUP_C;
    }),
    fetchVercelAnalytics(),
    (async (): Promise<PlatformHealthStatsResult | null> => {
      // get_platform_health_stats is `RETURNS TABLE(...)` (SETOF), so PostgREST
      // returns an array — even with a single row. Reading `res.data.x` directly
      // silently produces undefined and every `phs?.x ?? 0` fallback collapses
      // to zero, which is why the System tab showed DB Size 0.0 KB / Active
      // Sessions 0 / 0 connections even with the RPC working in SQL. Always
      // unwrap the first row.
      try {
        const admin = createAdminClient();
        const rpc = admin.rpc.bind(admin) as unknown as (
          fn: 'get_platform_health_stats',
        ) => Promise<{ data: PlatformHealthStatsResult[] | null; error: unknown }>;
        const res = await rpc('get_platform_health_stats');
        const rows = res.data ?? [];
        if (!Array.isArray(rows) || rows.length === 0) return null;
        return rows[0] ?? null;
      } catch {
        return null;
      }
    })(),
    // Shot telemetry quality — single RPC `get_shot_data_quality` collapses
    // what used to be 4 separate `count(head=true)` calls on golf_shots into
    // one conditional-aggregation SELECT (migration
    // 20260428210000_get_shot_data_quality.sql). The RPC returns *missing*
    // counts; we derive shotsWithX = total - missingX so downstream
    // dataQuality consumers (assembleAdminDashboardData) keep the existing
    // shape.
    (async (): Promise<{
      totalShots: number;
      shotsWithDistance: number;
      shotsWithLie: number;
      shotsWithClub: number;
    }> => {
      const admin = createAdminClient();
      const rpc = admin.rpc.bind(admin) as unknown as (
        fn: 'get_shot_data_quality',
      ) => Promise<{
        data: {
          total_shots: number;
          missing_distance_before: number;
          missing_lie_before: number;
          missing_club_type: number;
        } | null;
        error: unknown;
      }>;
      try {
        const { data, error } = await rpc('get_shot_data_quality');
        if (error || !data) {
          if (error) {
            void logServerError(
              `[admin-data] get_shot_data_quality errored: ${describeError(error)}`,
              { action: 'admin_data.getAdminDashboardData', featureArea: 'admin' },
            );
          }
          return { totalShots: 0, shotsWithDistance: 0, shotsWithLie: 0, shotsWithClub: 0 };
        }
        const total = Number(data.total_shots ?? 0);
        const missingDistance = Number(data.missing_distance_before ?? 0);
        const missingLie = Number(data.missing_lie_before ?? 0);
        const missingClub = Number(data.missing_club_type ?? 0);
        return {
          totalShots: total,
          shotsWithDistance: Math.max(0, total - missingDistance),
          shotsWithLie: Math.max(0, total - missingLie),
          shotsWithClub: Math.max(0, total - missingClub),
        };
      } catch (e) {
        void logServerError(
          `[admin-data] get_shot_data_quality threw: ${describeError(e)}`,
          { action: 'admin_data.getAdminDashboardData', featureArea: 'admin' },
        );
        return { totalShots: 0, shotsWithDistance: 0, shotsWithLie: 0, shotsWithClub: 0 };
      }
    })(),
  ]);

  const responseTime = Math.round(performance.now() - startTime);

  try {
    const assembled = assembleAdminDashboardData({
      rollupA,
      rollupB,
      rollupC,
      vercelAnalytics,
      platformHealth,
      dataQualityRaw,
      responseTime,
    });
    // Merge rollup-level degradation flags onto the public shape. Downstream
    // components (error banner on admin/page.tsx) read these to signal
    // partial-data mode without crashing.
    return {
      ...assembled,
      rollupBDegraded,
      rollupCDegraded,
    };
  } catch (e) {
    const err = e as Error;
    await logServerError(`[admin-data] assembleAdminDashboardData threw: ${describeError(e)}`, { action: 'admin_data.getAdminDashboardData', metadata: { stack: err?.stack } });
    throw new Error(`assembleAdminDashboardData failed: ${describeError(e)}`);
  }
}

// ============================================
// ASSEMBLY — shape rollups into AdminDashboardData
// ============================================

interface AssemblyInput {
  rollupA: RollupA;
  rollupB: RollupB;
  rollupC: RollupC;
  vercelAnalytics: { visitors24h: number; visitors7d: number; visitors30d: number } | null;
  platformHealth: PlatformHealthStatsResult | null;
  dataQualityRaw: {
    totalShots: number;
    shotsWithDistance: number;
    shotsWithLie: number;
    shotsWithClub: number;
  };
  responseTime: number;
}

function assembleAdminDashboardData(parts: AssemblyInput): AdminDashboardData {
  const { rollupA, rollupB, rollupC, vercelAnalytics, platformHealth, dataQualityRaw, responseTime } = parts;

  const now = Date.now();
  const ago24h = daysAgo(1);
  const ago7d = daysAgo(7);
  const ago14d = daysAgo(14);
  const ago30d = daysAgo(30);
  const today = todayStart();

  // --- Basic scalars from rollups ---
  const rounds = rollupA.rounds;
  const users = rollupA.users;
  const featureAdoption = rollupA.featureAdoption;
  const coachhelm = rollupA.coachhelm;

  const totalCoaches = users.totalCoaches;
  const totalPlayers = users.totalPlayers;
  const coachOnboarded = users.coachesOnboarded;
  const playerOnboarded = users.playersOnboarded;
  const totalRoundsCount = rounds.totalRounds;
  const totalShotsCount = dataQualityRaw.totalShots;
  const completedRoundsCount = rounds.completedRounds;
  const verifiedRoundsCount = rounds.verifiedRounds;

  // --- Signups by week + day (from Slice A) ---
  const signupsByWeek = users.signupsByWeek;
  const signupsByDayResult = users.signupsByDay30d;

  // --- Rounds by type / week ---
  const roundsByTypeArr = Object.entries(rounds.roundsByType).map(([type, count]) => ({ type, count }));
  const roundsByWeek = rounds.roundsByWeek;

  // --- Players by onboarding / status / year ---
  const playersByOnboarding = [
    { status: 'Onboarded', count: users.playersOnboarded },
    { status: 'Pending', count: users.playersPending },
  ].filter((s) => s.count > 0);

  const statusCounts: Record<string, number> = {};
  for (const p of users.playersByStatus) {
    const s = p.status || 'unknown';
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }
  const playersByStatus = Object.entries(statusCounts)
    .map(([status, count]) => ({ status, count }))
    .filter((s) => s.count > 0);

  const playersByYear = Object.entries(users.playersByYear)
    .map(([year, count]) => ({ year, count }))
    .filter((y) => y.count > 0);

  // --- CoachHelm series ---
  const insightsByWeek = coachhelm.insightsByWeek;
  const reviewsByWeek = coachhelm.reviewsByWeek;
  const totalInsightsGenerated = coachhelm.insightGenLog12w.reduce((s, r) => s + (r.insights_generated ?? 0), 0);
  const avgInsightsPerGeneration = coachhelm.insightGenLog12w.length > 0
    ? totalInsightsGenerated / coachhelm.insightGenLog12w.length
    : 0;

  // --- Scoring distribution ---
  const scoreBuckets: Record<string, number> = {
    'Under 70': 0,
    '70-74': 0,
    '75-79': 0,
    '80-84': 0,
    '85-89': 0,
    '90+': 0,
  };
  for (const s of rounds.scoringDistribution) {
    if (s < 70) scoreBuckets['Under 70'] = (scoreBuckets['Under 70'] ?? 0) + 1;
    else if (s < 75) scoreBuckets['70-74'] = (scoreBuckets['70-74'] ?? 0) + 1;
    else if (s < 80) scoreBuckets['75-79'] = (scoreBuckets['75-79'] ?? 0) + 1;
    else if (s < 85) scoreBuckets['80-84'] = (scoreBuckets['80-84'] ?? 0) + 1;
    else if (s < 90) scoreBuckets['85-89'] = (scoreBuckets['85-89'] ?? 0) + 1;
    else scoreBuckets['90+'] = (scoreBuckets['90+'] ?? 0) + 1;
  }
  const scoringDistribution = Object.entries(scoreBuckets).map(([bucket, count]) => ({ bucket, count }));

  // --- Platform averages (Slice B) ---
  const platformAvgs = rollupB.scoring.platformAverages;

  // --- Player → team lookup maps (Slice B teams + Slice A playerMap) ---
  const teamsMap = new Map<string, { name: string; orgName: string | null }>();
  for (const t of rollupB.teams.teams) {
    teamsMap.set(t.id, { name: t.name, orgName: t.org_name });
  }

  const playerToTeamId = new Map<string, string>();
  const playerTeamName = new Map<string, string>();
  for (const row of rollupB.teams.playerTeamMap) {
    playerToTeamId.set(row.player_id, row.team_id);
    playerTeamName.set(row.player_id, row.team_name);
  }

  // Team → player IDs
  const teamPlayerCounts: Record<string, number> = {};
  const teamIdToPlayerIds = new Map<string, string[]>();
  for (const m of rollupB.teams.teamMembers) {
    teamPlayerCounts[m.team_id] = (teamPlayerCounts[m.team_id] || 0) + 1;
    const list = teamIdToPlayerIds.get(m.team_id) ?? [];
    list.push(m.player_id);
    teamIdToPlayerIds.set(m.team_id, list);
  }

  // Coach org → count
  const orgCoachCounts: Record<string, number> = {};
  for (const c of rollupB.teams.coachOrgs) {
    if (c.organization_id) {
      orgCoachCounts[c.organization_id] = (orgCoachCounts[c.organization_id] || 0) + 1;
    }
  }
  const teamCoachCounts: Record<string, number> = {};
  for (const t of rollupB.teams.teams) {
    if (t.organization_id && orgCoachCounts[t.organization_id]) {
      teamCoachCounts[t.id] = orgCoachCounts[t.organization_id] ?? 0;
    }
  }

  // Rounds per team this week (from Slice B)
  const teamRoundCounts: Record<string, number> = {};
  for (const r of rollupB.teams.teamRoundsWeek) {
    if (r.team_id) {
      teamRoundCounts[r.team_id] = (teamRoundCounts[r.team_id] || 0) + 1;
    }
  }

  // --- Top performers + team averages ---
  const statsRows = rollupB.teams.playerStatsTop50;
  const validScoring = statsRows.filter((r) => r.scoring_average != null);

  const topPerformers = validScoring.slice(0, 10).map((r) => ({
    name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'Unknown',
    teamName: playerTeamName.get(r.player_id) ?? null,
    scoringAvg: Number(r.scoring_average),
    roundsPlayed: r.rounds_played ?? 0,
  }));

  const teamAvgScores: Record<string, number[]> = {};
  const teamTopPlayer: Record<string, { name: string; avg: number }> = {};
  for (const r of statsRows) {
    const teamId = playerToTeamId.get(r.player_id);
    if (teamId && r.scoring_average != null) {
      const avg = Number(r.scoring_average);
      if (!teamAvgScores[teamId]) teamAvgScores[teamId] = [];
      teamAvgScores[teamId]!.push(avg);
      const current = teamTopPlayer[teamId];
      if (!current || avg < current.avg) {
        teamTopPlayer[teamId] = {
          name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'Unknown',
          avg,
        };
      }
    }
  }

  const teams: AdminDashboardData['teams'] = Array.from(teamsMap.entries())
    .map(([id, t]) => {
      const scores = teamAvgScores[id] ?? [];
      return {
        id,
        name: t.name,
        orgName: t.orgName,
        playerCount: teamPlayerCounts[id] || 0,
        coachCount: teamCoachCounts[id] || 0,
        roundsThisWeek: teamRoundCounts[id] || 0,
        avgScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
        topPlayer: teamTopPlayer[id] || null,
      };
    })
    .sort((a, b) => b.playerCount - a.playerCount);

  // --- Recent best rounds (Slice B raw → formatted) ---
  const recentBestRounds = rollupB.teams.recentBestRounds.map((r) => ({
    playerName: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'Unknown',
    courseName: r.course_name,
    score: r.total_score ?? 0,
    toPar: r.score_to_par ?? 0,
    date: r.round_date,
  }));

  // --- Engagement + weekly retention (from Slice A sets) ---
  const playersThisWeekSet = new Set(rounds.playersThisWeek);
  const playersActive30dSet = new Set(rounds.playerSetActive30d);
  const playersActive30_60dSet = new Set(rounds.playerSetActive30_60d);
  const weeklyRetentionDenom = playersActive30dSet.size || 1;
  const weeklyRetention = (playersThisWeekSet.size / weeklyRetentionDenom) * 100;
  const avgRoundsPerPlayer = totalPlayers > 0 ? totalRoundsCount / totalPlayers : 0;

  // Active players (all players table size — denominator for "players with no rounds")
  const playerIdsAll = new Set(users.playerMap.map((p) => p.id));
  const playersWithNoRounds = [...playerIdsAll].filter((id) => !playersThisWeekSet.has(id)).length;

  // Daily active users (from rollupA.rounds.roundsByDay30d — unique players per day)
  const dailyActiveMap = new Map<string, Set<string>>();
  for (const r of rounds.roundsByDay30d) {
    const set = dailyActiveMap.get(r.date) ?? new Set<string>();
    if (r.player_id) set.add(r.player_id);
    dailyActiveMap.set(r.date, set);
  }
  // Ensure every day in the last 30d is present
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (!dailyActiveMap.has(key)) dailyActiveMap.set(key, new Set());
  }
  const dailyActiveUsers = [...dailyActiveMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, set]) => ({ date, count: set.size }));
  // `visitsByDay` uses the same source (unique players with any round per day)
  const visitsByDayResult = dailyActiveUsers;

  // CoachHelm: coaches who used insights (from insightsFailed7d / insightGenLog30dCount is global).
  // Admin-data's prior logic unique-by coach_id from insights in last 30d — closest we have is
  // `coachhelm.insightsByWeek` which counts generations. We approximate using coach count
  // derived from coachIntelligence slice.
  const coachesUsingInsightsCount = rollupC.coachIntelligence.filter((c) => c.insightsViewed > 0).length;

  // Event attendance (Slice B)
  const attendanceValues = rollupB.teams.attendancePercentages;
  const eventAttendanceRate = attendanceValues.length > 0
    ? attendanceValues.reduce((s, v) => s + Number(v), 0) / attendanceValues.length
    : null;

  // --- Onboarding rate (composite) ---
  const avgOnboarding = (coachOnboarded + playerOnboarded) / Math.max(totalCoaches + totalPlayers, 1) * 100;

  // --- Growth metrics ---
  // WoW growth via shared metrics helper so the Overview header and the
  // Intelligence card render the exact same number (single source of truth).
  // Helper returns a ratio (0..1 = +100%, -0.5 = -50%); we round to whole-percent.
  const userGrowthRate = Math.round(
    computeWoWGrowth(users.newUsersThisWeek, users.newUsersLastWeek) * 100
  );
  const roundGrowthRate = Math.round(
    computeWoWGrowth(rounds.roundsThisWeek, rounds.roundsLastWeek) * 100
  );

  // Churn (players active 30-60d ago but not in last 30d)
  const churnedPlayers30d = [...playersActive30_60dSet].filter((id) => !playersActive30dSet.has(id)).length;

  // Retention cohorts from Slice A cohortWeeks + last-7d active player set
  const playerRoundsThisWeekSet = playersThisWeekSet;
  const userIdToPlayerId = new Map<string, string>();
  for (const p of users.playerMap) {
    if (p.user_id) userIdToPlayerId.set(p.user_id, p.id);
  }
  const cohortKeys: (keyof typeof users.cohortWeeks)[] = ['w4', 'w3', 'w2', 'w1'];
  const retentionCohorts = cohortKeys.map((key, i) => {
    const cohortUsers = users.cohortWeeks[key] ?? [];
    const retained = cohortUsers.filter((userId) => {
      const pid = userIdToPlayerId.get(userId);
      return pid && playerRoundsThisWeekSet.has(pid);
    }).length;
    return {
      week: i + 1,
      retained,
      total: cohortUsers.length,
      rate: cohortUsers.length > 0 ? Math.round((retained / cohortUsers.length) * 100) : 0,
    };
  });

  const activePlayerCount = playersActive30dSet.size || 1;
  const avgRoundsPerActivePlayer = Math.round((rounds.roundsThisWeek * 4 / activePlayerCount) * 10) / 10;

  // Top feature by adoption
  const featureAdoptionList = [
    { feature: 'Qualifiers', count: featureAdoption.qualifiers.total },
    { feature: 'Events', count: featureAdoption.events.total },
    { feature: 'Tasks', count: featureAdoption.tasks.total },
    { feature: 'Announcements', count: featureAdoption.announcements.total },
    { feature: 'Messages', count: featureAdoption.messages.total },
    { feature: 'Documents', count: featureAdoption.documents.total },
    { feature: 'Travel', count: featureAdoption.travel.total },
  ];
  const topFeatureByAdoption = featureAdoptionList.sort((a, b) => b.count - a.count)[0]?.feature ?? 'None';

  // NPS proxy: coaches with both philosophy AND insights
  const philosophyCount = coachhelm.coachPhilosophyCount;
  const npsProxy = totalCoaches > 0
    ? Math.round((Math.min(philosophyCount, coachesUsingInsightsCount) / totalCoaches) * 100)
    : 0;

  // Platform health score (0-100) — average of 4 equally-weighted inputs.
  // We also build a per-input breakdown so the UI can surface *why* the
  // score is what it is. Each weight = 1/4 = 0.25, contribution = value*weight.
  const completionRateRaw = totalRoundsCount > 0
    ? (completedRoundsCount / totalRoundsCount) * 100
    : 0;

  const healthScoreInputs = [
    {
      key: 'onboarding',
      label: 'Onboarding Completion',
      description: '% of all coaches + players who completed onboarding.',
      rawValue: avgOnboarding,
      rawDisplay: `${Math.round(avgOnboarding)}%`,
      // Already a percentage; capped at 100.
      value: Math.min(avgOnboarding, 100),
    },
    {
      key: 'weekly_retention',
      label: 'Weekly Retention (D7)',
      description: '% of 30-day-active players who entered a round this week (×2 to scale to 0–100).',
      rawValue: weeklyRetention,
      rawDisplay: `${Math.round(weeklyRetention)}%`,
      value: Math.min(weeklyRetention * 2, 100),
    },
    {
      key: 'nps_proxy',
      label: 'Coach NPS Proxy',
      description: '% of coaches with both a saved philosophy AND insights viewed (×1.5 to scale to 0–100).',
      rawValue: npsProxy,
      rawDisplay: `${Math.round(npsProxy)}%`,
      value: Math.min(npsProxy * 1.5, 100),
    },
    {
      key: 'round_completion',
      label: 'Round Completion Rate',
      description: '% of rounds that were finished (vs. abandoned mid-round).',
      rawValue: completionRateRaw,
      rawDisplay: `${Math.round(completionRateRaw)}%`,
      value: Math.min(completionRateRaw, 100),
    },
  ];

  const healthScores = healthScoreInputs.map((i) => i.value);
  const platformHealthScore = Math.round(healthScores.reduce((s, v) => s + v, 0) / healthScores.length);

  const equalWeight = 1 / healthScoreInputs.length;
  const platformHealthBreakdown = healthScoreInputs.map((i) => ({
    key: i.key,
    label: i.label,
    description: i.description,
    weight: equalWeight,
    rawValue: Math.round(i.rawValue * 10) / 10,
    rawDisplay: i.rawDisplay,
    value: Math.round(i.value * 10) / 10,
    contribution: Math.round(i.value * equalWeight * 10) / 10,
  }));

  // Recent rounds (from Slice A)
  const recentRounds = rounds.recentRounds.map((r) => ({
    id: r.id,
    player_name: r.golf_players
      ? `${r.golf_players.first_name ?? ''} ${r.golf_players.last_name ?? ''}`.trim() || 'Unknown'
      : 'Unknown',
    course_name: r.course_name,
    total_score: r.total_score,
    total_to_par: r.score_to_par,
    round_type: r.round_type,
    created_at: r.created_at,
  }));

  // --- User auth details (proxy from usersForDirectory.last_seen) ---
  const userLastActive = new Map<string, string>();
  for (const u of users.usersForDirectory) {
    if (u.last_seen) userLastActive.set(u.id, u.last_seen);
  }
  const userAuthDetails = users.usersForDirectory.map((u) => ({
    userId: u.id,
    lastSignInAt: u.last_seen,
    lastSeen: u.last_seen,
  }));

  // --- Platform health stats ---
  const phs = platformHealth;
  const realActiveUsers1h = phs?.active_users_1h ?? 0;
  const realActiveUsers24h = phs?.active_users_24h ?? 0;
  const realActiveUsers7d = phs?.active_users_7d ?? 0;
  const realActiveUsers30d = phs?.active_users_30d ?? 0;

  // --- Diagnostics ---
  const lastRoundTimestamp = rounds.lastRoundAt;
  const lastInsightTimestamp = coachhelm.lastInsightAt;
  const systemErrors = coachhelm.insightsFailed7d;
  const diagnostics: AdminDashboardData['health']['diagnostics'] = [];

  diagnostics.push({
    label: 'Auth Sessions',
    status: (phs?.active_sessions ?? 0) > 0 ? 'healthy' : 'warning',
    detail: `${phs?.active_sessions ?? 0} active sessions · ${realActiveUsers1h} online now`,
  });

  if (lastRoundTimestamp) {
    const hoursSinceRound = (now - new Date(lastRoundTimestamp).getTime()) / 3600000;
    diagnostics.push({
      label: 'Round Submissions',
      status: hoursSinceRound < 24 ? 'healthy' : hoursSinceRound < 72 ? 'warning' : 'critical',
      detail: hoursSinceRound < 1 ? 'Active in last hour' : `Last round ${Math.round(hoursSinceRound)}h ago`,
    });
  } else {
    diagnostics.push({ label: 'Round Submissions', status: 'critical', detail: 'No rounds ever submitted' });
  }

  diagnostics.push({
    label: 'CoachHelm AI',
    status: systemErrors === 0 ? 'healthy' : systemErrors < 5 ? 'warning' : 'critical',
    detail: systemErrors === 0 ? 'All systems operational' : `${systemErrors} failed generations (7d)`,
  });

  diagnostics.push({
    label: 'Onboarding',
    status: avgOnboarding > 70 ? 'healthy' : avgOnboarding > 40 ? 'warning' : 'critical',
    detail: `${Math.round(avgOnboarding)}% completion rate`,
  });

  diagnostics.push({
    label: 'Player Engagement',
    status: weeklyRetention > 30 ? 'healthy' : weeklyRetention > 10 ? 'warning' : 'critical',
    detail: `${Math.round(weeklyRetention)}% weekly active rate`,
  });

  const dbSizeMB = Math.round((phs?.db_size_bytes ?? 0) / 1048576);
  const totalConns = (phs?.active_connections ?? 0) + (phs?.idle_connections ?? 0);
  diagnostics.push({
    label: 'Database',
    status: dbSizeMB < 400 && totalConns < 50 ? 'healthy' : dbSizeMB < 800 ? 'warning' : 'critical',
    detail: `${dbSizeMB} MB · ${totalConns} connections`,
  });

  const dataFreshness: AdminDashboardData['health']['dataFreshness'] = lastRoundTimestamp
    ? (now - new Date(lastRoundTimestamp).getTime()) < 86400000 ? 'live' : 'stale'
    : 'error';

  // --- Player maps (from Slice A) ---
  const playersById = new Map<string, (typeof users.playerMap)[number]>();
  for (const p of users.playerMap) playersById.set(p.id, p);
  const userIdToPlayerDetail = new Map<string, (typeof users.playerMap)[number]>();
  for (const p of users.playerMap) {
    if (p.user_id) userIdToPlayerDetail.set(p.user_id, p);
  }

  // --- Coach maps (from Slice A, split full_name) ---
  interface CoachDetail {
    id: string;
    userId: string | null;
    firstName: string;
    lastName: string;
    email: string | null;
    orgId: string | null;
    onboardingCompleted: boolean;
  }
  const coachesById = new Map<string, CoachDetail>();
  const userIdToCoachDetail = new Map<string, CoachDetail>();
  for (const c of users.coachMap) {
    const nameParts = (c.full_name ?? '').split(' ');
    const firstName = nameParts[0] ?? '';
    const lastName = nameParts.slice(1).join(' ') ?? '';
    const detail: CoachDetail = {
      id: c.id,
      userId: c.user_id,
      firstName,
      lastName,
      email: c.email,
      orgId: c.organization_id,
      onboardingCompleted: c.onboarding_completed ?? false,
    };
    coachesById.set(c.id, detail);
    if (c.user_id) userIdToCoachDetail.set(c.user_id, detail);
  }

  // --- Round counts + last round per player (from Slice A rounds rollup) ---
  const playerRoundCounts = new Map<string, number>();
  for (const [pid, n] of Object.entries(rounds.playerRoundCounts)) {
    playerRoundCounts.set(pid, n);
  }
  const playerLastRound = new Map<string, string>();
  for (const [pid, ts] of Object.entries(rounds.playerLastRound)) {
    playerLastRound.set(pid, ts);
  }

  // --- Player → team info (with names) ---
  const playerToTeamInfo = new Map<string, { teamId: string; teamName: string }>();
  for (const [pid, tid] of playerToTeamId) {
    const team = teamsMap.get(tid);
    if (team) playerToTeamInfo.set(pid, { teamId: tid, teamName: team.name });
  }

  // --- Email map (for audit / error / admin-event enrichment) ---
  const errorEmailMap = new Map<string, string>();
  for (const u of users.usersForDirectory) errorEmailMap.set(u.id, u.email);

  // --- User directory ---
  const userDirectory = users.usersForDirectory.map((u) => {
    const player = userIdToPlayerDetail.get(u.id);
    const coach = userIdToCoachDetail.get(u.id);
    const playerId = player?.id;
    const teamInfo = playerId ? playerToTeamInfo.get(playerId) : null;
    let coachTeamName: string | null = null;
    let coachTeamId: string | null = null;
    if (coach?.orgId) {
      for (const t of rollupB.teams.teams) {
        if (t.organization_id === coach.orgId) {
          coachTeamName = t.name;
          coachTeamId = t.id;
          break;
        }
      }
    }

    return {
      id: u.id,
      email: u.email,
      role: u.role,
      createdAt: u.created_at,
      firstName: player?.first_name ?? coach?.firstName ?? null,
      lastName: player?.last_name ?? coach?.lastName ?? null,
      teamName: teamInfo?.teamName ?? coachTeamName ?? null,
      teamId: teamInfo?.teamId ?? coachTeamId ?? null,
      lastRoundDate: playerId ? (playerLastRound.get(playerId) ?? null) : null,
      lastActiveAt: userLastActive.get(u.id) ?? null,
      totalRounds: playerId ? (playerRoundCounts.get(playerId) ?? 0) : 0,
      onboardingCompleted: player?.onboarding_completed ?? coach?.onboardingCompleted ?? false,
    };
  });

  // --- Org → coaches map (for teamRosters) ---
  const orgCoaches = new Map<string, { id: string; firstName: string; lastName: string; email: string }[]>();
  for (const c of coachesById.values()) {
    if (c.orgId) {
      const list = orgCoaches.get(c.orgId) ?? [];
      list.push({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email ?? '',
      });
      orgCoaches.set(c.orgId, list);
    }
  }

  // --- Team rosters ---
  const teamRosters = rollupB.teams.teams.map((t) => {
    const teamMembersForTeam = rollupB.teams.teamMembers.filter((m) => m.team_id === t.id);
    const tPlayers = teamMembersForTeam
      .map((m) => {
        const p = playersById.get(m.player_id);
        const email = p?.user_id
          ? (users.usersForDirectory.find((u) => u.id === p.user_id)?.email ?? null)
          : null;
        const statsEntry = statsRows.find((s) => s.player_id === m.player_id);
        return {
          id: m.player_id,
          firstName: p?.first_name ?? '',
          lastName: p?.last_name ?? '',
          email,
          gradYear: p?.graduation_year ?? null,
          lastRoundDate: playerLastRound.get(m.player_id) ?? null,
          totalRounds: playerRoundCounts.get(m.player_id) ?? 0,
          scoringAvg: statsEntry?.scoring_average != null ? Number(statsEntry.scoring_average) : null,
          onboardingCompleted: p?.onboarding_completed ?? false,
        };
      })
      .sort((a, b) => (a.scoringAvg ?? 999) - (b.scoringAvg ?? 999));

    const coaches = t.organization_id ? (orgCoaches.get(t.organization_id) ?? []) : [];

    return {
      id: t.id,
      name: t.name,
      orgName: t.org_name,
      coaches,
      players: tPlayers,
    };
  }).sort((a, b) => b.players.length - a.players.length);

  // --- Funnel ---
  const uniqueReviewedRounds = new Set(coachhelm.reviewedRoundIds).size;
  const uniqueInsightPlayers = new Set(coachhelm.insightPlayerRows.map((r) => r.player_id).filter(Boolean)).size;
  const funnel = {
    roundsStarted: totalRoundsCount,
    roundsCompleted: completedRoundsCount,
    roundsWithScore: verifiedRoundsCount,
    roundsReviewed: uniqueReviewedRounds,
    roundsWithInsights: uniqueInsightPlayers,
  };

  // --- Data Quality ---
  const dataQuality = {
    totalShots: totalShotsCount,
    shotsWithDistance: dataQualityRaw.shotsWithDistance,
    shotsWithLie: dataQualityRaw.shotsWithLie,
    shotsWithClub: dataQualityRaw.shotsWithClub,
    distancePercentage: totalShotsCount > 0 ? Math.round((dataQualityRaw.shotsWithDistance / totalShotsCount) * 100) : 0,
    liePercentage: totalShotsCount > 0 ? Math.round((dataQualityRaw.shotsWithLie / totalShotsCount) * 100) : 0,
    clubPercentage: totalShotsCount > 0 ? Math.round((dataQualityRaw.shotsWithClub / totalShotsCount) * 100) : 0,
  };

  // --- CoachHelm ROI (AI team avg vs non-AI team avg, from statsRows + teams + philosophy) ---
  const philosophyCoachIdSet = new Set<string>();
  // Slice A coachhelm doesn't expose philosophy coach IDs; use Slice C's philosophy-linked set
  // via coachIntelligence.philosophyConfigured flag.
  for (const ci of rollupC.coachIntelligence) {
    if (ci.philosophyConfigured) philosophyCoachIdSet.add(ci.id);
  }
  const aiOrgIds = new Set<string>();
  const nonAiOrgIds = new Set<string>();
  for (const c of coachesById.values()) {
    if (!c.orgId) continue;
    if (philosophyCoachIdSet.has(c.id)) aiOrgIds.add(c.orgId);
    else nonAiOrgIds.add(c.orgId);
  }
  const aiTeamIds = new Set<string>();
  const nonAiTeamIds = new Set<string>();
  for (const t of rollupB.teams.teams) {
    if (!t.organization_id) continue;
    if (aiOrgIds.has(t.organization_id)) aiTeamIds.add(t.id);
    else if (nonAiOrgIds.has(t.organization_id)) nonAiTeamIds.add(t.id);
  }
  const aiPlayerScores: number[] = [];
  const nonAiPlayerScores: number[] = [];
  for (const r of statsRows) {
    if (r.scoring_average == null) continue;
    const tid = playerToTeamId.get(r.player_id);
    if (tid && aiTeamIds.has(tid)) aiPlayerScores.push(Number(r.scoring_average));
    else if (tid && nonAiTeamIds.has(tid)) nonAiPlayerScores.push(Number(r.scoring_average));
  }
  const avgScoreAI = aiPlayerScores.length > 0
    ? aiPlayerScores.reduce((a, b) => a + b, 0) / aiPlayerScores.length
    : null;
  const avgScoreNonAI = nonAiPlayerScores.length > 0
    ? nonAiPlayerScores.reduce((a, b) => a + b, 0) / nonAiPlayerScores.length
    : null;
  const aiCoachCount = philosophyCount;
  const nonAiCoachCount = Math.max(totalCoaches - aiCoachCount, 0);
  const coachhelmRoi = {
    coachesUsingAI: aiCoachCount,
    coachesNotUsingAI: nonAiCoachCount,
    avgScoreAICoachPlayers: avgScoreAI != null ? Math.round(avgScoreAI * 10) / 10 : null,
    avgScoreNonAICoachPlayers: avgScoreNonAI != null ? Math.round(avgScoreNonAI * 10) / 10 : null,
    scoreDifference: avgScoreAI != null && avgScoreNonAI != null
      ? Math.round((avgScoreNonAI - avgScoreAI) * 10) / 10
      : null,
  };

  // ============================================
  // ERROR LOGS — incident narrative + summary
  // ============================================
  const rawErrorLogs = rollupB.errors.recentErrorLogs;
  const errorSummaryRaw = rollupB.errors.errorSummary;
  const errorSummaryDegraded = rollupB.errors.errorSummaryDegraded;

  // Fallback computed from raw logs when RPC returned null
  const errorSummary = errorSummaryRaw ?? (() => {
    const errorGroups = new Map<string, { message: string; severity: string; count: number; firstSeen: string; lastSeen: string; userIds: Set<string | null> }>();
    const severityCounts = new Map<string, number>();
    const dailyCounts = new Map<string, number>();
    for (const e of rawErrorLogs) {
      const msg = e.message;
      const sev = e.severity ?? 'error';
      const created = e.created_at ?? new Date().toISOString();
      const createdDate = new Date(created);
      const day = Number.isNaN(createdDate.getTime())
        ? new Date().toISOString().slice(0, 10)
        : createdDate.toISOString().slice(0, 10);
      const existing = errorGroups.get(msg);
      if (existing) {
        existing.count++;
        if (created < existing.firstSeen) existing.firstSeen = created;
        if (created > existing.lastSeen) existing.lastSeen = created;
        if (e.user_id) existing.userIds.add(e.user_id);
      } else {
        errorGroups.set(msg, { message: msg, severity: sev, count: 1, firstSeen: created, lastSeen: created, userIds: new Set(e.user_id ? [e.user_id] : []) });
      }
      severityCounts.set(sev, (severityCounts.get(sev) ?? 0) + 1);
      dailyCounts.set(day, (dailyCounts.get(day) ?? 0) + 1);
    }
    return {
      by_severity: Array.from(severityCounts.entries()).map(([severity, count]) => ({ severity, count })),
      top_errors: Array.from(errorGroups.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 20)
        .map((e) => ({
          message: e.message,
          severity: e.severity,
          occurrences: e.count,
          first_seen: e.firstSeen,
          last_seen: e.lastSeen,
          affected_users: e.userIds.size,
        })),
      daily_rate: Array.from(dailyCounts.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, count]) => ({ day: `${day}T00:00:00+00:00`, count })),
      total_count: rawErrorLogs.length,
      critical_count: severityCounts.get('critical') ?? 0,
    };
  })();

  // Defensive: some source rows carry null/malformed `day` values. Skip them.
  const errorsByDay = (errorSummary?.daily_rate ?? []).flatMap((d) => {
    if (!d?.day) return [];
    const t = new Date(d.day);
    if (Number.isNaN(t.getTime())) return [];
    return [{ date: t.toISOString().slice(0, 10), count: d.count }];
  });

  // --- Admin events (unresolved key tracking) ---
  const rawAdminErrorEvents = rollupB.adminEvents.errorOnlyRaw;
  const adminEventSummary = rollupB.adminEvents.summary;
  const adminEventSummaryDegraded = rollupB.adminEvents.adminEventSummaryDegraded;
  const latestUnresolvedEventTs = new Map<string, number>();
  const resolvedIncidentMeta = new Map<string, AdminEventIncidentResolution>();
  for (const event of rawAdminErrorEvents) {
    const incidentKey = buildAdminEventIncidentKey({
      title: event.title,
      message: event.message,
      metadata: event.metadata,
      url: event.url,
    });
    if (!event.resolved) {
      const eventTs = new Date(event.created_at).getTime();
      const currentMax = latestUnresolvedEventTs.get(incidentKey) ?? -1;
      if (eventTs > currentMax) latestUnresolvedEventTs.set(incidentKey, eventTs);
      continue;
    }
    const existing = resolvedIncidentMeta.get(incidentKey);
    const nextResolvedAt = event.resolved_at ?? event.created_at;
    const existingResolvedAt = existing?.resolvedAt ?? '';
    if (!existing || nextResolvedAt > existingResolvedAt) {
      resolvedIncidentMeta.set(incidentKey, {
        resolvedAt: event.resolved_at ?? event.created_at,
        resolvedBy: event.resolved_by,
      });
    }
  }

  const recentIncidentThreshold = new Date(ago24h).getTime();
  const incidentGroups = new Map<string, {
    key: string;
    latestRow: (typeof rawErrorLogs)[number];
    latestContext: DashboardErrorContext;
    message: string;
    severity: 'critical' | 'error' | 'warning' | 'info';
    stack: string | null;
    firstSeen: string;
    lastSeen: string;
    occurrences: number;
    affectedActors: Set<string>;
    eventIds: string[];
  }>();

  for (const entry of rawErrorLogs) {
    const createdAt = entry.created_at ?? new Date().toISOString();
    const context = buildDashboardErrorContext(entry.context);
    const message = entry.message ?? 'Unknown error';
    const routeOrUrl = context.route ?? entry.url ?? context.url;
    const severity = normalizeDashboardSeverity(entry.severity);
    const key = normalizeIncidentKey(message, routeOrUrl, context.action, context.errorCode);
    const actorKey = context.userId ?? entry.user_id ?? context.userEmail ?? null;
    const existing = incidentGroups.get(key);

    if (!existing) {
      incidentGroups.set(key, {
        key,
        latestRow: entry,
        latestContext: context,
        message,
        severity,
        stack: entry.stack,
        firstSeen: createdAt,
        lastSeen: createdAt,
        occurrences: 1,
        affectedActors: new Set(actorKey ? [actorKey] : []),
        eventIds: [entry.id],
      });
      continue;
    }

    existing.occurrences += 1;
    existing.eventIds.push(entry.id);
    if (actorKey) existing.affectedActors.add(actorKey);
    if (entry.stack) existing.stack = entry.stack;
    existing.latestContext = mergeDashboardErrorContext(existing.latestContext, context);
    if (createdAt < existing.firstSeen) existing.firstSeen = createdAt;
    if (createdAt >= existing.lastSeen) {
      existing.lastSeen = createdAt;
      existing.latestRow = entry;
      existing.latestContext = mergeDashboardErrorContext(context, existing.latestContext);
      existing.message = message;
    }
    if ((DASHBOARD_SEVERITY_ORDER[severity] ?? 99) < (DASHBOARD_SEVERITY_ORDER[existing.severity] ?? 99)) {
      existing.severity = severity;
    }
  }

  const statusOrder: Record<DashboardErrorIncident['status'], number> = {
    open: 0,
    active: 1,
    resolved: 2,
    historical: 3,
  };

  const recentErrors = Array.from(incidentGroups.values())
    .map((group): DashboardErrorIncident => {
      const latestRow = group.latestRow;
      const latestContext = group.latestContext;
      const url = latestRow.url ?? latestContext.url ?? null;
      const route = normalizeIncidentPath(latestContext.route ?? url) || extractErrorRoute(url);
      const featureArea = toFeatureAreaLabel(latestContext.featureArea, url, group.message);
      const narrative = deriveIncidentNarrative(
        group.message,
        featureArea,
        latestContext.action,
        url,
        latestContext.errorCode,
      );
      const userId = latestContext.userId ?? latestRow.user_id ?? null;
      const userEmail = latestContext.userEmail ?? (userId ? (errorEmailMap.get(userId) ?? null) : null);
      const lastSeenTs = new Date(group.lastSeen).getTime();
      const resolution = resolvedIncidentMeta.get(group.key);
      const resolvedAtTs = resolution?.resolvedAt ? new Date(resolution.resolvedAt).getTime() : -1;
      const RESOLVE_TOLERANCE_MS = 5_000;
      const latestUnresolvedTs = latestUnresolvedEventTs.get(group.key) ?? -1;
      const hasPostResolutionEvents = resolution
        ? latestUnresolvedTs > (resolvedAtTs + RESOLVE_TOLERANCE_MS)
        : false;
      const status: DashboardErrorIncident['status'] = resolution && !hasPostResolutionEvents
        ? 'resolved'
        : resolution && hasPostResolutionEvents
          ? 'open'
          : latestUnresolvedTs > -1
            ? 'open'
            : lastSeenTs >= recentIncidentThreshold
              ? 'active'
              : 'historical';

      const incident: DashboardErrorIncident = {
        id: group.key,
        eventIds: group.eventIds,
        title: narrative.title,
        message: group.message,
        severity: group.severity,
        status,
        summary: narrative.summary,
        diagnosisBasis: narrative.diagnosisBasis,
        likelyCause: narrative.likelyCause,
        userImpact: narrative.userImpact,
        nextStep: narrative.nextStep,
        featureArea,
        action: latestContext.action,
        route,
        url,
        source: latestContext.source,
        stack: group.stack,
        userId,
        userEmail,
        createdAt: group.lastSeen,
        firstSeen: group.firstSeen,
        lastSeen: group.lastSeen,
        occurrences: group.occurrences,
        affectedUsers: group.affectedActors.size,
        errorCode: latestContext.errorCode,
        errorHint: latestContext.errorHint,
        errorDetails: latestContext.errorDetails,
        requestId: latestContext.requestId,
        roundId: latestContext.roundId,
        playerId: latestContext.playerId,
        resolvedAt: resolution?.resolvedAt ?? null,
        resolvedBy: resolution?.resolvedBy ? (errorEmailMap.get(resolution.resolvedBy) ?? resolution.resolvedBy) : null,
        copySummary: '',
      };
      incident.copySummary = buildIncidentCopySummary(incident);
      return incident;
    })
    .sort((a, b) => {
      const statusDiff = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
      if (statusDiff !== 0) return statusDiff;
      const severityDiff = (DASHBOARD_SEVERITY_ORDER[a.severity] ?? 99) - (DASHBOARD_SEVERITY_ORDER[b.severity] ?? 99);
      if (severityDiff !== 0) return severityDiff;
      const lastSeenDiff = new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
      if (lastSeenDiff !== 0) return lastSeenDiff;
      return b.occurrences - a.occurrences;
    });

  // ============================================
  // GROUPED INCIDENTS — Smart signature-based collapse for the System tab
  // ============================================
  //
  // The existing `recentErrors` list already merges events by their
  // (normalised full message + route + action + errorCode) key, but slight
  // variations in error text (different round IDs, varying suffixes) still
  // produce many "Platform incident" cards in the UI for what is really one
  // root cause. Re-group those rows here using a tighter signature
  // (severity + errorCode + normalised route + 80-char message prefix) so the
  // System tab's incident feed renders one card per distinct cause with an
  // occurrence count, instead of N nearly-identical cards.
  const groupedIncidentsInput: RawIncident[] = recentErrors.map((incident) => ({
    id: incident.id,
    severity: (incident.severity as IncidentSeverity) ?? 'error',
    title: incident.title,
    message: incident.message,
    route: incident.route ?? incident.url ?? null,
    errorCode: incident.errorCode,
    metadata: null,
    createdAt: incident.lastSeen ?? incident.createdAt,
    resolved: incident.status === 'resolved',
  }));
  const groupedIncidents = groupIncidents(groupedIncidentsInput);

  const incidentCounts = recentErrors.reduce((acc, incident) => {
    acc[incident.status] += 1;
    if (incident.occurrences > 1) acc.repeated += 1;
    if (incident.status === 'open' && incident.severity === 'critical') acc.openCritical += 1;
    if (
      incident.status === 'resolved'
      && incident.resolvedAt
      && new Date(incident.resolvedAt).getTime() >= recentIncidentThreshold
    ) {
      acc.resolvedRecently += 1;
    }
    return acc;
  }, {
    open: 0,
    active: 0,
    resolved: 0,
    historical: 0,
    repeated: 0,
    openCritical: 0,
    resolvedRecently: 0,
  });

  const dataQualityScore = Math.round(
    (dataQuality.distancePercentage + dataQuality.liePercentage + dataQuality.clubPercentage) / 3,
  );
  diagnostics.unshift({
    label: 'Incident Queue',
    status: incidentCounts.open > 0
      ? incidentCounts.openCritical > 0 ? 'critical' : 'warning'
      : incidentCounts.active > 0
        ? 'warning'
        : 'healthy',
    detail: incidentCounts.open > 0
      ? `${incidentCounts.open} open · ${incidentCounts.active} active`
      : incidentCounts.resolvedRecently > 0
        ? `${incidentCounts.resolvedRecently} resolved in last 24h`
        : 'No unresolved incidents',
  });
  diagnostics.push({
    label: 'Shot Data Quality',
    status: dataQualityScore >= 92 ? 'healthy' : dataQualityScore >= 75 ? 'warning' : 'critical',
    detail: `${dataQualityScore}% complete telemetry`,
  });
  diagnostics.push({
    label: 'Stats Integrity',
    status: recentErrors.some((inc) => inc.featureArea === 'Stats Cache' && inc.status === 'open')
      ? 'critical'
      : recentErrors.some((inc) => inc.featureArea === 'Stats Cache' && inc.status === 'active')
        ? 'warning'
        : 'healthy',
    detail: recentErrors.some((inc) => inc.featureArea === 'Stats Cache' && inc.status === 'open')
      ? 'Open cache/stats incidents detected'
      : recentErrors.some((inc) => inc.featureArea === 'Stats Cache' && inc.status === 'active')
        ? 'Recent cache repair failures detected'
        : 'No live cache/stats incidents',
  });

  // --- Recent admin events (with email enrichment) ---
  const recentAdminEvents = rollupB.adminEvents.recentRaw.map((e) => ({
    id: e.id,
    eventType: e.event_type,
    severity: e.severity,
    title: e.title,
    message: e.message,
    userId: e.user_id,
    userEmail: e.user_email ?? (e.user_id ? (errorEmailMap.get(e.user_id) ?? null) : null),
    url: e.url,
    resolved: e.resolved ?? false,
    createdAt: e.created_at,
  }));

  const unresolvedCriticalEvents = rollupB.adminEvents.unresolvedCritical.map((e) => ({
    id: e.id,
    eventType: e.event_type,
    title: e.title,
    message: e.message,
    createdAt: e.created_at,
  }));

  const adminEventsData = {
    totalEvents7d: adminEventSummary?.total_events ?? 0,
    errorCount7d: adminEventSummary?.error_count ?? 0,
    criticalCount7d: adminEventSummary?.critical_count ?? 0,
    unresolvedCount: adminEventSummary?.unresolved_count ?? 0,
    eventsByType: adminEventSummary?.events_by_type ?? {},
    eventsBySeverity: adminEventSummary?.events_by_severity ?? {},
    eventsByDay: adminEventSummary?.events_by_day ?? [],
    recentEvents: recentAdminEvents,
    unresolvedCritical: unresolvedCriticalEvents,
  };

  const unresolvedServerIncidents = unresolvedCriticalEvents.filter((event) => event.eventType === 'error');
  const newestUnresolvedServerIncident = unresolvedServerIncidents[0] ?? null;

  diagnostics.push({
    label: 'Incident Queue',
    status: unresolvedServerIncidents.length === 0
      ? 'healthy'
      : unresolvedServerIncidents.length < 3
        ? 'warning'
        : 'critical',
    detail: unresolvedServerIncidents.length === 0
      ? 'No unresolved server incidents'
      : `${unresolvedServerIncidents.length} unresolved server incident${unresolvedServerIncidents.length > 1 ? 's' : ''}`,
  });

  // --- Audit log (enrich emails) ---
  const auditLogData = rollupB.auditLog.recentRaw.map((a) => ({
    id: a.id,
    userId: a.user_id,
    userEmail: a.user_email ?? (a.user_id ? (errorEmailMap.get(a.user_id) ?? null) : null),
    action: a.action,
    tableName: a.table_name,
    recordId: a.record_id,
    oldData: a.old_data,
    newData: a.new_data,
    createdAt: a.created_at,
  }));

  // --- Needs attention (derived) ---
  const needsAttention: AdminDashboardData['needsAttention'] = [];

  const stuckInOnboarding = users.usersForDirectory.filter((u) => {
    if (!u.created_at) return false;
    const daysSinceSignup = (now - new Date(u.created_at).getTime()) / 86400000;
    const player = userIdToPlayerDetail.get(u.id);
    return daysSinceSignup > 7 && player && !player.onboarding_completed;
  });
  if (stuckInOnboarding.length > 0) {
    needsAttention.push({
      label: `${stuckInOnboarding.length} player${stuckInOnboarding.length > 1 ? 's' : ''} stuck in onboarding > 7 days`,
      severity: 'warning',
      detail: 'Consider sending a reminder or checking for onboarding UX issues',
      tab: 'people',
    });
  }

  const inactiveCoaches = users.usersForDirectory.filter((u) => {
    if (u.role !== 'coach') return false;
    const lastActive = userLastActive.get(u.id);
    if (!lastActive) return true;
    return (now - new Date(lastActive).getTime()) / 86400000 > 14;
  });
  if (inactiveCoaches.length > 0) {
    needsAttention.push({
      label: `${inactiveCoaches.length} coach${inactiveCoaches.length > 1 ? 'es' : ''} inactive 14+ days`,
      severity: 'warning',
      detail: 'These coaches have not logged in recently and may need outreach',
      tab: 'people',
    });
  }

  const criticalCount = rollupB.errors.criticalErrors7d;
  const unresolvedCriticalCount = incidentCounts.openCritical;
  if (unresolvedCriticalCount > 0) {
    needsAttention.push({
      label: `${unresolvedCriticalCount} unresolved critical error${unresolvedCriticalCount > 1 ? 's' : ''}`,
      severity: 'critical',
      detail: 'Immediate attention required — review and resolve in System tab',
      tab: 'system',
    });
  }

  if (unresolvedServerIncidents.length > 0 && newestUnresolvedServerIncident) {
    needsAttention.push({
      label: `${unresolvedServerIncidents.length} unresolved server incident${unresolvedServerIncidents.length > 1 ? 's' : ''}`,
      severity: unresolvedServerIncidents.length > 2 ? 'critical' : 'warning',
      detail: (newestUnresolvedServerIncident.message || newestUnresolvedServerIncident.title).slice(0, 140),
      tab: 'system',
    });
  }

  const totalErrors7d = rollupB.errors.totalErrors7d;
  const hasUnresolvedIncidents = incidentCounts.open > 0 || incidentCounts.active > 0;
  if (totalErrors7d > 10 && unresolvedCriticalCount === 0 && hasUnresolvedIncidents) {
    needsAttention.push({
      label: `${totalErrors7d} errors logged (${incidentCounts.open + incidentCounts.active} unresolved)`,
      severity: 'warning',
      detail: 'Unresolved incidents need review in System tab',
      tab: 'system',
    });
  }

  const lockedAccountCount = rollupB.loginSecurity.lockedAccounts;
  if (lockedAccountCount > 0) {
    needsAttention.push({
      label: `${lockedAccountCount} locked account${lockedAccountCount > 1 ? 's' : ''}`,
      severity: 'warning',
      detail: 'Users locked out due to failed login attempts — unlock in People tab',
      tab: 'people',
    });
  }

  const stuckCoachesOnboarding = users.usersForDirectory.filter((u) => {
    if (!u.created_at) return false;
    const daysSinceSignup = (now - new Date(u.created_at).getTime()) / 86400000;
    const coach = userIdToCoachDetail.get(u.id);
    return daysSinceSignup > 7 && coach && !coach.onboardingCompleted;
  });
  if (stuckCoachesOnboarding.length > 0) {
    needsAttention.push({
      label: `${stuckCoachesOnboarding.length} coach${stuckCoachesOnboarding.length > 1 ? 'es' : ''} haven't completed onboarding`,
      severity: 'warning',
      detail: 'Signed up over 7 days ago but never finished setup',
      tab: 'people',
    });
  }

  const pendingDemoCount = rollupB.demoRequests.pending;
  if (pendingDemoCount > 0) {
    needsAttention.push({
      label: `${pendingDemoCount} pending demo request${pendingDemoCount > 1 ? 's' : ''}`,
      severity: 'info',
      detail: 'New inbound leads waiting for follow-up',
      tab: 'bi',
    });
  }

  // ============================================
  // ERROR DETECTION — extend RollupC with byType/byRoute/byUser/UX from raw logs
  // ============================================
  const errorTypeGroups = new Map<string, { count: number; lastOccurred: string }>();
  for (const e of rawErrorLogs) {
    const msg = (e.message ?? 'Unknown error').substring(0, 120);
    const existing = errorTypeGroups.get(msg);
    const ts = e.created_at ?? new Date().toISOString();
    if (existing) {
      existing.count++;
      if (ts > existing.lastOccurred) existing.lastOccurred = ts;
    } else {
      errorTypeGroups.set(msg, { count: 1, lastOccurred: ts });
    }
  }
  const detectedErrorsByType = [...errorTypeGroups.entries()]
    .map(([type, d]) => ({ type, count: d.count, lastOccurred: d.lastOccurred }))
    .sort((a, b) => b.count - a.count);

  const errorRouteGroups = new Map<string, number>();
  for (const e of rawErrorLogs) {
    if (e.url) {
      try {
        const urlPath = new URL(e.url, 'http://localhost').pathname;
        errorRouteGroups.set(urlPath, (errorRouteGroups.get(urlPath) ?? 0) + 1);
      } catch {
        errorRouteGroups.set(e.url, (errorRouteGroups.get(e.url) ?? 0) + 1);
      }
    } else {
      errorRouteGroups.set('(no route)', (errorRouteGroups.get('(no route)') ?? 0) + 1);
    }
  }
  const detectedErrorsByRoute = [...errorRouteGroups.entries()]
    .map(([route, count]) => ({ route, count }))
    .sort((a, b) => b.count - a.count);

  const errorUserGroups = new Map<string, number>();
  for (const e of rawErrorLogs) {
    const key = e.user_id ?? '__anonymous__';
    errorUserGroups.set(key, (errorUserGroups.get(key) ?? 0) + 1);
  }
  const detectedErrorsByUser = [...errorUserGroups.entries()]
    .map(([uid, count]) => ({
      userId: uid === '__anonymous__' ? null : uid,
      email: uid !== '__anonymous__' ? (errorEmailMap.get(uid) ?? null) : null,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  let uxChunkLoadErrors = 0;
  let uxFrameworkWarnings = 0;
  let uxServerErrors = 0;
  let uxAuthErrors = 0;
  for (const e of rawErrorLogs) {
    const msg = (e.message ?? '').toLowerCase();
    const sev = (e.severity ?? '').toLowerCase();
    if (msg.includes('chunk') || msg.includes('chunkloaderror') || msg.includes('loading chunk')) uxChunkLoadErrors++;
    else if (msg.includes('lazymotion') || msg.includes('framer') || sev === 'warning') uxFrameworkWarnings++;
    else if (msg.includes('500') || msg.includes('server error') || msg.includes('internal server')) uxServerErrors++;
    else if (msg.includes('auth') || msg.includes('login') || msg.includes('unauthorized') || msg.includes('forbidden')) uxAuthErrors++;
  }

  const errorDetectionData: AdminDashboardData['errorDetection'] = {
    ...rollupC.errorDetection,
    errorsByType: detectedErrorsByType,
    errorsByRoute: detectedErrorsByRoute,
    errorsByUser: detectedErrorsByUser,
    userExperienceIssues: {
      chunkLoadErrors: uxChunkLoadErrors,
      frameworkWarnings: uxFrameworkWarnings,
      serverErrors: uxServerErrors,
      authErrors: uxAuthErrors,
    },
  };

  // --- Infra health: merge rollupC shell with DB stats + client errors summary ---
  const infraHealth: AdminDashboardData['infraHealth'] = {
    apiPerf: rollupC.infraHealth.apiPerf,
    clientErrors: (errorSummary?.top_errors ?? []).slice(0, 10).map((e) => ({
      message: e.message,
      occurrences: e.occurrences,
      lastSeen: e.last_seen ? new Date(e.last_seen).toLocaleDateString() : 'Unknown',
      affectedPages: [],
    })),
    dbHealth: {
      activeConnections: phs?.active_connections ?? 0,
      idleConnections: phs?.idle_connections ?? 0,
      dbSizeBytes: phs?.db_size_bytes ?? 0,
      largestTables: (phs?.largest_tables ?? []).map((t) => ({
        tableName: t.table_name,
        sizeBytes: t.size_bytes,
        rowCount: t.row_count,
      })),
    },
    totals: {
      totalApiCalls7d: rollupC.infraHealth.totals.totalApiCalls7d,
      avgResponseMs: responseTime,
      p95ResponseMs: Math.round(responseTime * 1.5),
      errorRate: totalErrors7d > 0 && rollupC.infraHealth.totals.totalApiCalls7d > 0
        ? Math.round((totalErrors7d / rollupC.infraHealth.totals.totalApiCalls7d) * 10000) / 100
        : 0,
      totalClientErrors7d: totalErrors7d,
    },
  };

  // ============================================
  // BI DASHBOARD
  // ============================================

  // --- BI Growth ---
  // Activation rates via shared metrics helper. Helper returns a ratio in
  // [0, 1]; we surface as percent with one decimal (e.g. 42.7) for parity with
  // existing call sites and the BI cards' `safeFixed(_, 0)` formatter.
  const biActivatedPlayers = playerOnboarded;
  const biActivatedCoaches = coachOnboarded;
  const biPlayerActivationRate =
    Math.round(
      computeActivation({ signups: totalPlayers, activated: biActivatedPlayers }) * 1000
    ) / 10;
  const biCoachActivationRate =
    Math.round(
      computeActivation({ signups: totalCoaches, activated: biActivatedCoaches }) * 1000
    ) / 10;
  const totalUsersForActivation = totalPlayers + totalCoaches;
  const biOverallActivationRate =
    Math.round(
      computeActivation({
        signups: totalUsersForActivation,
        activated: biActivatedPlayers + biActivatedCoaches,
      }) * 1000
    ) / 10;

  // Median TTFV (days from signup to first round) — use allRoundsMinimal for
  // first-round dates, then route through the shared metrics helper. Helper
  // skips users with bad timestamps or first-round-before-signup, identical
  // to the previous inline behavior.
  const playerFirstRound = new Map<string, string>();
  for (const r of rollupA.allRoundsMinimal) {
    if (!r.player_id || !r.created_at) continue;
    const existing = playerFirstRound.get(r.player_id);
    if (!existing || r.created_at < existing) playerFirstRound.set(r.player_id, r.created_at);
  }
  const ttfvRecords: TTFVRecord[] = [];
  for (const u of users.usersForDirectory) {
    if (!u.created_at) continue;
    const pid = userIdToPlayerId.get(u.id);
    if (!pid) continue;
    const firstRound = playerFirstRound.get(pid);
    if (!firstRound) continue;
    ttfvRecords.push({ signupAt: u.created_at, firstValueAt: firstRound });
  }
  // Helper returns 0 if no usable rows; preserve the historical "null when
  // no data" contract by checking the input length explicitly.
  const biMedianTTFVDays =
    ttfvRecords.length > 0
      ? Math.round(computeMedianTTFV(ttfvRecords) * 10) / 10
      : null;

  const totalSignupCount = users.usersForDirectory.length;
  const completedOnboardingCount = biActivatedPlayers + biActivatedCoaches;
  const submittedFirstRoundCount = rollupC.userJourney.submittedFirstRound;
  const activeThisWeekCount = rollupC.userJourney.activeThisWeek;

  // Funnel must monotonically decrease — "Received AI Insights" was previously
  // the *all-time* count of players who ever received insights, which could
  // exceed "Active This Week" and break the strict-subset invariant. Redefine
  // the step as `active_this_week ∩ received_insights` so the funnel reads
  // correctly as "of the players active this week, how many got AI insights".
  const playersActiveThisWeekIds = new Set(rollupA.rounds.playersThisWeek);
  const playersWithInsightsAllTime = new Set(
    coachhelm.insightPlayerRows.map((r) => r.player_id).filter((id): id is string => Boolean(id))
  );
  let receivedInsightsCount = 0;
  for (const pid of playersActiveThisWeekIds) {
    if (playersWithInsightsAllTime.has(pid)) receivedInsightsCount += 1;
  }

  const biActivationFunnel = buildFunnelSteps([
    { step: 'Signed Up', count: totalSignupCount },
    { step: 'Completed Onboarding', count: completedOnboardingCount },
    { step: 'Submitted First Round', count: submittedFirstRoundCount },
    { step: 'Active This Week', count: activeThisWeekCount },
    { step: 'Received AI Insights', count: receivedInsightsCount },
  ]);
  // Keep the all-time aggregate available for any downstream reader that
  // intentionally wants a non-funnel "any insights ever" count.
  void uniqueInsightPlayers;

  // --- BI Retention (D1/D7/D30) ---
  const computeDayRetention = (daysBack: number, windowDays: number = 1) => {
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - daysBack - windowDays);
    const windowEnd = new Date();
    windowEnd.setDate(windowEnd.getDate() - daysBack);
    const cohortUsers = users.usersForDirectory.filter((u) => {
      if (!u.created_at) return false;
      const ts = new Date(u.created_at);
      return ts >= windowStart && ts < windowEnd;
    });
    const total = cohortUsers.length;
    if (total === 0) return { retained: 0, total: 0, rate: 0 };
    let retained = 0;
    for (const u of cohortUsers) {
      const playerId = userIdToPlayerId.get(u.id);
      const lastActive = userLastActive.get(u.id);
      const signupDate = new Date(u.created_at!);
      const retentionDate = new Date(signupDate);
      retentionDate.setDate(retentionDate.getDate() + daysBack);
      const wasActiveAfterDay = (lastActive && new Date(lastActive) >= retentionDate)
        || (playerId && playerLastRound.has(playerId) && new Date(playerLastRound.get(playerId)!) >= retentionDate);
      if (wasActiveAfterDay) retained++;
    }
    return { retained, total, rate: total > 0 ? Math.round((retained / total) * 1000) / 10 : 0 };
  };

  const biD1 = computeDayRetention(1, 7);
  const biD7 = computeDayRetention(7, 7);
  const biD30 = computeDayRetention(30, 14);

  const biDauRounds = rollupC.stickiness.dau;
  const biWauRounds = rollupC.stickiness.wau;
  const biMauRounds = rollupC.stickiness.mau;

  const ago24hTs = new Date(ago24h);
  const ago7dTs = new Date(ago7d);
  const ago30dTs = new Date(ago30d);
  let biDauLogins = 0;
  let biWauLogins = 0;
  let biMauLogins = 0;
  const nowTs = new Date();
  for (const [, lastSeen] of userLastActive) {
    const ts = new Date(lastSeen);
    if (ts >= ago24hTs && ts <= nowTs) biDauLogins++;
    if (ts >= ago7dTs && ts <= nowTs) biWauLogins++;
    if (ts >= ago30dTs && ts <= nowTs) biMauLogins++;
  }

  const biStickinessRounds = biMauRounds > 0 ? Math.round((biDauRounds / biMauRounds) * 1000) / 10 : 0;
  const biStickinessLogins = biMauLogins > 0 ? Math.round((biDauLogins / biMauLogins) * 1000) / 10 : 0;

  const coachUserIds = new Set<string>();
  for (const c of coachesById.values()) {
    if (c.userId) coachUserIds.add(c.userId);
  }
  let coachesActiveLast30d = 0;
  let coachesActiveThisWeek = 0;
  for (const uid of coachUserIds) {
    const ls = userLastActive.get(uid);
    if (!ls) continue;
    const lsDate = new Date(ls);
    if (lsDate >= ago30dTs) coachesActiveLast30d++;
    if (lsDate >= ago7dTs) coachesActiveThisWeek++;
  }
  const biCoachWeeklyRetention = coachesActiveLast30d > 0
    ? Math.round((coachesActiveThisWeek / coachesActiveLast30d) * 1000) / 10
    : 0;
  const biPlayerWeeklyRetention = Math.round(weeklyRetention * 10) / 10;

  // --- BI Usage ---
  const roundsLast30d = rollupA.allRoundsMinimal.filter((r) => r.created_at && new Date(r.created_at) >= ago30dTs);
  const insightsGenerated30d = coachhelm.insightGenLog30dCount;

  const biFeatureAdoption: BIDashboardData['usage']['featureAdoption'] = [
    { feature: 'Rounds', allTime: totalRoundsCount, last30d: roundsLast30d.length, category: 'core' },
    { feature: 'Qualifiers', allTime: featureAdoption.qualifiers.total, last30d: featureAdoption.qualifiers.last30d, category: 'competition' },
    { feature: 'Events', allTime: featureAdoption.events.total, last30d: featureAdoption.events.last30d, category: 'team' },
    { feature: 'Tasks', allTime: featureAdoption.tasks.total, last30d: featureAdoption.tasks.last30d, category: 'team' },
    { feature: 'Announcements', allTime: featureAdoption.announcements.total, last30d: featureAdoption.announcements.last30d, category: 'communication' },
    { feature: 'Messages', allTime: featureAdoption.messages.total, last30d: featureAdoption.messages.last30d, category: 'communication' },
    { feature: 'Documents', allTime: featureAdoption.documents.total, last30d: featureAdoption.documents.last30d, category: 'team' },
    { feature: 'Travel', allTime: featureAdoption.travel.total, last30d: featureAdoption.travel.last30d, category: 'team' },
    { feature: 'Round Reviews', allTime: coachhelm.totalReviewsAllTime, last30d: coachhelm.reviews30d, category: 'ai' },
    { feature: 'AI Insights', allTime: totalInsightsGenerated, last30d: insightsGenerated30d, category: 'ai' },
    { feature: 'Patterns', allTime: coachhelm.totalPatterns, last30d: coachhelm.patterns30d, category: 'ai' },
    { feature: 'Predictions', allTime: coachhelm.totalPredictions, last30d: coachhelm.predictions30d, category: 'ai' },
  ];

  const maxAllTimeUsage = Math.max(...biFeatureAdoption.map((f) => f.allTime), 1);
  const biDeadFeatures = biFeatureAdoption
    .filter((f) => f.allTime / maxAllTimeUsage < 0.05 && f.allTime > 0)
    .map((f) => f.feature);
  for (const df of rollupC.sessionHeatmap.deadFeatures) {
    if (!biDeadFeatures.includes(df)) biDeadFeatures.push(df);
  }

  // Feature-retention correlation
  const playerIdsWithInsights = new Set(coachhelm.insightPlayerRows.map((r) => r.player_id).filter(Boolean));
  const playerIdsWithReviews = new Set<string>();
  for (const rid of coachhelm.reviewedRoundIds) void rid; // we don't have player_id per review here
  // Rollup doesn't expose round→player for reviews directly; approximate via playersThisWeek (recent activity)
  for (const pid of rollupA.rounds.playersThisWeek) playerIdsWithReviews.add(pid);

  const computeRetentionForGroup = (playerIds: Set<string>): number => {
    if (playerIds.size === 0) return 0;
    let activeCount = 0;
    for (const pid of playerIds) {
      if (playersActive30dSet.has(pid)) activeCount++;
    }
    return Math.round((activeCount / playerIds.size) * 1000) / 10;
  };
  const allPlayerIdsSet = new Set(playerIdsAll);
  const playerIdsWithRounds = new Set(Object.keys(rounds.playerRoundCounts));
  const playerIdsWithoutRounds = new Set([...allPlayerIdsSet].filter((id) => !playerIdsWithRounds.has(id)));
  const playerIdsWithoutInsights = new Set([...allPlayerIdsSet].filter((id) => !playerIdsWithInsights.has(id)));
  const playerIdsWithoutReviews = new Set([...allPlayerIdsSet].filter((id) => !playerIdsWithReviews.has(id)));

  const retRounds = computeRetentionForGroup(playerIdsWithRounds);
  const retNoRounds = computeRetentionForGroup(playerIdsWithoutRounds);
  const retReviews = computeRetentionForGroup(playerIdsWithReviews);
  const retNoReviews = computeRetentionForGroup(playerIdsWithoutReviews);
  const retInsights = computeRetentionForGroup(playerIdsWithInsights);
  const retNoInsights = computeRetentionForGroup(playerIdsWithoutInsights);

  const biFeatureRetentionCorrelation: BIDashboardData['usage']['featureRetentionCorrelation'] = [
    { feature: 'Submitted Rounds', retentionWith: retRounds, retentionWithout: retNoRounds, lift: retNoRounds > 0 ? Math.round((retRounds / retNoRounds - 1) * 1000) / 10 : 0 },
    { feature: 'Received Reviews', retentionWith: retReviews, retentionWithout: retNoReviews, lift: retNoReviews > 0 ? Math.round((retReviews / retNoReviews - 1) * 1000) / 10 : 0 },
    { feature: 'Received AI Insights', retentionWith: retInsights, retentionWithout: retNoInsights, lift: retNoInsights > 0 ? Math.round((retInsights / retNoInsights - 1) * 1000) / 10 : 0 },
  ];

  // Object creation by week — from allRoundsMinimal
  const roundWeekMap = new Map<string, number>();
  for (const r of rollupA.allRoundsMinimal) {
    if (!r.created_at) continue;
    const d = new Date(r.created_at);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    const key = monday.toISOString().slice(0, 10);
    roundWeekMap.set(key, (roundWeekMap.get(key) ?? 0) + 1);
  }
  const biObjectCreationByWeek = [...roundWeekMap.keys()].sort().map((week) => ({
    week,
    rounds: roundWeekMap.get(week) ?? 0,
    events: 0,
    messages: 0,
  }));

  // --- BI Funnel ---
  const playerSignups = users.usersForDirectory.filter((u) => userIdToPlayerDetail.has(u.id)).length;
  const playersJoinedTeam = [...playersById.values()].filter((p) => playerToTeamInfo.has(p.id)).length;
  const playersSubmittedRound = submittedFirstRoundCount;
  const playersReceivedInsight = uniqueInsightPlayers;

  const biPlayerOnboarding = buildFunnelSteps([
    { step: 'Signed Up', count: playerSignups },
    { step: 'Completed Onboarding', count: biActivatedPlayers },
    { step: 'Joined Team', count: playersJoinedTeam },
    { step: 'Submitted Round', count: playersSubmittedRound },
    { step: 'Received AI Insight', count: playersReceivedInsight },
  ]);

  const coachSignups = users.usersForDirectory.filter((u) => userIdToCoachDetail.has(u.id)).length;
  const coachesWithPhilosophy = philosophyCoachIdSet.size;
  const coachesReviewedRound = rollupC.coachIntelligence.filter((c) => c.roundsReviewed > 0).length;
  const coachesViewedInsights = rollupC.coachIntelligence.filter((c) => c.insightsViewed > 0).length;

  const biCoachOnboarding = buildFunnelSteps([
    { step: 'Signed Up', count: coachSignups },
    { step: 'Completed Onboarding', count: biActivatedCoaches },
    { step: 'Set Philosophy', count: coachesWithPhilosophy },
    { step: 'Reviewed a Round', count: coachesReviewedRound },
    { step: 'Viewed Insights', count: coachesViewedInsights },
  ]);

  const findBiggestDropoff = (steps: BIFunnelStep[]): { from: string; to: string; dropoff: number; pct: number } | null => {
    if (steps.length < 2) return null;
    let maxDropoff = -1;
    let result: { from: string; to: string; dropoff: number; pct: number } | null = null;
    for (let i = 1; i < steps.length; i++) {
      if (steps[i]!.dropoff > maxDropoff) {
        maxDropoff = steps[i]!.dropoff;
        result = {
          from: steps[i - 1]!.step,
          to: steps[i]!.step,
          dropoff: steps[i]!.dropoff,
          pct: steps[i]!.dropoffPct,
        };
      }
    }
    return result;
  };

  const biBiggestPlayerDropoff = findBiggestDropoff(biPlayerOnboarding);
  const biBiggestCoachDropoff = findBiggestDropoff(biCoachOnboarding);

  // Errors by feature area
  const areaErrorData = new Map<string, { count: number; critical: number; recentErrors: { message: string; severity: string; created_at: string; url: string }[] }>();
  for (const e of rawErrorLogs) {
    let area = 'Other';
    const url = (e.url ?? '').toLowerCase();
    const msg = (e.message ?? '').toLowerCase();
    if (url.includes('/rounds') || msg.includes('round')) area = 'Rounds';
    else if (url.includes('/calendar') || url.includes('/events') || msg.includes('event')) area = 'Calendar/Events';
    else if (url.includes('/messages') || msg.includes('message')) area = 'Messaging';
    else if (url.includes('/coachhelm') || url.includes('/insights') || url.includes('/intelligence') || msg.includes('insight') || msg.includes('prediction')) area = 'CoachHelm AI';
    else if (url.includes('/roster') || msg.includes('roster') || msg.includes('team_member')) area = 'Roster';
    else if (url.includes('/stats') || msg.includes('stats')) area = 'Stats';
    else if (url.includes('/qualifiers') || msg.includes('qualifier')) area = 'Qualifiers';
    else if (url.includes('/onboarding') || msg.includes('onboarding')) area = 'Onboarding';
    else if (url.includes('/auth') || url.includes('/login') || msg.includes('auth')) area = 'Auth';
    else if (url.includes('/dashboard')) area = 'Dashboard';

    const entry = areaErrorData.get(area) ?? { count: 0, critical: 0, recentErrors: [] };
    entry.count++;
    if ((e.severity ?? '').toLowerCase() === 'critical') entry.critical++;
    if (entry.recentErrors.length < 5) {
      entry.recentErrors.push({
        message: (e.message ?? '').slice(0, 200),
        severity: e.severity ?? 'error',
        created_at: e.created_at ?? '',
        url: (e.url ?? '').replace(/https?:\/\/[^/]+/, ''),
      });
    }
    areaErrorData.set(area, entry);
  }
  const biErrorsByFeatureArea = [...areaErrorData.entries()]
    .map(([area, d]) => ({ area, count: d.count, critical: d.critical, recentErrors: d.recentErrors }))
    .sort((a, b) => b.count - a.count);

  // --- BI Health ---
  const monthAgoForBI = ago30dTs;
  const biTeamHealthScores: BITeamHealth[] = teams.map((t) => {
    const teamPlayerIdsForTeam = teamIdToPlayerIds.get(t.id) ?? [];
    const activeCount = teamPlayerIdsForTeam.filter((pid) => playersActive30dSet.has(pid)).length;
    const playerCount = t.playerCount;
    const roundsMonth = rollupA.allRoundsMinimal.filter(
      (r) => r.team_id === t.id && r.created_at && new Date(r.created_at) >= monthAgoForBI,
    ).length;
    const activePct = playerCount > 0 ? activeCount / playerCount : 0;
    const roundsScore = Math.min(roundsMonth / Math.max(playerCount, 1) * 20, 40);
    const activeScore = activePct * 40;
    const sizeScore = Math.min(playerCount * 2, 20);
    const score = Math.round(roundsScore + activeScore + sizeScore);
    const grade: BITeamHealth['grade'] = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : score >= 20 ? 'D' : 'F';
    const riskLevel: BITeamHealth['riskLevel'] = score >= 50 ? 'healthy' : score >= 25 ? 'at_risk' : 'critical';
    return {
      teamId: t.id,
      teamName: t.name,
      orgName: t.orgName,
      score,
      grade,
      playerCount,
      activePlayerCount: activeCount,
      roundsThisMonth: roundsMonth,
      riskLevel,
    };
  }).sort((a, b) => a.score - b.score);

  // Power users — rounds in last 30d
  const playerRoundsLast30d = new Map<string, number>();
  for (const r of rollupA.allRoundsMinimal) {
    if (!r.player_id || !r.created_at) continue;
    if (new Date(r.created_at) < monthAgoForBI) continue;
    playerRoundsLast30d.set(r.player_id, (playerRoundsLast30d.get(r.player_id) ?? 0) + 1);
  }
  const sortedByActivity = [...playerRoundsLast30d.entries()].sort((a, b) => b[1] - a[1]);
  const powerUserThreshold = Math.max(Math.ceil(sortedByActivity.length * 0.1), 1);
  const powerUserIds = sortedByActivity.slice(0, powerUserThreshold).map(([id]) => id);
  const biPowerUsers = {
    count: powerUserIds.length,
    pct: playerIdsAll.size > 0 ? Math.round((powerUserIds.length / playerIdsAll.size) * 1000) / 10 : 0,
    ids: powerUserIds.slice(0, 50),
  };

  // At-risk accounts
  const biAtRiskAccounts: BIAtRiskAccount[] = [];
  for (const [pid, lastRound] of playerLastRound) {
    const daysSinceGone = Math.floor((now - new Date(lastRound).getTime()) / 86400000);
    if (daysSinceGone < 7) continue;
    const player = playersById.get(pid);
    if (!player) continue;
    const signals: string[] = [];
    if (daysSinceGone >= 30) signals.push('No round in 30+ days');
    else if (daysSinceGone >= 14) signals.push('No round in 14+ days');
    else signals.push('No round in 7+ days');
    const totalRnds = playerRoundCounts.get(pid) ?? 0;
    if (totalRnds <= 1) signals.push('Only 1 round ever');
    if (!player.onboarding_completed) signals.push('Onboarding incomplete');
    const riskScore = Math.min(daysSinceGone * 2 + (totalRnds <= 1 ? 20 : 0), 100);
    if (riskScore >= 30) {
      biAtRiskAccounts.push({
        type: 'player',
        id: pid,
        name: `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim() || 'Unknown',
        teamName: playerTeamName.get(pid) ?? null,
        riskScore,
        riskSignals: signals,
        daysSinceLastActive: daysSinceGone,
      });
    }
  }
  for (const c of coachesById.values()) {
    if (!c.userId) continue;
    const lastActive = userLastActive.get(c.userId);
    const daysSinceGone = lastActive ? Math.floor((now - new Date(lastActive).getTime()) / 86400000) : 999;
    if (daysSinceGone < 14) continue;
    const signals: string[] = [];
    if (daysSinceGone >= 30) signals.push('No login in 30+ days');
    else signals.push('No login in 14+ days');
    if (!c.onboardingCompleted) signals.push('Onboarding incomplete');
    const insightCount = rollupC.coachIntelligence.find((ci) => ci.id === c.id)?.insightsViewed ?? 0;
    if (insightCount === 0) signals.push('Never viewed insights');
    let coachTeamName: string | null = null;
    if (c.orgId) {
      for (const t of rollupB.teams.teams) {
        if (t.organization_id === c.orgId) {
          coachTeamName = t.name;
          break;
        }
      }
    }
    biAtRiskAccounts.push({
      type: 'coach',
      id: c.id,
      name: `${c.firstName} ${c.lastName}`.trim() || 'Unknown',
      teamName: coachTeamName,
      riskScore: Math.min(daysSinceGone * 2, 100),
      riskSignals: signals,
      daysSinceLastActive: daysSinceGone,
    });
  }
  for (const t of biTeamHealthScores) {
    if (t.riskLevel !== 'critical') continue;
    biAtRiskAccounts.push({
      type: 'team',
      id: t.teamId,
      name: t.teamName,
      teamName: t.teamName,
      riskScore: 100 - t.score,
      riskSignals: [
        t.activePlayerCount === 0 ? 'No active players' : `Only ${t.activePlayerCount} active players`,
        t.roundsThisMonth === 0 ? 'No rounds this month' : `Only ${t.roundsThisMonth} rounds this month`,
      ],
      daysSinceLastActive: 0,
    });
  }
  biAtRiskAccounts.sort((a, b) => b.riskScore - a.riskScore);

  // Conversion proxies
  const biConversionProxies: BIConversionProxy[] = teams.map((t) => {
    const teamPlayerIdsForTeam = teamIdToPlayerIds.get(t.id) ?? [];
    const activeCount = teamPlayerIdsForTeam.filter((pid) => playersActive30dSet.has(pid)).length;
    const activePct = teamPlayerIdsForTeam.length > 0 ? activeCount / teamPlayerIdsForTeam.length : 0;
    const roundsPerWeek = t.roundsThisWeek;
    const teamData = rollupB.teams.teams.find((tt) => tt.id === t.id);
    const hasAI = teamData?.organization_id ? aiOrgIds.has(teamData.organization_id) : false;
    const teamCreationDates = teamPlayerIdsForTeam
      .map((pid) => {
        const p = playersById.get(pid);
        if (!p?.user_id) return null;
        const u = users.usersForDirectory.find((usr) => usr.id === p.user_id);
        return u?.created_at ? new Date(u.created_at).getTime() : null;
      })
      .filter((d): d is number => d !== null);
    const earliestSignup = teamCreationDates.length > 0 ? Math.min(...teamCreationDates) : now;
    const tenureDays = Math.floor((now - earliestSignup) / 86400000);
    const sizeScore = Math.min(teamPlayerIdsForTeam.length * 5, 25);
    const activeScore = activePct * 25;
    const roundScore = Math.min(roundsPerWeek * 5, 25);
    const aiScore = hasAI ? 15 : 0;
    const tenureScore = Math.min(tenureDays / 10, 10);
    const score = Math.round(sizeScore + activeScore + roundScore + aiScore + tenureScore);
    const tier: BIConversionProxy['tier'] = score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';
    return {
      teamId: t.id,
      teamName: t.name,
      score,
      tier,
      signals: {
        playerCount: teamPlayerIdsForTeam.length,
        activePlayerPct: Math.round(activePct * 1000) / 10,
        roundsPerWeek,
        aiAdoption: hasAI,
        tenureDays,
      },
    };
  }).sort((a, b) => b.score - a.score);

  const biData: BIDashboardData = {
    growth: {
      signupsByDay: signupsByDayResult,
      signupsByWeek,
      activatedPlayers: biActivatedPlayers,
      activatedCoaches: biActivatedCoaches,
      playerActivationRate: biPlayerActivationRate,
      coachActivationRate: biCoachActivationRate,
      overallActivationRate: biOverallActivationRate,
      medianTTFVDays: biMedianTTFVDays,
      activationFunnel: biActivationFunnel,
      userGrowthRateWoW: userGrowthRate,
      roundGrowthRateWoW: roundGrowthRate,
    },
    retention: {
      d1: biD1,
      d7: biD7,
      d30: biD30,
      cohortMatrix: rollupC.cohortMatrix,
      dauRounds: biDauRounds,
      wauRounds: biWauRounds,
      mauRounds: biMauRounds,
      dauLogins: biDauLogins,
      wauLogins: biWauLogins,
      mauLogins: biMauLogins,
      stickinessRounds: biStickinessRounds,
      stickinessLogins: biStickinessLogins,
      coachWeeklyRetention: biCoachWeeklyRetention,
      playerWeeklyRetention: biPlayerWeeklyRetention,
    },
    usage: {
      featureAdoption: biFeatureAdoption,
      deadFeatures: biDeadFeatures,
      featureRetentionCorrelation: biFeatureRetentionCorrelation,
      objectCreationByWeek: biObjectCreationByWeek,
    },
    funnel: {
      playerOnboarding: biPlayerOnboarding,
      coachOnboarding: biCoachOnboarding,
      biggestPlayerDropoff: biBiggestPlayerDropoff,
      biggestCoachDropoff: biBiggestCoachDropoff,
      errorsByFeatureArea: biErrorsByFeatureArea,
    },
    health: {
      teamHealthScores: biTeamHealthScores,
      powerUsers: biPowerUsers,
      atRiskAccounts: biAtRiskAccounts.slice(0, 100),
      conversionProxies: biConversionProxies,
    },
    vercel: vercelAnalytics,
  };

  // Use ago14d in a way that silences unused-var warnings (kept for future windowing).
  void ago14d;
  void today;

  return {
    health: {
      activeUsers24h: rounds.activeUsers24h,
      activeUsers7d: rounds.activeUsers7d,
      activeUsers30d: rounds.activeUsers30d,
      roundsThisWeek: rounds.roundsThisWeek,
      roundReviewsThisWeek: coachhelm.reviewsThisWeek,
      insightsThisWeek: coachhelm.insightsThisWeek,
      systemErrors7d: systemErrors,
      avgResponseTimeMs: responseTime,
      dataFreshness,
      lastRoundSubmitted: lastRoundTimestamp,
      lastInsightGenerated: lastInsightTimestamp,
      roundsToday: rounds.roundsToday,
      diagnostics,
      realActiveUsers1h,
      realActiveUsers24h,
      realActiveUsers7d,
      realActiveUsers30d,
      activeSessions: phs?.active_sessions ?? 0,
      totalSessions: phs?.total_sessions ?? 0,
      totalAuthUsers: phs?.total_auth_users ?? 0,
      usersSignedInToday: phs?.users_signed_in_today ?? 0,
      usersNeverSignedIn: phs?.users_never_signed_in ?? 0,
      dbSizeBytes: phs?.db_size_bytes ?? 0,
      activeConnections: phs?.active_connections ?? 0,
      idleConnections: phs?.idle_connections ?? 0,
      largestTables: phs?.largest_tables ?? [],
    },
    users: {
      totalCoaches,
      totalPlayers,
      totalAdmins: users.totalAdmins,
      coachOnboardingRate: totalCoaches > 0 ? Math.round((coachOnboarded / totalCoaches) * 100) : 0,
      playerOnboardingRate: totalPlayers > 0 ? Math.round((playerOnboarded / totalPlayers) * 100) : 0,
      activeTeams: users.activeTeamCount,
      signupsByWeek,
      newUsersThisWeek: users.newUsersThisWeek,
      newUsersLastWeek: users.newUsersLastWeek,
      playersByOnboarding,
      playersByStatus,
      playersByYear,
    },
    growth: {
      userGrowthRate,
      roundGrowthRate,
      teamGrowthThisMonth: 0,
      churnedPlayers30d,
      retentionCohorts,
      avgRoundsPerActivePlayer,
      topFeatureByAdoption,
      npsProxy,
      platformHealthScore,
      platformHealthBreakdown,
    },
    usage: {
      roundsByType: roundsByTypeArr,
      roundsByWeek,
      totalShots: totalShotsCount,
      totalRounds: totalRoundsCount,
      avgShotsPerRound: totalRoundsCount > 0 ? Math.round(totalShotsCount / totalRoundsCount) : 0,
      featureAdoption: [
        { feature: 'Qualifiers', count: featureAdoption.qualifiers.total },
        { feature: 'Events', count: featureAdoption.events.total },
        { feature: 'Tasks', count: featureAdoption.tasks.total },
        { feature: 'Announcements', count: featureAdoption.announcements.total },
        { feature: 'Messages', count: featureAdoption.messages.total },
        { feature: 'Documents', count: featureAdoption.documents.total },
        { feature: 'Travel', count: featureAdoption.travel.total },
      ],
      roundsCompletionRate: totalRoundsCount > 0 ? Math.round((completedRoundsCount / totalRoundsCount) * 100) : 0,
      verifiedRoundsRate: totalRoundsCount > 0 ? Math.round((verifiedRoundsCount / totalRoundsCount) * 100) : 0,
    },
    coachhelm: {
      insightsByWeek,
      reviewsByWeek,
      modelPerformance: coachhelm.modelPerformance.map((m) => ({
        model_type: m.model_type,
        accuracy_rate: m.accuracy_rate,
        calibration_score: m.calibration_score,
        predictions_made: m.predictions_made,
      })),
      insightEffectiveness: coachhelm.insightEffectiveness.map((e) => ({
        insight_type: e.insight_type,
        action_rate: e.action_rate,
        improvement_rate: e.improvement_rate,
        effectiveness_score: e.effectiveness_score,
      })),
      totalPatternsDetected: coachhelm.totalPatterns,
      totalPredictionsMade: coachhelm.totalPredictions,
      totalReviewsAllTime: coachhelm.totalReviewsAllTime,
      avgInsightsPerGeneration: Math.round(avgInsightsPerGeneration * 10) / 10,
      coachPhilosophyAdoption: totalCoaches > 0 ? Math.round((philosophyCount / totalCoaches) * 100) : 0,
    },
    teams,
    scoring: {
      platformScoringAvg: platformAvgs.platformScoringAvg != null ? Math.round(platformAvgs.platformScoringAvg * 10) / 10 : null,
      platformFairwayPct: platformAvgs.platformFairwayPct != null ? Math.round(platformAvgs.platformFairwayPct * 10) / 10 : null,
      platformGirPct: platformAvgs.platformGirPct != null ? Math.round(platformAvgs.platformGirPct * 10) / 10 : null,
      platformPuttsPerRound: platformAvgs.platformPuttsPerRound != null ? Math.round(platformAvgs.platformPuttsPerRound * 10) / 10 : null,
      topPerformers,
      scoringDistribution,
      recentBestRounds,
    },
    engagement: {
      dailyActiveUsers,
      weeklyRetention: Math.round(weeklyRetention * 10) / 10,
      avgRoundsPerPlayer: Math.round(avgRoundsPerPlayer * 10) / 10,
      playersWithNoRounds,
      coachesUsingInsights: coachesUsingInsightsCount,
      eventAttendanceRate: eventAttendanceRate != null ? Math.round(eventAttendanceRate * 10) / 10 : null,
    },
    activity: {
      recentSignups: users.latestSignups.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        created_at: u.created_at,
      })),
      recentRounds,
      recentInsights: coachhelm.latestInsights.map((i) => ({
        id: i.id,
        insight_type: i.insight_type,
        insights_generated: i.insights_generated,
        created_at: i.created_at,
      })),
      recentAdminEvents: recentAdminEvents.slice(0, 20).map((event) => ({
        id: event.id,
        eventType: event.eventType,
        severity: event.severity,
        title: event.title,
        message: event.message,
        userEmail: event.userEmail,
        url: event.url,
        resolved: event.resolved,
        createdAt: event.createdAt,
      })),
      recentAuditEvents: auditLogData.slice(0, 20).map((event) => ({
        id: event.id,
        action: event.action,
        tableName: event.tableName,
        recordId: event.recordId,
        userEmail: event.userEmail,
        createdAt: event.createdAt,
      })),
    },
    userDirectory,
    teamRosters,
    signupsByDay: signupsByDayResult,
    visitsByDay: visitsByDayResult,
    funnel,
    dataQuality,
    userJourney: rollupC.userJourney,
    stickiness: rollupC.stickiness,
    playerEngagement: rollupC.playerEngagement,
    coachhelmRoi,
    errorLogs: {
      totalErrors7d,
      criticalErrors7d: criticalCount,
      incidentCounts,
      recentErrors,
      groupedIncidents,
      errorsByDay,
      bySeverity: errorSummary?.by_severity ?? [],
      topErrors: (errorSummary?.top_errors ?? []).map((e) => ({
        message: e.message,
        severity: e.severity,
        occurrences: e.occurrences,
        firstSeen: e.first_seen,
        lastSeen: e.last_seen,
        affectedUsers: e.affected_users,
      })),
      errorSummaryDegraded,
      adminEventSummaryDegraded,
    },
    auditLog: {
      totalEvents7d: rollupB.auditLog.totalEvents7d,
      recentEvents: auditLogData,
    },
    loginSecurity: rollupB.loginSecurity,
    baseball: rollupB.baseball,
    totalPlatformUsers: users.totalPlatformUsers,
    demoRequests: rollupB.demoRequests,
    golfCommunication: rollupB.golfCommunication,
    strokesGained: rollupB.strokesGained,
    statsCacheLastUpdated: rollupB.teams.statsCacheLastUpdated,
    needsAttention,
    userAuthDetails,
    cohortMatrix: rollupC.cohortMatrix,
    coachIntelligence: rollupC.coachIntelligence,
    playerFunnel: rollupC.playerFunnel,
    sessionHeatmap: rollupC.sessionHeatmap,
    infraHealth,
    freshnessAlerts: rollupC.freshnessAlerts,
    benchmarks: rollupC.benchmarks,
    adminEvents: adminEventsData,
    userActivity: rollupC.userActivity,
    errorDetection: errorDetectionData,
    bi: biData,
    errorSummaryDegraded,
    adminEventSummaryDegraded,
  };
}
