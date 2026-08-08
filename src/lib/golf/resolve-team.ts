import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

/**
 * Why this is `console`, and not the Bridge logger.
 *
 * `@/lib/server-error-logger` reaches `node:async_hooks`, and this module is
 * genuinely part of the CLIENT bundle: the round-review page
 * (dashboard/rounds/[id]/review/page.tsx, a 'use client' component) calls
 * `resolveCoachTeamId` with a browser Supabase client. Importing the logger
 * here fails the webpack build outright — which is exactly what happened, and
 * what CI caught.
 *
 * So these failures land in the Vercel runtime log rather than in admin_events.
 * That is a real downgrade in queryability and worth closing later — either by
 * moving the client page off this resolver, or by returning a typed result and
 * letting the server callers log. It is NOT a downgrade against what was here
 * before, which was nothing at all: every one of these reads discarded its
 * error in silence.
 *
 * Server-guarded so a browser console is never filled with server diagnostics.
 */
function noteResolveTeamFailure(message: string, error: unknown): void {
  if (typeof window !== 'undefined') return;
  const detail =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message)
      : String(error);
  console.warn(`[resolve-team] ${message}: ${detail}`);
}


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
  //
  // EVERY read in this file binds its error, and none did before. This file has
  // no logger of its own historically, so a failed read here produced no staff
  // rows, no head_coach role, and a silent `canSwitch: false` — the Men's/
  // Women's toggle simply vanished from the shell with nothing said. Worse, the
  // empty result fell through to the ORG branch below, which lists teams the
  // coach may not be staffed on, so the switcher could show teams that the
  // write path would then refuse.
  const { data: staffRows, error: staffRowsError } = await supabase
    .from('golf_team_coach_staff')
    .select('team_id, role')
    .eq('coach_id', coachId);

  if (staffRowsError) {
    noteResolveTeamFailure(
      `staff read failed for coach ${coachId}; the team switcher will be hidden`,
      staffRowsError,
    );
    // Hiding the switcher is the safe answer, but do NOT continue into the org
    // fallback — "this coach has no staff rows" has not been established.
    return { teams: [], isHeadCoach: false, canSwitch: false };
  }

  const rows = staffRows ?? [];
  const staffTeamIds = [...new Set(rows.map((r) => r.team_id).filter(Boolean))] as string[];
  const isHeadCoach = rows.some((r) => r.role === 'head_coach');

  if (staffTeamIds.length > 0) {
    const { data: teams, error: teamsError } = await supabase
      .from('golf_teams')
      .select('id, name, gender')
      .in('id', staffTeamIds)
      .order('name', { ascending: true });

    if (teamsError) {
      // The coach IS staffed on these teams — only their names are missing. An
      // empty list would hide a switcher we already know they are entitled to.
      noteResolveTeamFailure(
      `team list read failed for coach ${coachId}; the switcher will be hidden despite ${staffTeamIds.length} staffed teams`,
      teamsError,
    );
    }

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
    const { data: teams, error: orgTeamsError } = await supabase
      .from('golf_teams')
      .select('id, name, gender')
      .eq('organization_id', organizationId)
      .order('name', { ascending: true });

    if (orgTeamsError) {
      noteResolveTeamFailure(
      `org team list read failed for coach ${coachId}`,
      orgTeamsError,
    );
    }

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
 * Validate that coachId is authorised to act as the given team.
 *
 * STAFF-STRICT: a coach is authorised only when they hold an explicit
 * golf_team_coach_staff row for THAT team. This is the men's/women's wall — a
 * coach staffed on the men's team cannot reach the sibling women's team in the
 * same program by forging/keeping the `golf_active_team` cookie. It matches the
 * write boundary in setActiveTeam (which also requires staff membership).
 *
 * Legacy escape hatch: a coach with NO staff rows ANYWHERE predates the
 * multi-team model. The program-onboarding backfill creates a head_coach row for
 * every org-having coach, so this branch is dead in practice; it only keeps a
 * pre-backfill coach from being locked out of their own org's team. The instant
 * ANY staff row exists for the coach, authorization is staff-strict.
 *
 * SECURITY: always call this before trusting a cookie value.
 */
export async function validateCoachTeamAccess(
  supabase: TypedSupabaseClient,
  coachId: string,
  teamId: string,
  organizationId: string | null | undefined,
): Promise<boolean> {
  // 1. Canonical: explicit staff row for THIS team.
  const { data: staffRow, error: staffRowError } = await supabase
    .from('golf_team_coach_staff')
    .select('id')
    .eq('coach_id', coachId)
    .eq('team_id', teamId)
    .maybeSingle();

  // Denying on a failed read is right — an authorization check that could not
  // run must not pass. But it was also SILENT, and the consequence is not just
  // a refusal: resolveCoachActiveTeamId treats `false` as "invalid cookie" and
  // seats the coach on their default team instead. For a program head staffed
  // on both squads that means the calendar, roster and every subsequent WRITE
  // silently move to the other team, and RLS permits it because they really are
  // staffed there. Nothing surfaced; nothing was logged.
  if (staffRowError) {
    noteResolveTeamFailure(
      `staff check failed for coach ${coachId} on team ${teamId}; access denied and the coach will be moved to their default team`,
      staffRowError,
    );
    return false;
  }

  if (staffRow) return true;

  // 2. Legacy-only fallback — ONLY when the coach has zero staff rows anywhere.
  //    A staffed coach can never reach a non-staffed sibling team via the org,
  //    which is what keeps the men's/women's wall intact.
  const { data: anyStaff, error: anyStaffError } = await supabase
    .from('golf_team_coach_staff')
    .select('id')
    .eq('coach_id', coachId)
    .limit(1);

  // THIS ONE FAILED OPEN, and it is the only read in the file that did.
  //
  // The legacy branch exists for a pre-backfill coach who has NO staff rows
  // anywhere; it accepts any team in their organization. A failed read left
  // `anyStaff` null, which is indistinguishable from "no rows", so the branch
  // ran for a fully-staffed coach — collapsing the men's/women's wall this
  // function exists to enforce. A men's-only assistant carrying a stale or
  // hand-edited cookie would have been granted the women's team.
  //
  // "The coach has no staff rows" is now something that must be READ, not
  // something inferred from a failure.
  if (anyStaffError) {
    noteResolveTeamFailure(
      `legacy staff check failed for coach ${coachId}; refusing rather than falling back to org-wide access`,
      anyStaffError,
    );
    return false;
  }

  if ((!anyStaff || anyStaff.length === 0) && organizationId) {
    const { data: team, error: teamError } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('id', teamId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (teamError) {
      noteResolveTeamFailure(
      `legacy org check failed for coach ${coachId} on team ${teamId}`,
      teamError,
    );
      return false;
    }

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
    const { data: staffRows, error: staffRowsError } = await supabase
      .from('golf_team_coach_staff')
      .select('team_id, is_primary')
      .eq('coach_id', coachId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });

    // A failed read here was indistinguishable from "this coach is staffed on
    // nothing", so control fell to the ORG resolver — which ranks teams by
    // active-player count. At Shenandoah that is 10 men over 6 women, so the
    // women's head coach was silently seated on the men's team, saw the wrong
    // roster and calendar stated as fact, and every create action wrote the
    // men's team_id.
    //
    // Returning null instead sends them to the roster page, which is visible
    // and recoverable. Guessing a team is neither.
    if (staffRowsError) {
      noteResolveTeamFailure(
      `default team read failed for coach ${coachId}; refusing to guess a team rather than falling back to the org's member-ranked pick`,
      staffRowsError,
    );
      return null;
    }

    const staffTeamId = staffRows?.[0]?.team_id;
    if (staffTeamId) return staffTeamId;
  }

  // Genuinely no staff rows → original deterministic org-based resolution.
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
