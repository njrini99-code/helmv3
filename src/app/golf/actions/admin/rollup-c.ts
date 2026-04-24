'use server';

// ============================================================================
// Slice C — Enhanced analytics + BI supporting data for the admin dashboard.
//
// Consolidates the Batch-5 query block (L3195-L4640 in admin-data.ts) behind a
// single RPC: `public.get_admin_analytics_rollup(p_ago7d, p_ago30d, p_ago12w)`.
//
// CALLER CONTRACT:
//   `fetchAdminRollupC(allRoundsMinimal)` — Slice A's C1 RPC already exposes the
//   last-12-weeks `allRoundsMinimal` array (player_id, created_at, team_id).
//   We accept it as input to avoid a second full-table scan of golf_rounds.
//
// OUTPUT:
//   A pre-assembled RollupC object sized to merge into AdminDashboardData with
//   no additional cross-slice context. Fields that legitimately belong to
//   other slices (e.g. BI.vercel, errorDetection.byType — which needs Slice
//   B's raw error_logs) are either left as empty defaults or populated from
//   what the RPC payload already contains.
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import type { AdminDashboardData } from '../admin-data';

// ----------------------------------------------------------------------------
// Public types
// ----------------------------------------------------------------------------

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

/**
 * Safe empty rollup — used by `admin-data.ts` when `get_admin_analytics_rollup`
 * times out (statement_timeout, code=57014) or errors, so the admin dashboard
 * can still render the other slices instead of crashing. Shapes mirror the
 * `AdminDashboardData[X]` types the fields alias — keep in sync if those
 * shapes change.
 */
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

// ----------------------------------------------------------------------------
// RPC payload shape (must match the SELECT in 20260421000007_admin_analytics.sql)
// ----------------------------------------------------------------------------

type RpcAnalyticsEvent = {
  event_type: string;
  page_path: string | null;
  feature_name: string | null;
  session_id: string | null;
  user_id: string | null;
  created_at: string;
  duration_ms: number | null;
};

type RpcCoachInsightRollup = {
  coach_id: string;
  total_insights: number;
  last_insight_at: string | null;
};

type RpcCoachReviewRollup = {
  coach_id: string;
  reviews: number;
  avg_response_hours: number | null;
};

type RpcPlayerReviewRollup = { player_id: string; reviews: number };
type RpcPlayerInsightRollup = { player_id: string; insights: number };

type RpcTeam = {
  id: string;
  name: string;
  season: string | null;
  organization_id: string | null;
};
type RpcTeamMember = { player_id: string; team_id: string };
type RpcPlayer = {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  onboarding_completed: boolean;
};
type RpcCoach = {
  id: string;
  user_id: string;
  full_name: string | null;
  organization_id: string | null;
  onboarding_completed: boolean;
};
type RpcUser = {
  id: string;
  email: string;
  role: string | null;
  created_at: string | null;
  last_seen: string | null;
};
type RpcPlayerStat = {
  player_id: string;
  first_name: string | null;
  last_name: string | null;
  scoring_average: number | null;
  driving_accuracy: number | null;
  gir_percentage: number | null;
  putts_per_round: number | null;
  rounds_played: number | null;
};
type RpcAdminErrorEvent = {
  id: string;
  event_type: string;
  severity: string;
  resolved: boolean;
  created_at: string | null;
};

type RpcPayload = {
  generated_at: string;
  ago7d: string;
  ago30d: string;
  ago12w: string;
  analyticsEvents: RpcAnalyticsEvent[];
  coachInsightRollup: RpcCoachInsightRollup[];
  coachReviewRollup: RpcCoachReviewRollup[];
  playerReviewRollup: RpcPlayerReviewRollup[];
  playersWithReviews: string[];
  playerInsightRollup: RpcPlayerInsightRollup[];
  teams: RpcTeam[];
  teamMembers: RpcTeamMember[];
  players: RpcPlayer[];
  coaches: RpcCoach[];
  users: RpcUser[];
  philosophyCoachIds: string[];
  playerStats: RpcPlayerStat[];
  errors24h: number;
  errors7d: number;
  adminErrorEvents: RpcAdminErrorEvent[];
  adminErrorEventsUnresolved: number;
};

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function weekMondayKey(ts: string | Date): string {
  const d = typeof ts === 'string' ? new Date(ts) : ts;
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

function daysSince(ts: string | null): number | null {
  if (!ts) return null;
  return Math.floor((Date.now() - new Date(ts).getTime()) / 86_400_000);
}

function activityStatus(
  lastSeen: string | null,
  todayIso: string,
  ago7dIso: string,
  ago30dIso: string,
): AdminDashboardData['userActivity']['teams'][number]['members'][number]['activityStatus'] {
  if (!lastSeen) return 'never';
  if (lastSeen >= todayIso) return 'active_today';
  if (lastSeen >= ago7dIso) return 'active_week';
  if (lastSeen >= ago30dIso) return 'active_month';
  return 'inactive';
}

// ----------------------------------------------------------------------------
// Public entry point
// ----------------------------------------------------------------------------

export async function fetchAdminRollupC(
  allRoundsMinimal: AllRoundsMinimal[],
): Promise<RollupC> {
  // Use the request-scoped client so auth.uid() is the invoking admin.
  const admin = await createClient();

  const now = new Date();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ago7d = new Date(now.getTime() - 7 * 86_400_000);
  const ago14d = new Date(now.getTime() - 14 * 86_400_000);
  const ago30d = new Date(now.getTime() - 30 * 86_400_000);
  const ago12w = new Date(now.getTime() - 84 * 86_400_000);

  const todayIso = today.toISOString();
  const ago7dIso = ago7d.toISOString();
  const ago14dIso = ago14d.toISOString();
  const ago30dIso = ago30d.toISOString();

  // Explicit .bind(admin) guarantees `this` is preserved.
  const rpcCall = admin.rpc.bind(admin) as unknown as (
    fn: 'get_admin_analytics_rollup',
    args: { p_ago7d: string; p_ago30d: string; p_ago12w: string },
  ) => Promise<{ data: RpcPayload | null; error: unknown }>;

  const { data, error } = await rpcCall('get_admin_analytics_rollup', {
    p_ago7d: ago7dIso,
    p_ago30d: ago30dIso,
    p_ago12w: ago12w.toISOString(),
  });
  if (error) {
    if (error instanceof Error) throw error;
    const e = error as Record<string, unknown>;
    const parts = [
      e.code ? `code=${e.code}` : null,
      e.message ? `msg=${e.message}` : null,
      e.details ? `details=${e.details}` : null,
      e.hint ? `hint=${e.hint}` : null,
    ].filter(Boolean);
    throw new Error(`get_admin_analytics_rollup RPC failed: ${parts.length ? parts.join(' ') : JSON.stringify(error)}`);
  }
  if (!data) throw new Error('Empty analytics rollup response');

  // ---------------------------------------------------------------------------
  // Build lookup maps once — the same indexes are reused across every field.
  // ---------------------------------------------------------------------------
  const teamsById = new Map<string, RpcTeam>();
  for (const t of data.teams) teamsById.set(t.id, t);

  const orgToTeams = new Map<string, RpcTeam[]>();
  for (const t of data.teams) {
    if (!t.organization_id) continue;
    const list = orgToTeams.get(t.organization_id) ?? [];
    list.push(t);
    orgToTeams.set(t.organization_id, list);
  }

  const playersById = new Map<string, RpcPlayer>();
  const userIdToPlayer = new Map<string, RpcPlayer>();
  for (const p of data.players) {
    playersById.set(p.id, p);
    if (p.user_id) userIdToPlayer.set(p.user_id, p);
  }

  const coachesById = new Map<string, RpcCoach>();
  const userIdToCoach = new Map<string, RpcCoach>();
  for (const c of data.coaches) {
    coachesById.set(c.id, c);
    if (c.user_id) userIdToCoach.set(c.user_id, c);
  }

  const usersById = new Map<string, RpcUser>();
  for (const u of data.users) usersById.set(u.id, u);

  // player → team assignment (one team per player — use first active row if
  // multiple exist; duplicate team_members rows are rare but tolerable)
  const playerToTeamId = new Map<string, string>();
  const teamIdToPlayerIds = new Map<string, string[]>();
  for (const m of data.teamMembers) {
    if (!playerToTeamId.has(m.player_id)) playerToTeamId.set(m.player_id, m.team_id);
    const list = teamIdToPlayerIds.get(m.team_id) ?? [];
    list.push(m.player_id);
    teamIdToPlayerIds.set(m.team_id, list);
  }

  // player → { totalRounds, lastRound, firstRound }  from caller's
  // allRoundsMinimal (last 12 weeks)
  const playerRoundCount = new Map<string, number>();
  const playerLastRound = new Map<string, string>();
  const playerFirstRound = new Map<string, string>();
  const playerRoundWeeks = new Map<string, Set<string>>();
  const roundsThisMonthByTeam = new Map<string, number>();
  for (const r of allRoundsMinimal) {
    if (!r.player_id || !r.created_at) continue;
    playerRoundCount.set(r.player_id, (playerRoundCount.get(r.player_id) ?? 0) + 1);
    const prevLast = playerLastRound.get(r.player_id);
    if (!prevLast || r.created_at > prevLast) playerLastRound.set(r.player_id, r.created_at);
    const prevFirst = playerFirstRound.get(r.player_id);
    if (!prevFirst || r.created_at < prevFirst) playerFirstRound.set(r.player_id, r.created_at);
    const wk = weekMondayKey(r.created_at);
    const wkSet = playerRoundWeeks.get(r.player_id) ?? new Set<string>();
    wkSet.add(wk);
    playerRoundWeeks.set(r.player_id, wkSet);
    if (r.team_id && r.created_at >= ago30dIso) {
      roundsThisMonthByTeam.set(r.team_id, (roundsThisMonthByTeam.get(r.team_id) ?? 0) + 1);
    }
  }

  // coach rollup maps
  const coachInsightCount = new Map<string, number>();
  const coachLastInsightAt = new Map<string, string>();
  for (const c of data.coachInsightRollup) {
    coachInsightCount.set(c.coach_id, c.total_insights);
    if (c.last_insight_at) coachLastInsightAt.set(c.coach_id, c.last_insight_at);
  }
  const coachReviewCount = new Map<string, number>();
  const coachAvgResponseHours = new Map<string, number>();
  for (const c of data.coachReviewRollup) {
    coachReviewCount.set(c.coach_id, c.reviews);
    if (c.avg_response_hours != null) coachAvgResponseHours.set(c.coach_id, c.avg_response_hours);
  }

  // per-player aggregates
  const playerInsightCount = new Map<string, number>();
  for (const p of data.playerInsightRollup) playerInsightCount.set(p.player_id, p.insights);
  const playerReviewCount = new Map<string, number>();
  for (const p of data.playerReviewRollup) playerReviewCount.set(p.player_id, p.reviews);

  const philosophyCoachSet = new Set(data.philosophyCoachIds.filter(Boolean));

  // player stats index
  const statsByPlayer = new Map<string, RpcPlayerStat>();
  for (const s of data.playerStats) statsByPlayer.set(s.player_id, s);

  // user last_seen — we use the users.last_seen column as the best available
  // proxy (auth.users last_sign_in lives in Slice A's `get_users_with_auth`
  // RPC which isn't in our ownership zone). This matches what admin-data.ts
  // does when auth details are unavailable.
  const userLastActive = new Map<string, string>();
  for (const u of data.users) {
    if (u.last_seen) userLastActive.set(u.id, u.last_seen);
  }

  // ---------------------------------------------------------------------------
  // SESSION HEATMAP
  // ---------------------------------------------------------------------------
  const pageViewMap = new Map<string, { viewCount: number; users: Set<string> }>();
  const featureUseMap = new Map<string, { useCount: number; users: Set<string> }>();
  const sessionPagesMap = new Map<string, number>();
  const sessionDurations = new Map<string, { min: number; max: number }>();

  for (const ev of data.analyticsEvents) {
    if (ev.event_type === 'page_view' && ev.page_path) {
      const entry = pageViewMap.get(ev.page_path) ?? { viewCount: 0, users: new Set<string>() };
      entry.viewCount++;
      if (ev.user_id) entry.users.add(ev.user_id);
      pageViewMap.set(ev.page_path, entry);
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
    if (ev.session_id && ev.created_at) {
      const ts = new Date(ev.created_at).getTime();
      const dur = sessionDurations.get(ev.session_id);
      if (!dur) {
        sessionDurations.set(ev.session_id, { min: ts, max: ts });
      } else {
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
  const totalPageViews7d = data.analyticsEvents.filter(e => e.event_type === 'page_view').length;
  const avgPagesPerSession = totalSessions7d > 0 ? totalPageViews7d / totalSessions7d : 0;
  const sessionDurValues = [...sessionDurations.values()]
    .map(d => (d.max - d.min) / 60_000)
    .filter(d => d > 0);
  const avgSessionDurationMin = sessionDurValues.length > 0
    ? sessionDurValues.reduce((a, b) => a + b, 0) / sessionDurValues.length
    : 0;

  const featureUserSizes = [...featureUseMap.values()].map(f => f.users.size);
  const maxFeatureUsers = Math.max(...featureUserSizes, 1);
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

  // ---------------------------------------------------------------------------
  // COHORT RETENTION MATRIX — 8 weekly cohorts, retention at week 0..8
  // ---------------------------------------------------------------------------
  const cohortMatrix: AdminDashboardData['cohortMatrix'] = [];
  for (let weeksBack = 8; weeksBack >= 1; weeksBack--) {
    const cohortStart = new Date();
    cohortStart.setDate(cohortStart.getDate() - cohortStart.getDay() + 1 - weeksBack * 7);
    cohortStart.setHours(0, 0, 0, 0);
    const cohortEnd = new Date(cohortStart);
    cohortEnd.setDate(cohortEnd.getDate() + 7);
    const cohortWeek = cohortStart.toISOString().slice(0, 10);

    const cohortUsers = data.users.filter(u => {
      if (!u.created_at) return false;
      const ts = new Date(u.created_at);
      return ts >= cohortStart && ts < cohortEnd;
    });
    const cohortPlayerIds = cohortUsers
      .map(u => userIdToPlayer.get(u.id)?.id)
      .filter((v): v is string => Boolean(v));
    const cohortSize = cohortUsers.length;
    if (cohortSize === 0) continue;

    const retentionByWeek: number[] = [];
    for (let weekOffset = 0; weekOffset <= 8; weekOffset++) {
      const targetWeekStart = new Date(cohortStart);
      targetWeekStart.setDate(targetWeekStart.getDate() + weekOffset * 7);
      if (targetWeekStart > now) break;
      const targetWeekKey = targetWeekStart.toISOString().slice(0, 10);
      const activeInWeek = cohortPlayerIds.filter(pid => {
        const weeks = playerRoundWeeks.get(pid);
        return weeks?.has(targetWeekKey);
      }).length;
      retentionByWeek.push(Math.round((activeInWeek / cohortSize) * 100));
    }
    cohortMatrix.push({ cohortWeek, cohortSize, retentionByWeek });
  }

  // ---------------------------------------------------------------------------
  // COACH INTELLIGENCE
  // ---------------------------------------------------------------------------
  const coachIntelligence: AdminDashboardData['coachIntelligence'] = [];
  for (const c of data.coaches) {
    // Team for this coach (first team matching the coach's organization)
    let coachTeamName: string | null = null;
    let coachPlayerCount = 0;
    let totalPlayerRounds = 0;
    if (c.organization_id) {
      const coachTeams = orgToTeams.get(c.organization_id) ?? [];
      if (coachTeams.length > 0) {
        const firstTeam = coachTeams[0];
        if (firstTeam) coachTeamName = firstTeam.name;
      }
      for (const t of coachTeams) {
        const teamPlayers = teamIdToPlayerIds.get(t.id) ?? [];
        coachPlayerCount += teamPlayers.length;
        for (const pid of teamPlayers) {
          totalPlayerRounds += playerRoundCount.get(pid) ?? 0;
        }
      }
    }

    const reviewed = coachReviewCount.get(c.id) ?? 0;
    const avgResp = coachAvgResponseHours.get(c.id);
    const lastActive = c.user_id ? (userLastActive.get(c.user_id) ?? null) : null;
    const name = (c.full_name ?? '').trim() || 'Unknown';

    coachIntelligence.push({
      id: c.id,
      name,
      teamName: coachTeamName,
      totalPlayers: coachPlayerCount,
      roundsReviewed: reviewed,
      totalPlayerRounds,
      reviewRate: totalPlayerRounds > 0
        ? Math.round((reviewed / totalPlayerRounds) * 1000) / 10
        : 0,
      avgResponseTimeHours: avgResp != null ? Math.round(avgResp * 10) / 10 : null,
      insightsViewed: coachInsightCount.get(c.id) ?? 0,
      lastActiveAt: lastActive,
      philosophyConfigured: philosophyCoachSet.has(c.id),
    });
  }

  // ---------------------------------------------------------------------------
  // USER ACTIVITY — team rollup, unassigned, summary
  // ---------------------------------------------------------------------------
  type Member = AdminDashboardData['userActivity']['teams'][number]['members'][number];
  const usersOnTeams = new Set<string>();

  // Per-team player team-name lookup (used later for freshness alerts etc.)
  const playerTeamName = new Map<string, string>();
  for (const [pid, tid] of playerToTeamId) {
    const t = teamsById.get(tid);
    if (t) playerTeamName.set(pid, t.name);
  }

  const userActivityTeams: AdminDashboardData['userActivity']['teams'] = [];
  for (const team of data.teams) {
    const season = team.season ?? '';
    const members: Member[] = [];
    const teamPlayerIds = teamIdToPlayerIds.get(team.id) ?? [];

    for (const pid of teamPlayerIds) {
      const player = playersById.get(pid);
      if (!player?.user_id) continue;
      const user = usersById.get(player.user_id);
      if (!user) continue;
      const lastSeen = userLastActive.get(user.id) ?? null;
      const stat = statsByPlayer.get(pid);
      usersOnTeams.add(user.id);
      const name = `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim() || null;
      members.push({
        id: user.id,
        email: user.email,
        name,
        role: user.role ?? 'player',
        created_at: user.created_at ?? '',
        last_seen: lastSeen,
        daysSinceLastSeen: daysSince(lastSeen),
        activityStatus: activityStatus(lastSeen, todayIso, ago7dIso, ago30dIso),
        roundsEntered: playerRoundCount.get(pid) ?? 0,
        lastRoundDate: playerLastRound.get(pid) ?? null,
        avgScore: stat?.scoring_average != null
          ? Math.round(Number(stat.scoring_average) * 10) / 10
          : null,
        insightsReceived: playerInsightCount.get(pid) ?? 0,
        roundReviews: playerReviewCount.get(pid) ?? 0,
        onboardingCompleted: player.onboarding_completed,
      });
    }

    // Coaches via team.organization_id === coach.organization_id
    if (team.organization_id) {
      for (const coach of data.coaches) {
        if (coach.organization_id !== team.organization_id) continue;
        if (!coach.user_id) continue;
        if (usersOnTeams.has(coach.user_id)) continue;
        const user = usersById.get(coach.user_id);
        if (!user) continue;
        const lastSeen = userLastActive.get(user.id) ?? null;
        usersOnTeams.add(user.id);
        members.push({
          id: user.id,
          email: user.email,
          name: (coach.full_name ?? '').trim() || null,
          role: 'coach',
          created_at: user.created_at ?? '',
          last_seen: lastSeen,
          daysSinceLastSeen: daysSince(lastSeen),
          activityStatus: activityStatus(lastSeen, todayIso, ago7dIso, ago30dIso),
          roundsEntered: 0,
          lastRoundDate: null,
          avgScore: null,
          insightsReceived: 0,
          roundReviews: 0,
          onboardingCompleted: coach.onboarding_completed,
        });
      }
    }

    const activeMemberCount = members.filter(
      m => m.activityStatus === 'active_today' || m.activityStatus === 'active_week',
    ).length;
    const playerMembersOnly = members.filter(m => m.role !== 'coach');
    const totalTeamRounds = playerMembersOnly.reduce((sum, m) => sum + m.roundsEntered, 0);
    const avgRoundsPerPlayer = playerMembersOnly.length > 0
      ? totalTeamRounds / playerMembersOnly.length
      : 0;
    const memberLastSeens = members
      .map(m => m.last_seen)
      .filter((s): s is string => s !== null)
      .sort();
    const lastTeamActivity = memberLastSeens.length > 0
      ? memberLastSeens[memberLastSeens.length - 1] ?? null
      : null;
    const activePct = members.length > 0 ? activeMemberCount / members.length : 0;
    const healthStatus: 'healthy' | 'warning' | 'critical' =
      activePct > 0.5 ? 'healthy' : activePct > 0.25 ? 'warning' : 'critical';

    const activityOrder: Record<string, number> = {
      active_today: 0,
      active_week: 1,
      active_month: 2,
      inactive: 3,
      never: 4,
    };
    members.sort((a, b) => {
      if (a.role === 'coach' && b.role !== 'coach') return -1;
      if (a.role !== 'coach' && b.role === 'coach') return 1;
      return (activityOrder[a.activityStatus] ?? 5) - (activityOrder[b.activityStatus] ?? 5);
    });

    userActivityTeams.push({
      teamId: team.id,
      teamName: team.name,
      season,
      memberCount: members.length,
      activeCount: activeMemberCount,
      avgRoundsPerPlayer: Math.round(avgRoundsPerPlayer * 10) / 10,
      lastTeamActivity,
      healthStatus,
      members,
    });
  }
  userActivityTeams.sort((a, b) => b.memberCount - a.memberCount);

  const unassignedUsers: AdminDashboardData['userActivity']['unassigned'] = data.users
    .filter(u => !usersOnTeams.has(u.id))
    .map(u => {
      const lastSeen = userLastActive.get(u.id) ?? null;
      const player = userIdToPlayer.get(u.id);
      const coach = userIdToCoach.get(u.id);
      const name = player
        ? `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim() || null
        : coach
          ? (coach.full_name ?? '').trim() || null
          : null;
      return {
        id: u.id,
        email: u.email,
        name,
        role: u.role ?? 'unknown',
        created_at: u.created_at ?? '',
        last_seen: lastSeen,
        daysSinceLastSeen: daysSince(lastSeen),
        activityStatus: activityStatus(lastSeen, todayIso, ago7dIso, ago30dIso),
        onboardingCompleted:
          player?.onboarding_completed ?? coach?.onboarding_completed ?? false,
      };
    })
    .sort((a, b) => {
      if (a.last_seen && b.last_seen) return b.last_seen.localeCompare(a.last_seen);
      if (a.last_seen) return -1;
      if (b.last_seen) return 1;
      return 0;
    });

  const summaryNeverLoggedIn = data.users.filter(u => !userLastActive.has(u.id)).length;
  const summaryActiveToday = data.users.filter(u => {
    const ls = userLastActive.get(u.id);
    return ls != null && ls >= todayIso;
  }).length;
  const summaryActiveWeek = data.users.filter(u => {
    const ls = userLastActive.get(u.id);
    return ls != null && ls >= ago7dIso;
  }).length;
  const summaryInactive14d = data.users.filter(u => {
    const ls = userLastActive.get(u.id);
    return ls != null && ls < ago14dIso;
  }).length;
  const summaryChurnRisk = summaryInactive14d;
  const summaryStuckInOnboarding = data.users.filter(u => {
    if (!u.created_at) return false;
    const signupDays = (Date.now() - new Date(u.created_at).getTime()) / 86_400_000;
    const player = userIdToPlayer.get(u.id);
    const coach = userIdToCoach.get(u.id);
    return (
      signupDays > 7 &&
      ((player && !player.onboarding_completed) || (coach && !coach.onboarding_completed))
    );
  }).length;

  const userActivity: AdminDashboardData['userActivity'] = {
    teams: userActivityTeams,
    unassigned: unassignedUsers,
    summary: {
      totalUsers: data.users.length,
      neverLoggedIn: summaryNeverLoggedIn,
      activeToday: summaryActiveToday,
      activeThisWeek: summaryActiveWeek,
      inactivePlus14d: summaryInactive14d,
      churnRisk: summaryChurnRisk,
      stuckInOnboarding: summaryStuckInOnboarding,
    },
  };

  // ---------------------------------------------------------------------------
  // FRESHNESS ALERTS
  // ---------------------------------------------------------------------------
  const churnRiskPlayers: AdminDashboardData['freshnessAlerts']['churnRiskPlayers'] = [];
  for (const [pid, lastRound] of playerLastRound) {
    const daysGone = Math.floor((Date.now() - new Date(lastRound).getTime()) / 86_400_000);
    if (daysGone < 7) continue;
    const player = playersById.get(pid);
    if (!player) continue;
    churnRiskPlayers.push({
      id: pid,
      name: `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim(),
      teamName: playerTeamName.get(pid) ?? null,
      daysSinceLastRound: daysGone,
      totalRounds: playerRoundCount.get(pid) ?? 0,
      lastRoundDate: lastRound,
    });
  }
  churnRiskPlayers.sort((a, b) => b.daysSinceLastRound - a.daysSinceLastRound);

  const inactiveTeams: AdminDashboardData['freshnessAlerts']['inactiveTeams'] = [];
  for (const team of data.teams) {
    const teamPlayerIds = teamIdToPlayerIds.get(team.id) ?? [];
    let latestActivity: Date | null = null;
    for (const pid of teamPlayerIds) {
      const player = playersById.get(pid);
      if (!player?.user_id) continue;
      const lastAct = userLastActive.get(player.user_id);
      if (!lastAct) continue;
      const d = new Date(lastAct);
      if (!latestActivity || d > latestActivity) latestActivity = d;
    }
    const daysGone = latestActivity
      ? Math.floor((Date.now() - latestActivity.getTime()) / 86_400_000)
      : 999;
    if (daysGone >= 7) {
      inactiveTeams.push({
        id: team.id,
        name: team.name,
        playerCount: teamPlayerIds.length,
        daysSinceAnyLogin: daysGone,
        lastActivityDate: latestActivity?.toISOString() ?? null,
      });
    }
  }
  inactiveTeams.sort((a, b) => b.daysSinceAnyLogin - a.daysSinceAnyLogin);

  const disengagedCoaches: AdminDashboardData['freshnessAlerts']['disengagedCoaches'] = [];
  for (const c of data.coaches) {
    const lastCheck = coachLastInsightAt.get(c.id);
    const daysGone = lastCheck
      ? Math.floor((Date.now() - new Date(lastCheck).getTime()) / 86_400_000)
      : 999;
    if (daysGone < 7) continue;
    let coachTeamName: string | null = null;
    if (c.organization_id) {
      const teamsForCoach = orgToTeams.get(c.organization_id) ?? [];
      const firstTeam = teamsForCoach[0];
      if (firstTeam) coachTeamName = firstTeam.name;
    }
    disengagedCoaches.push({
      id: c.id,
      name: (c.full_name ?? '').trim() || 'Unknown',
      teamName: coachTeamName,
      daysSinceInsightCheck: daysGone,
      totalInsightsAvailable: coachInsightCount.get(c.id) ?? 0,
      lastInsightCheckDate: lastCheck ?? null,
    });
  }
  disengagedCoaches.sort((a, b) => b.daysSinceInsightCheck - a.daysSinceInsightCheck);

  const freshnessAlerts: AdminDashboardData['freshnessAlerts'] = {
    churnRiskPlayers: churnRiskPlayers.slice(0, 50),
    inactiveTeams,
    disengagedCoaches,
  };

  // ---------------------------------------------------------------------------
  // BENCHMARKS
  // ---------------------------------------------------------------------------
  const teamComparisons: AdminDashboardData['benchmarks']['teamComparisons'] = data.teams.map(
    team => {
      const teamPlayerIds = teamIdToPlayerIds.get(team.id) ?? [];
      const teamStats = teamPlayerIds
        .map(pid => statsByPlayer.get(pid))
        .filter((s): s is RpcPlayerStat => !!s);
      const scores = teamStats
        .map(s => s.scoring_average)
        .filter((v): v is number => v != null)
        .map(Number);
      const fwPcts = teamStats
        .map(s => s.driving_accuracy)
        .filter((v): v is number => v != null)
        .map(Number);
      const girPcts = teamStats
        .map(s => s.gir_percentage)
        .filter((v): v is number => v != null)
        .map(Number);
      const puttsPer = teamStats
        .map(s => s.putts_per_round)
        .filter((v): v is number => v != null)
        .map(Number);
      return {
        id: team.id,
        name: team.name,
        playerCount: teamPlayerIds.length,
        avgScore: scores.length > 0
          ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
          : null,
        avgFairwayPct: fwPcts.length > 0
          ? Math.round((fwPcts.reduce((a, b) => a + b, 0) / fwPcts.length) * 10) / 10
          : null,
        avgGirPct: girPcts.length > 0
          ? Math.round((girPcts.reduce((a, b) => a + b, 0) / girPcts.length) * 10) / 10
          : null,
        avgPuttsPerRound: puttsPer.length > 0
          ? Math.round((puttsPer.reduce((a, b) => a + b, 0) / puttsPer.length) * 10) / 10
          : null,
        roundsThisMonth: roundsThisMonthByTeam.get(team.id) ?? 0,
        improvementTrend: null,
      };
    },
  );

  // Player trends (use stats cache's current avg; historical not available here)
  const playerTrends: AdminDashboardData['benchmarks']['playerTrends'] = [];
  const statsSorted = [...data.playerStats]
    .filter(s => s.scoring_average != null)
    .sort((a, b) => (a.scoring_average ?? 0) - (b.scoring_average ?? 0))
    .slice(0, 30);
  for (const s of statsSorted) {
    const currentAvg = Number(s.scoring_average);
    playerTrends.push({
      id: s.player_id,
      name: `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim(),
      teamName: playerTeamName.get(s.player_id) ?? null,
      scoringHistory: [],
      currentAvg,
      previousAvg: null,
      improvement: null,
    });
  }

  // AI correlation
  const aiPlayerIdSet = new Set<string>();
  for (const c of data.coaches) {
    if (!philosophyCoachSet.has(c.id)) continue;
    if (!c.organization_id) continue;
    const teamsForCoach = orgToTeams.get(c.organization_id) ?? [];
    for (const t of teamsForCoach) {
      const teamPlayers = teamIdToPlayerIds.get(t.id) ?? [];
      for (const pid of teamPlayers) aiPlayerIdSet.add(pid);
    }
  }
  const aiScores: number[] = [];
  const nonAiScores: number[] = [];
  for (const s of data.playerStats) {
    if (s.scoring_average == null) continue;
    const sc = Number(s.scoring_average);
    if (aiPlayerIdSet.has(s.player_id)) aiScores.push(sc);
    else nonAiScores.push(sc);
  }
  const avgOf = (xs: number[]): number | null =>
    xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  const avgScoreAI = avgOf(aiScores);
  const avgScoreNonAI = avgOf(nonAiScores);

  const benchmarks: AdminDashboardData['benchmarks'] = {
    teamComparisons,
    playerTrends,
    aiCorrelation: {
      playersWithAI: aiScores.length,
      playersWithoutAI: nonAiScores.length,
      avgScoreWithAI: avgScoreAI != null ? Math.round(avgScoreAI * 10) / 10 : null,
      avgScoreWithoutAI: avgScoreNonAI != null ? Math.round(avgScoreNonAI * 10) / 10 : null,
      avgImprovementWithAI: null,
      avgImprovementWithoutAI: null,
    },
  };

  // ---------------------------------------------------------------------------
  // PLAYER ENGAGEMENT SEGMENTS
  // ---------------------------------------------------------------------------
  let highEngagement = 0;
  let mediumEngagement = 0;
  let lowEngagement = 0;
  let dormant = 0;
  for (const player of data.players) {
    const pid = player.id;
    const lastRound = playerLastRound.get(pid);
    let weeklyRounds = 0;
    for (const r of allRoundsMinimal) {
      if (r.player_id === pid && r.created_at >= ago7dIso) weeklyRounds++;
    }
    const isActive30d = lastRound != null && lastRound >= ago30dIso;
    if (weeklyRounds >= 3) highEngagement++;
    else if (weeklyRounds >= 1) mediumEngagement++;
    else if (isActive30d) lowEngagement++;
    else dormant++;
  }
  const playerEngagement: AdminDashboardData['playerEngagement'] = {
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

  // ---------------------------------------------------------------------------
  // USER JOURNEY & STICKINESS
  // ---------------------------------------------------------------------------
  const allPlayerIdsWithRound = new Set<string>();
  const playersActive7d = new Set<string>();
  const playersActive30d = new Set<string>();
  const playersActive24h = new Set<string>();
  for (const r of allRoundsMinimal) {
    if (!r.player_id) continue;
    allPlayerIdsWithRound.add(r.player_id);
    if (r.created_at >= ago7dIso) playersActive7d.add(r.player_id);
    if (r.created_at >= ago30dIso) playersActive30d.add(r.player_id);
    if (r.created_at >= new Date(now.getTime() - 86_400_000).toISOString()) {
      playersActive24h.add(r.player_id);
    }
  }

  const totalSignupCount = data.users.length;
  const completedOnboardingCount =
    data.players.filter(p => p.onboarding_completed).length +
    data.coaches.filter(c => c.onboarding_completed).length;
  const submittedFirstRoundCount = allPlayerIdsWithRound.size;
  const activeThisWeekCount = playersActive7d.size;

  const userJourney: AdminDashboardData['userJourney'] = {
    totalSignups: totalSignupCount,
    completedOnboarding: completedOnboardingCount,
    submittedFirstRound: submittedFirstRoundCount,
    activeThisWeek: activeThisWeekCount,
  };

  const dau = playersActive24h.size;
  const wau = playersActive7d.size;
  const mau = playersActive30d.size;
  const stickiness: AdminDashboardData['stickiness'] = {
    dauMauRatio: mau > 0 ? Math.round((dau / mau) * 100) : 0,
    dau,
    wau,
    mau,
  };

  // ---------------------------------------------------------------------------
  // PLAYER FUNNEL
  // ---------------------------------------------------------------------------
  const uniqueInsightPlayers = new Set(data.playerInsightRollup.map(r => r.player_id)).size;
  const funnelStages = [
    { stage: 'Signed Up', count: totalSignupCount },
    { stage: 'Completed Onboarding', count: completedOnboardingCount },
    { stage: 'Submitted First Round', count: submittedFirstRoundCount },
    { stage: 'Active This Week', count: activeThisWeekCount },
    { stage: 'Received Insights', count: uniqueInsightPlayers },
  ];
  const funnelWithDropoff = funnelStages.map((item, idx) => {
    const prevCount = idx === 0 ? item.count : (funnelStages[idx - 1]?.count ?? item.count);
    const dropoff = Math.max(prevCount - item.count, 0);
    return {
      stage: item.stage,
      count: item.count,
      percentage: totalSignupCount > 0
        ? Math.round((item.count / totalSignupCount) * 100)
        : 0,
      dropoffFromPrevious: dropoff,
      dropoffPct: prevCount > 0 ? Math.round((dropoff / prevCount) * 100) : 0,
    };
  });

  const stuckUsers: AdminDashboardData['playerFunnel']['stuckUsers'] = [];
  const stuckAtSignup = data.users
    .filter(u => {
      const p = userIdToPlayer.get(u.id);
      const c = userIdToCoach.get(u.id);
      return (p && !p.onboarding_completed) || (c && !c.onboarding_completed);
    })
    .slice(0, 20)
    .map(u => {
      const p = userIdToPlayer.get(u.id);
      const c = userIdToCoach.get(u.id);
      const rawName = p
        ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()
        : c
          ? (c.full_name ?? '').trim()
          : '';
      const name = rawName || (u.email.split('@')[0] ?? '');
      return {
        id: u.id,
        name,
        email: u.email,
        daysSinceSignup: u.created_at
          ? Math.floor((Date.now() - new Date(u.created_at).getTime()) / 86_400_000)
          : 0,
        lastActiveAt: userLastActive.get(u.id) ?? null,
      };
    });
  if (stuckAtSignup.length > 0) stuckUsers.push({ stage: 'Signed Up', users: stuckAtSignup });

  const stuckAtOnboarding = data.users
    .filter(u => {
      const p = userIdToPlayer.get(u.id);
      return p && p.onboarding_completed && !allPlayerIdsWithRound.has(p.id);
    })
    .slice(0, 20)
    .map(u => {
      const p = userIdToPlayer.get(u.id);
      const name = p
        ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()
        : (u.email.split('@')[0] ?? '');
      return {
        id: u.id,
        name,
        email: u.email,
        daysSinceSignup: u.created_at
          ? Math.floor((Date.now() - new Date(u.created_at).getTime()) / 86_400_000)
          : 0,
        lastActiveAt: userLastActive.get(u.id) ?? null,
      };
    });
  if (stuckAtOnboarding.length > 0) {
    stuckUsers.push({ stage: 'Completed Onboarding', users: stuckAtOnboarding });
  }

  const playerFunnel: AdminDashboardData['playerFunnel'] = {
    funnel: funnelWithDropoff,
    stuckUsers,
  };

  // ---------------------------------------------------------------------------
  // INFRA HEALTH — we supply the values we own; dbHealth + clientErrors come
  // from Slice B when it merges (leave defaults here so the shape type-checks).
  // ---------------------------------------------------------------------------
  const infraHealth: AdminDashboardData['infraHealth'] = {
    apiPerf: [],
    clientErrors: [],
    dbHealth: {
      activeConnections: 0,
      idleConnections: 0,
      dbSizeBytes: 0,
      largestTables: [],
    },
    totals: {
      totalApiCalls7d: totalPageViews7d,
      avgResponseMs: 0,
      p95ResponseMs: 0,
      errorRate: data.errors7d > 0 && totalPageViews7d > 0
        ? Math.round((data.errors7d / totalPageViews7d) * 10_000) / 100
        : 0,
      totalClientErrors7d: data.errors7d,
    },
  };

  // ---------------------------------------------------------------------------
  // ERROR DETECTION — what we own: counts, unresolved admin_events. The
  // detailed byType/byRoute/byUser/userExperienceIssues groupings come from
  // Slice B's raw error_logs scan (this slice does NOT duplicate that read).
  // ---------------------------------------------------------------------------
  const lastErrorAt = data.adminErrorEvents
    .map(e => e.created_at)
    .filter((v): v is string => !!v)
    .sort()
    .reverse()[0] ?? null;

  const errorDetection: AdminDashboardData['errorDetection'] = {
    errors24h: data.errors24h,
    errors7d: data.errors7d,
    unresolvedErrors: data.adminErrorEventsUnresolved,
    errorsByType: [],
    errorsByRoute: [],
    errorsByUser: [],
    userExperienceIssues: {
      chunkLoadErrors: 0,
      frameworkWarnings: 0,
      serverErrors: 0,
      authErrors: 0,
    },
    lastErrorAt,
    allClear: data.errors7d === 0 && data.adminErrorEventsUnresolved === 0,
  };

  return {
    userActivity,
    cohortMatrix,
    benchmarks,
    coachIntelligence,
    sessionHeatmap,
    infraHealth,
    errorDetection,
    freshnessAlerts,
    playerEngagement,
    userJourney,
    stickiness,
    playerFunnel,
  };
}
