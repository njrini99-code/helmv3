'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type {
  GolfRoundInput,
  GolfEventInput,
  GolfQualifierInput,
} from '@/lib/types/golf';

// ============================================================================
// ROUND ACTIONS
// ============================================================================

export async function submitGolfRound(data: GolfRoundInput) {
  const supabase = await createClient();

  const { data: { user } } = await (supabase as any).auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Get player record
  const { data: player } = await (supabase as any)
    .from('golf_players')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!player) throw new Error('Player not found');

  // Calculate totals from holes
  const totalScore = data.holes.reduce((sum, h) => sum + h.score, 0);
  const totalPar = data.holes.reduce((sum, h) => sum + h.par, 0);
  const totalToPar = totalScore - totalPar;
  const totalPutts = data.holes.reduce((sum, h) => sum + (h.putts || 0), 0);
  const fairwaysHit = data.holes.filter(h => h.fairwayHit).length;
  const fairwaysTotal = data.holes.filter(h => h.par > 3).length; // Par 4s and 5s
  const greensInReg = data.holes.filter(h => h.greenInRegulation).length;
  const totalPenalties = data.holes.reduce((sum, h) => sum + (h.penalties || 0), 0);

  // Insert round
  const { data: round, error: roundError } = await (supabase as any)
    .from('golf_rounds')
    .insert({
      player_id: player.id,
      qualifier_id: data.qualifierId || null,
      course_name: data.courseName,
      course_city: data.courseCity || null,
      course_state: data.courseState || null,
      course_rating: data.courseRating || null,
      course_slope: data.courseSlope || null,
      tees_played: data.teesPlayed || null,
      round_type: data.roundType,
      round_date: data.roundDate,
      total_score: totalScore,
      total_to_par: totalToPar,
      total_putts: totalPutts,
      fairways_hit: fairwaysHit,
      fairways_total: fairwaysTotal,
      greens_in_regulation: greensInReg,
      greens_total: data.holes.length,
      total_penalties: totalPenalties,
      is_verified: false,
    })
    .select()
    .single();

  if (roundError) throw roundError;

  // Insert holes
  const holesData = data.holes.map(hole => ({
    round_id: round.id,
    hole_number: hole.holeNumber,
    par: hole.par,
    score: hole.score,
    score_to_par: hole.score - hole.par,
    putts: hole.putts || null,
    fairway_hit: hole.fairwayHit || null,
    green_in_regulation: hole.greenInRegulation || null,
    penalties: hole.penalties || null,
    notes: hole.notes || null,
  }));

  const { error: holesError } = await (supabase as any)
    .from('golf_holes')
    .insert(holesData);

  if (holesError) throw holesError;

  revalidatePath('/golf/dashboard');
  revalidatePath('/golf/dashboard/rounds');
  revalidatePath('/golf/dashboard/stats');

  return round;
}

export async function deleteGolfRound(roundId: string) {
  const supabase = await createClient();

  const { data: { user } } = await (supabase as any).auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Verify ownership
  const { data: round } = await (supabase as any)
    .from('golf_rounds')
    .select('player_id, player:golf_players(user_id)')
    .eq('id', roundId)
    .single();

  if (!round || round.player?.user_id !== user.id) {
    throw new Error('Unauthorized');
  }

  // Delete holes first (cascade should handle this but being explicit)
  await (supabase as any).from('golf_holes').delete().eq('round_id', roundId);

  // Delete round
  const { error } = await (supabase as any)
    .from('golf_rounds')
    .delete()
    .eq('id', roundId);

  if (error) throw error;

  revalidatePath('/golf/dashboard');
  revalidatePath('/golf/dashboard/rounds');
  revalidatePath('/golf/dashboard/stats');
}

// ============================================================================
// EVENT ACTIONS
// ============================================================================

export async function createGolfEvent(data: GolfEventInput) {
  const supabase = await createClient();

  const { data: { user } } = await (supabase as any).auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Get coach and team
  const { data: coach } = await (supabase as any)
    .from('golf_coaches')
    .select('id, team_id')
    .eq('user_id', user.id)
    .single();

  if (!coach?.team_id) throw new Error('Coach or team not found');

  const { data: event, error } = await (supabase as any)
    .from('golf_events')
    .insert({
      team_id: coach.team_id,
      title: data.title,
      event_type: data.eventType,
      start_date: data.startDate,
      end_date: data.endDate || null,
      start_time: data.startTime || null,
      end_time: data.endTime || null,
      all_day: data.allDay ?? true,
      location: data.location || null,
      course_name: data.courseName || null,
      description: data.description || null,
      is_mandatory: data.isMandatory ?? false,
      created_by: coach.id,
    })
    .select()
    .single();

  if (error) throw error;

  revalidatePath('/golf/dashboard');
  revalidatePath('/golf/dashboard/calendar');

  return event;
}

export async function updateGolfEvent(eventId: string, data: Partial<GolfEventInput>) {
  const supabase = await createClient();

  const { data: { user } } = await (supabase as any).auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { error } = await (supabase as any)
    .from('golf_events')
    .update({
      title: data.title,
      event_type: data.eventType,
      start_date: data.startDate,
      end_date: data.endDate,
      start_time: data.startTime,
      end_time: data.endTime,
      all_day: data.allDay,
      location: data.location,
      course_name: data.courseName,
      description: data.description,
      is_mandatory: data.isMandatory,
    })
    .eq('id', eventId);

  if (error) throw error;

  revalidatePath('/golf/dashboard/calendar');
}

export async function deleteGolfEvent(eventId: string) {
  const supabase = await createClient();

  const { data: { user } } = await (supabase as any).auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { error } = await (supabase as any)
    .from('golf_events')
    .delete()
    .eq('id', eventId);

  if (error) throw error;

  revalidatePath('/golf/dashboard/calendar');
}

// ============================================================================
// QUALIFIER ACTIONS
// ============================================================================

export async function createGolfQualifier(data: GolfQualifierInput) {
  const supabase = await createClient();

  const { data: { user } } = await (supabase as any).auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Get coach and team
  const { data: coach } = await (supabase as any)
    .from('golf_coaches')
    .select('id, team_id')
    .eq('user_id', user.id)
    .single();

  if (!coach?.team_id) throw new Error('Coach or team not found');

  // Create qualifier
  const { data: qualifier, error: qualifierError } = await (supabase as any)
    .from('golf_qualifiers')
    .insert({
      team_id: coach.team_id,
      name: data.name,
      description: data.description || null,
      course_name: data.courseName || null,
      location: data.location || null,
      num_rounds: data.numRounds,
      holes_per_round: data.holesPerRound,
      start_date: data.startDate,
      end_date: data.endDate || null,
      status: 'upcoming',
      show_live_leaderboard: data.showLiveLeaderboard ?? true,
      created_by: coach.id,
    })
    .select()
    .single();

  if (qualifierError) throw qualifierError;

  // Add player entries
  if (data.playerIds.length > 0) {
    const entries = data.playerIds.map(playerId => ({
      qualifier_id: qualifier.id,
      player_id: playerId,
      is_tied: false,
      rounds_completed: 0,
    }));

    const { error: entriesError } = await (supabase as any)
      .from('golf_qualifier_entries')
      .insert(entries);

    if (entriesError) throw entriesError;
  }

  revalidatePath('/golf/dashboard');
  revalidatePath('/golf/dashboard/qualifiers');

  return qualifier;
}

export async function updateQualifierStatus(qualifierId: string, status: 'upcoming' | 'in_progress' | 'completed') {
  const supabase = await createClient();

  const { data: { user } } = await (supabase as any).auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { error } = await (supabase as any)
    .from('golf_qualifiers')
    .update({ status })
    .eq('id', qualifierId);

  if (error) throw error;

  revalidatePath('/golf/dashboard/qualifiers');
}

// ============================================================================
// ANNOUNCEMENT ACTIONS
// ============================================================================

export async function createAnnouncement(data: {
  title: string;
  body: string;
  urgency: 'low' | 'normal' | 'high' | 'urgent';
  requiresAcknowledgement: boolean;
}) {
  const supabase = await createClient();

  const { data: { user } } = await (supabase as any).auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Get coach and team
  const { data: coach } = await (supabase as any)
    .from('golf_coaches')
    .select('id, team_id')
    .eq('user_id', user.id)
    .single();

  if (!coach?.team_id) throw new Error('Coach or team not found');

  const { data: announcement, error } = await (supabase as any)
    .from('golf_announcements')
    .insert({
      team_id: coach.team_id,
      title: data.title,
      body: data.body,
      urgency: data.urgency,
      requires_acknowledgement: data.requiresAcknowledgement,
      send_push: false,
      send_email: false,
      published_at: new Date().toISOString(),
      created_by: coach.id,
    })
    .select()
    .single();

  if (error) throw error;

  revalidatePath('/golf/dashboard/announcements');

  return announcement;
}

// ============================================================================
// PLAYER ACTIONS
// ============================================================================

export async function invitePlayerToTeam(email: string) {
  const supabase = await createClient();

  const { data: { user } } = await (supabase as any).auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Get coach and team
  const { data: coach } = await (supabase as any)
    .from('golf_coaches')
    .select('id, team_id, team:golf_teams(name, invite_code)')
    .eq('user_id', user.id)
    .single();

  if (!coach?.team_id) throw new Error('Coach or team not found');

  // Generate invite code if not exists
  let inviteCode = coach.team?.invite_code;
  if (!inviteCode) {
    inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    await (supabase as any)
      .from('golf_teams')
      .update({ invite_code: inviteCode })
      .eq('id', coach.team_id);
  }

  // In a real app, you would send an email here
  // For now, just return the invite link
  return {
    inviteCode,
    inviteLink: `/golf/join/${inviteCode}`,
  };
}

export async function updatePlayerStatus(playerId: string, status: 'active' | 'injured' | 'redshirt' | 'inactive') {
  const supabase = await createClient();

  const { data: { user } } = await (supabase as any).auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { error } = await (supabase as any)
    .from('golf_players')
    .update({ status })
    .eq('id', playerId);

  if (error) throw error;

  revalidatePath('/golf/dashboard/roster');
}
