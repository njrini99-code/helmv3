import 'server-only';
import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { excludeAuthNoise } from '@/lib/admin/data/triage';
import { fullName } from '@/lib/admin/data/activity';
import { FAILURE_SEVERITIES } from '@/lib/admin/severity';
import { DEMO_TEAM_IDS } from '@/app/golf/actions/admin/demo-teams';
import { STUCK_HOURS_THRESHOLD, STUCK_TIER_MAX_IDLE_HOURS } from '@/lib/golf/tracer-round-activity';

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Helm Bridge V2 — "needs your eyes" briefing. Up to six deterministic,
 * severity-ordered signals surfaced from small, targeted, bounded queries —
 * never a platform-wide scan. Every check below is INDEPENDENTLY try/caught:
 * one broken query drops just that candidate, never the whole briefing (the
 * same per-source isolation discipline as `activity.ts`, applied to seven
 * unrelated checks instead of nine unrelated event kinds).
 *
 * DETERMINISM: given the same underlying data, `fetchBriefing()` always
 * returns the same items in the same order. Every check that could produce
 * more than one candidate reduces to a single, well-defined "worst/most
 * relevant" example (oldest stuck round, top error cluster by occurrence,
 * top auth-failure offender by count) rather than picking arbitrarily.
 * Ranking is `rankBriefingItems` — a pure, unit-tested sort — never
 * insertion order or a database's incidental row order.
 *
 * SCHEMA-DRIFT FINDINGS (verified against src/lib/types/database.ts):
 *   - `golf_rounds.status` has no DB enum — 'in_progress'/'completed'/'draft'
 *     are plain strings by codebase convention (same as `golf.ts`,
 *     `admin-tracer-data.ts`). "Stuck" mirrors the legacy Tracer feed's own
 *     tiering (`tracer-round-activity.ts`: idle 1h–24h) — a validated
 *     business rule, not a number invented here.
 *   - `login_attempts` has no `user_id` — only `email`. Naming the identity
 *     for a href means a second, single-row `users` lookup keyed by the
 *     ONE winning email (not a lookup per candidate row).
 *   - `users.role = 'coach'` alone is NOT sport-scoped — `users` carries no
 *     sport column, so it also matches BaseballHelm coaches. `golf_coaches`
 *     (joined via `user_id`) is what actually scopes "golf coach"; `users`
 *     is still where `last_seen` lives (`golf_coaches` has none of its own).
 */

export type BriefingSeverity = 'attention' | 'watch';

export interface BriefingItem {
  severity: BriefingSeverity;
  headline: string;
  href: string | null;
}

interface BriefingCandidate extends BriefingItem {
  /** Fixed tie-break order within the same severity — lower sorts first.
   *  Never derived from query result order (that would be nondeterministic
   *  across otherwise-identical runs). */
  priority: number;
}

const SEVERITY_RANK: Record<BriefingSeverity, number> = { attention: 0, watch: 1 };
const MAX_BRIEFING_ITEMS = 6;

/** Pure, unit-tested: attention before watch; ties broken by fixed priority
 *  (declaration order below), never by incidental fetch order. */
export function rankBriefingItems(candidates: readonly BriefingCandidate[]): BriefingItem[] {
  return [...candidates]
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.priority - b.priority)
    .slice(0, MAX_BRIEFING_ITEMS)
    .map(({ severity, headline, href }) => ({ severity, headline, href }));
}

/** Pure, unit-tested. `null` means "no meaningful percentage" (last week had
 *  zero rounds — any nonzero count this week is not a comparable ratio). */
export function computeWoWDelta(thisWeek: number, lastWeek: number): number | null {
  if (lastWeek <= 0) return null;
  return (thisWeek - lastWeek) / lastWeek;
}

const NEWLY_DORMANT_MIN_DAYS = 14;
const NEWLY_DORMANT_MAX_DAYS = 21;
// Recency window for the platform-wide rounds scan in checkNewlyDormantTeams:
// a round outside this window is either too recent to make a team "newly"
// dormant (< MIN_DAYS) or already long-dormant and surfaced elsewhere, not
// "newly" (> MAX_DAYS) — so bounding the fetch to a margin above MAX_DAYS
// can never drop a team that would actually qualify, while turning an
// all-time platform scan into a genuinely bounded one.
const NEWLY_DORMANT_SCAN_WINDOW_DAYS = 30;

export interface TeamLastActivity {
  teamId: string;
  name: string;
  lastActivity: string | null;
}

/** Pure, unit-tested: "newly" dormant means the team's last known activity
 *  crossed the classifyTeamHealth 14-day dormant threshold WITHIN the past
 *  week (14–21 days ago) — a team quiet for 90 days isn't "newly" anything,
 *  it's just dormant (already surfaced elsewhere, e.g. the Teams table). */
export function findNewlyDormantTeams(
  teams: readonly TeamLastActivity[],
  now: Date,
): Array<TeamLastActivity & { ageDays: number }> {
  return teams
    .filter((t): t is TeamLastActivity & { lastActivity: string } => !!t.lastActivity)
    .map((t) => ({ ...t, ageDays: (now.getTime() - new Date(t.lastActivity).getTime()) / 86400_000 }))
    .filter((t) => t.ageDays >= NEWLY_DORMANT_MIN_DAYS && t.ageDays <= NEWLY_DORMANT_MAX_DAYS)
    .sort((a, b) => a.ageDays - b.ageDays);
}

const MIN_ERROR_CLUSTER_SIZE = 2;

export interface ErrorClusterRow {
  id: string;
  created_at: string;
  title: string;
  severity: string;
  fingerprint: string | null;
}

/** Pure, unit-tested: groups already-fetched, already-noise-filtered 24h
 *  error rows by fingerprint and returns the single largest cluster (ties
 *  broken by most-recent). Returns null below MIN_ERROR_CLUSTER_SIZE — a
 *  lone one-off error is not "noise-filtered top cluster" material. */
export function topErrorCluster(
  rows: readonly ErrorClusterRow[],
): { fingerprint: string; title: string; occurrences: number; lastSeen: string; anyCritical: boolean } | null {
  const buckets = new Map<
    string,
    { title: string; occurrences: number; lastSeen: string; anyCritical: boolean }
  >();
  for (const r of rows) {
    const fp = r.fingerprint ?? `row:${r.id}`;
    const existing = buckets.get(fp);
    const isCritical = r.severity === 'critical';
    if (!existing) {
      buckets.set(fp, { title: r.title, occurrences: 1, lastSeen: r.created_at, anyCritical: isCritical });
    } else {
      existing.occurrences += 1;
      existing.anyCritical = existing.anyCritical || isCritical;
      if (r.created_at > existing.lastSeen) {
        existing.lastSeen = r.created_at;
        existing.title = r.title;
      }
    }
  }
  let best: { fingerprint: string; title: string; occurrences: number; lastSeen: string; anyCritical: boolean } | null = null;
  for (const [fingerprint, b] of buckets) {
    if (
      !best ||
      b.occurrences > best.occurrences ||
      (b.occurrences === best.occurrences && b.lastSeen > best.lastSeen)
    ) {
      best = { fingerprint, ...b };
    }
  }
  return best && best.occurrences >= MIN_ERROR_CLUSTER_SIZE ? best : null;
}

const STUCK_ONBOARDING_MIN_DAYS = 7;
// Upper bound so a signup abandoned months ago (the two current rows on
// production were from February and March) doesn't sit at the top of "Needs
// your eyes" forever — bounds this check to the SAME "stuck, not archaeology"
// window as checkStuckRounds/checkNewlyDormantTeams below.
const STUCK_ONBOARDING_MAX_DAYS = 30;
const COACH_INACTIVE_DAYS = 14;
const WOW_DELTA_THRESHOLD = 0.25;
const AUTH_FAILURE_THRESHOLD = 5;

function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}
function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString();
}
/** Naive `+s` produced "1 coachs" for every `plural(n, 'coach')` call above 1 —
 *  "ch"/"sh"/"s"/"x"/"z" endings pluralize with "-es", not a bare "-s". Every
 *  other word used with this helper (round, signup, occurrence, team, failed
 *  sign-in) is unaffected by the added branch. Exported for direct unit
 *  testing rather than only indirectly through a headline string. */
export function plural(n: number, word: string): string {
  if (n === 1) return `1 ${word}`;
  const needsEs = /(ch|sh|s|x|z)$/i.test(word);
  return `${n} ${word}${needsEs ? 'es' : 's'}`;
}

async function checkStuckRounds(admin: AdminClient): Promise<BriefingCandidate | null> {
  // Bounds this to the SAME window as the Tracer activity feed's "stuck" tier
  // (tracer-round-activity.ts) — idle 1h–24h. Below 1h it's plausibly still
  // being played; past 24h it stops meaning "just halted" and becomes
  // "quietly dead," which is the quieter "abandoned" tier the golf-side UI
  // shows separately, not urgent news. Without the upper bound this counted
  // every in_progress round idle 1h+ with no ceiling — including rounds idle
  // thousands of hours (weeks-old abandoned drafts nobody will ever resume),
  // which is exactly what inflated this briefing's count above the Tracer
  // page's own "stuck" count for the same data.
  const stuckSince = isoHoursAgo(STUCK_HOURS_THRESHOLD);
  const stuckUntil = isoHoursAgo(STUCK_TIER_MAX_IDLE_HOURS);
  const { data, count, error } = await admin
    .from('golf_rounds')
    .select('id, player_id, course_name, updated_at, golf_players(first_name, last_name)', { count: 'exact' })
    .eq('status', 'in_progress')
    .lt('updated_at', stuckSince)
    .gte('updated_at', stuckUntil)
    .order('updated_at', { ascending: true })
    .limit(5);
  if (error) throw new Error(error.message);
  if (!count || count === 0) return null;
  const rows = (data ?? []) as unknown as Array<{
    id: string; course_name: string | null; updated_at: string | null;
    golf_players: { first_name: string | null; last_name: string | null } | null;
  }>;
  const oldest = rows[0];
  if (!oldest?.updated_at) return null;
  const hoursStuck = (Date.now() - new Date(oldest.updated_at).getTime()) / 3600_000;
  const player = fullName(oldest.golf_players?.first_name, oldest.golf_players?.last_name) ?? 'a player';
  const at = oldest.course_name ? ` at ${oldest.course_name}` : '';
  return {
    severity: 'attention',
    priority: 2,
    headline: `${plural(count, 'round')} stuck in-progress — oldest is ${player}${at}, ${hoursStuck.toFixed(1)}h untouched`,
    href: `/admin/golf/tracer?round=${oldest.id}`,
  };
}

async function checkStuckOnboarding(admin: AdminClient): Promise<BriefingCandidate | null> {
  const stuckSince = isoDaysAgo(STUCK_ONBOARDING_MIN_DAYS);
  const stuckUntil = isoDaysAgo(STUCK_ONBOARDING_MAX_DAYS);
  const [playersRes, coachesRes] = await Promise.all([
    admin.from('golf_players').select('id', { count: 'exact', head: true })
      .eq('onboarding_completed', false).lt('created_at', stuckSince).gte('created_at', stuckUntil),
    admin.from('golf_coaches').select('id', { count: 'exact', head: true })
      .eq('onboarding_completed', false).lt('created_at', stuckSince).gte('created_at', stuckUntil),
  ]);
  if (playersRes.error) throw new Error(playersRes.error.message);
  if (coachesRes.error) throw new Error(coachesRes.error.message);
  const total = (playersRes.count ?? 0) + (coachesRes.count ?? 0);
  if (total === 0) return null;
  return {
    severity: 'watch',
    priority: 7,
    headline: `${plural(total, 'signup')} stuck in onboarding for ${STUCK_ONBOARDING_MIN_DAYS}-${STUCK_ONBOARDING_MAX_DAYS} days`,
    href: '/admin/users',
  };
}

async function checkInactiveCoaches(admin: AdminClient): Promise<BriefingCandidate | null> {
  // `users.role = 'coach'` is shared with BaseballHelm — `users` carries no
  // sport column — so a straight role filter also counts baseball-only
  // coaches. `golf_coaches` is the ground truth for "this user actually has a
  // golf coaching relationship" (same F1 pattern as
  // rollup-c.shared.ts's computeDemoExclusions), and the two seed/demo teams
  // (DEMO_TEAM_IDS) get their coaches excluded the same way rollup-c does —
  // via golf_team_coach_staff, bounded to just those 2 team ids rather than a
  // full-table scan.
  const [coachesRes, demoStaffRes] = await Promise.all([
    admin.from('golf_coaches').select('id, user_id'),
    admin.from('golf_team_coach_staff').select('coach_id').in('team_id', [...DEMO_TEAM_IDS]),
  ]);
  if (coachesRes.error) throw new Error(coachesRes.error.message);
  if (demoStaffRes.error) throw new Error(demoStaffRes.error.message);

  const demoCoachIds = new Set(
    ((demoStaffRes.data ?? []) as Array<{ coach_id: string }>).map((s) => s.coach_id),
  );
  const golfCoachUserIds = ((coachesRes.data ?? []) as Array<{ id: string; user_id: string }>)
    .filter((c) => !demoCoachIds.has(c.id))
    .map((c) => c.user_id);
  if (golfCoachUserIds.length === 0) return null;

  const cutoff = isoDaysAgo(COACH_INACTIVE_DAYS);
  const { count, error } = await admin
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'coach')
    .not('last_seen', 'is', null)
    .lt('last_seen', cutoff)
    .in('id', golfCoachUserIds);
  if (error) throw new Error(error.message);
  if (!count || count === 0) return null;
  return {
    severity: 'watch',
    priority: 6,
    headline: `${plural(count, 'coach')} inactive for over ${COACH_INACTIVE_DAYS} days`,
    href: '/admin/users?role=coach',
  };
}

async function checkRoundsWoW(admin: AdminClient): Promise<BriefingCandidate | null> {
  const ago7d = isoDaysAgo(7);
  const ago14d = isoDaysAgo(14);
  const [thisWeekRes, lastWeekRes] = await Promise.all([
    admin.from('golf_rounds').select('id', { count: 'exact', head: true })
      .eq('status', 'completed').gte('created_at', ago7d),
    admin.from('golf_rounds').select('id', { count: 'exact', head: true })
      .eq('status', 'completed').gte('created_at', ago14d).lt('created_at', ago7d),
  ]);
  if (thisWeekRes.error) throw new Error(thisWeekRes.error.message);
  if (lastWeekRes.error) throw new Error(lastWeekRes.error.message);
  const thisWeek = thisWeekRes.count ?? 0;
  const lastWeek = lastWeekRes.count ?? 0;
  const delta = computeWoWDelta(thisWeek, lastWeek);
  if (delta === null || Math.abs(delta) <= WOW_DELTA_THRESHOLD) return null;
  const direction = delta > 0 ? 'up' : 'down';
  return {
    severity: delta < 0 ? 'attention' : 'watch',
    priority: delta < 0 ? 3 : 5,
    headline: `Rounds ${direction} ${Math.abs(delta * 100).toFixed(0)}% week-over-week (${thisWeek} vs ${lastWeek})`,
    href: '/admin/golf',
  };
}

async function checkNewlyDormantTeams(admin: AdminClient): Promise<BriefingCandidate | null> {
  const [teamsRes, roundsRes] = await Promise.all([
    admin.from('golf_teams').select('id, name').limit(1000),
    // Paginate past the PostgREST 1000-row cap (the prior .limit(2000) still
    // silently truncated at 1000) — bounded by the recency window above
    // rather than by a size cap, and `.order('id')` keeps page boundaries
    // stable alongside the primary `created_at desc` the "first hit is max"
    // per-team last-activity map below relies on.
    fetchAllRowsResult((from, to) =>
      admin
        .from('golf_rounds')
        .select('team_id, created_at')
        .eq('status', 'completed')
        .gte('created_at', isoDaysAgo(NEWLY_DORMANT_SCAN_WINDOW_DAYS))
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    ),
  ]);
  if (teamsRes.error) throw new Error(teamsRes.error.message);
  if (roundsRes.error) throw new Error(roundsRes.error.message);

  const lastActivityByTeam = new Map<string, string>();
  for (const r of (roundsRes.data ?? []) as Array<{ team_id: string | null; created_at: string | null }>) {
    if (r.team_id && r.created_at && !lastActivityByTeam.has(r.team_id)) {
      lastActivityByTeam.set(r.team_id, r.created_at);
    }
  }
  const teams = ((teamsRes.data ?? []) as Array<{ id: string; name: string }>)
    // The two seed/demo teams (DEMO_TEAM_IDS) never have real rounds, so
    // every scan naturally reads them as "no known activity" — filtered out
    // by findNewlyDormantTeams' `!!lastActivity` guard already, EXCEPT the
    // one where a demo team happens to have a leftover completed round from
    // seeding; excluding by id here means that can't slip through either.
    .filter((t) => !DEMO_TEAM_IDS.has(t.id))
    .map((t) => ({
      teamId: t.id,
      name: t.name,
      lastActivity: lastActivityByTeam.get(t.id) ?? null,
    }));

  const newlyDormant = findNewlyDormantTeams(teams, new Date());
  if (newlyDormant.length === 0) return null;
  const headline = newlyDormant.length === 1
    ? `${newlyDormant[0]!.name} just went dormant (${Math.floor(newlyDormant[0]!.ageDays)}d quiet)`
    : `${plural(newlyDormant.length, 'team')} just went dormant (14+ days quiet)`;
  return {
    severity: 'attention',
    priority: 4,
    headline,
    href: newlyDormant.length === 1 ? `/admin/teams/${newlyDormant[0]!.teamId}` : '/admin/golf',
  };
}

async function checkTopErrorCluster(admin: AdminClient): Promise<BriefingCandidate | null> {
  const ago24h = isoHoursAgo(24);
  let q = admin
    .from('admin_events')
    .select('id, created_at, title, severity, fingerprint')
    .eq('event_type', 'error')
    .in('severity', FAILURE_SEVERITIES)
    .gte('created_at', ago24h)
    .order('created_at', { ascending: false })
    .limit(500);
  q = excludeAuthNoise(q);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as unknown as Array<{
    id: string; created_at: string | null; title: string; severity: string; fingerprint: string | null;
  }>).filter((r): r is ErrorClusterRow => !!r.created_at);
  const cluster = topErrorCluster(rows);
  if (!cluster) return null;
  return {
    severity: cluster.anyCritical ? 'attention' : 'watch',
    priority: 1,
    headline: `${plural(cluster.occurrences, 'occurrence')} of "${cluster.title}" in the last 24h`,
    href: `/admin/errors/${cluster.fingerprint}`,
  };
}

// A `login_attempts` row only clears on a *successful* login (deleted) or
// resets to 1 when a new failed attempt arrives >30min after the last one
// (src/lib/auth/account-lockout.ts). An abandoned account that crossed the
// threshold and never tried again would otherwise sit at the top of "Needs
// your eyes" forever — bound the check to genuinely recent activity, the
// same 24h window checkTopErrorCluster uses.
const AUTH_FAILURE_RECENCY_HOURS = 24;

async function checkAuthFailureConcentration(admin: AdminClient): Promise<BriefingCandidate | null> {
  const { data, error } = await admin
    .from('login_attempts')
    .select('email, failed_attempts, locked_until')
    .gte('failed_attempts', AUTH_FAILURE_THRESHOLD)
    .gte('last_attempt', isoHoursAgo(AUTH_FAILURE_RECENCY_HOURS))
    .order('failed_attempts', { ascending: false })
    .limit(5);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Array<{ email: string; failed_attempts: number | null; locked_until: string | null }>;
  const top = rows[0];
  if (!top || !top.failed_attempts) return null;

  let href: string | null = null;
  try {
    const { data: userRow } = await admin.from('users').select('id').eq('email', top.email).maybeSingle();
    href = userRow ? `/admin/users/${(userRow as { id: string }).id}` : null;
  } catch {
    href = null;
  }

  const lockedSuffix = top.locked_until ? ' (locked)' : '';
  return {
    severity: 'attention',
    priority: 0,
    headline: `${plural(top.failed_attempts, 'failed sign-in')} for ${top.email}${lockedSuffix}`,
    href,
  };
}

const CHECKS: Array<(admin: AdminClient) => Promise<BriefingCandidate | null>> = [
  checkAuthFailureConcentration,
  checkTopErrorCluster,
  checkStuckRounds,
  checkNewlyDormantTeams,
  checkRoundsWoW,
  checkInactiveCoaches,
  checkStuckOnboarding,
];

/**
 * CALLER must have passed requireSuperAdmin() — every query below runs
 * against the service-role client (createAdminClient()).
 */
export interface BriefingResult {
  items: BriefingItem[];
  /**
   * Checks that THREW, by function name. Non-empty means this briefing is
   * incomplete and the caller must not render an all-clear.
   *
   * Every check used to be wrapped in `catch { return null }` with no channel
   * out, so a permission change or schema drift on one check silently deleted
   * its signal forever — and because the panel renders a green "All clear —
   * nothing needs your attention right now" on an empty list, a broken
   * priority-0 check read as good news. This is the panel the console exists
   * for; its failure mode must not be a checkmark. activity.ts:788-815 is the
   * model this file's own header cites and then dropped the disclosure half of.
   */
  degradedChecks: string[];
}

export async function fetchBriefing(): Promise<BriefingResult> {
  const admin = createAdminClient();
  const degradedChecks: string[] = [];
  const results = await Promise.all(
    CHECKS.map(async (check) => {
      try {
        return await check(admin);
      } catch {
        degradedChecks.push(check.name || 'anonymous check');
        return null;
      }
    }),
  );
  const candidates = results.filter((c): c is BriefingCandidate => c !== null);
  return { items: rankBriefingItems(candidates), degradedChecks };
}

/** React `cache()`-memoised per request — same convention as
 *  `cachedIncidentBoard`/`cachedSelfHealBoard` (`incidents/fetch.ts`,
 *  `data/selfheal.ts`). `/admin`'s `page.tsx` and the Command Deck
 *  (`CommandDeck.tsx`) both need this within the SAME request; without this
 *  wrapper each call site ran its own independent `Promise.all` of platform
 *  checks. Every call site takes zero arguments, so the memo key never
 *  varies within a request. */
export const cachedBriefing = cache(() => fetchBriefing());
