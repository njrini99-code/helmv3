'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import type { HoleStats, ShotRecord } from '@/components/golf/ShotTrackingComprehensive';
import { z } from 'zod';
import {
  requireGolfCoach,
  verifyGolfTeamOwnership,
  AuthorizationError,
  NotFoundError
} from '@/lib/auth/ownership';
import { roundTypeToDb } from '@/lib/golf/round-type-utils';
import { formatSafeErrorResponse } from '@/lib/validation/server-action-validator';
import type { RSVPStatus } from '@/lib/calendar/rsvp';
import { invalidateOnRoundComplete } from '@/lib/cache/golf-stats-calculator';
import { triggerPlayerInsightsAfterRound } from '@/app/golf/actions/insights';
import { generateRoundReview } from '@/app/golf/actions/round-reviews';

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

// Golf event types: 'practice' | 'tournament' | 'qualifier' | 'meeting' | 'travel' | 'other' | 'class'

/**
 * Golf event insert data
 * Note: Maps to the actual golf_events table which uses:
 * - start_time (required string) as the primary date/time field
 * - team_id (required string)
 * - event_type (required string)
 * - title (required string)
 */
interface GolfEventInsertData {
  team_id: string;
  title: string;
  event_type: string;
  start_time: string;
  end_time?: string | null;
  all_day?: boolean | null;
  location?: string | null;
  description?: string | null;
  created_by?: string | null;
  status?: string | null;
  // Fields that might not exist in schema but we want to track
  [key: string]: unknown;
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
  notification_type: string;
  title: string | null;
  message: string | null;
  sent_at: string | null;
  read_at: string | null;
  action_url: string | null;
  created_at: string | null;
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
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  is_recurring: boolean | null;
  reason: string | null;
  recurrence_rule: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** In-progress round summary */
export interface InProgressRound {
  id: string;
  course_name: string | null;
  round_date: string;
  round_type: string | null;
  current_hole: number | null;
  holes_played: number | null;
  created_at: string | null;
  updated_at: string | null;
}

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
  score: number | null;
  putts: number | null;
  fairway_hit: boolean | null;
  penalty_strokes: number | null;
  gir: boolean | null;
  sand_save: boolean | null;
  up_and_down: boolean | null;
  notes: string | null;
  shots: ShotData[];
}

/** Round record from golf_rounds table */
interface RoundRecord {
  id: string;
  player_id: string;
  team_id: string | null;
  course_id: string | null;
  course_name: string;
  course_city: string | null;
  course_state: string | null;
  round_date: string;
  round_type: string | null;
  holes_played: number | null;
  current_hole: number | null;
  status: string | null;
  course_rating: number | null;
  course_slope: number | null;
  tees_played: string | null;
  total_score: number | null;
  score_to_par: number | null;
  total_putts: number | null;
  total_fairways_hit: number | null;
  total_fairways: number | null;
  total_gir: number | null;
  total_gir_possible: number | null;
  front_nine: number | null;
  back_nine: number | null;
  notes: string | null;
  weather_conditions: string | null;
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
  courseId: z.string().uuid().optional(),
  spotsAvailable: z.number().int().min(1).optional(),
  entryDeadline: z.string().optional(),
  rules: z.string().max(5000).optional(),
  startDate: z.string(),
  endDate: z.string().optional(),
  playerIds: z.array(z.string().uuid()),
});

const announcementSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
  urgency: z.enum(['low', 'normal', 'high', 'urgent']),
  requiresAcknowledgement: z.boolean(),
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Helper to get team_id for a coach (since golf_coaches doesn't have team_id column)
 * Looks up via organization_id -> golf_teams
 */
async function getCoachTeamId(
  supabase: SupabaseClient,
  organizationId: string | null
): Promise<string | null> {
  if (!organizationId) return null;

  const { data: team } = await supabase
    .from('golf_teams')
    .select('id')
    .eq('organization_id', organizationId)
    .maybeSingle();

  return team?.id ?? null;
}

/**
 * Helper to get team_id for a player (since golf_players doesn't have team_id column)
 * Looks up via golf_team_members
 */
async function getPlayerTeamId(
  supabase: SupabaseClient,
  playerId: string
): Promise<string | null> {
  const { data: membership } = await supabase
    .from('golf_team_members')
    .select('team_id')
    .eq('player_id', playerId)
    .eq('status', 'active')
    .maybeSingle();

  return membership?.team_id ?? null;
}

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
  // Qualifier-specific fields
  qualifierId?: string;
  qualifierRoundNumber?: number;
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
  courseId?: string;
  spotsAvailable?: number;
  entryDeadline?: string;
  rules?: string;
  startDate: string;
  endDate?: string;
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
  lie_after: string | null;
  distance_to_hole_before: number;
  distance_unit_before: string;
  result: string;
  distance_to_hole_after: number | null;
  distance_unit_after: string | null;
  shot_distance: number | null;
  miss_direction: string | null;
  putt_break: string | null;
  putt_slope: string | null;
  putt_distance_feet: number | null;
  putt_made: boolean | null;
  is_penalty: boolean;
  penalty_type: string | null;
}

function deriveLieAfterFromResult(result: string | null | undefined): string | null {
  if (!result) return null;
  switch (result) {
    case 'fairway':
      return 'fairway';
    case 'rough':
      return 'rough';
    case 'sand':
      return 'sand';
    case 'green':
    case 'hole':
      return 'green';
    case 'penalty':
      return 'penalty';
    case 'other':
      return 'recovery';
    default:
      return null;
  }
}

function normalizeApproachMissLieType(
  lieType: ShotRecord['approachMissLieType']
): string | null {
  if (!lieType) return null;
  if (lieType === 'bunker') return 'sand';
  if (lieType === 'hazard') return 'recovery';
  return lieType;
}

function deriveLieAfter(shot: ShotRecord): string | null {
  if (shot.isPenalty || shot.result === 'penalty') return 'penalty';
  const approachLie = normalizeApproachMissLieType(shot.approachMissLieType);
  if (approachLie) return approachLie;
  return deriveLieAfterFromResult(shot.result);
}

function derivePuttDistanceFeet(shot: ShotRecord): number | null {
  if (shot.shotType !== 'putting') return null;
  if (shot.puttDistanceFeet !== undefined) return shot.puttDistanceFeet ?? null;
  const distance = shot.distanceToHoleBefore;
  if (!Number.isFinite(distance)) return null;
  return shot.distanceUnitBefore === 'yards' ? distance * 3 : distance;
}

function derivePuttMade(shot: ShotRecord): boolean | null {
  if (shot.shotType !== 'putting') return null;
  return shot.result === 'hole';
}

/**
 * Calculate GIR (Green in Regulation) from shot data
 * GIR = reaching the green in (par - 2) strokes or fewer
 * Par 3: 1 shot, Par 4: 2 shots, Par 5: 3 shots
 */
function calculateGirFromShots(
  shots: Array<{ shotNumber: number; result: string | null }>,
  par: number
): boolean {
  const greenHitResults = ['green', 'gir', 'hole'];
  const shotToGreen = shots.find(s =>
    greenHitResults.includes((s.result || '').toLowerCase())
  );

  if (!shotToGreen) return false;

  // GIR means reaching green in (par - 2) strokes or fewer
  return shotToGreen.shotNumber <= (par - 2);
}

type GolfEventUpdateData = {
  updated_at: string;
  title?: string;
  event_type?: 'practice' | 'tournament' | 'qualifier' | 'meeting' | 'travel' | 'other';
  start_time?: string;
  end_time?: string | null;
  all_day?: boolean;
  location?: string;
  description?: string;
  requires_rsvp?: boolean;
  rsvp_deadline?: string | null;
  max_attendees?: number | null;
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

    // Calculate round totals from holes (schema-aligned)
    const totalScore = data.holes.reduce((sum, h) => sum + h.score, 0);
    const totalPar = data.holes.reduce((sum, h) => sum + h.par, 0);
    const totalToPar = totalScore - totalPar;
    const totalPutts = data.holes.reduce((sum, h) => sum + h.putts, 0);
    const fairwaysHit = data.holes.filter(h => h.fairwayHit === true).length;
    const fairwaysTotal = data.holes.filter(h => h.par >= 4).length;
    // Server-calculate GIR from shot data for accuracy
    const greensInReg = data.holes.filter(h => calculateGirFromShots(h.shots, h.par)).length;

    // Calculate front nine / back nine splits
    const frontNineHoles = data.holes.filter(h => h.holeNumber <= 9);
    const backNineHoles = data.holes.filter(h => h.holeNumber > 9);
    const frontNine = frontNineHoles.length > 0 ? frontNineHoles.reduce((sum, h) => sum + h.score, 0) : null;
    const backNine = backNineHoles.length > 0 ? backNineHoles.reduce((sum, h) => sum + h.score, 0) : null;

    // Convert frontend round type to database format
    const roundTypeDb = roundTypeToDb(data.roundType);

    // Prepare round data
    const teamId = await getPlayerTeamId(supabase, player.id);
    const roundData = {
      player_id: player.id,
      team_id: teamId,
      course_id: data.courseId || null,
      course_name: data.courseName,
      course_city: data.courseCity || null,
      course_state: data.courseState || null,
      course_rating: data.courseRating || null,
      course_slope: data.courseSlope || null,
      tees_played: data.teesPlayed || null,
      round_type: roundTypeDb,
      round_date: data.roundDate,
      holes_played: data.holes.length,
      total_score: totalScore,
      score_to_par: totalToPar,
      total_putts: totalPutts,
      total_fairways_hit: fairwaysHit,
      total_fairways: fairwaysTotal,
      total_gir: greensInReg,
      total_gir_possible: data.holes.length,
      front_nine: frontNine,
      back_nine: backNine,
      status: 'completed' as const, // Mark as completed when all holes are done
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

    // Insert holes (schema-aligned)
    const holesData = data.holes.map(hole => ({
      round_id: round.id,
      hole_number: hole.holeNumber,
      par: hole.par,
      score: hole.score,
      putts: hole.putts,
      fairway_hit: hole.fairwayHit ?? null,
      gir: calculateGirFromShots(hole.shots, hole.par),
      penalty_strokes: hole.penaltyStrokes ?? null,
      up_and_down: hole.scrambleAttempt ? hole.scrambleMade : null,
      sand_save: hole.sandSaveAttempt ? hole.sandSaveMade : null,
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
          lie_after: deriveLieAfter(shot),
          distance_to_hole_before: shot.distanceToHoleBefore,
          distance_unit_before: shot.distanceUnitBefore,
          result: shot.result,
          distance_to_hole_after: shot.distanceToHoleAfter,
          distance_unit_after: shot.distanceUnitAfter,
          shot_distance: shot.shotDistance,
          miss_direction: shot.missDirection || null,
          putt_break: shot.puttBreak || null,
          putt_slope: shot.puttSlope || null,
          putt_distance_feet: derivePuttDistanceFeet(shot),
          putt_made: derivePuttMade(shot),
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

        // Insert putt details (table may not be in types)
        if (puttDetails.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from('putt_details').insert(puttDetails);
        }

        // Insert approach miss details (table may not be in types)
        if (approachMissDetails.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from('approach_miss_details').insert(approachMissDetails);
        }
      }
    }

    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/rounds');
    revalidatePath('/golf/dashboard/stats');

    // Invalidate stats cache for instant dashboard updates
    // This triggers the database cache to be refreshed
    await invalidateOnRoundComplete(player.id, round.id);

    // Fire-and-forget: trigger CoachHelm insight generation for this player
    triggerPlayerInsightsAfterRound(player.id).catch((err) => {
      console.error('[CoachHelm] Post-round insight trigger failed:', err);
    });

    // Fire-and-forget: start AI round review generation in the background
    // The review page also has lazy generation as a fallback, but starting
    // it here means it's likely ready by the time the player navigates there.
    generateRoundReview(round.id).catch((err) => {
      console.error('[CoachHelm] Post-round review generation failed:', err);
    });

    return { success: true, data: { roundId: round.id } };

  } catch (error) {
    console.error('[Golf Action Error]', error);
    return formatSafeErrorResponse(error);
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

  // Convert frontend round type to database format
  const roundTypeDb = roundTypeToDb(validatedData.roundType);
  const teamId = await getPlayerTeamId(supabase, player.id);

  // Insert round
  const { data: round, error: roundError } = await supabase
    .from('golf_rounds')
    .insert({
      player_id: player.id,
      course_name: validatedData.courseName,
      course_city: validatedData.courseCity || null,
      course_state: validatedData.courseState || null,
      course_rating: validatedData.courseRating || null,
      course_slope: validatedData.courseSlope || null,
      tees_played: validatedData.teesPlayed || null,
      team_id: teamId,
      course_id: validatedData.courseId || null,
      round_type: roundTypeDb,
      round_date: validatedData.roundDate,
      total_score: totalScore,
      score_to_par: totalToPar,
      total_putts: totalPutts,
      total_fairways_hit: fairwaysHit,
      total_fairways: fairwaysTotal,
      total_gir: greensInReg,
      total_gir_possible: validatedData.holes.length,
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
      putts: hole.putts || null,
      fairway_hit: hole.fairwayHit || null,
      gir: hole.greenInRegulation || null,
      penalty_strokes: hole.penalties || null,
      notes: hole.notes || null,
      up_and_down: null,
      sand_save: null,
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

    // Invalidate stats cache for instant dashboard updates
    await invalidateOnRoundComplete(player.id, round.id);

    // Fire-and-forget: trigger CoachHelm insight generation
    triggerPlayerInsightsAfterRound(player.id).catch((err) => {
      console.error('[CoachHelm] Post-round insight trigger failed:', err);
    });

    // Fire-and-forget: start AI round review generation
    generateRoundReview(round.id).catch((err) => {
      console.error('[CoachHelm] Post-round review generation failed:', err);
    });

    return { success: true, data: { roundId: round.id } };

  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid round data. Please check your inputs.' };
    }
    console.error('[Golf Action Error]', error);
    return formatSafeErrorResponse(error);
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

    // Invalidate stats cache when round is deleted
    await invalidateOnRoundComplete(round.player_id, roundId);

    return { success: true, data: undefined };

  } catch (error) {
    console.error('Unexpected error in golf action:', error);
    return {
      success: false,
      error: 'An unexpected error occurred'
    };
  }
}

/**
 * Verify a golf round (coach only)
 * Sets is_verified=true, verified_by=coach.id, verified_at=NOW()
 */
export async function verifyRound(roundId: string): Promise<ActionResult<void>> {
  try {
    const { supabase, coach } = await requireGolfCoach();

    if (!coach.team_id) {
      return { success: false, error: 'Coach is not associated with a team' };
    }

    // Get the round and verify it belongs to a player on the coach's team
    const { data: round, error: roundError } = await supabase
      .from('golf_rounds')
      .select('id, player_id')
      .eq('id', roundId)
      .single();

    if (roundError || !round) {
      return { success: false, error: 'Round not found' };
    }

    // Verify the player is on the coach's team
    const { data: membership, error: membershipError } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .eq('player_id', round.player_id)
      .eq('team_id', coach.team_id)
      .maybeSingle();

    if (membershipError || !membership) {
      return { success: false, error: 'You can only verify rounds for players on your team' };
    }

    // Update the round with verification info
    // Note: is_verified, verified_by, verified_at columns exist in DB (see migration 021)
    // but may not be in generated types yet. Using type assertion as workaround.
    const { error: updateError } = await supabase
      .from('golf_rounds')
      .update({
        is_verified: true,
        verified_by: coach.id,
        verified_at: new Date().toISOString(),
      } as Record<string, unknown>)
      .eq('id', roundId);

    if (updateError) {
      console.error('[verifyRound Error]', updateError);
      return { success: false, error: 'Failed to verify round. Please try again.' };
    }

    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/rounds');
    revalidatePath(`/golf/dashboard/rounds/${roundId}`);

    return { success: true, data: undefined };

  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { success: false, error: error.message };
    }
    console.error('Unexpected error in verifyRound:', error);
    return { success: false, error: 'An unexpected error occurred' };
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
    // Note: golf_coaches doesn't have team_id - we look it up via organization_id
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    // If not a coach, try to get player profile
    let teamId: string | null = null;
    let createdBy: string | null = null;

    if (coach) {
      // Coach - get team_id via organization
      teamId = await getCoachTeamId(supabase, coach.organization_id);
      if (!teamId) {
        return { success: false, error: 'Coach not assigned to a team' };
      }
      createdBy = coach.id;
    } else {
      // Players cannot create team events (RLS policy restricts INSERT to coaches only)
      return { success: false, error: 'Only coaches can create team events' };
    }

    // Build insert data matching the actual golf_events table schema
    // Note: golf_events uses start_time as the primary datetime field (not start_date)
    const insertData: GolfEventInsertData = {
      team_id: teamId,
      title: validatedData.title,
      event_type: validatedData.eventType,
      // Use startDate as start_time if no specific time provided
      start_time: validatedData.startTime
        ? `${validatedData.startDate}T${validatedData.startTime}`
        : validatedData.startDate,
      end_time: validatedData.endTime
        ? `${validatedData.endDate || validatedData.startDate}T${validatedData.endTime}`
        : validatedData.endDate || null,
      all_day: validatedData.allDay ?? true,
      location: validatedData.location || null,
      description: validatedData.description || null,
    };

    // Only add created_by if it's not null (coaches only)
    if (createdBy) {
      insertData.created_by = createdBy;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: event, error } = await (supabase as any)
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
      } catch (inviteError) {
        // Don't fail the whole operation if invitations fail
        console.error('Failed to send event invitations:', inviteError);
      }
    }

    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/calendar');

    return { success: true, data: { eventId: event.id } };

  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid event data. Please check your inputs.' };
    }
    console.error('[Golf Action Error]', error);
    return formatSafeErrorResponse(error);
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
  description: z.string().max(5000).optional(),
  requiresRsvp: z.boolean().optional(),
  rsvpDeadline: z.string().optional(),
  maxAttendees: z.number().int().optional(),
  attendeeIds: z.array(z.string()).optional(),
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
    // Note: golf_coaches doesn't have team_id - we look it up via organization_id
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    // If not a coach, try to get player profile
    let teamId: string | null = null;

    if (coach) {
      teamId = await getCoachTeamId(supabase, coach.organization_id);
      if (!teamId) {
        return { success: false, error: 'Coach not assigned to a team' };
      }
    } else {
      // Note: golf_players doesn't have team_id - we look it up via golf_team_members
      const { data: player } = await supabase
        .from('golf_players')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!player) {
        return { success: false, error: 'User profile not found' };
      }

      // For players, team_id is optional
      teamId = await getPlayerTeamId(supabase, player.id);
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
    // Combine date+time into start_time/end_time timestamptz (matching createGolfEvent pattern)
    if (validatedData.startDate) {
      updateData.start_time = validatedData.startTime
        ? `${validatedData.startDate}T${validatedData.startTime}`
        : validatedData.startDate;
    }
    if (validatedData.endDate || validatedData.endTime) {
      const endDate = validatedData.endDate || validatedData.startDate;
      updateData.end_time = validatedData.endTime && endDate
        ? `${endDate}T${validatedData.endTime}`
        : endDate || null;
    }
    if (validatedData.allDay !== undefined) updateData.all_day = validatedData.allDay;
    if (validatedData.location) updateData.location = validatedData.location;
    if (validatedData.description) updateData.description = validatedData.description;
    if (validatedData.requiresRsvp !== undefined) updateData.requires_rsvp = validatedData.requiresRsvp;
    if (validatedData.rsvpDeadline !== undefined) updateData.rsvp_deadline = validatedData.rsvpDeadline || null;
    if (validatedData.maxAttendees !== undefined) updateData.max_attendees = validatedData.maxAttendees;

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

    if (validatedData.attendeeIds) {
      const { data: attendanceRows } = await supabase
        .from('golf_event_attendance')
        .select('player_id')
        .eq('event_id', eventId);

      const existingIds = new Set((attendanceRows || []).map(row => row.player_id));
      const nextIds = new Set(validatedData.attendeeIds);
      const toAdd = validatedData.attendeeIds.filter((id) => !existingIds.has(id));
      const toRemove = Array.from(existingIds).filter((id) => !nextIds.has(id));

      if (toAdd.length > 0) {
        try {
          const { sendEventInvitations } = await import('@/lib/calendar/rsvp');
          await sendEventInvitations(eventId, toAdd, supabase);
        } catch (inviteError) {
          // Don't fail the whole update if invitations fail
          console.error('Failed to send event invitations:', inviteError);
        }
      }

      if (toRemove.length > 0) {
        await supabase
          .from('golf_event_attendance')
          .delete()
          .eq('event_id', eventId)
          .in('player_id', toRemove);
      }
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
    // Note: golf_coaches doesn't have team_id - we look it up via organization_id
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    // If not a coach, try to get player profile
    let teamId: string | null = null;

    if (coach) {
      teamId = await getCoachTeamId(supabase, coach.organization_id);
      if (!teamId) {
        return { success: false, error: 'Coach not assigned to a team' };
      }
    } else {
      // Note: golf_players doesn't have team_id - we look it up via golf_team_members
      const { data: player } = await supabase
        .from('golf_players')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!player) {
        return { success: false, error: 'User profile not found' };
      }

      // For players, team_id is optional
      teamId = await getPlayerTeamId(supabase, player.id);
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

  } catch (error) {
    console.error('Unexpected error in golf action:', error);
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

    // Get coach with organization_id
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (!coach?.organization_id) {
      return { success: false, error: 'Coach profile not found' };
    }

    // Look up team via organization
    const { data: orgTeam } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('organization_id', coach.organization_id)
      .maybeSingle();

    if (!orgTeam?.id) {
      return { success: false, error: 'Team not found for your organization' };
    }

    // Create qualifier
    const { data: qualifier, error: qualifierError } = await supabase
      .from('golf_qualifiers')
      .insert({
        team_id: orgTeam.id,
        name: validatedData.name,
        description: validatedData.description || null,
        course_name: validatedData.courseName || null,
        course_id: validatedData.courseId || null,
        spots_available: validatedData.spotsAvailable || null,
        entry_deadline: validatedData.entryDeadline || null,
        rules: validatedData.rules || null,
        start_date: validatedData.startDate,
        end_date: validatedData.endDate || null,
        status: 'upcoming',
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
        status: 'registered',
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
    console.error('[Golf Action Error]', error);
    return formatSafeErrorResponse(error);
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
    console.error('[Golf Action Error]', error);
    return formatSafeErrorResponse(error);
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
    // Note: golf_coaches doesn't have team_id - we look it up via organization_id
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Coach profile not found' };
    }

    const teamId = await getCoachTeamId(supabase, coach.organization_id);
    if (!teamId) {
      return { success: false, error: 'Coach not assigned to a team' };
    }

    const { data: announcement, error } = await supabase
      .from('golf_announcements')
      .insert({
        team_id: teamId,
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
    console.error('[Golf Action Error]', error);
    return formatSafeErrorResponse(error);
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
    // Note: golf_coaches doesn't have team_id - we look it up via organization_id
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Coach profile not found' };
    }

    const teamId = await getCoachTeamId(supabase, coach.organization_id);
    if (!teamId) {
      return { success: false, error: 'Coach not assigned to a team' };
    }

    // Get team - uses join_code column, not invite_code
    const { data: team } = await supabase
      .from('golf_teams')
      .select('name, join_code')
      .eq('id', teamId)
      .single();

    // Generate join code if not exists or is placeholder
    // Uses 8-char readable format (no confusing chars like 0/O, 1/I/L)
    let joinCode = team?.join_code;
    if (!joinCode || joinCode.length < 6) {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      joinCode = '';
      for (let i = 0; i < 8; i++) {
        joinCode += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const { error: updateError } = await supabase
        .from('golf_teams')
        .update({ join_code: joinCode })
        .eq('id', teamId);

      if (updateError) {
        return { success: false, error: 'Failed to generate invite code. Please try again.' };
      }
    }

    return {
      success: true,
      data: {
        inviteCode: joinCode,
        inviteLink: `/golf/join/${joinCode}`,
      },
    };

  } catch (error) {
    console.error('[Golf Action Error]', error);
    return formatSafeErrorResponse(error);
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

    // Verify ownership - checks golf_team_members for player-team relationship
    await verifyGolfTeamOwnership(supabase, playerId, coach.team_id, 'golf_players');

    // Update status on golf_team_members
    // NOTE: The golf_team_members.status column uses a CHECK constraint allowing:
    // 'active', 'inactive', 'injured', 'redshirt' (see migration 042_sport_specific_messaging_tables.sql)
    // The TypeScript types show team_member_status enum which is different, so we cast here.
    const { error } = await supabase
      .from('golf_team_members')
      .update({
        // Cast to unknown first to bypass strict enum typing - the actual DB constraint
        // supports all four player status values via CHECK constraint
        status: status as unknown as 'active' | 'inactive',
        updated_at: new Date().toISOString()
      })
      .eq('player_id', playerId)
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

  } catch (error) {
    console.error('Failed to update RSVP:', error);
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

  } catch (error) {
    console.error('Failed to check conflicts:', error);
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

  } catch (error) {
    console.error('Failed to get availability:', error);
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

  } catch (error) {
    console.error('Failed to get availability:', error);
    return { success: false, error: 'Failed to get availability' };
  }
}

/**
 * Get all calendar notifications for the current user
 * Note: golf_calendar_notifications table may not be in types
 */
export async function getNotifications(limit: number = 50): Promise<ActionResult<CalendarNotification[]>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('golf_calendar_notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return { success: false, error: 'Failed to fetch notifications' };
    }

    return { success: true, data: (data || []) as CalendarNotification[] };

  } catch (error) {
    console.error('Failed to fetch notifications:', error);
    return { success: false, error: 'Failed to fetch notifications' };
  }
}

/**
 * Mark a notification as read
 * Note: golf_calendar_notifications table may not be in types
 */
export async function markNotificationRead(
  notificationId: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('golf_calendar_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId);

    revalidatePath('/golf/dashboard');
    return { success: true, data: undefined };

  } catch (error) {
    console.error('Failed to mark notification read:', error);
    return { success: false, error: 'Failed to mark notification read' };
  }
}

/**
 * Mark all notifications as read for the current user
 * Note: golf_calendar_notifications table may not be in types
 */
export async function markAllNotificationsRead(): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('golf_calendar_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('read_at', null);

    revalidatePath('/golf/dashboard');
    return { success: true, data: undefined };

  } catch (error) {
    console.error('Failed to mark notifications read:', error);
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

  } catch (error) {
    console.error('Failed to fetch invitations:', error);
    return { success: false, error: 'Failed to fetch invitations' };
  }
}

/**
 * Get the current player's RSVP status for an event
 */
export async function getPlayerEventRSVP(
  eventId: string
): Promise<ActionResult<{ status: RSVPStatus; respondedAt: string | null } | null>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!player) {
      return { success: false, error: 'Player profile not found' };
    }

    // Note: golf_event_attendance uses rsvp_at, not responded_at
    const { data: attendance } = await supabase
      .from('golf_event_attendance')
      .select('status, rsvp_at')
      .eq('event_id', eventId)
      .eq('player_id', player.id)
      .maybeSingle();

    if (!attendance) {
      return { success: true, data: null };
    }

    return {
      success: true,
      data: {
        status: (attendance.status ?? 'pending') as RSVPStatus,
        respondedAt: attendance.rsvp_at ?? null,
      },
    };
  } catch (error) {
    console.error('Failed to fetch RSVP status:', error);
    return { success: false, error: 'Failed to fetch RSVP status' };
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

  } catch (error) {
    console.error('Failed to fetch RSVP data:', error);
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
    console.error('[Golf Action Error]', error);
    return formatSafeErrorResponse(error);
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
    console.error('[Golf Action Error]', error);
    return formatSafeErrorResponse(error);
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
    console.error('[Golf Action Error]', error);
    return formatSafeErrorResponse(error);
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
    console.error('[Golf Action Error]', error);
    return formatSafeErrorResponse(error);
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
  qualifierId?: string;
  // Progress tracking
  currentHole: number;
  holesToPlay: number; // 9 or 18
  // Completed holes data
  holes: HoleStats[];
  // In-progress holes with recorded shots
  inProgressShots?: Array<{
    holeNumber: number;
    shots: ShotRecord[];
  }>;
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
    const teamId = await getPlayerTeamId(supabase, player.id);

    const roundData = {
      player_id: player.id,
      team_id: teamId,
      course_id: data.courseId || null,
      course_name: data.courseName,
      course_city: data.courseCity || null,
      course_state: data.courseState || null,
      course_rating: data.courseRating || null,
      course_slope: data.courseSlope || null,
      tees_played: data.teesPlayed || null,
      round_type: roundTypeDb,
      round_date: data.roundDate,
      status: 'in_progress' as const,
      current_hole: data.currentHole || null,
      holes_played: data.holesToPlay || 18,
      // Leave stats null for incomplete rounds
      total_score: null,
      score_to_par: null,
      total_putts: null,
      total_fairways_hit: null,
      total_fairways: null,
      total_gir: null,
      total_gir_possible: null,
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
            score: completed.score,
            putts: completed.putts,
            fairway_hit: completed.fairwayHit ?? null,
            gir: completed.greenInRegulation ?? null,
            penalty_strokes: completed.penaltyStrokes ?? null,
            up_and_down: completed.scrambleAttempt ? completed.scrambleMade : null,
            sand_save: completed.sandSaveAttempt ? completed.sandSaveMade : null,
            notes: null,
          };
        }

        return {
          round_id: roundId,
          hole_number: config.holeNumber,
          par: config.par,
          score: null,
          putts: null,
          fairway_hit: null,
          gir: null,
          penalty_strokes: null,
          up_and_down: null,
          sand_save: null,
          notes: null,
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
        const holesWithShotsByNumber = new Map<number, ShotRecord[]>();

        for (const hole of data.holes) {
          if (hole.shots && hole.shots.length > 0) {
            holesWithShotsByNumber.set(hole.holeNumber, hole.shots);
          }
        }

        for (const hole of data.inProgressShots || []) {
          if (hole.shots.length === 0) {
            continue;
          }
          if (!holesWithShotsByNumber.has(hole.holeNumber)) {
            holesWithShotsByNumber.set(hole.holeNumber, hole.shots);
          }
        }

        for (const [holeNumber, shots] of holesWithShotsByNumber) {
          const holeId = holeIdMap.get(holeNumber);
          if (!holeId) {
            // If hole doesn't exist in map, skip (shouldn't happen, but safety check)
            continue;
          }

          const shotsData = shots.map(shot => ({
            round_id: roundId,
            hole_id: holeId,
            hole_number: holeNumber,
            shot_number: shot.shotNumber,
            shot_type: shot.shotType,
            club_type: shot.clubType,
            lie_before: shot.lieBefore,
            lie_after: deriveLieAfter(shot),
            distance_to_hole_before: shot.distanceToHoleBefore,
            distance_unit_before: shot.distanceUnitBefore,
            result: shot.result,
            distance_to_hole_after: shot.distanceToHoleAfter,
            distance_unit_after: shot.distanceUnitAfter,
            shot_distance: shot.shotDistance,
            miss_direction: shot.missDirection,
            putt_break: shot.puttBreak,
            putt_slope: shot.puttSlope,
            putt_distance_feet: derivePuttDistanceFeet(shot),
            putt_made: derivePuttMade(shot),
            is_penalty: shot.isPenalty,
            penalty_type: shot.penaltyType,
          }));

          const { error: shotsError } = await supabase
            .from('golf_shots')
            .insert(shotsData);

          if (shotsError) {
            // Shot saving failed - continue with other holes
          }
        }
      }
    }

    // If this is a qualifier round, update the qualifier entry stats
    if (data.qualifierId) {
      await updateQualifierEntryStats(supabase, data.qualifierId, player.id);
      revalidatePath(`/golf/dashboard/qualifiers/${data.qualifierId}`);
    }

    revalidatePath('/golf/dashboard/rounds');

    return { success: true, data: { roundId } };

  } catch (err) {
    console.error('[GolfHelm] Failed to save round:', err);
    return {
      success: false,
      error: 'Failed to save round. Please try again.'
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
        holes_played,
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

  } catch (err) {
    console.error('[GolfHelm] Failed to fetch in-progress rounds:', err);
    return {
      success: false,
      error: 'Failed to fetch rounds. Please try again.'
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

  } catch (err) {
    console.error('[GolfHelm] Failed to load in-progress round:', err);
    return {
      success: false,
      error: 'Failed to load round. Please try again.'
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

  } catch (err) {
    console.error('[GolfHelm] Failed to delete in-progress round:', err);
    return {
      success: false,
      error: 'Failed to delete round. Please try again.'
    };
  }
}

// ============================================================================
// QUALIFIER ACTIONS (PLAYER)
// ============================================================================

/** Qualifier info with player's progress */
export interface PlayerQualifierInfo {
  id: string;
  name: string;
  description: string | null;
  courseName: string | null;
  location: string | null;
  numRounds: number;
  holesPerRound: number;
  startDate: string;
  endDate: string | null;
  status: 'upcoming' | 'in_progress' | 'completed';
  showLiveLeaderboard: boolean;
  // Player's progress
  roundsCompleted: number;
  completedRoundNumbers: number[];
  totalScore: number | null;
  totalToPar: number | null;
}

/**
 * Get all qualifiers the current player is entered in
 * Returns qualifier info along with player's round completion status
 */
export async function getPlayerQualifiers(): Promise<ActionResult<PlayerQualifierInfo[]>> {
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

    // Get all qualifier entries for this player
    const { data: entries, error: entriesError } = await supabase
      .from('golf_qualifier_entries')
      .select(`
        qualifier_id,
        qualifier:golf_qualifiers(
          id,
          name,
          description,
          course_name,
          location,
          num_rounds,
          holes_per_round,
          start_date,
          end_date,
          status,
          show_live_leaderboard
        )
      `)
      .eq('player_id', player.id);

    // If query error or no entries, return empty array (not an error state)
    if (entriesError || !entries || entries.length === 0) {
      return { success: true, data: [] };
    }

    // Get all qualifier rounds for this player
    const qualifierIds = entries.map(e => e.qualifier_id);
    const roundsResult = await supabase
      .from('golf_rounds')
      .select('qualifier_id, qualifier_round_number, total_score, score_to_par')
      .eq('player_id', player.id)
      .in('qualifier_id', qualifierIds)
      .eq('status', 'completed');

    const rounds = (roundsResult.data as unknown) as Array<{
      qualifier_id: string | null;
      qualifier_round_number: number | null;
      total_score: number | null;
      score_to_par: number | null;
    }> | null;

    // Build result with progress info
    const qualifiers: PlayerQualifierInfo[] = (entries as any[])
      .filter((e: any) => e.qualifier && typeof e.qualifier === 'object' && !('error' in e.qualifier))
      .map((entry: any) => {
        const q = entry.qualifier as {
          id: string;
          name: string;
          description: string | null;
          course_name: string | null;
          location: string | null;
          num_rounds: number;
          holes_per_round: number;
          start_date: string;
          end_date: string | null;
          status: string;
          show_live_leaderboard: boolean | null;
        };

        // Get rounds for this qualifier
        const qualifierRounds = (rounds || []).filter((r: any) => r.qualifier_id === q.id);
        const completedRoundNumbers = qualifierRounds
          .filter((r: any) => r.qualifier_round_number !== null)
          .map((r: any) => r.qualifier_round_number as number)
          .sort((a, b) => a - b);

        const totalScore = qualifierRounds.reduce((sum: number, r: any) => sum + (r.total_score || 0), 0);
        const totalToPar = qualifierRounds.reduce((sum: number, r: any) => sum + (r.score_to_par || 0), 0);

        return {
          id: q.id,
          name: q.name,
          description: q.description,
          courseName: q.course_name,
          location: q.location,
          numRounds: q.num_rounds,
          holesPerRound: q.holes_per_round,
          startDate: q.start_date,
          endDate: q.end_date,
          status: (q.status || 'upcoming') as 'upcoming' | 'in_progress' | 'completed',
          showLiveLeaderboard: q.show_live_leaderboard ?? true,
          roundsCompleted: qualifierRounds.length,
          completedRoundNumbers,
          totalScore: qualifierRounds.length > 0 ? totalScore : null,
          totalToPar: qualifierRounds.length > 0 ? totalToPar : null,
        };
      });

    return { success: true, data: qualifiers };

  } catch (err) {
    console.error('[GolfHelm] Failed to fetch player qualifiers:', err);
    return {
      success: false,
      error: 'Failed to fetch qualifiers. Please try again.'
    };
  }
}

/**
 * Get the next available round number for a qualifier
 */
export async function getNextQualifierRoundNumber(
  qualifierId: string
): Promise<ActionResult<{ nextRoundNumber: number; availableRounds: number[] }>> {
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

    // Verify player is entered in this qualifier
    const { data: entry } = await supabase
      .from('golf_qualifier_entries')
      .select('id')
      .eq('qualifier_id', qualifierId)
      .eq('player_id', player.id)
      .single();

    if (!entry) {
      return { success: false, error: 'You are not entered in this qualifier' };
    }

    // Verify qualifier exists
    const { data: qualifier } = await supabase
      .from('golf_qualifiers')
      .select('id')
      .eq('id', qualifierId)
      .single();

    if (!qualifier) {
      return { success: false, error: 'Qualifier not found' };
    }

    // Get completed rounds for this player in this qualifier
    const completedRoundsResult = await supabase
      .from('golf_rounds')
      .select('qualifier_round_number')
      .eq('qualifier_id', qualifierId)
      .eq('player_id', player.id)
      .eq('status', 'completed');

    const completedRounds = (completedRoundsResult.data as unknown) as Array<{
      qualifier_round_number: number | null;
    }> | null;

    const completedRoundNumbers = new Set(
      (completedRounds || [])
        .filter((r) => r.qualifier_round_number !== null)
        .map((r) => r.qualifier_round_number as number)
    );

    // Calculate the next round number (max completed + 1, or 1 if none completed)
    const maxCompletedRound = completedRoundNumbers.size > 0
      ? Math.max(...completedRoundNumbers)
      : 0;
    const nextRoundNumber = maxCompletedRound + 1;

    // Available rounds start from the next round number
    const availableRounds = [nextRoundNumber];

    return {
      success: true,
      data: { nextRoundNumber, availableRounds }
    };

  } catch (err) {
    console.error('[GolfHelm] Failed to get qualifier round number:', err);
    return {
      success: false,
      error: 'Failed to get round number. Please try again.'
    };
  }
}

/**
 * Get qualifier leaderboard (accessible to both coaches and players)
 */
export interface QualifierLeaderboardEntry {
  playerId: string;
  playerName: string;
  avatarUrl: string | null;
  position: number;
  isTied: boolean;
  roundsCompleted: number;
  totalScore: number;
  totalToPar: number;
  averageScore: number;
  roundScores: Array<{
    roundNumber: number;
    score: number;
    toPar: number;
  }>;
}

export interface QualifierLeaderboardData {
  qualifier: {
    id: string;
    name: string;
    description: string | null;
    courseName: string | null;
    startDate: string;
    endDate: string | null;
    status: string;
    spotsAvailable: number | null;
    entryDeadline: string | null;
    rules: string | null;
  };
  leaderboard: QualifierLeaderboardEntry[];
  isPlayerEntered: boolean;
  currentPlayerId: string | null;
}

export async function getQualifierLeaderboard(
  qualifierId: string
): Promise<ActionResult<QualifierLeaderboardData>> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in' };
    }

    // Get qualifier details
    const { data: qualifier, error: qualifierError } = await supabase
      .from('golf_qualifiers')
      .select('*')
      .eq('id', qualifierId)
      .single();

    if (qualifierError || !qualifier) {
      return { success: false, error: 'Qualifier not found' };
    }

    // Get current player (if exists)
    const { data: currentPlayer } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    // Get all entries with player info
    const { data: entries } = await supabase
      .from('golf_qualifier_entries')
      .select(`
        player_id,
        player:golf_players(
          id,
          first_name,
          last_name,
          avatar_url
        )
      `)
      .eq('qualifier_id', qualifierId);

    if (!entries || entries.length === 0) {
      return {
        success: true,
        data: {
          qualifier: {
            id: qualifier.id,
            name: qualifier.name,
            description: qualifier.description,
            courseName: qualifier.course_name,
            startDate: qualifier.start_date,
            endDate: qualifier.end_date,
            status: qualifier.status || 'upcoming',
            spotsAvailable: qualifier.spots_available,
            entryDeadline: qualifier.entry_deadline,
            rules: qualifier.rules,
          },
          leaderboard: [],
          isPlayerEntered: false,
          currentPlayerId: currentPlayer?.id || null,
        }
      };
    }

    // Get all rounds for this qualifier
    const roundsResult = await supabase
      .from('golf_rounds')
      .select('player_id, qualifier_round_number, total_score, score_to_par')
      .eq('qualifier_id', qualifierId)
      .eq('status', 'completed');

    const rounds = (roundsResult.data as unknown) as Array<{
      player_id: string;
      qualifier_round_number: number | null;
      total_score: number | null;
      score_to_par: number | null;
    }> | null;

    // Build leaderboard
    const leaderboard: QualifierLeaderboardEntry[] = (entries as any[])
      .filter((e: any) => e.player && typeof e.player === 'object' && !('error' in e.player))
      .map((entry: any) => {
        const player = entry.player as {
          id: string;
          first_name: string;
          last_name: string;
          avatar_url: string | null;
        };

        const playerRounds = ((rounds || []) as any[])
          .filter((r: any) => r.player_id === entry.player_id)
          .sort((a: any, b: any) => (a.qualifier_round_number || 0) - (b.qualifier_round_number || 0));

        const totalScore = playerRounds.reduce((sum: number, r: any) => sum + (r.total_score || 0), 0);
        const totalToPar = playerRounds.reduce((sum: number, r: any) => sum + (r.score_to_par || 0), 0);
        const roundsCompleted = playerRounds.length;
        const averageScore = roundsCompleted > 0 ? totalScore / roundsCompleted : 0;

        const roundScores = playerRounds.map((r: any) => ({
          roundNumber: r.qualifier_round_number || 0,
          score: r.total_score || 0,
          toPar: r.score_to_par || 0,
        }));

        return {
          playerId: entry.player_id,
          playerName: `${player.first_name} ${player.last_name}`,
          avatarUrl: player.avatar_url,
          position: 0, // Will be set after sorting
          isTied: false,
          roundsCompleted,
          totalScore,
          totalToPar,
          averageScore,
          roundScores,
        };
      })
      // Sort by total score (lower is better), then by rounds completed (more is better for tie-breaking)
      .sort((a, b) => {
        if (a.totalScore !== b.totalScore) {
          return a.totalScore - b.totalScore;
        }
        return b.roundsCompleted - a.roundsCompleted;
      });

    // Assign positions and mark ties
    let currentPosition = 1;
    for (let i = 0; i < leaderboard.length; i++) {
      const entry = leaderboard[i]!;

      if (i > 0) {
        const prevEntry = leaderboard[i - 1]!;
        if (entry.totalScore === prevEntry.totalScore && entry.roundsCompleted === prevEntry.roundsCompleted) {
          entry.position = prevEntry.position;
          entry.isTied = true;
          prevEntry.isTied = true;
        } else {
          entry.position = currentPosition;
        }
      } else {
        entry.position = currentPosition;
      }
      currentPosition++;
    }

    // Check if current player is entered
    const isPlayerEntered = currentPlayer
      ? entries.some(e => e.player_id === currentPlayer.id)
      : false;

    return {
      success: true,
      data: {
        qualifier: {
          id: qualifier.id,
          name: qualifier.name,
          description: qualifier.description,
          courseName: qualifier.course_name,
          startDate: qualifier.start_date,
          endDate: qualifier.end_date,
          status: qualifier.status || 'upcoming',
          spotsAvailable: qualifier.spots_available,
          entryDeadline: qualifier.entry_deadline,
          rules: qualifier.rules,
        },
        leaderboard,
        isPlayerEntered,
        currentPlayerId: currentPlayer?.id || null,
      }
    };

  } catch (err) {
    console.error('[GolfHelm] Failed to fetch qualifier leaderboard:', err);
    return {
      success: false,
      error: 'Failed to fetch leaderboard. Please try again.'
    };
  }
}

/**
 * Update qualifier entry statistics after a round is submitted
 * This is called automatically after submitGolfRoundComprehensive
 */
async function updateQualifierEntryStats(
  supabase: Awaited<ReturnType<typeof createClient>>,
  qualifierId: string,
  playerId: string
): Promise<void> {
  try {
    // Get all completed rounds for this player in this qualifier
    const roundsResult = await supabase
      .from('golf_rounds')
      .select('total_score, score_to_par')
      .eq('qualifier_id', qualifierId)
      .eq('player_id', playerId)
      .eq('status', 'completed');

    const rounds = (roundsResult.data as unknown) as Array<{
      total_score: number | null;
      score_to_par: number | null;
    }> | null;

    if (!rounds) return;

    const totalScore = rounds.reduce((sum, r) => sum + (r.total_score || 0), 0);

    // Update the qualifier entry with the total score
    // Note: golf_qualifier_entries has only 'score' column, not 'total_score' or 'rounds_completed'
    await supabase
      .from('golf_qualifier_entries')
      .update({
        score: totalScore,
      })
      .eq('qualifier_id', qualifierId)
      .eq('player_id', playerId);

  } catch (error) {
    // Non-critical operation - log but continue
    console.error('Non-critical operation failed:', error);
  }
}

// ============================================================================
// SAVED COURSES - Player's saved course configurations
// ============================================================================

/** Hole configuration for a saved course */
export interface SavedCourseHoleConfig {
  holeNumber: number;
  par: number;
  yardage: number;
}

/** Saved course data returned to client */
export interface SavedCourse {
  id: string;
  courseName: string;
  courseCity: string | null;
  courseState: string | null;
  courseRating: number | null;
  courseSlope: number | null;
  teesPlayed: string | null;
  holesPerRound: number;
  holeConfigs: SavedCourseHoleConfig[];
  lastUsedAt: string;
  createdAt: string;
}

/** Input for saving a course configuration */
export interface SaveCourseInput {
  courseName: string;
  courseCity?: string;
  courseState?: string;
  courseRating?: number;
  courseSlope?: number;
  teesPlayed?: string;
  holesPerRound: number;
  holeConfigs: SavedCourseHoleConfig[];
}

/**
 * Get all saved courses for the current player
 * Returns courses sorted by most recently used
 */
export async function getPlayerSavedCourses(): Promise<ActionResult<SavedCourse[]>> {
  const supabase = await createClient();

  // Get the current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'You must be logged in' };
  }

  // Get the player record
  const { data: player } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!player) {
    return { success: false, error: 'Player profile not found' };
  }

  // Fetch saved courses
  const { data: courses, error } = await supabase.from('golf_player_courses')
    .select('*')
    .eq('player_id', player.id)
    .order('last_used_at', { ascending: false });

  if (error) {
    return { success: false, error: 'Failed to load saved courses' };
  }

  // Transform to client format
  const savedCourses: SavedCourse[] = ((courses as any) || []).map((course: any) => ({
    id: course.id,
    courseName: course.course_name,
    courseCity: course.course_city,
    courseState: course.course_state,
    courseRating: course.course_rating ? parseFloat(course.course_rating) : null,
    courseSlope: course.course_slope,
    teesPlayed: course.tees_played,
    holesPerRound: course.holes_per_round,
    holeConfigs: (course.hole_configs as SavedCourseHoleConfig[]) || [],
    lastUsedAt: course.last_used_at,
    createdAt: course.created_at,
  }));

  return { success: true, data: savedCourses };
}

/**
 * Save a new course configuration or update existing one
 */
export async function savePlayerCourse(input: SaveCourseInput): Promise<ActionResult<SavedCourse>> {
  const supabase = await createClient();

  // Get the current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'You must be logged in' };
  }

  // Get the player record
  const { data: player } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!player) {
    return { success: false, error: 'Player profile not found' };
  }

  // Check if course with same name already exists
  // Note: The code expects extended columns (course_city, course_state, etc.) that may not exist in all deployments
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase.from('golf_player_courses') as any)
    .select('id')
    .eq('player_id', player.id)
    .ilike('course_name', input.courseName)
    .maybeSingle();

  // Course data with extended fields - stored as JSON in notes if extended columns don't exist
  const courseData = {
    player_id: player.id,
    course_name: input.courseName,
    notes: JSON.stringify({
      city: input.courseCity,
      state: input.courseState,
      rating: input.courseRating,
      slope: input.courseSlope,
      tees: input.teesPlayed,
      holesPerRound: input.holesPerRound,
      holeConfigs: input.holeConfigs,
    }),
    last_played_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result: { data: any; error: any };
  if (existing) {
    // Update existing course
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result = await (supabase.from('golf_player_courses') as any)
      .update(courseData)
      .eq('id', existing.id)
      .select()
      .single();
  } else {
    // Insert new course
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result = await (supabase.from('golf_player_courses') as any)
      .insert(courseData)
      .select()
      .single();
  }

  if (result.error) {
    return { success: false, error: 'Failed to save course configuration' };
  }

  const course = result.data as any;
  const savedCourse: SavedCourse = {
    id: course.id,
    courseName: course.course_name,
    courseCity: course.course_city,
    courseState: course.course_state,
    courseRating: course.course_rating ? parseFloat(course.course_rating) : null,
    courseSlope: course.course_slope,
    teesPlayed: course.tees_played,
    holesPerRound: course.holes_per_round,
    holeConfigs: (course.hole_configs as SavedCourseHoleConfig[]) || [],
    lastUsedAt: course.last_used_at,
    createdAt: course.created_at,
  };

  return { success: true, data: savedCourse };
}

/**
 * Update the last_used_at timestamp for a saved course
 */
export async function touchSavedCourse(courseId: string): Promise<ActionResult<void>> {
  const supabase = await createClient();

  // Get the current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'You must be logged in' };
  }

  // Update last_used_at (RLS will ensure ownership)
  // Note: golf_player_courses table uses last_played_at instead of last_used_at
  const { error } = await supabase.from('golf_player_courses')
    .update({ last_played_at: new Date().toISOString() })
    .eq('id', courseId);

  if (error) {
    return { success: false, error: 'Failed to update course' };
  }

  return { success: true, data: undefined };
}

/**
 * Delete a saved course configuration
 */
export async function deletePlayerCourse(courseId: string): Promise<ActionResult<void>> {
  const supabase = await createClient();

  // Get the current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'You must be logged in' };
  }

  // Delete the course (RLS will ensure ownership)
  const { error } = await supabase.from('golf_player_courses')
    .delete()
    .eq('id', courseId);

  if (error) {
    return { success: false, error: 'Failed to delete course' };
  }

  return { success: true, data: undefined };
}

// ============================================================================
// SHOT MANAGEMENT ACTIONS
// ============================================================================

/**
 * Delete a specific shot from a round
 * The database trigger will automatically resequence remaining shots
 */
export async function deleteShot(shotId: string): Promise<ActionResult<void>> {
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

    // Verify ownership: Get the shot and its associated round
    const { data: shot, error: shotError } = await supabase
      .from('golf_shots')
      .select('id, round_id, hole_number')
      .eq('id', shotId)
      .single();

    if (shotError || !shot) {
      return { success: false, error: 'Shot not found' };
    }

    // Verify the round belongs to this player
    const { data: round, error: roundError } = await supabase
      .from('golf_rounds')
      .select('id, player_id')
      .eq('id', shot.round_id)
      .eq('player_id', player.id)
      .single();

    if (roundError || !round) {
      return { success: false, error: 'You do not have permission to delete this shot' };
    }

    // Delete the shot - the database trigger will resequence remaining shots
    const { error: deleteError } = await supabase
      .from('golf_shots')
      .delete()
      .eq('id', shotId);

    if (deleteError) {
      return { success: false, error: 'Failed to delete shot' };
    }

    // Revalidate relevant paths
    revalidatePath('/golf/dashboard/rounds');
    revalidatePath(`/golf/dashboard/rounds/${shot.round_id}`);

    return { success: true, data: undefined };

  } catch (error) {
    console.error('[deleteShot Error]', error);
    return formatSafeErrorResponse(error);
  }
}

/**
 * Shot data that can be updated
 */
export interface ShotUpdateData {
  shot_type?: string;
  club_type?: string;
  lie_before?: string;
  lie_after?: string | null;
  distance_to_hole_before?: number;
  distance_unit_before?: string;
  result?: string;
  distance_to_hole_after?: number;
  distance_unit_after?: string;
  shot_distance?: number;
  miss_direction?: string | null;
  putt_break?: string | null;
  putt_slope?: string | null;
  putt_distance_feet?: number | null;
  putt_made?: boolean | null;
  is_penalty?: boolean;
  penalty_type?: string | null;
}

/**
 * Update a specific shot in a round
 */
export async function updateShot(
  shotId: string,
  data: ShotUpdateData
): Promise<ActionResult<void>> {
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

    // Verify ownership: Get the shot and its associated round
    const { data: shot, error: shotError } = await supabase
      .from('golf_shots')
      .select('id, round_id')
      .eq('id', shotId)
      .single();

    if (shotError || !shot) {
      return { success: false, error: 'Shot not found' };
    }

    // Verify the round belongs to this player
    const { data: round, error: roundError } = await supabase
      .from('golf_rounds')
      .select('id, player_id')
      .eq('id', shot.round_id)
      .eq('player_id', player.id)
      .single();

    if (roundError || !round) {
      return { success: false, error: 'You do not have permission to update this shot' };
    }

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (data.shot_type !== undefined) updateData.shot_type = data.shot_type;
    if (data.club_type !== undefined) updateData.club_type = data.club_type;
    if (data.lie_before !== undefined) updateData.lie_before = data.lie_before;
    if (data.lie_after !== undefined) updateData.lie_after = data.lie_after;
    if (data.distance_to_hole_before !== undefined) updateData.distance_to_hole_before = data.distance_to_hole_before;
    if (data.distance_unit_before !== undefined) updateData.distance_unit_before = data.distance_unit_before;
    if (data.result !== undefined) updateData.result = data.result;
    if (data.distance_to_hole_after !== undefined) updateData.distance_to_hole_after = data.distance_to_hole_after;
    if (data.distance_unit_after !== undefined) updateData.distance_unit_after = data.distance_unit_after;
    if (data.shot_distance !== undefined) updateData.shot_distance = data.shot_distance;
    if (data.miss_direction !== undefined) updateData.miss_direction = data.miss_direction;
    if (data.putt_break !== undefined) updateData.putt_break = data.putt_break;
    if (data.putt_slope !== undefined) updateData.putt_slope = data.putt_slope;
    if (data.putt_distance_feet !== undefined) updateData.putt_distance_feet = data.putt_distance_feet;
    if (data.putt_made !== undefined) updateData.putt_made = data.putt_made;
    if (data.is_penalty !== undefined) updateData.is_penalty = data.is_penalty;
    if (data.penalty_type !== undefined) updateData.penalty_type = data.penalty_type;

    if (data.result !== undefined && data.lie_after === undefined) {
      updateData.lie_after = deriveLieAfterFromResult(data.result);
    }

    // Update the shot
    const { error: updateError } = await supabase
      .from('golf_shots')
      .update(updateData)
      .eq('id', shotId);

    if (updateError) {
      return { success: false, error: 'Failed to update shot' };
    }

    // Revalidate relevant paths
    revalidatePath('/golf/dashboard/rounds');
    revalidatePath(`/golf/dashboard/rounds/${shot.round_id}`);

    return { success: true, data: undefined };

  } catch (error) {
    console.error('[updateShot Error]', error);
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// SHOT-BY-SHOT REVIEW TYPES & ACTION
// ============================================================================

/** Shot detail for the shot-by-shot review */
export interface ShotDetail {
  id: string;
  shot_number: number;
  shot_type: string;
  club_type: string;
  lie_before: string | null;
  result: string;
  distance_to_hole_before: number | null;
  distance_to_hole_after: number | null;
  distance_unit_before: string | null;
  distance_unit_after: string | null;
  shot_distance: number | null;
  miss_direction: string | null;
  putt_break: string | null;
  putt_slope: string | null;
  is_penalty: boolean | null;
  penalty_type: string | null;
}

/** Hole summary with shots for review */
export interface HoleReviewData {
  id: string;
  hole_number: number;
  par: number;
  yardage: number | null;
  score: number | null;
  score_to_par: number | null;
  putts: number | null;
  fairway_hit: boolean | null;
  green_in_regulation: boolean | null;
  penalty_strokes: number | null;
  driving_distance: number | null;
  approach_distance: number | null;
  approach_proximity: number | null;
  first_putt_distance: number | null;
  scramble_attempt: boolean | null;
  scramble_made: boolean | null;
  sand_save_attempt: boolean | null;
  sand_save_made: boolean | null;
  shots: ShotDetail[];
}

/** Full round shot review data */
export interface RoundShotReviewData {
  roundId: string;
  courseName: string | null;
  roundDate: string;
  totalScore: number | null;
  scoreToPar: number | null;
  holes: HoleReviewData[];
  hasShotData: boolean;
}

/**
 * Get detailed shot-by-shot data for a round
 * Used for the shot-by-shot review feature
 */
export async function getRoundShotDetails(
  roundId: string
): Promise<ActionResult<RoundShotReviewData>> {
  try {
    const supabase = await createClient();

    // Verify user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Fetch round with holes
    const { data: round, error: roundError } = await supabase
      .from('golf_rounds')
      .select(`
        id,
        course_name,
        round_date,
        total_score,
        score_to_par,
        player_id
      `)
      .eq('id', roundId)
      .single();

    if (roundError || !round) {
      return { success: false, error: 'Round not found' };
    }

    // Check authorization - user must be player or coach
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    const isOwnRound = player?.id === round.player_id;

    // Check if coach has access
    let isCoach = false;
    if (coach?.organization_id) {
      const { data: orgTeam } = await supabase
        .from('golf_teams')
        .select('id')
        .eq('organization_id', coach.organization_id)
        .maybeSingle();

      if (orgTeam?.id) {
        const { data: teamMembership } = await supabase
          .from('golf_team_members')
          .select('id')
          .eq('team_id', orgTeam.id)
          .eq('player_id', round.player_id)
          .maybeSingle();
        isCoach = !!teamMembership;
      }
    }

    if (!isOwnRound && !isCoach) {
      return { success: false, error: 'Not authorized to view this round' };
    }

    // Fetch holes for the round
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: holes, error: holesError } = await (supabase as any)
      .from('golf_holes')
      .select(`
        id,
        hole_number,
        par,
        score,
        putts,
        fairway_hit,
        gir,
        penalty_strokes,
        sand_save,
        up_and_down,
        notes
      `)
      .eq('round_id', roundId)
      .order('hole_number', { ascending: true }) as { data: Array<{
        id: string;
        hole_number: number;
        par: number;
        score: number | null;
        putts: number | null;
        fairway_hit: boolean | null;
        gir: boolean | null;
        penalty_strokes: number | null;
        sand_save: boolean | null;
        up_and_down: boolean | null;
        notes: string | null;
      }> | null; error: unknown };

    if (holesError) {
      return { success: false, error: 'Failed to fetch holes' };
    }

    // Fetch all shots for the round
    const { data: shots, error: shotsError } = await supabase
      .from('golf_shots')
      .select(`
        id,
        hole_number,
        shot_number,
        shot_type,
        club_type,
        lie_before,
        result,
        distance_to_hole_before,
        distance_to_hole_after,
        distance_unit_before,
        distance_unit_after,
        shot_distance,
        miss_direction,
        putt_break,
        putt_slope,
        is_penalty,
        penalty_type
      `)
      .eq('round_id', roundId)
      .order('hole_number', { ascending: true })
      .order('shot_number', { ascending: true });

    if (shotsError) {
      return { success: false, error: 'Failed to fetch shots' };
    }

    // Group shots by hole_number
    const shotsByHole: Record<number, ShotDetail[]> = {};
    for (const shot of (shots || [])) {
      if (!shotsByHole[shot.hole_number]) {
        shotsByHole[shot.hole_number] = [];
      }
      const holeShots = shotsByHole[shot.hole_number];
      if (holeShots) {
        holeShots.push({
          id: shot.id,
          shot_number: shot.shot_number,
          shot_type: shot.shot_type ?? 'approach',
          club_type: shot.club_type ?? 'non_driver',
          lie_before: shot.lie_before,
          result: shot.result ?? 'other',
          distance_to_hole_before: shot.distance_to_hole_before,
          distance_to_hole_after: shot.distance_to_hole_after,
          distance_unit_before: shot.distance_unit_before,
          distance_unit_after: shot.distance_unit_after,
          shot_distance: shot.shot_distance,
          miss_direction: shot.miss_direction,
          putt_break: shot.putt_break,
          putt_slope: shot.putt_slope,
          is_penalty: shot.is_penalty,
          penalty_type: shot.penalty_type,
        });
      }
    }

    // Combine holes with their shots
    const holesWithShots: HoleReviewData[] = (holes || []).map((hole) => {
      const holeShots = shotsByHole[hole.hole_number] || [];
      const teeShot = holeShots.find(shot => shot.shot_type === 'tee');
      const firstPutt = holeShots.find(shot => shot.shot_type === 'putting');

      let firstPuttDistance: number | null = null;
      if (firstPutt?.distance_to_hole_before !== null && firstPutt?.distance_unit_before) {
        firstPuttDistance = firstPutt.distance_unit_before === 'yards'
          ? Math.round(firstPutt.distance_to_hole_before * 3)
          : firstPutt.distance_to_hole_before;
      }

      return {
        id: hole.id,
        hole_number: hole.hole_number,
        par: hole.par,
        yardage: null,
        score: hole.score,
        score_to_par: hole.score !== null ? hole.score - hole.par : null,
        putts: hole.putts,
        fairway_hit: hole.fairway_hit,
        green_in_regulation: hole.gir,
        penalty_strokes: hole.penalty_strokes,
        driving_distance: teeShot?.shot_distance ?? null,
        approach_distance: null,
        approach_proximity: null,
        first_putt_distance: firstPuttDistance,
        scramble_attempt: hole.up_and_down !== null,
        scramble_made: hole.up_and_down === true,
        sand_save_attempt: hole.sand_save !== null,
        sand_save_made: hole.sand_save === true,
        shots: holeShots,
      };
    });

    const hasShotData = (shots || []).length > 0;

    return {
      success: true,
      data: {
        roundId: round.id,
        courseName: round.course_name,
        roundDate: round.round_date,
        totalScore: round.total_score,
        scoreToPar: round.score_to_par,
        holes: holesWithShots,
        hasShotData,
      },
    };
  } catch (error) {
    console.error('[getRoundShotDetails Error]', error);
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// SEED TEST SHOT DATA (Development Only)
// ============================================================================

/**
 * Seeds shot data for testing. Creates realistic shots for all existing holes.
 * This is for development/testing purposes only.
 */
export async function seedTestShotData(): Promise<ActionResult<{ shotsCreated: number }>> {
  try {
    // Use admin client to bypass RLS for seeding
    const supabase = createAdminClient();

    // Get all holes that don't have shots yet
    const { data: holes, error: holesError } = await supabase
      .from('golf_holes')
      .select('id, round_id, hole_number, par, score')
      .order('round_id')
      .order('hole_number');

    if (holesError) throw holesError;
    if (!holes || holes.length === 0) {
      return { success: false, error: 'No holes found to seed shots for' };
    }

    // Check which holes already have shots
    const { data: existingShots } = await supabase
      .from('golf_shots')
      .select('hole_id')
      .not('hole_id', 'is', null);

    const holesWithShots = new Set((existingShots || []).map(s => s.hole_id));
    const holesNeedingShots = holes.filter(h => !holesWithShots.has(h.id));

    if (holesNeedingShots.length === 0) {
      return { success: true, data: { shotsCreated: 0 } };
    }

    // Generate shots for each hole
    const allShots: Array<{
      hole_id: string;
      round_id: string;
      hole_number: number;
      shot_number: number;
      shot_type: string;
      club_type: string;
      club_used: string;
      lie_before: string;
      result: string;
      distance_to_hole_before: number;
      distance_unit_before: string;
      distance_to_hole_after: number;
      distance_unit_after: string;
      shot_distance: number;
      is_penalty: boolean;
      putt_made?: boolean;
      putt_distance_feet?: number;
      putt_break?: string;
    }> = [];

    const clubs = {
      driver: 'Driver',
      wood3: '3 Wood',
      hybrid: 'Hybrid',
      iron4: '4 Iron',
      iron5: '5 Iron',
      iron6: '6 Iron',
      iron7: '7 Iron',
      iron8: '8 Iron',
      iron9: '9 Iron',
      pw: 'PW',
      gw: 'GW',
      sw: 'SW',
      lw: 'LW',
      putter: 'Putter',
    };

    const puttBreaks: Array<'left_to_right' | 'right_to_left' | 'straight' | 'multiple'> =
      ['left_to_right', 'right_to_left', 'straight', 'multiple'];

    for (const hole of holesNeedingShots) {
      const par = hole.par || 4;
      const score = hole.score || par;
      // Use standard yardages based on par (no yardage column in golf_holes)
      const yardage = par === 3 ? 165 : par === 4 ? 400 : 530;

      let currentDistance = yardage;
      let shotNumber = 0;
      let currentLie: 'tee' | 'fairway' | 'rough' | 'sand' | 'green' | 'other' = 'tee';

      // Generate shots until we're in the hole
      while (shotNumber < score && currentDistance > 0) {
        shotNumber++;

        // Determine shot type based on current position
        let shotType: 'tee' | 'approach' | 'around_green' | 'putting' | 'penalty';
        let clubType: 'driver' | 'non_driver' | 'putter';
        let clubUsed: string;
        let result: 'fairway' | 'rough' | 'sand' | 'green' | 'hole' | 'other' | 'penalty';
        let shotDistance: number;
        let distanceAfter: number;
        let distanceUnitBefore: 'yards' | 'feet' = currentDistance <= 30 ? 'feet' : 'yards';
        let distanceUnitAfter: 'yards' | 'feet';
        const isPenalty = false;
        let puttMade: boolean | undefined;
        let puttDistanceFeet: number | undefined;
        let puttBreak: 'left_to_right' | 'right_to_left' | 'straight' | 'multiple' | undefined;

        if (currentLie === 'green' || (currentDistance <= 30 && currentLie !== 'sand')) {
          // Putting
          shotType = 'putting';
          clubType = 'putter';
          clubUsed = clubs.putter;
          distanceUnitBefore = 'feet';
          const puttDistBefore = Math.min(currentDistance, 30);

          if (shotNumber === score) {
            // Final putt - must be holed
            result = 'hole';
            distanceAfter = 0;
            puttMade = true;
          } else {
            // Missed putt
            result = 'green';
            distanceAfter = Math.max(1, Math.floor(puttDistBefore * (0.1 + Math.random() * 0.3)));
            puttMade = false;
          }

          shotDistance = puttDistBefore - distanceAfter;
          distanceUnitAfter = 'feet';
          puttDistanceFeet = puttDistBefore;
          puttBreak = puttBreaks[Math.floor(Math.random() * puttBreaks.length)];
          currentDistance = distanceAfter;
          currentLie = distanceAfter === 0 ? 'green' : 'green';

        } else if (shotNumber === 1) {
          // Tee shot
          shotType = 'tee';

          if (par >= 4) {
            // Use driver or 3 wood
            clubType = 'driver';
            clubUsed = Math.random() > 0.3 ? clubs.driver : clubs.wood3;
            shotDistance = 220 + Math.floor(Math.random() * 60); // 220-280 yards
          } else {
            // Par 3 - use iron
            clubType = 'non_driver';
            const dist = yardage;
            if (dist > 200) clubUsed = clubs.hybrid;
            else if (dist > 180) clubUsed = clubs.iron4;
            else if (dist > 170) clubUsed = clubs.iron5;
            else if (dist > 160) clubUsed = clubs.iron6;
            else if (dist > 150) clubUsed = clubs.iron7;
            else if (dist > 140) clubUsed = clubs.iron8;
            else clubUsed = clubs.iron9;
            shotDistance = dist - Math.floor(Math.random() * 20);
          }

          distanceAfter = Math.max(0, currentDistance - shotDistance);
          distanceUnitAfter = distanceAfter <= 30 ? 'feet' : 'yards';

          // Determine result based on randomness
          // Par 3 tee shots: ~55% GIR rate (realistic for amateur golfers)
          // Par 4/5 tee shots: hit fairway ~65% of time
          const hitGreen = par === 3 ? Math.random() > 0.45 : false; // 55% GIR for par 3s
          const hitFairway = Math.random() > 0.35;

          if (distanceAfter <= 30 && hitGreen) {
            // Par 3: hit the green
            result = 'green';
            currentLie = 'green';
            distanceUnitAfter = 'feet';
            distanceAfter = Math.floor(Math.random() * 25) + 5; // 5-30 feet from pin
          } else if (distanceAfter <= 30 && par === 3) {
            // Par 3: missed the green (around the green)
            const missResult = Math.random();
            if (missResult < 0.5) {
              result = 'rough';
              currentLie = 'rough';
              distanceAfter = Math.floor(Math.random() * 15) + 10; // 10-25 yards from pin
            } else if (missResult < 0.8) {
              result = 'sand';
              currentLie = 'sand';
              distanceAfter = Math.floor(Math.random() * 10) + 15; // 15-25 yards from pin
            } else {
              result = 'fairway';
              currentLie = 'fairway';
              distanceAfter = Math.floor(Math.random() * 20) + 10; // 10-30 yards from pin
            }
            distanceUnitAfter = 'yards';
          } else if (hitFairway) {
            result = 'fairway';
            currentLie = 'fairway';
          } else {
            const missResult = Math.random();
            if (missResult < 0.6) {
              result = 'rough';
              currentLie = 'rough';
            } else if (missResult < 0.85) {
              result = 'sand';
              currentLie = 'sand';
            } else {
              result = 'other';
              currentLie = 'other';
            }
          }
          currentDistance = distanceAfter;

        } else if (currentDistance > 100) {
          // Approach shot (far from green)
          shotType = 'approach';
          clubType = 'non_driver';

          // Select club based on distance
          if (currentDistance > 200) clubUsed = clubs.hybrid;
          else if (currentDistance > 180) clubUsed = clubs.iron4;
          else if (currentDistance > 170) clubUsed = clubs.iron5;
          else if (currentDistance > 160) clubUsed = clubs.iron6;
          else if (currentDistance > 150) clubUsed = clubs.iron7;
          else if (currentDistance > 140) clubUsed = clubs.iron8;
          else if (currentDistance > 125) clubUsed = clubs.iron9;
          else clubUsed = clubs.pw;

          // Calculate shot distance (aim for the green)
          const targetDist = currentDistance;
          const variance = Math.random() * 30 - 15; // -15 to +15 yards variance
          shotDistance = Math.max(50, targetDist - Math.abs(variance));
          distanceAfter = Math.max(0, currentDistance - shotDistance + Math.floor(Math.random() * 20));

          // Determine result
          const hitGreen = Math.random() > 0.4;
          if (hitGreen && distanceAfter <= 30) {
            result = 'green';
            currentLie = 'green';
            distanceUnitAfter = 'feet';
            distanceAfter = Math.floor(Math.random() * 25) + 5; // 5-30 feet
          } else {
            const missResult = Math.random();
            if (missResult < 0.5) {
              result = 'rough';
              currentLie = 'rough';
              distanceAfter = Math.floor(Math.random() * 20) + 10;
            } else if (missResult < 0.8) {
              result = 'fairway';
              currentLie = 'fairway';
            } else {
              result = 'sand';
              currentLie = 'sand';
              distanceAfter = Math.floor(Math.random() * 15) + 10;
            }
            distanceUnitAfter = 'yards';
          }
          currentDistance = distanceAfter;

        } else {
          // Around the green shot (chip/pitch)
          shotType = 'around_green';
          clubType = 'non_driver';

          if (currentLie === 'sand') {
            clubUsed = clubs.sw;
          } else if (currentDistance > 50) {
            clubUsed = clubs.pw;
          } else if (currentDistance > 30) {
            clubUsed = clubs.gw;
          } else {
            clubUsed = Math.random() > 0.5 ? clubs.sw : clubs.lw;
          }

          shotDistance = currentDistance;

          // Determine result - around-the-green shots have ~75% success rate
          // Better from fairway (~85%), worse from sand (~60%)
          const chipSuccessRate = currentLie === 'sand' ? 0.60 : currentLie === 'rough' ? 0.70 : 0.85;
          const hitGreenFromChip = Math.random() < chipSuccessRate;

          if (shotNumber === score - 1 && Math.random() > 0.92) {
            // Chip in! (~8% chance on final chip)
            result = 'hole';
            distanceAfter = 0;
            distanceUnitAfter = 'feet';
            currentLie = 'green';
          } else if (hitGreenFromChip) {
            // Successfully chipped onto green
            result = 'green';
            distanceAfter = Math.floor(Math.random() * 15) + 3; // 3-18 feet left
            distanceUnitAfter = 'feet';
            currentLie = 'green';
          } else {
            // Missed chip - chunk, blade, or poor contact
            const missResult = Math.random();
            if (missResult < 0.4) {
              // Chunked it - still short
              result = currentLie === 'sand' ? 'sand' : 'rough';
              currentLie = result as 'rough' | 'sand';
              distanceAfter = Math.floor(Math.random() * 15) + 5; // 5-20 yards
              distanceUnitAfter = 'yards';
            } else if (missResult < 0.7) {
              // Thin/bladed - went too far
              result = 'rough';
              currentLie = 'rough';
              distanceAfter = Math.floor(Math.random() * 20) + 10; // 10-30 yards through green
              distanceUnitAfter = 'yards';
            } else {
              // Landed on green but rolled off
              result = 'rough';
              currentLie = 'rough';
              distanceAfter = Math.floor(Math.random() * 10) + 8; // 8-18 yards
              distanceUnitAfter = 'yards';
            }
          }
          currentDistance = distanceAfter;
        }

        const shotData: {
          hole_id: string;
          round_id: string;
          hole_number: number;
          shot_number: number;
          shot_type: string;
          club_type: string;
          club_used: string;
          lie_before: string;
          result: string;
          distance_to_hole_before: number;
          distance_unit_before: string;
          distance_to_hole_after: number;
          distance_unit_after: string;
          shot_distance: number;
          is_penalty: boolean;
          putt_made?: boolean;
          putt_distance_feet?: number;
          putt_break?: string;
        } = {
          hole_id: hole.id,
          round_id: hole.round_id,
          hole_number: hole.hole_number,
          shot_number: shotNumber,
          shot_type: shotType,
          club_type: clubType,
          club_used: clubUsed,
          lie_before: (currentLie as string) === 'tee' ? 'tee' : shotNumber === 1 ? 'tee' : currentLie,
          result: result,
          distance_to_hole_before: distanceUnitBefore === 'feet' ? currentDistance : (shotNumber === 1 ? yardage : currentDistance + shotDistance),
          distance_unit_before: distanceUnitBefore,
          distance_to_hole_after: distanceAfter,
          distance_unit_after: distanceUnitAfter,
          shot_distance: shotDistance,
          is_penalty: isPenalty,
        };

        // Add putt-specific fields if putting
        if (shotType === 'putting') {
          shotData.putt_made = puttMade;
          shotData.putt_distance_feet = puttDistanceFeet;
          shotData.putt_break = puttBreak;
        }

        // Fix lie_before for first shot
        if (shotNumber === 1) {
          shotData.lie_before = 'tee';
        }

        allShots.push(shotData);
      }
    }

    // Insert shots in batches of 500
    const batchSize = 500;
    let totalInserted = 0;

    for (let i = 0; i < allShots.length; i += batchSize) {
      const batch = allShots.slice(i, i + batchSize);
      const { error: insertError } = await supabase
        .from('golf_shots')
        .insert(batch);

      if (insertError) {
        console.error(`Error inserting batch ${i / batchSize}:`, insertError);
        throw insertError;
      }
      totalInserted += batch.length;
    }

    revalidatePath('/golf/dashboard');

    return {
      success: true,
      data: { shotsCreated: totalInserted },
    };
  } catch (error) {
    console.error('[seedTestShotData Error]', error);
    return formatSafeErrorResponse(error);
  }
}
