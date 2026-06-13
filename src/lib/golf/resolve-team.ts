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

/** Lightweight team descriptor returned by getCoachTeams(). */
export interface CoachTeamOption {
  id: string;
  name: string;
  gender: string;
}

/**
 * Everything the team-switcher needs to decide whether — and what — to render.
 *
 * Switching is a PROGRAM-HEAD capability:
 *   canSwitch = the coach is explicitly staffed on >1 team via
 *   golf_team_coach_staff AND holds role 'head_coach' on at least one of
 *   those staff rows. A multi-team assistant keeps default-team behaviour
 *   (no toggle, no switch). A single-team head coach (e.g. the women's head
 *   coach of a two-team program) sees only their own team — no toggle.
 */
export interface CoachTeamSwitchContext {
  /** Teams the coach can see (staff-derived; org fallback for display only). */
  teams: CoachTeamOption[];
  /** True when ≥1 golf_team_coach_staff row carries role 'head_coach'. */
  isHeadCoach: boolean;
  /** True when the switcher should render AND setActiveTeam may switch. */
  canSwitch: boolean;
}

/**
 * Resolve the coach's team list AND the head-coach switching gate in one place.
 *
 * - Teams come from golf_team_coach_staff (canonical). When the coach has no
 *   staff rows, the org-based team list is returned for DISPLAY purposes, but
 *   `canSwitch` is always false in that case (no staff row ⇒ no head_coach role).
 * - `canSwitch` requires BOTH >1 staffed team AND a 'head_coach' staff role.
 */
export async function getCoachTeamSwitchContext(
  supabase: TypedSupabaseClient,
  coachId: string | null | undefined,
  organizationId: string | null | undefined,
): Promise<CoachTeamSwitchContext> {
  if (!coachId) return { teams: [], isHeadCoach: false, canSwitch: false };

  // 1. Canonical: golf_team_coach_staff (the source of truth for multi-team coaches).
  const { data: staffRows } = await supabase
    .from('golf_team_coach_staff')
    .select('team_id, role')
    .eq('coach_id', coachId);

  const rows = staffRows ?? [];
  const staffTeamIds = [...new Set(rows.map((r) => r.team_id).filter(Boolean))] as string[];
  const isHeadCoach = rows.some((r) => r.role === 'head_coach');

  if (staffTeamIds.length > 0) {
    const { data: teams } = await supabase
      .from('golf_teams')
      .select('id, name, gender')
      .in('id', staffTeamIds)
      .order('name', { ascending: true });
    const teamList = (teams ?? []) as CoachTeamOption[];
    return {
      teams: teamList,
      isHeadCoach,
      canSwitch: isHeadCoach && teamList.length > 1,
    };
  }

  // 2. Fallback: org-based lookup (for coaches not yet in golf_team_coach_staff).
  //    Display-only — no staff rows means no head_coach role, so never switchable.
  if (organizationId) {
    const { data: teams } = await supabase
      .from('golf_teams')
      .select('id, name, gender')
      .eq('organization_id', organizationId)
      .order('name', { ascending: true });
    return { teams: (teams ?? []) as CoachTeamOption[], isHeadCoach: false, canSwitch: false };
  }

  return { teams: [], isHeadCoach: false, canSwitch: false };
}

/**
 * Return all teams a coach is explicitly staffed on (via golf_team_coach_staff).
 * Falls back to the org-based lookup when the staff table has no rows for this coach.
 *
 * @returns Array of teams (may be empty if the coach has no team assignments).
 */
export async function getCoachTeams(
  supabase: TypedSupabaseClient,
  coachId: string | null | undefined,
  organizationId: string | null | undefined,
): Promise<CoachTeamOption[]> {
  const ctx = await getCoachTeamSwitchContext(supabase, coachId, organizationId);
  return ctx.teams;
}

/**
 * Validate that coachId is actually staffed on teamId (golf_team_coach_staff),
 * OR that the team belongs to the coach's organization.
 * Returns true when the coach is authorised to view that team.
 *
 * SECURITY: always call this before trusting a cookie value.
 */
export async function validateCoachTeamAccess(
  supabase: TypedSupabaseClient,
  coachId: string,
  teamId: string,
  organizationId: string | null | undefined,
): Promise<boolean> {
  // 1. Primary: explicit staff row.
  const { data: staffRow } = await supabase
    .from('golf_team_coach_staff')
    .select('id')
    .eq('coach_id', coachId)
    .eq('team_id', teamId)
    .maybeSingle();

  if (staffRow) return true;

  // 2. Fallback: team belongs to coach's org.
  if (organizationId) {
    const { data: team } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('id', teamId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (team) return true;
  }

  return false;
}

/**
 * Cookie-aware team resolver.
 *
 * Priority order:
 *   1. `cookieTeamId` value — if provided AND the coach has access to it.
 *   2. The coach's own staffed team (golf_team_coach_staff; is_primary first,
 *      then oldest staff row). A coach staffed on a specific team — e.g. the
 *      women's head coach of a two-team program — always lands on THEIR team,
 *      never the org's member-ranked pick.
 *   3. Fall back to the deterministic org-based resolver (existing behaviour).
 *
 * SECURITY: the cookie value is validated against golf_team_coach_staff / org
 * before use so an attacker cannot forge access to another team.
 *
 * @param supabase      A server-scoped Supabase client.
 * @param organizationId The coach's organization_id.
 * @param coachId       The coach's golf_coaches.id.
 * @param cookieTeamId  Value from the `golf_active_team` cookie (may be undefined).
 * @returns The resolved team id, or null when no team can be found.
 */
export async function resolveCoachActiveTeamId(
  supabase: TypedSupabaseClient,
  organizationId: string | null | undefined,
  coachId: string | null | undefined,
  cookieTeamId: string | null | undefined,
): Promise<string | null> {
  // Validate the cookie value when one is present.
  if (cookieTeamId && coachId) {
    const allowed = await validateCoachTeamAccess(supabase, coachId, cookieTeamId, organizationId);
    if (allowed) return cookieTeamId;
    // Invalid / tampered cookie — fall through to default.
  }

  // No valid cookie → prefer the coach's own staffed team (the canonical
  // coach↔team relationship). is_primary first, then the oldest staff row
  // ("the coach's first team").
  if (coachId) {
    const { data: staffRows } = await supabase
      .from('golf_team_coach_staff')
      .select('team_id, is_primary')
      .eq('coach_id', coachId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });
    const staffTeamId = staffRows?.[0]?.team_id;
    if (staffTeamId) return staffTeamId;
  }

  // No staff rows → original deterministic org-based resolution.
  return resolveCoachTeamId(supabase, organizationId, coachId);
}

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
