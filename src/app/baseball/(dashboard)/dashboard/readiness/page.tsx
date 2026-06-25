// =============================================================================
// src/app/baseball/(dashboard)/dashboard/readiness/page.tsx
//
// V11 player readiness check-in (spec route /baseball/dashboard/readiness, L35;
// "Before starting" L480-485 + "Readiness, Soreness, And Availability" L575-638).
// SELF-ONLY: the current player records their OWN check-in (RLS-backed). Players
// only; staff are routed to the Performance dashboard (/baseball/dashboard/
// performance), which is the readiness REVIEW surface for coaches.
// =============================================================================

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import { PlayerReadinessClient } from '@/components/baseball/performance/PlayerReadinessClient';

export default async function PlayerReadinessPage() {
  const context = await getActiveBaseballContext();
  if (!context) redirect('/baseball/login');
  // Staff (or any context without an active player) belong on the strength-coach
  // Performance dashboard — that is the readiness REVIEW surface (it renders the
  // readiness queue, gated server-side on can_view_readiness). There is no
  // /performance/readiness subroute; routing there 404s. The Performance page
  // itself re-gates and bounces a non-staff caller, so this is safe defense-in-depth.
  if (context.activeRole === 'coach' || !context.activePlayerId) {
    redirect('/baseball/dashboard/performance');
  }

  const today = new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: existing } = await db
    .from('baseball_readiness_checkins')
    .select('*')
    .eq('player_id', context.activePlayerId)
    .eq('check_date', today)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <PlayerReadinessClient checkDate={today} existing={existing ?? null} />
    </div>
  );
}
