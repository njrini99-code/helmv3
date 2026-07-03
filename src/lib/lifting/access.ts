// =============================================================================
// src/lib/lifting/access.ts
//
// resolveLiftingAccess — server-side access resolution for the Helm Lifting Lab.
// Call this from dashboard layouts and server actions to determine what the
// current user can do within a given org.
//
// Returns:
//   isCoach   — the user has an active helm_lifting_coaches row for this org
//   canEdit   — isCoach OR viewer with can_edit=true (no-coach mode)
//   canView   — isCoach OR any viewer row for the org (any sport) OR the user
//               owns a helm_lifting_athletes row in this org (athlete-self —
//               mirrors the DB-level RLS helper helm_lifting_is_my_athlete()).
//               Athlete-self NEVER grants canEdit.
//   coachRow  — the helm_lifting_coaches row (null if not a coach)
//   assignments — the coach's active team assignments (empty if not a coach)
//   athleteId — the caller's own helm_lifting_athletes.id for this org, when
//               resolved via the athlete-self branch (null otherwise)
//
// This is a READ-ONLY resolver — it never modifies any row.
// Actions that need to gate mutations call this first, then check canEdit.
// =============================================================================

import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import type {
  HelmLiftingAccessResult,
  HelmLiftingCoachRow,
  HelmLiftingCoachAssignmentRow,
} from '@/lib/types/helm-lifting';

/**
 * Resolve what the currently-authenticated user can do in the given Lifting Lab org.
 *
 * @param orgId — the organizations.id to scope the check
 * @returns HelmLiftingAccessResult — { isCoach, canEdit, canView, coachRow, assignments }
 *
 * Throws if there is no authenticated user (the caller should 401/redirect before
 * reaching here, but the throw provides a safety net).
 */
export async function resolveLiftingAccess(orgId: string): Promise<HelmLiftingAccessResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('unauthenticated');
  }

  // 1. Check for an active lifting coach row
  const { data: coachRow } = await fromUntyped(supabase, 'helm_lifting_coaches')
    .select('*')
    .eq('user_id', user.id)
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .maybeSingle() as { data: HelmLiftingCoachRow | null };

  const isCoach = coachRow !== null;

  // 2. Fetch assignments (only populated if coach)
  let assignments: HelmLiftingCoachAssignmentRow[] = [];
  if (isCoach && coachRow) {
    const { data: assignRows } = await fromUntyped(supabase, 'helm_lifting_coach_assignments')
      .select('*')
      .eq('coach_id', coachRow.id)
      .eq('organization_id', orgId)
      .eq('is_active', true) as { data: HelmLiftingCoachAssignmentRow[] | null };
    assignments = assignRows ?? [];
  }

  // 3. Check org viewer row (for head coaches, no-coach mode)
  const { data: viewerRows } = await fromUntyped(supabase, 'helm_lifting_org_viewers')
    .select('can_edit')
    .eq('organization_id', orgId)
    .eq('user_id', user.id) as { data: Array<{ can_edit: boolean }> | null };

  const hasViewerRow = (viewerRows?.length ?? 0) > 0;
  const viewerCanEdit = viewerRows?.some((r) => r.can_edit) ?? false;

  // 4. Check athlete-self row — a plain player who owns a helm_lifting_athletes
  //    row in this org. Mirrors the RLS helper helm_lifting_is_my_athlete(),
  //    which matches on (helm_lifting_athletes.id = p_athlete AND
  //    helm_lifting_athletes.user_id = auth.uid()) with no organization filter
  //    baked into the SQL function itself — but every RLS policy that calls it
  //    is already scoped to the row's own organization_id, so scoping this
  //    lookup to orgId here reproduces the same effective grant.
  //    Athlete-self grants canView ONLY — never canEdit.
  const { data: athleteRow } = await fromUntyped(supabase, 'helm_lifting_athletes')
    .select('id')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle() as { data: { id: string } | null };

  const isAthleteSelf = athleteRow !== null;

  const canView = isCoach || hasViewerRow || isAthleteSelf;
  const canEdit = isCoach || viewerCanEdit;

  return {
    isCoach,
    canEdit,
    canView,
    coachRow: coachRow ?? null,
    assignments,
    athleteId: athleteRow?.id ?? null,
  };
}

/**
 * Resolve the lifting org for the current user — active coach row first, then
 * org-viewer row (head-coach cross-portal). Mirrors lifting dashboard layout.
 */
export async function resolveLiftingOrgIdForUser(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: coachRow } = await fromUntyped(supabase, 'helm_lifting_coaches')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle() as { data: { organization_id: string } | null };

  if (coachRow?.organization_id) return coachRow.organization_id;

  const { data: viewerRow } = await fromUntyped(supabase, 'helm_lifting_org_viewers')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle() as { data: { organization_id: string } | null };

  return viewerRow?.organization_id ?? null;
}
