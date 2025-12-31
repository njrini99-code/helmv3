'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { HoleStats, ShotRecord } from '@/components/golf/ShotTrackingComprehensive';
import { z } from 'zod';
import {
  requireGolfCoach,
  verifyGolfTeamOwnership,
  AuthorizationError,
  NotFoundError
} from '@/lib/auth/ownership';

// ============================================================================
// RESULT TYPE
// ============================================================================

/**
 * Standard action result type for consistent error handling
 * Use this for all server actions to enable toast notifications on the client
 */
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

// ============================================================================
// VALIDATION SCHEMAS (Zod)
// ============================================================================

const holeSchema = z.object({
  holeNumber: z.number().int().min(1).max(18),
  par: z.number().int().min(3).max(6),
  score: z.number().int().min(1).max(15),
  putts: z.number().int().min(0).max(10).optional(),
  fairwayHit: z.boolean().optional(),
  greenInRegulation: z.boolean().optional(),
  penalties: z.number().int().min(0).max(5).optional(),
  notes: z.string().max(500).optional(),
});

const golfRoundSchema = z.object({
  qualifierId: z.string().uuid().optional(),
  courseName: z.string().min(1).max(200),
  courseCity: z.string().max(100).optional(),
  courseState: z.string().length(2).optional(),
  courseRating: z.number().min(60).max(80).optional(),
  courseSlope: z.number().int().min(55).max(155).optional(),
  teesPlayed: z.string().max(50).optional(),
  courseId: z.string().uuid().optional(),
  roundType: z.enum(['practice', 'tournament', 'qualifier']),
  roundDate: z.string(),
  holes: z.array(holeSchema).min(1).max(18),
});

const golfEventSchema = z.object({
  title: z.string().min(1).max(200),
  eventType: z.enum(['practice', 'tournament', 'qualifier', 'meeting', 'travel', 'other']),
  startDate: z.string(),
  endDate: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  allDay: z.boolean().optional(),
  location: z.string().max(500).optional(),
  courseName: z.string().max(200).optional(),
  description: z.string().max(5000).optional(),
  isMandatory: z.boolean().optional(),
});

const golfQualifierSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  courseName: z.string().max(200).optional(),
  location: z.string().max(500).optional(),
  numRounds: z.number().int().min(1).max(10),
  holesPerRound: z.number().int().min(9).max(18),
  startDate: z.string(),
  endDate: z.string().optional(),
  showLiveLeaderboard: z.boolean().optional(),
  playerIds: z.array(z.string().uuid()),
});

const announcementSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
  urgency: z.enum(['low', 'normal', 'high', 'urgent']),
  requiresAcknowledgement: z.boolean(),
});

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
  courseId?: string;
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
  courseName: string;
  courseCity?: string;
  courseState?: string;
  courseRating?: number;
  courseSlope?: number;
  teesPlayed?: string;
  courseId?: string;
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

interface GolfShotInsert {
  round_id: string;
  hole_id: string | undefined;
  hole_number: number;
  shot_number: number;
  shot_type: string;
  club_type: string;
  lie_before: string;
  distance_to_hole_before: number;
  distance_unit_before: string;
  result: string;
  distance_to_hole_after: number | null;
  distance_unit_after: string | null;
  shot_distance: number | null;
  miss_direction: string | null;
  putt_break: string | null;
  putt_slope: string | null;
  is_penalty: boolean;
  penalty_type: string | null;
}

type GolfEventUpdateData = {
  updated_at: string;
  title?: string;
  event_type?: 'practice' | 'tournament' | 'qualifier' | 'meeting' | 'travel' | 'other';
  start_date?: string;
  end_date?: string;
  start_time?: string;
  end_time?: string;
  all_day?: boolean;
  location?: string;
  course_name?: string;
  description?: string;
  is_mandatory?: boolean;
}

// ============================================================================
// ROUND ACTIONS
// ============================================================================

/**
 * Submit a golf round with comprehensive shot-by-shot stats
 */
export async function submitGolfRoundComprehensive(
  data: GolfRoundInputComprehensive
): Promise<ActionResult<{ roundId: string }>> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to submit rounds' };
    }

    // Get player record
    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!player) {
      return { success: false, error: 'Player profile not found' };
    }

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
      course_name: data.courseName,
      course_city: data.courseCity || null,
      course_state: data.courseState || null,
      course_rating: data.courseRating || null,
      course_slope: data.courseSlope || null,
      tees_played: data.teesPlayed || null,
      course_id: data.courseId || null,
      round_type: data.roundType,
      round_date: data.roundDate,
      total_score: totalScore,
      total_to_par: totalToPar,
      total_putts: totalPutts,
      fairways_hit: fairwaysHit,
      fairways_total: fairwaysTotal,
      greens_in_regulation: greensInReg,
      greens_total: data.holes.length,
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

    if (roundError) {
      console.error('[Golf] Failed to insert round:', roundError);
      return { success: false, error: 'Failed to save round. Please try again.' };
    }

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

    if (holesError) {
      console.error('[Golf] Failed to insert holes:', holesError);
      return { success: false, error: 'Failed to save hole data. Please try again.' };
    }

  // Create a map of hole_number to hole_id
  const holeIdMap = new Map(insertedHoles?.map(h => [h.hole_number, h.id]) || []);

  // Insert individual shots
  const allShots: GolfShotInsert[] = [];
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
        console.error('[Golf] Failed to insert shots:', shotsError);
        // Don't throw - shots are supplementary data
      }
    }

    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/rounds');
    revalidatePath('/golf/dashboard/stats');

    return { success: true, data: { roundId: round.id } };

  } catch (error) {
    console.error('[Golf] Unexpected error submitting round:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred'
    };
  }
}

/**
 * Submit a golf round with basic stats (legacy support)
 */
export async function submitGolfRound(data: GolfRoundInput): Promise<ActionResult<{ roundId: string }>> {
  try {
    // Validate input
    const validatedData = golfRoundSchema.parse(data);

    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to submit rounds' };
    }

    // Get player record
    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!player) {
      return { success: false, error: 'Player profile not found' };
    }

  // Calculate totals from holes
  const totalScore = validatedData.holes.reduce((sum, h) => sum + h.score, 0);
  const totalPar = validatedData.holes.reduce((sum, h) => sum + h.par, 0);
  const totalToPar = totalScore - totalPar;
  const totalPutts = validatedData.holes.reduce((sum, h) => sum + (h.putts || 0), 0);
  const fairwaysHit = validatedData.holes.filter(h => h.fairwayHit).length;
  const fairwaysTotal = validatedData.holes.filter(h => h.par > 3).length;
  const greensInReg = validatedData.holes.filter(h => h.greenInRegulation).length;
  const totalPenalties = validatedData.holes.reduce((sum, h) => sum + (h.penalties || 0), 0);

  // Insert round
  const { data: round, error: roundError } = await supabase
    .from('golf_rounds')
    .insert({
      player_id: player.id,
      qualifier_id: validatedData.qualifierId || null,
      course_name: validatedData.courseName,
      course_city: validatedData.courseCity || null,
      course_state: validatedData.courseState || null,
      course_rating: validatedData.courseRating || null,
      course_slope: validatedData.courseSlope || null,
      tees_played: validatedData.teesPlayed || null,
      course_id: validatedData.courseId || null,
      round_type: validatedData.roundType,
      round_date: validatedData.roundDate,
      total_score: totalScore,
      total_to_par: totalToPar,
      total_putts: totalPutts,
      fairways_hit: fairwaysHit,
      fairways_total: fairwaysTotal,
      greens_in_regulation: greensInReg,
      greens_total: validatedData.holes.length,
      total_penalties: totalPenalties,
      is_verified: false,
    })
    .select()
    .single();

    if (roundError) {
      console.error('[Golf] Failed to insert round:', roundError);
      return { success: false, error: 'Failed to save round. Please try again.' };
    }

    // Insert holes
    const holesData = validatedData.holes.map(hole => ({
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

    if (holesError) {
      console.error('[Golf] Failed to insert holes:', holesError);
      return { success: false, error: 'Failed to save hole data. Please try again.' };
    }

    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/rounds');
    revalidatePath('/golf/dashboard/stats');

    return { success: true, data: { roundId: round.id } };

  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid round data. Please check your inputs.' };
    }
    console.error('[Golf] Unexpected error submitting round:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred'
    };
  }
}

export async function deleteGolfRound(roundId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to delete rounds' };
    }

    // Verify ownership
    const { data: round } = await supabase
      .from('golf_rounds')
      .select('player_id, player:golf_players(user_id)')
      .eq('id', roundId)
      .single();

    if (!round || round.player?.user_id !== user.id) {
      return { success: false, error: 'You do not have permission to delete this round' };
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

    if (error) {
      console.error('[Golf] Failed to delete round:', error);
      return { success: false, error: 'Failed to delete round. Please try again.' };
    }

    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/rounds');
    revalidatePath('/golf/dashboard/stats');

    return { success: true, data: undefined };

  } catch (error) {
    console.error('[Golf] Unexpected error deleting round:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred'
    };
  }
}

// ============================================================================
// EVENT ACTIONS
// ============================================================================

export async function createGolfEvent(data: GolfEventInput): Promise<ActionResult<{ eventId: string }>> {
  try {
    // Validate input
    const validatedData = golfEventSchema.parse(data);

    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to create events' };
    }

    // Get coach and team
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, team_id')
      .eq('user_id', user.id)
      .single();

    if (!coach?.team_id) {
      return { success: false, error: 'Coach profile or team not found' };
    }

    const { data: event, error } = await supabase
      .from('golf_events')
      .insert({
        team_id: coach.team_id,
        title: validatedData.title,
        event_type: validatedData.eventType,
        start_date: validatedData.startDate,
        end_date: validatedData.endDate || null,
        start_time: validatedData.startTime || null,
        end_time: validatedData.endTime || null,
        all_day: validatedData.allDay ?? true,
        location: validatedData.location || null,
        course_name: validatedData.courseName || null,
        description: validatedData.description || null,
        is_mandatory: validatedData.isMandatory ?? false,
        created_by: coach.id,
      })
      .select()
      .single();

    if (error) {
      console.error('[Golf] Failed to create event:', error);
      return { success: false, error: 'Failed to create event. Please try again.' };
    }

    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/calendar');

    return { success: true, data: { eventId: event.id } };

  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid event data. Please check your inputs.' };
    }
    console.error('[Golf] Unexpected error creating event:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred'
    };
  }
}

// Validation schema for golf event updates
const golfEventUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  eventType: z.enum(['practice', 'tournament', 'qualifier', 'meeting', 'travel', 'other']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  allDay: z.boolean().optional(),
  location: z.string().max(500).optional(),
  courseName: z.string().max(200).optional(),
  description: z.string().max(5000).optional(),
  isMandatory: z.boolean().optional(),
});

export async function updateGolfEvent(
  eventId: string,
  data: Partial<GolfEventInput>
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, coach } = await requireGolfCoach();

    if (!coach.team_id) {
      return { success: false, error: 'Coach not assigned to a team' };
    }

    // Verify ownership
    await verifyGolfTeamOwnership(supabase, eventId, coach.team_id, 'golf_events');

    // Validate input
    const validatedData = golfEventUpdateSchema.parse(data);

    const updateData: GolfEventUpdateData = { updated_at: new Date().toISOString() };

    if (validatedData.title) updateData.title = validatedData.title;
    if (validatedData.eventType) updateData.event_type = validatedData.eventType;
    if (validatedData.startDate) updateData.start_date = validatedData.startDate;
    if (validatedData.endDate) updateData.end_date = validatedData.endDate;
    if (validatedData.startTime) updateData.start_time = validatedData.startTime;
    if (validatedData.endTime) updateData.end_time = validatedData.endTime;
    if (validatedData.allDay !== undefined) updateData.all_day = validatedData.allDay;
    if (validatedData.location) updateData.location = validatedData.location;
    if (validatedData.courseName) updateData.course_name = validatedData.courseName;
    if (validatedData.description) updateData.description = validatedData.description;
    if (validatedData.isMandatory !== undefined) updateData.is_mandatory = validatedData.isMandatory;

    const { error } = await supabase
      .from('golf_events')
      .update(updateData)
      .eq('id', eventId)
      .eq('team_id', coach.team_id);

    if (error) {
      return { success: false, error: 'Failed to update event' };
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true };

  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false, error: 'Invalid input data' };
    }
    if (err instanceof AuthorizationError || err instanceof NotFoundError) {
      return { success: false, error: err.message };
    }
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export async function deleteGolfEvent(
  eventId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, coach } = await requireGolfCoach();

    if (!coach.team_id) {
      return { success: false, error: 'Coach not assigned to a team' };
    }

    // Verify ownership
    await verifyGolfTeamOwnership(supabase, eventId, coach.team_id, 'golf_events');

    const { error } = await supabase
      .from('golf_events')
      .delete()
      .eq('id', eventId)
      .eq('team_id', coach.team_id);

    if (error) {
      return { success: false, error: 'Failed to delete event' };
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true };

  } catch (err) {
    if (err instanceof AuthorizationError || err instanceof NotFoundError) {
      return { success: false, error: err.message };
    }
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// QUALIFIER ACTIONS
// ============================================================================

export async function createGolfQualifier(data: GolfQualifierInput): Promise<ActionResult<{ qualifierId: string }>> {
  try {
    // Validate input
    const validatedData = golfQualifierSchema.parse(data);

    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to create qualifiers' };
    }

    // Get coach and team
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, team_id')
      .eq('user_id', user.id)
      .single();

    if (!coach?.team_id) {
      return { success: false, error: 'Coach profile or team not found' };
    }

    // Create qualifier
    const { data: qualifier, error: qualifierError } = await supabase
      .from('golf_qualifiers')
      .insert({
        team_id: coach.team_id,
        name: validatedData.name,
        description: validatedData.description || null,
        course_name: validatedData.courseName || null,
        location: validatedData.location || null,
        num_rounds: validatedData.numRounds,
        holes_per_round: validatedData.holesPerRound,
        start_date: validatedData.startDate,
        end_date: validatedData.endDate || null,
        status: 'upcoming',
        show_live_leaderboard: validatedData.showLiveLeaderboard ?? true,
        created_by: coach.id,
      })
      .select()
      .single();

    if (qualifierError) {
      console.error('[Golf] Failed to create qualifier:', qualifierError);
      return { success: false, error: 'Failed to create qualifier. Please try again.' };
    }

    // Add player entries
    if (validatedData.playerIds.length > 0) {
      const entries = validatedData.playerIds.map(playerId => ({
        qualifier_id: qualifier.id,
        player_id: playerId,
        is_tied: false,
        rounds_completed: 0,
      }));

      const { error: entriesError } = await supabase
        .from('golf_qualifier_entries')
        .insert(entries);

      if (entriesError) {
        console.error('[Golf] Failed to add qualifier entries:', entriesError);
        return { success: false, error: 'Failed to add players to qualifier. Please try again.' };
      }
    }

    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/qualifiers');

    return { success: true, data: { qualifierId: qualifier.id } };

  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid qualifier data. Please check your inputs.' };
    }
    console.error('[Golf] Unexpected error creating qualifier:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred'
    };
  }
}

export async function updateQualifierStatus(
  qualifierId: string,
  status: 'upcoming' | 'in_progress' | 'completed'
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to update qualifier status' };
    }

    const { error } = await supabase
      .from('golf_qualifiers')
      .update({ status })
      .eq('id', qualifierId);

    if (error) {
      console.error('[Golf] Failed to update qualifier status:', error);
      return { success: false, error: 'Failed to update qualifier status. Please try again.' };
    }

    revalidatePath('/golf/dashboard/qualifiers');

    return { success: true, data: undefined };

  } catch (error) {
    console.error('[Golf] Unexpected error updating qualifier status:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred'
    };
  }
}

// ============================================================================
// ANNOUNCEMENT ACTIONS
// ============================================================================

export async function createAnnouncement(data: {
  title: string;
  body: string;
  urgency: 'low' | 'normal' | 'high' | 'urgent';
  requiresAcknowledgement: boolean;
}): Promise<ActionResult<{ announcementId: string }>> {
  try {
    // Validate input
    const validatedData = announcementSchema.parse(data);

    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to create announcements' };
    }

    // Get coach and team
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, team_id')
      .eq('user_id', user.id)
      .single();

    if (!coach?.team_id) {
      return { success: false, error: 'Coach profile or team not found' };
    }

    const { data: announcement, error } = await supabase
      .from('golf_announcements')
      .insert({
        team_id: coach.team_id,
        title: validatedData.title,
        body: validatedData.body,
        urgency: validatedData.urgency,
        requires_acknowledgement: validatedData.requiresAcknowledgement,
        send_push: false,
        send_email: false,
        published_at: new Date().toISOString(),
        created_by: coach.id,
      })
      .select()
      .single();

    if (error) {
      console.error('[Golf] Failed to create announcement:', error);
      return { success: false, error: 'Failed to create announcement. Please try again.' };
    }

    revalidatePath('/golf/dashboard/announcements');

    return { success: true, data: { announcementId: announcement.id } };

  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid announcement data. Please check your inputs.' };
    }
    console.error('[Golf] Unexpected error creating announcement:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred'
    };
  }
}

// ============================================================================
// PLAYER ACTIONS
// ============================================================================

export async function invitePlayerToTeam(
  email: string
): Promise<ActionResult<{ inviteCode: string; inviteLink: string }>> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to invite players' };
    }

    // Get coach and team
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, team_id, team:golf_teams(name, invite_code)')
      .eq('user_id', user.id)
      .single();

    if (!coach?.team_id) {
      return { success: false, error: 'Coach profile or team not found' };
    }

    // Generate invite code if not exists
    let inviteCode = coach.team?.invite_code;
    if (!inviteCode) {
      inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const { error: updateError } = await supabase
        .from('golf_teams')
        .update({ invite_code: inviteCode })
        .eq('id', coach.team_id);

      if (updateError) {
        console.error('[Golf] Failed to generate invite code:', updateError);
        return { success: false, error: 'Failed to generate invite code. Please try again.' };
      }
    }

    return {
      success: true,
      data: {
        inviteCode,
        inviteLink: `/golf/join/${inviteCode}`,
      },
    };

  } catch (error) {
    console.error('[Golf] Unexpected error inviting player:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred'
    };
  }
}

export async function updatePlayerStatus(
  playerId: string,
  status: 'active' | 'injured' | 'redshirt' | 'inactive'
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, coach } = await requireGolfCoach();

    if (!coach.team_id) {
      return { success: false, error: 'Coach not assigned to a team' };
    }

    // Verify ownership
    await verifyGolfTeamOwnership(supabase, playerId, coach.team_id, 'golf_players');

    const { error } = await supabase
      .from('golf_players')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', playerId)
      .eq('team_id', coach.team_id);

    if (error) {
      return { success: false, error: 'Failed to update player status' };
    }

    revalidatePath('/golf/dashboard/roster');
    return { success: true };

  } catch (err) {
    if (err instanceof AuthorizationError || err instanceof NotFoundError) {
      return { success: false, error: err.message };
    }
    return { success: false, error: 'An unexpected error occurred' };
  }
}
