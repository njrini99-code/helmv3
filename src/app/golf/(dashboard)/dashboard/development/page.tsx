import { permanentRedirect } from 'next/navigation';

/**
 * `/golf/dashboard/development` — LEGACY, permanently redirected (2026-07-19,
 * plan Task 9). Development Plans is now the `players` drill of the coach
 * Intelligence home (spec §5.4, mounting `PlayersGridView` unchanged) — the
 * stage IS the nav. Several action files (`development.ts`, `v3/goals.ts`)
 * still call `revalidatePath('/golf/dashboard/development')`, so this route
 * stays live as a permanent-redirect shim (never a 404) — same pattern as
 * `/my-development`. `surface-registry.ts`'s `development` and `players-tab`
 * entries are both `legacy: true, hidden: true` and point here-onward.
 */
export default function DevelopmentRedirect(): never {
  permanentRedirect('/golf/dashboard/intelligence?view=players');
}
