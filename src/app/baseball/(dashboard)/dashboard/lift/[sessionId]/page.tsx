// =============================================================================
// src/app/baseball/(dashboard)/dashboard/lift/[sessionId]/page.tsx
//
// V11 player lift execution (spec route /baseball/dashboard/lift/[sessionId],
// L34; "During lift" L487-499). SELF-ONLY: getPlayerLiftSession returns only the
// current player's session (RLS-backed). 404-honest when not found.
// =============================================================================

import { notFound, redirect } from 'next/navigation';

import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import { getPlayerLiftSession } from '@/lib/baseball/read-models/player-lift';
import { PlayerLiftSessionClient } from '@/components/baseball/performance/PlayerLiftSessionClient';

export default async function PlayerLiftSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const context = await getActiveBaseballContext();
  if (!context) redirect('/baseball/login');
  if (context.activeRole === 'coach' || !context.activePlayerId) {
    redirect('/baseball/dashboard/performance');
  }

  const session = await getPlayerLiftSession(context.activePlayerId, sessionId);
  if (!session) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-28">
      <PlayerLiftSessionClient session={session} readinessSubmittedToday={Boolean(session.readiness_checkin_id)} />
    </div>
  );
}
