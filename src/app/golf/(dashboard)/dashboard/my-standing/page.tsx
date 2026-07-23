import { permanentRedirect } from 'next/navigation';

/**
 * `/golf/dashboard/my-standing` — LEGACY, permanently redirected.
 *
 * Standing is now the `standing` drill of the Player CoachHelm Spine & Stage
 * home (spec §5.3) — the stage IS the nav, so this standalone route no
 * longer renders its own page. `surface-registry.ts`'s `my-standing-tab`
 * entry is `legacy: true, hidden: true` and points its canonical href
 * here-onward at `/golf/dashboard/coachhelm?view=standing`.
 *
 * BELT-AND-BRACES (2026-07-22): next.config.mjs `redirects()` now intercepts
 * this path at the framework routing layer, before this page ever renders —
 * the fix for the React #310 "rendered more hooks" crash on client-navigation
 * into bare redirect() shims. This component stays only as a fallback for
 * anything the config layer misses; it should no longer actually execute in
 * normal operation.
 */
export default function MyStandingRedirect(): never {
  permanentRedirect('/golf/dashboard/coachhelm?view=standing');
}
