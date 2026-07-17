import { redirect } from 'next/navigation';

// GOLF IA REORG (final_migrations #11) — legacy route. Keep for backward
// compatibility and bookmarks. Canonical genome surface now lives at
// /golf/dashboard/players/[playerId]/genome, a sibling of
// /players/[playerId]/game (real nested path segment, not a ?tab= param).
export default async function LegacyCoachGenomePage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  redirect(`/golf/dashboard/players/${playerId}/genome`);
}
