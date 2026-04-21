/**
 * Slice B — Admin dashboard rollup (C5 + C6 + C7).
 *
 * Replaces 32 ad-hoc `.from()` calls inside `getAdminDashboardData()` with
 * exactly 3 RPC round-trips. The matching SQL lives in
 * `supabase/migrations/20260421000006_admin_rollups_b.sql`.
 *
 * Coverage:
 *   - C5  get_admin_baseball_rollup         — 14 baseball_* counts/aggregates
 *   - C6  get_admin_errors_rollup           — error_logs + admin_events +
 *                                              audit_log + login_attempts, and
 *                                              wraps the existing
 *                                              get_error_summary +
 *                                              get_admin_event_summary RPCs
 *                                              with resilient error handling.
 *   - C7  get_admin_teams_scoring_rollup    — golf_teams + rosters + scoring +
 *                                              strokes-gained + demo_requests +
 *                                              golf_communication
 *
 * The RPC bodies are SECURITY DEFINER with an admin-role gate on `auth.uid()`
 * (with a service_role bypass for the service-role client used here). The
 * orchestrator in `admin-data.ts` still verifies the admin session
 * out-of-band before invoking this wrapper (see admin-data.ts L1469-1474) —
 * defence-in-depth matches Slice A.
 *
 * Resilience — Slice B specific:
 *   The underlying `get_error_summary` and `get_admin_event_summary` RPCs are
 *   wrapped inside the C6 Postgres function with BEGIN/EXCEPTION blocks, so
 *   when they fail the SQL returns `null` for those sub-objects rather than
 *   raising. This TS wrapper translates the nulls into the existing
 *   `errorSummaryDegraded` / `adminEventSummaryDegraded` flags on the RollupB
 *   output, preserving the current behaviour in admin-data.ts.
 *   `fetchAdminRollupB()` itself MUST NOT throw from a degraded sub-RPC — only
 *   a hard RPC transport failure (network, auth) may propagate.
 */

import { createAdminClient } from '@/lib/supabase/admin';

// ---------------------------------------------------------------------------
// C5 — Baseball
// ---------------------------------------------------------------------------

export interface RollupBBaseballRaw {
  total_players: number;
  total_coaches: number;
  watchlist_stages: Record<string, number>;
  recruiting_activated_players: number;
  videos_30d: number;
  engagement_events_30d: number;
  messages_30d: number;
  conversations_30d: number;
  players_onboarded: number;
  coaches_onboarded: number;
  total_teams: number;
  total_events: number;
  total_camps: number;
}

/** Matches `AdminDashboardData.baseball` (admin-data.ts L456-L472). */
export interface RollupBBaseball {
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
}

// ---------------------------------------------------------------------------
// C6 — Errors / audit / admin_events / login security
// ---------------------------------------------------------------------------

export interface RollupBRawErrorLogEntry {
  id: string;
  message: string;
  severity: string | null;
  stack: string | null;
  url: string | null;
  user_id: string | null;
  context: Record<string, unknown> | null;
  created_at: string | null;
}

export interface RollupBRawErrorSummary {
  by_severity: { severity: string; count: number }[];
  top_errors: {
    message: string;
    severity: string;
    occurrences: number;
    first_seen: string;
    last_seen: string;
    affected_users: number;
  }[];
  daily_rate: { day: string; count: number }[];
  total_count: number;
  critical_count: number;
}

export interface RollupBRawAuditEntry {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  table_name: string | null;
  record_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
}

export interface RollupBRawLoginAttempt {
  email: string;
  failed_attempts: number | null;
  last_attempt: string | null;
  locked_until: string | null;
}

export interface RollupBRawAdminEventRecent {
  id: string;
  event_type: string;
  severity: string;
  title: string;
  message: string | null;
  user_id: string | null;
  user_email: string | null;
  url: string | null;
  resolved: boolean | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

export interface RollupBRawAdminEventErrorOnly extends RollupBRawAdminEventRecent {
  metadata: Record<string, unknown> | null;
}

export interface RollupBRawAdminEventSummary {
  total_events: number;
  error_count: number;
  critical_count: number;
  unresolved_count: number;
  events_by_type: Record<string, number>;
  events_by_severity: Record<string, number>;
  events_by_day: { date: string; count: number }[];
}

/** Matches `AdminDashboardData.loginSecurity` (admin-data.ts L444-L454). */
export interface RollupBLoginSecurity {
  failedLogins7d: number;
  lockedAccounts: number;
  recentAttempts: {
    email: string;
    failedAttempts: number;
    lastAttempt: string | null;
    lockedUntil: string | null;
  }[];
}

/**
 * Subset of `AdminDashboardData.errorLogs` that Slice B owns as RAW data.
 * The TS post-processor in admin-data.ts (L714-987) still runs incident-key
 * normalisation, narrative synthesis, and counting on top.
 */
export interface RollupBErrors {
  recentErrorLogs: RollupBRawErrorLogEntry[];
  totalErrors7d: number;
  criticalErrors7d: number;
  errors24hCount: number;
  /** `null` when get_error_summary failed — caller sets errorSummaryDegraded. */
  errorSummary: RollupBRawErrorSummary | null;
  errorSummaryDegraded: boolean;
}

/** Matches `AdminDashboardData.auditLog`. */
export interface RollupBAuditLog {
  totalEvents7d: number;
  recentRaw: RollupBRawAuditEntry[];
}

export interface RollupBAdminEvents {
  recentRaw: RollupBRawAdminEventRecent[];
  errorOnlyRaw: RollupBRawAdminEventErrorOnly[];
  unresolvedCritical: {
    id: string;
    event_type: string;
    severity: string;
    title: string;
    message: string | null;
    resolved: boolean | null;
    created_at: string;
  }[];
  /** `null` when get_admin_event_summary failed. */
  summary: RollupBRawAdminEventSummary | null;
  adminEventSummaryDegraded: boolean;
}

// ---------------------------------------------------------------------------
// C7 — Teams / rosters / scoring / demo / communication
// ---------------------------------------------------------------------------

export interface RollupBTeam {
  id: string;
  name: string;
  organization_id: string | null;
  org_name: string | null;
}

export interface RollupBTeamMember {
  team_id: string;
  player_id: string;
  first_name: string | null;
  last_name: string | null;
}

export interface RollupBPlayerTeamMap {
  player_id: string;
  team_id: string;
  team_name: string;
}

export interface RollupBCoachOrg {
  organization_id: string | null;
}

export interface RollupBTeamRoundWeek {
  player_id: string | null;
  team_id: string | null;
}

export interface RollupBPlayerStatsRow {
  player_id: string;
  scoring_average: number | null;
  driving_accuracy_percentage: number | null;
  gir_percentage: number | null;
  putts_per_round: number | null;
  rounds_played: number | null;
  first_name: string | null;
  last_name: string | null;
}

export interface RollupBBestRound {
  total_score: number | null;
  score_to_par: number | null;
  course_name: string | null;
  round_date: string | null;
  first_name: string | null;
  last_name: string | null;
}

export interface RollupBStrokesGained {
  sg_total: number | null;
  sg_tee: number | null;
  sg_approach: number | null;
  sg_around_green: number | null;
  sg_putting: number | null;
}

export interface RollupBDemoRecent {
  name: string | null;
  email: string;
  organization: string | null;
  interest_type: string | null;
  status: string | null;
  created_at: string | null;
}

/** Matches `AdminDashboardData.demoRequests`. */
export interface RollupBDemoRequests {
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
}

/** Matches `AdminDashboardData.golfCommunication`. */
export interface RollupBGolfCommunication {
  totalAnnouncements: number;
  announcementAckRate: number | null;
  totalGolfMessages: number;
  totalConversations: number;
}

/** Matches `AdminDashboardData.strokesGained`. */
export interface RollupBStrokesGainedShaped {
  sgTotal: number | null;
  sgTee: number | null;
  sgApproach: number | null;
  sgAroundGreen: number | null;
  sgPutting: number | null;
}

/**
 * Raw team-related arrays. The orchestrator in admin-data.ts will build the
 * `teams[]` and `teamRosters[]` shapes by joining these with Slice A's
 * `playerMap` / `coachMap` / `playerRoundCounts` / `playerLastRound`.
 *
 * Slice B intentionally does NOT own the final shaping of `teams[]` and
 * `teamRosters[]` because those rollups depend on Slice A outputs. The
 * convenience fields are exposed on this object so the orchestrator can
 * assemble without pulling additional data.
 */
export interface RollupBTeamsScoring {
  teams: RollupBTeam[];
  teamMembers: RollupBTeamMember[];
  playerTeamMap: RollupBPlayerTeamMap[];
  coachOrgs: RollupBCoachOrg[];
  teamRoundsWeek: RollupBTeamRoundWeek[];
  playerStatsTop50: RollupBPlayerStatsRow[];
  scoringDistribution: number[];
  recentBestRounds: RollupBBestRound[];
  strokesGainedAverages: RollupBStrokesGained | null;
  statsCacheLastUpdated: string | null;
  attendancePercentages: number[];
}

// ---------------------------------------------------------------------------
// Combined Slice B contract
// ---------------------------------------------------------------------------

/**
 * Typed aggregate of the three C5/C6/C7 RPC payloads. The admin-data.ts
 * orchestrator consumes this and merges it into `AdminDashboardData`.
 */
export interface RollupB {
  /** Final shape matching `AdminDashboardData.baseball`. */
  baseball: RollupBBaseball;

  /** Raw + summary errorLogs payload (TS narrative runs after this). */
  errors: RollupBErrors;

  /** Raw admin events + summary (TS assembles recentEvents etc. from here). */
  adminEvents: RollupBAdminEvents;

  /** Raw arrays for team / roster / scoring shaping (owned by orchestrator). */
  teams: RollupBTeamsScoring;

  /** Alias into `teams` for future independent shaping. */
  teamRosters: {
    teams: RollupBTeam[];
    teamMembers: RollupBTeamMember[];
    coachOrgs: RollupBCoachOrg[];
  };

  /** Raw scoring arrays — orchestrator renders `scoring.*`. */
  scoring: {
    topPerformersRaw: RollupBPlayerStatsRow[];
    scoringDistributionRaw: number[];
    recentBestRoundsRaw: RollupBBestRound[];
    platformAverages: {
      platformScoringAvg: number | null;
      platformFairwayPct: number | null;
      platformGirPct: number | null;
      platformPuttsPerRound: number | null;
    };
  };

  /** Final demo_requests shape ready for AdminDashboardData. */
  demoRequests: RollupBDemoRequests;

  /** Final golfCommunication shape ready for AdminDashboardData. */
  golfCommunication: RollupBGolfCommunication;

  /** Final strokesGained shape (rounded to 2 dp) ready for AdminDashboardData. */
  strokesGained: RollupBStrokesGainedShaped;

  /** Final loginSecurity shape ready for AdminDashboardData. */
  loginSecurity: RollupBLoginSecurity;

  /** Raw auditLog arrays + totals. */
  auditLog: RollupBAuditLog;
}

// ---------------------------------------------------------------------------
// Time-window helpers (mirrors rollup-a.ts)
// ---------------------------------------------------------------------------

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// RPC call boundary
// ---------------------------------------------------------------------------

type RpcInvoker = <T>(fn: string, args?: Record<string, unknown>) => Promise<{
  data: T | null;
  error: unknown;
}>;

/**
 * Raw payload returned by `public.get_admin_errors_rollup()`.
 */
interface RawErrorsPayload {
  error_logs: {
    recent: RollupBRawErrorLogEntry[];
    total_7d: number;
    critical_7d: number;
    count_24h: number;
  };
  error_summary: RollupBRawErrorSummary | null;
  audit_log: {
    recent: RollupBRawAuditEntry[];
    total_7d: number;
  };
  login_security: {
    recent: RollupBRawLoginAttempt[];
    locked_count: number;
  };
  admin_events: {
    recent: RollupBRawAdminEventRecent[];
    unresolved_critical: {
      id: string;
      event_type: string;
      severity: string;
      title: string;
      message: string | null;
      resolved: boolean | null;
      created_at: string;
    }[];
    error_only: RollupBRawAdminEventErrorOnly[];
    summary: RollupBRawAdminEventSummary | null;
  };
}

/**
 * Raw payload returned by `public.get_admin_teams_scoring_rollup()`.
 */
interface RawTeamsScoringPayload {
  teams: RollupBTeam[];
  team_members: RollupBTeamMember[];
  team_rounds_week: RollupBTeamRoundWeek[];
  player_stats_top50: RollupBPlayerStatsRow[];
  player_team_map: RollupBPlayerTeamMap[];
  coach_orgs: RollupBCoachOrg[];
  scoring_distribution: number[];
  recent_best_rounds: RollupBBestRound[];
  strokes_gained: RollupBStrokesGained | null;
  stats_cache_last_updated: string | null;
  demo_requests: {
    total: number;
    pending: number;
    recent: RollupBDemoRecent[];
  };
  golf_communication: {
    total_announcements: number;
    ack_count: number;
    total_messages: number;
    total_conversations: number;
  };
  attendance_percentages: number[];
}

/**
 * Average scoring helpers. Mirrors the TS-side aggregation in admin-data.ts
 * L1799-L1815 so the orchestrator receives a ready-to-use `platformAverages`.
 */
function avgOfNonNull(values: (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return nums.reduce((s, v) => s + Number(v), 0) / nums.length;
}

function round2(v: number | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/**
 * Invokes the 3 slice-B RPCs in parallel and returns a typed {@link RollupB}.
 *
 * Contract:
 *   - Does NOT throw when `get_error_summary` / `get_admin_event_summary` are
 *     degraded — returns `errorSummaryDegraded` / `adminEventSummaryDegraded`
 *     flags on the output.
 *   - DOES throw on transport errors (network, RPC not found, invalid JSON).
 *
 * Callers must have already verified the invoking user is an admin — the SQL
 * function bodies enforce the check too, but the orchestrator layer validates
 * it out-of-band (admin-data.ts L1469-1474).
 */
export async function fetchAdminRollupB(): Promise<RollupB> {
  const admin = createAdminClient();
  // Wrap admin.rpc in a closure to preserve `this` binding — extracting the
  // method directly strips the binding and breaks at runtime with
  // "Cannot read properties of undefined (reading 'rest')".
  const rpc: RpcInvoker = <T>(fn: string, args?: Record<string, unknown>) =>
    (admin.rpc as unknown as (
      f: string,
      a?: Record<string, unknown>,
    ) => Promise<{ data: T | null; error: unknown }>)(fn, args);

  const ago7d = daysAgoIso(7);
  const ago24h = daysAgoIso(1);
  const ago30d = daysAgoIso(30);

  const [baseballRes, errorsRes, teamsRes] = await Promise.all([
    rpc<RollupBBaseballRaw>('get_admin_baseball_rollup', { p_ago30d: ago30d }),
    rpc<RawErrorsPayload>('get_admin_errors_rollup', {
      p_ago7d: ago7d,
      p_ago24h: ago24h,
    }),
    rpc<RawTeamsScoringPayload>('get_admin_teams_scoring_rollup', {
      p_ago7d: ago7d,
    }),
  ]);

  // --- Transport errors must surface — these are NOT degradation scenarios. ---
  if (baseballRes.error) {
    throw baseballRes.error instanceof Error
      ? baseballRes.error
      : new Error(`get_admin_baseball_rollup failed: ${String(baseballRes.error)}`);
  }
  if (errorsRes.error) {
    throw errorsRes.error instanceof Error
      ? errorsRes.error
      : new Error(`get_admin_errors_rollup failed: ${String(errorsRes.error)}`);
  }
  if (teamsRes.error) {
    throw teamsRes.error instanceof Error
      ? teamsRes.error
      : new Error(`get_admin_teams_scoring_rollup failed: ${String(teamsRes.error)}`);
  }

  const baseballRaw = baseballRes.data;
  const errorsRaw = errorsRes.data;
  const teamsRaw = teamsRes.data;

  if (!baseballRaw) throw new Error('get_admin_baseball_rollup returned empty payload');
  if (!errorsRaw) throw new Error('get_admin_errors_rollup returned empty payload');
  if (!teamsRaw) throw new Error('get_admin_teams_scoring_rollup returned empty payload');

  // -------------------------------------------------------------------------
  // C5 — baseball (snake_case → camelCase + compute recruitingActivePlayers /
  // commitments from watchlist stages, mirroring admin-data.ts L2997-3003 and
  // L4825-4841 exactly).
  // -------------------------------------------------------------------------
  const watchlistStages = baseballRaw.watchlist_stages ?? {};
  const recruitingActivePlayers = Object.values(watchlistStages).reduce(
    (s, v) => s + (Number(v) || 0),
    0,
  );
  const commitments = Number(watchlistStages['committed'] ?? 0);

  const baseball: RollupBBaseball = {
    totalPlayers: baseballRaw.total_players ?? 0,
    totalCoaches: baseballRaw.total_coaches ?? 0,
    watchlistStages,
    recruitingActivePlayers,
    commitments,
    videos30d: baseballRaw.videos_30d ?? 0,
    engagementEvents30d: baseballRaw.engagement_events_30d ?? 0,
    messages30d: baseballRaw.messages_30d ?? 0,
    conversations30d: baseballRaw.conversations_30d ?? 0,
    playersOnboarded: baseballRaw.players_onboarded ?? 0,
    coachesOnboarded: baseballRaw.coaches_onboarded ?? 0,
    totalTeams: baseballRaw.total_teams ?? 0,
    totalEvents: baseballRaw.total_events ?? 0,
    totalCamps: baseballRaw.total_camps ?? 0,
    recruitingActivatedPlayers: baseballRaw.recruiting_activated_players ?? 0,
  };

  // -------------------------------------------------------------------------
  // C6 — errors / audit / admin_events / login security
  // -------------------------------------------------------------------------
  const errorSummaryDegraded = errorsRaw.error_summary === null;
  const adminEventSummaryDegraded = errorsRaw.admin_events.summary === null;

  const errors: RollupBErrors = {
    recentErrorLogs: errorsRaw.error_logs.recent ?? [],
    totalErrors7d: errorsRaw.error_logs.total_7d ?? 0,
    criticalErrors7d: errorsRaw.error_logs.critical_7d ?? 0,
    errors24hCount: errorsRaw.error_logs.count_24h ?? 0,
    errorSummary: errorsRaw.error_summary,
    errorSummaryDegraded,
  };

  const adminEvents: RollupBAdminEvents = {
    recentRaw: errorsRaw.admin_events.recent ?? [],
    errorOnlyRaw: errorsRaw.admin_events.error_only ?? [],
    unresolvedCritical: errorsRaw.admin_events.unresolved_critical ?? [],
    summary: errorsRaw.admin_events.summary,
    adminEventSummaryDegraded,
  };

  const auditLog: RollupBAuditLog = {
    totalEvents7d: errorsRaw.audit_log.total_7d ?? 0,
    recentRaw: errorsRaw.audit_log.recent ?? [],
  };

  const loginAttempts = errorsRaw.login_security.recent ?? [];
  const loginSecurity: RollupBLoginSecurity = {
    // Mirrors admin-data.ts L2653 — sum of recent-20 failed counts.
    failedLogins7d: loginAttempts.reduce(
      (s, l) => s + (l.failed_attempts ?? 0),
      0,
    ),
    lockedAccounts: errorsRaw.login_security.locked_count ?? 0,
    recentAttempts: loginAttempts.map((l) => ({
      email: l.email,
      failedAttempts: l.failed_attempts ?? 0,
      lastAttempt: l.last_attempt,
      lockedUntil: l.locked_until,
    })),
  };

  // -------------------------------------------------------------------------
  // C7 — teams / rosters / scoring / demo / communication
  // -------------------------------------------------------------------------
  const statsRows = teamsRaw.player_stats_top50 ?? [];
  const platformScoringAvg = avgOfNonNull(statsRows.map((r) => r.scoring_average));
  const platformFairwayPct = avgOfNonNull(
    statsRows.map((r) => r.driving_accuracy_percentage),
  );
  const platformGirPct = avgOfNonNull(statsRows.map((r) => r.gir_percentage));
  const platformPuttsPerRound = avgOfNonNull(
    statsRows.map((r) => r.putts_per_round),
  );

  const teamsScoring: RollupBTeamsScoring = {
    teams: teamsRaw.teams ?? [],
    teamMembers: teamsRaw.team_members ?? [],
    playerTeamMap: teamsRaw.player_team_map ?? [],
    coachOrgs: teamsRaw.coach_orgs ?? [],
    teamRoundsWeek: teamsRaw.team_rounds_week ?? [],
    playerStatsTop50: statsRows,
    scoringDistribution: teamsRaw.scoring_distribution ?? [],
    recentBestRounds: teamsRaw.recent_best_rounds ?? [],
    strokesGainedAverages: teamsRaw.strokes_gained,
    statsCacheLastUpdated: teamsRaw.stats_cache_last_updated,
    attendancePercentages: teamsRaw.attendance_percentages ?? [],
  };

  const demoRecent = teamsRaw.demo_requests.recent ?? [];
  const demoTotal = teamsRaw.demo_requests.total ?? 0;
  const demoPending = teamsRaw.demo_requests.pending ?? 0;

  const demoRequests: RollupBDemoRequests = {
    total: demoTotal,
    pending: demoPending,
    contacted: Math.max(demoTotal - demoPending, 0),
    recentRequests: demoRecent.map((d) => ({
      name: d.name ?? '',
      email: d.email,
      organization: d.organization,
      interestType: d.interest_type,
      status: d.status ?? '',
      createdAt: d.created_at ?? '',
    })),
  };

  // Mirrors admin-data.ts L4849-4854.
  const totalAnnouncements = teamsRaw.golf_communication.total_announcements ?? 0;
  const ackCount = teamsRaw.golf_communication.ack_count ?? 0;
  const announcementAckRate = totalAnnouncements > 0
    ? Math.min(ackCount / totalAnnouncements, 1)
    : null;
  const golfCommunication: RollupBGolfCommunication = {
    totalAnnouncements,
    announcementAckRate,
    totalGolfMessages: teamsRaw.golf_communication.total_messages ?? 0,
    totalConversations: teamsRaw.golf_communication.total_conversations ?? 0,
  };

  // Mirrors admin-data.ts L4855-4861 (rounded to 2 dp).
  const sg = teamsRaw.strokes_gained;
  const strokesGained: RollupBStrokesGainedShaped = {
    sgTotal: round2(sg?.sg_total ?? null),
    sgTee: round2(sg?.sg_tee ?? null),
    sgApproach: round2(sg?.sg_approach ?? null),
    sgAroundGreen: round2(sg?.sg_around_green ?? null),
    sgPutting: round2(sg?.sg_putting ?? null),
  };

  return {
    baseball,
    errors,
    adminEvents,
    teams: teamsScoring,
    teamRosters: {
      teams: teamsScoring.teams,
      teamMembers: teamsScoring.teamMembers,
      coachOrgs: teamsScoring.coachOrgs,
    },
    scoring: {
      topPerformersRaw: statsRows,
      scoringDistributionRaw: teamsScoring.scoringDistribution,
      recentBestRoundsRaw: teamsScoring.recentBestRounds,
      platformAverages: {
        platformScoringAvg,
        platformFairwayPct,
        platformGirPct,
        platformPuttsPerRound,
      },
    },
    demoRequests,
    golfCommunication,
    strokesGained,
    loginSecurity,
    auditLog,
  };
}
