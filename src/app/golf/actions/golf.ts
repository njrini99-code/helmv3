'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { HoleStats, ShotRecord } from '@/components/golf/ShotTrackingComprehensive';

// ============================================================================
// INPUT TYPES
// ============================================================================

interface GolfRoundInput {
  qualifierId?: string;
  courseName: string;
  courseCity?: string;
  courseState?: string;
  courseRating?: number;
  courseSlope?: number;
  teesPlayed?: string;
  roundType: 'practice' | 'tournament' | 'qualifier';
  roundDate: string;
  holes: Array<{
    holeNumber: number;
    par: number;
    score: number;
    putts?: number;
    fairwayHit?: boolean;
    greenInRegulation?: boolean;
    penalties?: number;
    notes?: string;
  }>;
}

// Comprehensive input with full stats
interface GolfRoundInputComprehensive {
  qualifierId?: string;
  courseName: string;
  courseCity?: string;
  courseState?: string;
  courseRating?: number;
  courseSlope?: number;
  teesPlayed?: string;
  roundType: 'practice' | 'tournament' | 'qualifier';
  roundDate: string;
  holes: HoleStats[];
}

interface GolfEventInput {
  title: string;
  eventType: 'practice' | 'tournament' | 'qualifier' | 'meeting' | 'travel' | 'other';
  startDate: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  location?: string;
  courseName?: string;
  description?: string;
  isMandatory?: boolean;
}

interface GolfQualifierInput {
  name: string;
  description?: string;
  courseName?: string;
  location?: string;
  numRounds: number;
  holesPerRound: number;
  startDate: string;
  endDate?: string;
  showLiveLeaderboard?: boolean;
  playerIds: string[];
}

// ============================================================================
// ROUND ACTIONS
// ============================================================================

/**
 * Submit a golf round with comprehensive shot-by-shot stats
 */
export async function submitGolfRoundComprehensive(data: GolfRoundInputComprehensive) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Get player record
  const { data: player } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!player) throw new Error('Player not found');

  // Calculate round totals from holes
  const totalScore = data.holes.reduce((sum, h) => sum + h.score, 0);
  const totalPar = data.holes.reduce((sum, h) => sum + h.par, 0);
  const totalToPar = totalScore - totalPar;
  const totalPutts = data.holes.reduce((sum, h) => sum + h.putts, 0);
  const fairwaysHit = data.holes.filter(h => h.fairwayHit === true).length;
  const fairwaysTotal = data.holes.filter(h => h.par >= 4).length;
  const greensInReg = data.holes.filter(h => h.greenInRegulation).length;
  const totalPenalties = data.holes.reduce((sum, h) => sum + h.penaltyStrokes, 0);
  
  // Aggregate stats for round
  const scrambleAttempts = data.holes.filter(h => h.scrambleAttempt).length;
  const scramblesMade = data.holes.filter(h => h.scrambleMade).length;
  const sandSaveAttempts = data.holes.filter(h => h.sandSaveAttempt).length;
  const sandSavesMade = data.holes.filter(h => h.sandSaveMade).length;
  const threePutts = data.holes.filter(h => h.putts >= 3).length;
  const birdies = data.holes.filter(h => h.score - h.par === -1).length;
  const eagles = data.holes.filter(h => h.score - h.par <= -2).length;
  const pars = data.holes.filter(h => h.score === h.par).length;
  const bogeys = data.holes.filter(h => h.score - h.par === 1).length;
  const doublePlus = data.holes.filter(h => h.score - h.par >= 2).length;
  
  // Driving stats
  const drivingDistances = data.holes
    .filter(h => h.drivingDistance && h.drivingDistance > 0)
    .map(h => h.drivingDistance!);
  const drivingDistanceAvg = drivingDistances.length > 0
    ? Math.round(drivingDistances.reduce((a, b) => a + b, 0) / drivingDistances.length)
    : null;
  const longestDrive = drivingDistances.length > 0 ? Math.max(...drivingDistances) : null;
  
  // Putting stats
  const puttsMade = data.holes.filter(h => h.putts === 1 && h.firstPuttDistance);
  const longestPuttMade = puttsMade.length > 0
    ? Math.max(...puttsMade.map(h => h.firstPuttDistance!))
    : null;
  
  // Longest hole out
  const holeOuts = data.holes.filter(h => h.holedOutDistance && h.holedOutDistance > 0);
  const longestHoleOut = holeOuts.length > 0
    ? Math.max(...holeOuts.map(h => h.holedOutDistance!))
    : null;
  
  // Putts per GIR
  const girHoles = data.holes.filter(h => h.greenInRegulation);
  const puttsOnGir = girHoles.reduce((sum, h) => sum + h.putts, 0);
  const puttsPerGir = girHoles.length > 0 
    ? Math.round((puttsOnGir / girHoles.length) * 100) / 100
    : null;
  
  // Driving accuracy
  const drivingAccuracy = fairwaysTotal > 0
    ? Math.round((fairwaysHit / fairwaysTotal) * 1000) / 10
    : null;

  // Insert round with comprehensive stats
  const { data: round, error: roundError } = await supabase
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
      // New comprehensive stats columns
      driving_distance_avg: drivingDistanceAvg,
      driving_accuracy: drivingAccuracy,
      putts_per_gir: puttsPerGir,
      scrambling_attempts: scrambleAttempts,
      scrambles_made: scramblesMade,
      sand_save_attempts: sandSaveAttempts,
      sand_saves_made: sandSavesMade,
      penalty_strokes: totalPenalties,
      three_putts: threePutts,
      birdies: birdies,
      pars: pars,
      bogeys: bogeys,
      double_bogeys_plus: doublePlus,
      eagles: eagles,
      longest_drive: longestDrive,
      longest_putt_made: longestPuttMade,
      longest_hole_out: longestHoleOut,
    })
    .select()
    .single();

  if (roundError) throw roundError;

  // Insert holes with comprehensive stats
  const holesData = data.holes.map(hole => ({
    round_id: round.id,
    hole_number: hole.holeNumber,
    par: hole.par,
    yardage: hole.yardage || null,
    score: hole.score,
    score_to_par: hole.score - hole.par,
    putts: hole.putts,
    fairway_hit: hole.fairwayHit,
    green_in_regulation: hole.greenInRegulation,
    // New comprehensive stats columns
    driving_distance: hole.drivingDistance,
    used_driver: hole.usedDriver,
    drive_miss_direction: hole.driveMissDirection,
    approach_distance: hole.approachDistance,
    approach_lie: hole.approachLie,
    approach_result: null, // Not tracked separately
    approach_miss_direction: hole.approachMissDirection,
    approach_proximity: hole.approachProximity,
    scramble_attempt: hole.scrambleAttempt,
    scramble_made: hole.scrambleMade,
    sand_save_attempt: hole.sandSaveAttempt,
    sand_save_made: hole.sandSaveMade,
    up_and_down_attempt: hole.scrambleAttempt, // Same as scramble
    up_and_down_made: hole.scrambleMade,
    penalty_strokes: hole.penaltyStrokes,
    first_putt_distance: hole.firstPuttDistance,
    first_putt_leave: hole.firstPuttLeave,
    first_putt_break: hole.firstPuttBreak,
    first_putt_slope: hole.firstPuttSlope,
    first_putt_miss_direction: hole.firstPuttMissDirection,
    holed_out_distance: hole.holedOutDistance,
    holed_out_type: hole.holedOutType,
  }));

  const { data: insertedHoles, error: holesError } = await supabase
    .from('golf_holes')
    .insert(holesData)
    .select('id, hole_number');

  if (holesError) throw holesError;

  // Create a map of hole_number to hole_id
  const holeIdMap = new Map(insertedHoles?.map(h => [h.hole_number, h.id]) || []);

  // Insert individual shots
  const allShots: any[] = [];
  for (const hole of data.holes) {
    const holeId = holeIdMap.get(hole.holeNumber);
    for (const shot of hole.shots) {
      allShots.push({
        round_id: round.id,
        hole_id: holeId,
        hole_number: hole.holeNumber,
        shot_number: shot.shotNumber,
        shot_type: shot.shotType,
        club_type: shot.clubType,
        lie_before: shot.lieBefore,
        distance_to_hole_before: shot.distanceToHoleBefore,
        distance_unit_before: shot.distanceUnitBefore,
        result: shot.result,
        distance_to_hole_after: shot.distanceToHoleAfter,
        distance_unit_after: shot.distanceUnitAfter,
        shot_distance: shot.shotDistance,
        miss_direction: shot.missDirection || null,
        putt_break: shot.puttBreak || null,
        putt_slope: shot.puttSlope || null,
        is_penalty: shot.isPenalty,
        penalty_type: shot.penaltyType || null,
      });
    }
  }

  if (allShots.length > 0) {
    const { error: shotsError } = await supabase
      .from('golf_shots')
      .insert(allShots);

    if (shotsError) {
      console.error('Failed to insert shots:', shotsError);
      // Don't throw - shots are supplementary data
    }
  }

  revalidatePath('/golf/dashboard');
  revalidatePath('/golf/dashboard/rounds');
  revalidatePath('/golf/dashboard/stats');

  return round;
}

/**
 * Submit a golf round with basic stats (legacy support)
 */
export async function submitGolfRound(data: GolfRoundInput) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Get player record
  const { data: player } = await supabase
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
  const fairwaysTotal = data.holes.filter(h => h.par > 3).length;
  const greensInReg = data.holes.filter(h => h.greenInRegulation).length;
  const totalPenalties = data.holes.reduce((sum, h) => sum + (h.penalties || 0), 0);

  // Insert round
  const { data: round, error: roundError } = await supabase
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

  const { error: holesError } = await supabase
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

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Verify ownership
  const { data: round } = await supabase
    .from('golf_rounds')
    .select('player_id, player:golf_players(user_id)')
    .eq('id', roundId)
    .single();

  if (!round || round.player?.user_id !== user.id) {
    throw new Error('Unauthorized');
  }

  // Delete shots first
  await supabase.from('golf_shots').delete().eq('round_id', roundId);
  
  // Delete holes
  await supabase.from('golf_holes').delete().eq('round_id', roundId);

  // Delete round
  const { error } = await supabase
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

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Get coach and team
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, team_id')
    .eq('user_id', user.id)
    .single();

  if (!coach?.team_id) throw new Error('Coach or team not found');

  const { data: event, error } = await supabase
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

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { error } = await supabase
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

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { error } = await supabase
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

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Get coach and team
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, team_id')
    .eq('user_id', user.id)
    .single();

  if (!coach?.team_id) throw new Error('Coach or team not found');

  // Create qualifier
  const { data: qualifier, error: qualifierError } = await supabase
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

    const { error: entriesError } = await supabase
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

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { error } = await supabase
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

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Get coach and team
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, team_id')
    .eq('user_id', user.id)
    .single();

  if (!coach?.team_id) throw new Error('Coach or team not found');

  const { data: announcement, error } = await supabase
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

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Get coach and team
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, team_id, team:golf_teams(name, invite_code)')
    .eq('user_id', user.id)
    .single();

  if (!coach?.team_id) throw new Error('Coach or team not found');

  // Generate invite code if not exists
  let inviteCode = coach.team?.invite_code;
  if (!inviteCode) {
    inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    await supabase
      .from('golf_teams')
      .update({ invite_code: inviteCode })
      .eq('id', coach.team_id);
  }

  return {
    inviteCode,
    inviteLink: `/golf/join/${inviteCode}`,
  };
}

export async function updatePlayerStatus(playerId: string, status: 'active' | 'injured' | 'redshirt' | 'inactive') {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { error } = await supabase
    .from('golf_players')
    .update({ status })
    .eq('id', playerId);

  if (error) throw error;

  revalidatePath('/golf/dashboard/roster');
}
