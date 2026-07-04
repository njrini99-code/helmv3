import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

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
 * CALLER must have passed requireSuperAdmin() — both resolvers use the
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
  if (membersRes.error && coachesRes.error && baseballMembersRes.error && baseballCoachesRes.error) {
    throw new Error(
      `resolveTeamUserIds: golf members=${membersRes.error.message}; golf coaches=${coachesRes.error.message}; baseball members=${baseballMembersRes.error.message}; baseball coaches=${baseballCoachesRes.error.message}`,
    );
  }

  const ids = new Set<string>();
  for (const row of (membersRes.error ? [] : membersRes.data ?? []) as unknown as TeamMemberEmbedRow[]) {
    const uid = row.golf_players?.user_id;
    if (uid) ids.add(uid);
  }
  for (const row of (coachesRes.error ? [] : coachesRes.data ?? []) as unknown as TeamCoachEmbedRow[]) {
    const uid = row.golf_coaches?.user_id;
    if (uid) ids.add(uid);
  }
  for (const row of (baseballMembersRes.error ? [] : baseballMembersRes.data ?? []) as unknown as BaseballTeamMemberEmbedRow[]) {
    const uid = row.baseball_players?.user_id;
    if (uid) ids.add(uid);
  }
  for (const row of (baseballCoachesRes.error ? [] : baseballCoachesRes.data ?? []) as unknown as BaseballTeamCoachEmbedRow[]) {
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
  if (golfRes.error && baseballRes.error) {
    throw new Error(`resolveTeamConversationIds: golf=${golfRes.error.message}; baseball=${baseballRes.error.message}`);
  }
  return new Set([
    ...((golfRes.error ? [] : golfRes.data ?? []) as unknown as Array<{ id: string }>).map((r) => r.id),
    ...((baseballRes.error ? [] : baseballRes.data ?? []) as unknown as Array<{ id: string }>).map((r) => r.id),
  ]);
}
