/**
 * ============================================================================
 * CoachHelm · chat · context — who is asking, and what they are allowed to see
 * ----------------------------------------------------------------------------
 * Resolved ONCE per request, server-side, from the authenticated session. The
 * model never supplies any of it.
 *
 * That is the whole security posture in one sentence. A tool argument named
 * `team_id` is a suggestion from a language model that may have been steered by
 * text a player typed into a round note; it is not authority. So the tools in
 * this package do not take a `team_id` at all — they close over this context,
 * and every `player_id` they DO accept is checked against
 * {@link CoachChatContext.roster} before a single row is read.
 *
 * Two consequences worth stating plainly:
 *
 *   · Cross-team access fails server-side even if the request is hand-edited,
 *     because the team is never read from the request.
 *   · The agent never has to ask the coach for an id, which is also why the old
 *     prompt's "here is your team_id, use it" paragraph is gone. It was leaking
 *     database identifiers into a conversation for no benefit.
 * ========================================================================== */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';

type Sb = SupabaseClient<Database>;

/** One active roster member, resolved server-side. */
export interface RosterPlayer {
  id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  graduation_year: number | null;
}

export interface CoachChatContext {
  coach_id: string;
  user_id: string;
  team_id: string;
  team_name: string;
  /** IANA zone from `golf_teams.timezone` (NOT NULL in the schema). */
  timezone: string;
  /**
   * Every ACTIVE roster member. This is the authoritative roster — the count
   * here is what "how many players do I have" means, and it is never derived
   * from how many rows a later join happened to succeed on.
   */
  roster: RosterPlayer[];
}

/** Raised when the caller is not a coach, or has no resolvable active team. */
export class CoachContextError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403 | 404,
  ) {
    super(message);
    this.name = 'CoachContextError';
  }
}

/**
 * Resolve the full chat context for the authenticated caller.
 *
 * Honours the `golf_active_team` cookie through the canonical resolver, so a
 * program head running two teams gets the team they have actually toggled to
 * rather than whichever one sorts first.
 */
export async function resolveCoachChatContext(sb: Sb): Promise<CoachChatContext> {
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new CoachContextError('Not signed in', 401);

  const { data: coach } = await sb
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!coach) throw new CoachContextError('This surface is for coaches', 403);

  const teamId = await resolveCoachTeamIdWithCookie(sb, coach.organization_id, coach.id);
  if (!teamId) throw new CoachContextError('No active team for this coach', 404);

  const { data: team } = await sb
    .from('golf_teams')
    .select('id, name, timezone')
    .eq('id', teamId)
    .maybeSingle();
  if (!team) throw new CoachContextError('Active team not found', 404);

  const roster = await loadActiveRoster(sb, teamId);

  return {
    coach_id: coach.id,
    user_id: user.id,
    team_id: team.id,
    team_name: team.name,
    timezone: team.timezone,
    roster,
  };
}

/**
 * The authoritative active roster.
 *
 * Deliberately TWO queries rather than one embedded join. The embedded form
 * (`select('player_id, player:golf_players(...)')`) is what produced the
 * seven-players-reported-as-six bug: when a `golf_players` row is missing or
 * unreadable the join comes back null, the caller filters it out, and the
 * member vanishes with no signal anywhere.
 *
 * Splitting the queries means the membership count and the profile count are
 * separately observable, so a gap becomes a `partial` coverage state the coach
 * can see instead of a silently smaller number. A member whose profile did not
 * load still appears here — under a neutral placeholder name — because the
 * honest statement is "this player is on your roster and I could not read their
 * profile", never "this player does not exist".
 */
export async function loadActiveRoster(sb: Sb, teamId: string): Promise<RosterPlayer[]> {
  const { data: members } = await sb
    .from('golf_team_members')
    .select('player_id')
    .eq('team_id', teamId)
    .eq('status', 'active');

  const memberIds = (members ?? [])
    .map((m) => m.player_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (memberIds.length === 0) return [];

  const { data: profiles } = await sb
    .from('golf_players')
    .select('id, first_name, last_name, graduation_year')
    .in('id', memberIds);

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

  return memberIds.map((id) => {
    const p = byId.get(id);
    const name = `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim();
    return {
      id,
      // A missing profile is surfaced, not dropped. See the doc comment above.
      name: name || 'Unnamed player',
      first_name: p?.first_name ?? null,
      last_name: p?.last_name ?? null,
      graduation_year: p?.graduation_year ?? null,
    };
  });
}

/**
 * Assert a model-supplied player id belongs to the coach's active roster.
 *
 * Returns the roster entry so callers get the display name for free, and
 * throws otherwise. Every tool that accepts a `player_id` runs this FIRST —
 * before any read — so an id the model hallucinated or inherited from another
 * team's conversation cannot reach a query at all.
 */
export function requireRosterPlayer(ctx: CoachChatContext, playerId: string): RosterPlayer {
  const found = ctx.roster.find((p) => p.id === playerId);
  if (!found) {
    throw new CoachContextError('That player is not on your active roster', 403);
  }
  return found;
}

/**
 * Resolve a player the coach referred to by name.
 *
 * Entity mentions from the composer arrive as ids and skip this entirely; this
 * is the fallback for plain typing ("compare Nick and Sam"). Exact match wins,
 * then unique prefix, then unique substring. Ambiguity returns null rather than
 * guessing — picking one of two Nicks silently is worse than asking.
 */
export function resolveRosterPlayerByName(
  ctx: CoachChatContext,
  query: string,
): RosterPlayer | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const exact = ctx.roster.filter((p) => p.name.toLowerCase() === q);
  if (exact.length === 1) return exact[0] ?? null;

  const firstName = ctx.roster.filter((p) => (p.first_name ?? '').toLowerCase() === q);
  if (firstName.length === 1) return firstName[0] ?? null;

  const prefix = ctx.roster.filter((p) => p.name.toLowerCase().startsWith(q));
  if (prefix.length === 1) return prefix[0] ?? null;

  const contains = ctx.roster.filter((p) => p.name.toLowerCase().includes(q));
  if (contains.length === 1) return contains[0] ?? null;

  return null;
}
