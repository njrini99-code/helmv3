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
import { getActivePlayerTeamMembership, resolveCoachActiveTeamForRequest } from '@/lib/golf/dashboard-request-cache';
import { TOUR_REFUSAL_COPY, tourRefusalOf, type TourRefusalCode } from '@/lib/golf/tournament-refusals';
import { tourTable } from '@/lib/golf/tournaments-tables';
import type { ActionResult } from './golf-action-shared';

/**
 * P016 Tournaments, one hole of a tournament round (owner answer B, 2026-11-07: hole-by-hole live scoring). There is no
 * second score store: the hole goes into `golf_holes` on the player's own `golf_rounds` row, the rows Fairway's round
 * tracker writes and reads, and that round is linked to the tournament round in `golf_tournament_player_rounds` (the same
 * link the Link inbox makes). A coach of the team scores any player; a player scores only themselves. Row-level security
 * decides every write (coaches write team rounds and their holes; a player writes their own); this action adds the
 * gates, the link, and the checks the policies cannot see.
 *
 * It never completes a round: a completed `golf_rounds` row may only come from the protected round-submit flow
 * (`guard_golf_round_lifecycle`), so the round stays in progress. The tournament reads a card with every hole scored as
 * finished (`readEvents`), and the player's own submit in Fairway completes it later with the same holes.
 */

const uuid = z.string().refine((v) => isUuid(v), 'not an id');
const input = z.object({
  roundEventId: uuid,
  playerId: uuid,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hole: z.number().int().min(1).max(18),
  par: z.number().int().min(3).max(6),
  /** Null clears the hole. */
  strokes: z.number().int().min(1).max(20).nullable(),
});
type TourHoleInput = z.infer<typeof input>;

function refuse<T>(code: TourRefusalCode, error?: string): ActionResult<T> {
  return { success: false, error: error ?? TOUR_REFUSAL_COPY[code], code };
}

async function saveTournamentHoleImpl(raw: TourHoleInput): Promise<ActionResult<{ roundId: string; thru: number }>> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return refuse('invalid');
  const i = parsed.data;
  if (!isFlagEnabled('golf_tournaments_v1') || !isFlagEnabled('golf_clubhouse_ui')) return refuse('off');
  const role = await getGolfDashboardRole();
  const session = await getGolfSessionProfile();
  if (!session) return refuse('not_signed_in');

  let teamId: string;
  if (role === 'coach' && session.coach) {
    const team = await resolveCoachActiveTeamForRequest(session.coach.organization_id ?? null, session.coach.id);
    if (team.status !== 'ok') return team.status === 'failed' ? refuse('failed') : refuse('not_coach');
    teamId = team.teamId;
  } else if (role === 'player' && session.player) {
    // A player scores themselves and no one else.
    if (i.playerId !== session.player.id) return refuse('not_coach');
    const membership = await getActivePlayerTeamMembership(session.player.id);
    const id = (membership.data as { team_id?: string } | null)?.team_id;
    if (membership.error || !id) return refuse(membership.error ? 'failed' : 'not_found');
    teamId = id;
  } else {
    return refuse('not_signed_in');
  }
  const coach = role === 'coach';

  try {
    const supabase = await createClient();
    const round = await tourTable(supabase, 'golf_tournament_rounds').select('tournament_id, course_id').eq('round_event_id', i.roundEventId).maybeSingle();
    if (round.error) return refuse(tourRefusalOf(round.error));
    const r = round.data as { tournament_id: string; course_id: string | null } | null;
    if (!r) return refuse('not_found');
    const tour = await tourTable(supabase, 'golf_tournaments').select('team_id, holes_per_round, course_id, official_at').eq('id', r.tournament_id).maybeSingle();
    if (tour.error) return refuse(tourRefusalOf(tour.error));
    const t = tour.data as { team_id: string; holes_per_round: number; course_id: string | null; official_at: string | null } | null;
    if (!t || t.team_id !== teamId) return refuse('not_found');
    if (t.official_at) return refuse('invalid', 'The results are official, so scores can’t change. Reopen the results first.');
    if (i.hole > t.holes_per_round) return refuse('invalid');

    if (coach) {
      // Only a player who plays the round is scored (the snapshot once locked, else the entries; never the alternate).
      const [snap, entries] = await Promise.all([
        tourTable(supabase, 'golf_tournament_round_lineups').select('player_id, role').eq('round_event_id', i.roundEventId),
        tourTable(supabase, 'golf_tournament_entries').select('player_id, role').eq('tournament_id', r.tournament_id),
      ]);
      if (snap.error) return refuse(tourRefusalOf(snap.error));
      if (entries.error) return refuse(tourRefusalOf(entries.error));
      const field = ((snap.data as unknown[] | null)?.length ? snap.data : entries.data) as Array<{ player_id: string; role: string }> | null;
      if (!(field ?? []).some((f) => f.player_id === i.playerId && f.role !== 'alternate')) return refuse('not_in_lineup');
    }

    const existing = await tourTable(supabase, 'golf_tournament_player_rounds').select('round_id, entered_total').eq('round_event_id', i.roundEventId).eq('player_id', i.playerId).maybeSingle();
    if (existing.error) return refuse(tourRefusalOf(existing.error));
    const row = existing.data as { round_id: string | null; entered_total: number | null } | null;
    if (row?.entered_total != null) return refuse('invalid', 'A total is already entered for this round. Clear it before scoring hole by hole.');

    let roundId = row?.round_id ?? null;
    let created = false;
    if (!roundId) {
      // A player cannot change a row the coach made (no update policy): they only add their own link.
      if (!coach && row) return refuse('invalid', 'Your coach has this round open. Ask them to score it or to clear it.');
      if (!coach) {
        // The lineup first, before any round is made (security review 2026-11-11, finding 4): the link policy refuses a player who
        // is not in the round's lineup, but only after the round exists, and a failed clean-up would leave a stray round. The
        // player reads their own snapshot row (the select-own policy of 20261024100300); before that file there is none to read.
        const own = await tourTable(supabase, 'golf_tournament_round_lineups').select('role').eq('round_event_id', i.roundEventId).eq('player_id', i.playerId);
        if (own.error) return refuse(tourRefusalOf(own.error));
        const plays = ((own.data as Array<{ role: string }> | null) ?? []).some((f) => f.role === 'lineup' || f.role === 'individual');
        if (!plays) return refuse('not_in_lineup');
      }
      const made = await supabase
        .from('golf_rounds')
        .insert({ player_id: i.playerId, team_id: teamId, round_date: i.date, round_type: 'tournament', holes_played: t.holes_per_round, course_id: r.course_id ?? t.course_id, status: 'in_progress' })
        .select('id')
        .single();
      if (made.error || !made.data) return refuse(tourRefusalOf(made.error ?? {}));
      roundId = made.data.id as string;
      created = true;
      const link = await tourTable(supabase, 'golf_tournament_player_rounds').upsert(
        coach
          ? { round_event_id: i.roundEventId, team_id: teamId, player_id: i.playerId, round_id: roundId, entered_total: null, entered_front: null, entered_back: null, link_source: 'coach' }
          : { round_event_id: i.roundEventId, team_id: teamId, player_id: i.playerId, round_id: roundId, entered_total: null, link_source: 'player' },
        { onConflict: 'round_event_id,player_id' },
      );
      if (link.error) {
        // Nothing half-made: the round that could not be linked goes again (it has no holes yet).
        await supabase.from('golf_rounds').delete().eq('id', roundId);
        return refuse(tourRefusalOf(link.error));
      }
    }

    const write =
      i.strokes == null
        ? await supabase.from('golf_holes').update({ score: null }).eq('round_id', roundId).eq('hole_number', i.hole)
        : await supabase.from('golf_holes').upsert({ round_id: roundId, hole_number: i.hole, par: i.par, score: i.strokes }, { onConflict: 'round_id,hole_number' });
    if (write.error) {
      if (created) await supabase.from('golf_tournament_player_rounds').delete().eq('round_event_id', i.roundEventId).eq('player_id', i.playerId).is('entered_total', null);
      await logServerError(`[tournaments] saveTournamentHole failed: ${describeError(write.error)}`, { action: 'saveTournamentHole', featureArea: 'calendar_events', errorCode: write.error.code ?? undefined });
      return refuse(tourRefusalOf(write.error));
    }
    const scored = await supabase.from('golf_holes').select('id', { count: 'exact', head: true }).eq('round_id', roundId).not('score', 'is', null);
    revalidatePath('/golf/dashboard/tournaments', 'layout');
    return { success: true, data: { roundId, thru: scored.count ?? 0 } };
  } catch (err) {
    await logServerError(`[tournaments] saveTournamentHole threw: ${describeError(err)}`, { action: 'saveTournamentHole', featureArea: 'calendar_events' });
    return refuse('failed');
  }
}

const observed = withAdminObserved('saveTournamentHole', { sport: 'golf', feature: 'calendar_events', demoSafe: true, observeSoftFailures: false }, saveTournamentHoleImpl);
export async function saveTournamentHole(i: TourHoleInput) {
  return observed(i);
}
