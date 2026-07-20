import { permanentRedirect } from 'next/navigation';

/**
 * `/golf/dashboard/analytics/coachhelm` — LEGACY, permanently redirected
 * (2026-07-19, plan Task 9). Effectiveness is now the `effectiveness` drill
 * of the coach Intelligence home (spec §5.4, mounting `FairwayEffectiveness`
 * unchanged) — the stage IS the nav. `drills.ts` still calls
 * `revalidatePath('/golf/dashboard/analytics/coachhelm')`, so this route
 * stays live as a permanent-redirect shim (never a 404) — same pattern as
 * `/my-standing`. `surface-registry.ts`'s `effectiveness` entry is
 * `legacy: true, hidden: true` and points here-onward.
 */
export default function CoachHelmAnalyticsRedirect(): never {
  permanentRedirect('/golf/dashboard/intelligence?view=effectiveness');
}
