import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

/**
 * A typed Supabase client. Helpers in this module take an already-created client
 * as a parameter so they stay framework-neutral and reuse the caller's
 * request-scoped client. Both the server client (`createServerClient`) and the
 * browser client (`createBrowserClient`) are assignable to this type, so the
 * same helper works from Server Components, Server Actions, and Client
 * Components alike.
 */
type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * Deterministically resolve a coach's `golf_teams.id` from their organization.
 *
 * Why this exists: `golf_coaches` has no `team_id` column — a coach's team is
 * derived from `organization_id`. Historically call sites did:
 *
 *   supabase.from('golf_teams').select('id')
 *     .eq('organization_id', orgId).maybeSingle()
 *
 * `.maybeSingle()` THROWS when an organization has more than one team (the demo
 * org has a real team plus an empty legacy duplicate). That broke team
 * resolution and surfaced as "No Team Found" / empty dashboards.
 *
 * This helper never uses `.maybeSingle()`. It selects ALL teams for the org plus
 * each team's active-member count, then picks deterministically:
 *   1. the team with the MOST active members (`golf_team_members.status='active'`)
 *   2. tie-break: the most recently created team (`created_at` desc)
 *
 * @param supabase An already-created Supabase client (server or browser).
 * @param organizationId The coach's `organization_id` (may be null/undefined).
 * @param _coachId Optional coach id — accepted for call-site symmetry / future
 *   use; resolution is currently org-scoped (a coach's team is its org's team).
 * @returns The resolved team id, or `null` when the org has no teams.
 */
export async function resolveCoachTeamId(
  supabase: TypedSupabaseClient,
  organizationId: string | null | undefined,
  _coachId?: string | null
): Promise<string | null> {
  if (!organizationId) return null;

  // NOTE: `.select()` (NOT `.maybeSingle()`) so an org with multiple teams can
  // never throw. We rank in code below.
  const { data: teams, error } = await supabase
    .from('golf_teams')
    .select('id, created_at')
    .eq('organization_id', organizationId);

  if (error || !teams || teams.length === 0) return null;

  // Fast path: a single team needs no ranking — return it even if it has zero
  // active members (a real, empty team must still resolve).
  if (teams.length === 1) return teams[0]?.id ?? null;

  // Multiple teams: count active members per team. A SEPARATE query (rather than
  // a filtered embed) so that teams with ZERO active members are NOT dropped —
  // they remain eligible and only lose the ranking to teams that have members.
  const teamIds = teams.map((t) => t.id);
  const { data: members } = await supabase
    .from('golf_team_members')
    .select('team_id')
    .in('team_id', teamIds)
    .eq('status', 'active');

  const activeCountByTeam = new Map<string, number>();
  for (const m of members ?? []) {
    if (!m.team_id) continue;
    activeCountByTeam.set(m.team_id, (activeCountByTeam.get(m.team_id) ?? 0) + 1);
  }

  const ranked = [...teams].sort((a, b) => {
    // 1. Most active members wins.
    const memberDelta = (activeCountByTeam.get(b.id) ?? 0) - (activeCountByTeam.get(a.id) ?? 0);
    if (memberDelta !== 0) return memberDelta;
    // 2. Tie-break: most recently created team wins.
    const aCreated = a.created_at ? Date.parse(a.created_at) : 0;
    const bCreated = b.created_at ? Date.parse(b.created_at) : 0;
    return bCreated - aCreated;
  });

  return ranked[0]?.id ?? null;
}
