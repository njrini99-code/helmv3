import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { weekStart } from '@/lib/admin/data/baseball';

/**
 * Lift Lab rollup — the third product's parity counterpart to
 * fetchGolfTab()/fetchBaseballTab() (bridge-tab-audit-p0p1 overview Finding
 * "Lift Lab has no tab/drill-down anywhere in Bridge despite Overview
 * already computing and displaying its activity number"). helm_lifting_* is
 * a genuinely cross-sport schema — every table below carries its own
 * `sport` column instead of living under a golf_/baseball_ prefix, and
 * sessions/programs/PRs are NOT filtered by sport here (unlike golf.ts's/
 * baseball.ts's `.eq('sport', ...)` slices) because this tab's whole point
 * is the platform-wide Lift Lab view.
 *
 * `weekStart` is imported from baseball.ts rather than re-implemented — one
 * Monday-bucketing function, shared by every 12-week trend chart in Bridge.
 */

export interface LiftingWeekBucket {
  week: string;
  count: number;
}

export interface LiftingSessionFeedRow {
  id: string;
  athleteName: string;
  orgName: string;
  sport: string;
  status: string;
  scheduledDate: string;
  completedAt: string | null;
  createdAt: string;
}

export interface LiftingRollup {
  sessionsToday: number;
  sessionsThisWeek: number;
  sessionsLastWeek: number;
  /** Monday-bucketed session count over the trailing 12 weeks — same
   *  bucketing convention as golf's roundsByWeek / baseball's gamesByWeek. */
  sessionsByWeek: LiftingWeekBucket[];
  prsThisWeek: number;
  prs30d: number;
  /** Non-template programs with status='active'. Honest zero (not an
   *  error) if the platform simply has none yet. */
  activePrograms: number;
  /** Distinct athletes with >=1 lift session in the trailing 30d, across
   *  every sport (golf.ts's/baseball.ts's GolfLiftLab/BaseballLiftLab give
   *  the sport-scoped halves of this same number). */
  activeAthletes30d: number;
  recentSessions: LiftingSessionFeedRow[];
}

type SessionSlimRow = { created_at: string };
type AthleteIdRow = { athlete_id: string | null };
type RecentSessionRow = {
  id: string;
  sport: string;
  status: string;
  scheduled_date: string;
  completed_at: string | null;
  created_at: string;
  helm_lifting_athletes: { first_name: string | null; last_name: string | null } | null;
  organizations: { name: string } | null;
};

/**
 * CALLER must have passed requireSuperAdmin(). helm_lifting_* are plain
 * tables with no auth.uid()-gated SECURITY DEFINER wrapper (same 509-storm
 * exemption golf.ts/baseball.ts document), so the service-role admin
 * client is sufficient for every read below.
 */
export async function fetchLiftingTab(): Promise<LiftingRollup> {
  const admin = createAdminClient();
  const now = new Date();
  // Truncate to a UTC day boundary first (matches baseball.ts's todayUTC
  // convention) so "today"/"this week" cutoffs don't drift with the
  // server's time-of-day at request time.
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  function daysAgoIso(days: number): string {
    const d = new Date(todayUTC);
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString();
  }
  const todayIso = daysAgoIso(0);
  const ago7d = daysAgoIso(7);
  const ago14d = daysAgoIso(14);
  const ago30d = daysAgoIso(30);
  const ago84d = daysAgoIso(84); // 12 weeks

  const [sessionsRes, prsThisWeekRes, prs30dRes, activeProgramsRes, activeAthletesRes, recentSessionsRes] =
    await Promise.all([
      // Paginate past the PostgREST 1000-row cap — an unpaginated fetch would
      // silently under-count sessionsToday/sessionsThisWeek/sessionsByWeek
      // once trailing-84d cross-sport lift session volume passes 1000.
      fetchAllRowsResult((from, to) =>
        admin
          .from('helm_lifting_sessions')
          .select('created_at')
          .gte('created_at', ago84d)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to),
      ),
      // Pure counts — head:true never triggers the PostgREST 1000-row cap.
      admin.from('helm_lifting_prs').select('id', { count: 'exact', head: true }).gte('achieved_at', ago7d),
      admin.from('helm_lifting_prs').select('id', { count: 'exact', head: true }).gte('achieved_at', ago30d),
      admin
        .from('helm_lifting_programs')
        .select('id', { count: 'exact', head: true })
        .eq('is_template', false)
        .eq('status', 'active'),
      // Need every row's athlete_id to dedupe — paginate past the cap
      // rather than `.limit(1000)`.
      fetchAllRowsResult((from, to) =>
        admin
          .from('helm_lifting_sessions')
          .select('athlete_id')
          .gte('created_at', ago30d)
          .order('id', { ascending: true })
          .range(from, to),
      ),
      // Recent session feed — bounded to 20, no pagination needed.
      // organization_id carries two FK relationships in the schema
      // (organizations + organizations_public_profile) so the embed must
      // name the FK explicitly or PostgREST rejects it as ambiguous.
      admin
        .from('helm_lifting_sessions')
        .select(
          'id, sport, status, scheduled_date, completed_at, created_at, helm_lifting_athletes(first_name, last_name), organizations!helm_lifting_sessions_organization_id_fkey(name)',
        )
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

  // Fail loud on a real backend error rather than letting `?? []`/`?? 0`
  // silently render "0 sessions / 0 PRs" as if that were real data (same
  // guard as fetchBaseballTab — PanelBoundary can then show PanelStale
  // instead of a fabricated empty state).
  if (sessionsRes.error) {
    throw new Error(`fetchLiftingTab: helm_lifting_sessions query failed: ${sessionsRes.error.message}`);
  }
  if (activeAthletesRes.error) {
    throw new Error(`fetchLiftingTab: helm_lifting_sessions athlete query failed: ${activeAthletesRes.error.message}`);
  }
  if (recentSessionsRes.error) {
    throw new Error(`fetchLiftingTab: recent sessions query failed: ${recentSessionsRes.error.message}`);
  }

  const sessions = (sessionsRes.data ?? []) as SessionSlimRow[];
  const weekBuckets = new Map<string, number>();
  let sessionsToday = 0;
  let sessionsThisWeek = 0;
  let sessionsLastWeek = 0;
  for (const s of sessions) {
    const bucket = weekStart(s.created_at);
    weekBuckets.set(bucket, (weekBuckets.get(bucket) ?? 0) + 1);
    if (s.created_at >= ago7d) sessionsThisWeek += 1;
    else if (s.created_at >= ago14d) sessionsLastWeek += 1;
    if (s.created_at >= todayIso) sessionsToday += 1;
  }
  const sessionsByWeek: LiftingWeekBucket[] = [...weekBuckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([week, count]) => ({ week, count }));

  const activeAthleteIds = new Set(
    (activeAthletesRes.data ?? [])
      .map((r) => (r as AthleteIdRow).athlete_id)
      .filter((id): id is string => Boolean(id)),
  );

  const recentSessions: LiftingSessionFeedRow[] = ((recentSessionsRes.data ?? []) as unknown as RecentSessionRow[]).map(
    (r) => {
      const first = r.helm_lifting_athletes?.first_name ?? '';
      const last = r.helm_lifting_athletes?.last_name ?? '';
      const name = `${first} ${last}`.trim();
      return {
        id: r.id,
        athleteName: name.length > 0 ? name : 'Unknown athlete',
        orgName: r.organizations?.name ?? 'Unknown org',
        sport: r.sport,
        status: r.status,
        scheduledDate: r.scheduled_date,
        completedAt: r.completed_at,
        createdAt: r.created_at,
      };
    },
  );

  return {
    sessionsToday,
    sessionsThisWeek,
    sessionsLastWeek,
    sessionsByWeek,
    prsThisWeek: prsThisWeekRes.count ?? 0,
    prs30d: prs30dRes.count ?? 0,
    activePrograms: activeProgramsRes.count ?? 0,
    activeAthletes30d: activeAthleteIds.size,
    recentSessions,
  };
}
