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
import { fromUntyped } from '@/lib/supabase/untyped';
import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import {
  resolveBaseballLiftingOrg,
  resolveMyBaseballAthleteId,
} from '@/lib/lifting/resolve-baseball-context';
import {
  extractArmStatusFromNotes,
  sleepQualityToHours,
} from '@/lib/lifting/adapters/baseball-view-adapter';
import type { HelmLiftingReadinessCheckinRow } from '@/lib/types/helm-lifting-data';
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

  // W2-G: submitReadinessCheckin (lifting.ts) writes ONLY to
  // helm_lifting_readiness_checkins now — dedupe/prefill must read the same
  // table (was reading the now write-dead legacy baseball_readiness_checkins,
  // so a same-day revisit never prefilled).
  let existing: {
    id: string;
    sleep_hours: number | null;
    energy_level: number | null;
    stress_level: number | null;
    soreness_level: number | null;
    lower_body_status: number | null;
    arm_status: string | null;
    illness_flag: boolean | null;
    notes: string | null;
  } | null = null;

  const liftCtx = await resolveBaseballLiftingOrg(context.activeTeamId);
  if (liftCtx) {
    const athleteId = await resolveMyBaseballAthleteId(liftCtx.organizationId);
    if (athleteId) {
      const supabase = await createClient();
      const { data: row } = (await fromUntyped(supabase, 'helm_lifting_readiness_checkins')
        .select('*')
        .eq('athlete_id', athleteId)
        .eq('checkin_date', today)
        .maybeSingle()) as { data: HelmLiftingReadinessCheckinRow | null };

      if (row) {
        existing = {
          id: row.id,
          sleep_hours: sleepQualityToHours(row.sleep_quality),
          energy_level: row.energy_level,
          stress_level: row.stress_level,
          soreness_level: row.soreness_overall,
          lower_body_status: row.lower_body_status,
          arm_status: extractArmStatusFromNotes(row.notes),
          illness_flag: row.illness_flag,
          notes: row.notes,
        };
      }
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <PlayerReadinessClient checkDate={today} existing={existing ?? null} />
    </div>
  );
}
