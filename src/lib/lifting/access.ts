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
//   canView   — isCoach OR any viewer row for the org (any sport)
//   coachRow  — the helm_lifting_coaches row (null if not a coach)
//   assignments — the coach's active team assignments (empty if not a coach)
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

  const canView = isCoach || hasViewerRow;
  const canEdit = isCoach || viewerCanEdit;

  return {
    isCoach,
    canEdit,
    canView,
    coachRow: coachRow ?? null,
    assignments,
  };
}
