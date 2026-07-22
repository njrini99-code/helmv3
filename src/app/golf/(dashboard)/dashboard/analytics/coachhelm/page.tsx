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
 *
 * BELT-AND-BRACES (2026-07-22): next.config.mjs `redirects()` now intercepts
 * `/golf/dashboard/analytics/coachhelm` at the framework routing layer,
 * before this page ever renders — the fix for the React #310 "rendered more
 * hooks" crash on client-navigation into bare redirect() shims. This
 * component stays only as a fallback for anything the config layer misses
 * (and because `drills.ts` still calls
 * `revalidatePath('/golf/dashboard/analytics/coachhelm')`); it should no
 * longer actually execute in normal operation.
 */
export default function CoachHelmAnalyticsRedirect(): never {
  permanentRedirect('/golf/dashboard/intelligence?view=effectiveness');
}
