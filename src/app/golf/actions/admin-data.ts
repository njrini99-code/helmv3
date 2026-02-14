'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// ============================================
// TYPES
// ============================================

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
    recentErrors: {
      id: string;
      message: string;
      severity: string;
      stack: string | null;
      url: string | null;
      userId: string | null;
      userEmail: string | null;
      createdAt: string;
      occurrences: number;
    }[];
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
// MAIN DATA FETCHER
// ============================================

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const startTime = Date.now();
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
    // CoachHelm
    modelPerfRes,
    insightEffRes,
    totalPatternsRes,
    totalPredictionsRes,
    totalReviewsRes,
    insightGenLogRes,
    coachPhilosophyRes,
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

    // --- CoachHelm ---
    adminDb.from('golf_prediction_model_performance').select('model_type, accuracy_rate, calibration_score, predictions_made').order('period_end', { ascending: false }).limit(10),
    adminDb.from('golf_insight_effectiveness').select('insight_type, action_rate, improvement_rate, effectiveness_score').order('period_end', { ascending: false }).limit(10),
    adminDb.from('golf_patterns_v2').select('id', { count: 'exact', head: true }),
    adminDb.from('golf_predictions').select('id', { count: 'exact', head: true }),
    adminDb.from('golf_round_reviews').select('id', { count: 'exact', head: true }),
    adminDb.from('golf_insight_generation_log').select('insights_generated, created_at').gte('created_at', ago12w).order('created_at', { ascending: true }),
    adminDb.from('golf_coach_philosophy').select('id', { count: 'exact', head: true }),

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
    adminDb.from('golf_shots').select('id', { count: 'exact', head: true }).not('club', 'is', null),
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
    adminDb.rpc('get_platform_health_stats' as never) as unknown as { data: PlatformHealthStatsResult | null; error: unknown },
  ]);

  // ============================================
  // PROCESS DATA
  // ============================================

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
  // Approximate: count coaches per org, then map to teams
  const coachOrgRes = await adminDb.from('golf_coaches').select('organization_id');
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
  const responseTime = Date.now() - startTime;
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

  // API response time
  diagnostics.push({
    label: 'Dashboard API',
    status: responseTime < 3000 ? 'healthy' : responseTime < 6000 ? 'warning' : 'critical',
    detail: `${responseTime}ms response time`,
  });

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
  ] = await Promise.all([
    // Error logs: recent entries
    adminDb.from('error_logs').select('id, message, severity, stack, url, user_id, created_at').order('created_at', { ascending: false }).limit(50),
    // Error logs: 7d count
    adminDb.from('error_logs').select('id', { count: 'exact', head: true }).gte('created_at', ago7d),
    // Error logs: critical 7d
    adminDb.from('error_logs').select('id', { count: 'exact', head: true }).gte('created_at', ago7d).eq('severity', 'critical'),
    // Error summary from RPC
    (adminDb.rpc as unknown as (fn: string, params: Record<string, number>) => PromiseLike<{ data: unknown }>)('get_error_summary', { days_back: 7 }) as unknown as { data: { by_severity: { severity: string; count: number }[]; top_errors: { message: string; severity: string; occurrences: number; first_seen: string; last_seen: string; affected_users: number }[]; daily_rate: { day: string; count: number }[]; total_count: number; critical_count: number } | null; error: unknown },
    // Audit log: recent entries via RPC
    (adminDb.rpc as unknown as (fn: string, params: Record<string, number>) => PromiseLike<{ data: unknown }>)('get_audit_log_recent', { limit_count: 50 }) as unknown as { data: { id: string; user_id: string | null; user_email: string | null; action: string; table_name: string | null; record_id: string | null; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null; created_at: string }[] | null; error: unknown },
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
    // Admin events: recent entries
    adminDb.from('admin_events').select('id, event_type, severity, title, message, user_id, user_email, url, resolved, created_at').order('created_at', { ascending: false }).limit(50),
    // Admin events: summary via RPC
    adminDb.rpc('get_admin_event_summary', { p_days_back: 7 }) as unknown as { data: { total_events: number; error_count: number; critical_count: number; unresolved_count: number; events_by_type: Record<string, number>; events_by_severity: Record<string, number>; events_by_day: { date: string; count: number }[] } | null; error: unknown },
    // Admin events: unresolved critical
    adminDb.from('admin_events').select('id, event_type, title, message, created_at').eq('resolved', false).in('severity', ['critical', 'error']).order('created_at', { ascending: false }).limit(20),
  ]);

  // --- Process error logs ---
  const errorEmailMap = new Map<string, string>();
  for (const u of (allUsersRes.data ?? [])) {
    errorEmailMap.set(u.id, u.email);
  }

  const errorSummary = (errorSummaryRes.data ?? null) as {
    by_severity: { severity: string; count: number }[];
    top_errors: { message: string; severity: string; occurrences: number; first_seen: string; last_seen: string; affected_users: number }[];
    daily_rate: { day: string; count: number }[];
    total_count: number;
    critical_count: number;
  } | null;

  const recentErrors = (errorLogsRecentRes.data ?? []).map((e) => ({
    id: e.id,
    message: e.message,
    severity: e.severity ?? 'error',
    stack: e.stack,
    url: e.url,
    userId: e.user_id,
    userEmail: e.user_id ? (errorEmailMap.get(e.user_id) ?? null) : null,
    createdAt: e.created_at ?? new Date().toISOString(),
    occurrences: 1,
  }));

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
  const adminEventSummary = (adminEventsSummaryRes.data ?? null) as {
    total_events: number;
    error_count: number;
    critical_count: number;
    unresolved_count: number;
    events_by_type: Record<string, number>;
    events_by_severity: Record<string, number>;
    events_by_day: { date: string; count: number }[];
  } | null;

  const recentAdminEvents = ((adminEventsRecentRes.data ?? []) as {
    id: string;
    event_type: string;
    severity: string;
    title: string;
    message: string | null;
    user_id: string | null;
    user_email: string | null;
    url: string | null;
    resolved: boolean;
    created_at: string;
  }[]).map((e) => ({
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
      detail: 'Consider sending a reminder or checking for UX issues',
      tab: 'users',
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
      label: `${inactiveCoaches.length} coach${inactiveCoaches.length > 1 ? 'es' : ''} inactive > 14 days`,
      severity: 'warning',
      detail: 'Coaches who haven\'t logged in recently',
      tab: 'users',
    });
  }

  // Critical errors
  const criticalCount = errorLogsCriticalRes.count ?? 0;
  if (criticalCount > 0) {
    needsAttention.push({
      label: `${criticalCount} critical error${criticalCount > 1 ? 's' : ''} in last 7 days`,
      severity: 'critical',
      detail: 'Check Health & Issues tab for details',
      tab: 'health',
    });
  }

  // Error count > 10
  const totalErrors7d = errorLogs7dCountRes.count ?? 0;
  if (totalErrors7d > 10 && criticalCount === 0) {
    needsAttention.push({
      label: `${totalErrors7d} errors logged in last 7 days`,
      severity: 'warning',
      detail: 'Elevated error rate — review in Health tab',
      tab: 'health',
    });
  }

  // Locked accounts
  const lockedAccountCount = lockedAccountsRes.count ?? 0;
  if (lockedAccountCount > 0) {
    needsAttention.push({
      label: `${lockedAccountCount} locked account${lockedAccountCount > 1 ? 's' : ''}`,
      severity: 'warning',
      detail: 'Users locked out due to failed login attempts',
      tab: 'audit',
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
      detail: 'Signed up > 7 days ago but never finished setup',
      tab: 'users',
    });
  }

  // Pending demo requests
  const pendingDemoCount = demoRequestsPendingRes.count ?? 0;
  if (pendingDemoCount > 0) {
    needsAttention.push({
      label: `${pendingDemoCount} pending demo request${pendingDemoCount > 1 ? 's' : ''}`,
      severity: 'info',
      detail: 'New inbound leads waiting for follow-up',
      tab: 'command',
    });
  }

  // New users this week (positive signal)
  const newUsersCount = newUsersThisWeekRes.count ?? 0;
  if (newUsersCount > 0 && totalErrors7d === 0 && criticalCount === 0) {
    needsAttention.push({
      label: `${newUsersCount} new user${newUsersCount > 1 ? 's' : ''} signed up this week`,
      severity: 'info',
      detail: 'Growth is happening!',
      tab: 'users',
    });
  }

  // No errors = good news
  if (totalErrors7d === 0 && lockedAccountCount === 0 && stuckInOnboarding.length === 0 && stuckCoachesOnboarding.length === 0) {
    needsAttention.push({
      label: 'All clear — no issues detected',
      severity: 'info',
      detail: 'Platform is running smoothly',
      tab: 'dashboard',
    });
  }

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
  // Query their team's players' scoring averages vs players whose coach has NO philosophy
  const aiCoachPhilosophyRes = await adminDb.from('golf_coach_philosophy').select('coach_id');
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
  type CoachReviewRow = { coach_id: string | null; round_id: string; created_at: string; golf_rounds: { player_id: string; created_at: string } | null };

  const [
    analyticsEventsRes,
    coachInsightsViewedRes,
    coachRoundReviewsRes,
    roundsWithDatesRes,
  ] = await Promise.all([
    // Session heatmap: analytics events (last 7d) — table not in generated types
    adminDb.from('admin_analytics_events' as never).select('event_type, page_path, feature_name, session_id, user_id, created_at, duration_ms').gte('created_at', ago7d) as unknown as { data: AnalyticsEvent[] | null; error: unknown },
    // Coach intelligence: insights viewed per coach
    adminDb.from('golf_coach_insights').select('coach_id, created_at') as unknown as { data: CoachInsightRow[] | null; error: unknown },
    // Coach intelligence: round reviews per coach (with timing)
    adminDb.from('golf_round_reviews').select('coach_id, round_id, created_at, golf_rounds(player_id, created_at)') as unknown as { data: CoachReviewRow[] | null; error: unknown },
    // For cohort retention + benchmarks: all rounds with player + date
    adminDb.from('golf_rounds').select('player_id, created_at, team_id').order('created_at', { ascending: false }),
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
    if (!cr.coach_id) continue;
    coachReviewCounts.set(cr.coach_id, (coachReviewCounts.get(cr.coach_id) ?? 0) + 1);
    // Calculate response time: review created_at - round created_at
    const round = cr.golf_rounds as { player_id: string; created_at: string } | null;
    if (round?.created_at && cr.created_at) {
      const diffHours = (new Date(cr.created_at).getTime() - new Date(round.created_at).getTime()) / 3600000;
      if (diffHours >= 0 && diffHours < 720) { // cap at 30 days
        const times = coachResponseTimes.get(cr.coach_id) ?? [];
        times.push(diffHours);
        coachResponseTimes.set(cr.coach_id, times);
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
  // API performance: aggregate analytics events by page_path for response times
  // Since we don't have server-side timing, use DB health data we already have
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
  };
}
