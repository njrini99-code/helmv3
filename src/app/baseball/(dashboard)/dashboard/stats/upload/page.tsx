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
// column mapping). This is now a pure redirect shim, mirroring the
// stats -> stats-center legacy-redirect idiom at
// src/app/baseball/(dashboard)/dashboard/stats/page.tsx.
//
// Auth + the can_manage_imports capability are (re-)enforced by Import
// Center's own page (and by middleware's STAFF_CAPABILITY_ROUTES map) — not
// duplicated here.
// =============================================================================

import { redirect } from 'next/navigation';

export default function StatsUploadPage() {
  redirect('/baseball/dashboard/import');
}
