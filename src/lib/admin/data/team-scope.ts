import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { excludeAuthNoise } from '@/lib/admin/data/triage';
import { INCIDENT_SEVERITIES } from '@/lib/admin/severity';

/**
 * Helm Bridge V2 — shared team-scoping resolvers.
 *
 * SCHEMA-DRIFT FINDING (verified against src/lib/types/database.ts +
 * src/lib/admin-logger.ts): `admin_events.team_id` is a real column, but
 * `logLogin()` and `logSignup()` NEVER populate it — a user's team isn't
 * known/stable at auth time. Every login/signup row in admin_events has
 * team_id = null, ALWAYS. A naive `.eq('team_id', teamId)` filter on
 * event_type IN ('login','signup') will therefore silently return zero rows
 * FOREVER, for every team — not "no sign-ins today," but "this filter can
 * never match." That's a lying dashboard, not an empty one.
 *
 * The honest team-scoped query resolves the team's real `users.id` set first
 * (active roster + current coaching staff) and filters admin_events by
 * `.in('user_id', ...)` instead. Centralized here so activity.ts and
 * team-detail.ts share ONE tested resolution instead of two
 * independently-drifting copies of this schema quirk.
 *
 * Similarly, `golf_messages` carries no `team_id` at all — team scoping for
 * messages goes through `golf_conversations.team_id` (one row per thread).
 *
 * The SAME drift hits error counting, which is why `resolveTeamErrorCounts`
 * lives here too: `team_id` IS written on some `admin_events` error rows (by
 * `writeAdminTables()` in src/lib/server-error-logger.ts, and only when the
 * call site passed `context.teamId`), but on so few of them that a
 * team_id-only count is indistinguishable from "this team is clean."
 *
 * CALLER must have passed requireSuperAdmin() — every resolver here uses the
 * service-role client.
 */

interface TeamMemberEmbedRow {
  player_id: string;
  golf_players: { user_id: string } | null;
}

interface TeamCoachEmbedRow {
  coach_id: string;
  golf_coaches: { user_id: string } | null;
}

interface BaseballTeamMemberEmbedRow {
  player_id: string;
  baseball_players: { user_id: string } | null;
}

interface BaseballTeamCoachEmbedRow {
  coach_id: string;
  baseball_coaches: { user_id: string } | null;
}

/** Active roster (golf_team_members.status='active') union current coaching
 *  staff (golf_team_coach_staff) — every `users.id` currently attached to
 *  this team right now. Two small scoped queries, run in parallel. */
export async function resolveTeamUserIds(teamId: string): Promise<Set<string>> {
  const admin = createAdminClient();
  const [membersRes, coachesRes, baseballMembersRes, baseballCoachesRes] = await Promise.all([
    admin
      .from('golf_team_members')
      .select('player_id, golf_players(user_id)')
      .eq('team_id', teamId)
      .eq('status', 'active'),
    admin
      .from('golf_team_coach_staff')
      .select('coach_id, golf_coaches(user_id)')
      .eq('team_id', teamId),
    admin
      .from('baseball_team_members')
      .select('player_id, baseball_players(user_id)')
      .eq('team_id', teamId)
      .eq('status', 'active'),
    admin
      .from('baseball_team_coach_staff')
      .select('coach_id, baseball_coaches(user_id)')
      .eq('team_id', teamId),
  ]);
  // Throw if ANY sub-query errored, not only if all four did. Coercing one
  // errored result to `[]` while the others succeed returns a set that is
  // silently missing a whole slice of the team — a coaches-only "roster" with
  // no error attached, which is exactly the lying-dashboard failure the header
  // above exists to prevent. Callers already degrade safely on a throw
  // (activity.ts:765 / entity-thread.ts:408 `.catch(() => new Set())`,
  // team-detail.ts:383 inside try/catch), so an honest empty result replaces a
  // silent undercount without opening a new crash path.
  const failures: string[] = [];
  if (membersRes.error) failures.push(`golf members=${membersRes.error.message}`);
  if (coachesRes.error) failures.push(`golf coaches=${coachesRes.error.message}`);
  if (baseballMembersRes.error) failures.push(`baseball members=${baseballMembersRes.error.message}`);
  if (baseballCoachesRes.error) failures.push(`baseball coaches=${baseballCoachesRes.error.message}`);
  if (failures.length > 0) {
    throw new Error(`resolveTeamUserIds: ${failures.join('; ')}`);
  }

  const ids = new Set<string>();
  for (const row of (membersRes.data ?? []) as unknown as TeamMemberEmbedRow[]) {
    const uid = row.golf_players?.user_id;
    if (uid) ids.add(uid);
  }
  for (const row of (coachesRes.data ?? []) as unknown as TeamCoachEmbedRow[]) {
    const uid = row.golf_coaches?.user_id;
    if (uid) ids.add(uid);
  }
  for (const row of (baseballMembersRes.data ?? []) as unknown as BaseballTeamMemberEmbedRow[]) {
    const uid = row.baseball_players?.user_id;
    if (uid) ids.add(uid);
  }
  for (const row of (baseballCoachesRes.data ?? []) as unknown as BaseballTeamCoachEmbedRow[]) {
    const uid = row.baseball_coaches?.user_id;
    if (uid) ids.add(uid);
  }
  return ids;
}

/** golf_messages has no team_id — resolve via the thread's own team_id on
 *  golf_conversations. Bounded to 500 threads (generous for one team). */
export async function resolveTeamConversationIds(teamId: string): Promise<Set<string>> {
  const admin = createAdminClient();
  const [golfRes, baseballRes] = await Promise.all([
    admin
      .from('golf_conversations')
      .select('id')
      .eq('team_id', teamId)
      .limit(500),
    admin
      .from('baseball_conversations')
      .select('id')
      .eq('team_id', teamId)
      .limit(500),
  ]);
  // Same rule as resolveTeamUserIds: one errored side must not be coerced to
  // `[]` and merged into a set that looks complete.
  const convFailures: string[] = [];
  if (golfRes.error) convFailures.push(`golf=${golfRes.error.message}`);
  if (baseballRes.error) convFailures.push(`baseball=${baseballRes.error.message}`);
  if (convFailures.length > 0) {
    throw new Error(`resolveTeamConversationIds: ${convFailures.join('; ')}`);
  }
  return new Set([
    ...((golfRes.data ?? []) as unknown as Array<{ id: string }>).map((r) => r.id),
    ...((baseballRes.data ?? []) as unknown as Array<{ id: string }>).map((r) => r.id),
  ]);
}

/** The trailing window every Bridge surface means by "errors in the last 7
 *  days" — /admin/golf's Team Health table, /admin/users' team rows, and the
 *  team page's errors7d KPI. team-detail.ts's error CLUSTER list is
 *  deliberately NOT windowed (most recent 300, whenever they happened), which
 *  is why it is not a caller of the function below. */
const TEAM_ERROR_WINDOW_DAYS = 7;

interface TeamMembershipRow {
  team_id: string | null;
  golf_players?: { user_id: string } | null;
  golf_coaches?: { user_id: string } | null;
  baseball_players?: { user_id: string } | null;
  baseball_coaches?: { user_id: string } | null;
}

interface ErrorAttributionRow {
  id: string;
  team_id: string | null;
  user_id: string | null;
}

/**
 * "Errors in the last 7 days" for MANY teams at once — the one implementation
 * behind every Bridge surface that shows that number.
 *
 * WHY IT EXISTS (measured on production 2026-08-06): all three callers counted
 * `admin_events` with `.eq('team_id', …)` alone. `team_id` is populated on 7 of
 * 1,116 error rows in a week, and on ZERO rows of error-or-worse severity — so
 * every golf team read exactly 0, while the same week's rows resolved through
 * the roster were Guilford 4, Shenandoah Womens 7, Shenandoah 3, Demo
 * University 4. TeamHealthTable's leader wash fires on
 * `health === 'active' && errors7d === 0`, so the board was green-badging the
 * three worst teams as its cleanest. This is the bulk generalisation of the
 * single-team union `team-detail.ts` already runs.
 *
 * SEMANTICS, so a caller can trust the number:
 *   - Severity filtered to INCIDENT_SEVERITIES with auth noise excluded, so it
 *     agrees with the incident feed row-for-row instead of counting the ~94%
 *     of `event_type='error'` rows that are severity 'info' narration.
 *   - A row counts for a team if its `team_id` IS that team OR its `user_id`
 *     is on that team's active roster / current coaching staff.
 *   - A user on two teams credits the SAME row to BOTH of them: admin_events
 *     cannot say which team the person was acting for, and silently picking
 *     one would under-report the other. Counting is over a per-team Set of
 *     event ids, so one row can never be counted twice FOR ONE TEAM — not when
 *     it carries both attributions, not when two membership rows match it.
 *
 * COST: a fixed 6 queries regardless of team count (4 membership reads + 2
 * event reads), never one per team. Each is chunked at ID_CHUNK_SIZE (200 —
 * past ~585 uuids the PostgREST edge rejects the URL with a bare 400 before
 * Postgres sees it, auto-resolve.ts:87-105) and paginated past the 1000-row
 * page cap.
 *
 * THROWS on any read error rather than returning a short map: a swallowed
 * error here renders as "this team is clean," the most misleading thing this
 * function could possibly say. Callers that fail soft catch it themselves;
 * callers that fail loud let it reach their PanelBoundary.
 *
 * CALLER must have passed requireSuperAdmin() — service-role client.
 */
export async function resolveTeamErrorCounts(
  teamIds: readonly string[],
): Promise<Map<string, number>> {
  // Seed every requested team, so a caller never has to tell "no rows" apart
  // from "key missing because the resolver forgot about this team."
  const eventIdsByTeam = new Map<string, Set<string>>();
  for (const id of teamIds) eventIdsByTeam.set(id, new Set<string>());
  if (eventIdsByTeam.size === 0) return new Map();

  const admin = createAdminClient();
  const since = new Date(Date.now() - TEAM_ERROR_WINDOW_DAYS * 86400_000).toISOString();
  // De-duplicated by the Map above — a caller passing the same id twice must
  // not double the `.in()` payload or the counts.
  const teamIdList = Array.from(eventIdsByTeam.keys());

  // 1. Bulk membership → user_id -> every REQUESTED team that user is on.
  //    Same shape as resolveTeamUserIds, done once for all teams instead of
  //    once per team.
  const userTeamIds = new Map<string, Set<string>>();
  async function ingestMembership(
    label: string,
    embed: 'golf_players' | 'golf_coaches' | 'baseball_players' | 'baseball_coaches',
    build: (
      batch: string[],
      from: number,
      to: number,
    ) => PromiseLike<{ data: unknown[] | null; error: { message: string; code?: string | null } | null }>,
  ): Promise<void> {
    for (const batch of chunkIds(teamIdList)) {
      const { data, error } = await fetchAllRowsResult<unknown>((from, to) => build(batch, from, to));
      if (error) throw new Error(`resolveTeamErrorCounts: ${label}: ${error.message}`);
      for (const row of (data ?? []) as TeamMembershipRow[]) {
        const teamId = row.team_id;
        const uid = row[embed]?.user_id;
        if (!teamId || !uid || !eventIdsByTeam.has(teamId)) continue;
        const teams = userTeamIds.get(uid) ?? new Set<string>();
        teams.add(teamId);
        userTeamIds.set(uid, teams);
      }
    }
  }

  await Promise.all([
    ingestMembership('golf roster', 'golf_players', (batch, from, to) =>
      admin
        .from('golf_team_members')
        .select('team_id, golf_players(user_id)')
        .eq('status', 'active')
        .in('team_id', batch)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    ingestMembership('golf staff', 'golf_coaches', (batch, from, to) =>
      admin
        .from('golf_team_coach_staff')
        .select('team_id, golf_coaches(user_id)')
        .in('team_id', batch)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    ingestMembership('baseball roster', 'baseball_players', (batch, from, to) =>
      admin
        .from('baseball_team_members')
        .select('team_id, baseball_players(user_id)')
        .eq('status', 'active')
        .in('team_id', batch)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    ingestMembership('baseball staff', 'baseball_coaches', (batch, from, to) =>
      admin
        .from('baseball_team_coach_staff')
        .select('team_id, baseball_coaches(user_id)')
        .in('team_id', batch)
        .order('id', { ascending: true })
        .range(from, to),
    ),
  ]);

  // 2. One windowed event read per attribution path — never per team.
  const userIdList = Array.from(userTeamIds.keys());
  const baseErrorQuery = () =>
    excludeAuthNoise(
      admin
        .from('admin_events')
        .select('id, team_id, user_id')
        .eq('event_type', 'error')
        // severity is NOT NULL, so .in() cannot silently drop untyped rows.
        .in('severity', INCIDENT_SEVERITIES),
    ).gte('created_at', since);

  async function readErrors(
    label: string,
    ids: readonly string[],
    build: (
      batch: string[],
      from: number,
      to: number,
    ) => PromiseLike<{ data: unknown[] | null; error: { message: string; code?: string | null } | null }>,
  ): Promise<ErrorAttributionRow[]> {
    const rows: ErrorAttributionRow[] = [];
    // chunkIds([]) yields no batches, so an empty id list issues no query at
    // all rather than an `.in(col, [])` that matches nothing.
    for (const batch of chunkIds(ids)) {
      const { data, error } = await fetchAllRowsResult<unknown>((from, to) => build(batch, from, to));
      if (error) throw new Error(`resolveTeamErrorCounts: ${label}: ${error.message}`);
      rows.push(...((data ?? []) as ErrorAttributionRow[]));
    }
    return rows;
  }

  const [teamTagged, userResolved] = await Promise.all([
    readErrors('team-tagged errors', teamIdList, (batch, from, to) =>
      baseErrorQuery().in('team_id', batch).order('id', { ascending: true }).range(from, to),
    ),
    readErrors('user-resolved errors', userIdList, (batch, from, to) =>
      baseErrorQuery().in('user_id', batch).order('id', { ascending: true }).range(from, to),
    ),
  ]);

  for (const row of teamTagged) {
    if (row.team_id) eventIdsByTeam.get(row.team_id)?.add(row.id);
  }
  for (const row of userResolved) {
    if (!row.user_id) continue;
    // Both loops add the event ID to a Set, which is what makes the two
    // attribution paths a union rather than a sum — an event that is BOTH
    // team-tagged and user-resolved for the same team counts once.
    for (const teamId of userTeamIds.get(row.user_id) ?? []) {
      eventIdsByTeam.get(teamId)?.add(row.id);
    }
  }

  const counts = new Map<string, number>();
  for (const [teamId, ids] of eventIdsByTeam) counts.set(teamId, ids.size);
  return counts;
}
