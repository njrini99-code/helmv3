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
  ] = await Promise.all([
    // --- Health ---
    supabase.from('golf_rounds').select('player_id', { count: 'exact', head: true }).gte('created_at', ago24h),
    supabase.from('golf_rounds').select('player_id', { count: 'exact', head: true }).gte('created_at', ago7d),
    supabase.from('golf_rounds').select('player_id', { count: 'exact', head: true }).gte('created_at', ago30d),
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
    supabase.from('golf_players').select('id').eq('status', 'active'),
    supabase.from('golf_coach_insights').select('coach_id').gte('created_at', ago30d),
    supabase.from('golf_attendance_summary').select('attendance_percentage'),
    // --- Growth / Demographics ---
    supabase.from('golf_players').select('status, year'),
    supabase.from('golf_players').select('year'),
    supabase.from('golf_rounds').select('id', { count: 'exact', head: true }).gte('created_at', ago14d).lt('created_at', ago7d),
    supabase.from('golf_teams').select('id', { count: 'exact', head: true }).gte('created_at', ago30d),
    supabase.from('golf_rounds').select('player_id').gte('created_at', ago30d),
    supabase.from('golf_rounds').select('player_id').gte('created_at', daysAgo(60)).lt('created_at', ago30d),
    // Cohort retention: players who signed up in each of last 4 weeks
    supabase.from('users').select('id, created_at').gte('created_at', daysAgo(28)).lte('created_at', daysAgo(21)),
    supabase.from('users').select('id, created_at').gte('created_at', daysAgo(21)).lte('created_at', daysAgo(14)),
    supabase.from('users').select('id, created_at').gte('created_at', daysAgo(14)).lte('created_at', daysAgo(7)),
    supabase.from('users').select('id, created_at').gte('created_at', daysAgo(7)),
  ]);

  // ============================================
  // BATCH 2: Team & scoring intelligence (parallel)
  // ============================================
  const [
    teamsDataRes,
    teamMembersRes,
    teamRoundsRes,
    playerStatsRes,
    scoringDistRes,
    bestRoundsRes,
    insightsWeeklyRes,
    reviewsWeeklyRes,
    errorsRes,
  ] = await Promise.all([
    // Teams with org
    supabase.from('golf_teams').select('id, name, organization_id, organizations(name)'),
    // Team membership counts
    supabase.from('golf_team_members').select('team_id, player_id, golf_players(first_name, last_name)').eq('status', 'active'),
    // Rounds per team this week
    supabase.from('golf_rounds').select('player_id, team_id').gte('created_at', ago7d),
    // Player stats cache for platform averages and top performers
    supabase.from('golf_player_stats_cache').select('player_id, scoring_average, driving_accuracy_percentage, gir_percentage, putts_per_round, rounds_played, golf_players(first_name, last_name)').not('scoring_average', 'is', null).order('scoring_average', { ascending: true }).limit(50),
    // Scoring distribution
    supabase.from('golf_rounds').select('total_score').not('total_score', 'is', null).eq('status', 'completed'),
    // Best recent rounds
    supabase.from('golf_rounds').select('total_score, score_to_par, course_name, round_date, golf_players(first_name, last_name)').not('total_score', 'is', null).eq('status', 'completed').order('score_to_par', { ascending: true }).limit(5),
    // CoachHelm weekly
    supabase.from('golf_insight_generation_log').select('created_at').gte('created_at', ago12w).order('created_at', { ascending: true }),
    supabase.from('golf_round_reviews').select('created_at').gte('created_at', ago12w).order('created_at', { ascending: true }),
    // System errors
    supabase.from('golf_insight_generation_log').select('id', { count: 'exact', head: true }).gte('created_at', ago7d).eq('insights_generated', 0),
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

  // --- Top performers ---
  const topPerformers = validScoring.slice(0, 10).map((r) => {
    const player = r.golf_players as { first_name: string; last_name: string; team_id: string | null; golf_teams: { name: string } | null } | null;
    return {
      name: player ? `${player.first_name} ${player.last_name}` : 'Unknown',
      teamName: player?.golf_teams?.name ?? null,
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

  // Avg score per team from stats cache
  const teamAvgScores: Record<string, number[]> = {};
  const teamTopPlayer: Record<string, { name: string; avg: number }> = {};
  for (const r of statsRows) {
    const player = r.golf_players as { first_name: string; last_name: string; team_id: string | null; golf_teams: { name: string } | null } | null;
    if (player?.team_id && r.scoring_average != null) {
      if (!teamAvgScores[player.team_id]) teamAvgScores[player.team_id] = [];
      teamAvgScores[player.team_id]!.push(Number(r.scoring_average));
      // Track top player per team (lowest scoring avg)
      if (!teamTopPlayer[player.team_id] || Number(r.scoring_average) < teamTopPlayer[player.team_id]!.avg) {
        teamTopPlayer[player.team_id] = {
          name: `${player.first_name} ${player.last_name}`,
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
  const weeklyRetention = totalPlayers > 0 ? (playersThisWeek.size / totalPlayers) * 100 : 0;

  const coachIdsUsingInsights = new Set((coachesUsingInsightsRes.data ?? []).map((r) => r.coach_id));
  const attendanceSummaries = attendanceSummaryRes.data ?? [];
  const eventAttendanceRate = attendanceSummaries.length > 0
    ? attendanceSummaries.reduce((s, r) => s + Number(r.attendance_percentage ?? 0), 0) / attendanceSummaries.length
    : null;

  // --- Onboarding rate (needed for growth calculations below) ---
  const avgOnboarding = (coachOnboarded + playerOnboarded) / Math.max(totalCoaches + totalPlayers, 1) * 100;

  // --- Player demographics ---
  const playerStatusData = (playerStatusRes.data ?? []) as unknown as { status: string; year: string }[];
  const statusCounts: Record<string, number> = {};
  for (const p of playerStatusData) {
    const s = p.status || 'unknown';
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }
  const playersByStatus = Object.entries(statusCounts).map(([status, count]) => ({ status, count })).filter(s => s.count > 0);

  const playerYearData = (playerYearRes.data ?? []) as unknown as { year: string }[];
  const yearCounts: Record<string, number> = {};
  for (const p of playerYearData) {
    const y = p.year || 'unknown';
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

  // Churned players: active 30-60d ago but NOT in last 30d
  const playersActive30d = new Set((playersActive30dRes.data ?? []).map(r => r.player_id));
  const playersActive30_60d = new Set((playersActive30_60dRes.data ?? []).map(r => r.player_id));
  const churnedPlayers30d = [...playersActive30_60d].filter(id => !playersActive30d.has(id)).length;

  // Cohort retention: for each week's signups, how many submitted a round?
  const allPlayerRounds30d = new Set((weeklyRetentionPlayerRes.data ?? []).map(r => r.player_id));
  const cohortWeeks = [cohortWeek4Res, cohortWeek3Res, cohortWeek2Res, cohortWeek1Res];
  const retentionCohorts = cohortWeeks.map((cohortRes, i) => {
    const cohortUsers = (cohortRes.data ?? []).map(u => u.id);
    const retained = cohortUsers.filter(id => allPlayerRounds30d.has(id)).length;
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

  // --- Diagnostics ---
  const responseTime = Date.now() - startTime;
  const lastRoundTimestamp = (lastRoundRes.data?.[0]?.created_at as string) ?? null;
  const lastInsightTimestamp = (lastInsightRes.data?.[0]?.created_at as string) ?? null;
  const systemErrors = errorsRes.count ?? 0;

  const diagnostics: AdminDashboardData['health']['diagnostics'] = [];

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

  // API response time
  diagnostics.push({
    label: 'Dashboard API',
    status: responseTime < 3000 ? 'healthy' : responseTime < 6000 ? 'warning' : 'critical',
    detail: `${responseTime}ms response time`,
  });

  const dataFreshness: AdminDashboardData['health']['dataFreshness'] = lastRoundTimestamp
    ? (Date.now() - new Date(lastRoundTimestamp).getTime()) < 86400000 ? 'live' : 'stale'
    : 'error';

  return {
    health: {
      activeUsers24h: activeUsers24hRes.count ?? 0,
      activeUsers7d: activeUsers7dRes.count ?? 0,
      activeUsers30d: activeUsers30dRes.count ?? 0,
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
  };
}
