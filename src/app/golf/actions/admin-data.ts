'use server';

import { revalidatePath, unstable_cache } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// ============================================
// ADMIN DASHBOARD ROLLUP (single-call RPC)
// ============================================
//
// Caching pattern: auth + role check happens OUTSIDE the cache body (the
// server client needs request state). The cache body uses only the
// service-role client, which does not read request state — Next.js 16 forbids
// request helpers inside an unstable_cache body.
//
// The RPC itself also enforces admin-role via auth.uid() (migration 00004) so
// the cache can't leak admin data even if a non-admin ever reached it.

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

export const ADMIN_DASHBOARD_CACHE_TAG = 'admin-dashboard';

// Cached RPC-only function: uses the service-role client so no request state
// is read. The RPC itself enforces admin-only access via auth.uid() + role.
const cachedAdminDashboardData = unstable_cache(
  async (): Promise<AdminDashboardRollup> => {
    const admin = createAdminClient();
    const { data, error } = await (admin.rpc as unknown as (
      fn: 'get_admin_dashboard_rollup',
    ) => Promise<{ data: AdminDashboardRollup | null; error: unknown }>)(
      'get_admin_dashboard_rollup',
    );
    if (error) throw error instanceof Error ? error : new Error(String(error));
    if (!data) throw new Error('Empty rollup response');
    return data;
  },
  ['admin-dashboard-rollup'],
  { tags: [ADMIN_DASHBOARD_CACHE_TAG], revalidate: 60 },
);

/** Server-side entrypoint: admin check, then one RPC round-trip (cached 60s). */
export async function getAdminDashboardRollup(): Promise<AdminDashboardRollup> {
  // Auth check has to live OUTSIDE the cache — the server client reads
  // request state that the unstable_cache body forbids in Next.js 16. The
  // cache value is shared across all admin callers, which is correct: admin
  // data is not per-user-scoped.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: userRow } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (userRow?.role !== 'admin') throw new Error('Forbidden');

  return cachedAdminDashboardData();
}

/** Call from mutation paths that change admin-surfaced data (users, rounds,
 *  admin_events). Uses revalidatePath (the invalidation primitive the rest of
 *  the admin codebase uses); the 60s unstable_cache revalidate window is the
 *  background freshness floor. Currently not wired to any mutation — the 60s
 *  window is the only guarantee today. */
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

/** Lightweight version without JSONB metadata — used for display-only event lists */
interface AdminEventDisplayRecord {
  id: string;
  event_type: string;
  severity: string;
  title: string;
  message: string | null;
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

function weeksAgoMonday(weeksBack: number): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() + 1 - weeksBack * 7);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function todayStart(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function groupByWeek(dates: string[]): { week: string; count: number }[] {
  const weeks: Record<string, number> = {};
  for (const dateStr of dates) {
    const d = new Date(dateStr);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    const key = monday.toISOString().slice(0, 10);
    weeks[key] = (weeks[key] || 0) + 1;
  }
  return Object.entries(weeks)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, count]) => ({ week, count }));
}

function groupByDay(dates: string[], lastNDays: number): { date: string; count: number }[] {
  const days: Record<string, number> = {};
  // Initialize all days with 0
  for (let i = lastNDays - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days[d.toISOString().slice(0, 10)] = 0;
  }
  for (const dateStr of dates) {
    const key = new Date(dateStr).toISOString().slice(0, 10);
    if (key in days) {
      days[key] = (days[key] || 0) + 1;
    }
  }
  return Object.entries(days)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));
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
 * @deprecated Fires ~95 Supabase round-trips per call. New code should
 *   prefer `getAdminDashboardRollup()` (single JSONB RPC, tag-cached).
 *   This function is retained during the rollout so existing tabs that
 *   still expect the fully-nested `AdminDashboardData` shape keep working.
 *   Target removal: wave 3 of the perf remediation.
 */
export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const startTime = performance.now();
  const supabase = await createClient();

  // Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if ((userData?.role as string) !== 'admin') throw new Error('Forbidden');

  // Use admin client (service role) for all data queries — bypasses RLS
  const adminDb = createAdminClient();

  const ago24h = daysAgo(1);
  const ago7d = daysAgo(7);
  const ago14d = daysAgo(14);
  const ago30d = daysAgo(30);
  const ago12w = weeksAgoMonday(12);
  const today = todayStart();

  // ============================================
  // BATCH 1: Core counts & health (parallel)
  // ============================================
  const [
    // Health
    activeUsers24hRes,
    activeUsers7dRes,
    activeUsers30dRes,
    roundsThisWeekRes,
    reviewsThisWeekRes,
    insightsThisWeekRes,
    roundsTodayRes,
    lastRoundRes,
    lastInsightRes,
    // Users
    coachesRes,
    playersRes,
    adminsRes,
    coachOnboardedRes,
    playerOnboardedRes,
    activeTeamsRes,
    recentSignupsRes,
    newUsersThisWeekRes,
    newUsersLastWeekRes,
    playersByOnboardingRes,
    // Usage
    allRoundsRes,
    totalShotsRes,
    totalRoundsAllRes,
    completedRoundsRes,
    verifiedRoundsRes,
    qualifiersCountRes,
    eventsCountRes,
    tasksCountRes,
    announcementsCountRes,
    messagesCountRes,
    documentsCountRes,
    travelCountRes,
    // Feature adoption 30d
    qualifiers30dRes,
    events30dRes,
    tasks30dRes,
    announcements30dRes,
    messages30dRes,
    documents30dRes,
    travel30dRes,
    // CoachHelm
    modelPerfRes,
    insightEffRes,
    totalPatternsRes,
    totalPredictionsRes,
    totalReviewsRes,
    insightGenLogRes,
    coachPhilosophyRes,
    // CoachHelm 30d
    reviews30dRes,
    patterns30dRes,
    predictions30dRes,
    insightGenLog30dRes,
    // Activity
    latestSignupsRes,
    latestRoundsRes,
    latestInsightsRes,
    // Engagement
    dailyActiveRes,
    weeklyRetentionPlayerRes,
    playersWithNoRoundsRes,
    coachesUsingInsightsRes,
    attendanceSummaryRes,
    // Growth / Demographics
    playerStatusRes,
    playerYearRes,
    roundsLastWeekRes,
    teamsThisMonthRes,
    playersActive30dRes,
    playersActive30_60dRes,
    cohortWeek4Res,
    cohortWeek3Res,
    cohortWeek2Res,
    cohortWeek1Res,
    // New metrics
    shotsWithGpsRes,
    shotsWithLieTypeRes,
    shotsWithClubRes,
    reviewedRoundsRes,
    insightPlayerRoundsRes,
  ] = await Promise.all([
    // --- Health (active users = distinct players with rounds) ---
    adminDb.from('golf_rounds').select('player_id').gte('created_at', ago24h),
    adminDb.from('golf_rounds').select('player_id').gte('created_at', ago7d),
    adminDb.from('golf_rounds').select('player_id').gte('created_at', ago30d),
    adminDb.from('golf_rounds').select('id', { count: 'exact', head: true }).gte('created_at', ago7d),
    adminDb.from('golf_round_reviews').select('id', { count: 'exact', head: true }).gte('created_at', ago7d),
    adminDb.from('golf_insight_generation_log').select('id', { count: 'exact', head: true }).gte('created_at', ago7d),
    adminDb.from('golf_rounds').select('id', { count: 'exact', head: true }).gte('created_at', today),
    adminDb.from('golf_rounds').select('created_at').order('created_at', { ascending: false }).limit(1),
    adminDb.from('golf_insight_generation_log').select('created_at').order('created_at', { ascending: false }).limit(1),

    // --- Users ---
    adminDb.from('golf_coaches').select('id', { count: 'exact', head: true }),
    adminDb.from('golf_players').select('id', { count: 'exact', head: true }),
    adminDb.from('users').select('id', { count: 'exact', head: true }).filter('role', 'eq', 'admin'),
    adminDb.from('golf_coaches').select('id', { count: 'exact', head: true }).eq('onboarding_completed', true),
    adminDb.from('golf_players').select('id', { count: 'exact', head: true }).eq('onboarding_completed', true),
    adminDb.from('golf_team_members').select('team_id').eq('status', 'active'),
    adminDb.from('users').select('created_at').gte('created_at', ago12w).order('created_at', { ascending: true }),
    adminDb.from('users').select('id', { count: 'exact', head: true }).gte('created_at', ago7d),
    adminDb.from('users').select('id', { count: 'exact', head: true }).gte('created_at', ago14d).lt('created_at', ago7d),
    adminDb.from('golf_players').select('onboarding_completed'),

    // --- Usage ---
    adminDb.from('golf_rounds').select('round_type, created_at').gte('created_at', ago12w).order('created_at', { ascending: true }),
    adminDb.from('golf_shots').select('id', { count: 'exact', head: true }),
    adminDb.from('golf_rounds').select('id', { count: 'exact', head: true }),
    adminDb.from('golf_rounds').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
    adminDb.from('golf_rounds').select('id', { count: 'exact', head: true }).not('total_score', 'is', null),
    adminDb.from('golf_qualifiers').select('id', { count: 'exact', head: true }),
    adminDb.from('golf_events').select('id', { count: 'exact', head: true }),
    adminDb.from('golf_tasks').select('id', { count: 'exact', head: true }),
    adminDb.from('golf_announcements').select('id', { count: 'exact', head: true }),
    adminDb.from('golf_messages').select('id', { count: 'exact', head: true }),
    adminDb.from('golf_documents').select('id', { count: 'exact', head: true }),
    adminDb.from('golf_travel_itineraries').select('id', { count: 'exact', head: true }),
    // --- Feature adoption 30d counts ---
    adminDb.from('golf_qualifiers').select('id', { count: 'exact', head: true }).gte('created_at', ago30d),
    adminDb.from('golf_events').select('id', { count: 'exact', head: true }).gte('created_at', ago30d),
    adminDb.from('golf_tasks').select('id', { count: 'exact', head: true }).gte('created_at', ago30d),
    adminDb.from('golf_announcements').select('id', { count: 'exact', head: true }).gte('created_at', ago30d),
    adminDb.from('golf_messages').select('id', { count: 'exact', head: true }).gte('created_at', ago30d),
    adminDb.from('golf_documents').select('id', { count: 'exact', head: true }).gte('created_at', ago30d),
    adminDb.from('golf_travel_itineraries').select('id', { count: 'exact', head: true }).gte('created_at', ago30d),

    // --- CoachHelm ---
    adminDb.from('golf_prediction_model_performance').select('model_type, accuracy_rate, calibration_score, predictions_made').order('period_end', { ascending: false }).limit(10),
    adminDb.from('golf_insight_effectiveness').select('insight_type, action_rate, improvement_rate, effectiveness_score').order('period_end', { ascending: false }).limit(10),
    adminDb.from('golf_patterns_v2').select('id', { count: 'exact', head: true }),
    adminDb.from('golf_predictions').select('id', { count: 'exact', head: true }),
    adminDb.from('golf_round_reviews').select('id', { count: 'exact', head: true }),
    adminDb.from('golf_insight_generation_log').select('insights_generated, created_at').gte('created_at', ago12w).order('created_at', { ascending: true }),
    adminDb.from('golf_coach_philosophy').select('id', { count: 'exact', head: true }),
    // --- CoachHelm 30d counts ---
    adminDb.from('golf_round_reviews').select('id', { count: 'exact', head: true }).gte('created_at', ago30d),
    adminDb.from('golf_patterns_v2').select('id', { count: 'exact', head: true }).gte('created_at', ago30d),
    adminDb.from('golf_predictions').select('id', { count: 'exact', head: true }).gte('created_at', ago30d),
    adminDb.from('golf_insight_generation_log').select('insights_generated, created_at').gte('created_at', ago30d),

    // --- Activity ---
    adminDb.from('users').select('id, email, role, created_at').order('created_at', { ascending: false }).limit(10),
    adminDb.from('golf_rounds').select('id, total_score, score_to_par, round_type, course_name, created_at, golf_players(first_name, last_name)').order('created_at', { ascending: false }).limit(10),
    adminDb.from('golf_insight_generation_log').select('id, insight_type, insights_generated, created_at').order('created_at', { ascending: false }).limit(10),

    // --- Engagement ---
    adminDb.from('golf_rounds').select('created_at').gte('created_at', ago30d).order('created_at', { ascending: true }),
    adminDb.from('golf_rounds').select('player_id').gte('created_at', ago7d),
    adminDb.from('golf_players').select('id'),
    adminDb.from('golf_coach_insights').select('coach_id').gte('created_at', ago30d),
    adminDb.from('golf_attendance_summary').select('attendance_percentage'),
    // --- Growth / Demographics ---
    adminDb.from('golf_team_members').select('status, golf_players(graduation_year)').not('status', 'is', null),
    adminDb.from('golf_players').select('graduation_year'),
    adminDb.from('golf_rounds').select('id', { count: 'exact', head: true }).gte('created_at', ago14d).lt('created_at', ago7d),
    adminDb.from('golf_teams').select('id', { count: 'exact', head: true }).gte('created_at', ago30d),
    adminDb.from('golf_rounds').select('player_id').gte('created_at', ago30d),
    adminDb.from('golf_rounds').select('player_id').gte('created_at', daysAgo(60)).lt('created_at', ago30d),
    // Cohort retention: players who signed up in each of last 4 weeks
    adminDb.from('users').select('id, created_at').gte('created_at', daysAgo(28)).lte('created_at', daysAgo(21)),
    adminDb.from('users').select('id, created_at').gte('created_at', daysAgo(21)).lte('created_at', daysAgo(14)),
    adminDb.from('users').select('id, created_at').gte('created_at', daysAgo(14)).lte('created_at', daysAgo(7)),
    adminDb.from('users').select('id, created_at').gte('created_at', daysAgo(7)),
    // Shot data quality
    adminDb.from('golf_shots').select('id', { count: 'exact', head: true }).not('distance_to_hole_before', 'is', null),
    adminDb.from('golf_shots').select('id', { count: 'exact', head: true }).not('lie_before', 'is', null),
    adminDb.from('golf_shots').select('id', { count: 'exact', head: true }).not('club_type', 'is', null),
    // Unique reviewed rounds
    adminDb.from('golf_round_reviews').select('round_id'),
    // Rounds with insights
    adminDb.from('golf_insight_generation_log').select('player_id').not('player_id', 'is', null),
  ]);

  // ============================================
  // BATCH 2: Team & scoring intelligence (parallel)
  // ============================================
  const [
    teamsDataRes,
    teamMembersRes,
    teamRoundsRes,
    playerStatsRes,
    playerTeamMapRes,
    scoringDistRes,
    bestRoundsRes,
    insightsWeeklyRes,
    reviewsWeeklyRes,
    errorsRes,
    userToPlayerMapRes,
    platformHealthStatsRes,
    statsCacheLastUpdatedRes,
    coachOrgRes,
  ] = await Promise.all([
    // Teams with org
    adminDb.from('golf_teams').select('id, name, organization_id, organizations(name)'),
    // Team membership counts
    adminDb.from('golf_team_members').select('team_id, player_id, golf_players(first_name, last_name)').eq('status', 'active'),
    // Rounds per team this week
    adminDb.from('golf_rounds').select('player_id, team_id').gte('created_at', ago7d),
    // Player stats cache for platform averages and top performers
    adminDb.from('golf_player_stats_cache').select('player_id, scoring_average, driving_accuracy_percentage, gir_percentage, putts_per_round, rounds_played, golf_players(first_name, last_name)').not('scoring_average', 'is', null).order('scoring_average', { ascending: true }).limit(50),
    // Player-to-team mapping for team name resolution
    adminDb.from('golf_team_members').select('player_id, golf_teams(id, name)').eq('status', 'active'),
    // Scoring distribution
    adminDb.from('golf_rounds').select('total_score').not('total_score', 'is', null).eq('status', 'completed'),
    // Best recent rounds
    adminDb.from('golf_rounds').select('total_score, score_to_par, course_name, round_date, golf_players(first_name, last_name)').not('total_score', 'is', null).eq('status', 'completed').order('score_to_par', { ascending: true }).limit(5),
    // CoachHelm weekly
    adminDb.from('golf_insight_generation_log').select('created_at').gte('created_at', ago12w).order('created_at', { ascending: true }),
    adminDb.from('golf_round_reviews').select('created_at').gte('created_at', ago12w).order('created_at', { ascending: true }),
    // System errors
    adminDb.from('golf_insight_generation_log').select('id', { count: 'exact', head: true }).gte('created_at', ago7d).eq('insights_generated', 0),
    // User ID to Player ID mapping (for cohort retention)
    adminDb.from('golf_players').select('id, user_id'),
    // Real platform health stats from auth sessions + DB metrics
    (async () => {
      try {
        return await adminDb.rpc('get_platform_health_stats' as never) as unknown as { data: PlatformHealthStatsResult | null; error: unknown };
      } catch {
        return { data: null, error: null } as { data: PlatformHealthStatsResult | null; error: unknown };
      }
    })(),
    // Cache freshness check for golf_player_stats_cache
    adminDb.from('golf_player_stats_cache').select('updated_at').order('updated_at', { ascending: false }).limit(1),
    // Coach org mapping (for team coach counts)
    adminDb.from('golf_coaches').select('organization_id'),
  ]);

  // ============================================
  // PROCESS DATA
  // ============================================

  // --- Stats cache freshness ---
  const statsCacheLastUpdated: string | null =
    (statsCacheLastUpdatedRes.data as { updated_at: string }[] | null)?.[0]?.updated_at ?? null;

  // --- Signups by week ---
  const signupsByWeek = groupByWeek(
    (recentSignupsRes.data ?? []).map((u) => u.created_at).filter(Boolean) as string[]
  );

  // --- Rounds processing ---
  const roundsData = allRoundsRes.data ?? [];
  const roundsByType: Record<string, number> = {};
  const roundDates: string[] = [];
  for (const r of roundsData) {
    const t = r.round_type || 'unknown';
    roundsByType[t] = (roundsByType[t] || 0) + 1;
    if (r.created_at) roundDates.push(r.created_at);
  }
  const roundsByWeek = groupByWeek(roundDates);

  // --- Active teams ---
  const teamIds = new Set((activeTeamsRes.data ?? []).map((m) => m.team_id));

  // --- Usage stats ---
  const totalRoundsCount = totalRoundsAllRes.count ?? 0;
  const totalShotsCount = totalShotsRes.count ?? 0;
  const completedRoundsCount = completedRoundsRes.count ?? 0;
  const verifiedRoundsCount = verifiedRoundsRes.count ?? 0;
  const totalCoaches = coachesRes.count ?? 0;
  const totalPlayers = playersRes.count ?? 0;
  const coachOnboarded = coachOnboardedRes.count ?? 0;
  const playerOnboarded = playerOnboardedRes.count ?? 0;

  // --- Players by onboarding ---
  const playerOnboardingData = playersByOnboardingRes.data ?? [];
  const onboarded = playerOnboardingData.filter((p) => p.onboarding_completed).length;
  const notOnboarded = playerOnboardingData.length - onboarded;
  const playersByOnboarding = [
    { status: 'Onboarded', count: onboarded },
    { status: 'Pending', count: notOnboarded },
  ].filter((s) => s.count > 0);

  // --- CoachHelm weekly ---
  const insightsByWeek = groupByWeek(
    (insightsWeeklyRes.data ?? []).map((r) => r.created_at).filter(Boolean) as string[]
  );
  const reviewsByWeek = groupByWeek(
    (reviewsWeeklyRes.data ?? []).map((r) => r.created_at).filter(Boolean) as string[]
  );

  // --- CoachHelm stats ---
  const insightGenRows = insightGenLogRes.data ?? [];
  const totalInsightsGenerated = insightGenRows.reduce((s, r) => s + (r.insights_generated ?? 0), 0);
  const avgInsightsPerGeneration = insightGenRows.length > 0 ? totalInsightsGenerated / insightGenRows.length : 0;

  // --- Scoring distribution ---
  const scoreBuckets: Record<string, number> = {
    'Under 70': 0,
    '70-74': 0,
    '75-79': 0,
    '80-84': 0,
    '85-89': 0,
    '90+': 0,
  };
  for (const r of (scoringDistRes.data ?? [])) {
    const s = r.total_score as number;
    if (s < 70) scoreBuckets['Under 70'] = (scoreBuckets['Under 70'] ?? 0) + 1;
    else if (s < 75) scoreBuckets['70-74'] = (scoreBuckets['70-74'] ?? 0) + 1;
    else if (s < 80) scoreBuckets['75-79'] = (scoreBuckets['75-79'] ?? 0) + 1;
    else if (s < 85) scoreBuckets['80-84'] = (scoreBuckets['80-84'] ?? 0) + 1;
    else if (s < 90) scoreBuckets['85-89'] = (scoreBuckets['85-89'] ?? 0) + 1;
    else scoreBuckets['90+'] = (scoreBuckets['90+'] ?? 0) + 1;
  }
  const scoringDistribution = Object.entries(scoreBuckets).map(([bucket, count]) => ({ bucket, count }));

  // --- Platform averages from player stats cache ---
  const statsRows = playerStatsRes.data ?? [];
  const validScoring = statsRows.filter((r) => r.scoring_average != null);
  const platformScoringAvg = validScoring.length > 0
    ? validScoring.reduce((s, r) => s + Number(r.scoring_average), 0) / validScoring.length
    : null;
  const validFwy = statsRows.filter((r) => r.driving_accuracy_percentage != null);
  const platformFairwayPct = validFwy.length > 0
    ? validFwy.reduce((s, r) => s + Number(r.driving_accuracy_percentage), 0) / validFwy.length
    : null;
  const validGir = statsRows.filter((r) => r.gir_percentage != null);
  const platformGirPct = validGir.length > 0
    ? validGir.reduce((s, r) => s + Number(r.gir_percentage), 0) / validGir.length
    : null;
  const validPutts = statsRows.filter((r) => r.putts_per_round != null);
  const platformPuttsPerRound = validPutts.length > 0
    ? validPutts.reduce((s, r) => s + Number(r.putts_per_round), 0) / validPutts.length
    : null;

  // --- Player-to-team name map ---
  const playerTeamNameMap = new Map<string, string>();
  for (const m of (playerTeamMapRes.data ?? [])) {
    const team = m.golf_teams as { id: string; name: string } | null;
    if (team) {
      playerTeamNameMap.set(m.player_id, team.name);
    }
  }

  // --- Top performers ---
  const topPerformers = validScoring.slice(0, 10).map((r) => {
    const player = r.golf_players as { first_name: string; last_name: string } | null;
    return {
      name: player ? `${player.first_name} ${player.last_name}` : 'Unknown',
      teamName: playerTeamNameMap.get(r.player_id) ?? null,
      scoringAvg: Number(r.scoring_average),
      roundsPlayed: (r.rounds_played as number | null) ?? 0,
    };
  });

  // --- Best recent rounds ---
  const recentBestRounds = (bestRoundsRes.data ?? []).map((r) => {
    const player = r.golf_players as { first_name: string; last_name: string } | null;
    return {
      playerName: player ? `${player.first_name} ${player.last_name}` : 'Unknown',
      courseName: r.course_name,
      score: r.total_score as number,
      toPar: r.score_to_par as number,
      date: r.round_date,
    };
  });

  // --- Team intelligence ---
  const teamsMap = new Map<string, { name: string; orgName: string | null }>();
  for (const t of (teamsDataRes.data ?? [])) {
    const org = t.organizations as { name: string } | null;
    teamsMap.set(t.id, { name: t.name, orgName: org?.name ?? null });
  }

  // Count players per team
  const teamPlayerCounts: Record<string, number> = {};
  for (const m of (teamMembersRes.data ?? [])) {
    teamPlayerCounts[m.team_id] = (teamPlayerCounts[m.team_id] || 0) + 1;
  }

  // Count coaches per team (coaches are linked via organization, not directly via team_id)
  const teamCoachCounts: Record<string, number> = {};
  const orgCoachCounts: Record<string, number> = {};
  for (const c of (coachOrgRes.data ?? [])) {
    if (c.organization_id) {
      orgCoachCounts[c.organization_id] = (orgCoachCounts[c.organization_id] || 0) + 1;
    }
  }
  // Map org counts to teams
  for (const t of (teamsDataRes.data ?? [])) {
    if (t.organization_id && orgCoachCounts[t.organization_id]) {
      teamCoachCounts[t.id] = orgCoachCounts[t.organization_id] ?? 0;
    }
  }

  // Rounds per team this week (rounds have team_id directly)
  const teamRoundCounts: Record<string, number> = {};
  for (const r of (teamRoundsRes.data ?? [])) {
    if (r.team_id) {
      teamRoundCounts[r.team_id] = (teamRoundCounts[r.team_id] || 0) + 1;
    }
  }

  // Build player_id -> team_id map from team members
  const playerToTeamId = new Map<string, string>();
  for (const m of (playerTeamMapRes.data ?? [])) {
    const team = m.golf_teams as { id: string; name: string } | null;
    if (team) {
      playerToTeamId.set(m.player_id, team.id);
    }
  }

  // Avg score per team from stats cache
  const teamAvgScores: Record<string, number[]> = {};
  const teamTopPlayer: Record<string, { name: string; avg: number }> = {};
  for (const r of statsRows) {
    const player = r.golf_players as { first_name: string; last_name: string } | null;
    const teamId = playerToTeamId.get(r.player_id);
    if (teamId && r.scoring_average != null) {
      if (!teamAvgScores[teamId]) teamAvgScores[teamId] = [];
      teamAvgScores[teamId]!.push(Number(r.scoring_average));
      // Track top player per team (lowest scoring avg)
      if (!teamTopPlayer[teamId] || Number(r.scoring_average) < teamTopPlayer[teamId]!.avg) {
        teamTopPlayer[teamId] = {
          name: player ? `${player.first_name} ${player.last_name}` : 'Unknown',
          avg: Number(r.scoring_average),
        };
      }
    }
  }

  const teams = Array.from(teamsMap.entries()).map(([id, t]) => {
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
  }).sort((a, b) => b.playerCount - a.playerCount);

  // --- Engagement ---
  const dailyActiveDates = (dailyActiveRes.data ?? []).map((r) => r.created_at).filter(Boolean) as string[];
  const dailyActiveUsers = groupByDay(dailyActiveDates, 30);

  // Weekly retention: players who submitted rounds this week vs last week
  const playersThisWeek = new Set((weeklyRetentionPlayerRes.data ?? []).map((r) => r.player_id));
  const activePlayers = (playersWithNoRoundsRes.data ?? []).map((r) => r.id);
  const playersWithNoRounds = activePlayers.filter((id) => !playersThisWeek.has(id)).length;

  const avgRoundsPerPlayer = totalPlayers > 0 ? totalRoundsCount / totalPlayers : 0;
  // Weekly retention: players active this week out of players active in last 30d
  const playersActiveLast30d = new Set((activeUsers30dRes.data ?? []).map(r => r.player_id));
  const activeDenominator = playersActiveLast30d.size || 1;
  const weeklyRetention = (playersThisWeek.size / activeDenominator) * 100;

  const coachIdsUsingInsights = new Set((coachesUsingInsightsRes.data ?? []).map((r) => r.coach_id));
  const attendanceSummaries = attendanceSummaryRes.data ?? [];
  const eventAttendanceRate = attendanceSummaries.length > 0
    ? attendanceSummaries.reduce((s, r) => s + Number(r.attendance_percentage ?? 0), 0) / attendanceSummaries.length
    : null;

  // --- Onboarding rate (needed for growth calculations below) ---
  const avgOnboarding = (coachOnboarded + playerOnboarded) / Math.max(totalCoaches + totalPlayers, 1) * 100;

  // --- Player demographics ---
  const playerStatusData = (playerStatusRes.data ?? []) as { status: string; golf_players: { graduation_year: number | null } | null }[];
  const statusCounts: Record<string, number> = {};
  for (const p of playerStatusData) {
    const s = p.status || 'unknown';
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }
  const playersByStatus = Object.entries(statusCounts).map(([status, count]) => ({ status, count })).filter(s => s.count > 0);

  const playerYearData = (playerYearRes.data ?? []) as { graduation_year: number | null }[];
  const yearCounts: Record<string, number> = {};
  for (const p of playerYearData) {
    const y = p.graduation_year ? String(p.graduation_year) : 'unknown';
    yearCounts[y] = (yearCounts[y] || 0) + 1;
  }
  const playersByYear = Object.entries(yearCounts).map(([year, count]) => ({ year, count })).filter(y => y.count > 0);

  // --- Growth metrics ---
  const roundsLastWeekCount = roundsLastWeekRes.count ?? 0;
  const roundsThisWeekCount = roundsThisWeekRes.count ?? 0;
  const userGrowthRate = (newUsersLastWeekRes.count ?? 0) > 0
    ? Math.round((((newUsersThisWeekRes.count ?? 0) - (newUsersLastWeekRes.count ?? 0)) / (newUsersLastWeekRes.count ?? 1)) * 100)
    : (newUsersThisWeekRes.count ?? 0) > 0 ? 100 : 0;
  const roundGrowthRate = roundsLastWeekCount > 0
    ? Math.round(((roundsThisWeekCount - roundsLastWeekCount) / roundsLastWeekCount) * 100)
    : roundsThisWeekCount > 0 ? 100 : 0;

  // Build user_id -> player_id mapping for cohort retention
  const userIdToPlayerId = new Map<string, string>();
  for (const p of (userToPlayerMapRes.data ?? [])) {
    if (p.user_id) userIdToPlayerId.set(p.user_id, p.id);
  }

  // Churned players: active 30-60d ago but NOT in last 30d
  const playersActive30d = new Set((playersActive30dRes.data ?? []).map(r => r.player_id));
  const playersActive30_60d = new Set((playersActive30_60dRes.data ?? []).map(r => r.player_id));
  const churnedPlayers30d = [...playersActive30_60d].filter(id => !playersActive30d.has(id)).length;

  // Cohort retention: for each week's signups, how many submitted a round?
  // Map user IDs to player IDs since golf_rounds.player_id = golf_players.id, not users.id
  const allPlayerRounds7d = new Set((weeklyRetentionPlayerRes.data ?? []).map(r => r.player_id));
  const cohortWeeks = [cohortWeek4Res, cohortWeek3Res, cohortWeek2Res, cohortWeek1Res];
  const retentionCohorts = cohortWeeks.map((cohortRes, i) => {
    const cohortUsers = (cohortRes.data ?? []).map(u => u.id);
    const retained = cohortUsers.filter(userId => {
      const playerId = userIdToPlayerId.get(userId);
      return playerId && allPlayerRounds7d.has(playerId);
    }).length;
    return {
      week: i + 1,
      retained,
      total: cohortUsers.length,
      rate: cohortUsers.length > 0 ? Math.round((retained / cohortUsers.length) * 100) : 0,
    };
  });

  // Active players for per-active metrics
  const activePlayerCount = playersActive30d.size || 1;
  const avgRoundsPerActivePlayer = Math.round((roundsThisWeekCount * 4 / activePlayerCount) * 10) / 10;

  // Top feature by adoption
  const featureAdoptionList = [
    { feature: 'Qualifiers', count: qualifiersCountRes.count ?? 0 },
    { feature: 'Events', count: eventsCountRes.count ?? 0 },
    { feature: 'Tasks', count: tasksCountRes.count ?? 0 },
    { feature: 'Announcements', count: announcementsCountRes.count ?? 0 },
    { feature: 'Messages', count: messagesCountRes.count ?? 0 },
    { feature: 'Documents', count: documentsCountRes.count ?? 0 },
    { feature: 'Travel', count: travelCountRes.count ?? 0 },
  ];
  const topFeatureByAdoption = featureAdoptionList.sort((a, b) => b.count - a.count)[0]?.feature ?? 'None';

  // NPS Proxy: coaches who have BOTH philosophy set AND used insights
  const philosophyCount = coachPhilosophyRes.count ?? 0;
  const npsProxy = totalCoaches > 0 ? Math.round((Math.min(philosophyCount, coachIdsUsingInsights.size) / totalCoaches) * 100) : 0;

  // Platform Health Score (0-100)
  const healthScores = [
    Math.min(avgOnboarding, 100),
    Math.min(weeklyRetention * 2, 100),
    Math.min(npsProxy * 1.5, 100),
    Math.min(completedRoundsCount / Math.max(totalRoundsCount, 1) * 100, 100),
  ];
  const platformHealthScore = Math.round(healthScores.reduce((s, v) => s + v, 0) / healthScores.length);

  // --- Format recent rounds ---
  const recentRounds = (latestRoundsRes.data ?? []).map((r) => {
    const player = r.golf_players as { first_name: string; last_name: string } | null;
    return {
      id: r.id,
      player_name: player ? `${player.first_name} ${player.last_name}` : 'Unknown',
      course_name: r.course_name,
      total_score: r.total_score,
      total_to_par: r.score_to_par,
      round_type: r.round_type,
      created_at: r.created_at,
    };
  });

  // --- Platform health stats from auth sessions + DB ---
  const phs = (platformHealthStatsRes.data ?? null) as PlatformHealthStatsResult | null;
  const realActiveUsers1h = phs?.active_users_1h ?? 0;
  const realActiveUsers24h = phs?.active_users_24h ?? 0;
  const realActiveUsers7d = phs?.active_users_7d ?? 0;
  const realActiveUsers30d = phs?.active_users_30d ?? 0;

  // --- Diagnostics ---
  // Measure cumulative server-side fetch time (all batches so far)
  const responseTime = Math.round(performance.now() - startTime);
  const lastRoundTimestamp = (lastRoundRes.data?.[0]?.created_at as string) ?? null;
  const lastInsightTimestamp = (lastInsightRes.data?.[0]?.created_at as string) ?? null;
  const systemErrors = errorsRes.count ?? 0;

  const diagnostics: AdminDashboardData['health']['diagnostics'] = [];

  // Auth / session health
  diagnostics.push({
    label: 'Auth Sessions',
    status: (phs?.active_sessions ?? 0) > 0 ? 'healthy' : 'warning',
    detail: `${phs?.active_sessions ?? 0} active sessions · ${realActiveUsers1h} online now`,
  });

  // Data freshness check
  if (lastRoundTimestamp) {
    const hoursSinceRound = (Date.now() - new Date(lastRoundTimestamp).getTime()) / 3600000;
    diagnostics.push({
      label: 'Round Submissions',
      status: hoursSinceRound < 24 ? 'healthy' : hoursSinceRound < 72 ? 'warning' : 'critical',
      detail: hoursSinceRound < 1 ? 'Active in last hour' : `Last round ${Math.round(hoursSinceRound)}h ago`,
    });
  } else {
    diagnostics.push({ label: 'Round Submissions', status: 'critical', detail: 'No rounds ever submitted' });
  }

  // AI health
  diagnostics.push({
    label: 'CoachHelm AI',
    status: systemErrors === 0 ? 'healthy' : systemErrors < 5 ? 'warning' : 'critical',
    detail: systemErrors === 0 ? 'All systems operational' : `${systemErrors} failed generations (7d)`,
  });

  // Onboarding health
  diagnostics.push({
    label: 'Onboarding',
    status: avgOnboarding > 70 ? 'healthy' : avgOnboarding > 40 ? 'warning' : 'critical',
    detail: `${Math.round(avgOnboarding)}% completion rate`,
  });

  // Engagement health
  diagnostics.push({
    label: 'Player Engagement',
    status: weeklyRetention > 30 ? 'healthy' : weeklyRetention > 10 ? 'warning' : 'critical',
    detail: `${Math.round(weeklyRetention)}% weekly active rate`,
  });

  // Database health
  const dbSizeMB = Math.round((phs?.db_size_bytes ?? 0) / 1048576);
  const totalConns = (phs?.active_connections ?? 0) + (phs?.idle_connections ?? 0);
  diagnostics.push({
    label: 'Database',
    status: dbSizeMB < 400 && totalConns < 50 ? 'healthy' : dbSizeMB < 800 ? 'warning' : 'critical',
    detail: `${dbSizeMB} MB · ${totalConns} connections`,
  });

  // responseTime now reflects the real server-side query duration (all batches).

  const dataFreshness: AdminDashboardData['health']['dataFreshness'] = lastRoundTimestamp
    ? (Date.now() - new Date(lastRoundTimestamp).getTime()) < 86400000 ? 'live' : 'stale'
    : 'error';

  // ============================================
  // BATCH 3: User directory, team rosters, daily charts
  // ============================================
  const [
    allUsersRes,
    allPlayersDetailRes,
    allCoachesDetailRes,
    playerRoundCountsRes,
    playerLastRoundsRes,
    signupsDaily30dRes,
    visitsDaily30dRes,
    userLastActiveRes,
    aiCoachPhilosophyRes,
  ] = await Promise.all([
    // All users for directory
    adminDb.from('users').select('id, email, role, created_at, last_seen').order('created_at', { ascending: false }),
    // All players with user_id, names, onboarding, grad year
    adminDb.from('golf_players').select('id, user_id, first_name, last_name, graduation_year, onboarding_completed'),
    // All coaches with user_id, names, org
    adminDb.from('golf_coaches').select('id, user_id, full_name, email, organization_id, onboarding_completed'),
    // Round counts per player
    adminDb.from('golf_rounds').select('player_id'),
    // Latest round date per player (get all rounds, process in JS)
    adminDb.from('golf_rounds').select('player_id, created_at').order('created_at', { ascending: false }),
    // Signups by day (last 30d)
    adminDb.from('users').select('created_at').gte('created_at', ago30d).order('created_at', { ascending: true }),
    // Active users by day (last 30d, based on round submissions)
    adminDb.from('golf_rounds').select('player_id, created_at').gte('created_at', ago30d).order('created_at', { ascending: true }),
    // User auth details (last_sign_in_at from auth.users via RPC)
    adminDb.rpc('get_users_with_auth' as never) as unknown as { data: { id: string; last_sign_in_at: string | null; last_seen: string | null }[] | null; error: unknown },
    // Coach philosophy IDs (for CoachHelm ROI comparison)
    adminDb.from('golf_coach_philosophy').select('coach_id'),
  ]);

  // --- Build player maps ---
  const allPlayersMap = new Map<string, { id: string; userId: string | null; firstName: string; lastName: string; gradYear: number | null; onboardingCompleted: boolean }>();
  for (const p of (allPlayersDetailRes.data ?? [])) {
    allPlayersMap.set(p.id, {
      id: p.id,
      userId: p.user_id,
      firstName: p.first_name ?? '',
      lastName: p.last_name ?? '',
      gradYear: p.graduation_year,
      onboardingCompleted: p.onboarding_completed ?? false,
    });
  }

  // Build userId -> player map
  const userIdToPlayerDetail = new Map<string, typeof allPlayersMap extends Map<string, infer V> ? V : never>();
  for (const [, p] of allPlayersMap) {
    if (p.userId) userIdToPlayerDetail.set(p.userId, p);
  }

  // --- Build coach maps ---
  const allCoachesMap = new Map<string, { id: string; userId: string | null; firstName: string; lastName: string; orgId: string | null; onboardingCompleted: boolean }>();
  for (const c of (allCoachesDetailRes.data ?? [])) {
    const nameParts = (c.full_name ?? '').split(' ');
    const coachFirstName = nameParts[0] ?? '';
    const coachLastName = nameParts.slice(1).join(' ') ?? '';
    allCoachesMap.set(c.id, {
      id: c.id,
      userId: c.user_id,
      firstName: coachFirstName,
      lastName: coachLastName,
      orgId: c.organization_id,
      onboardingCompleted: c.onboarding_completed ?? false,
    });
  }
  const userIdToCoachDetail = new Map<string, typeof allCoachesMap extends Map<string, infer V> ? V : never>();
  for (const [, c] of allCoachesMap) {
    if (c.userId) userIdToCoachDetail.set(c.userId, c);
  }

  // --- Round counts + last round per player ---
  const playerRoundCounts = new Map<string, number>();
  for (const r of (playerRoundCountsRes.data ?? [])) {
    playerRoundCounts.set(r.player_id, (playerRoundCounts.get(r.player_id) ?? 0) + 1);
  }
  const playerLastRound = new Map<string, string>();
  for (const r of (playerLastRoundsRes.data ?? [])) {
    if (r.created_at && !playerLastRound.has(r.player_id)) {
      playerLastRound.set(r.player_id, r.created_at);
    }
  }

  // --- User auth details map (last_sign_in_at + last_seen from RPC) ---
  const userAuthDetailsMap = new Map<string, { lastSignInAt: string | null; lastSeen: string | null }>();
  for (const row of (userLastActiveRes.data ?? [])) {
    userAuthDetailsMap.set(row.id, {
      lastSignInAt: row.last_sign_in_at ?? null,
      lastSeen: row.last_seen ?? null,
    });
  }
  // Build last-active map for user directory (prefer last_seen, fallback to last_sign_in)
  const userLastActive = new Map<string, string>();
  for (const [uid, details] of userAuthDetailsMap) {
    const ts = details.lastSeen ?? details.lastSignInAt;
    if (ts) userLastActive.set(uid, ts);
  }

  // --- Player to team map (already have teamMembersRes from batch 2) ---
  const playerToTeamInfo = new Map<string, { teamId: string; teamName: string }>();
  for (const m of (teamMembersRes.data ?? [])) {
    // teamMembersRes has team_id + player_id
    const teamInfo = teamsMap.get(m.team_id);
    if (teamInfo) {
      playerToTeamInfo.set(m.player_id, { teamId: m.team_id, teamName: teamInfo.name });
    }
  }

  // --- Build user directory ---
  const userDirectory = (allUsersRes.data ?? []).map((u) => {
    const player = userIdToPlayerDetail.get(u.id);
    const coach = userIdToCoachDetail.get(u.id);
    const playerId = player?.id;
    const teamInfo = playerId ? playerToTeamInfo.get(playerId) : null;
    // For coaches, find their team via org
    let coachTeamName: string | null = null;
    let coachTeamId: string | null = null;
    if (coach?.orgId) {
      for (const [tId, tInfo] of teamsMap) {
        // Match by checking teamsDataRes for org match
        const teamData = (teamsDataRes.data ?? []).find(t => t.id === tId && t.organization_id === coach.orgId);
        if (teamData) {
          coachTeamName = tInfo.name;
          coachTeamId = tId;
          break;
        }
      }
    }

    return {
      id: u.id,
      email: u.email,
      role: u.role,
      createdAt: u.created_at,
      firstName: player?.firstName ?? coach?.firstName ?? null,
      lastName: player?.lastName ?? coach?.lastName ?? null,
      teamName: teamInfo?.teamName ?? coachTeamName ?? null,
      teamId: teamInfo?.teamId ?? coachTeamId ?? null,
      lastRoundDate: playerId ? (playerLastRound.get(playerId) ?? null) : null,
      lastActiveAt: userLastActive.get(u.id) ?? null,
      totalRounds: playerId ? (playerRoundCounts.get(playerId) ?? 0) : 0,
      onboardingCompleted: player?.onboardingCompleted ?? coach?.onboardingCompleted ?? false,
    };
  });

  // --- Build team rosters ---
  // Build org -> coaches map
  const orgCoaches = new Map<string, { id: string; firstName: string; lastName: string; email: string }[]>();
  for (const [, c] of allCoachesMap) {
    if (c.orgId) {
      const list = orgCoaches.get(c.orgId) ?? [];
      // Find email from users
      const userEntry = (allUsersRes.data ?? []).find(u => u.id === c.userId);
      list.push({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: userEntry?.email ?? '',
      });
      orgCoaches.set(c.orgId, list);
    }
  }

  const teamRosters = (teamsDataRes.data ?? []).map((t) => {
    const org = t.organizations as { name: string } | null;
    // Get players on this team
    const teamMembers = (teamMembersRes.data ?? []).filter(m => m.team_id === t.id);
    const players = teamMembers.map((m) => {
      const p = allPlayersMap.get(m.player_id);
      const userEntry = p?.userId ? (allUsersRes.data ?? []).find(u => u.id === p.userId) : null;
      const statsEntry = statsRows.find(s => s.player_id === m.player_id);
      return {
        id: m.player_id,
        firstName: p?.firstName ?? '',
        lastName: p?.lastName ?? '',
        email: userEntry?.email ?? null,
        gradYear: p?.gradYear ?? null,
        lastRoundDate: playerLastRound.get(m.player_id) ?? null,
        totalRounds: playerRoundCounts.get(m.player_id) ?? 0,
        scoringAvg: statsEntry?.scoring_average != null ? Number(statsEntry.scoring_average) : null,
        onboardingCompleted: p?.onboardingCompleted ?? false,
      };
    }).sort((a, b) => (a.scoringAvg ?? 999) - (b.scoringAvg ?? 999));

    // Get coaches for this team's org
    const coaches = t.organization_id ? (orgCoaches.get(t.organization_id) ?? []) : [];

    return {
      id: t.id,
      name: t.name,
      orgName: org?.name ?? null,
      coaches,
      players,
    };
  }).sort((a, b) => b.players.length - a.players.length);

  // --- Daily signups (last 30d) ---
  const signupDailyDates = (signupsDaily30dRes.data ?? []).map(u => u.created_at).filter(Boolean) as string[];
  const signupsByDayResult = groupByDay(signupDailyDates, 30);

  // --- Daily visits (last 30d, unique players per day) ---
  const visitsByDayMap: Record<string, Set<string>> = {};
  // Initialize all days
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    visitsByDayMap[d.toISOString().slice(0, 10)] = new Set();
  }
  for (const r of (visitsDaily30dRes.data ?? [])) {
    if (r.created_at) {
      const key = new Date(r.created_at).toISOString().slice(0, 10);
      if (key in visitsByDayMap) {
        visitsByDayMap[key]!.add(r.player_id);
      }
    }
  }
  const visitsByDayResult = Object.entries(visitsByDayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, players]) => ({ date, count: players.size }));

  // --- Funnel ---
  const uniqueReviewedRounds = new Set((reviewedRoundsRes.data ?? []).map(r => r.round_id)).size;
  const uniqueInsightPlayers = new Set((insightPlayerRoundsRes.data ?? []).map(r => r.player_id)).size;
  const funnel = {
    roundsStarted: totalRoundsCount,
    roundsCompleted: completedRoundsCount,
    roundsWithScore: verifiedRoundsCount,
    roundsReviewed: uniqueReviewedRounds,
    roundsWithInsights: uniqueInsightPlayers, // players who had insights generated
  };

  // --- Data Quality ---
  const shotsWithDistance = shotsWithGpsRes.count ?? 0;
  const shotsWithLie = shotsWithLieTypeRes.count ?? 0;
  const shotsWithClub = shotsWithClubRes.count ?? 0;
  const dataQuality = {
    totalShots: totalShotsCount,
    shotsWithDistance,
    shotsWithLie,
    shotsWithClub,
    distancePercentage: totalShotsCount > 0 ? Math.round((shotsWithDistance / totalShotsCount) * 100) : 0,
    liePercentage: totalShotsCount > 0 ? Math.round((shotsWithLie / totalShotsCount) * 100) : 0,
    clubPercentage: totalShotsCount > 0 ? Math.round((shotsWithClub / totalShotsCount) * 100) : 0,
  };

  // --- User Journey ---
  const allPlayerIds = new Set((playerRoundCountsRes.data ?? []).map(r => r.player_id));
  const userJourney = {
    totalSignups: (allUsersRes.data ?? []).length,
    completedOnboarding: onboarded + coachOnboarded,
    submittedFirstRound: allPlayerIds.size,
    activeThisWeek: playersThisWeek.size,
  };

  // --- Stickiness ---
  const dauCount = new Set((activeUsers24hRes.data ?? []).map(r => r.player_id)).size;
  const wauCount = playersThisWeek.size;
  const mauCount = playersActiveLast30d.size;
  const stickiness = {
    dauMauRatio: mauCount > 0 ? Math.round((dauCount / mauCount) * 100) : 0,
    dau: dauCount,
    wau: wauCount,
    mau: mauCount,
  };

  // --- Player Engagement Segments ---
  // High = 3+ rounds in last 7 days, Medium = 1-2 rounds in last 7d, Low = active in 30d but not 7d, Dormant = no rounds in 30d
  const playerRoundsThisWeek = new Map<string, number>();
  for (const r of (weeklyRetentionPlayerRes.data ?? [])) {
    playerRoundsThisWeek.set(r.player_id, (playerRoundsThisWeek.get(r.player_id) ?? 0) + 1);
  }
  let highEngagement = 0;
  let mediumEngagement = 0;
  let lowEngagement = 0;
  let dormant = 0;
  for (const [, p] of allPlayersMap) {
    const weeklyRounds = playerRoundsThisWeek.get(p.id) ?? 0;
    const isActive30d = playersActive30d.has(p.id);
    if (weeklyRounds >= 3) highEngagement++;
    else if (weeklyRounds >= 1) mediumEngagement++;
    else if (isActive30d) lowEngagement++;
    else dormant++;
  }
  const playerEngagement = {
    highEngagement,
    mediumEngagement,
    lowEngagement,
    dormant,
    segments: [
      { label: 'High (3+/wk)', count: highEngagement, color: '#16A34A' },
      { label: 'Medium (1-2/wk)', count: mediumEngagement, color: '#2563EB' },
      { label: 'Low (monthly)', count: lowEngagement, color: '#F59E0B' },
      { label: 'Dormant', count: dormant, color: '#9CA3AF' },
    ],
  };

  // --- CoachHelm ROI ---
  // Find coaches who have set up philosophy
  // Use orgCoachCounts and teamsMap to determine which teams have AI coaches
  // Simpler approach: philosophy count vs total coaches, use team-level avg scores
  const aiCoachCount = coachPhilosophyRes.count ?? 0;
  const nonAiCoachCount = Math.max(totalCoaches - aiCoachCount, 0);

  // ============================================
  // BATCH 4: Error logs, audit log, login security, baseball (parallel)
  // ============================================
  const [
    errorLogsRecentRes,
    errorLogs7dCountRes,
    errorLogsCriticalRes,
    errorSummaryRes,
    auditLogRecentRes,
    auditLog7dCountRes,
    loginAttemptsRes,
    lockedAccountsRes,
    // Baseball
    bbPlayersRes,
    bbCoachesRes,
    bbWatchlistRes,
    bbVideos30dRes,
    bbEngagement30dRes,
    bbMessages30dRes,
    bbConversations30dRes,
    bbPlayersOnboardedRes,
    bbCoachesOnboardedRes,
    bbTeamsRes,
    bbEventsRes,
    bbCampsRes,
    bbRecruitingActivatedRes,
    // New: Demo requests, notifications, golf communication, strokes gained
    demoRequestsAllRes,
    demoRequestsPendingRes,
    demoRequestsRecentRes,
    golfAnnouncementsAllRes,
    golfAnnouncementAcksRes,
    golfMessagesAllRes,
    golfConversationsAllRes,
    strokesGainedRes,
    totalPlatformUsersRes,
    // Admin events (new real-time event tracking)
    adminEventsRecentRes,
    adminEventsSummaryRes,
    adminEventsUnresolvedCriticalRes,
    adminEventsErrorOnlyRes,
  ] = await Promise.all([
    // Error logs: recent entries (limit 500 — incident grouping needs broader window)
    adminDb.from('error_logs').select('id, message, severity, stack, url, user_id, context, created_at').order('created_at', { ascending: false }).limit(500),
    // Error logs: 7d count
    adminDb.from('error_logs').select('id', { count: 'exact', head: true }).gte('created_at', ago7d),
    // Error logs: critical 7d
    adminDb.from('error_logs').select('id', { count: 'exact', head: true }).gte('created_at', ago7d).eq('severity', 'critical'),
    // Error summary from RPC (wrapped for resilience)
    (async () => {
      try {
        const result = await (adminDb.rpc as unknown as (fn: string, params: Record<string, number>) => PromiseLike<{ data: unknown }>)('get_error_summary', { days_back: 7 });
        return result as unknown as { data: { by_severity: { severity: string; count: number }[]; top_errors: { message: string; severity: string; occurrences: number; first_seen: string; last_seen: string; affected_users: number }[]; daily_rate: { day: string; count: number }[]; total_count: number; critical_count: number } | null; error: unknown };
      } catch {
        return { data: null, error: null };
      }
    })(),
    // Audit log: recent entries via RPC (wrapped for resilience)
    (async () => {
      try {
        const result = await (adminDb.rpc as unknown as (fn: string, params: Record<string, number>) => PromiseLike<{ data: unknown }>)('get_audit_log_recent', { limit_count: 50 });
        return result as unknown as { data: { id: string; user_id: string | null; user_email: string | null; action: string; table_name: string | null; record_id: string | null; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null; created_at: string }[] | null; error: unknown };
      } catch {
        return { data: null, error: null };
      }
    })(),
    // Audit log: 7d count
    adminDb.from('audit_log').select('id', { count: 'exact', head: true }).gte('created_at', ago7d),
    // Login attempts
    adminDb.from('login_attempts').select('email, failed_attempts, last_attempt, locked_until').order('last_attempt', { ascending: false }).limit(20),
    // Locked accounts
    adminDb.from('login_attempts').select('id', { count: 'exact', head: true }).gte('locked_until', new Date().toISOString()),
    // Baseball data
    adminDb.from('baseball_players').select('id', { count: 'exact', head: true }),
    adminDb.from('baseball_coaches').select('id', { count: 'exact', head: true }),
    adminDb.from('baseball_watchlists').select('pipeline_stage'),
    adminDb.from('baseball_videos').select('id', { count: 'exact', head: true }).gte('created_at', ago30d),
    adminDb.from('baseball_player_engagement_events').select('id', { count: 'exact', head: true }).gte('created_at', ago30d),
    adminDb.from('baseball_messages').select('id', { count: 'exact', head: true }).gte('created_at', ago30d),
    adminDb.from('baseball_conversations').select('id', { count: 'exact', head: true }).gte('created_at', ago30d),
    adminDb.from('baseball_players').select('id', { count: 'exact', head: true }).eq('onboarding_completed', true),
    adminDb.from('baseball_coaches').select('id', { count: 'exact', head: true }).eq('onboarding_completed', true),
    adminDb.from('baseball_teams').select('id', { count: 'exact', head: true }),
    adminDb.from('baseball_events').select('id', { count: 'exact', head: true }),
    adminDb.from('baseball_camps').select('id', { count: 'exact', head: true }),
    adminDb.from('baseball_players').select('id', { count: 'exact', head: true }).eq('recruiting_activated', true),
    // Demo requests
    adminDb.from('demo_requests').select('id', { count: 'exact', head: true }),
    adminDb.from('demo_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    adminDb.from('demo_requests').select('name, email, organization, interest_type, status, created_at').order('created_at', { ascending: false }).limit(10),
    // Golf communication
    adminDb.from('golf_announcements').select('id', { count: 'exact', head: true }),
    adminDb.from('golf_announcement_acknowledgements').select('id', { count: 'exact', head: true }),
    adminDb.from('golf_messages').select('id', { count: 'exact', head: true }),
    adminDb.from('golf_conversations').select('id', { count: 'exact', head: true }),
    // Strokes gained from stats cache
    adminDb.from('golf_player_stats_cache').select('strokes_gained_total, strokes_gained_tee, strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting').not('strokes_gained_total', 'is', null),
    // Total platform users (source of truth)
    adminDb.from('users').select('id', { count: 'exact', head: true }),
    // Admin events: recent entries for display (no metadata — saves bandwidth on JSONB column)
    adminDb.from('admin_events').select('id, event_type, severity, title, message, user_id, user_email, url, resolved, resolved_at, resolved_by, created_at').order('created_at', { ascending: false }).limit(500),
    // Admin events: summary via RPC (wrapped in try-catch for resilience)
    (async () => {
      try {
        const result = await (adminDb.rpc as unknown as (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)('get_admin_event_summary', { p_days_back: 7 });
        return result as unknown as { data: { total_events: number; error_count: number; critical_count: number; unresolved_count: number; events_by_type: Record<string, number>; events_by_severity: Record<string, number>; events_by_day: { date: string; count: number }[] } | null; error: unknown };
      } catch {
        // RPC function may not exist yet, return empty result
        return { data: null, error: null };
      }
    })(),
    // Admin events: unresolved critical
    adminDb.from('admin_events').select('id, event_type, title, message, created_at').eq('resolved', false).in('severity', ['critical', 'error']).order('created_at', { ascending: false }).limit(20),
    // Admin events: error-type only with metadata (for incident key building — much smaller result set)
    adminDb.from('admin_events').select('id, event_type, severity, title, message, metadata, user_id, user_email, url, resolved, resolved_at, resolved_by, created_at').eq('event_type', 'error').order('created_at', { ascending: false }).limit(500),
  ]);

  // --- Process error logs ---
  const errorEmailMap = new Map<string, string>();
  for (const u of (allUsersRes.data ?? [])) {
    errorEmailMap.set(u.id, u.email);
  }

  const errorSummaryRaw = (errorSummaryRes.data ?? null) as {
    by_severity: { severity: string; count: number }[];
    top_errors: { message: string; severity: string; occurrences: number; first_seen: string; last_seen: string; affected_users: number }[];
    daily_rate: { day: string; count: number }[];
    total_count: number;
    critical_count: number;
  } | null;

  const rawErrorLogs = (errorLogsRecentRes.data ?? []) as {
    id: string;
    message: string;
    severity: string | null;
    stack: string | null;
    url: string | null;
    user_id: string | null;
    context: Record<string, unknown> | null;
    created_at: string | null;
  }[];

  // Track whether RPC fallback was used
  const errorSummaryDegraded = errorSummaryRaw === null;

  // Fallback: calculate error summary from raw error logs if RPC failed
  const errorSummary = errorSummaryRaw ?? (() => {
    // Group errors by message for top_errors
    const errorGroups = new Map<string, { message: string; severity: string; count: number; firstSeen: string; lastSeen: string; userIds: Set<string | null> }>();
    const severityCounts = new Map<string, number>();
    const dailyCounts = new Map<string, number>();
    
    for (const e of rawErrorLogs) {
      const msg = e.message;
      const sev = e.severity ?? 'error';
      const created = e.created_at ?? new Date().toISOString();
      const day = new Date(created).toISOString().slice(0, 10);
      
      // Group by message
      const existing = errorGroups.get(msg);
      if (existing) {
        existing.count++;
        if (created < existing.firstSeen) existing.firstSeen = created;
        if (created > existing.lastSeen) existing.lastSeen = created;
        if (e.user_id) existing.userIds.add(e.user_id);
      } else {
        errorGroups.set(msg, { message: msg, severity: sev, count: 1, firstSeen: created, lastSeen: created, userIds: new Set(e.user_id ? [e.user_id] : []) });
      }
      
      // Count by severity
      severityCounts.set(sev, (severityCounts.get(sev) ?? 0) + 1);
      
      // Count by day
      dailyCounts.set(day, (dailyCounts.get(day) ?? 0) + 1);
    }
    
    return {
      by_severity: Array.from(severityCounts.entries()).map(([severity, count]) => ({ severity, count })),
      top_errors: Array.from(errorGroups.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 20)
        .map(e => ({
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

  const errorsByDay = (errorSummary?.daily_rate ?? []).map((d) => ({
    date: new Date(d.day).toISOString().slice(0, 10),
    count: d.count,
  }));

  // --- Process audit log ---
  const auditLogData = ((auditLogRecentRes.data ?? []) as {
    id: string; user_id: string | null; user_email: string | null; action: string;
    table_name: string | null; record_id: string | null;
    old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null;
    created_at: string;
  }[]).map((a) => ({
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

  // --- Process login security ---
  const loginAttempts = (loginAttemptsRes.data ?? []).map((l) => ({
    email: l.email,
    failedAttempts: l.failed_attempts ?? 0,
    lastAttempt: l.last_attempt,
    lockedUntil: l.locked_until,
  }));
  const failedLogins7d = loginAttempts.reduce((s, l) => s + l.failedAttempts, 0);

  // --- Process admin events ---
  const rawAdminEvents = (adminEventsRecentRes.data ?? []) as AdminEventDisplayRecord[];

  const adminEventSummaryRaw = (adminEventsSummaryRes.data ?? null) as {
    total_events: number;
    error_count: number;
    critical_count: number;
    unresolved_count: number;
    events_by_type: Record<string, number>;
    events_by_severity: Record<string, number>;
    events_by_day: { date: string; count: number }[];
  } | null;

  // Track whether RPC fallback was used
  const adminEventSummaryDegraded = adminEventSummaryRaw === null;

  // Fallback: calculate admin event summary from raw events if RPC failed
  const adminEventSummary = adminEventSummaryRaw ?? (() => {
    const eventsByType: Record<string, number> = {};
    const eventsBySeverity: Record<string, number> = {};
    const eventsByDay = new Map<string, number>();
    let errorCount = 0;
    let criticalCount = 0;
    let unresolvedCount = 0;
    
    for (const e of rawAdminEvents) {
      eventsByType[e.event_type] = (eventsByType[e.event_type] ?? 0) + 1;
      eventsBySeverity[e.severity] = (eventsBySeverity[e.severity] ?? 0) + 1;
      const day = new Date(e.created_at).toISOString().slice(0, 10);
      eventsByDay.set(day, (eventsByDay.get(day) ?? 0) + 1);
      if (e.severity === 'error') errorCount++;
      if (e.severity === 'critical') criticalCount++;
      if (!e.resolved) unresolvedCount++;
    }
    
    return {
      total_events: rawAdminEvents.length,
      error_count: errorCount,
      critical_count: criticalCount,
      unresolved_count: unresolvedCount,
      events_by_type: eventsByType,
      events_by_severity: eventsBySeverity,
      events_by_day: Array.from(eventsByDay.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count })),
    };
  })();

  // Use the error-only query result (with metadata) for incident key building
  const rawAdminErrorEvents = (adminEventsErrorOnlyRes.data ?? []) as AdminEventIncidentRecord[];

  // Track the latest unresolved event timestamp per incident key (not just presence)
  const latestUnresolvedEventTs = new Map<string, number>();
  const resolvedIncidentMeta = new Map<string, AdminEventIncidentResolution>();
  for (const event of rawAdminErrorEvents) {
    const incidentKey = buildAdminEventIncidentKey(event);
    if (!event.resolved) {
      const eventTs = new Date(event.created_at).getTime();
      const currentMax = latestUnresolvedEventTs.get(incidentKey) ?? -1;
      if (eventTs > currentMax) {
        latestUnresolvedEventTs.set(incidentKey, eventTs);
      }
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
    latestRow: typeof rawErrorLogs[number];
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
      // 5-second tolerance for cross-table timestamp differences
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
    (dataQuality.distancePercentage + dataQuality.liePercentage + dataQuality.clubPercentage) / 3
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
    status: recentErrors.some((incident) => incident.featureArea === 'Stats Cache' && incident.status === 'open')
      ? 'critical'
      : recentErrors.some((incident) => incident.featureArea === 'Stats Cache' && incident.status === 'active')
        ? 'warning'
        : 'healthy',
    detail: recentErrors.some((incident) => incident.featureArea === 'Stats Cache' && incident.status === 'open')
      ? 'Open cache/stats incidents detected'
      : recentErrors.some((incident) => incident.featureArea === 'Stats Cache' && incident.status === 'active')
        ? 'Recent cache repair failures detected'
        : 'No live cache/stats incidents',
  });

  const recentAdminEvents = rawAdminEvents.map((e) => ({
    id: e.id,
    eventType: e.event_type,
    severity: e.severity,
    title: e.title,
    message: e.message,
    userId: e.user_id,
    userEmail: e.user_email ?? (e.user_id ? (errorEmailMap.get(e.user_id) ?? null) : null),
    url: e.url,
    resolved: e.resolved,
    createdAt: e.created_at,
  }));

  const unresolvedCriticalEvents = ((adminEventsUnresolvedCriticalRes.data ?? []) as {
    id: string;
    event_type: string;
    title: string;
    message: string | null;
    created_at: string;
  }[]).map((e) => ({
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

  // --- Process baseball data ---
  const watchlistStages: Record<string, number> = {};
  for (const w of (bbWatchlistRes.data ?? [])) {
    const stage = (w.pipeline_stage as string) || 'unknown';
    watchlistStages[stage] = (watchlistStages[stage] || 0) + 1;
  }
  const commitments = watchlistStages['committed'] ?? 0;

  // --- Build needs-attention items ---
  const needsAttention: AdminDashboardData['needsAttention'] = [];

  // Players stuck in onboarding > 7 days
  const stuckInOnboarding = (allUsersRes.data ?? []).filter((u) => {
    if (!u.created_at) return false;
    const daysSinceSignup = (Date.now() - new Date(u.created_at).getTime()) / 86400000;
    const player = userIdToPlayerDetail.get(u.id);
    return daysSinceSignup > 7 && player && !player.onboardingCompleted;
  });
  if (stuckInOnboarding.length > 0) {
    needsAttention.push({
      label: `${stuckInOnboarding.length} player${stuckInOnboarding.length > 1 ? 's' : ''} stuck in onboarding > 7 days`,
      severity: 'warning',
      detail: 'Consider sending a reminder or checking for onboarding UX issues',
      tab: 'people',
    });
  }

  // Coaches inactive > 14 days
  const inactiveCoaches = (allUsersRes.data ?? []).filter((u) => {
    if (u.role !== 'coach') return false;
    const lastActive = userLastActive.get(u.id);
    if (!lastActive) return true;
    return (Date.now() - new Date(lastActive).getTime()) / 86400000 > 14;
  });
  if (inactiveCoaches.length > 0) {
    needsAttention.push({
      label: `${inactiveCoaches.length} coach${inactiveCoaches.length > 1 ? 'es' : ''} inactive 14+ days`,
      severity: 'warning',
      detail: 'These coaches have not logged in recently and may need outreach',
      tab: 'people',
    });
  }

  // Critical errors — only alert on UNRESOLVED critical incidents
  const criticalCount = errorLogsCriticalRes.count ?? 0;
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

  // Error count > 10 — only warn if there are unresolved incidents
  const totalErrors7d = errorLogs7dCountRes.count ?? 0;
  const hasUnresolvedIncidents = incidentCounts.open > 0 || incidentCounts.active > 0;
  if (totalErrors7d > 10 && unresolvedCriticalCount === 0 && hasUnresolvedIncidents) {
    needsAttention.push({
      label: `${totalErrors7d} errors logged (${incidentCounts.open + incidentCounts.active} unresolved)`,
      severity: 'warning',
      detail: 'Unresolved incidents need review in System tab',
      tab: 'system',
    });
  }

  // Locked accounts
  const lockedAccountCount = lockedAccountsRes.count ?? 0;
  if (lockedAccountCount > 0) {
    needsAttention.push({
      label: `${lockedAccountCount} locked account${lockedAccountCount > 1 ? 's' : ''}`,
      severity: 'warning',
      detail: 'Users locked out due to failed login attempts — unlock in People tab',
      tab: 'people',
    });
  }

  // Coaches stuck in onboarding > 7 days
  const stuckCoachesOnboarding = (allUsersRes.data ?? []).filter((u) => {
    if (!u.created_at) return false;
    const daysSinceSignup = (Date.now() - new Date(u.created_at).getTime()) / 86400000;
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

  // Pending demo requests
  const pendingDemoCount = demoRequestsPendingRes.count ?? 0;
  if (pendingDemoCount > 0) {
    needsAttention.push({
      label: `${pendingDemoCount} pending demo request${pendingDemoCount > 1 ? 's' : ''}`,
      severity: 'info',
      detail: 'New inbound leads waiting for follow-up',
      tab: 'bi',
    });
  }

  // Positive signals (new users, all-clear) are intentionally omitted from alerts.
  // The overview KPI cards already surface growth data; alerts should only show
  // items that require action.

  // --- Process strokes gained averages ---
  const sgRows = strokesGainedRes.data ?? [];
  const sgTotal = sgRows.length > 0 ? sgRows.reduce((s, r) => s + Number(r.strokes_gained_total ?? 0), 0) / sgRows.length : null;
  const sgTee = sgRows.length > 0 ? sgRows.reduce((s, r) => s + Number(r.strokes_gained_tee ?? 0), 0) / sgRows.length : null;
  const sgApproach = sgRows.length > 0 ? sgRows.reduce((s, r) => s + Number(r.strokes_gained_approach ?? 0), 0) / sgRows.length : null;
  const sgAroundGreen = sgRows.length > 0 ? sgRows.reduce((s, r) => s + Number(r.strokes_gained_around_green ?? 0), 0) / sgRows.length : null;
  const sgPutting = sgRows.length > 0 ? sgRows.reduce((s, r) => s + Number(r.strokes_gained_putting ?? 0), 0) / sgRows.length : null;

  // --- Process golf communication metrics ---
  const totalAnnouncementsCount = golfAnnouncementsAllRes.count ?? 0;
  const totalAckCount = golfAnnouncementAcksRes.count ?? 0;
  // Ack rate: approximate by total acknowledgements / (announcements * avg team size)
  // Simple approximation: if we have announcements and acks, ackRate = acks / announcements
  const announcementAckRate = totalAnnouncementsCount > 0 ? Math.round((totalAckCount / totalAnnouncementsCount) * 10) / 10 : null;

  // --- Process demo requests ---
  const demoRequestsRecent = (demoRequestsRecentRes.data ?? []).map((d) => ({
    name: (d.name as string) ?? '',
    email: (d.email as string) ?? '',
    organization: (d.organization as string | null) ?? null,
    interestType: (d.interest_type as string | null) ?? null,
    status: (d.status as string) ?? 'pending',
    createdAt: (d.created_at as string) ?? new Date().toISOString(),
  }));

  // --- CoachHelm ROI: proper AI vs non-AI comparison ---
  // Get coaches who HAVE philosophy set (AI-using coaches)
  const aiCoachIds = new Set((aiCoachPhilosophyRes.data ?? []).map(c => c.coach_id));

  // Map coach_id -> org_id to find which teams use AI
  const aiOrgIds = new Set<string>();
  const nonAiOrgIds = new Set<string>();
  for (const c of (coachOrgRes.data ?? [])) {
    if (c.organization_id) {
      // Check if this coach has philosophy
      const coachEntry = [...allCoachesMap.values()].find(cm => cm.orgId === c.organization_id);
      if (coachEntry && aiCoachIds.has(coachEntry.id)) {
        aiOrgIds.add(c.organization_id);
      } else if (coachEntry) {
        nonAiOrgIds.add(c.organization_id);
      }
    }
  }

  // Get team IDs for AI vs non-AI orgs
  const aiTeamIds = new Set<string>();
  const nonAiTeamIds = new Set<string>();
  for (const t of (teamsDataRes.data ?? [])) {
    if (t.organization_id && aiOrgIds.has(t.organization_id)) aiTeamIds.add(t.id);
    else if (t.organization_id && nonAiOrgIds.has(t.organization_id)) nonAiTeamIds.add(t.id);
  }

  // Get avg scores for players on AI teams vs non-AI teams
  const aiPlayerScores: number[] = [];
  const nonAiPlayerScores: number[] = [];
  for (const r of statsRows) {
    if (r.scoring_average == null) continue;
    const tid = playerToTeamId.get(r.player_id);
    if (tid && aiTeamIds.has(tid)) aiPlayerScores.push(Number(r.scoring_average));
    else if (tid && nonAiTeamIds.has(tid)) nonAiPlayerScores.push(Number(r.scoring_average));
  }

  const avgScoreAI = aiPlayerScores.length > 0 ? aiPlayerScores.reduce((a, b) => a + b, 0) / aiPlayerScores.length : null;
  const avgScoreNonAI = nonAiPlayerScores.length > 0 ? nonAiPlayerScores.reduce((a, b) => a + b, 0) / nonAiPlayerScores.length : null;

  const updatedCoachhelmRoi = {
    coachesUsingAI: aiCoachCount,
    coachesNotUsingAI: nonAiCoachCount,
    avgScoreAICoachPlayers: avgScoreAI ? Math.round(avgScoreAI * 10) / 10 : null,
    avgScoreNonAICoachPlayers: avgScoreNonAI ? Math.round(avgScoreNonAI * 10) / 10 : null,
    scoreDifference: avgScoreAI != null && avgScoreNonAI != null ? Math.round((avgScoreNonAI - avgScoreAI) * 10) / 10 : null,
  };

  // --- Build user auth details for UI ---
  const userAuthDetails = Array.from(userAuthDetailsMap.entries()).map(([uid, d]) => ({
    userId: uid,
    lastSignInAt: d.lastSignInAt,
    lastSeen: d.lastSeen,
  }));

  // ============================================
  // BATCH 5: Enhanced analytics — new components
  // ============================================
  type AnalyticsEvent = { event_type: string; page_path: string | null; feature_name: string | null; session_id: string | null; user_id: string | null; created_at: string; duration_ms: number | null };
  type CoachInsightRow = { coach_id: string; created_at: string };
  type CoachReviewRow = { published_by: string | null; round_id: string; created_at: string; golf_rounds: { player_id: string; created_at: string } | null };

  type PlayerInsightRow = { player_id: string; insights_generated: number | null };
  type TeamSeasonRow = { id: string; season: string | null };
  type AdminEventErrorRow = { id: string; event_type: string; severity: string; resolved: boolean; created_at: string };

  const [
    analyticsEventsRes,
    coachInsightsViewedRes,
    coachRoundReviewsRes,
    roundsWithDatesRes,
    // NEW: for userActivity + errorDetection
    playerInsightsPerPlayerRes,
    teamSeasonsRes,
    errors24hCountRes,
    adminEventsErrorsRes,
  ] = await Promise.all([
    // Session heatmap: analytics events (last 7d) — table not in generated types
    adminDb.from('admin_analytics_events' as never).select('event_type, page_path, feature_name, session_id, user_id, created_at, duration_ms').gte('created_at', ago7d) as unknown as { data: AnalyticsEvent[] | null; error: unknown },
    // Coach intelligence: insights viewed per coach
    adminDb.from('golf_coach_insights').select('coach_id, created_at') as unknown as { data: CoachInsightRow[] | null; error: unknown },
    // Coach intelligence: round reviews per coach (with timing)
    adminDb.from('golf_round_reviews').select('published_by, round_id, created_at, golf_rounds(player_id, created_at)') as unknown as { data: CoachReviewRow[] | null; error: unknown },
    // For cohort retention + benchmarks: all rounds with player + date
    adminDb.from('golf_rounds').select('player_id, created_at, team_id').order('created_at', { ascending: false }),
    // NEW: Insights per player (for userActivity team member detail)
    adminDb.from('golf_insight_generation_log').select('player_id, insights_generated').not('player_id', 'is', null) as unknown as { data: PlayerInsightRow[] | null; error: unknown },
    // NEW: Team seasons
    adminDb.from('golf_teams').select('id, season') as unknown as { data: TeamSeasonRow[] | null; error: unknown },
    // NEW: Error count in last 24h
    adminDb.from('error_logs').select('id', { count: 'exact', head: true }).gte('created_at', ago24h),
    // NEW: Admin events with error/critical severity (for error detection)
    adminDb.from('admin_events').select('id, event_type, severity, resolved, created_at').in('severity', ['error', 'critical']) as unknown as { data: AdminEventErrorRow[] | null; error: unknown },
  ]);

  // --- SESSION HEATMAP ---
  const analyticsEvents = analyticsEventsRes.data ?? [];
  const pageViewMap = new Map<string, { viewCount: number; users: Set<string> }>();
  const featureUseMap = new Map<string, { useCount: number; users: Set<string> }>();
  const sessionPagesMap = new Map<string, number>();
  const sessionDurations = new Map<string, { min: number; max: number }>();

  for (const ev of analyticsEvents) {
    if (ev.event_type === 'page_view' && ev.page_path) {
      const entry = pageViewMap.get(ev.page_path) ?? { viewCount: 0, users: new Set<string>() };
      entry.viewCount++;
      if (ev.user_id) entry.users.add(ev.user_id);
      pageViewMap.set(ev.page_path, entry);
      // Session pages count
      if (ev.session_id) {
        sessionPagesMap.set(ev.session_id, (sessionPagesMap.get(ev.session_id) ?? 0) + 1);
      }
    }
    if (ev.event_type === 'feature_use' && ev.feature_name) {
      const entry = featureUseMap.get(ev.feature_name) ?? { useCount: 0, users: new Set<string>() };
      entry.useCount++;
      if (ev.user_id) entry.users.add(ev.user_id);
      featureUseMap.set(ev.feature_name, entry);
    }
    // Track session duration
    if (ev.session_id && ev.created_at) {
      const ts = new Date(ev.created_at).getTime();
      const dur = sessionDurations.get(ev.session_id);
      if (!dur) sessionDurations.set(ev.session_id, { min: ts, max: ts });
      else {
        dur.min = Math.min(dur.min, ts);
        dur.max = Math.max(dur.max, ts);
      }
    }
  }

  const pageViews = [...pageViewMap.entries()]
    .map(([pagePath, d]) => ({ pagePath, viewCount: d.viewCount, uniqueUsers: d.users.size }))
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, 20);

  const featureUsage = [...featureUseMap.entries()]
    .map(([featureName, d]) => ({ featureName, useCount: d.useCount, uniqueUsers: d.users.size }))
    .sort((a, b) => b.useCount - a.useCount)
    .slice(0, 20);

  const totalSessions7d = sessionPagesMap.size;
  const totalPageViews7d = analyticsEvents.filter(e => e.event_type === 'page_view').length;
  const avgPagesPerSession = totalSessions7d > 0 ? totalPageViews7d / totalSessions7d : 0;
  const sessionDurValues = [...sessionDurations.values()].map(d => (d.max - d.min) / 60000).filter(d => d > 0);
  const avgSessionDurationMin = sessionDurValues.length > 0 ? sessionDurValues.reduce((a, b) => a + b, 0) / sessionDurValues.length : 0;

  // Dead features: tracked features with < 5% of max usage
  const maxFeatureUsers = Math.max(...[...featureUseMap.values()].map(f => f.users.size), 1);
  const deadFeatures = [...featureUseMap.entries()]
    .filter(([, d]) => d.users.size / maxFeatureUsers < 0.05)
    .map(([name]) => name);

  const sessionHeatmap: AdminDashboardData['sessionHeatmap'] = {
    pageViews,
    featureUsage,
    sessionStats: {
      avgPagesPerSession: Math.round(avgPagesPerSession * 10) / 10,
      avgSessionDurationMin: Math.round(avgSessionDurationMin * 10) / 10,
      totalSessions7d,
      totalPageViews7d,
    },
    deadFeatures,
  };

  // --- COHORT RETENTION MATRIX ---
  // Build 8-week cohorts: for each signup week, track % active at week 0..8
  const allRoundsForCohort = roundsWithDatesRes.data ?? [];
  const playerRoundWeeks = new Map<string, Set<string>>(); // player_id -> Set of week keys
  for (const r of allRoundsForCohort) {
    if (!r.created_at || !r.player_id) continue;
    const d = new Date(r.created_at);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    const weekKey = monday.toISOString().slice(0, 10);
    const set = playerRoundWeeks.get(r.player_id) ?? new Set();
    set.add(weekKey);
    playerRoundWeeks.set(r.player_id, set);
  }

  const cohortMatrix: AdminDashboardData['cohortMatrix'] = [];
  for (let weeksBack = 8; weeksBack >= 1; weeksBack--) {
    const cohortStart = new Date();
    cohortStart.setDate(cohortStart.getDate() - cohortStart.getDay() + 1 - weeksBack * 7);
    cohortStart.setHours(0, 0, 0, 0);
    const cohortEnd = new Date(cohortStart);
    cohortEnd.setDate(cohortEnd.getDate() + 7);
    const cohortWeek = cohortStart.toISOString().slice(0, 10);

    // Find users who signed up in this week
    const cohortUsers = (allUsersRes.data ?? []).filter(u => {
      if (!u.created_at) return false;
      const ts = new Date(u.created_at);
      return ts >= cohortStart && ts < cohortEnd;
    });
    const cohortPlayerIds = cohortUsers.map(u => userIdToPlayerId.get(u.id)).filter(Boolean) as string[];
    const cohortSize = cohortUsers.length;
    if (cohortSize === 0) continue;

    const retentionByWeek: number[] = [];
    for (let weekOffset = 0; weekOffset <= 8; weekOffset++) {
      const targetWeekStart = new Date(cohortStart);
      targetWeekStart.setDate(targetWeekStart.getDate() + weekOffset * 7);
      if (targetWeekStart > new Date()) break; // future week

      const targetWeekKey = targetWeekStart.toISOString().slice(0, 10);
      const activeInWeek = cohortPlayerIds.filter(pid => {
        const weeks = playerRoundWeeks.get(pid);
        return weeks?.has(targetWeekKey);
      }).length;
      retentionByWeek.push(cohortSize > 0 ? Math.round((activeInWeek / cohortSize) * 100) : 0);
    }

    cohortMatrix.push({ cohortWeek, cohortSize, retentionByWeek });
  }

  // --- COACH INTELLIGENCE ---
  const coachInsightsViewed = coachInsightsViewedRes.data ?? [];
  const coachInsightCounts = new Map<string, number>();
  const coachLastInsightAt = new Map<string, string>();
  for (const ci of coachInsightsViewed) {
    if (!ci.coach_id) continue;
    coachInsightCounts.set(ci.coach_id, (coachInsightCounts.get(ci.coach_id) ?? 0) + 1);
    const existing = coachLastInsightAt.get(ci.coach_id);
    if (!existing || (ci.created_at && ci.created_at > existing)) {
      coachLastInsightAt.set(ci.coach_id, ci.created_at);
    }
  }

  const coachReviewsData = coachRoundReviewsRes.data ?? [];
  const coachReviewCounts = new Map<string, number>();
  const coachResponseTimes = new Map<string, number[]>();
  for (const cr of coachReviewsData) {
    if (!cr.published_by) continue;
    coachReviewCounts.set(cr.published_by, (coachReviewCounts.get(cr.published_by) ?? 0) + 1);
    // Calculate response time: review created_at - round created_at
    const round = cr.golf_rounds as { player_id: string; created_at: string } | null;
    if (round?.created_at && cr.created_at) {
      const diffHours = (new Date(cr.created_at).getTime() - new Date(round.created_at).getTime()) / 3600000;
      if (diffHours >= 0 && diffHours < 720) { // cap at 30 days
        const times = coachResponseTimes.get(cr.published_by) ?? [];
        times.push(diffHours);
        coachResponseTimes.set(cr.published_by, times);
      }
    }
  }

  // Build coach -> total player rounds map
  const coachPlayerRoundsMap = new Map<string, number>();
  for (const [, c] of allCoachesMap) {
    if (!c.orgId) continue;
    // Find teams for this coach's org
    for (const t of (teamsDataRes.data ?? [])) {
      if (t.organization_id === c.orgId) {
        // Count rounds from players on this team
        const teamPlayerIds = (teamMembersRes.data ?? []).filter(m => m.team_id === t.id).map(m => m.player_id);
        let totalPlayerRounds = 0;
        for (const pid of teamPlayerIds) {
          totalPlayerRounds += playerRoundCounts.get(pid) ?? 0;
        }
        coachPlayerRoundsMap.set(c.id, (coachPlayerRoundsMap.get(c.id) ?? 0) + totalPlayerRounds);
      }
    }
  }

  const coachIntelligence: AdminDashboardData['coachIntelligence'] = [];
  for (const [, c] of allCoachesMap) {
    const reviewed = coachReviewCounts.get(c.id) ?? 0;
    const totalPlayerRounds = coachPlayerRoundsMap.get(c.id) ?? 0;
    const responseTimes = coachResponseTimes.get(c.id);
    const avgRespTime = responseTimes && responseTimes.length > 0
      ? Math.round((responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) * 10) / 10
      : null;

    // Find team name for this coach
    let coachTeam: string | null = null;
    if (c.orgId) {
      for (const t of (teamsDataRes.data ?? [])) {
        if (t.organization_id === c.orgId) {
          const info = teamsMap.get(t.id);
          if (info) coachTeam = info.name;
          break;
        }
      }
    }

    // Player count for this coach's teams
    let coachPlayerCount = 0;
    if (c.orgId) {
      for (const t of (teamsDataRes.data ?? [])) {
        if (t.organization_id === c.orgId) {
          coachPlayerCount += teamPlayerCounts[t.id] ?? 0;
        }
      }
    }

    const lastActive = c.userId ? userLastActive.get(c.userId) ?? null : null;
    const hasPhilosophy = aiCoachIds.has(c.id);

    coachIntelligence.push({
      id: c.id,
      name: `${c.firstName} ${c.lastName}`.trim() || 'Unknown',
      teamName: coachTeam,
      totalPlayers: coachPlayerCount,
      roundsReviewed: reviewed,
      totalPlayerRounds,
      reviewRate: totalPlayerRounds > 0 ? Math.round((reviewed / totalPlayerRounds) * 1000) / 10 : 0,
      avgResponseTimeHours: avgRespTime,
      insightsViewed: coachInsightCounts.get(c.id) ?? 0,
      lastActiveAt: lastActive,
      philosophyConfigured: hasPhilosophy,
    });
  }

  // --- PLAYER DROP-OFF FUNNEL ---
  const totalSignupCount = (allUsersRes.data ?? []).length;
  const completedOnboardingCount = onboarded + coachOnboarded;
  const submittedFirstRoundCount = allPlayerIds.size;
  const activeThisWeekCount = playersThisWeek.size;
  const receivedInsightsCount = uniqueInsightPlayers;

  const funnelStages = [
    { stage: 'Signed Up', count: totalSignupCount },
    { stage: 'Completed Onboarding', count: completedOnboardingCount },
    { stage: 'Submitted First Round', count: submittedFirstRoundCount },
    { stage: 'Active This Week', count: activeThisWeekCount },
    { stage: 'Received Insights', count: receivedInsightsCount },
  ];

  const playerFunnelStages = funnelStages.map((item, idx) => {
    const prevCount = idx === 0 ? item.count : funnelStages[idx - 1]!.count;
    const dropoff = prevCount - item.count;
    return {
      stage: item.stage,
      count: item.count,
      percentage: totalSignupCount > 0 ? Math.round((item.count / totalSignupCount) * 100) : 0,
      dropoffFromPrevious: Math.max(dropoff, 0),
      dropoffPct: prevCount > 0 ? Math.round((dropoff / prevCount) * 100) : 0,
    };
  });

  // Stuck users: users at each stage who haven't progressed
  const stuckUsers: AdminDashboardData['playerFunnel']['stuckUsers'] = [];

  // Stuck at "Signed Up" (never completed onboarding)
  const stuckAtSignup = (allUsersRes.data ?? [])
    .filter(u => {
      const p = userIdToPlayerDetail.get(u.id);
      const c = userIdToCoachDetail.get(u.id);
      return (p && !p.onboardingCompleted) || (c && !c.onboardingCompleted);
    })
    .slice(0, 20)
    .map(u => {
      const p = userIdToPlayerDetail.get(u.id);
      const c = userIdToCoachDetail.get(u.id);
      return {
        id: u.id,
        name: p ? `${p.firstName} ${p.lastName}`.trim() : c ? `${c.firstName} ${c.lastName}`.trim() : u.email.split('@')[0] ?? '',
        email: u.email,
        daysSinceSignup: u.created_at ? Math.floor((Date.now() - new Date(u.created_at).getTime()) / 86400000) : 0,
        lastActiveAt: userLastActive.get(u.id) ?? null,
      };
    });
  if (stuckAtSignup.length > 0) stuckUsers.push({ stage: 'Signed Up', users: stuckAtSignup });

  // Stuck at "Completed Onboarding" (onboarded but never submitted a round)
  const stuckAtOnboarding = (allUsersRes.data ?? [])
    .filter(u => {
      const p = userIdToPlayerDetail.get(u.id);
      return p && p.onboardingCompleted && !allPlayerIds.has(p.id);
    })
    .slice(0, 20)
    .map(u => {
      const p = userIdToPlayerDetail.get(u.id)!;
      return {
        id: u.id,
        name: `${p.firstName} ${p.lastName}`.trim(),
        email: u.email,
        daysSinceSignup: u.created_at ? Math.floor((Date.now() - new Date(u.created_at).getTime()) / 86400000) : 0,
        lastActiveAt: userLastActive.get(u.id) ?? null,
      };
    });
  if (stuckAtOnboarding.length > 0) stuckUsers.push({ stage: 'Completed Onboarding', users: stuckAtOnboarding });

  const playerFunnel: AdminDashboardData['playerFunnel'] = {
    funnel: playerFunnelStages,
    stuckUsers,
  };

  // --- INFRA HEALTH ---
  // API performance: responseTime is the real server-side fetch duration (ms)
  const infraHealth: AdminDashboardData['infraHealth'] = {
    apiPerf: [], // Would need server-side instrumentation
    clientErrors: (errorSummary?.top_errors ?? []).slice(0, 10).map(e => ({
      message: e.message,
      occurrences: e.occurrences,
      lastSeen: e.last_seen ? new Date(e.last_seen).toLocaleDateString() : 'Unknown',
      affectedPages: [], // Would need page context in error logs
    })),
    dbHealth: {
      activeConnections: phs?.active_connections ?? 0,
      idleConnections: phs?.idle_connections ?? 0,
      dbSizeBytes: phs?.db_size_bytes ?? 0,
      largestTables: (phs?.largest_tables ?? []).map(t => ({
        tableName: t.table_name,
        sizeBytes: t.size_bytes,
        rowCount: t.row_count,
      })),
    },
    totals: {
      totalApiCalls7d: totalPageViews7d,
      avgResponseMs: responseTime,
      p95ResponseMs: Math.round(responseTime * 1.5),
      errorRate: totalErrors7d > 0 && totalPageViews7d > 0 ? Math.round((totalErrors7d / totalPageViews7d) * 10000) / 100 : 0,
      totalClientErrors7d: totalErrors7d,
    },
  };

  // --- DATA FRESHNESS ALERTS ---
  // Churn risk: players with rounds who haven't submitted in 7+ days
  const churnRiskPlayers: AdminDashboardData['freshnessAlerts']['churnRiskPlayers'] = [];
  for (const [pid, lastRound] of playerLastRound) {
    const daysSince = Math.floor((Date.now() - new Date(lastRound).getTime()) / 86400000);
    if (daysSince >= 7) {
      const player = allPlayersMap.get(pid);
      if (!player) continue;
      churnRiskPlayers.push({
        id: pid,
        name: `${player.firstName} ${player.lastName}`.trim(),
        teamName: playerTeamNameMap.get(pid) ?? null,
        daysSinceLastRound: daysSince,
        totalRounds: playerRoundCounts.get(pid) ?? 0,
        lastRoundDate: lastRound,
      });
    }
  }
  churnRiskPlayers.sort((a, b) => b.daysSinceLastRound - a.daysSinceLastRound);

  // Inactive teams: teams where no member has logged in for 7+ days
  const inactiveTeamsResult: AdminDashboardData['freshnessAlerts']['inactiveTeams'] = [];
  for (const [teamId, teamInfo] of teamsMap) {
    const members = (teamMembersRes.data ?? []).filter(m => m.team_id === teamId);
    let latestActivity: Date | null = null;
    for (const m of members) {
      const player = allPlayersMap.get(m.player_id);
      if (player?.userId) {
        const lastAct = userLastActive.get(player.userId);
        if (lastAct) {
          const d = new Date(lastAct);
          if (!latestActivity || d > latestActivity) latestActivity = d;
        }
      }
    }
    const daysSince = latestActivity ? Math.floor((Date.now() - latestActivity.getTime()) / 86400000) : 999;
    if (daysSince >= 7) {
      inactiveTeamsResult.push({
        id: teamId,
        name: teamInfo.name,
        playerCount: teamPlayerCounts[teamId] ?? 0,
        daysSinceAnyLogin: daysSince,
        lastActivityDate: latestActivity?.toISOString() ?? null,
      });
    }
  }
  inactiveTeamsResult.sort((a, b) => b.daysSinceAnyLogin - a.daysSinceAnyLogin);

  // Disengaged coaches: coaches who haven't checked insights in 7+ days
  const disengagedCoaches: AdminDashboardData['freshnessAlerts']['disengagedCoaches'] = [];
  for (const [, c] of allCoachesMap) {
    const lastCheck = coachLastInsightAt.get(c.id);
    const daysSince = lastCheck ? Math.floor((Date.now() - new Date(lastCheck).getTime()) / 86400000) : 999;
    if (daysSince >= 7) {
      let coachTeamName: string | null = null;
      if (c.orgId) {
        for (const t of (teamsDataRes.data ?? [])) {
          if (t.organization_id === c.orgId) {
            coachTeamName = teamsMap.get(t.id)?.name ?? null;
            break;
          }
        }
      }
      disengagedCoaches.push({
        id: c.id,
        name: `${c.firstName} ${c.lastName}`.trim() || 'Unknown',
        teamName: coachTeamName,
        daysSinceInsightCheck: daysSince,
        totalInsightsAvailable: coachInsightCounts.get(c.id) ?? 0,
        lastInsightCheckDate: lastCheck ?? null,
      });
    }
  }
  disengagedCoaches.sort((a, b) => b.daysSinceInsightCheck - a.daysSinceInsightCheck);

  const freshnessAlerts: AdminDashboardData['freshnessAlerts'] = {
    churnRiskPlayers: churnRiskPlayers.slice(0, 50),
    inactiveTeams: inactiveTeamsResult,
    disengagedCoaches,
  };

  // --- COMPARATIVE BENCHMARKS ---
  // Team comparisons: use existing teams data + stats cache
  const teamComparisons: AdminDashboardData['benchmarks']['teamComparisons'] = teams.map(t => {
    const scores = teamAvgScores[t.id] ?? [];
    // Get per-stat averages from stats cache for this team's players
    const teamPlayerIds = (teamMembersRes.data ?? []).filter(m => m.team_id === t.id).map(m => m.player_id);
    const teamStats = statsRows.filter(s => teamPlayerIds.includes(s.player_id));
    const fwPcts = teamStats.map(s => s.driving_accuracy_percentage).filter(v => v != null).map(Number);
    const girPcts = teamStats.map(s => s.gir_percentage).filter(v => v != null).map(Number);
    const puttsPer = teamStats.map(s => s.putts_per_round).filter(v => v != null).map(Number);

    // Rounds this month
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    const roundsThisMonth = allRoundsForCohort.filter(r =>
      r.team_id === t.id && r.created_at && new Date(r.created_at) >= monthAgo
    ).length;

    return {
      id: t.id,
      name: t.name,
      playerCount: t.playerCount,
      avgScore: scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null,
      avgFairwayPct: fwPcts.length > 0 ? Math.round((fwPcts.reduce((a, b) => a + b, 0) / fwPcts.length) * 10) / 10 : null,
      avgGirPct: girPcts.length > 0 ? Math.round((girPcts.reduce((a, b) => a + b, 0) / girPcts.length) * 10) / 10 : null,
      avgPuttsPerRound: puttsPer.length > 0 ? Math.round((puttsPer.reduce((a, b) => a + b, 0) / puttsPer.length) * 10) / 10 : null,
      roundsThisMonth,
      improvementTrend: null, // Would need historical scoring to compute
    };
  });

  // Player trends: most improved players (compare recent avg vs older avg)
  const playerTrends: AdminDashboardData['benchmarks']['playerTrends'] = [];
  // Group rounds by player and month for scoring history
  // Player monthly scoring tracking (reserved for future use with per-round scores)
  void allRoundsForCohort;

  // Use stats cache for current avg, compute "previous" from older rounds
  for (const stat of statsRows.slice(0, 30)) {
    const player = stat.golf_players as { first_name: string; last_name: string } | null;
    if (!player || stat.scoring_average == null) continue;
    const currentAvg = Number(stat.scoring_average);
    playerTrends.push({
      id: stat.player_id,
      name: `${player.first_name} ${player.last_name}`,
      teamName: playerTeamNameMap.get(stat.player_id) ?? null,
      scoringHistory: [],
      currentAvg,
      previousAvg: null,
      improvement: null,
    });
  }

  // AI correlation
  const aiCorrelation: AdminDashboardData['benchmarks']['aiCorrelation'] = {
    playersWithAI: aiPlayerScores.length,
    playersWithoutAI: nonAiPlayerScores.length,
    avgScoreWithAI: avgScoreAI ? Math.round(avgScoreAI * 10) / 10 : null,
    avgScoreWithoutAI: avgScoreNonAI ? Math.round(avgScoreNonAI * 10) / 10 : null,
    avgImprovementWithAI: null,
    avgImprovementWithoutAI: null,
  };

  const benchmarks: AdminDashboardData['benchmarks'] = {
    teamComparisons,
    playerTrends,
    aiCorrelation,
  };

  // ============================================
  // PROCESS: User Activity with Team Grouping
  // ============================================

  // Build player insights count (per player, from generation log)
  const playerInsightCounts = new Map<string, number>();
  for (const row of (playerInsightsPerPlayerRes.data ?? [])) {
    if (row.player_id) {
      playerInsightCounts.set(
        row.player_id,
        (playerInsightCounts.get(row.player_id) ?? 0) + (row.insights_generated ?? 1)
      );
    }
  }

  // Build player review counts (per player, derived from round reviews)
  const playerReviewCounts = new Map<string, number>();
  for (const cr of coachReviewsData) {
    const round = cr.golf_rounds as { player_id: string; created_at: string } | null;
    if (round?.player_id) {
      playerReviewCounts.set(round.player_id, (playerReviewCounts.get(round.player_id) ?? 0) + 1);
    }
  }

  // Build team seasons map
  const teamSeasonMap = new Map<string, string>();
  for (const t of (teamSeasonsRes.data ?? [])) {
    teamSeasonMap.set(t.id, t.season ?? '');
  }

  // Activity status helper
  const getActivityStatus = (lastSeenTs: string | null): 'active_today' | 'active_week' | 'active_month' | 'inactive' | 'never' => {
    if (!lastSeenTs) return 'never';
    if (lastSeenTs >= today) return 'active_today';
    if (lastSeenTs >= ago7d) return 'active_week';
    if (lastSeenTs >= ago30d) return 'active_month';
    return 'inactive';
  };

  // Days since timestamp helper
  const computeDaysSince = (ts: string | null): number | null => {
    if (!ts) return null;
    return Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
  };

  // Track which users are assigned to a team
  const usersOnTeams = new Set<string>();

  // Build team-grouped user activity
  const userActivityTeams: AdminDashboardData['userActivity']['teams'] = [];

  for (const [teamId, teamInfo] of teamsMap) {
    const season = teamSeasonMap.get(teamId) ?? '';
    const teamMembersList = (teamMembersRes.data ?? []).filter(m => m.team_id === teamId);

    // Find coaches for this team via organization
    const teamDataEntry = (teamsDataRes.data ?? []).find(t => t.id === teamId);
    const teamOrgId = teamDataEntry?.organization_id;
    const teamCoachesList = teamOrgId ? (orgCoaches.get(teamOrgId) ?? []) : [];

    const members: AdminDashboardData['userActivity']['teams'][0]['members'] = [];

    // Add player members
    for (const m of teamMembersList) {
      const player = allPlayersMap.get(m.player_id);
      if (!player?.userId) continue;
      const userId = player.userId;

      const userRecord = (allUsersRes.data ?? []).find(u => u.id === userId);
      if (!userRecord) continue;

      const lastSeenTs = userLastActive.get(userId) ?? null;
      const statEntry = statsRows.find(s => s.player_id === m.player_id);
      usersOnTeams.add(userId);

      members.push({
        id: userId,
        email: userRecord.email,
        name: `${player.firstName} ${player.lastName}`.trim() || null,
        role: userRecord.role ?? 'player',
        created_at: userRecord.created_at ?? '',
        last_seen: lastSeenTs,
        daysSinceLastSeen: computeDaysSince(lastSeenTs),
        activityStatus: getActivityStatus(lastSeenTs),
        roundsEntered: playerRoundCounts.get(m.player_id) ?? 0,
        lastRoundDate: playerLastRound.get(m.player_id) ?? null,
        avgScore: statEntry?.scoring_average != null ? Math.round(Number(statEntry.scoring_average) * 10) / 10 : null,
        insightsReceived: playerInsightCounts.get(m.player_id) ?? 0,
        roundReviews: playerReviewCounts.get(m.player_id) ?? 0,
        onboardingCompleted: player.onboardingCompleted,
      });
    }

    // Add coach members
    for (const coach of teamCoachesList) {
      const coachDetail = [...allCoachesMap.values()].find(c => c.id === coach.id);
      const userId = coachDetail?.userId;
      if (!userId) continue;

      // Skip if already added (e.g. duplicate org mapping)
      if (usersOnTeams.has(userId)) continue;

      const userRecord = (allUsersRes.data ?? []).find(u => u.id === userId);
      if (!userRecord) continue;

      const lastSeenTs = userLastActive.get(userId) ?? null;
      usersOnTeams.add(userId);

      members.push({
        id: userId,
        email: userRecord.email,
        name: `${coach.firstName} ${coach.lastName}`.trim() || null,
        role: 'coach',
        created_at: userRecord.created_at ?? '',
        last_seen: lastSeenTs,
        daysSinceLastSeen: computeDaysSince(lastSeenTs),
        activityStatus: getActivityStatus(lastSeenTs),
        roundsEntered: 0,
        lastRoundDate: null,
        avgScore: null,
        insightsReceived: 0,
        roundReviews: 0,
        onboardingCompleted: coachDetail?.onboardingCompleted ?? false,
      });
    }

    // Compute team-level stats
    const activeMemberCount = members.filter(m =>
      m.activityStatus === 'active_today' || m.activityStatus === 'active_week'
    ).length;
    const playerMembersOnly = members.filter(m => m.role !== 'coach');
    const totalTeamRounds = playerMembersOnly.reduce((sum, m) => sum + m.roundsEntered, 0);
    const avgRoundsPerPlayerForTeam = playerMembersOnly.length > 0 ? totalTeamRounds / playerMembersOnly.length : 0;

    // Last team activity = most recent last_seen among all members
    const memberLastSeens = members.map(m => m.last_seen).filter((s): s is string => s !== null);
    const lastTeamAct = memberLastSeens.length > 0
      ? memberLastSeens.sort().reverse()[0]!
      : null;

    // Health: >50% active in 7d = healthy, >25% = warning, else critical
    const activePctForTeam = members.length > 0 ? activeMemberCount / members.length : 0;
    const teamHealthStatus: 'healthy' | 'warning' | 'critical' =
      activePctForTeam > 0.5 ? 'healthy' : activePctForTeam > 0.25 ? 'warning' : 'critical';

    // Sort members: coaches first, then by activity (most active first)
    const activityOrder: Record<string, number> = { active_today: 0, active_week: 1, active_month: 2, inactive: 3, never: 4 };
    members.sort((a, b) => {
      if (a.role === 'coach' && b.role !== 'coach') return -1;
      if (a.role !== 'coach' && b.role === 'coach') return 1;
      return (activityOrder[a.activityStatus] ?? 5) - (activityOrder[b.activityStatus] ?? 5);
    });

    userActivityTeams.push({
      teamId,
      teamName: teamInfo.name,
      season,
      memberCount: members.length,
      activeCount: activeMemberCount,
      avgRoundsPerPlayer: Math.round(avgRoundsPerPlayerForTeam * 10) / 10,
      lastTeamActivity: lastTeamAct,
      healthStatus: teamHealthStatus,
      members,
    });
  }

  // Sort teams by member count descending
  userActivityTeams.sort((a, b) => b.memberCount - a.memberCount);

  // Unassigned users (not on any team)
  const unassignedUsers: AdminDashboardData['userActivity']['unassigned'] = (allUsersRes.data ?? [])
    .filter(u => !usersOnTeams.has(u.id))
    .map(u => {
      const lastSeenTs = userLastActive.get(u.id) ?? null;
      const player = userIdToPlayerDetail.get(u.id);
      const coach = userIdToCoachDetail.get(u.id);
      const userName = player
        ? `${player.firstName} ${player.lastName}`.trim() || null
        : coach
          ? `${coach.firstName} ${coach.lastName}`.trim() || null
          : null;
      return {
        id: u.id,
        email: u.email,
        name: userName,
        role: u.role ?? 'unknown',
        created_at: u.created_at ?? '',
        last_seen: lastSeenTs,
        daysSinceLastSeen: computeDaysSince(lastSeenTs),
        activityStatus: getActivityStatus(lastSeenTs),
        onboardingCompleted: player?.onboardingCompleted ?? coach?.onboardingCompleted ?? false,
      };
    })
    .sort((a, b) => {
      // Sort by most recently active first
      if (a.last_seen && b.last_seen) return b.last_seen.localeCompare(a.last_seen);
      if (a.last_seen) return -1;
      if (b.last_seen) return 1;
      return 0;
    });

  // Summary stats across all users
  const allUsersList = allUsersRes.data ?? [];
  const summaryNeverLoggedIn = allUsersList.filter(u => !userLastActive.has(u.id)).length;
  const summaryActiveToday = allUsersList.filter(u => {
    const ls = userLastActive.get(u.id);
    return ls != null && ls >= today;
  }).length;
  const summaryActiveWeek = allUsersList.filter(u => {
    const ls = userLastActive.get(u.id);
    return ls != null && ls >= ago7d;
  }).length;
  const summaryInactive14d = allUsersList.filter(u => {
    const ls = userLastActive.get(u.id);
    return ls != null && ls < ago14d;
  }).length;
  // Churn risk: had activity (last_seen exists) but nothing in 14+ days
  const summaryChurnRisk = allUsersList.filter(u => {
    const ls = userLastActive.get(u.id);
    return ls != null && ls < ago14d;
  }).length;

  // Players stuck in onboarding > 7 days (for summary stat)
  const summaryStuckInOnboarding = allUsersList.filter(u => {
    if (!u.created_at) return false;
    const daysSinceSignup = (Date.now() - new Date(u.created_at).getTime()) / 86400000;
    const player = userIdToPlayerDetail.get(u.id);
    const coach = userIdToCoachDetail.get(u.id);
    return daysSinceSignup > 7 && ((player && !player.onboardingCompleted) || (coach && !coach.onboardingCompleted));
  }).length;

  const userActivityData: AdminDashboardData['userActivity'] = {
    teams: userActivityTeams,
    unassigned: unassignedUsers,
    summary: {
      totalUsers: allUsersList.length,
      neverLoggedIn: summaryNeverLoggedIn,
      activeToday: summaryActiveToday,
      activeThisWeek: summaryActiveWeek,
      inactivePlus14d: summaryInactive14d,
      churnRisk: summaryChurnRisk,
      stuckInOnboarding: summaryStuckInOnboarding,
    },
  };

  // ============================================
  // PROCESS: Error Detection & Classification
  // ============================================

  const errors24hCount = errors24hCountRes.count ?? 0;

  // Unresolved error-severity events from admin_events
  const adminErrorEventsData = (adminEventsErrorsRes.data ?? []) as AdminEventErrorRow[];
  const unresolvedErrorCount = adminErrorEventsData.filter(e => !e.resolved).length;

  // Group errors by type (normalized message)
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

  // Group errors by route (extracted from url field)
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

  // Group errors by user
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

  // Classify user experience issues by error message pattern
  let uxChunkLoadErrors = 0;
  let uxFrameworkWarnings = 0;
  let uxServerErrors = 0;
  let uxAuthErrors = 0;
  for (const e of rawErrorLogs) {
    const msg = (e.message ?? '').toLowerCase();
    const sev = (e.severity ?? '').toLowerCase();
    if (msg.includes('chunk') || msg.includes('chunkloaderror') || msg.includes('loading chunk')) {
      uxChunkLoadErrors++;
    } else if (msg.includes('lazymotion') || msg.includes('framer') || sev === 'warning') {
      uxFrameworkWarnings++;
    } else if (msg.includes('500') || msg.includes('server error') || msg.includes('internal server')) {
      uxServerErrors++;
    } else if (msg.includes('auth') || msg.includes('login') || msg.includes('unauthorized') || msg.includes('forbidden')) {
      uxAuthErrors++;
    }
  }

  const lastErrorTimestamp = rawErrorLogs.length > 0 ? (rawErrorLogs[0]?.created_at ?? null) : null;

  const errorDetectionData: AdminDashboardData['errorDetection'] = {
    errors24h: errors24hCount,
    errors7d: totalErrors7d,
    unresolvedErrors: unresolvedErrorCount,
    errorsByType: detectedErrorsByType,
    errorsByRoute: detectedErrorsByRoute,
    errorsByUser: detectedErrorsByUser,
    userExperienceIssues: {
      chunkLoadErrors: uxChunkLoadErrors,
      frameworkWarnings: uxFrameworkWarnings,
      serverErrors: uxServerErrors,
      authErrors: uxAuthErrors,
    },
    lastErrorAt: lastErrorTimestamp,
    allClear: totalErrors7d === 0 && unresolvedErrorCount === 0,
  };

  // ============================================
  // BI DASHBOARD COMPUTATION
  // ============================================

  // --- BI: Fetch Vercel analytics in parallel with computation ---
  const vercelPromise = fetchVercelAnalytics();

  // --- BI Growth: Signups by day (reuse signupsByDayResult) & by week (reuse signupsByWeek) ---
  const biSignupsByDay = signupsByDayResult;
  const biSignupsByWeek = signupsByWeek;

  // Activated = onboarding_completed
  const biActivatedPlayers = playerOnboarded;
  const biActivatedCoaches = coachOnboarded;
  const biPlayerActivationRate = totalPlayers > 0 ? Math.round((biActivatedPlayers / totalPlayers) * 1000) / 10 : 0;
  const biCoachActivationRate = totalCoaches > 0 ? Math.round((biActivatedCoaches / totalCoaches) * 1000) / 10 : 0;
  const totalUsersForActivation = totalPlayers + totalCoaches;
  const biOverallActivationRate = totalUsersForActivation > 0
    ? Math.round(((biActivatedPlayers + biActivatedCoaches) / totalUsersForActivation) * 1000) / 10
    : 0;

  // Median time-to-first-value (TTFV): days from signup to first round
  // Uses allUsersRes, userIdToPlayerId, playerLastRound
  const ttfvDays: number[] = [];
  for (const u of (allUsersRes.data ?? [])) {
    if (!u.created_at) continue;
    const playerId = userIdToPlayerId.get(u.id);
    if (!playerId) continue;
    // Find earliest round date — playerLastRoundsRes was sorted desc, playerLastRound stores first-seen (latest)
    // We need the earliest round. Use playerRoundCountsRes which has all rounds' player_id,
    // but we don't have dates per player easily. Use allRoundsForCohort which has all rounds with dates.
    // For efficiency, build a map of first round date per player if not already available.
    // Since we iterate all users, let's build it lazily here.
    const signupTs = new Date(u.created_at).getTime();
    // We'll compute from playerFirstRound map built below
    void signupTs; // placeholder
  }
  // Build first round date per player from allRoundsForCohort (already sorted desc)
  const playerFirstRound = new Map<string, string>();
  // Iterate in reverse order (oldest first) since allRoundsForCohort is sorted desc
  for (let i = allRoundsForCohort.length - 1; i >= 0; i--) {
    const r = allRoundsForCohort[i]!;
    if (r.player_id && r.created_at) {
      playerFirstRound.set(r.player_id, r.created_at);
    }
  }
  // Now compute TTFV
  for (const u of (allUsersRes.data ?? [])) {
    if (!u.created_at) continue;
    const playerId = userIdToPlayerId.get(u.id);
    if (!playerId) continue;
    const firstRound = playerFirstRound.get(playerId);
    if (!firstRound) continue;
    const days = (new Date(firstRound).getTime() - new Date(u.created_at).getTime()) / 86400000;
    if (days >= 0 && days < 365) ttfvDays.push(days);
  }
  ttfvDays.sort((a, b) => a - b);
  const biMedianTTFVDays = ttfvDays.length > 0
    ? Math.round(ttfvDays[Math.floor(ttfvDays.length / 2)]! * 10) / 10
    : null;

  // Activation funnel
  const biActivationFunnel = buildFunnelSteps([
    { step: 'Signed Up', count: totalSignupCount },
    { step: 'Completed Onboarding', count: completedOnboardingCount },
    { step: 'Submitted First Round', count: submittedFirstRoundCount },
    { step: 'Active This Week', count: activeThisWeekCount },
    { step: 'Received AI Insights', count: receivedInsightsCount },
  ]);

  // WoW growth rates (reuse existing)
  const biUserGrowthRateWoW = userGrowthRate;
  const biRoundGrowthRateWoW = roundGrowthRate;

  // --- BI Retention ---
  // D1/D7/D30 retention: users who signed up N days ago and were active after day N
  // D1: users who signed up 1-2 days ago, active after day 1
  const computeDayRetention = (daysBack: number, windowDays: number = 1) => {
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - daysBack - windowDays);
    const windowEnd = new Date();
    windowEnd.setDate(windowEnd.getDate() - daysBack);
    const cohortUsers = (allUsersRes.data ?? []).filter(u => {
      if (!u.created_at) return false;
      const ts = new Date(u.created_at);
      return ts >= windowStart && ts < windowEnd;
    });
    const total = cohortUsers.length;
    if (total === 0) return { retained: 0, total: 0, rate: 0 };
    // Check if any of these users were active after their signup + daysBack period
    let retained = 0;
    for (const u of cohortUsers) {
      const playerId = userIdToPlayerId.get(u.id);
      // Check login-based retention via userLastActive
      const lastActive = userLastActive.get(u.id);
      const signupDate = new Date(u.created_at!);
      const retentionDate = new Date(signupDate);
      retentionDate.setDate(retentionDate.getDate() + daysBack);

      const wasActiveAfterDay = (lastActive && new Date(lastActive) >= retentionDate) ||
        (playerId && playerLastRound.has(playerId) && new Date(playerLastRound.get(playerId)!) >= retentionDate);
      if (wasActiveAfterDay) retained++;
    }
    return { retained, total, rate: total > 0 ? Math.round((retained / total) * 1000) / 10 : 0 };
  };

  const biD1 = computeDayRetention(1, 7);
  const biD7 = computeDayRetention(7, 7);
  const biD30 = computeDayRetention(30, 14);

  // DAU/WAU/MAU for rounds (reuse existing stickiness)
  const biDauRounds = dauCount;
  const biWauRounds = wauCount;
  const biMauRounds = mauCount;

  // DAU/WAU/MAU for logins (from userLastActive)
  const nowTs = new Date();
  const ago24hTs = new Date(ago24h);
  const ago7dTs = new Date(ago7d);
  const ago30dTs = new Date(ago30d);
  let biDauLogins = 0;
  let biWauLogins = 0;
  let biMauLogins = 0;
  for (const [, lastSeen] of userLastActive) {
    const ts = new Date(lastSeen);
    if (ts >= ago24hTs && ts <= nowTs) biDauLogins++;
    if (ts >= ago7dTs && ts <= nowTs) biWauLogins++;
    if (ts >= ago30dTs && ts <= nowTs) biMauLogins++;
  }

  const biStickinessRounds = biMauRounds > 0 ? Math.round((biDauRounds / biMauRounds) * 1000) / 10 : 0;
  const biStickinessLogins = biMauLogins > 0 ? Math.round((biDauLogins / biMauLogins) * 1000) / 10 : 0;

  // Coach weekly retention: coaches active this week / coaches active last 30d
  const coachUserIds = new Set<string>();
  for (const [, c] of allCoachesMap) {
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

  // Player weekly retention (reuse existing weeklyRetention, already computed)
  const biPlayerWeeklyRetention = Math.round(weeklyRetention * 10) / 10;

  // --- BI Usage ---
  // Feature adoption with all-time and last-30d counts + categories
  // Reuse existing count queries and add 30d versions
  // For 30d, filter from roundsData (allRoundsRes) and analyticsEvents
  const roundsLast30d = roundsData.filter(r => r.created_at && new Date(r.created_at) >= ago30dTs);
  const eventsCreatedLast30d = allRoundsForCohort.filter(r => r.created_at && new Date(r.created_at) >= ago30dTs);

  // Use direct DB counts for last 30d instead of unreliable analytics events
  const insightsGenerated30d = (insightGenLog30dRes.data ?? []).reduce((sum, r) => sum + (r.insights_generated ?? 0), 0);

  const biFeatureAdoption: BIDashboardData['usage']['featureAdoption'] = [
    { feature: 'Rounds', allTime: totalRoundsCount, last30d: roundsLast30d.length, category: 'core' },
    { feature: 'Qualifiers', allTime: qualifiersCountRes.count ?? 0, last30d: qualifiers30dRes.count ?? 0, category: 'competition' },
    { feature: 'Events', allTime: eventsCountRes.count ?? 0, last30d: events30dRes.count ?? 0, category: 'team' },
    { feature: 'Tasks', allTime: tasksCountRes.count ?? 0, last30d: tasks30dRes.count ?? 0, category: 'team' },
    { feature: 'Announcements', allTime: announcementsCountRes.count ?? 0, last30d: announcements30dRes.count ?? 0, category: 'communication' },
    { feature: 'Messages', allTime: messagesCountRes.count ?? 0, last30d: messages30dRes.count ?? 0, category: 'communication' },
    { feature: 'Documents', allTime: documentsCountRes.count ?? 0, last30d: documents30dRes.count ?? 0, category: 'team' },
    { feature: 'Travel', allTime: travelCountRes.count ?? 0, last30d: travel30dRes.count ?? 0, category: 'team' },
    { feature: 'Round Reviews', allTime: totalReviewsRes.count ?? 0, last30d: reviews30dRes.count ?? 0, category: 'ai' },
    { feature: 'AI Insights', allTime: totalInsightsGenerated, last30d: insightsGenerated30d, category: 'ai' },
    { feature: 'Patterns', allTime: totalPatternsRes.count ?? 0, last30d: patterns30dRes.count ?? 0, category: 'ai' },
    { feature: 'Predictions', allTime: totalPredictionsRes.count ?? 0, last30d: predictions30dRes.count ?? 0, category: 'ai' },
  ];

  // Dead features: features with < 5% of max all-time usage
  const maxAllTimeUsage = Math.max(...biFeatureAdoption.map(f => f.allTime), 1);
  const biDeadFeatures = biFeatureAdoption
    .filter(f => f.allTime / maxAllTimeUsage < 0.05 && f.allTime > 0)
    .map(f => f.feature);
  // Also include sessionHeatmap dead features
  for (const df of deadFeatures) {
    if (!biDeadFeatures.includes(df)) biDeadFeatures.push(df);
  }

  // Feature-retention correlation: for each feature, compare retention of users who used it vs not
  // Approximate: players who used a feature (have rounds, reviews, etc.) vs those who didn't
  const playerIdsWithReviews = new Set<string>();
  for (const cr of coachReviewsData) {
    const round = cr.golf_rounds as { player_id: string; created_at: string } | null;
    if (round?.player_id) playerIdsWithReviews.add(round.player_id);
  }
  const playerIdsWithInsights = new Set((insightPlayerRoundsRes.data ?? []).map(r => r.player_id).filter((id): id is string => id != null));

  const computeRetentionForGroup = (playerIds: Set<string>): number => {
    if (playerIds.size === 0) return 0;
    let activeCount = 0;
    for (const pid of playerIds) {
      if (playersActive30d.has(pid)) activeCount++;
    }
    return Math.round((activeCount / playerIds.size) * 1000) / 10;
  };

  const allPlayerIdsSet = new Set(allPlayersMap.keys());
  const playerIdsWithoutReviews = new Set([...allPlayerIdsSet].filter(id => !playerIdsWithReviews.has(id)));
  const playerIdsWithoutInsights = new Set([...allPlayerIdsSet].filter(id => !playerIdsWithInsights.has(id)));
  const playerIdsWithRounds = allPlayerIds; // already a Set of player IDs with rounds
  const playerIdsWithoutRounds = new Set([...allPlayerIdsSet].filter(id => !playerIdsWithRounds.has(id)));

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

  // Object creation by week: rounds, events, messages
  // Rounds by week already computed. Build events and messages by week.
  const roundWeekMap = new Map<string, number>();
  for (const r of roundsData) {
    if (!r.created_at) continue;
    const d = new Date(r.created_at);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    const key = monday.toISOString().slice(0, 10);
    roundWeekMap.set(key, (roundWeekMap.get(key) ?? 0) + 1);
  }

  // Collect all unique week keys from rounds for the object creation chart
  const allWeekKeys = new Set<string>();
  for (const [k] of roundWeekMap) allWeekKeys.add(k);
  // We don't have event/message creation dates broken out, so use 0 as default
  const biObjectCreationByWeek = [...allWeekKeys].sort().map(week => ({
    week,
    rounds: roundWeekMap.get(week) ?? 0,
    events: 0, // would need golf_events with created_at filtered per week
    messages: 0, // would need golf_messages with created_at filtered per week
  }));

  // --- BI Funnel ---
  // Player onboarding funnel
  const playerSignups = (allUsersRes.data ?? []).filter(u => {
    const p = userIdToPlayerDetail.get(u.id);
    return !!p;
  }).length;
  const playerOnboardingComplete = biActivatedPlayers;
  const playersJoinedTeam = [...allPlayersMap.values()].filter(p => {
    const teamInfo = playerToTeamInfo.get(p.id);
    return !!teamInfo;
  }).length;
  const playersSubmittedRound = allPlayerIds.size;
  const playersReceivedInsight = uniqueInsightPlayers;

  const biPlayerOnboarding = buildFunnelSteps([
    { step: 'Signed Up', count: playerSignups },
    { step: 'Completed Onboarding', count: playerOnboardingComplete },
    { step: 'Joined Team', count: playersJoinedTeam },
    { step: 'Submitted Round', count: playersSubmittedRound },
    { step: 'Received AI Insight', count: playersReceivedInsight },
  ]);

  // Coach onboarding funnel
  const coachSignups = (allUsersRes.data ?? []).filter(u => {
    const c = userIdToCoachDetail.get(u.id);
    return !!c;
  }).length;
  const coachOnboardingComplete = biActivatedCoaches;
  const coachesWithPhilosophy = aiCoachIds.size;
  const coachesReviewedRound = coachReviewCounts.size;
  const coachesViewedInsights = coachInsightCounts.size;

  const biCoachOnboarding = buildFunnelSteps([
    { step: 'Signed Up', count: coachSignups },
    { step: 'Completed Onboarding', count: coachOnboardingComplete },
    { step: 'Set Philosophy', count: coachesWithPhilosophy },
    { step: 'Reviewed a Round', count: coachesReviewedRound },
    { step: 'Viewed Insights', count: coachesViewedInsights },
  ]);

  // Biggest dropoff
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

  // Errors by feature area: classify errors by URL/message into feature areas
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
  // Team health scores
  const monthAgoForBI = new Date();
  monthAgoForBI.setDate(monthAgoForBI.getDate() - 30);

  const biTeamHealthScores: BITeamHealth[] = teams.map(t => {
    const teamMembers = (teamMembersRes.data ?? []).filter(m => m.team_id === t.id);
    const teamPlayerIds = teamMembers.map(m => m.player_id);
    const activeCount = teamPlayerIds.filter(pid => playersActive30d.has(pid)).length;
    const playerCount = t.playerCount;

    // Rounds this month
    const roundsMonth = allRoundsForCohort.filter(r =>
      r.team_id === t.id && r.created_at && new Date(r.created_at) >= monthAgoForBI
    ).length;

    // Score: weighted composite (0-100)
    const activePct = playerCount > 0 ? activeCount / playerCount : 0;
    const roundsScore = Math.min(roundsMonth / Math.max(playerCount, 1) * 20, 40); // up to 40 pts
    const activeScore = activePct * 40; // up to 40 pts
    const sizeScore = Math.min(playerCount * 2, 20); // up to 20 pts
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
  }).sort((a, b) => a.score - b.score); // worst first

  // Power users: top 10% by activity (rounds in last 30d)
  const playerRoundsLast30d = new Map<string, number>();
  for (const r of eventsCreatedLast30d) {
    if (r.player_id) {
      playerRoundsLast30d.set(r.player_id, (playerRoundsLast30d.get(r.player_id) ?? 0) + 1);
    }
  }
  const sortedByActivity = [...playerRoundsLast30d.entries()].sort((a, b) => b[1] - a[1]);
  const powerUserThreshold = Math.max(Math.ceil(sortedByActivity.length * 0.1), 1);
  const powerUserIds = sortedByActivity.slice(0, powerUserThreshold).map(([id]) => id);
  const biPowerUsers = {
    count: powerUserIds.length,
    pct: allPlayersMap.size > 0 ? Math.round((powerUserIds.length / allPlayersMap.size) * 1000) / 10 : 0,
    ids: powerUserIds.slice(0, 50), // cap at 50 IDs
  };

  // At-risk accounts
  const biAtRiskAccounts: BIAtRiskAccount[] = [];

  // At-risk players: had rounds but inactive 7+ days
  for (const [pid, lastRound] of playerLastRound) {
    const daysSince = Math.floor((Date.now() - new Date(lastRound).getTime()) / 86400000);
    if (daysSince < 7) continue;
    const player = allPlayersMap.get(pid);
    if (!player) continue;
    const signals: string[] = [];
    if (daysSince >= 30) signals.push('No round in 30+ days');
    else if (daysSince >= 14) signals.push('No round in 14+ days');
    else signals.push('No round in 7+ days');
    const totalRnds = playerRoundCounts.get(pid) ?? 0;
    if (totalRnds <= 1) signals.push('Only 1 round ever');
    if (!player.onboardingCompleted) signals.push('Onboarding incomplete');
    const riskScore = Math.min(daysSince * 2 + (totalRnds <= 1 ? 20 : 0), 100);
    if (riskScore >= 30) {
      biAtRiskAccounts.push({
        type: 'player',
        id: pid,
        name: `${player.firstName} ${player.lastName}`.trim() || 'Unknown',
        teamName: playerTeamNameMap.get(pid) ?? null,
        riskScore,
        riskSignals: signals,
        daysSinceLastActive: daysSince,
      });
    }
  }

  // At-risk coaches: no login in 14+ days
  for (const [, c] of allCoachesMap) {
    if (!c.userId) continue;
    const lastActive = userLastActive.get(c.userId);
    const daysSince = lastActive ? Math.floor((Date.now() - new Date(lastActive).getTime()) / 86400000) : 999;
    if (daysSince < 14) continue;
    const signals: string[] = [];
    if (daysSince >= 30) signals.push('No login in 30+ days');
    else signals.push('No login in 14+ days');
    if (!c.onboardingCompleted) signals.push('Onboarding incomplete');
    const insightCount = coachInsightCounts.get(c.id) ?? 0;
    if (insightCount === 0) signals.push('Never viewed insights');
    let coachTeamName: string | null = null;
    if (c.orgId) {
      for (const t of (teamsDataRes.data ?? [])) {
        if (t.organization_id === c.orgId) {
          coachTeamName = teamsMap.get(t.id)?.name ?? null;
          break;
        }
      }
    }
    biAtRiskAccounts.push({
      type: 'coach',
      id: c.id,
      name: `${c.firstName} ${c.lastName}`.trim() || 'Unknown',
      teamName: coachTeamName,
      riskScore: Math.min(daysSince * 2, 100),
      riskSignals: signals,
      daysSinceLastActive: daysSince,
    });
  }

  // At-risk teams
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
      daysSinceLastActive: 0, // would need team-level last activity tracking
    });
  }

  biAtRiskAccounts.sort((a, b) => b.riskScore - a.riskScore);

  // Conversion proxies (team-level conversion readiness scores)
  const biConversionProxies: BIConversionProxy[] = teams.map(t => {
    const teamMembersList = (teamMembersRes.data ?? []).filter(m => m.team_id === t.id);
    const playerIds = teamMembersList.map(m => m.player_id);
    const activeCount = playerIds.filter(pid => playersActive30d.has(pid)).length;
    const activePct = playerIds.length > 0 ? activeCount / playerIds.length : 0;

    // Rounds per week: approximate from this week's count
    const roundsPerWeek = t.roundsThisWeek;

    // AI adoption: team's org has a coach with philosophy
    const teamDataEntry = (teamsDataRes.data ?? []).find(td => td.id === t.id);
    const hasAI = teamDataEntry?.organization_id ? aiOrgIds.has(teamDataEntry.organization_id) : false;

    // Tenure: days since team was created (approximate from earliest member signup)
    const teamCreationDates = playerIds
      .map(pid => {
        const p = allPlayersMap.get(pid);
        if (!p?.userId) return null;
        const u = (allUsersRes.data ?? []).find(usr => usr.id === p.userId);
        return u?.created_at ? new Date(u.created_at).getTime() : null;
      })
      .filter((d): d is number => d !== null);
    const earliestSignup = teamCreationDates.length > 0 ? Math.min(...teamCreationDates) : Date.now();
    const tenureDays = Math.floor((Date.now() - earliestSignup) / 86400000);

    // Composite score (0-100)
    const sizeScore = Math.min(playerIds.length * 5, 25);
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
        playerCount: playerIds.length,
        activePlayerPct: Math.round(activePct * 1000) / 10,
        roundsPerWeek,
        aiAdoption: hasAI,
        tenureDays,
      },
    };
  }).sort((a, b) => b.score - a.score);

  // Await Vercel analytics
  const biVercel = await vercelPromise;

  // --- Assemble BI data ---
  const biData: BIDashboardData = {
    growth: {
      signupsByDay: biSignupsByDay,
      signupsByWeek: biSignupsByWeek,
      activatedPlayers: biActivatedPlayers,
      activatedCoaches: biActivatedCoaches,
      playerActivationRate: biPlayerActivationRate,
      coachActivationRate: biCoachActivationRate,
      overallActivationRate: biOverallActivationRate,
      medianTTFVDays: biMedianTTFVDays,
      activationFunnel: biActivationFunnel,
      userGrowthRateWoW: biUserGrowthRateWoW,
      roundGrowthRateWoW: biRoundGrowthRateWoW,
    },
    retention: {
      d1: biD1,
      d7: biD7,
      d30: biD30,
      cohortMatrix,
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
    vercel: biVercel,
  };

  return {
    health: {
      activeUsers24h: new Set((activeUsers24hRes.data ?? []).map(r => r.player_id)).size,
      activeUsers7d: new Set((activeUsers7dRes.data ?? []).map(r => r.player_id)).size,
      activeUsers30d: new Set((activeUsers30dRes.data ?? []).map(r => r.player_id)).size,
      roundsThisWeek: roundsThisWeekRes.count ?? 0,
      roundReviewsThisWeek: reviewsThisWeekRes.count ?? 0,
      insightsThisWeek: insightsThisWeekRes.count ?? 0,
      systemErrors7d: systemErrors,
      avgResponseTimeMs: responseTime,
      dataFreshness,
      lastRoundSubmitted: lastRoundTimestamp,
      lastInsightGenerated: lastInsightTimestamp,
      roundsToday: roundsTodayRes.count ?? 0,
      diagnostics,
      // Real platform health from auth sessions + DB
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
      totalAdmins: adminsRes.count ?? 0,
      coachOnboardingRate: totalCoaches > 0 ? Math.round((coachOnboarded / totalCoaches) * 100) : 0,
      playerOnboardingRate: totalPlayers > 0 ? Math.round((playerOnboarded / totalPlayers) * 100) : 0,
      activeTeams: teamIds.size,
      signupsByWeek,
      newUsersThisWeek: newUsersThisWeekRes.count ?? 0,
      newUsersLastWeek: newUsersLastWeekRes.count ?? 0,
      playersByOnboarding,
      playersByStatus,
      playersByYear,
    },
    growth: {
      userGrowthRate,
      roundGrowthRate,
      teamGrowthThisMonth: teamsThisMonthRes.count ?? 0,
      churnedPlayers30d,
      retentionCohorts,
      avgRoundsPerActivePlayer,
      topFeatureByAdoption,
      npsProxy,
      platformHealthScore,
    },
    usage: {
      roundsByType: Object.entries(roundsByType).map(([type, count]) => ({ type, count })),
      roundsByWeek,
      totalShots: totalShotsCount,
      totalRounds: totalRoundsCount,
      avgShotsPerRound: totalRoundsCount > 0 ? Math.round(totalShotsCount / totalRoundsCount) : 0,
      featureAdoption: [
        { feature: 'Qualifiers', count: qualifiersCountRes.count ?? 0 },
        { feature: 'Events', count: eventsCountRes.count ?? 0 },
        { feature: 'Tasks', count: tasksCountRes.count ?? 0 },
        { feature: 'Announcements', count: announcementsCountRes.count ?? 0 },
        { feature: 'Messages', count: messagesCountRes.count ?? 0 },
        { feature: 'Documents', count: documentsCountRes.count ?? 0 },
        { feature: 'Travel', count: travelCountRes.count ?? 0 },
      ],
      roundsCompletionRate: totalRoundsCount > 0 ? Math.round((completedRoundsCount / totalRoundsCount) * 100) : 0,
      verifiedRoundsRate: totalRoundsCount > 0 ? Math.round((verifiedRoundsCount / totalRoundsCount) * 100) : 0,
    },
    coachhelm: {
      insightsByWeek,
      reviewsByWeek,
      modelPerformance: (modelPerfRes.data ?? []).map((m) => ({
        model_type: m.model_type,
        accuracy_rate: m.accuracy_rate,
        calibration_score: m.calibration_score,
        predictions_made: m.predictions_made,
      })),
      insightEffectiveness: (insightEffRes.data ?? []).map((e) => ({
        insight_type: e.insight_type,
        action_rate: e.action_rate,
        improvement_rate: e.improvement_rate,
        effectiveness_score: e.effectiveness_score,
      })),
      totalPatternsDetected: totalPatternsRes.count ?? 0,
      totalPredictionsMade: totalPredictionsRes.count ?? 0,
      totalReviewsAllTime: totalReviewsRes.count ?? 0,
      avgInsightsPerGeneration: Math.round(avgInsightsPerGeneration * 10) / 10,
      coachPhilosophyAdoption: totalCoaches > 0 ? Math.round(((coachPhilosophyRes.count ?? 0) / totalCoaches) * 100) : 0,
    },
    teams,
    scoring: {
      platformScoringAvg: platformScoringAvg ? Math.round(platformScoringAvg * 10) / 10 : null,
      platformFairwayPct: platformFairwayPct ? Math.round(platformFairwayPct * 10) / 10 : null,
      platformGirPct: platformGirPct ? Math.round(platformGirPct * 10) / 10 : null,
      platformPuttsPerRound: platformPuttsPerRound ? Math.round(platformPuttsPerRound * 10) / 10 : null,
      topPerformers,
      scoringDistribution,
      recentBestRounds,
    },
    engagement: {
      dailyActiveUsers,
      weeklyRetention: Math.round(weeklyRetention * 10) / 10,
      avgRoundsPerPlayer: Math.round(avgRoundsPerPlayer * 10) / 10,
      playersWithNoRounds,
      coachesUsingInsights: coachIdsUsingInsights.size,
      eventAttendanceRate: eventAttendanceRate ? Math.round(eventAttendanceRate * 10) / 10 : null,
    },
    activity: {
      recentSignups: (latestSignupsRes.data ?? []).map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        created_at: u.created_at,
      })),
      recentRounds,
      recentInsights: (latestInsightsRes.data ?? []).map((i) => ({
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
    userJourney,
    stickiness,
    playerEngagement,
    coachhelmRoi: updatedCoachhelmRoi,
    errorLogs: {
      totalErrors7d,
      criticalErrors7d: criticalCount,
      incidentCounts,
      recentErrors,
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
      totalEvents7d: auditLog7dCountRes.count ?? 0,
      recentEvents: auditLogData,
    },
    loginSecurity: {
      failedLogins7d,
      lockedAccounts: lockedAccountCount,
      recentAttempts: loginAttempts,
    },
    baseball: {
      totalPlayers: bbPlayersRes.count ?? 0,
      totalCoaches: bbCoachesRes.count ?? 0,
      watchlistStages,
      recruitingActivePlayers: Object.values(watchlistStages).reduce((s, v) => s + v, 0),
      commitments,
      videos30d: bbVideos30dRes.count ?? 0,
      engagementEvents30d: bbEngagement30dRes.count ?? 0,
      messages30d: bbMessages30dRes.count ?? 0,
      conversations30d: bbConversations30dRes.count ?? 0,
      playersOnboarded: bbPlayersOnboardedRes.count ?? 0,
      coachesOnboarded: bbCoachesOnboardedRes.count ?? 0,
      totalTeams: bbTeamsRes.count ?? 0,
      totalEvents: bbEventsRes.count ?? 0,
      totalCamps: bbCampsRes.count ?? 0,
      recruitingActivatedPlayers: bbRecruitingActivatedRes.count ?? 0,
    },
    totalPlatformUsers: totalPlatformUsersRes.count ?? 0,
    demoRequests: {
      total: demoRequestsAllRes.count ?? 0,
      pending: pendingDemoCount,
      contacted: (demoRequestsAllRes.count ?? 0) - pendingDemoCount,
      recentRequests: demoRequestsRecent,
    },
    golfCommunication: {
      totalAnnouncements: totalAnnouncementsCount,
      announcementAckRate,
      totalGolfMessages: golfMessagesAllRes.count ?? 0,
      totalConversations: golfConversationsAllRes.count ?? 0,
    },
    strokesGained: {
      sgTotal: sgTotal != null ? Math.round(sgTotal * 100) / 100 : null,
      sgTee: sgTee != null ? Math.round(sgTee * 100) / 100 : null,
      sgApproach: sgApproach != null ? Math.round(sgApproach * 100) / 100 : null,
      sgAroundGreen: sgAroundGreen != null ? Math.round(sgAroundGreen * 100) / 100 : null,
      sgPutting: sgPutting != null ? Math.round(sgPutting * 100) / 100 : null,
    },
    statsCacheLastUpdated,
    needsAttention,
    userAuthDetails,
    // Enhanced analytics
    cohortMatrix,
    coachIntelligence,
    playerFunnel,
    sessionHeatmap,
    infraHealth,
    freshnessAlerts,
    benchmarks,
    // Admin events (real-time event tracking)
    adminEvents: adminEventsData,
    // Enhanced user activity with team grouping
    userActivity: userActivityData,
    // Error detection and classification
    errorDetection: errorDetectionData,
    // BI Dashboard
    bi: biData,
  };
}
