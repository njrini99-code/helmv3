'use server';

import { createClient } from '@/lib/supabase/server';

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
    shotsWithGps: number;
    shotsWithLieType: number;
    shotsWithClub: number;
    gpsPercentage: number;
    lieTypePercentage: number;
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
    supabase.from('golf_rounds').select('player_id').gte('created_at', ago24h),
    supabase.from('golf_rounds').select('player_id').gte('created_at', ago7d),
    supabase.from('golf_rounds').select('player_id').gte('created_at', ago30d),
    supabase.from('golf_rounds').select('id', { count: 'exact', head: true }).gte('created_at', ago7d),
    supabase.from('golf_round_reviews').select('id', { count: 'exact', head: true }).gte('created_at', ago7d),
    supabase.from('golf_insight_generation_log').select('id', { count: 'exact', head: true }).gte('created_at', ago7d),
    supabase.from('golf_rounds').select('id', { count: 'exact', head: true }).gte('created_at', today),
    supabase.from('golf_rounds').select('created_at').order('created_at', { ascending: false }).limit(1),
    supabase.from('golf_insight_generation_log').select('created_at').order('created_at', { ascending: false }).limit(1),

    // --- Users ---
    supabase.from('golf_coaches').select('id', { count: 'exact', head: true }),
    supabase.from('golf_players').select('id', { count: 'exact', head: true }),
    supabase.from('users').select('id', { count: 'exact', head: true }).filter('role', 'eq', 'admin'),
    supabase.from('golf_coaches').select('id', { count: 'exact', head: true }).eq('onboarding_completed', true),
    supabase.from('golf_players').select('id', { count: 'exact', head: true }).eq('onboarding_completed', true),
    supabase.from('golf_team_members').select('team_id').eq('status', 'active'),
    supabase.from('users').select('created_at').gte('created_at', ago12w).order('created_at', { ascending: true }),
    supabase.from('users').select('id', { count: 'exact', head: true }).gte('created_at', ago7d),
    supabase.from('users').select('id', { count: 'exact', head: true }).gte('created_at', ago14d).lt('created_at', ago7d),
    supabase.from('golf_players').select('onboarding_completed'),

    // --- Usage ---
    supabase.from('golf_rounds').select('round_type, created_at').gte('created_at', ago12w).order('created_at', { ascending: true }),
    supabase.from('golf_shots').select('id', { count: 'exact', head: true }),
    supabase.from('golf_rounds').select('id', { count: 'exact', head: true }),
    supabase.from('golf_rounds').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
    supabase.from('golf_rounds').select('id', { count: 'exact', head: true }).not('total_score', 'is', null),
    supabase.from('golf_qualifiers').select('id', { count: 'exact', head: true }),
    supabase.from('golf_events').select('id', { count: 'exact', head: true }),
    supabase.from('golf_tasks').select('id', { count: 'exact', head: true }),
    supabase.from('golf_announcements').select('id', { count: 'exact', head: true }),
    supabase.from('golf_messages').select('id', { count: 'exact', head: true }),
    supabase.from('golf_documents').select('id', { count: 'exact', head: true }),
    supabase.from('golf_travel_itineraries').select('id', { count: 'exact', head: true }),

    // --- CoachHelm ---
    supabase.from('golf_prediction_model_performance').select('model_type, accuracy_rate, calibration_score, predictions_made').order('period_end', { ascending: false }).limit(10),
    supabase.from('golf_insight_effectiveness').select('insight_type, action_rate, improvement_rate, effectiveness_score').order('period_end', { ascending: false }).limit(10),
    supabase.from('golf_patterns_v2').select('id', { count: 'exact', head: true }),
    supabase.from('golf_predictions').select('id', { count: 'exact', head: true }),
    supabase.from('golf_round_reviews').select('id', { count: 'exact', head: true }),
    supabase.from('golf_insight_generation_log').select('insights_generated, created_at').gte('created_at', ago12w).order('created_at', { ascending: true }),
    supabase.from('golf_coach_philosophy').select('id', { count: 'exact', head: true }),

    // --- Activity ---
    supabase.from('users').select('id, email, role, created_at').order('created_at', { ascending: false }).limit(10),
    supabase.from('golf_rounds').select('id, total_score, score_to_par, round_type, course_name, created_at, golf_players(first_name, last_name)').order('created_at', { ascending: false }).limit(10),
    supabase.from('golf_insight_generation_log').select('id, insight_type, insights_generated, created_at').order('created_at', { ascending: false }).limit(10),

    // --- Engagement ---
    supabase.from('golf_rounds').select('created_at').gte('created_at', ago30d).order('created_at', { ascending: true }),
    supabase.from('golf_rounds').select('player_id').gte('created_at', ago7d),
    supabase.from('golf_players').select('id'),
    supabase.from('golf_coach_insights').select('coach_id').gte('created_at', ago30d),
    supabase.from('golf_attendance_summary').select('attendance_percentage'),
    // --- Growth / Demographics ---
    supabase.from('golf_team_members').select('status, golf_players(graduation_year)').not('status', 'is', null),
    supabase.from('golf_players').select('graduation_year'),
    supabase.from('golf_rounds').select('id', { count: 'exact', head: true }).gte('created_at', ago14d).lt('created_at', ago7d),
    supabase.from('golf_teams').select('id', { count: 'exact', head: true }).gte('created_at', ago30d),
    supabase.from('golf_rounds').select('player_id').gte('created_at', ago30d),
    supabase.from('golf_rounds').select('player_id').gte('created_at', daysAgo(60)).lt('created_at', ago30d),
    // Cohort retention: players who signed up in each of last 4 weeks
    supabase.from('users').select('id, created_at').gte('created_at', daysAgo(28)).lte('created_at', daysAgo(21)),
    supabase.from('users').select('id, created_at').gte('created_at', daysAgo(21)).lte('created_at', daysAgo(14)),
    supabase.from('users').select('id, created_at').gte('created_at', daysAgo(14)).lte('created_at', daysAgo(7)),
    supabase.from('users').select('id, created_at').gte('created_at', daysAgo(7)),
    // Shot data quality
    supabase.from('golf_shots').select('id', { count: 'exact', head: true }).not('latitude', 'is', null),
    supabase.from('golf_shots').select('id', { count: 'exact', head: true }).not('lie_type', 'is', null),
    supabase.from('golf_shots').select('id', { count: 'exact', head: true }).not('club', 'is', null),
    // Unique reviewed rounds
    supabase.from('golf_round_reviews').select('round_id'),
    // Rounds with insights
    supabase.from('golf_insight_generation_log').select('player_id').not('player_id', 'is', null),
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
    supabase.from('golf_teams').select('id, name, organization_id, organizations(name)'),
    // Team membership counts
    supabase.from('golf_team_members').select('team_id, player_id, golf_players(first_name, last_name)').eq('status', 'active'),
    // Rounds per team this week
    supabase.from('golf_rounds').select('player_id, team_id').gte('created_at', ago7d),
    // Player stats cache for platform averages and top performers
    supabase.from('golf_player_stats_cache').select('player_id, scoring_average, driving_accuracy_percentage, gir_percentage, putts_per_round, rounds_played, golf_players(first_name, last_name)').not('scoring_average', 'is', null).order('scoring_average', { ascending: true }).limit(50),
    // Player-to-team mapping for team name resolution
    supabase.from('golf_team_members').select('player_id, golf_teams(id, name)').eq('status', 'active'),
    // Scoring distribution
    supabase.from('golf_rounds').select('total_score').not('total_score', 'is', null).eq('status', 'completed'),
    // Best recent rounds
    supabase.from('golf_rounds').select('total_score, score_to_par, course_name, round_date, golf_players(first_name, last_name)').not('total_score', 'is', null).eq('status', 'completed').order('score_to_par', { ascending: true }).limit(5),
    // CoachHelm weekly
    supabase.from('golf_insight_generation_log').select('created_at').gte('created_at', ago12w).order('created_at', { ascending: true }),
    supabase.from('golf_round_reviews').select('created_at').gte('created_at', ago12w).order('created_at', { ascending: true }),
    // System errors
    supabase.from('golf_insight_generation_log').select('id', { count: 'exact', head: true }).gte('created_at', ago7d).eq('insights_generated', 0),
    // User ID to Player ID mapping (for cohort retention)
    supabase.from('golf_players').select('id, user_id'),
    // Real platform health stats from auth sessions + DB metrics
    supabase.rpc('get_platform_health_stats' as never) as unknown as { data: PlatformHealthStatsResult | null; error: unknown },
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
  const coachOrgRes = await supabase.from('golf_coaches').select('organization_id');
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
    supabase.from('users').select('id, email, role, created_at').order('created_at', { ascending: false }),
    // All players with user_id, names, onboarding, grad year
    supabase.from('golf_players').select('id, user_id, first_name, last_name, graduation_year, onboarding_completed'),
    // All coaches with user_id, names, org
    supabase.from('golf_coaches').select('id, user_id, full_name, email, organization_id, onboarding_completed'),
    // Round counts per player
    supabase.from('golf_rounds').select('player_id'),
    // Latest round date per player (get all rounds, process in JS)
    supabase.from('golf_rounds').select('player_id, created_at').order('created_at', { ascending: false }),
    // Signups by day (last 30d)
    supabase.from('users').select('created_at').gte('created_at', ago30d).order('created_at', { ascending: true }),
    // Active users by day (last 30d, based on round submissions)
    supabase.from('golf_rounds').select('player_id, created_at').gte('created_at', ago30d).order('created_at', { ascending: true }),
    // Real last-active timestamps from auth sessions (uses SECURITY DEFINER function)
    supabase.rpc('get_user_last_active' as never) as unknown as { data: { user_id: string; last_active_at: string | null }[] | null; error: unknown },
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

  // --- User last-active map (from auth sessions) ---
  const userLastActive = new Map<string, string>();
  for (const row of (userLastActiveRes.data ?? [])) {
    if (row.last_active_at) {
      userLastActive.set(row.user_id, row.last_active_at);
    }
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
  const shotsWithGps = shotsWithGpsRes.count ?? 0;
  const shotsWithLieType = shotsWithLieTypeRes.count ?? 0;
  const shotsWithClub = shotsWithClubRes.count ?? 0;
  const dataQuality = {
    totalShots: totalShotsCount,
    shotsWithGps,
    shotsWithLieType,
    shotsWithClub,
    gpsPercentage: totalShotsCount > 0 ? Math.round((shotsWithGps / totalShotsCount) * 100) : 0,
    lieTypePercentage: totalShotsCount > 0 ? Math.round((shotsWithLieType / totalShotsCount) * 100) : 0,
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

  // For ROI, compare team averages
  // Teams with coaches who have philosophy set up vs those without
  // This is approximate but directionally useful
  const teamsWithAI = teams.filter(t => t.coachCount > 0 && t.avgScore != null);
  const avgScoreAllTeams = teamsWithAI.length > 0
    ? teamsWithAI.reduce((s, t) => s + (t.avgScore ?? 0), 0) / teamsWithAI.length
    : null;

  const coachhelmRoi = {
    coachesUsingAI: aiCoachCount,
    coachesNotUsingAI: nonAiCoachCount,
    avgScoreAICoachPlayers: avgScoreAllTeams,
    avgScoreNonAICoachPlayers: null as number | null, // Would need per-coach philosophy data linked to teams
    scoreDifference: null as number | null,
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
    coachhelmRoi,
  };
}
