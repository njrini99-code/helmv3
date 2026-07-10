import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { fetchAdminRollupA, type RollupA } from '@/app/golf/actions/admin/rollup-a';

export type TeamHealth = 'active' | 'cooling' | 'dormant';

/** Red-first ordering for the TeamHealthTable — at-risk/dormant teams need
 *  eyes on them before healthy ones, never alphabetical (which happens to
 *  put 'active' first). */
const HEALTH_SORT_RANK: Record<TeamHealth, number> = { dormant: 0, cooling: 1, active: 2 };

/** Pure, unit-tested comparator: dormant first, cooling next, active last;
 *  ties within a health bucket break by most 7d errors first. */
export function sortTeamsByHealth(teams: GolfTeamHealthRow[]): GolfTeamHealthRow[] {
  return [...teams].sort((a, b) =>
    a.health === b.health
      ? b.errors7d - a.errors7d
      : HEALTH_SORT_RANK[a.health] - HEALTH_SORT_RANK[b.health],
  );
}

export function classifyTeamHealth(lastActivityIso: string | null, now: Date): TeamHealth {
  if (!lastActivityIso) return 'dormant';
  const ageDays = (now.getTime() - new Date(lastActivityIso).getTime()) / 86400_000;
  if (ageDays <= 7) return 'active';
  if (ageDays <= 14) return 'cooling';
  return 'dormant';
}

export interface GolfTeamHealthRow {
  teamId: string;
  name: string;
  playerCount: number;
  lastActivity: string | null;
  health: TeamHealth;
  errors7d: number;
}

/** Golf half of the cross-sport Lift Lab visibility gap (bridge-golf-rollup-wiring
 *  Finding 3) — the BaseballHelm counterpart lives in `fetchBaseballTab()`
 *  (src/lib/admin/data/baseball.ts), same shape, same `helm_lifting_sessions`
 *  source table filtered to `sport = 'golf'` instead of `'baseball'`. */
export interface GolfLiftLab {
  sessions30d: number;
  /** Distinct athletes with >=1 lift session in the trailing 30d. */
  activeAthletes30d: number;
}

/**
 * CALLER must have passed requireSuperAdmin(). fetchAdminRollupA uses the
 * invoking admin's USER-SCOPED client internally (rollup-a.ts) — the
 * SECURITY DEFINER gates need auth.uid(), so this function must run in a
 * request context with Nick's session. Every other read below goes through
 * createAdminClient() (service role) against plain tables — those do NOT
 * carry the auth.uid()-gated RPC restriction, only the get_admin_*_rollup
 * functions do (509-storm rule).
 *
 * DEVIATIONS from the wave doc (verified against src/lib/types/database.ts):
 *   - golf_demo_sessions has no `created_at` column; its timestamp column is
 *     `entered_at`.
 *   - golf_coachhelm_llm_budget is NOT a single global row with
 *     `remaining_usd`. It's one row per (coach_id, date) with `budget_usd` /
 *     `spent_usd`. "Budget remaining" is computed here as
 *     sum(budget_usd - spent_usd) across every coach's row for TODAY's date;
 *     null (honest, not zero) when no coach has a budget row for today.
 *   - golf_team_members is filtered to status='active' so the roster count
 *     reflects the real roster, not pending/inactive/removed rows.
 */
export async function fetchGolfTab(): Promise<{
  rollup: RollupA;
  teams: GolfTeamHealthRow[];
  llm: { calls30d: number; cost30d: number; budgetRemaining: number | null };
  demos: { demoSessions30d: number; demoRequests: number };
  liftLab: GolfLiftLab;
}> {
  const admin = createAdminClient();
  const ago30d = new Date(Date.now() - 30 * 86400_000).toISOString();
  const ago7d = new Date(Date.now() - 7 * 86400_000).toISOString();
  const today = new Date();
  const todayDate = today.toISOString().slice(0, 10);

  const [
    rollup,
    teamsRes,
    membersRes,
    errorRes,
    llmCallsCountRes,
    llmCostRes,
    llmBudgetRes,
    demoSessionsRes,
    demoRequestsRes,
    liftCountRes,
    liftAthletesRes,
  ] = await Promise.all([
      fetchAdminRollupA(),
      admin.from('golf_teams').select('id, name'),
      admin.from('golf_team_members').select('team_id').eq('status', 'active'),
      admin.from('admin_events').select('team_id')
        .eq('sport', 'golf').eq('event_type', 'error').gte('created_at', ago7d).limit(1000),
      // Pure count — head:true never triggers the PostgREST 1000-row cap,
      // unlike deriving calls30d from llmCalls.length on a capped fetch.
      admin.from('golf_coachhelm_llm_calls').select('id', { count: 'exact', head: true }).gte('created_at', ago30d),
      // Cost needs every row's cost_usd to sum — paginate past the cap
      // instead of the prior .limit(1000), which silently under-summed
      // cost30d once platform-wide 30d LLM calls passed 1000 rows.
      fetchAllRowsResult((from, to) =>
        admin
          .from('golf_coachhelm_llm_calls')
          .select('cost_usd')
          .gte('created_at', ago30d)
          .order('id', { ascending: true })
          .range(from, to),
      ),
      admin.from('golf_coachhelm_llm_budget').select('budget_usd, spent_usd').eq('date', todayDate),
      admin.from('golf_demo_sessions').select('id', { count: 'exact', head: true }).gte('entered_at', ago30d),
      admin.from('demo_requests').select('id', { count: 'exact', head: true }),
      // Lift Lab (golf half) — helm_lifting_sessions is the unified
      // cross-sport table (see fetchBaseballTab's identical baseball-side
      // slice); pure count never triggers the PostgREST 1000-row cap.
      admin.from('helm_lifting_sessions').select('id', { count: 'exact', head: true })
        .eq('sport', 'golf').gte('created_at', ago30d),
      // Need every row's athlete_id to dedupe — paginate past the cap
      // rather than `.limit(1000)`, which would silently under-count
      // activeAthletes30d once trailing-30d golf lift sessions pass 1000.
      fetchAllRowsResult((from, to) =>
        admin
          .from('helm_lifting_sessions')
          .select('athlete_id')
          .eq('sport', 'golf')
          .gte('created_at', ago30d)
          .order('id', { ascending: true })
          .range(from, to),
      ),
    ]);

  const memberCounts = new Map<string, number>();
  for (const m of membersRes.data ?? []) {
    const tid = (m as { team_id: string | null }).team_id;
    if (tid) memberCounts.set(tid, (memberCounts.get(tid) ?? 0) + 1);
  }
  const errorCounts = new Map<string, number>();
  for (const e of errorRes.data ?? []) {
    const tid = (e as { team_id: string | null }).team_id;
    if (tid) errorCounts.set(tid, (errorCounts.get(tid) ?? 0) + 1);
  }
  // Last activity per team from the rollup's bounded 12-week round slice.
  const lastRound = new Map<string, string>();
  for (const r of rollup.allRoundsMinimal) {
    if (r.team_id && (!lastRound.has(r.team_id) || r.created_at > lastRound.get(r.team_id)!)) {
      lastRound.set(r.team_id, r.created_at);
    }
  }

  const teams: GolfTeamHealthRow[] = (teamsRes.data ?? []).map((t) => {
    const row = t as { id: string; name: string };
    const lastActivity = lastRound.get(row.id) ?? null;
    return {
      teamId: row.id,
      name: row.name,
      playerCount: memberCounts.get(row.id) ?? 0,
      lastActivity,
      health: classifyTeamHealth(lastActivity, today),
      errors7d: errorCounts.get(row.id) ?? 0,
    };
  });

  const llmCalls = (llmCostRes.data ?? []) as Array<{ cost_usd: number | null }>;
  const budgetRows = (llmBudgetRes.data ?? []) as Array<{ budget_usd: number; spent_usd: number }>;
  const budgetRemaining = budgetRows.length > 0
    ? budgetRows.reduce((sum, row) => sum + (row.budget_usd - row.spent_usd), 0)
    : null;

  const liftAthleteIds = new Set(
    (liftAthletesRes.data ?? [])
      .map((r) => (r as { athlete_id: string | null }).athlete_id)
      .filter((id): id is string => Boolean(id)),
  );

  return {
    rollup,
    teams: sortTeamsByHealth(teams),
    llm: {
      calls30d: llmCallsCountRes.count ?? 0,
      cost30d: llmCalls.reduce((sum, c) => sum + (c.cost_usd ?? 0), 0),
      budgetRemaining,
    },
    demos: {
      demoSessions30d: demoSessionsRes.count ?? 0,
      demoRequests: demoRequestsRes.count ?? 0,
    },
    liftLab: {
      sessions30d: liftCountRes.count ?? 0,
      activeAthletes30d: liftAthleteIds.size,
    },
  };
}
