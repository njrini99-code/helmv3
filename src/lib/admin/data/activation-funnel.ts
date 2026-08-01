import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { trailingUtcDays, bucketDailyCounts, type AdminClient, type DailyCount } from './auth';

/**
 * "First 7 Days" — signup → onboarded → activated runway, split by sport.
 *
 * SCOPING DECISION (documented, not a bug): every gate here counts PLAYERS
 * ONLY. The literal activation event — "logged a round" (golf) / a team
 * logging a game (baseball) — is a player-side behavior; a coach signing up
 * doesn't have a directly-attributable equivalent action in the schema
 * (a coach's TEAM activating is a downstream, multi-hop signal already
 * partially covered by TeamHealthTable / checkStuckOnboarding elsewhere on
 * the Bridge). Folding coach counts into these gates would either fabricate
 * a coach-level activation join this schema can't honestly support, or break
 * the funnel's monotonic Signed Up >= Onboarded >= Activated shape. Coach
 * onboarding is already tracked platform-wide by checkStuckOnboarding
 * (src/lib/admin/data/briefing.ts).
 *
 * Column verification (per house rules — every column below confirmed
 * against src/lib/types/database.ts before use):
 *   users                 ~L19234  (created_at, role — NOT used directly here;
 *                                    profile-row created_at is the signup
 *                                    proxy instead, see note below)
 *   golf_players           ~L14177  id, user_id, created_at, updated_at,
 *                                    onboarding_completed
 *   baseball_players        ~L5383  id, user_id, created_at, updated_at,
 *                                    onboarding_completed
 *   golf_rounds             ~L15233 player_id, created_at
 *   baseball_team_members    ~L8021 player_id, team_id, status
 *   baseball_games           ~L3331 team_id, created_at
 *
 * SIGNUP TIMESTAMP PROXY: `users.created_at` has no sport column to split
 * on, and a user's sport is only knowable once their {sport}_players row
 * exists. golf/baseball signupAction (see src/app/golf/actions/auth.ts:400,
 * src/app/baseball/actions/auth.ts equivalent) creates the `users` row then
 * immediately redirects into onboarding, which creates the profile row —
 * this mirrors the exact convention checkStuckOnboarding already uses
 * (src/lib/admin/data/briefing.ts:197-215): the profile table's own
 * `created_at` IS the signup-attribution timestamp for that sport.
 */

const ONBOARD_SAMPLE_CAP = 400;
const ACTIVATION_ROWS_CAP = 2000;

interface CohortRow {
  id: string;
  created_at: string;
  updated_at: string;
}

export interface SportRunway {
  signedUpCount: number;
  onboardedCount: number;
  activatedCount: number;
  /** Median hours from profile-row creation → onboarding_completed flip
   *  (proxied by the profile row's own `updated_at` — see medianHours doc). */
  medianOnboardHours: number | null;
  /** Median hours from onboarding completion → first activation event. */
  medianActivateHours: number | null;
  /** Same two medians for the PRECEDING 7-day cohort — feeds the Dial's
   *  week-over-week regression coloring (amber if trending up). */
  prevMedianOnboardHours: number | null;
  prevMedianActivateHours: number | null;
  /** True if the onboarded-row sample used for activation matching + median
   *  hit ONBOARD_SAMPLE_CAP — the displayed onboardedCount is still exact
   *  (from a separate head:true count), only activatedCount/medians would
   *  undercount in this (currently unrealistic at this app's scale) case. */
  activationSampleTruncated: boolean;
  dailySignups30d: DailyCount[];
}

export interface ActivationFunnelResult {
  golf: SportRunway;
  baseball: SportRunway;
}

/** Median of (end - start) in hours. Negative deltas (data anomalies — e.g.
 *  a profile `updated_at` that drifted before its own `created_at`) are
 *  dropped rather than clamped, matching the honesty contract elsewhere in
 *  Bridge: exclude what can't be trusted, never fabricate a floor of 0. */
export function medianHours(pairs: ReadonlyArray<{ start: string; end: string }>): number | null {
  const deltas = pairs
    .map(({ start, end }) => (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000)
    .filter((h) => Number.isFinite(h) && h >= 0);
  if (deltas.length === 0) return null;
  deltas.sort((a, b) => a - b);
  const mid = Math.floor(deltas.length / 2);
  return deltas.length % 2 === 0 ? ((deltas[mid - 1] as number) + (deltas[mid] as number)) / 2 : (deltas[mid] as number);
}

interface WindowStats {
  signedUpCount: number;
  onboardedCount: number;
  onboardedRows: CohortRow[];
  medianOnboardHours: number | null;
}

function toCohortRows(
  rows: ReadonlyArray<{ id: string; created_at: string | null; updated_at: string | null }>,
): CohortRow[] {
  return rows.filter(
    (r): r is CohortRow => r.created_at !== null && r.updated_at !== null,
  );
}

async function fetchGolfWindowStats(admin: AdminClient, startIso: string, endIso: string): Promise<WindowStats> {
  const [signedUpRes, onboardedRes] = await Promise.all([
    admin.from('golf_players').select('id', { count: 'exact', head: true }).gte('created_at', startIso).lt('created_at', endIso),
    admin
      .from('golf_players')
      .select('id, created_at, updated_at', { count: 'exact' })
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .eq('onboarding_completed', true)
      .order('created_at', { ascending: true })
      .limit(ONBOARD_SAMPLE_CAP),
  ]);
  const onboardedRows = toCohortRows(onboardedRes.data ?? []);
  return {
    signedUpCount: signedUpRes.count ?? 0,
    onboardedCount: onboardedRes.count ?? onboardedRows.length,
    onboardedRows,
    medianOnboardHours: medianHours(onboardedRows.map((r) => ({ start: r.created_at, end: r.updated_at }))),
  };
}

async function fetchBaseballWindowStats(admin: AdminClient, startIso: string, endIso: string): Promise<WindowStats> {
  const [signedUpRes, onboardedRes] = await Promise.all([
    admin.from('baseball_players').select('id', { count: 'exact', head: true }).gte('created_at', startIso).lt('created_at', endIso),
    admin
      .from('baseball_players')
      .select('id, created_at, updated_at', { count: 'exact' })
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .eq('onboarding_completed', true)
      .order('created_at', { ascending: true })
      .limit(ONBOARD_SAMPLE_CAP),
  ]);
  const onboardedRows = toCohortRows(onboardedRes.data ?? []);
  return {
    signedUpCount: signedUpRes.count ?? 0,
    onboardedCount: onboardedRes.count ?? onboardedRows.length,
    onboardedRows,
    medianOnboardHours: medianHours(onboardedRows.map((r) => ({ start: r.created_at, end: r.updated_at }))),
  };
}

/** Golf activation event = that player's first golf_rounds row. */
async function golfActivationMap(admin: AdminClient, onboardedRows: CohortRow[]): Promise<Map<string, string>> {
  const ids = onboardedRows.map((r) => r.id);
  if (ids.length === 0) return new Map();
  // Paginated past the PostgREST 1000-row cap; ACTIVATION_ROWS_CAP is enforced
  // by stopping page accumulation. This map keeps the FIRST row per player, so a
  // silent truncation drops whole players out of the activation funnel. `id` is
  // the tiebreak — created_at alone is not unique, and a non-unique sort lets
  // page boundaries drift.
  const { data } = await fetchAllRowsResult<{ player_id: string; created_at: string | null }>(
    (from, to) => {
      if (from >= ACTIVATION_ROWS_CAP) return Promise.resolve({ data: [], error: null });
      return admin
        .from('golf_rounds')
        .select('player_id, created_at')
        .in('player_id', ids)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, Math.min(to, ACTIVATION_ROWS_CAP - 1));
    },
  );
  const map = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ player_id: string; created_at: string | null }>) {
    if (!row.created_at) continue;
    if (!map.has(row.player_id)) map.set(row.player_id, row.created_at);
  }
  return map;
}

/**
 * Baseball activation event = the first game logged by a team that player
 * actively belongs to (baseball_team_members.status='active') — baseball has
 * no per-player "round" equivalent; games are team-level. A player on a team
 * whose FIRST game predates their own onboarding still counts (the team was
 * already alive), matching "did the ONE thing that makes them a real user"
 * as a product-experienced signal, not strictly a personally-authored one.
 */
async function baseballActivationMap(admin: AdminClient, onboardedRows: CohortRow[]): Promise<Map<string, string>> {
  const ids = onboardedRows.map((r) => r.id);
  if (ids.length === 0) return new Map();
  const { data: memberRows } = await admin
    .from('baseball_team_members')
    .select('player_id, team_id')
    .in('player_id', ids)
    .eq('status', 'active');
  const members = (memberRows ?? []) as Array<{ player_id: string; team_id: string }>;
  const teamIds = Array.from(new Set(members.map((m) => m.team_id)));
  if (teamIds.length === 0) return new Map();

  // Same cap, same reasoning as golfActivationMap: first-row-per-team, so a
  // truncation silently drops teams from the funnel.
  const { data: gameRows } = await fetchAllRowsResult<{ team_id: string; created_at: string | null }>(
    (from, to) => {
      if (from >= ACTIVATION_ROWS_CAP) return Promise.resolve({ data: [], error: null });
      return admin
        .from('baseball_games')
        .select('team_id, created_at')
        .in('team_id', teamIds)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, Math.min(to, ACTIVATION_ROWS_CAP - 1));
    },
  );
  const teamFirstGame = new Map<string, string>();
  for (const row of (gameRows ?? []) as Array<{ team_id: string; created_at: string | null }>) {
    if (!row.created_at) continue;
    if (!teamFirstGame.has(row.team_id)) teamFirstGame.set(row.team_id, row.created_at);
  }

  const map = new Map<string, string>();
  for (const m of members) {
    const gameAt = teamFirstGame.get(m.team_id);
    if (!gameAt) continue;
    const existing = map.get(m.player_id);
    if (!existing || gameAt < existing) map.set(m.player_id, gameAt);
  }
  return map;
}

async function fetchSportRunway(
  admin: AdminClient,
  sport: 'golf' | 'baseball',
  now: Date,
): Promise<SportRunway> {
  const days7 = trailingUtcDays(7, now);
  const currentStart = days7[0]?.startIso ?? now.toISOString();
  const nowIso = now.toISOString();
  const prevStart = new Date(new Date(currentStart).getTime() - 7 * 86_400_000).toISOString();

  const days30 = trailingUtcDays(30, now);
  const thirtyStart = days30[0]?.startIso ?? now.toISOString();

  const fetchWindow = sport === 'golf' ? fetchGolfWindowStats : fetchBaseballWindowStats;
  const activationMap = sport === 'golf' ? golfActivationMap : baseballActivationMap;
  const table = sport === 'golf' ? ('golf_players' as const) : ('baseball_players' as const);

  const [current, previous, signupRowsRes] = await Promise.all([
    fetchWindow(admin, currentStart, nowIso),
    fetchWindow(admin, prevStart, currentStart),
    // Paginated past the PostgREST 1000-row cap — a 30-day signup window is
    // usually small, but this is honest at any volume rather than assuming so.
    fetchAllRowsResult<{ created_at: string | null }>((from, to) =>
      admin
        .from(table)
        .select('created_at')
        .gte('created_at', thirtyStart)
        .order('id', { ascending: true })
        .range(from, to),
    ),
  ]);

  const [currentActivation, previousActivation] = await Promise.all([
    activationMap(admin, current.onboardedRows),
    activationMap(admin, previous.onboardedRows),
  ]);

  const currentActivated = current.onboardedRows.filter((r) => currentActivation.has(r.id));
  const previousActivated = previous.onboardedRows.filter((r) => previousActivation.has(r.id));

  const medianActivateHours = medianHours(
    currentActivated.map((r) => ({ start: r.updated_at, end: currentActivation.get(r.id) as string })),
  );
  const prevMedianActivateHours = medianHours(
    previousActivated.map((r) => ({ start: r.updated_at, end: previousActivation.get(r.id) as string })),
  );

  const signupRows = (signupRowsRes.data ?? []).filter(
    (r): r is { created_at: string } => r.created_at !== null,
  );

  return {
    signedUpCount: current.signedUpCount,
    onboardedCount: current.onboardedCount,
    activatedCount: currentActivated.length,
    medianOnboardHours: current.medianOnboardHours,
    medianActivateHours,
    prevMedianOnboardHours: previous.medianOnboardHours,
    prevMedianActivateHours,
    activationSampleTruncated: current.onboardedRows.length >= ONBOARD_SAMPLE_CAP,
    dailySignups30d: bucketDailyCounts(signupRows, 30, now),
  };
}

/** CALLER must have passed requireSuperAdmin(). Count-scoped throughout
 *  (head:true counts + small bounded aggregation fetches, never a row dump
 *  rendered to the UI) — see fetchSportRunway for the exact query shapes. */
export async function fetchActivationFunnel(now: Date = new Date()): Promise<ActivationFunnelResult> {
  const admin = createAdminClient();
  const [golf, baseball] = await Promise.all([
    fetchSportRunway(admin, 'golf', now),
    fetchSportRunway(admin, 'baseball', now),
  ]);
  return { golf, baseball };
}
