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
export default async function DevelopmentRedirect({
  searchParams,
}: {
  searchParams: Promise<{ player?: string | string[] }>;
}): Promise<never> {
  // F133: preserve the ?player= deep-link (FingerprintHero, team board
  // "Prescribe drill", Player Insight, Genome all link here scoped to one
  // player) — the players drill validates the id against the roster.
  const sp = await searchParams;
  const player = Array.isArray(sp.player) ? sp.player[0] : sp.player;
  permanentRedirect(
    player
      ? `/golf/dashboard/intelligence?view=players&player=${encodeURIComponent(player)}`
      : '/golf/dashboard/intelligence?view=players',
  );
}
