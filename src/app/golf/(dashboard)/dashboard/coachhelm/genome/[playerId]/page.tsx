import { redirect } from 'next/navigation';

// GOLF IA REORG (final_migrations #11) — legacy route. Keep for backward
// compatibility and bookmarks. Canonical genome surface now lives at
// /golf/dashboard/players/[playerId]/genome, a sibling of
// /players/[playerId]/game (real nested path segment, not a ?tab= param).
//
// BELT-AND-BRACES (2026-07-22): next.config.mjs `redirects()` now intercepts
// `/golf/dashboard/coachhelm/genome/:playerId` at the framework routing
// layer, before this page ever renders — the fix for the React #310
// "rendered more hooks" crash on client-navigation into bare redirect()
// shims. The config rule excludes the literal sibling `.../genome/compare`
// route so it still falls through to that real page. This component stays
// only as a fallback for anything the config layer misses; it should no
// longer actually execute in normal operation.
export default async function LegacyCoachGenomePage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  redirect(`/golf/dashboard/players/${playerId}/genome`);
}
