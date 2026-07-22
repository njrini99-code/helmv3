import { permanentRedirect } from 'next/navigation';

/**
 * `/golf/dashboard/my-development` — LEGACY, permanently redirected.
 *
 * Player Development is now the `development` drill of the Player CoachHelm
 * Spine & Stage home (spec §5.3) — the stage IS the nav, so this standalone
 * route no longer renders its own page. `surface-registry.ts`'s
 * `my-development-tab` entry is `legacy: true, hidden: true` and points its
 * canonical href here-onward at `/golf/dashboard/coachhelm?view=development`.
 *
 * BELT-AND-BRACES (2026-07-22): next.config.mjs `redirects()` now intercepts
 * this path at the framework routing layer, before this page ever renders —
 * the fix for the React #310 "rendered more hooks" crash on client-navigation
 * into bare redirect() shims. This component stays only as a fallback for
 * anything the config layer misses (and because `player-feedback.ts`,
 * `golf.ts`, `round-reviews.ts`, `development.ts`, `v3/goals.ts` still call
 * `revalidatePath('/golf/dashboard/my-development')`); it should no longer
 * actually execute in normal operation.
 */
export default function MyDevelopmentRedirect(): never {
  permanentRedirect('/golf/dashboard/coachhelm?view=development');
}
