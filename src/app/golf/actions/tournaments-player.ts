'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { logServerError } from '@/lib/server-error-logger';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { getGolfDashboardRole } from '@/lib/auth/get-golf-dashboard-role';
import { describeError } from '@/lib/utils/describe-error';
import { isUuid } from '@/lib/utils/uuid';
import { isFlagEnabled } from '@/lib/flags';
import { getActivePlayerTeamMembership } from '@/lib/golf/dashboard-request-cache';
import { TOUR_REFUSAL_COPY, tourRefusalOf, type TourRefusalCode } from '@/lib/golf/tournament-refusals';
import { tourTable } from '@/lib/golf/tournaments-tables';
import type { ActionResult } from './golf-action-shared';

/**
 * P016 Tournaments, the player's own write: their reflection on an event (`golf_tournament_reflections.body`, the text a
 * coach reads in the event's review). The held policies (20261024100100, applied) let a player write only their own row on
 * their own team, so this action asks the same two flags as the coach actions, checks the player and the event id, and
 * leaves the row's ownership to the policy: a refusal comes back as a `TourRefusalCode` beside its copy. It sends nothing
 * to anyone. Reveal, notes and the rest of the player's moments are held file 4 (100300).
 */

const body = z.string().trim().min(1).max(4000);

function refuse<T>(code: TourRefusalCode): ActionResult<T> {
  return { success: false, error: TOUR_REFUSAL_COPY[code], code };
}

async function saveTournamentReflectionImpl(tournamentId: string, text: string): Promise<ActionResult<{ savedAt: string }>> {
  const parsed = body.safeParse(text);
  if (!isUuid(tournamentId) || !parsed.success) return refuse('invalid');
  if (!isFlagEnabled('golf_tournaments_v1') || !isFlagEnabled('golf_clubhouse_ui')) return refuse('off');
  if ((await getGolfDashboardRole()) !== 'player') return refuse('off');
  const session = await getGolfSessionProfile();
  if (!session?.player) return refuse('not_signed_in');
  const membership = await getActivePlayerTeamMembership(session.player.id);
  const teamId = (membership.data as { team_id?: string } | null)?.team_id;
  if (membership.error || !teamId) return refuse(membership.error ? 'failed' : 'not_found');
  const supabase = await createClient();
  const savedAt = new Date().toISOString();
  const { error } = await tourTable(supabase, 'golf_tournament_reflections').upsert(
    { tournament_id: tournamentId, team_id: teamId, player_id: session.player.id, body: parsed.data, updated_at: savedAt },
    { onConflict: 'tournament_id,player_id' },
  );
  if (error) {
    const code = tourRefusalOf(error);
    if (code === 'failed') await logServerError(`[tournaments] saveTournamentReflection failed: ${describeError(error)}`, { action: 'saveTournamentReflection', featureArea: 'calendar_events', errorCode: error.code ?? undefined });
    return refuse(code);
  }
  revalidatePath('/golf/dashboard/tournaments', 'layout');
  return { success: true, data: { savedAt } };
}

const observedReflection = withAdminObserved('saveTournamentReflection', { sport: 'golf', feature: 'calendar_events', demoSafe: true, observeSoftFailures: false }, saveTournamentReflectionImpl);
export async function saveTournamentReflection(tournamentId: string, text: string) {
  return observedReflection(tournamentId, text);
}
