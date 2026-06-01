/**
 * Player Game Fingerprint — coach scouting-report view.
 *
 * Wave 2 route at `/golf/dashboard/players/[playerId]/game`. Replaces the
 * scattered per-player insight cards on `/players/[playerId]` (which stays
 * live as the legacy view) with a single 7-section vertical scroll:
 *
 *   Hero → Tee → Approach → Short Game → Putting → Scoring → Pressure → Trend
 *
 * A coach opens this page to prep for a 1:1 with the player. The layout
 * mirrors how a coach thinks about a player's game, not how the database
 * stores it. Every section is evidence-backed — insights pre-joined to their
 * drills via `getPlayerFingerprint` in a single round-trip.
 *
 * Print-optimized variant lives at `/players/[playerId]/game/print`.
 */
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { getPlayerFingerprint } from '@/app/golf/actions/player-fingerprint';
import { PlayerGameFingerprint } from './PlayerGameFingerprint';
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
import { FairwayPlayerGameFingerprint } from '@/components/fairway/pages/player-game';

export const metadata: Metadata = {
  title: 'Game Fingerprint | Helm Golf',
  description:
    "Scouting report for a player's game — tee, approach, short game, putting, scoring, pressure, and trend.",
};

export const revalidate = 60;

export default async function PlayerGamePage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;

  // Coach-only surface. Players hit the legacy Hub/CoachHelm views.
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  if (!session.coach) redirect('/golf/dashboard');

  const fingerprint = await getPlayerFingerprint(playerId);
  if (!fingerprint) notFound();

  if (isRedesignEnabled())
    return (
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <FairwayPlayerGameFingerprint fingerprint={fingerprint} />
      </div>
    );

  return <PlayerGameFingerprint fingerprint={fingerprint} />;
}
