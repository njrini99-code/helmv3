// Shared helpers, schemas and types split out of admin-data.ts.
// A plain server module, not a server-action surface (no server directive, no actions).

import { type GroupedIncident } from '@/lib/admin/incident-grouping';

// ============================================
// TYPES
// ============================================

type DashboardIncidentStatus = 'open' | 'active' | 'resolved' | 'historical';
export interface DashboardErrorIncident {
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
    totals: { totalApiCalls7d: number; avgResponseMs: number; p95ResponseMs: number; errorRate: number; totalClientErrors7d: number; measured: boolean };
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
      /** Seed/demo team (audit finding F2) — excluded from platform totals,
       *  flagged rather than filtered so the owner can still see it. */
      isDemo: boolean;
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
export interface DashboardErrorContext {
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
export function normalizeIncidentPath(pathOrUrl: string | null): string {
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
export function buildDashboardErrorContext(rawContext: unknown): DashboardErrorContext {
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
export function normalizeIncidentKey(
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
export function normalizeDashboardSeverity(severity: string | null | undefined): 'critical' | 'error' | 'warning' | 'info' {
  const normalized = severity?.toLowerCase();
  if (normalized === 'critical' || normalized === 'error' || normalized === 'warning' || normalized === 'info') {
    return normalized;
  }
  return 'error';
}
export interface AdminEventIncidentRecord {
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
export function buildAdminEventIncidentKey(event: Pick<AdminEventIncidentRecord, 'title' | 'message' | 'metadata' | 'url'>): string {
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
  vercel: {
    visitors24h: number;
    visitors7d: number;
    visitors30d: number;
    /** 'unavailable' when the Vercel API rejected the request (expired/bad
     *  token, rate limit, etc) for at least one of the three periods — the
     *  visitor numbers above are NOT trustworthy in that state (they read 0,
     *  which is indistinguishable from "genuinely no traffic" on its own)
     *  and the UI must render a distinct unavailable state, not the number. */
    status: 'ok' | 'unavailable';
  } | null;
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

export interface PlatformHealthStatsResult {
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
