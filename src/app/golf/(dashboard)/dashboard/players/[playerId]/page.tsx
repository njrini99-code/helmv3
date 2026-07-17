import { redirect } from 'next/navigation';

// GOLF IA REORG (final_migrations #11) — legacy route. Keep for backward
// compatibility and bookmarks. Canonical per-player deep-dive now lives at
// /golf/dashboard/players/[playerId]/game, whose "Scouting Report" tab
// absorbs the content that used to render on this exact route (per
// final_routes: redirect shim → /players/[playerId]/game).
//
// Every call site that KNEW it wanted the Scouting Report specifically
// (the coach-morning-digest email, GenomeDetailView's cross-link, etc.) was
// updated to link straight to `.../game?tab=scouting` — this bare shim stays
// the plan's literal, simple redirect target for anyone hitting the old URL
// with no such intent (a stale bookmark, a browser back-button hit).
export default async function LegacyPlayerInsightPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  redirect(`/golf/dashboard/players/${playerId}/game`);
}
