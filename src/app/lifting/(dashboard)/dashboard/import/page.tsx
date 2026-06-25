// =============================================================================
// src/app/lifting/(dashboard)/dashboard/import/page.tsx
//
// Helm Lifting Lab — Data Import page (server component).
//
// Resolves the org + access, fetches recent import runs for context, and
// hydrates the ImportClient with the data it needs to drive the
// upload → preview → commit/rollback flow.
//
// The three import actions (initiateImportRun / commitImportRun /
// rollbackImportRun) live in src/app/lifting/actions/imports.ts and are
// called directly from ImportClient as server actions.
// =============================================================================

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { resolveLiftingAccess } from '@/lib/lifting/access';
import { ImportClient } from './import-client';
import type { HelmLiftingCoachRow, HelmLiftingSport } from '@/lib/types/helm-lifting';
import type { HelmLiftingImportRunRow } from '@/lib/types/helm-lifting-data';

export const metadata = {
  title: 'Import Data · Helm Lifting Lab',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveOrgAndSport(userId: string): Promise<{
  orgId: string | null;
  coachId: string | null;
  sport: HelmLiftingSport;
}> {
  const supabase = await createClient();

  const { data: coachRow } = await fromUntyped(supabase, 'helm_lifting_coaches')
    .select('id, organization_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle() as { data: Pick<HelmLiftingCoachRow, 'id' | 'organization_id'> | null };

  if (coachRow) {
    // Derive sport from the first active assignment
    const { data: assignRow } = await fromUntyped(supabase, 'helm_lifting_coach_assignments')
      .select('sport')
      .eq('coach_id', coachRow.id)
      .eq('organization_id', coachRow.organization_id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle() as { data: { sport: string } | null };

    const sport: HelmLiftingSport = (assignRow?.sport as HelmLiftingSport | null) ?? 'baseball';
    return { orgId: coachRow.organization_id, coachId: coachRow.id, sport };
  }

  // Viewer path
  const { data: viewerRow } = await fromUntyped(supabase, 'helm_lifting_org_viewers')
    .select('organization_id')
    .eq('user_id', userId)
    .maybeSingle() as { data: { organization_id: string } | null };

  return {
    orgId: viewerRow?.organization_id ?? null,
    coachId: null,
    sport: 'baseball',
  };
}

async function fetchRecentRuns(orgId: string): Promise<HelmLiftingImportRunRow[]> {
  const supabase = await createClient();
  const { data } = await fromUntyped(supabase, 'helm_lifting_import_runs')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(20) as { data: HelmLiftingImportRunRow[] | null };
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ImportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/lifting/login');

  const { orgId, sport } = await resolveOrgAndSport(user.id);
  if (!orgId) redirect('/lifting/login');

  const access = await resolveLiftingAccess(orgId);
  if (!access.canView) redirect('/lifting/login');

  const rawRuns = await fetchRecentRuns(orgId);

  // Shape for the client — keep only serialisable fields
  const recentRuns = rawRuns.map((r) => ({
    id: r.id,
    fileName: r.file_name ?? null,
    source: r.source,
    importKind: r.import_kind,
    totalRows: r.total_rows,
    matchedRows: r.matched_rows,
    unmatchedRows: r.unmatched_rows,
    status: r.status,
    createdAt: r.created_at,
  }));

  return (
    <ImportClient
      orgId={orgId}
      sport={sport}
      canEdit={access.canEdit}
      recentRuns={recentRuns}
    />
  );
}
