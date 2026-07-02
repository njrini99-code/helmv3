import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { PanelNoData } from '../_components/PanelStates';

export const dynamic = 'force-dynamic';

/**
 * W9 placeholder — the Baseball tab is HELD by owner directive until
 * W5–W13 are verified in prod (BaseballHelm is iffy in prod; no baseball
 * app code may be modified). The nav entry stays (canonical 9-tab keyboard
 * map); this page exists so tab 5 lands on an honest held state instead of
 * a shell-less 404. Read-only baseball surfacing elsewhere (Overview,
 * Users & Teams) is unaffected.
 */
export default async function BaseballTabPage() {
  await requireSuperAdmin();
  return (
    <main className="space-y-6 p-6">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">Baseball</h2>
      <PanelNoData
        label="Baseball tab is held"
        description="Instrumentation for BaseballHelm is deferred until the golf + CoachHelm rollout is verified in prod. Baseball users and errors still surface in Overview, Errors, and Users & Teams."
      />
    </main>
  );
}
