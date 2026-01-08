'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { HoleStats } from '@/components/golf/ShotTrackingComprehensive';
import { z } from 'zod';
import {
  requireGolfCoach,
  verifyGolfTeamOwnership,
  AuthorizationError,
  NotFoundError
} from '@/lib/auth/ownership';
import { roundTypeToDb } from '@/lib/golf/round-type-utils';

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
// ACTION RESULT DATA TYPES
// ============================================================================

/** Putt details for shot tracking */
interface PuttDetail {
  shot_id: string;
  miss_tags: string[];
  break_direction: string | null;
  distance_feet: number | null;
  made: boolean;
}

/** Approach miss details for shot tracking */
interface ApproachMissDetail {
  shot_id: string;
  miss_direction: string;
  lie_type: string | null;
  distance_from_green_yards: number | null;
}

type GolfEventType = 'practice' | 'tournament' | 'qualifier' | 'meeting' | 'travel' | 'other' | 'class';

/** Golf event insert data */
interface GolfEventInsertData {
  team_id: string | null;
  title: string;
  event_type: GolfEventType;
  start_date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
  location: string | null;
  course_name: string | null;
  description: string | null;
  is_mandatory: boolean;
  requires_rsvp: boolean;
  rsvp_deadline: string | null;
  max_attendees: number | null;
  created_by?: string;
  player_id?: string;
}

/** Blocked time update data */
interface BlockedTimeUpdateData {
  title?: string;
  start_date?: string;
  end_date?: string;
  start_time?: string;
  end_time?: string;
  all_day?: boolean;
  recurrence_rule?: string | null;
  description?: string | null;
}

/** Conflict check result - re-exported from calendar lib */
export interface ConflictResult {
  hasConflict: boolean;
  conflicts: Array<{
    userId: string;
    userName: string;
    playerId?: string;
    conflictingEvent: {
      id: string;
      title: string;
      type: 'event' | 'class' | 'blocked';
      start: string;
      end: string;
    };
  }>;
  suggestions: Array<{
    start: Date;
    end: Date;
  }>;
}

/** Busy period for availability - serialized version */
export interface SerializedBusyPeriod {
  start: string;
  end: string;
  type: 'event' | 'class' | 'blocked';
  title?: string;
  eventId?: string;
}

/** Calendar notification */
export interface CalendarNotification {
  id: string;
  user_id: string;
  event_id: string | null;
  type: string;
  title: string;
  message: string | null;
  read: boolean | null;
  action_url: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** Event invitation - re-exported from calendar lib */
export interface EventInvitation {
  eventId: string;
  eventTitle: string;
  eventType: string;
  startDate: string;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  location: string | null;
  description: string | null;
  requiresRsvp: boolean;
  rsvpDeadline: string | null;
  createdBy: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'tentative';
}

/** RSVP stats for an event */
export interface RSVPStats {
  summary: {
    total: number;
    accepted: number;
    declined: number;
    tentative: number;
    pending: number;
    attendees: Array<{
      playerId: string;
      playerName: string;
      avatarUrl: string | null;
      status: 'pending' | 'accepted' | 'declined' | 'tentative';
      respondedAt: string | null;
    }>;
  };
  acceptanceRate: number;
  responseRate: number;
}

/** Coach blocked time period */
export interface BlockedTimePeriod {
  id: string;
  coach_id: string;
  title: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean | null;
  recurrence_rule: string | null;
  description: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** In-progress round summary */
export interface InProgressRound {
  id: string;
  course_name: string;
  round_date: string;
  round_type: string | null;
  current_hole: number | null;
  holes_to_play: number | null;
  created_at: string | null;
  updated_at: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PendingMigrationTable = any; // Tables that exist in migration but not yet in generated types

/** Shot data from golf_shots table */
interface ShotData {
  id: string;
  hole_id: string;
  round_id: string;
  shot_number: number;
  shot_type: string;
  club_used: string | null;
  result: string;
  distance_to_hole_before: number | null;
  distance_to_hole_after: number | null;
  lie_type: string | null;
  notes: string | null;
}

/** Hole data with associated shots */
interface HoleWithShots {
  id: string;
  round_id: string;
  hole_number: number;
  par: number;
  yardage: number | null;
  score: number | null;
  putts: number | null;
  fairway_hit: boolean | null;
  green_in_regulation: boolean | null;
  penalty_strokes: number | null;
  driving_distance: number | null;
  used_driver: boolean | null;
  drive_miss_direction: string | null;
  approach_distance: number | null;
  approach_lie: string | null;
  approach_club: string | null;
  shots: ShotData[];
}

/** Round record from golf_rounds table */
interface RoundRecord {
  id: string;
  player_id: string;
  course_name: string;
  course_city: string | null;
  course_state: string | null;
  round_date: string;
  round_type: string | null;
  holes_to_play: number | null;
  current_hole: number | null;
  status: string | null;
  course_rating: number | null;
  course_slope: number | null;
  tees_played: string | null;
  total_score: number | null;
  total_to_par: number | null;
  total_putts: number | null;
  fairways_hit: number | null;
  fairways_total: number | null;
  greens_in_regulation: number | null;
  greens_total: number | null;
  created_at: string | null;
  updated_at: string | null;
}

/** Full round data for loading in-progress round */
export interface FullRoundData {
  round: RoundRecord;
  holes: HoleWithShots[];
}

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
  // RSVP fields
  requiresRsvp: z.boolean().optional(),
  rsvpDeadline: z.string().optional(),
  maxAttendees: z.number().int().positive().optional(),
  attendeeIds: z.array(z.string().uuid()).optional(),
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
  // RSVP fields
  requiresRsvp?: boolean;
  rsvpDeadline?: string;
  maxAttendees?: number;
  attendeeIds?: string[];
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
  data: GolfRoundInputComprehensive,
  existingRoundId?: string
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

    // If updating an existing round, verify ownership and delete old holes and shots first
    if (existingRoundId) {
      // SECURITY: Verify the round belongs to this player before modifying
      const { data: existingRound, error: verifyError } = await supabase
        .from('golf_rounds')
        .select('id, player_id')
        .eq('id', existingRoundId)
        .eq('player_id', player.id)
        .single();

      if (verifyError || !existingRound) {
        return { success: false, error: 'Round not found or you do not have permission to update it.' };
      }

      // Delete existing shots (cascades from holes)
      const { error: deleteShotsError } = await supabase
        .from('golf_shots')
        .delete()
        .eq('round_id', existingRoundId);

      if (deleteShotsError) {
        // Non-critical - shots might not exist
      }

      // Delete existing holes
      const { error: deleteHolesError } = await supabase
        .from('golf_holes')
        .delete()
        .eq('round_id', existingRoundId);

      if (deleteHolesError) {
        return { success: false, error: 'Failed to update round. Please try again.' };
      }
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

  // Convert frontend round type to database format
  const roundTypeDb = roundTypeToDb(data.roundType);

  // Prepare round data
  const roundData = {
    player_id: player.id,
    course_name: data.courseName,
    course_city: data.courseCity || null,
    course_state: data.courseState || null,
    course_rating: data.courseRating || null,
    course_slope: data.courseSlope || null,
    tees_played: data.teesPlayed || null,
    // Note: course_id column doesn't exist in golf_rounds table
    round_type: roundTypeDb,
    round_date: data.roundDate,
    total_score: totalScore,
    total_to_par: totalToPar,
    total_putts: totalPutts,
    fairways_hit: fairwaysHit,
    fairways_total: fairwaysTotal,
    greens_in_regulation: greensInReg,
    greens_total: data.holes.length,
    is_verified: false,
    status: 'completed' as const, // Mark as completed when all holes are done
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
  };

  // Insert or update round
  let round;
  let roundError;

  if (existingRoundId) {
    // Update existing round
    const result = await supabase
      .from('golf_rounds')
      .update(roundData)
      .eq('id', existingRoundId)
      .eq('player_id', player.id) // Security: ensure player owns this round
      .select()
      .single();

    round = result.data;
    roundError = result.error;

    if (roundError || !round) {
      return { success: false, error: 'Failed to update round. Please try again.' };
    }
  } else {
    // Insert new round
    const result = await supabase
      .from('golf_rounds')
      .insert(roundData)
      .select()
      .single();

    round = result.data;
    roundError = result.error;

    if (roundError || !round) {
      return { success: false, error: 'Failed to save round. Please try again.' };
    }
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
    const { data: insertedShots, error: shotsError } = await supabase
      .from('golf_shots')
      .insert(allShots)
      .select('id, hole_number, shot_number, shot_type');

    if (shotsError) {
      // Don't throw - shots are supplementary data
    } else if (insertedShots) {
      // Create maps to find shot IDs for putt and approach miss details
      const shotIdMap = new Map<string, string>();
      for (const shot of insertedShots) {
        const key = `${shot.hole_number}-${shot.shot_number}`;
        shotIdMap.set(key, shot.id);
      }

      // Save putt details and approach miss details
      const puttDetails: PuttDetail[] = [];
      const approachMissDetails: ApproachMissDetail[] = [];

      for (const hole of data.holes) {
        for (const shot of hole.shots) {
          const key = `${hole.holeNumber}-${shot.shotNumber}`;
          const shotId = shotIdMap.get(key);
          
          if (!shotId) continue;

          // Save putt details if this is a putt with miss tags
          if (shot.shotType === 'putting' && shot.puttMissTags && shot.puttMissTags.length > 0) {
            puttDetails.push({
              shot_id: shotId,
              miss_tags: shot.puttMissTags,
              break_direction: shot.puttBreak || null,
              distance_feet: shot.puttDistanceFeet || null,
              made: shot.result === 'hole',
            });
          }

          // Save approach miss details if this is an approach shot with miss direction
          if ((shot.shotType === 'approach' || shot.shotType === 'around_green') && 
              shot.approachMissDirection && 
              shot.result !== 'green' && shot.result !== 'hole') {
            approachMissDetails.push({
              shot_id: shotId,
              miss_direction: shot.approachMissDirection,
              lie_type: shot.approachMissLieType || null,
              distance_from_green_yards: shot.distanceUnitAfter === 'feet' 
                ? Math.round((shot.distanceToHoleAfter || 0) / 3)
                : shot.distanceToHoleAfter || null,
            });
          }
        }
      }

      // Insert putt details (using type assertion for tables not in generated types)
      if (puttDetails.length > 0) {
        await (supabase as PendingMigrationTable).from('putt_details').insert(puttDetails);
      }

      // Insert approach miss details (using type assertion for tables not in generated types)
      if (approachMissDetails.length > 0) {
        await (supabase as PendingMigrationTable).from('approach_miss_details').insert(approachMissDetails);
      }
    }
  }

    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/rounds');
    revalidatePath('/golf/dashboard/stats');

    return { success: true, data: { roundId: round.id } };

  } catch (error) {
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

  // Convert frontend round type to database format
  const roundTypeDb = roundTypeToDb(validatedData.roundType);

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
      // Note: course_id column doesn't exist in golf_rounds table
      round_type: roundTypeDb,
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
      return { success: false, error: 'Failed to delete round. Please try again.' };
    }

    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/rounds');
    revalidatePath('/golf/dashboard/stats');

    return { success: true, data: undefined };

  } catch {
    return {
      success: false,
      error: 'An unexpected error occurred'
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

    // Try to get coach profile first
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, team_id')
      .eq('user_id', user.id)
      .maybeSingle();

    // If not a coach, try to get player profile
    let teamId: string | null = null;
    let createdBy: string | null = null;
    let playerId: string | null = null;

    if (coach) {
      // Coach - team_id is required for coaches
      if (!coach.team_id) {
        return { success: false, error: 'Coach not assigned to a team' };
      }
      teamId = coach.team_id;
      createdBy = coach.id;
    } else {
      // Check if user is a player
      const { data: player } = await supabase
        .from('golf_players')
        .select('id, team_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!player) {
        return { success: false, error: 'User profile not found' };
      }

      // For players, team_id is optional (can be null for personal events)
      teamId = player.team_id || null;
      createdBy = null;
      // Store player id to set player_id on the event
      playerId = player.id;
    }

    // Build insert data - only include created_by if it's not null
    const insertData: GolfEventInsertData = {
      team_id: teamId,
      title: validatedData.title,
      event_type: validatedData.eventType as GolfEventType,
      start_date: validatedData.startDate,
      end_date: validatedData.endDate || null,
      start_time: validatedData.startTime || null,
      end_time: validatedData.endTime || null,
      all_day: validatedData.allDay ?? true,
      location: validatedData.location || null,
      course_name: validatedData.courseName || null,
      description: validatedData.description || null,
      is_mandatory: validatedData.isMandatory ?? false,
      // RSVP fields
      requires_rsvp: validatedData.requiresRsvp ?? false,
      rsvp_deadline: validatedData.rsvpDeadline || null,
      max_attendees: validatedData.maxAttendees || null,
    };

    // Only add created_by if it's not null (coaches only)
    if (createdBy) {
      insertData.created_by = createdBy;
    }
    
    // Set player_id if this event is created by a player
    if (playerId) {
      insertData.player_id = playerId;
    }

    const { data: event, error } = await supabase
      .from('golf_events')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      return { success: false, error: 'Failed to create event. Please try again.' };
    }

    // Send invitations if attendeeIds provided
    if (validatedData.attendeeIds && validatedData.attendeeIds.length > 0) {
      try {
        const { sendEventInvitations } = await import('@/lib/calendar/rsvp');
        await sendEventInvitations(event.id, validatedData.attendeeIds, supabase);
      } catch {
        // Don't fail the whole operation if invitations fail
      }
    }

    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/calendar');

    return { success: true, data: { eventId: event.id } };

  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid event data. Please check your inputs.' };
    }
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
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to update events' };
    }

    // Try to get coach profile first
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, team_id')
      .eq('user_id', user.id)
      .maybeSingle();

    // If not a coach, try to get player profile
    let teamId: string | null = null;

    if (coach) {
      if (!coach.team_id) {
        return { success: false, error: 'Coach not assigned to a team' };
      }
      teamId = coach.team_id;
    } else {
      const { data: player } = await supabase
        .from('golf_players')
        .select('id, team_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!player) {
        return { success: false, error: 'User profile not found' };
      }

      // For players, team_id is optional
      teamId = player.team_id || null;
    }

    // Verify event belongs to user's team (or is a personal event if teamId is null)
    const { data: existingEvent } = await supabase
      .from('golf_events')
      .select('team_id')
      .eq('id', eventId)
      .single();

    if (!existingEvent) {
      return { success: false, error: 'Event not found' };
    }

    // Check ownership: event's team_id must match user's team_id (both can be null for personal events)
    if (existingEvent.team_id !== teamId) {
      return { success: false, error: 'Access denied' };
    }

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

    let query = supabase
      .from('golf_events')
      .update(updateData)
      .eq('id', eventId);

    // Handle null team_id for personal events
    if (teamId === null) {
      query = query.is('team_id', null);
    } else {
      query = query.eq('team_id', teamId);
    }

    const { error } = await query;

    if (error) {
      return { success: false, error: 'Failed to update event' };
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true };

  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false, error: 'Invalid input data' };
    }
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export async function deleteGolfEvent(
  eventId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to delete events' };
    }

    // Try to get coach profile first
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, team_id')
      .eq('user_id', user.id)
      .maybeSingle();

    // If not a coach, try to get player profile
    let teamId: string | null = null;

    if (coach) {
      if (!coach.team_id) {
        return { success: false, error: 'Coach not assigned to a team' };
      }
      teamId = coach.team_id;
    } else {
      const { data: player } = await supabase
        .from('golf_players')
        .select('id, team_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!player) {
        return { success: false, error: 'User profile not found' };
      }

      // For players, team_id is optional
      teamId = player.team_id || null;
    }

    // Verify event belongs to user's team (or is a personal event if teamId is null)
    const { data: existingEvent } = await supabase
      .from('golf_events')
      .select('team_id')
      .eq('id', eventId)
      .single();

    if (!existingEvent) {
      return { success: false, error: 'Event not found' };
    }

    // Check ownership: event's team_id must match user's team_id (both can be null for personal events)
    if (existingEvent.team_id !== teamId) {
      return { success: false, error: 'Access denied' };
    }

    let deleteQuery = supabase
      .from('golf_events')
      .delete()
      .eq('id', eventId);

    // Handle null team_id for personal events
    if (teamId === null) {
      deleteQuery = deleteQuery.is('team_id', null);
    } else {
      deleteQuery = deleteQuery.eq('team_id', teamId);
    }

    const { error } = await deleteQuery;

    if (error) {
      return { success: false, error: 'Failed to delete event' };
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true };

  } catch {
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
      return { success: false, error: 'Failed to update qualifier status. Please try again.' };
    }

    revalidatePath('/golf/dashboard/qualifiers');

    return { success: true, data: undefined };

  } catch (error) {
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
      return { success: false, error: 'Failed to create announcement. Please try again.' };
    }

    revalidatePath('/golf/dashboard/announcements');

    return { success: true, data: { announcementId: announcement.id } };

  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid announcement data. Please check your inputs.' };
    }
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _email: string // Email parameter reserved for future email invitations
): Promise<ActionResult<{ inviteCode: string; inviteLink: string }>> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to invite players' };
    }

    // Get coach
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, team_id')
      .eq('user_id', user.id)
      .single();

    if (!coach?.team_id) {
      return { success: false, error: 'Coach profile or team not found' };
    }

    // Get team
    const { data: team } = await supabase
      .from('golf_teams')
      .select('name, invite_code')
      .eq('id', coach.team_id)
      .single();

    // Generate invite code if not exists
    let inviteCode = team?.invite_code;
    if (!inviteCode) {
      inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const { error: updateError } = await supabase
        .from('golf_teams')
        .update({ invite_code: inviteCode })
        .eq('id', coach.team_id);

      if (updateError) {
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

// ============================================================================
// RSVP & CALENDAR ACTIONS
// ============================================================================

/**
 * Player responds to an event invitation
 */
export async function respondToEvent(
  eventId: string,
  status: 'pending' | 'accepted' | 'declined' | 'tentative'
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'You must be signed in' };
    }

    // Get player ID
    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!player) {
      return { success: false, error: 'Player profile not found' };
    }

    // Update RSVP
    const { updateRSVP } = await import('@/lib/calendar/rsvp');
    await updateRSVP(eventId, player.id, status, supabase);

    revalidatePath('/golf/dashboard/calendar');
    return { success: true, data: undefined };

  } catch {
    return { success: false, error: 'Failed to update RSVP' };
  }
}

/**
 * Check for scheduling conflicts when creating/editing an event
 */
export async function checkScheduleConflicts(
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string,
  attendeeIds: string[],
  excludeEventId?: string
): Promise<ActionResult<ConflictResult>> {
  try {
    const supabase = await createClient();

    const start = new Date(`${startDate}T${startTime}`);
    const end = new Date(`${endDate}T${endTime}`);

    const { checkEventConflicts } = await import('@/lib/calendar/conflicts');
    const result = await checkEventConflicts(
      start,
      end,
      attendeeIds,
      supabase,
      { excludeEventId }
    );

    return { success: true, data: result as unknown as ConflictResult };

  } catch {
    return { success: false, error: 'Failed to check conflicts' };
  }
}

/**
 * Get availability for a specific player on a specific date
 * Used for the availability day view overlay
 */
export async function getPlayerAvailability(
  memberId: string,
  startDate: string, // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
): Promise<ActionResult<SerializedBusyPeriod[]>> {
  try {
    const supabase = await createClient();

    // First, check if this is a player
    const { data: player } = await supabase
      .from('golf_players')
      .select('user_id')
      .eq('id', memberId)
      .maybeSingle();

    let userId: string | null = player?.user_id || null;

    // If not a player, check if it's a coach
    if (!userId) {
      const { data: coach } = await supabase
        .from('golf_coaches')
        .select('user_id')
        .eq('id', memberId)
        .maybeSingle();

      userId = coach?.user_id || null;
    }

    if (!userId) {
      return { success: false, error: 'Team member not found' };
    }

    const dayStart = new Date(`${startDate}T00:00:00`);
    const dayEnd = new Date(`${endDate}T23:59:59`);

    const { getUserBusyPeriods } = await import('@/lib/calendar/availability');
    const busyPeriods = await getUserBusyPeriods(
      userId,
      dayStart,
      dayEnd,
      supabase
    );

    // Convert to serializable format
    const serialized = busyPeriods.map(period => ({
      start: period.start.toISOString(),
      end: period.end.toISOString(),
      type: period.type,
      title: period.title,
      eventId: period.eventId,
    }));

    return { success: true, data: serialized };

  } catch {
    return { success: false, error: 'Failed to get availability' };
  }
}

/**
 * Get the current user's busy periods (works for both coaches and players)
 * Used to show YOUR schedule when viewing availability alongside a team member
 */
export async function getCurrentUserBusyPeriods(
  startDate: string, // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
): Promise<ActionResult<SerializedBusyPeriod[]>> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const dayStart = new Date(`${startDate}T00:00:00`);
    const dayEnd = new Date(`${endDate}T23:59:59`);

    const { getUserBusyPeriods } = await import('@/lib/calendar/availability');
    const busyPeriods = await getUserBusyPeriods(
      user.id,
      dayStart,
      dayEnd,
      supabase
    );

    // Convert to serializable format
    const serialized = busyPeriods.map(period => ({
      start: period.start.toISOString(),
      end: period.end.toISOString(),
      type: period.type,
      title: period.title,
      eventId: period.eventId,
    }));

    return { success: true, data: serialized };

  } catch {
    return { success: false, error: 'Failed to get availability' };
  }
}

/**
 * Get all calendar notifications for the current user
 */
export async function getNotifications(limit: number = 50): Promise<ActionResult<CalendarNotification[]>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data, error } = await supabase
      .from('golf_calendar_notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return { success: false, error: 'Failed to fetch notifications' };
    }

    return { success: true, data: data || [] };

  } catch {
    return { success: false, error: 'Failed to fetch notifications' };
  }
}

/**
 * Mark a notification as read
 */
export async function markNotificationRead(
  notificationId: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    await supabase
      .from('golf_calendar_notifications')
      .update({ read: true, updated_at: new Date().toISOString() })
      .eq('id', notificationId);

    revalidatePath('/golf/dashboard');
    return { success: true, data: undefined };

  } catch {
    return { success: false, error: 'Failed to mark notification read' };
  }
}

/**
 * Mark all notifications as read for the current user
 */
export async function markAllNotificationsRead(): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    await supabase
      .from('golf_calendar_notifications')
      .update({ read: true, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('read', false);

    revalidatePath('/golf/dashboard');
    return { success: true, data: undefined };

  } catch {
    return { success: false, error: 'Failed to mark notifications read' };
  }
}

/**
 * Get pending event invitations for the current player
 */
export async function getPendingInvitations(): Promise<ActionResult<EventInvitation[]>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get player ID
    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!player) {
      return { success: false, error: 'Player profile not found' };
    }

    const { getPlayerPendingInvitations } = await import('@/lib/calendar/rsvp');
    const invitations = await getPlayerPendingInvitations(player.id, supabase);

    return { success: true, data: invitations };

  } catch {
    return { success: false, error: 'Failed to fetch invitations' };
  }
}

/**
 * Get RSVP summary for an event (coach view)
 */
export async function getEventRSVP(eventId: string): Promise<ActionResult<RSVPStats>> {
  try {
    const supabase = await createClient();

    const { getEventRSVPStats } = await import('@/lib/calendar/rsvp');
    const stats = await getEventRSVPStats(eventId, supabase);

    return { success: true, data: stats };

  } catch {
    return { success: false, error: 'Failed to fetch RSVP data' };
  }
}

// ============================================================================
// COACH BLOCKED TIME MANAGEMENT
// ============================================================================

const blockedTimeSchema = z.object({
  title: z.string().min(1).max(200),
  startDate: z.string(),
  endDate: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  allDay: z.boolean().optional(),
  recurrenceRule: z.string().optional(),
  description: z.string().max(1000).optional(),
});

/**
 * Add coach blocked time
 */
export async function addCoachBlockedTime(
  data: z.infer<typeof blockedTimeSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get coach ID
    const { data: coach, error: coachError } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (coachError || !coach) {
      return { success: false, error: 'Coach profile not found' };
    }

    // Validate input
    const validatedData = blockedTimeSchema.parse(data);

    // Insert blocked time
    const { data: blockedTime, error } = await supabase
      .from('golf_coach_blocked_time')
      .insert({
        coach_id: coach.id,
        title: validatedData.title,
        start_date: validatedData.startDate,
        end_date: validatedData.endDate || validatedData.startDate,
        start_time: validatedData.startTime || null,
        end_time: validatedData.endTime || null,
        all_day: validatedData.allDay || false,
        recurrence_rule: validatedData.recurrenceRule || null,
        description: validatedData.description || null,
      })
      .select('id')
      .single();

    if (error) {
      return { success: false, error: 'Failed to add blocked time' };
    }

    revalidatePath('/golf/dashboard/calendar');

    return { success: true, data: { id: blockedTime.id } };

  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid blocked time data' };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred'
    };
  }
}

/**
 * Delete coach blocked time
 */
export async function deleteCoachBlockedTime(id: string): Promise<ActionResult<void>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get coach ID
    const { data: coach, error: coachError } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (coachError || !coach) {
      return { success: false, error: 'Coach profile not found' };
    }

    // Delete blocked time (RLS will ensure it's theirs)
    const { error } = await supabase
      .from('golf_coach_blocked_time')
      .delete()
      .eq('id', id)
      .eq('coach_id', coach.id);

    if (error) {
      return { success: false, error: 'Failed to delete blocked time' };
    }

    revalidatePath('/golf/dashboard/calendar');

    return { success: true, data: undefined };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred'
    };
  }
}

/**
 * Update coach blocked time
 */
export async function updateCoachBlockedTime(
  id: string,
  data: Partial<z.infer<typeof blockedTimeSchema>>
): Promise<ActionResult<void>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get coach ID
    const { data: coach, error: coachError } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (coachError || !coach) {
      return { success: false, error: 'Coach profile not found' };
    }

    // Build update object
    const updates: BlockedTimeUpdateData = {};
    if (data.title !== undefined) updates.title = data.title;
    if (data.startDate !== undefined) updates.start_date = data.startDate;
    if (data.endDate !== undefined) updates.end_date = data.endDate;
    if (data.startTime !== undefined) updates.start_time = data.startTime;
    if (data.endTime !== undefined) updates.end_time = data.endTime;
    if (data.allDay !== undefined) updates.all_day = data.allDay;
    if (data.recurrenceRule !== undefined) updates.recurrence_rule = data.recurrenceRule;
    if (data.description !== undefined) updates.description = data.description;

    // Update blocked time (RLS will ensure it's theirs)
    const { error } = await supabase
      .from('golf_coach_blocked_time')
      .update(updates)
      .eq('id', id)
      .eq('coach_id', coach.id);

    if (error) {
      return { success: false, error: 'Failed to update blocked time' };
    }

    revalidatePath('/golf/dashboard/calendar');

    return { success: true, data: undefined };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred'
    };
  }
}

/**
 * Get coach blocked time periods
 */
export async function getCoachBlockedTime(
  startDate: string,
  endDate: string
): Promise<ActionResult<BlockedTimePeriod[]>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get coach ID
    const { data: coach, error: coachError } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (coachError || !coach) {
      return { success: false, error: 'Coach profile not found' };
    }

    // Query blocked time in date range
    const { data: blockedTimes, error } = await supabase
      .from('golf_coach_blocked_time')
      .select('*')
      .eq('coach_id', coach.id)
      .gte('end_date', startDate)
      .lte('start_date', endDate)
      .order('start_date', { ascending: true });

    if (error) {
      return { success: false, error: 'Failed to fetch blocked time' };
    }

    return { success: true, data: blockedTimes || [] };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred'
    };
  }
}

// ============================================================================
// SAVE FOR LATER - INCOMPLETE ROUND MANAGEMENT
// ============================================================================

export interface PartialRoundData {
  // Round setup
  courseName: string;
  courseCity?: string;
  courseState?: string;
  courseRating?: number;
  courseSlope?: number;
  teesPlayed?: string;
  courseId?: string;
  roundType: 'practice' | 'tournament' | 'qualifier';
  roundDate: string;
  // Progress tracking
  currentHole: number;
  holesToPlay: number; // 9 or 18
  // Completed holes data
  holes: HoleStats[];
  // Hole configuration for full round (completed + remaining)
  holeConfigs?: Array<{
    holeNumber: number;
    par: number;
    yardage?: number | null;
  }>;
}

/**
 * Save an incomplete round to database
 * Status will be 'in_progress' and stats will NOT be calculated
 */
export async function savePartialRound(
  data: PartialRoundData,
  existingRoundId?: string
): Promise<ActionResult<{ roundId: string }>> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in' };
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

    // Validate currentHole is within valid range (1-18) if provided
    // Note: currentHole can be null for rounds that haven't started
    if (data.currentHole !== undefined && data.currentHole !== null) {
      if (data.currentHole < 1 || data.currentHole > 18) {
        return { success: false, error: `Invalid current hole: ${data.currentHole}. Must be between 1 and 18.` };
      }
    }

    // Validate holesToPlay is 9 or 18 if provided
    if (data.holesToPlay !== undefined && data.holesToPlay !== null) {
      if (data.holesToPlay !== 9 && data.holesToPlay !== 18) {
        return { success: false, error: `Invalid holes to play: ${data.holesToPlay}. Must be 9 or 18.` };
      }
    }

    // Convert frontend round type to database format
    const roundTypeDb = roundTypeToDb(data.roundType);

    const roundData = {
      player_id: player.id,
      course_name: data.courseName,
      course_city: data.courseCity || null,
      course_state: data.courseState || null,
      course_rating: data.courseRating || null,
      course_slope: data.courseSlope || null,
      tees_played: data.teesPlayed || null,
      // Note: course_id column doesn't exist in golf_rounds table
      round_type: roundTypeDb,
      round_date: data.roundDate,
      status: 'in_progress' as const,
      current_hole: data.currentHole || null,
      holes_to_play: data.holesToPlay || 18,
      // Leave stats null for incomplete rounds
      total_score: null,
      total_to_par: null,
      total_putts: null,
      fairways_hit: null,
      fairways_total: null,
      greens_in_regulation: null,
      greens_total: null,
    };

    let roundId: string;

    if (existingRoundId) {
      // Update existing incomplete round
      const { data: round, error: roundError } = await supabase
        .from('golf_rounds')
        .update(roundData)
        .eq('id', existingRoundId)
        .eq('player_id', player.id)
        .eq('status', 'in_progress')
        .select()
        .maybeSingle();

      if (roundError) {
        console.error('Update round error:', {
          code: roundError.code,
          message: roundError.message,
          details: roundError.details,
          hint: roundError.hint,
        });
        return { 
          success: false, 
          error: roundError.message || 'Failed to update round. Please try again.' 
        };
      }

      if (!round) {
        // Round doesn't exist or isn't in_progress, create new one instead
        const { data: newRound, error: insertError } = await supabase
          .from('golf_rounds')
          .insert(roundData)
          .select()
          .single();

        if (insertError) {
          console.error('Insert round error (fallback):', {
            code: insertError.code,
            message: insertError.message,
            details: insertError.details,
            hint: insertError.hint,
          });
          return { 
            success: false, 
            error: insertError.message || 'Failed to save round. Please try again.' 
          };
        }

        roundId = newRound.id;
      } else {
        roundId = round.id;
      }

      // Delete existing holes for this round
      await supabase
        .from('golf_holes')
        .delete()
        .eq('round_id', roundId);

      // Delete existing shots
      await supabase
        .from('golf_shots')
        .delete()
        .eq('round_id', roundId);
    } else {
      // Create new incomplete round
      const { data: round, error: roundError } = await supabase
        .from('golf_rounds')
        .insert(roundData)
        .select()
        .single();

      if (roundError) {
        console.error('Insert round error:', {
          code: roundError.code,
          message: roundError.message,
          details: roundError.details,
          hint: roundError.hint,
          roundData: {
            ...roundData,
            player_id: '[REDACTED]',
          },
        });
        return { 
          success: false, 
          error: roundError.message || 'Failed to save round. Please try again.' 
        };
      }

      roundId = round.id;
    }

    const completedHoles = data.holes.filter((hole): hole is HoleStats => Boolean(hole));
    const holeConfigs = (data.holeConfigs && data.holeConfigs.length > 0)
      ? data.holeConfigs
      : completedHoles.map(hole => ({
        holeNumber: hole.holeNumber,
        par: hole.par,
        yardage: hole.yardage || null,
      }));

    const completedHolesByNumber = new Map<number, HoleStats>(
      completedHoles.map(hole => [hole.holeNumber, hole])
    );

    if (holeConfigs.length > 0) {
      const holesData = holeConfigs.map(config => {
        const completed = completedHolesByNumber.get(config.holeNumber);

        if (completed) {
          return {
            round_id: roundId,
            hole_number: completed.holeNumber,
            par: completed.par,
            yardage: completed.yardage || null,
            score: completed.score,
            putts: completed.putts,
            fairway_hit: completed.fairwayHit,
            green_in_regulation: completed.greenInRegulation,
            penalty_strokes: completed.penaltyStrokes,
            driving_distance: completed.drivingDistance,
            used_driver: completed.usedDriver,
            drive_miss_direction: completed.driveMissDirection,
            approach_distance: completed.approachDistance,
            approach_lie: completed.approachLie,
            approach_proximity: completed.approachProximity,
            approach_miss_direction: completed.approachMissDirection,
            scramble_attempt: completed.scrambleAttempt,
            scramble_made: completed.scrambleMade,
            sand_save_attempt: completed.sandSaveAttempt,
            sand_save_made: completed.sandSaveMade,
            first_putt_distance: completed.firstPuttDistance,
            first_putt_leave: completed.firstPuttLeave,
            first_putt_break: completed.firstPuttBreak,
            first_putt_slope: completed.firstPuttSlope,
            first_putt_miss_direction: completed.firstPuttMissDirection,
            holed_out_distance: completed.holedOutDistance,
            holed_out_type: completed.holedOutType,
          };
        }

        return {
          round_id: roundId,
          hole_number: config.holeNumber,
          par: config.par,
          yardage: config.yardage ?? null,
          score: null,
        };
      });

      const { data: insertedHoles, error: holesError } = await supabase
        .from('golf_holes')
        .insert(holesData)
        .select('id, hole_number');

      if (holesError) {
        // Holes insert failed - continue without saving shots (partial round will still be saved)
      } else {
        const holeIdMap = new Map(insertedHoles?.map(h => [h.hole_number, h.id]) || []);

        // Save shots for ALL holes that have shots (completed and incomplete)
        // This ensures we can resume exactly where we left off
        // Use data.holes instead of completedHoles to include incomplete holes with shots
        const allHolesWithShots = data.holes.filter(hole => hole.shots && hole.shots.length > 0);
        
        for (const hole of allHolesWithShots) {
          const holeId = holeIdMap.get(hole.holeNumber);
          if (!holeId) {
            // If hole doesn't exist in map, skip (shouldn't happen, but safety check)
            continue;
          }

          const shotsData = hole.shots.map(shot => ({
            round_id: roundId,
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
            miss_direction: shot.missDirection,
            putt_break: shot.puttBreak,
            putt_slope: shot.puttSlope,
            is_penalty: shot.isPenalty,
            penalty_type: shot.penaltyType,
          }));

          const { error: shotsError } = await supabase
            .from('golf_shots')
            .insert(shotsData);

          if (shotsError) {
            console.error('Error saving shots for hole', hole.holeNumber, shotsError);
          }
        }
      }
    }

    revalidatePath('/golf/dashboard/rounds');

    return { success: true, data: { roundId } };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save round'
    };
  }
}

/**
 * Get all in-progress rounds for current player
 */
export async function getInProgressRounds(): Promise<ActionResult<InProgressRound[]>> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in' };
    }

    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!player) {
      return { success: false, error: 'Player profile not found' };
    }

    const { data: rounds, error } = await supabase
      .from('golf_rounds')
      .select(`
        id,
        course_name,
        round_date,
        round_type,
        current_hole,
        holes_to_play,
        created_at,
        updated_at
      `)
      .eq('player_id', player.id)
      .eq('status', 'in_progress')
      .order('updated_at', { ascending: false });

    if (error) {
      return { success: false, error: 'Failed to fetch rounds' };
    }

    return { success: true, data: rounds || [] };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch rounds'
    };
  }
}

/**
 * Load an in-progress round with all data
 */
export async function loadInProgressRound(roundId: string): Promise<ActionResult<FullRoundData>> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in' };
    }

    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!player) {
      return { success: false, error: 'Player profile not found' };
    }

    // Get round data
    const { data: round, error: roundError } = await supabase
      .from('golf_rounds')
      .select('*')
      .eq('id', roundId)
      .eq('player_id', player.id)
      .eq('status', 'in_progress')
      .single();

    if (roundError || !round) {
      return { success: false, error: 'Round not found' };
    }

    // Get holes with shots
    const { data: holes, error: holesError } = await supabase
      .from('golf_holes')
      .select(`
        *,
        shots:golf_shots(*)
      `)
      .eq('round_id', roundId)
      .order('hole_number', { ascending: true });

    if (holesError) {
      // Continue with empty holes array - round data is still valid
    }

    return {
      success: true,
      data: {
        round: round as unknown as RoundRecord,
        holes: (holes || []) as unknown as HoleWithShots[],
      }
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load round'
    };
  }
}

/**
 * Delete an in-progress round
 */
export async function deleteInProgressRound(roundId: string): Promise<ActionResult<void>> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in' };
    }

    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!player) {
      return { success: false, error: 'Player profile not found' };
    }

    // Delete the round (cascades to holes and shots)
    const { error } = await supabase
      .from('golf_rounds')
      .delete()
      .eq('id', roundId)
      .eq('player_id', player.id)
      .eq('status', 'in_progress');

    if (error) {
      return { success: false, error: 'Failed to delete round' };
    }

    revalidatePath('/golf/dashboard/rounds');

    return { success: true, data: undefined };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete round'
    };
  }
}
