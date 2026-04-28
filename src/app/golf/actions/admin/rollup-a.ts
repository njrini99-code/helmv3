/**
 * Slice A — Admin dashboard rollup (C1 + C2 + C3 + C4).
 *
 * Replaces 51 ad-hoc `.from()` calls inside `getAdminDashboardData()` with
 * exactly 4 RPC round-trips. The matching SQL lives in
 * `supabase/migrations/20260421000005_admin_rollups_a.sql`.
 *
 * The RPC bodies are `SECURITY DEFINER` with an admin-role gate on
 * `auth.uid()`. This file uses `createAdminClient()` (service role) so the
 * calls succeed without a user session — but the gate still prevents
 * non-admin callers because it reads `auth.uid()`, which is `NULL` under the
 * service role. To make the gate pass via service-role, the orchestrator is
 * expected to verify the admin session OUT-OF-BAND (current admin-data.ts
 * pattern, L1469-1474) BEFORE invoking this wrapper — matching the existing
 * `cachedAdminDashboardData` flow.
 */

import { createClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Types mirroring the JSONB payloads returned by each RPC.
// ---------------------------------------------------------------------------

export interface RollupARoundsMinimalEntry {
  player_id: string;
  created_at: string;
  team_id: string | null;
}

export interface RollupARoundsPayload {
  generatedAt: string;
  activeUsers24h: number;
  activeUsers7d: number;
  activeUsers30d: number;
  /** Distinct player_ids with ≥1 round in last 30d. */
  playerSetActive30d: string[];
  /** Distinct player_ids active in the [30d, 60d) window — churn denominator. */
  playerSetActive30_60d: string[];
  /** Distinct player_ids active in last 7d (weekly retention numerator). */
  playersThisWeek: string[];
  roundsThisWeek: number;
  roundsLastWeek: number;
  roundsToday: number;
  totalRounds: number;
  completedRounds: number;
  verifiedRounds: number;
  lastRoundAt: string | null;
  /** `{ [roundType]: count }`, last 12 weeks. */
  roundsByType: Record<string, number>;
  roundsByWeek: { week: string; count: number }[];
  teamRoundsThisWeek: { team_id: string | null; player_id: string }[];
  /** Raw `total_score` values for completed rounds — TS buckets client-side. */
  scoringDistribution: number[];
  recentBestRounds: {
    total_score: number | null;
    score_to_par: number | null;
    course_name: string | null;
    round_date: string;
    golf_players: { first_name: string | null; last_name: string | null } | null;
  }[];
  recentRounds: {
    id: string;
    total_score: number | null;
    score_to_par: number | null;
    round_type: string | null;
    course_name: string | null;
    created_at: string | null;
    golf_players: { first_name: string | null; last_name: string | null } | null;
  }[];
  /** `{ [player_id]: round_count }` — replaces the full-table L2142 scan. */
  playerRoundCounts: Record<string, number>;
  /** `{ [player_id]: last_round_created_at }` — replaces L2144 scan. */
  playerLastRound: Record<string, string>;
  roundsByDay30d: { date: string; player_id: string | null }[];
  /**
   * Bounded to last 12 weeks. Also re-exposed at the top-level {@link RollupA}
   * shape as `allRoundsMinimal` so downstream slices don't have to reach
   * inside `rounds.*`.
   */
  allRoundsMinimal: RollupARoundsMinimalEntry[];
}

export interface RollupAUsersPayload {
  generatedAt: string;
  totalPlatformUsers: number;
  totalAdmins: number;
  newUsersThisWeek: number;
  newUsersLastWeek: number;
  totalCoaches: number;
  coachesOnboarded: number;
  totalPlayers: number;
  playersOnboarded: number;
  playersPending: number;
  activeTeamCount: number;
  signupsByWeek: { week: string; count: number }[];
  signupsByDay30d: { date: string; count: number }[];
  /** `{ [grad_year_or_'unknown']: count }`. */
  playersByYear: Record<string, number>;
  /** Per-team-member rows of (status, graduation_year) for TS aggregation. */
  playersByStatus: { status: string; graduation_year: number | null }[];
  latestSignups: { id: string; email: string; role: string; created_at: string | null }[];
  cohortWeeks: {
    /** Most-recent-7-days cohort. */
    w1: string[];
    w2: string[];
    w3: string[];
    /** Oldest (28→21d ago) cohort. */
    w4: string[];
  };
  usersForDirectory: {
    id: string;
    email: string;
    role: string;
    created_at: string | null;
    last_seen: string | null;
  }[];
  playerMap: {
    id: string;
    user_id: string | null;
    first_name: string | null;
    last_name: string | null;
    graduation_year: number | null;
    onboarding_completed: boolean | null;
  }[];
  coachMap: {
    id: string;
    user_id: string | null;
    full_name: string | null;
    email: string | null;
    organization_id: string | null;
    onboarding_completed: boolean | null;
  }[];
}

export interface FeatureCountPair {
  total: number;
  last30d: number;
}

export interface RollupAFeatureAdoptionPayload {
  generatedAt: string;
  qualifiers: FeatureCountPair;
  events: FeatureCountPair;
  tasks: FeatureCountPair;
  announcements: FeatureCountPair;
  messages: FeatureCountPair;
  documents: FeatureCountPair;
  travel: FeatureCountPair;
}

export interface RollupACoachhelmPayload {
  generatedAt: string;
  lastInsightAt: string | null;
  insightsThisWeek: number;
  insightsFailed7d: number;
  insightGenLog12w: { created_at: string; insights_generated: number }[];
  insightGenLog30dCount: number;
  insightsByWeek: { week: string; count: number }[];
  latestInsights: {
    id: string;
    insight_type: string | null;
    insights_generated: number | null;
    created_at: string | null;
  }[];
  insightPlayerRows: { player_id: string; insights_generated: number | null }[];
  totalReviewsAllTime: number;
  reviewsThisWeek: number;
  reviews30d: number;
  reviewsByWeek: { week: string; count: number }[];
  reviewedRoundIds: string[];
  totalPatterns: number;
  patterns30d: number;
  totalPredictions: number;
  predictions30d: number;
  coachPhilosophyCount: number;
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
}

/** Combined contract that downstream slices (B, C) and the orchestrator rely on. */
export interface RollupA {
  rounds: RollupARoundsPayload;
  users: RollupAUsersPayload;
  featureAdoption: RollupAFeatureAdoptionPayload;
  coachhelm: RollupACoachhelmPayload;
  /**
   * Bounded to the last 12 weeks — exposed at the top level so Slice C can
   * drop its own `golf_rounds` full-table scan at admin-data.ts L3224.
   */
  allRoundsMinimal: RollupARoundsMinimalEntry[];
}

// ---------------------------------------------------------------------------
// Time-window helpers (kept local so this file has no external deps beyond
// the admin client).
// ---------------------------------------------------------------------------

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// The `ago12w` anchor mirrors `weeksAgoMonday(12)` in admin-data.ts: back up
// 12 calendar weeks to the start of that week's Monday (UTC-aware).
function weeksAgoMondayIso(weeks: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - weeks * 7);
  const dow = d.getUTCDay(); // 0 = Sunday
  const diffToMonday = (dow + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// RPC call boundary — 4 parallel round-trips.
// ---------------------------------------------------------------------------

type RpcInvoker = <T>(fn: string, args?: Record<string, unknown>) => Promise<{
  data: T | null;
  error: unknown;
}>;

function describeRpcError(err: unknown): string {
  if (!err) return 'unknown error';
  if (err instanceof Error) return err.message;
  if (typeof err === 'object') {
    const e = err as Record<string, unknown>;
    const parts = [
      e.code ? `code=${e.code}` : null,
      e.message ? `msg=${e.message}` : null,
      e.details ? `details=${e.details}` : null,
      e.hint ? `hint=${e.hint}` : null,
      // Some PostgREST errors come through as { error_description, statusText }
      // when transport-level (network, 502, etc). Capture those too so we
      // never fall through to the [object Object] String() coercion.
      e.error ? `error=${typeof e.error === 'string' ? e.error : 'object'}` : null,
      e.error_description ? `desc=${e.error_description}` : null,
      e.statusText ? `statusText=${e.statusText}` : null,
      e.status ? `status=${e.status}` : null,
      e.name ? `name=${e.name}` : null,
    ].filter(Boolean);
    if (parts.length) return parts.join(' ');
  }
  // Use a circular-safe replacer so we never hit the String(err) =
  // "[object Object]" fallback — that's exactly the toxic log we're fixing.
  try {
    const seen = new WeakSet<object>();
    return JSON.stringify(err, (_k, v) => {
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[circular]';
        seen.add(v);
      }
      return v;
    });
  } catch {
    // Last-resort: enumerate own keys so we at least get "{a, b, c}"
    if (typeof err === 'object' && err) {
      const keys = Object.keys(err as object).join(',');
      return `unserializable error{keys:${keys}}`;
    }
    return String(err);
  }
}

function unwrap<T>(label: string, res: { data: T | null; error: unknown }): T {
  if (res.error) {
    if (res.error instanceof Error) throw res.error;
    throw new Error(`${label} RPC failed: ${describeRpcError(res.error)}`);
  }
  if (res.data === null || res.data === undefined) {
    throw new Error(`${label} RPC returned empty payload`);
  }
  return res.data;
}

/**
 * Invokes the 4 slice-A RPCs in parallel and returns a typed {@link RollupA}.
 * Must be called after the caller has already verified the invoking user is
 * an admin (see admin-data.ts auth gate at L1469-1474); the SQL function
 * bodies also enforce an admin-role check, so this is defence-in-depth.
 */
export async function fetchAdminRollupA(): Promise<RollupA> {
  // Use the request-scoped client so auth.uid() is the invoking admin.
  // The RPC bodies check `SELECT 1 FROM users WHERE id = auth.uid()` which
  // returns NULL when called with the service_role JWT.
  const supabase = await createClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as RpcInvoker;

  const today = startOfTodayIso();
  const ago24h = daysAgoIso(1);
  const ago7d = daysAgoIso(7);
  const ago14d = daysAgoIso(14);
  const ago30d = daysAgoIso(30);
  const ago60d = daysAgoIso(60);
  const ago12w = weeksAgoMondayIso(12);

  const [roundsRes, usersRes, adoptionRes, coachhelmRes] = await Promise.all([
    rpc<RollupARoundsPayload>('get_admin_rounds_rollup', {
      p_today: today,
      p_ago24h: ago24h,
      p_ago7d: ago7d,
      p_ago14d: ago14d,
      p_ago30d: ago30d,
      p_ago60d: ago60d,
      p_ago12w: ago12w,
    }),
    rpc<RollupAUsersPayload>('get_admin_users_rollup', {
      p_ago7d: ago7d,
      p_ago14d: ago14d,
      p_ago30d: ago30d,
      p_ago12w: ago12w,
    }),
    rpc<RollupAFeatureAdoptionPayload>('get_admin_feature_adoption_rollup', {
      p_ago30d: ago30d,
    }),
    rpc<RollupACoachhelmPayload>('get_admin_coachhelm_rollup', {
      p_ago7d: ago7d,
      p_ago30d: ago30d,
      p_ago12w: ago12w,
    }),
  ]);

  const rounds = unwrap('get_admin_rounds_rollup', roundsRes);
  const users = unwrap('get_admin_users_rollup', usersRes);
  const featureAdoption = unwrap('get_admin_feature_adoption_rollup', adoptionRes);
  const coachhelm = unwrap('get_admin_coachhelm_rollup', coachhelmRes);

  return {
    rounds,
    users,
    featureAdoption,
    coachhelm,
    // Top-level hoist so Slice C doesn't have to reach into `rounds.*`.
    allRoundsMinimal: rounds.allRoundsMinimal ?? [],
  };
}
