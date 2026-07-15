// =============================================================================
// src/app/baseball/(dashboard)/dashboard/stats/upload/page.tsx
//
// WIZARD CONSOLIDATION — this route used to render the standalone
// StatsUploadClient wizard (drag-a-CSV, map columns, match players, upload).
// Every capability it had that Import Center lacked has been ported there
// as the "Quick box score" entry point on the choose step (drag-and-drop
// upload + a data-preview table), and Import Center already covers — with a
// strictly larger, audited, rollback-able pipeline — everything else this
// page used to do (atomic save_baseball_full_box_score RPC, player matching,
// column mapping).
//
// CAPABILITY-AWARE ROUTING (fix-first, wizard-consolidation review) — Import
// Center's own page (and middleware's STAFF_CAPABILITY_ROUTES map) gate on
// can_manage_imports. A plain redirect straight there — as this page used to
// be — locks out every default staff role that holds can_manage_stats but
// NOT can_manage_imports (assistant/pitching/hitting/catching/defensive/
// strength coach; see BASEBALL_STAFF_ROLE_PRESETS in
// src/lib/types/baseball-staff-roles.ts). Those roles could reach and
// interact with this wizard before the consolidation, so this route now
// branches on capability instead of redirecting unconditionally:
//   - can_manage_imports staff  -> redirected on to the full, canonical
//     Import Center (source registry, event-level mode, rollback).
//   - can_manage_stats-only staff -> the SAME ImportWizardClient renders
//     INLINE, right here, restricted to the "Quick box score" entry point
//     (quickEntryOnly) — middleware's STAFF_CAPABILITY_ROUTES already
//     allowlists this exact route at can_manage_stats, so no middleware
//     change is needed to restore their reachability.
//   - neither capability -> redirected to Command Center, same fallback
//     Import Center's own page uses.
// =============================================================================

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import { hasBaseballCapability } from '@/lib/baseball/capabilities';
import { getRecentUploads } from '@/app/baseball/actions/stats';
import { getRosterForImportMatching } from '@/lib/baseball/import-roster';
import { ImportWizardClient } from '@/components/baseball/import-center/ImportWizardClient';
import { fairwayScope } from '@/lib/redesign/flag';
import type { BaseballStatUpload } from '@/lib/types';

export default async function StatsUploadPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/baseball/login');

  const context = await getActiveBaseballContext();
  if (!context) redirect('/baseball/dashboard/command-center');

  const teamId = context.activeTeamId;

  // Import-capable staff get the full, canonical Import Center — the SAME
  // destination this shim has always pointed to for them.
  const canImport = await hasBaseballCapability(teamId, 'can_manage_imports');
  if (canImport) redirect('/baseball/dashboard/import');

  const canManageStats = await hasBaseballCapability(teamId, 'can_manage_stats');
  if (!canManageStats) redirect('/baseball/dashboard/command-center');

  // STATS-ONLY STAFF — render the quick-box-score wizard directly at this
  // (already can_manage_stats-gated) route instead of bouncing them at
  // Import Center's can_manage_imports gate.
  const { data: team } = await supabase
    .from('baseball_teams')
    .select('id, name')
    .eq('id', teamId)
    .maybeSingle();

  const players = await getRosterForImportMatching(supabase, teamId);

  let legacyUploads: BaseballStatUpload[] = [];
  try {
    const legacy = await getRecentUploads(teamId, 20);
    legacyUploads = legacy.data ?? [];
  } catch {
    legacyUploads = [];
  }

  return (
    <div className={fairwayScope('min-h-full')}>
      <ImportWizardClient
        teamId={teamId}
        teamName={team?.name ?? 'Your Team'}
        players={players}
        recentRuns={[]}
        legacyUploads={legacyUploads}
        quickEntryOnly
      />
    </div>
  );
}
