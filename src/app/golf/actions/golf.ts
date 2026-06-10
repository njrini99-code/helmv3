'use server';

import { randomInt } from 'crypto';
import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { resolveCoachTeamId } from '@/lib/golf/resolve-team';
import { postRoundTrigger } from '@/lib/coachhelm/v2/post-round-trigger';
import { revalidatePath, updateTag } from 'next/cache';
import { CACHE_TAGS } from '@/lib/cache/tags';
import type { HoleStats, ShotRecord } from '@/lib/types/golf';
import { z } from 'zod';
import {
  requireGolfCoach,
  verifyGolfTeamOwnership,
  AuthorizationError,
  NotFoundError
} from '@/lib/auth/ownership';
// roundTypeToDb was a no-op (identity function) and has been removed.
// Frontend and DB both use 'practice' | 'qualifier' | 'tournament'.
import { formatSafeErrorResponse, CommonSchemas } from '@/lib/validation/server-action-validator';
import { notifyQualifierCreated } from '@/lib/notifications';
import type { RSVPStatus } from '@/lib/calendar/rsvp';
import { invalidateOnRoundComplete } from '@/lib/cache/golf-stats-calculator';
// 2026-05-17: CoachHelm trigger now runs via after(postRoundTrigger) — see
// docs/architecture/coachhelm-evidence-contract.md and Plan 04. The previous
// HTTP self-call + keepalive approach was retired (audit Finding 2/A-NEW-6).
import { logRoundSubmitted } from '@/lib/admin-logger';
import { logCritical, logError } from '@/lib/error-monitoring';
import { logServerError } from '@/lib/server-error-logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { deriveLieAfterFromResult, deriveLieAfter } from '@/lib/utils/shot-helpers';
import type { Json } from '@/lib/types/database';

// ============================================================================
// COURSE ID RESOLUTION
// ============================================================================

/**
 * Resolve a course_id from golf_courses by name lookup.
 * Returns providedCourseId if already set; otherwise does a case-insensitive
 * lookup of courseName against golf_courses.name.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveCourseId(supabase: any, courseName: string, providedCourseId?: string | null): Promise<string | null> {
  if (providedCourseId) return providedCourseId;
  if (!courseName) return null;

  const { data } = await supabase
    .from('golf_courses')
    .select('id')
    .ilike('name', courseName)
    .limit(1)
    .maybeSingle();

  return (data as { id: string } | null)?.id ?? null;
}

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

// Golf event types: 'practice' | 'tournament' | 'qualifier' | 'meeting' | 'travel' | 'other' | 'class'

/**
 * Build a timezone offset string from minutes offset (from Date.getTimezoneOffset()).
 * getTimezoneOffset() returns positive for west of UTC (e.g. 360 for UTC-6).
 * We need the ISO 8601 format: "-06:00" for UTC-6, "+05:30" for UTC+5:30.
 */
function formatTimezoneOffset(offsetMinutes: number): string {
  // getTimezoneOffset returns positive for behind UTC, negative for ahead
  const sign = offsetMinutes <= 0 ? '+' : '-';
  const absMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absMinutes / 60);
  const minutes = absMinutes % 60;
  return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Build a full ISO datetime string from date, time, and optional timezone offset.
 * If timezoneOffset is not provided, no offset is appended (Supabase treats as UTC).
 */
function buildDateTimeString(date: string, time: string | undefined, timezoneOffset?: number): string {
  if (!time) return `${date}T00:00:00+00:00`;
  const tz = timezoneOffset !== undefined ? formatTimezoneOffset(timezoneOffset) : '+00:00';
  return `${date}T${time}${tz}`;
}

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
    start: Date | string;
    end: Date | string;
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

// ============================================================================
// VALIDATION SCHEMAS (Zod)
// ============================================================================

const comprehensiveShotSchema = z.object({
  shotNumber: z.number().int().min(1),
  shotType: z.enum(['tee', 'approach', 'around_green', 'putting', 'penalty']),
  clubType: z.string().min(1),
  lieBefore: z.enum(['tee', 'fairway', 'rough', 'sand', 'green', 'other']),
  distanceToHoleBefore: z.number().min(0).max(1000),
  distanceUnitBefore: z.enum(['yards', 'feet']),
  result: z.enum(['fairway', 'rough', 'sand', 'green', 'hole', 'other', 'penalty']),
  distanceToHoleAfter: z.number().min(0),
  distanceUnitAfter: z.enum(['yards', 'feet']),
  shotDistance: z.number().min(0),
  missDirection: z.string().optional(),
  puttBreak: z.enum(['right_to_left', 'left_to_right', 'straight', 'multiple']).optional(),
  puttSlope: z.enum(['uphill', 'downhill', 'level', 'severe']).optional(),
  isPenalty: z.boolean(),
  penaltyType: z.enum(['ob', 'water', 'unplayable', 'lost']).optional(),
  puttMissTags: z.array(z.string()).optional(),
  puttDistanceFeet: z.number().min(0).optional(),
  approachMissDirection: z.string().optional(),
  approachMissLieType: z.enum(['fairway', 'rough', 'bunker', 'hazard']).optional(),
});

const comprehensiveHoleSchema = z.object({
  holeNumber: z.number().int().min(1).max(18),
  par: z.number().int().min(3).max(6),
  yardage: z.number().min(0),
  score: z.number().int().min(1).max(20),
  putts: z.number().int().min(0).max(10),
  fairwayHit: z.boolean().nullable(),
  greenInRegulation: z.boolean(),
  penaltyStrokes: z.number().int().min(0).max(10),
  scrambleAttempt: z.boolean(),
  scrambleMade: z.boolean(),
  sandSaveAttempt: z.boolean(),
  sandSaveMade: z.boolean(),
  shots: z.array(comprehensiveShotSchema).min(1),
  // Stat fields calculated from shots
  drivingDistance: z.number().nullable().optional(),
  usedDriver: z.boolean().nullable().optional(),
  driveMissDirection: z.string().nullable().optional(),
  approachDistance: z.number().nullable().optional(),
  approachLie: z.string().nullable().optional(),
  approachProximity: z.number().nullable().optional(),
  approachMissDirection: z.string().nullable().optional(),
  firstPuttDistance: z.number().nullable().optional(),
  firstPuttLeave: z.number().nullable().optional(),
  firstPuttBreak: z.string().nullable().optional(),
  firstPuttSlope: z.string().nullable().optional(),
  firstPuttMissDirection: z.string().nullable().optional(),
  holedOutDistance: z.number().nullable().optional(),
  holedOutType: z.string().nullable().optional(),
});

const golfRoundComprehensiveSchema = z.object({
  courseName: z.string().min(1).max(200),
  courseCity: z.string().max(100).optional(),
  courseState: z.string().max(2).optional(),
  courseRating: z.number().min(50).max(85).optional(),
  courseSlope: z.number().int().min(55).max(155).optional(),
  teesPlayed: z.string().max(50).optional(),
  courseId: z.string().uuid().optional(),
  roundType: z.enum(['practice', 'tournament', 'qualifier']),
  roundDate: z.string().refine(d => {
    const date = new Date(d);
    if (isNaN(date.getTime())) return false;
    // Allow up to 1 day ahead to handle timezone differences (e.g. UTC+14)
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    return date <= tomorrow;
  }, 'Round date cannot be in the future'),
  holes: z.array(comprehensiveHoleSchema).min(9).max(18),
  qualifierId: z.string().uuid().optional(),
  qualifierRoundNumber: z.number().int().min(1).optional(),
});

const partialRoundSchema = z.object({
  courseName: z.string().min(1).max(200),
  courseCity: z.string().max(100).optional(),
  courseState: z.string().max(2).optional(),
  courseRating: z.number().min(50).max(85).optional().nullable(),
  courseSlope: z.number().int().min(55).max(155).optional().nullable(),
  teesPlayed: z.string().max(50).optional(),
  courseId: z.string().uuid().optional().nullable(),
  roundType: z.enum(['practice', 'tournament', 'qualifier']),
  roundDate: z.string(),
  // Coerce 0 to null — callers occasionally hit auto-save before the user
  // has selected hole 1 (incident 10: "Too small: expected number to be >=1").
  // Downstream code already treats null and 0 identically (see
  // `data.currentHole || null` / `(data.currentHole || 1) - 1`), so
  // collapsing the two here avoids a payload-level validation rejection.
  currentHole: z.preprocess(
    (v) => (v === 0 ? null : v),
    z.number().int().min(1).max(18).optional().nullable(),
  ),
  holesToPlay: z.union([z.literal(9), z.literal(18)]).optional().nullable(),
  qualifierId: z.string().uuid().optional().nullable(),
  qualifierRoundNumber: z.number().int().min(1).optional().nullable(),
  holes: z.array(z.object({
    holeNumber: z.number().int().min(1).max(18),
    par: z.number().int().min(3).max(6),
    yardage: z.number().min(0),
    score: z.number().int().min(1).max(20).optional().nullable(),
    putts: z.number().int().min(0).max(10).optional().nullable(),
    fairwayHit: z.boolean().optional().nullable(),
    greenInRegulation: z.boolean().optional().nullable(),
    penaltyStrokes: z.number().int().min(0).max(10).optional().nullable(),
    scrambleAttempt: z.boolean().optional().nullable(),
    scrambleMade: z.boolean().optional().nullable(),
    sandSaveAttempt: z.boolean().optional().nullable(),
    sandSaveMade: z.boolean().optional().nullable(),
    shots: z.array(comprehensiveShotSchema).optional(),
  }).passthrough().nullable()).max(18),
  inProgressShots: z.array(z.object({
    holeNumber: z.number().int().min(1).max(18),
    shots: z.array(comprehensiveShotSchema),
  })).optional(),
  holeConfigs: z.array(z.object({
    holeNumber: z.number().int().min(1).max(18),
    par: z.number().int().min(3).max(6),
    yardage: z.number().min(0).optional().nullable(),
  })).optional(),
});

const shotUpdateSchema = z.object({
  shot_type: z.enum(['tee', 'approach', 'around_green', 'putting', 'penalty']).optional(),
  club_type: z.enum(['driver', 'non_driver', 'putter']).optional(),
  lie_before: z.enum(['tee', 'fairway', 'rough', 'sand', 'green', 'other']).optional(),
  lie_after: z.enum(['tee', 'fairway', 'rough', 'sand', 'green', 'other', 'penalty']).nullable().optional(),
  distance_to_hole_before: z.number().min(0).max(1000).optional(),
  distance_unit_before: z.enum(['yards', 'feet']).optional(),
  result: z.enum(['fairway', 'rough', 'sand', 'green', 'hole', 'other', 'penalty']).optional(),
  distance_to_hole_after: z.number().min(0).optional(),
  distance_unit_after: z.enum(['yards', 'feet']).optional(),
  shot_distance: z.number().min(0).optional(),
  miss_direction: z.string().nullable().optional(),
  putt_break: z.enum(['right_to_left', 'left_to_right', 'straight', 'multiple']).nullable().optional(),
  putt_slope: z.enum(['uphill', 'downhill', 'level', 'severe']).nullable().optional(),
  putt_distance_feet: z.number().min(0).nullable().optional(),
  putt_made: z.boolean().nullable().optional(),
  is_penalty: z.boolean().optional(),
  penalty_type: z.enum(['ob', 'water', 'unplayable', 'lost']).nullable().optional(),
  putt_miss_tags: z.array(z.string()).nullable().optional(),
  approach_miss_direction: z.string().nullable().optional(),
  approach_miss_lie_type: z.string().nullable().optional(),
}).refine(data => Object.keys(data).length > 0, 'At least one field is required');

const dateString = z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/, 'Date must be YYYY-MM-DD');
const timeString = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:MM');
const golfEventType = z.enum(['practice', 'tournament', 'qualifier', 'meeting', 'travel', 'other', 'class']);

const golfEventSchema = z.object({
  title: z.string().min(1).max(200),
  eventType: golfEventType,
  startDate: dateString,
  endDate: dateString.optional(),
  startTime: timeString.optional(),
  endTime: timeString.optional(),
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
  // Timezone offset from client (minutes from UTC, e.g. 360 for UTC-6)
  timezoneOffset: z.number().int().optional(),
});

const golfQualifierSchema = z
  .object({
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
    // Travel-squad selection model (omit → DB defaults 5 total / 1 coach-pick).
    selectionSlotsTotal: z.number().int().min(1).max(50).optional(),
    selectionSlotsCoachPick: z.number().int().min(0).max(50).optional(),
  })
  .refine(
    (d) =>
      d.selectionSlotsTotal === undefined ||
      d.selectionSlotsCoachPick === undefined ||
      d.selectionSlotsCoachPick <= d.selectionSlotsTotal,
    { message: 'Coach picks cannot exceed the total travel-squad size', path: ['selectionSlotsCoachPick'] },
  );

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
 * Helper to get team_id for a coach (since golf_coaches doesn't have team_id column).
 * Looks up via organization_id -> golf_teams.
 * Delegates to the shared deterministic resolver (never throws on orgs with >1 team).
 */
async function getCoachTeamId(
  supabase: SupabaseClient,
  organizationId: string | null
): Promise<string | null> {
  return resolveCoachTeamId(supabase, organizationId);
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
  // Timezone offset from client (minutes from UTC, e.g. 360 for UTC-6)
  timezoneOffset?: number;
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
  /** Travel-squad size (omit → DB default 5). */
  selectionSlotsTotal?: number;
  /** Coach's discretionary picks within the squad (omit → DB default 1). */
  selectionSlotsCoachPick?: number;
}

// deriveLieAfterFromResult, deriveLieAfter imported from '@/lib/utils/shot-helpers'

function derivePuttDistanceFeet(shot: ShotRecord): number | null {
  if (shot.shotType !== 'putting') return null;
  if (shot.puttDistanceFeet !== undefined) return shot.puttDistanceFeet ?? null;
  const distance = shot.distanceToHoleBefore;
  if (!Number.isFinite(distance)) return null;
  // SG-2: a putt distance is ALWAYS in feet. Converting a 'yards'-unit value to
  // feet (×3) fabricated impossible 90-500ft "putts" that then ×3'd again
  // downstream in SG. Treat the raw value as feet regardless of the stored unit
  // and clamp to a realistic putt max (120ft).
  return Math.min(Math.max(distance, 0), 120);
}

/** Allowed lie_type values for approach_miss_details CHECK constraint */
const VALID_APPROACH_LIE_TYPES = new Set([
  'fairway',
  'rough',
  'sand',
  'bunker',
  'recovery',
  'hazard',
  'green',
  'tee',
  'other',
  'penalty',
  'deep_rough',
]);

const VALID_APPROACH_MISS_DIRECTIONS = new Set([
  'short',
  'long',
  'left',
  'right',
  'short_left',
  'short_right',
  'long_left',
  'long_right',
]);

/** Validate client approachMissLieType against DB-safe lie_type values */
function toDbLieType(lieType: string | undefined | null): string | null {
  if (!lieType) return null;
  return VALID_APPROACH_LIE_TYPES.has(lieType) ? lieType : null;
}

function toDbApproachMissDirection(missDirection: string | undefined | null): string | null {
  if (!missDirection) return null;
  return VALID_APPROACH_MISS_DIRECTIONS.has(missDirection) ? missDirection : null;
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
/** Source of truth for GIR calculation on stored rounds. Client-side calculateHoleStats() in shot-helpers.ts mirrors this logic. */
function calculateGirFromShots(
  shots: Array<{ shotNumber: number; result: string | null }>,
  par: number
): boolean {
  const greenHitResults = ['green', 'hole', 'gir'];
  const shotToGreen = shots.find(s =>
    greenHitResults.includes((s.result || '').toLowerCase())
  );

  if (!shotToGreen) return false;

  // GIR means reaching green in (par - 2) strokes or fewer
  return shotToGreen.shotNumber <= (par - 2);
}

interface RoundHolePayload {
  hole_number: number;
  par: number;
  yardage: number | null;
  score: number;
  putts: number;
  fairway_hit: boolean | null;
  gir: boolean | null;
  penalty_strokes: number | null;
  up_and_down: boolean | null;
  sand_save: boolean | null;
}

interface RoundShotPayload {
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

interface RoundShotGroupPayload {
  hole_number: number;
  shots: RoundShotPayload[];
}

interface RoundPuttDetailPayload {
  hole_number: number;
  shot_number: number;
  miss_tags: string[];
  break_direction: string | null;
  distance_feet: number | null;
  made: boolean;
}

interface RoundApproachDetailPayload {
  hole_number: number;
  shot_number: number;
  miss_direction: string | null;
  lie_type: string | null;
  distance_from_green_yards: number | null;
}

interface CompletedRoundUpdatePayload {
  player_id: string;
  team_id: string | null;
  course_id: string | null;
  course_name: string;
  course_city: string | null;
  course_state: string | null;
  course_rating: number | null;
  course_slope: number | null;
  tees_played: string | null;
  round_type: 'practice' | 'tournament' | 'qualifier';
  round_date: string;
  holes_played: number;
  total_score: number;
  score_to_par: number;
  total_putts: number;
  total_fairways_hit: number;
  total_fairways: number;
  total_gir: number;
  total_gir_possible: number;
  total_penalties: number;
  front_nine: number | null;
  back_nine: number | null;
  status: 'completed';
  qualifier_id: string | null;
  qualifier_round_number: number | null;
}

interface RoundSubmissionBackupPayload {
  version: 1;
  type: 'submit_backup';
  savedAt: string;
  roundData: CompletedRoundUpdatePayload;
  holes: RoundHolePayload[];
  shots: RoundShotGroupPayload[];
  puttDetails: RoundPuttDetailPayload[];
  approachDetails: RoundApproachDetailPayload[];
}

function buildRoundSubmissionBackup(
  roundData: CompletedRoundUpdatePayload,
  holesPayload: RoundHolePayload[],
  shotsPayload: RoundShotGroupPayload[],
  puttDetailsPayload: RoundPuttDetailPayload[],
  approachDetailsPayload: RoundApproachDetailPayload[]
): RoundSubmissionBackupPayload {
  return {
    version: 1,
    type: 'submit_backup',
    savedAt: new Date().toISOString(),
    roundData,
    holes: holesPayload,
    shots: shotsPayload,
    puttDetails: puttDetailsPayload,
    approachDetails: approachDetailsPayload,
  };
}

function mergeRoundWarnings(...warningGroups: Array<string[] | undefined>): string[] | undefined {
  const merged = Array.from(new Set(warningGroups.flatMap(group => group ?? [])));
  return merged.length > 0 ? merged : undefined;
}

function getPreservedRoundSubmitError(): string {
  return 'Round submission hit a server error, but your round data was preserved. Reload this round and try again. Do not re-enter it.';
}

async function persistRoundSubmissionBackup(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  roundId: string,
  playerId: string,
  backup: RoundSubmissionBackupPayload
): Promise<void> {
  const roundsTable = fromUntyped(supabase, 'golf_rounds');
  const { data: existingRound } = await roundsTable
    .select('draft_data')
    .eq('id', roundId)
    .eq('player_id', playerId)
    .maybeSingle();

  const existingDraftData = existingRound?.draft_data;
  const mergedDraftData = existingDraftData && typeof existingDraftData === 'object' && !Array.isArray(existingDraftData)
    ? { ...existingDraftData, submissionBackup: backup }
    : { submissionBackup: backup };

  const { error } = await roundsTable
    .update({ draft_data: mergedDraftData })
    .eq('id', roundId)
    .eq('player_id', playerId);

  if (error) {
    throw error;
  }
}

async function submitRoundDirectFallback({
  supabase,
  roundId,
  playerId,
  roundData,
  holesPayload,
  shotsPayload,
  puttDetailsPayload,
  approachDetailsPayload,
  submissionBackup,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  roundId: string;
  playerId: string;
  roundData: CompletedRoundUpdatePayload;
  holesPayload: RoundHolePayload[];
  shotsPayload: RoundShotGroupPayload[];
  puttDetailsPayload: RoundPuttDetailPayload[];
  approachDetailsPayload: RoundApproachDetailPayload[];
  submissionBackup: RoundSubmissionBackupPayload;
}): Promise<{ success: true; warnings: string[] } | { success: false; error: string }> {
  const warnings: string[] = [];
  const roundsTable = fromUntyped(supabase, 'golf_rounds');
  const { data: existingRound } = await roundsTable
    .select('draft_data')
    .eq('id', roundId)
    .eq('player_id', playerId)
    .maybeSingle();

  const existingDraftData = existingRound?.draft_data;

  // Snapshot the existing holes + shots BEFORE we clear them. The JS client can't
  // wrap this in a DB transaction (that's exactly what the atomic RPC this is a
  // fallback FOR does), so if an insert fails after the deletes we manually restore
  // the snapshot instead of leaving the round with no holes/shots. This honors the
  // no-destructive-writes rule on a save/submit path — a transient failure must not
  // lose the round. Restore is best-effort: if it also fails we surface the original
  // error, but the common case (transient insert error) is fully recoverable.
  const { data: shotSnapshot, error: shotSnapshotError } = await supabase.from('golf_shots').select('*').eq('round_id', roundId);
  const { data: holeSnapshot, error: holeSnapshotError } = await supabase.from('golf_holes').select('*').eq('round_id', roundId);
  if (shotSnapshotError || holeSnapshotError || shotSnapshot == null || holeSnapshot == null) {
    // Could not capture a reliable snapshot — abort BEFORE any delete so a later
    // restoreSnapshot() can never wipe shots/holes and re-insert nothing (data-loss guard).
    return {
      success: false,
      error: `Fallback aborted: could not snapshot existing round data: ${shotSnapshotError?.message || holeSnapshotError?.message || 'snapshot returned null'}`,
    };
  }
  const restoreSnapshot = async (): Promise<void> => {
    try {
      await supabase.from('golf_shots').delete().eq('round_id', roundId);
      await supabase.from('golf_holes').delete().eq('round_id', roundId);
      if (Array.isArray(holeSnapshot) && holeSnapshot.length > 0) {
        await supabase.from('golf_holes').insert(holeSnapshot);
      }
      if (Array.isArray(shotSnapshot) && shotSnapshot.length > 0) {
        await supabase.from('golf_shots').insert(shotSnapshot);
      }
    } catch {
      // Best-effort rollback — the caller surfaces the ORIGINAL failure either way.
    }
  };

  const { error: deleteShotsError } = await supabase
    .from('golf_shots')
    .delete()
    .eq('round_id', roundId);

  if (deleteShotsError) {
    // Nothing destroyed yet (the delete itself failed) — no restore needed.
    return { success: false, error: `Fallback failed while clearing shots: ${deleteShotsError.message}` };
  }

  const { error: deleteHolesError } = await supabase
    .from('golf_holes')
    .delete()
    .eq('round_id', roundId);

  if (deleteHolesError) {
    await restoreSnapshot(); // shots were already cleared — put them back
    return { success: false, error: `Fallback failed while clearing holes: ${deleteHolesError.message}` };
  }

  const { data: insertedHoles, error: holesError } = await supabase
    .from('golf_holes')
    .insert(holesPayload.map(hole => ({ round_id: roundId, ...hole })))
    .select('id, hole_number');

  if (holesError || !insertedHoles) {
    await restoreSnapshot(); // holes+shots cleared, new holes failed — restore originals
    return { success: false, error: `Fallback failed while writing holes: ${holesError?.message || 'unknown error'}` };
  }

  const holeIdMap = new Map<number, string>(
    insertedHoles.map((hole: { hole_number: number; id: string }) => [hole.hole_number, hole.id])
  );
  const shotIdMap = new Map<string, string>();

  for (const group of shotsPayload) {
    const holeId = holeIdMap.get(group.hole_number);
    if (!holeId || group.shots.length === 0) {
      continue;
    }

    const { data: insertedShots, error: shotsError } = await supabase
      .from('golf_shots')
      .insert(group.shots.map(shot => ({
        round_id: roundId,
        hole_id: holeId,
        hole_number: group.hole_number,
        ...shot,
      })))
      .select('id, hole_number, shot_number');

    if (shotsError || !insertedShots) {
      await restoreSnapshot(); // partial new holes/shots written — roll back to originals
      return { success: false, error: `Fallback failed while writing shots: ${shotsError?.message || 'unknown error'}` };
    }

    for (const shot of insertedShots) {
      shotIdMap.set(`${shot.hole_number}-${shot.shot_number}`, shot.id);
    }
  }

  for (const pd of puttDetailsPayload) {
    const shotId = shotIdMap.get(`${pd.hole_number}-${pd.shot_number}`);
    if (!shotId) {
      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('putt_details').insert({
      shot_id: shotId,
      miss_tags: pd.miss_tags || [],
      break_direction: pd.break_direction,
      distance_feet: pd.distance_feet != null ? Math.max(0, Math.min(500, pd.distance_feet)) : null,
      made: pd.made,
    });

    if (error) {
      warnings.push(
        `Putt detail skipped for hole ${pd.hole_number} shot ${pd.shot_number}: ${error.message || 'unknown error'}`
      );
    }
  }

  for (const ad of approachDetailsPayload) {
    const shotId = shotIdMap.get(`${ad.hole_number}-${ad.shot_number}`);
    if (!shotId) {
      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('approach_miss_details').insert({
      shot_id: shotId,
      miss_direction: toDbApproachMissDirection(ad.miss_direction),
      lie_type: toDbLieType(ad.lie_type),
      distance_from_green_yards: ad.distance_from_green_yards != null
        ? Math.max(0, ad.distance_from_green_yards)
        : null,
    });

    if (error) {
      warnings.push(
        `Approach detail skipped for hole ${ad.hole_number} shot ${ad.shot_number}: ${error.message || 'unknown error'}`
      );
    }
  }

  const mergedDraftData = existingDraftData && typeof existingDraftData === 'object' && !Array.isArray(existingDraftData)
    ? { ...existingDraftData, submissionBackup: { ...submissionBackup, usedDirectFallback: true, fallbackCompletedAt: new Date().toISOString(), warnings } }
    : { submissionBackup: { ...submissionBackup, usedDirectFallback: true, fallbackCompletedAt: new Date().toISOString(), warnings } };

  const { error: finalizeError } = await roundsTable
    .update({
      ...roundData,
      draft_data: mergedDraftData,
    })
    .eq('id', roundId)
    .eq('player_id', playerId);

  if (finalizeError) {
    return { success: false, error: `Fallback failed while finalizing round: ${finalizeError.message}` };
  }

  return { success: true, warnings };
}

type GolfEventUpdateData = {
  updated_at: string;
  title?: string;
  event_type?: 'practice' | 'tournament' | 'qualifier' | 'meeting' | 'travel' | 'other' | 'class';
  start_time?: string;
  end_time?: string | null;
  all_day?: boolean;
  location?: string | null;
  description?: string | null;
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
): Promise<ActionResult<{ roundId: string; warnings?: string[] }>> {
  try {
    // Validate input
    const zodResult = golfRoundComprehensiveSchema.safeParse(data);
    if (!zodResult.success) {
      const firstIssue = zodResult.error.issues[0];
      const detail = `${firstIssue?.path.join('.')} — ${firstIssue?.message}`;
      void logServerError(`Round submit validation failed: ${detail}`, {
        action: 'submitGolfRoundComprehensive',
        featureArea: 'shot_tracking',
        extra: {
          courseName: data.courseName,
          holesCount: data.holes?.length,
          zodErrors: zodResult.error.issues.slice(0, 5).map(i => `${i.path.join('.')}: ${i.message}`),
        },
      }, 'warning');
      return { success: false, error: `Invalid round data: ${detail}` };
    }

    const incompleteHole = data.holes.find(
      (hole) => hole == null || hole.score == null || hole.putts == null
    );
    if (incompleteHole) {
      void logServerError(`Round submit rejected: hole ${incompleteHole.holeNumber} missing score/putts`, {
        action: 'submitGolfRoundComprehensive',
        featureArea: 'shot_tracking',
        extra: { courseName: data.courseName, holeNumber: incompleteHole.holeNumber },
      }, 'warning');
      return {
        success: false,
        error: `Cannot submit round: hole ${incompleteHole.holeNumber} is missing score or putts.`,
      };
    }

    // Reject impossibly low scores
    const validationTotalScore = data.holes.reduce((sum, h) => sum + h.score, 0);
    if (validationTotalScore < data.holes.length) {
      void logServerError(`Round submit rejected: impossibly low total score ${validationTotalScore}`, {
        action: 'submitGolfRoundComprehensive',
        featureArea: 'shot_tracking',
        extra: { courseName: data.courseName, totalScore: validationTotalScore, holesCount: data.holes.length },
      }, 'warning');
      return { success: false, error: 'Total score appears invalid. Please check your scorecard.' };
    }
    if (data.holes.every(h => h.putts === 0)) {
      void logServerError('Round submit rejected: zero putts on every hole', {
        action: 'submitGolfRoundComprehensive',
        featureArea: 'shot_tracking',
        extra: { courseName: data.courseName, holesCount: data.holes.length },
      }, 'warning');
      return { success: false, error: 'A round with zero putts on every hole is not valid.' };
    }

    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      void logServerError('Round submit failed: user session expired or not signed in', {
        action: 'submitGolfRoundComprehensive',
        featureArea: 'shot_tracking',
        extra: { courseName: data.courseName, holesCount: data.holes?.length },
      }, 'error');
      return { success: false, error: 'You must be signed in to submit rounds' };
    }

    // Get player record
    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!player) {
      void logServerError('Round submit failed: player profile not found', {
        action: 'submitGolfRoundComprehensive',
        featureArea: 'shot_tracking',
        userId: user.id,
        userEmail: user.email,
        extra: { courseName: data.courseName },
      }, 'error');
      return { success: false, error: 'Player profile not found' };
    }

    // If updating an existing round, verify ownership and that it's not already completed
    if (existingRoundId) {
      // SECURITY: Verify the round belongs to this player and is not already completed
      const { data: existingRound, error: verifyError } = await supabase
        .from('golf_rounds')
        .select('id, player_id, status')
        .eq('id', existingRoundId)
        .eq('player_id', player.id)
        .single();

      if (verifyError || !existingRound) {
        void logServerError('Round submit failed: existing round not found or permission denied', {
          action: 'submitGolfRoundComprehensive',
          featureArea: 'shot_tracking',
          roundId: existingRoundId,
          playerId: player.id,
          userId: user.id,
          userEmail: user.email,
          errorCode: verifyError?.code,
        }, 'warning');
        return { success: false, error: 'Round not found or you do not have permission to update it.' };
      }

      if (existingRound.status === 'completed') {
        void logServerError('Round submit rejected: round already completed (double-submit attempt)', {
          action: 'submitGolfRoundComprehensive',
          featureArea: 'shot_tracking',
          roundId: existingRoundId,
          playerId: player.id,
          userId: user.id,
          userEmail: user.email,
        }, 'warning');
        return { success: false, error: 'This round has already been submitted. It cannot be submitted again.' };
      }
    }

    // Server-side qualifier validation
    if (data.qualifierId) {
      // Verify qualifier exists and is not completed
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: qualifierRaw, error: qualifierError } = await (supabase as any)
        .from('golf_qualifiers')
        .select('id, status')
        .eq('id', data.qualifierId)
        .single();

      const qualifier = qualifierRaw as { id: string; status: string } | null;

      if (qualifierError || !qualifier) {
        return { success: false, error: 'Qualifier not found.' };
      }

      if (qualifier.status === 'completed') {
        return { success: false, error: 'This qualifier has already been completed. Rounds can no longer be submitted.' };
      }

      // Verify the player has an entry in this qualifier
      const { data: qualifierEntry, error: entryError } = await supabase
        .from('golf_qualifier_entries')
        .select('id')
        .eq('qualifier_id', data.qualifierId)
        .eq('player_id', player.id)
        .single();

      if (entryError || !qualifierEntry) {
        return { success: false, error: 'You are not entered in this qualifier.' };
      }

      // NOTE: golf_qualifiers.num_rounds was removed in the 2026-05-27 schema
      // rebuild, so there is no stored per-qualifier round cap to validate
      // against here anymore (selecting it 400'd the whole query). The
      // duplicate-round-number guard below still prevents re-submitting the
      // same round; round count is inferred downstream from completed rounds.

      // Prevent duplicate qualifier round numbers
      if (data.qualifierRoundNumber) {
        const { data: existingRound } = await supabase
          .from('golf_rounds')
          .select('id')
          .eq('qualifier_id', data.qualifierId)
          .eq('player_id', player.id)
          .eq('qualifier_round_number', data.qualifierRoundNumber)
          .neq('status', 'abandoned')
          .maybeSingle();

        if (existingRound && existingRound.id !== existingRoundId) {
          return { success: false, error: `You have already submitted round ${data.qualifierRoundNumber} for this qualifier.` };
        }
      }
    }

    // Calculate round totals from holes (schema-aligned)
    const totalScore = data.holes.reduce((sum, h) => sum + h.score, 0);
    const totalPar = data.holes.reduce((sum, h) => sum + h.par, 0);
    const totalToPar = totalScore - totalPar;
    const totalPutts = data.holes.reduce((sum, h) => sum + h.putts, 0);
    const fairwaysHit = data.holes.filter(h => h.fairwayHit === true && h.par >= 4).length;
    // Denominator = par-4/5 holes where a fairway result was actually recorded.
    // Counting every par-4/5 (incl. holes with no fairway_hit logged) inflates the
    // denominator and deflates driving accuracy (e.g. 121/203=59.6% vs 121/199=60.8%).
    const fairwaysTotal = data.holes.filter(h => h.par >= 4 && h.fairwayHit != null).length;
    // Server-calculate GIR from shot data for accuracy
    const greensInReg = data.holes.filter(h => calculateGirFromShots(h.shots, h.par)).length;

    // Calculate front nine / back nine splits
    const frontNineHoles = data.holes.filter(h => h.holeNumber <= 9);
    const backNineHoles = data.holes.filter(h => h.holeNumber > 9);
    const frontNine = frontNineHoles.length > 0 ? frontNineHoles.reduce((sum, h) => sum + h.score, 0) : null;
    const backNine = backNineHoles.length > 0 ? backNineHoles.reduce((sum, h) => sum + h.score, 0) : null;
    const totalPenalties = data.holes.reduce((sum, h) => sum + (h.penaltyStrokes ?? 0), 0);

    // Prepare round data
    const teamId = await getPlayerTeamId(supabase, player.id);
    const resolvedCourseId = await resolveCourseId(supabase, data.courseName, data.courseId);
    const roundData: CompletedRoundUpdatePayload = {
      player_id: player.id,
      team_id: teamId,
      course_id: resolvedCourseId,
      course_name: data.courseName,
      course_city: data.courseCity || null,
      course_state: data.courseState || null,
      course_rating: data.courseRating ?? null,
      course_slope: data.courseSlope ?? null,
      tees_played: data.teesPlayed || null,
      round_type: data.roundType,
      round_date: data.roundDate,
      holes_played: data.holes.length,
      total_score: totalScore,
      score_to_par: totalToPar,
      total_putts: totalPutts,
      total_fairways_hit: fairwaysHit,
      total_fairways: fairwaysTotal,
      total_gir: greensInReg,
      total_gir_possible: data.holes.length,
      total_penalties: totalPenalties,
      front_nine: frontNine,
      back_nine: backNine,
      status: 'completed' as const, // Mark as completed when all holes are done
      qualifier_id: data.qualifierId || null,
      qualifier_round_number: data.qualifierRoundNumber || null,
    };

    // Build hole/shot/detail payloads for RPC or manual insert
    const holesPayload = data.holes.map(hole => ({
      hole_number: hole.holeNumber,
      par: hole.par,
      yardage: hole.yardage ?? null,
      score: hole.score,
      putts: hole.putts,
      fairway_hit: hole.fairwayHit ?? null,
      gir: calculateGirFromShots(hole.shots, hole.par),
      penalty_strokes: hole.penaltyStrokes ?? null,
      up_and_down: hole.scrambleAttempt ? hole.scrambleMade : null,
      sand_save: hole.sandSaveAttempt ? hole.sandSaveMade : null,
    }));

    const shotsPayload = data.holes.map(hole => ({
      hole_number: hole.holeNumber,
      shots: hole.shots.map(shot => ({
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
      })),
    }));

    // Build putt and approach detail payloads keyed by (hole_number, shot_number)
    const puttDetailsPayload: Array<{
      hole_number: number;
      shot_number: number;
      miss_tags: string[];
      break_direction: string | null;
      distance_feet: number | null;
      made: boolean;
    }> = [];
    const approachDetailsPayload: Array<{
      hole_number: number;
      shot_number: number;
      miss_direction: string | null;
      lie_type: string | null;
      distance_from_green_yards: number | null;
    }> = [];

    for (const hole of data.holes) {
      for (const shot of hole.shots) {
        if (shot.shotType === 'putting') {
          const rawDist = shot.puttDistanceFeet ?? derivePuttDistanceFeet(shot);
          puttDetailsPayload.push({
            hole_number: hole.holeNumber,
            shot_number: shot.shotNumber,
            miss_tags: shot.puttMissTags || [],
            break_direction: shot.puttBreak || null,
            distance_feet: rawDist != null ? Math.min(rawDist, 500) : null,
            made: shot.result === 'hole',
          });
        }

        // Include tee shots on par-3s as approach shots (they ARE the approach)
        const isApproachShot = shot.shotType === 'approach' ||
          shot.shotType === 'around_green' ||
          (shot.shotType === 'tee' && hole.par === 3);

        if (isApproachShot &&
            shot.result !== 'green' && shot.result !== 'hole') {
          approachDetailsPayload.push({
            hole_number: hole.holeNumber,
            shot_number: shot.shotNumber,
            miss_direction: shot.approachMissDirection || null,
            lie_type: toDbLieType(shot.approachMissLieType),
            distance_from_green_yards: shot.distanceToHoleAfter != null
              ? (shot.distanceUnitAfter === 'feet'
                ? Math.round(shot.distanceToHoleAfter / 3)
                : shot.distanceToHoleAfter)
              : null,
          });
        }
      }
    }

    const submissionBackup = buildRoundSubmissionBackup(
      roundData,
      holesPayload,
      shotsPayload,
      puttDetailsPayload,
      approachDetailsPayload
    );
    const shotsCount = shotsPayload.reduce((sum, group) => sum + group.shots.length, 0);

    const attemptDirectSubmitFallback = async (
      roundId: string,
      path: 'existing_round' | 'new_round_rpc',
      trigger: Record<string, unknown>,
      backupPersisted: boolean
    ): Promise<{ success: true; warnings?: string[] } | { success: false; error: string }> => {
      const fallbackResult = await submitRoundDirectFallback({
        supabase,
        roundId,
        playerId: player.id,
        roundData,
        holesPayload,
        shotsPayload,
        puttDetailsPayload,
        approachDetailsPayload,
        submissionBackup,
      });

      if (!fallbackResult.success) {
        await logServerError(
          `Direct round submit fallback failed: ${fallbackResult.error}`,
          {
            action: 'submitGolfRoundComprehensive',
            roundId,
            playerId: player.id,
            userId: user.id,
            userEmail: user.email,
            holesCount: holesPayload.length,
            shotsCount,
            extra: { path, trigger, backupPersisted },
          },
          'critical'
        );
        return { success: false, error: getPreservedRoundSubmitError() };
      }

      await logServerError(
        'Direct round submit fallback used after RPC failure',
        {
          action: 'submitGolfRoundComprehensive',
          roundId,
          playerId: player.id,
          userId: user.id,
          userEmail: user.email,
          holesCount: holesPayload.length,
          shotsCount,
          extra: {
            path,
            trigger,
            backupPersisted,
            warnings: fallbackResult.warnings,
          },
        },
        'warning'
      );

      return {
        success: true,
        warnings: fallbackResult.warnings.length > 0 ? fallbackResult.warnings : undefined,
      };
    };

    let round: { id: string };
    let detailWarnings: string[] | undefined;

    if (existingRoundId) {
      let backupPersisted = false;
      try {
        await persistRoundSubmissionBackup(supabase, existingRoundId, player.id, submissionBackup);
        backupPersisted = true;
      } catch (backupError) {
        await logServerError(
          `Failed to persist round submission backup: ${backupError instanceof Error ? backupError.message : String(backupError)}`,
          {
            action: 'submitGolfRoundComprehensive',
            roundId: existingRoundId,
            playerId: player.id,
            userId: user.id,
            userEmail: user.email,
            holesCount: holesPayload.length,
            shotsCount,
            extra: { path: 'existing_round', stage: 'backup_persist' },
          },
          'error'
        );
      }

      // Use atomic RPC — wraps entire submit in a single transaction
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rpcResult, error: rpcError } = await (supabase as any).rpc(
        'submit_round_atomic',
        {
          p_round_id: existingRoundId,
          p_round_data: roundData,
          p_holes: holesPayload,
          p_shots: shotsPayload,
          p_putt_details: puttDetailsPayload,
          p_approach_details: approachDetailsPayload,
        }
      );

      if (rpcError) {
        logError(new Error(rpcError.message), undefined, { action: 'submitGolfRoundComprehensive.rpc' });
        await logServerError(`Round submit RPC failed: ${rpcError.message}`, {
          action: 'submitGolfRoundComprehensive',
          roundId: existingRoundId,
          playerId: player.id,
          userId: user.id,
          userEmail: user.email,
          holesCount: holesPayload.length,
          shotsCount,
          errorCode: rpcError.code,
          errorHint: rpcError.hint,
          errorDetails: rpcError.details,
          extra: { path: 'existing_round', courseName: data.courseName },
        }, 'critical');
        const fallbackResult = await attemptDirectSubmitFallback(
          existingRoundId,
          'existing_round',
          {
            source: 'rpc_error',
            code: rpcError.code,
            message: rpcError.message,
            hint: rpcError.hint,
            details: rpcError.details,
          },
          backupPersisted
        );
        if (!fallbackResult.success) {
          return fallbackResult;
        }

        detailWarnings = mergeRoundWarnings(detailWarnings, fallbackResult.warnings);
        round = { id: existingRoundId };
      } else {
        if (rpcResult && !rpcResult.success) {
          const isInternalError = rpcResult.error === 'internal_error';
          await logServerError(`Round submit RPC returned failure: ${rpcResult.error}${isInternalError ? ` [${rpcResult.error_code}] at step "${rpcResult.step}": ${rpcResult.detail}` : ''}`, {
            action: 'submitGolfRoundComprehensive',
            roundId: existingRoundId,
            playerId: player.id,
            userId: user.id,
            userEmail: user.email,
            holesCount: holesPayload.length,
            shotsCount,
            errorCode: rpcResult.error_code,
            errorDetails: rpcResult.step,
            extra: { rpcResult, path: 'existing_round' },
          }, isInternalError ? 'critical' : 'error');

          if (isInternalError) {
            const fallbackResult = await attemptDirectSubmitFallback(
              existingRoundId,
              'existing_round',
              {
                source: 'rpc_result',
                error: rpcResult.error,
                errorCode: rpcResult.error_code,
                step: rpcResult.step,
                detail: rpcResult.detail,
              },
              backupPersisted
            );
            if (!fallbackResult.success) {
              return fallbackResult;
            }

            detailWarnings = mergeRoundWarnings(detailWarnings, fallbackResult.warnings);
            round = { id: existingRoundId };
          } else {
            return { success: false, error: rpcResult.error || 'Failed to submit round.' };
          }
        } else {
          // Log warnings from resilient detail inserts (round saved successfully)
          if (rpcResult?.warnings?.length > 0) {
            detailWarnings = rpcResult.warnings as string[];
            await logServerError(
              `Round submitted with ${rpcResult.warnings.length} detail warning(s)`,
              {
                action: 'submitGolfRoundComprehensive',
                roundId: existingRoundId,
                playerId: player.id,
                userId: user.id,
                userEmail: user.email,
                extra: { warnings: rpcResult.warnings, path: 'existing_round' },
              },
              'warning'
            );
          }

          round = { id: existingRoundId };
        }
      }
    } else {
      // Insert as draft — stats trigger only fires when status='completed'
      const { data: newRound, error: roundError } = await supabase
        .from('golf_rounds')
        .insert({
          ...roundData,
          status: 'draft',
          draft_data: { submissionBackup } as unknown as Json,
        })
        .select('id')
        .single();

      if (roundError || !newRound) {
        await logServerError(`Round draft insert failed: ${roundError?.message || 'no data returned'}`, {
          action: 'submitGolfRoundComprehensive',
          playerId: player.id,
          userId: user.id,
          userEmail: user.email,
          holesCount: holesPayload.length,
          errorCode: roundError?.code,
          errorHint: roundError?.hint,
          errorDetails: roundError?.details,
          extra: { path: 'new_round_draft', courseName: data.courseName },
        }, 'critical');
        return { success: false, error: 'Failed to save round. Please try again.' };
      }

      // Atomically set status='completed' + insert holes/shots inside one transaction.
      // The stats trigger fires AFTER all hole data exists.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rpcResult, error: rpcError } = await (supabase as any).rpc(
        'submit_round_atomic',
        {
          p_round_id: newRound.id,
          p_round_data: roundData,
          p_holes: holesPayload,
          p_shots: shotsPayload,
          p_putt_details: puttDetailsPayload,
          p_approach_details: approachDetailsPayload,
        }
      );

      if (rpcError) {
        // Do NOT delete the round — preserve it so the user can retry.
        // Deleting here caused permanent data loss when the RPC failed
        // (e.g., trigger errors, network timeouts, race conditions).
        logError(new Error(rpcError.message), undefined, { action: 'submitGolfRoundComprehensive.rpc.new' });
        await logServerError(`Round submit RPC failed (new round): ${rpcError.message}`, {
          action: 'submitGolfRoundComprehensive',
          roundId: newRound.id,
          playerId: player.id,
          userId: user.id,
          userEmail: user.email,
          holesCount: holesPayload.length,
          shotsCount,
          errorCode: rpcError.code,
          errorHint: rpcError.hint,
          errorDetails: rpcError.details,
          extra: { path: 'new_round_rpc', courseName: data.courseName },
        }, 'critical');
        const fallbackResult = await attemptDirectSubmitFallback(
          newRound.id,
          'new_round_rpc',
          {
            source: 'rpc_error',
            code: rpcError.code,
            message: rpcError.message,
            hint: rpcError.hint,
            details: rpcError.details,
          },
          true
        );
        if (!fallbackResult.success) {
          return fallbackResult;
        }

        detailWarnings = mergeRoundWarnings(detailWarnings, fallbackResult.warnings);
        round = { id: newRound.id };
      } else {
        if (rpcResult && !rpcResult.success) {
          // Do NOT delete — the round is preserved as a draft for retry
          const isInternalError = rpcResult.error === 'internal_error';
          await logServerError(`Round submit RPC returned failure (new round): ${rpcResult.error}${isInternalError ? ` [${rpcResult.error_code}] at step "${rpcResult.step}": ${rpcResult.detail}` : ''}`, {
            action: 'submitGolfRoundComprehensive',
            roundId: newRound.id,
            playerId: player.id,
            userId: user.id,
            userEmail: user.email,
            holesCount: holesPayload.length,
            shotsCount,
            errorCode: rpcResult.error_code,
            errorDetails: rpcResult.step,
            extra: { rpcResult, path: 'new_round_rpc' },
          }, isInternalError ? 'critical' : 'error');

          if (isInternalError) {
            const fallbackResult = await attemptDirectSubmitFallback(
              newRound.id,
              'new_round_rpc',
              {
                source: 'rpc_result',
                error: rpcResult.error,
                errorCode: rpcResult.error_code,
                step: rpcResult.step,
                detail: rpcResult.detail,
              },
              true
            );
            if (!fallbackResult.success) {
              return fallbackResult;
            }

            detailWarnings = mergeRoundWarnings(detailWarnings, fallbackResult.warnings);
            round = { id: newRound.id };
          } else {
            return { success: false, error: rpcResult.error || 'Failed to submit round.' };
          }
        } else {
          // Log warnings from resilient detail inserts (round saved successfully)
          if (rpcResult?.warnings?.length > 0) {
            detailWarnings = rpcResult.warnings as string[];
            await logServerError(
              `Round submitted with ${rpcResult.warnings.length} detail warning(s)`,
              {
                action: 'submitGolfRoundComprehensive',
                roundId: newRound.id,
                playerId: player.id,
                userId: user.id,
                userEmail: user.email,
                extra: { warnings: rpcResult.warnings, path: 'new_round_rpc' },
              },
              'warning'
            );
          }

          round = { id: newRound.id };
        }
      }
    }

    // If this is a qualifier round, update the qualifier entry stats
    if (data.qualifierId) {
      try {
        await updateQualifierEntryStats(supabase, data.qualifierId, player.id);
      } catch (err) {
        await logServerError(`Failed to update qualifier entry stats after round submit: ${err instanceof Error ? err.message : String(err)}`, {
          action: 'submitGolfRoundComprehensive.qualifierStats',
          featureArea: 'qualifiers',
          roundId: round.id,
          playerId: player.id,
          userId: user.id,
          userEmail: user.email,
          extra: {
            qualifierId: data.qualifierId,
            stack: err instanceof Error ? err.stack : undefined,
          },
        }, 'warning');
      }
    }

    // 2026-05-17: closes audit P-HIGH-1. Previously this awaited the stats-
    // cache invalidation inside the user-facing response, adding 0.5–2s of
    // p99 latency to round submits. Move to after() so the user response
    // returns immediately; warnings are still logged from the after callback.
    const cacheRoundId = round.id;
    const cachePlayerId = player.id;
    const cacheHolesCount = holesPayload.length;
    const cacheShotsCount = shotsCount;
    const cacheUserId = user.id;
    const cacheUserEmail = user.email;
    after(async () => {
      try {
        const cacheResult = await invalidateOnRoundComplete(cachePlayerId, cacheRoundId);
        if (cacheResult.warnings.length > 0) {
          await logServerError(
            `Stats cache warnings after round submit: ${cacheResult.warnings.join(' | ')}`,
            {
              action: 'submitGolfRoundComprehensive',
              roundId: cacheRoundId,
              playerId: cachePlayerId,
              userId: cacheUserId,
              userEmail: cacheUserEmail,
              holesCount: cacheHolesCount,
              shotsCount: cacheShotsCount,
              extra: { warnings: cacheResult.warnings },
            },
            'warning'
          );
        }
      } catch (err) {
        await logServerError(`Failed to invalidate stats cache after round submit: ${err instanceof Error ? err.message : String(err)}`, {
          action: 'submitGolfRoundComprehensive.invalidateStatsCache',
          featureArea: 'stats_cache',
          roundId: cacheRoundId,
          playerId: cachePlayerId,
          userId: cacheUserId,
          userEmail: cacheUserEmail,
          extra: {
            stack: err instanceof Error ? err.stack : undefined,
          },
        }, 'critical');
      }
    });

    try {
      revalidatePath('/golf/dashboard');
      revalidatePath('/golf/dashboard/rounds');
      revalidatePath('/golf/dashboard/stats');
      // Engine-driven screens. LIVE-22: these paths were missing, so players
      // had to hard-reload CoachHelm / My Development to see post-round
      // insights, qualifier progress, or focus-area shifts.
      revalidatePath('/golf/dashboard/coachhelm');
      revalidatePath('/golf/dashboard/my-development');
      revalidatePath('/golf/dashboard/my-qualifiers');
      updateTag(CACHE_TAGS.DASHBOARD);
      updateTag(CACHE_TAGS.ROUNDS);
      updateTag(CACHE_TAGS.STATS);

      if (data.qualifierId) {
        revalidatePath('/golf/dashboard/qualifiers');
        revalidatePath(`/golf/dashboard/qualifiers/${data.qualifierId}`);
      }
    } catch (cacheErr) {
      await logServerError(`Next cache revalidation failed after round submit: ${cacheErr instanceof Error ? cacheErr.message : String(cacheErr)}`, {
        action: 'submitGolfRoundComprehensive.revalidatePaths',
        featureArea: 'stats_cache',
        roundId: round.id,
        playerId: player.id,
        userId: user.id,
        userEmail: user.email,
        extra: {
          qualifierId: data.qualifierId ?? null,
          stack: cacheErr instanceof Error ? cacheErr.stack : undefined,
        },
      }, 'warning');
    }

    // 2026-05-17: closes audit Finding 2 + A-NEW-6. Previously this fetched
    // /api/coachhelm/analyze-player with `keepalive: true`. That had three
    // problems: (1) an extra internal HTTP hop with cold-start risk;
    // (2) keepalive's lifetime guarantees are best-effort on Fluid Compute;
    // (3) the COACHHELM_INTERNAL_SECRET was a credential management surface.
    //
    // New: use Next.js `after()` so the trigger runs post-response in the same
    // function instance. postRoundTrigger writes terminal state to
    // golf_rounds.coachhelm_{analyzed,failed}_at so the safety-net cron can
    // recover deterministically if the after-callback dies.
    const backgroundPlayerId = player.id;
    const backgroundRoundId = round.id;
    after(async () => {
      const admin = createAdminClient();
      await postRoundTrigger(admin, {
        playerId: backgroundPlayerId,
        roundId: backgroundRoundId,
        triggerReason: 'round_submitted',
      });
    });

    // Log round submission event (fire-and-forget)
    logRoundSubmitted(user.id, user.email || '', round.id, {
      courseName: data.courseName,
      totalScore,
      scoreToPar: totalToPar,
      roundType: data.roundType,
      holesPlayed: data.holes.length,
    }).catch((err) => {
      logServerError(`logRoundSubmitted failed: ${err instanceof Error ? err.message : String(err)}`, {
        action: 'submitGolfRoundComprehensive.logRoundSubmitted',
        featureArea: 'rounds',
        extra: { roundId: round.id },
      });
    });

    // Push notification to coaches: player submitted a round (fire-and-forget)
    if (teamId) {
      (async () => {
        try {
          // Get player name for the notification
          const { data: playerInfo } = await supabase
            .from('golf_players')
            .select('first_name, last_name')
            .eq('id', player.id)
            .single();

          // Get coaches for this team via golf_team_coach_staff → golf_coaches (user_id).
          // golf_coaches has no team_id column; must join through the staff table.
          const { data: staffRows } = await supabase
            .from('golf_team_coach_staff')
            .select('coach:golf_coaches!inner(user_id)')
            .eq('team_id', teamId);

          const userIds = (staffRows ?? [])
            .map((row: { coach: { user_id: string | null } | null }) => row.coach?.user_id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0);

          if (userIds.length) {
            const { sendBulkPushNotification } = await import('@/lib/notifications/push');
            const playerName = playerInfo?.first_name && playerInfo?.last_name
              ? `${playerInfo.first_name} ${playerInfo.last_name}`
              : 'A player';
            await sendBulkPushNotification(
              'round_submitted',
              userIds,
              { playerName, courseName: data.courseName, totalScore, scoreToPar: totalToPar }
            );
          }
        } catch (pushErr) {
          await logServerError(`[Push] round_submitted notification failed: ${pushErr instanceof Error ? pushErr.message : String(pushErr)}`, { action: 'golf.submitGolfRoundComprehensive' });
        }
      })();
    }

    return { success: true, data: { roundId: round.id, warnings: detailWarnings } };

  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid round data. Please check your inputs.' };
    }
    await logServerError(`Round submit unexpected error: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'submitGolfRoundComprehensive.catch',
      extra: {
        stack: error instanceof Error ? error.stack : undefined,
        courseName: data.courseName,
        holesCount: data.holes?.length,
      },
    }, 'critical');
    return formatSafeErrorResponse(error);
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
    const tz = validatedData.timezoneOffset;
    const isAllDay = validatedData.allDay ?? true;
    const insertData: GolfEventInsertData = {
      team_id: teamId,
      title: validatedData.title,
      event_type: validatedData.eventType,
      // For all-day events, store with T00:00:00+00:00 to avoid timezone date shifts
      start_time: isAllDay
        ? `${validatedData.startDate}T00:00:00+00:00`
        : buildDateTimeString(validatedData.startDate, validatedData.startTime, tz),
      end_time: isAllDay
        ? `${validatedData.endDate || validatedData.startDate}T00:00:00+00:00`
        : validatedData.endTime
          ? buildDateTimeString(validatedData.endDate || validatedData.startDate, validatedData.endTime, tz)
          : validatedData.endDate ? `${validatedData.endDate}T00:00:00+00:00` : null,
      all_day: isAllDay,
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
      } catch {
        // Don't fail the whole operation if invitations fail
      }
    }

    // Notify all team players about the new event (in-app + email + push)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: teamMembers } = await (supabase as any)
        .from('golf_team_members')
        .select('player_id')
        .eq('team_id', teamId)
        .eq('status', 'active');

      if (teamMembers && teamMembers.length > 0) {
        const playerIds = teamMembers.map((m: { player_id: string }) => m.player_id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: players } = await (supabase as any)
          .from('golf_players')
          .select('id, user_id')
          .in('id', playerIds);

        const validPlayers = (players || []).filter(
          (p: { id: string; user_id: string | null }) => Boolean(p.user_id)
        ) as Array<{ id: string; user_id: string }>;
        const userIds = validPlayers.map((p) => p.user_id);

        if (userIds.length > 0) {
          // 1. In-app notifications (golf_calendar_notifications)
          const notifications = userIds.map((uid: string) => ({
            user_id: uid,
            event_id: event.id,
            notification_type: 'event_invitation',
            title: `New event: ${validatedData.title}`,
            message: `${validatedData.startDate}${validatedData.location ? ` at ${validatedData.location}` : ''}`,
            action_url: `/golf/dashboard/calendar`,
          }));

          // Use admin client to bypass RLS — coach is inserting notifications
          // for other users (team players), which is a system-level operation
          const adminClient = createAdminClient();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: notifError } = await (adminClient as any)
            .from('golf_calendar_notifications')
            .upsert(notifications, { onConflict: 'event_id,user_id,notification_type', ignoreDuplicates: true });

          if (notifError) {
            await logServerError(`createGolfEvent notification insert failed: ${notifError.message}`, {
              action: 'createGolfEvent.insertNotifications',
              featureArea: 'events',
              extra: { errorCode: notifError.code },
            });
          }

          // 2. Email notifications (fire-and-forget)
          const { sendBulkEmailNotification } = await import('@/lib/notifications/email');
          const { data: userRows } = await supabase
            .from('users')
            .select('id, email')
            .in('id', userIds);

          if (userRows) {
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://helmsportslabs.com';
            await sendBulkEmailNotification(
              'event_rsvp_reminder',
              userRows.filter(u => u.email).map(u => ({ id: u.id, email: u.email! })),
              {
                eventName: validatedData.title,
                eventDate: validatedData.startDate,
                location: validatedData.location || '',
                eventUrl: `${baseUrl}/golf/dashboard/calendar`,
              }
            ).catch((err) => {
              logServerError(`createGolfEvent email notification failed: ${err instanceof Error ? err.message : String(err)}`, {
                action: 'createGolfEvent.emailNotification',
                featureArea: 'events',
              });
            });
          }

          // 3. Push notifications (fire-and-forget)
          const { sendBulkPushNotification } = await import('@/lib/notifications/push');
          await sendBulkPushNotification('event_rsvp_reminder', userIds, {
            eventName: validatedData.title,
          }).catch((err) => {
            logServerError(`createGolfEvent push notification failed: ${err instanceof Error ? err.message : String(err)}`, {
              action: 'createGolfEvent.pushNotification',
              featureArea: 'events',
            });
          });
        }
      }
    } catch (notifErr) {
      await logServerError(`createGolfEvent notification creation failed: ${notifErr instanceof Error ? notifErr.message : String(notifErr)}`, {
        action: 'createGolfEvent.notifications',
        featureArea: 'events',
      });
    }

    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/calendar');
    updateTag(CACHE_TAGS.DASHBOARD);
    updateTag(CACHE_TAGS.CALENDAR);

    return { success: true, data: { eventId: event.id } };

  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid event data. Please check your inputs.' };
    }
    return formatSafeErrorResponse(error);
  }
}

// Validation schema for golf event updates
const golfEventUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  eventType: golfEventType.optional(),
  startDate: dateString.optional(),
  endDate: dateString.optional(),
  startTime: timeString.optional(),
  endTime: timeString.optional(),
  allDay: z.boolean().optional(),
  location: z.string().max(500).optional(),
  description: z.string().max(5000).optional(),
  requiresRsvp: z.boolean().optional(),
  rsvpDeadline: z.string().optional(),
  maxAttendees: z.number().int().positive().optional(),
  attendeeIds: z.array(z.string().uuid()).optional(),
  timezoneOffset: z.number().int().optional(),
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

    // Only coaches can update team events (matches createGolfEvent behavior)
    if (!coach) {
      return { success: false, error: 'Only coaches can update team events' };
    }

    const teamId = await getCoachTeamId(supabase, coach.organization_id);
    if (!teamId) {
      return { success: false, error: 'Coach not assigned to a team' };
    }

    // Verify event belongs to coach's team
    const { data: existingEvent } = await supabase
      .from('golf_events')
      .select('team_id')
      .eq('id', eventId)
      .single();

    if (!existingEvent) {
      return { success: false, error: 'Event not found' };
    }

    if (existingEvent.team_id !== teamId) {
      return { success: false, error: 'Access denied' };
    }

    // Validate input
    const validatedData = golfEventUpdateSchema.parse(data);

    const updateData: GolfEventUpdateData = { updated_at: new Date().toISOString() };

    if (validatedData.title !== undefined) updateData.title = validatedData.title;
    if (validatedData.eventType !== undefined) updateData.event_type = validatedData.eventType;
    // Combine date+time into start_time/end_time timestamptz with timezone offset
    // For all-day events, store with T00:00:00+00:00 to avoid timezone date shifts
    const tz = validatedData.timezoneOffset;
    const isAllDay = validatedData.allDay;
    if (validatedData.startDate !== undefined) {
      updateData.start_time = isAllDay
        ? `${validatedData.startDate}T00:00:00+00:00`
        : buildDateTimeString(validatedData.startDate, validatedData.startTime, tz);
    }
    // Only recalculate end_time when an end-related field was explicitly provided.
    // Previously, `|| isAllDay` caused end_time to be recomputed even when no end
    // fields changed, collapsing multi-day events to a single day.
    if (validatedData.endDate !== undefined || validatedData.endTime !== undefined) {
      const endDate = validatedData.endDate || validatedData.startDate;
      if (isAllDay) {
        updateData.end_time = endDate ? `${endDate}T00:00:00+00:00` : null;
      } else if (validatedData.endTime && endDate) {
        updateData.end_time = buildDateTimeString(endDate, validatedData.endTime, tz);
      } else if (endDate && !validatedData.endTime) {
        updateData.end_time = `${endDate}T00:00:00+00:00`;
      } else {
        updateData.end_time = null;
      }
    }
    if (validatedData.allDay !== undefined) updateData.all_day = validatedData.allDay;
    if (validatedData.location !== undefined) updateData.location = validatedData.location || null;
    if (validatedData.description !== undefined) updateData.description = validatedData.description || null;
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

    const { data: updatedRows, error } = await query.select('id');

    if (error) {
      return { success: false, error: 'Failed to update event' };
    }

    if (!updatedRows || updatedRows.length === 0) {
      return { success: false, error: 'Event could not be updated. You may not have permission to edit this event.' };
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
        } catch {
          // Don't fail the whole update if invitations fail
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

    // Notify team players about event update. Time / location / title /
    // type all matter to a player who's already RSVP'd — a drag-and-drop
    // reschedule is exactly the case where attendees need to hear about it.
    const meaningfulChange =
      validatedData.title !== undefined ||
      validatedData.location !== undefined ||
      validatedData.eventType !== undefined ||
      validatedData.startDate !== undefined ||
      validatedData.startTime !== undefined ||
      validatedData.endDate !== undefined ||
      validatedData.endTime !== undefined;
    if (teamId && meaningfulChange) {
      try {
        const { notifyEventUpdate } = await import('@/lib/calendar/rsvp');
        await notifyEventUpdate(eventId, supabase);
      } catch {
        // Don't fail update if notifications fail
      }
    }

    revalidatePath('/golf/dashboard/calendar');
    updateTag(CACHE_TAGS.DASHBOARD);
    updateTag(CACHE_TAGS.CALENDAR);
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

    // Only coaches can delete team events (matches createGolfEvent behavior)
    if (!coach) {
      return { success: false, error: 'Only coaches can delete team events' };
    }

    const teamId = await getCoachTeamId(supabase, coach.organization_id);
    if (!teamId) {
      return { success: false, error: 'Coach not assigned to a team' };
    }

    // Verify event belongs to coach's team
    const { data: existingEvent } = await supabase
      .from('golf_events')
      .select('team_id')
      .eq('id', eventId)
      .single();

    if (!existingEvent) {
      return { success: false, error: 'Event not found' };
    }

    if (existingEvent.team_id !== teamId) {
      return { success: false, error: 'Access denied' };
    }

    const deleteQuery = supabase
      .from('golf_events')
      .delete()
      .eq('id', eventId)
      .eq('team_id', teamId);

    const { data: deletedRows, error } = await deleteQuery.select('id');

    if (error) {
      return { success: false, error: 'Failed to delete event' };
    }

    if (!deletedRows || deletedRows.length === 0) {
      return { success: false, error: 'Event could not be deleted. You may not have permission to delete this event.' };
    }

    revalidatePath('/golf/dashboard/calendar');
    updateTag(CACHE_TAGS.DASHBOARD);
    updateTag(CACHE_TAGS.CALENDAR);
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
        // Only set when provided so omitted values fall back to DB defaults
        // (5 total / 1 coach-pick) — keeps the legacy create path byte-identical.
        ...(validatedData.selectionSlotsTotal !== undefined
          ? { selection_slots_total: validatedData.selectionSlotsTotal }
          : {}),
        ...(validatedData.selectionSlotsCoachPick !== undefined
          ? { selection_slots_coach_pick: validatedData.selectionSlotsCoachPick }
          : {}),
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
        status: 'entered',
      }));

      const { error: entriesError } = await supabase
        .from('golf_qualifier_entries')
        .insert(entries);

      if (entriesError) {
        return { success: false, error: 'Failed to add players to qualifier. Please try again.' };
      }
    }

    // Notify registered players (fire-and-forget)
    if (validatedData.playerIds.length > 0) {
      try {
        const { data: playerRows } = await supabase
          .from('golf_players')
          .select('user_id')
          .in('id', validatedData.playerIds);

        if (playerRows?.length) {
          const userIds = playerRows.map(p => p.user_id);
          const { data: userRows } = await supabase
            .from('users')
            .select('id, email')
            .in('id', userIds);

          if (userRows) {
            const formattedDate = validatedData.startDate
              ? new Date(validatedData.startDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
              : validatedData.startDate;

            await Promise.allSettled(
              userRows.map(u =>
                u.email
                  ? notifyQualifierCreated(u.id, u.email, validatedData.name, formattedDate, 1, qualifier.id)
                  : Promise.resolve()
              )
            );

            // Push notifications for qualifier creation
            const { sendBulkPushNotification } = await import('@/lib/notifications/push');
            await sendBulkPushNotification(
              'qualifier_created',
              userRows.map(u => u.id),
              { qualifierName: validatedData.name, startDate: formattedDate }
            ).catch(() => {});
          }
        }
      } catch (notifErr) {
        await logServerError(`createGolfQualifier notification failed: ${notifErr instanceof Error ? notifErr.message : String(notifErr)}`, {
          action: 'createGolfQualifier.notifications',
          featureArea: 'qualifiers',
        });
      }
    }

    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/qualifiers');
    updateTag(CACHE_TAGS.DASHBOARD);

    return { success: true, data: { qualifierId: qualifier.id } };

  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid qualifier data. Please check your inputs.' };
    }
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

    // Verify coach owns this qualifier's team
    const { data: qualifier } = await supabase
      .from('golf_qualifiers')
      .select('team_id')
      .eq('id', qualifierId)
      .single();

    if (!qualifier) return { success: false, error: 'Qualifier not found' };

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    const { data: qualifierTeam } = await supabase
      .from('golf_teams')
      .select('organization_id')
      .eq('id', qualifier.team_id)
      .single();

    if (!coach || !qualifierTeam || coach.organization_id !== qualifierTeam.organization_id) {
      return { success: false, error: 'Unauthorized' };
    }

    const { error } = await supabase
      .from('golf_qualifiers')
      .update({ status })
      .eq('id', qualifierId);

    if (error) {
      return { success: false, error: 'Failed to update qualifier status. Please try again.' };
    }

    revalidatePath('/golf/dashboard/qualifiers');
    updateTag(CACHE_TAGS.DASHBOARD);

    return { success: true, data: undefined };

  } catch (error) {
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
    updateTag(CACHE_TAGS.DASHBOARD);

    return { success: true, data: { announcementId: announcement.id } };

  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid announcement data. Please check your inputs.' };
    }
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// PLAYER ACTIONS
// ============================================================================

export async function invitePlayerToTeam(
   
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
        joinCode += chars.charAt(randomInt(chars.length));
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
    updateTag(CACHE_TAGS.DASHBOARD);
    updateTag(CACHE_TAGS.ROSTER);
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

    const { updateRSVP, RSVPDeadlinePassedError } = await import('@/lib/calendar/rsvp');
    const { WriteIntegrityError } = await import('@/lib/calendar/write-integrity');
    try {
      await updateRSVP(eventId, player.id, status, supabase);
    } catch (err) {
      if (err instanceof RSVPDeadlinePassedError) {
        return { success: false, error: 'RSVP deadline has passed for this event.' };
      }
      // 2026-05-17: closes audit Finding 4 + Q-NEW-14. Previously this
      // catch was bare (`catch {}`) — every error returned the same
      // "Failed to update RSVP" string with nothing logged. Now we
      // discriminate, log via logServerError with context, and tell the
      // user something useful when RLS / a constraint denies the write.
      if (err instanceof WriteIntegrityError) {
        await logServerError(`respondToEvent: ${err.message}`, {
          action: 'respondToEvent.writeIntegrity',
          featureArea: 'calendar',
          playerId: player.id,
          extra: { eventId, status, underlying: err.underlying },
        }, 'warning');
        return {
          success: false,
          error: 'Could not record your RSVP. Please try again or contact your coach.',
        };
      }
      throw err;
    }

    revalidatePath('/golf/dashboard/calendar');
    updateTag(CACHE_TAGS.DASHBOARD);
    updateTag(CACHE_TAGS.CALENDAR);
    return { success: true, data: undefined };

  } catch (err) {
    await logServerError(`respondToEvent failed: ${err instanceof Error ? err.message : String(err)}`, {
      action: 'respondToEvent.unexpected',
      featureArea: 'calendar',
      extra: { stack: err instanceof Error ? err.stack : undefined },
    }, 'warning');
    return { success: false, error: 'Failed to update RSVP' };
  }
}

/**
 * Coach-triggered reminder: drops in-app rows into golf_calendar_notifications
 * for the supplied players, deduplicated against the cron-generated reminders
 * by a distinct notification_type. Use admin client because notifications are
 * inserted on behalf of other users.
 */
export async function sendEventReminderToPlayers(
  eventId: string,
  playerIds: string[],
): Promise<ActionResult<{ sent: number }>> {
  if (!eventId || playerIds.length === 0) {
    return { success: false, error: 'Event id and at least one player required' };
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { data: event } = await supabase
      .from('golf_events')
      .select('id, title, start_time, location, team_id')
      .eq('id', eventId)
      .maybeSingle();
    if (!event) return { success: false, error: 'Event not found' };

    // Authorize: caller must coach this event's team. Without this gate any
    // authenticated user could spam reminders into any team's notification
    // table (we use the admin client below, which bypasses RLS).
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!coach) {
      return { success: false, error: 'Only this team\'s coaches can send reminders' };
    }
    const { data: staffRow } = await supabase
      .from('golf_team_coach_staff')
      .select('id')
      .eq('team_id', event.team_id)
      .eq('coach_id', coach.id)
      .maybeSingle();
    if (!staffRow) {
      return { success: false, error: 'Only this team\'s coaches can send reminders' };
    }

    // Restrict the recipient set to players who actually belong to this
    // event's team. Without this, a coach of team A could pass arbitrary
    // playerIds (e.g. UUIDs from team B) and admin-bypass-insert
    // notifications targeting other teams' players.
    const { data: teamPlayers } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', event.team_id)
      .eq('status', 'active')
      .in('player_id', playerIds);
    const allowedPlayerIds = (teamPlayers ?? [])
      .map((m) => m.player_id)
      .filter((id): id is string => Boolean(id));
    if (allowedPlayerIds.length === 0) {
      return { success: true, data: { sent: 0 } };
    }

    const { data: players } = await supabase
      .from('golf_players')
      .select('id, user_id')
      .in('id', allowedPlayerIds);

    const userIds = (players ?? [])
      .map((p) => p.user_id)
      .filter((u): u is string => Boolean(u));
    if (userIds.length === 0) {
      return { success: true, data: { sent: 0 } };
    }

    const start = new Date(event.start_time);
    const timeStr = start.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    const message = event.location
      ? `${timeStr} at ${event.location}`
      : timeStr;

    const { createAdminClient } = await import('@/lib/supabase/admin');
    const adminClient = createAdminClient();

    const rows = userIds.map((uid) => ({
      user_id: uid,
      event_id: eventId,
      notification_type: 'event_reminder_manual' as const,
      title: `Reminder: ${event.title}`,
      message,
      action_url: `/golf/dashboard/calendar?event=${eventId}`,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (adminClient as any)
      .from('golf_calendar_notifications')
      .upsert(rows, {
        onConflict: 'event_id,user_id,notification_type',
        ignoreDuplicates: false,
      });

    if (error) {
      await logServerError(`sendEventReminderToPlayers failed: ${error.message}`, {
        action: 'sendEventReminderToPlayers',
        featureArea: 'calendar',
        extra: { eventId, count: userIds.length },
      });
      return { success: false, error: 'Failed to send reminders' };
    }

    revalidatePath('/golf/dashboard/calendar');
    revalidatePath('/golf/dashboard/notifications');
    return { success: true, data: { sent: userIds.length } };
  } catch (err) {
    await logServerError(`sendEventReminderToPlayers error: ${err instanceof Error ? err.message : String(err)}`, {
      action: 'sendEventReminderToPlayers',
      featureArea: 'calendar',
      extra: { eventId },
    });
    return { success: false, error: 'Failed to send reminders' };
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');

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

    // Serialize Date objects in suggestions to ISO strings for client transport
    const serialized: ConflictResult = {
      ...result as unknown as ConflictResult,
      suggestions: ((result as unknown as ConflictResult).suggestions || []).map(s => ({
        start: s.start instanceof Date ? s.start.toISOString() : s.start,
        end: s.end instanceof Date ? s.end.toISOString() : s.end,
      })),
    };
    return { success: true, data: serialized };

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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');

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

    // Defense-in-depth: require the caller to share at least one team with
    // the target before exposing busy periods. RLS on the underlying tables
    // already protects most surfaces, but golf_player_classes has its own
    // policy and an explicit overlap check stops cross-team probing at the
    // action layer.
    const { data: callerCoach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .maybeSingle();
    const { data: callerPlayer } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    const callerTeamIds = new Set<string>();
    if (callerCoach?.organization_id) {
      const { data: coachTeams } = await supabase
        .from('golf_teams')
        .select('id')
        .eq('organization_id', callerCoach.organization_id);
      for (const t of coachTeams ?? []) callerTeamIds.add(t.id as string);
    }
    if (callerPlayer) {
      const { data: playerTeams } = await supabase
        .from('golf_team_members')
        .select('team_id')
        .eq('player_id', callerPlayer.id)
        .eq('status', 'active');
      for (const m of playerTeams ?? []) {
        if (m.team_id) callerTeamIds.add(m.team_id as string);
      }
    }

    const targetTeamIds = new Set<string>();
    const { data: targetPlayerRow } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    if (targetPlayerRow) {
      const { data: targetMemberships } = await supabase
        .from('golf_team_members')
        .select('team_id')
        .eq('player_id', targetPlayerRow.id)
        .eq('status', 'active');
      for (const m of targetMemberships ?? []) {
        if (m.team_id) targetTeamIds.add(m.team_id as string);
      }
    }
    const { data: targetCoachRow } = await supabase
      .from('golf_coaches')
      .select('organization_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (targetCoachRow?.organization_id) {
      const { data: targetCoachTeams } = await supabase
        .from('golf_teams')
        .select('id')
        .eq('organization_id', targetCoachRow.organization_id);
      for (const t of targetCoachTeams ?? []) targetTeamIds.add(t.id as string);
    }

    const sharesTeam = Array.from(callerTeamIds).some((id) => targetTeamIds.has(id));
    if (!sharesTeam) {
      return { success: false, error: 'Not authorized to view this schedule' };
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

  } catch {
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('golf_calendar_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('user_id', user.id);

    revalidatePath('/golf/dashboard');
    return { success: true, data: undefined };

  } catch {
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
  } catch {
    return { success: false, error: 'Failed to fetch RSVP status' };
  }
}

/**
 * Get RSVP summary for an event (coach view)
 */
export async function getEventRSVP(eventId: string): Promise<ActionResult<RSVPStats>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');

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
    updateTag(CACHE_TAGS.CALENDAR);

    return { success: true, data: { id: blockedTime.id } };

  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid blocked time data' };
    }
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

    // Verify blocked time exists and belongs to this coach
    const { data: existing } = await supabase
      .from('golf_coach_blocked_time')
      .select('id')
      .eq('id', id)
      .eq('coach_id', coach.id)
      .maybeSingle();

    if (!existing) {
      return { success: false, error: 'Blocked time not found' };
    }

    // Delete blocked time
    const { error } = await supabase
      .from('golf_coach_blocked_time')
      .delete()
      .eq('id', id)
      .eq('coach_id', coach.id);

    if (error) {
      return { success: false, error: 'Failed to delete blocked time' };
    }

    revalidatePath('/golf/dashboard/calendar');
    updateTag(CACHE_TAGS.CALENDAR);

    return { success: true, data: undefined };

  } catch (error) {
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

    // Verify blocked time exists and belongs to this coach
    const { data: existing } = await supabase
      .from('golf_coach_blocked_time')
      .select('id')
      .eq('id', id)
      .eq('coach_id', coach.id)
      .maybeSingle();

    if (!existing) {
      return { success: false, error: 'Blocked time not found' };
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

    // Update blocked time
    const { error } = await supabase
      .from('golf_coach_blocked_time')
      .update(updates)
      .eq('id', id)
      .eq('coach_id', coach.id);

    if (error) {
      return { success: false, error: 'Failed to update blocked time' };
    }

    revalidatePath('/golf/dashboard/calendar');
    updateTag(CACHE_TAGS.CALENDAR);

    return { success: true, data: undefined };

  } catch (error) {
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
  qualifierRoundNumber?: number;
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
  // Optimistic locking: pass the round's updated_at from last fetch/save
  // to detect concurrent edits from another device/tab
  expectedUpdatedAt?: string;
}

/**
 * Save an incomplete round to database
 * Status will be 'in_progress' and stats will NOT be calculated
 *
 * For existing rounds, uses an atomic RPC (save_partial_round_atomic) that wraps
 * delete+insert in a single DB transaction to prevent data loss on partial failures.
 */
export async function savePartialRound(
  data: PartialRoundData,
  existingRoundId?: string
): Promise<ActionResult<{ roundId: string; updatedAt?: string; warnings?: string[] }>> {
  try {
    // Validate input with Zod
    const validated = partialRoundSchema.safeParse(data);
    if (!validated.success) {
      const firstError = validated.error.issues[0];
      const detail = `${firstError?.path.join('.')} — ${firstError?.message}`;
      void logServerError(`Auto-save validation failed: ${detail}`, {
        action: 'savePartialRound',
        featureArea: 'shot_tracking',
        extra: {
          courseName: data.courseName,
          currentHole: data.currentHole,
          zodErrors: validated.error.issues.slice(0, 5).map(i => `${i.path.join('.')}: ${i.message}`),
        },
      }, 'warning');
      return { success: false, error: `Validation error: ${detail}` };
    }

    // Bug #3: Clamp currentHole to holesToPlay for 9-hole rounds
    if (data.currentHole && data.holesToPlay) {
      data.currentHole = Math.min(data.currentHole, data.holesToPlay);
    }

    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      void logServerError('Auto-save failed: user session expired mid-round', {
        action: 'savePartialRound',
        featureArea: 'shot_tracking',
        roundId: existingRoundId,
        extra: { courseName: data.courseName, currentHole: data.currentHole },
      }, 'error');
      return { success: false, error: 'You must be signed in' };
    }

    // Get player record
    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!player) {
      void logServerError('Auto-save failed: player profile not found', {
        action: 'savePartialRound',
        featureArea: 'shot_tracking',
        roundId: existingRoundId,
        userId: user.id,
        userEmail: user.email,
        extra: { courseName: data.courseName, currentHole: data.currentHole },
      }, 'error');
      return { success: false, error: 'Player profile not found' };
    }

    const teamId = await getPlayerTeamId(supabase, player.id);
    const resolvedCourseId = await resolveCourseId(supabase, data.courseName, data.courseId);

    const roundData = {
      player_id: player.id,
      team_id: teamId,
      course_id: resolvedCourseId,
      course_name: data.courseName,
      course_city: data.courseCity || null,
      course_state: data.courseState || null,
      course_rating: data.courseRating || null,
      course_slope: data.courseSlope || null,
      tees_played: data.teesPlayed || null,
      round_type: data.roundType,
      round_date: data.roundDate,
      status: 'in_progress' as const,
      current_hole: data.currentHole || null,
      holes_played: data.holesToPlay || 18,
      qualifier_id: data.qualifierId || null,
      qualifier_round_number: data.qualifierRoundNumber || null,
      total_score: null,
      score_to_par: null,
      total_putts: null,
      total_fairways_hit: null,
      total_fairways: null,
      total_gir: null,
      total_gir_possible: null,
      // Persist hole configs in draft_data so the continue page can restore
      // correct pars/yardages for uncompleted holes
      draft_data: {
        step: 'tracking',
        holes: data.holeConfigs?.map(h => ({
          number: h.holeNumber,
          par: h.par,
          yardage: h.yardage || 0,
        })),
        currentHoleIndex: (data.currentHole || 1) - 1,
      },
    };

    // Build hole data
    const completedHoles = data.holes.filter((hole): hole is HoleStats => Boolean(hole));
    const holeConfigs = (data.holeConfigs && data.holeConfigs.length > 0)
      ? data.holeConfigs
      : completedHoles.map(hole => ({
        holeNumber: hole.holeNumber,
        par: hole.par,
        yardage: hole.yardage ?? null,
      }));

    const completedHolesByNumber = new Map<number, HoleStats>(
      completedHoles.map(hole => [hole.holeNumber, hole])
    );

    const holesPayload = holeConfigs.map(config => {
      const completed = completedHolesByNumber.get(config.holeNumber);
      if (completed) {
        return {
          hole_number: completed.holeNumber,
          par: completed.par,
          yardage: completed.yardage ?? config.yardage ?? null,
          score: completed.score,
          putts: completed.putts,
          fairway_hit: completed.fairwayHit ?? null,
          gir: completed.greenInRegulation ?? null,
          penalty_strokes: completed.penaltyStrokes ?? null,
          up_and_down: completed.scrambleAttempt ? completed.scrambleMade : null,
          sand_save: completed.sandSaveAttempt ? completed.sandSaveMade : null,
        };
      }
      return {
        hole_number: config.holeNumber,
        par: config.par,
        yardage: config.yardage ?? null,
        score: null,
        putts: null,
        fairway_hit: null,
        gir: null,
        penalty_strokes: null,
        up_and_down: null,
        sand_save: null,
      };
    });

    // Build shots payload — grouped by hole_number
    const holesWithShotsByNumber = new Map<number, ShotRecord[]>();
    for (const hole of data.holes) {
      if (hole?.shots && hole.shots.length > 0) {
        holesWithShotsByNumber.set(hole.holeNumber, hole.shots);
      }
    }
    for (const hole of data.inProgressShots || []) {
      if (hole.shots.length === 0) continue;
      if (!holesWithShotsByNumber.has(hole.holeNumber)) {
        holesWithShotsByNumber.set(hole.holeNumber, hole.shots);
      }
    }

    const shotsPayload = Array.from(holesWithShotsByNumber.entries()).map(
      ([holeNumber, shots]) => ({
        hole_number: holeNumber,
        shots: shots.map(shot => ({
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
          miss_direction: shot.missDirection ?? null,
          putt_break: shot.puttBreak ?? null,
          putt_slope: shot.puttSlope ?? null,
          putt_distance_feet: derivePuttDistanceFeet(shot),
          putt_made: derivePuttMade(shot),
          is_penalty: shot.isPenalty,
          penalty_type: shot.penaltyType ?? null,
        })),
      })
    );

    // Build putt and approach detail payloads (mirrors submitGolfRoundComprehensive)
    const puttDetailsPayload: Array<{
      hole_number: number;
      shot_number: number;
      miss_tags: string[];
      break_direction: string | null;
      distance_feet: number | null;
      made: boolean;
    }> = [];
    const approachDetailsPayload: Array<{
      hole_number: number;
      shot_number: number;
      miss_direction: string | null;
      lie_type: string | null;
      distance_from_green_yards: number | null;
    }> = [];

    for (const [holeNumber, shots] of holesWithShotsByNumber) {
      for (const shot of shots) {
        if (shot.shotType === 'putting') {
          const rawDist = shot.puttDistanceFeet ?? derivePuttDistanceFeet(shot);
          puttDetailsPayload.push({
            hole_number: holeNumber,
            shot_number: shot.shotNumber,
            miss_tags: shot.puttMissTags || [],
            break_direction: shot.puttBreak || null,
            distance_feet: rawDist != null ? Math.min(rawDist, 500) : null,
            made: shot.result === 'hole',
          });
        }

        // Include tee shots on par-3s as approach shots (they ARE the approach)
        const holeData = completedHolesByNumber.get(holeNumber);
        const isApproachShot = shot.shotType === 'approach' ||
          shot.shotType === 'around_green' ||
          (shot.shotType === 'tee' && holeData?.par === 3);

        if (isApproachShot &&
            shot.result !== 'green' && shot.result !== 'hole') {
          approachDetailsPayload.push({
            hole_number: holeNumber,
            shot_number: shot.shotNumber,
            miss_direction: shot.approachMissDirection || null,
            lie_type: toDbLieType(shot.approachMissLieType),
            distance_from_green_yards: shot.distanceToHoleAfter != null
              ? (shot.distanceUnitAfter === 'feet'
                ? Math.round(shot.distanceToHoleAfter / 3)
                : shot.distanceToHoleAfter)
              : null,
          });
        }
      }
    }

    let roundId: string;

    if (existingRoundId) {
      // Use atomic RPC — wraps delete+insert in a single transaction
      // RPC not in generated types yet — use type escape
      const rpcParams: Record<string, unknown> = {
        p_round_id: existingRoundId,
        p_round_data: roundData,
        p_holes: holesPayload,
        p_shots: shotsPayload,
        p_putt_details: puttDetailsPayload,
        p_approach_details: approachDetailsPayload,
      };

      // Optimistic locking: pass expected updated_at to detect concurrent edits
      if (data.expectedUpdatedAt) {
        rpcParams.p_expected_updated_at = data.expectedUpdatedAt;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rpcResult, error: rpcError } = await (supabase as any).rpc(
        'save_partial_round_atomic',
        rpcParams
      );

      if (rpcError) {
        logError(new Error(rpcError.message), undefined, { action: 'savePartialRound.rpc' });
        await logServerError(`Auto-save RPC failed: ${rpcError.message}`, {
          action: 'savePartialRound',
          roundId: existingRoundId,
          playerId: player.id,
          userId: user.id,
          userEmail: user.email,
          holesCount: holesPayload.length,
          shotsCount: shotsPayload.reduce((sum, g) => sum + g.shots.length, 0),
          errorCode: rpcError.code,
          errorHint: rpcError.hint,
          errorDetails: rpcError.details,
          extra: { courseName: data.courseName, currentHole: data.currentHole },
        });
        return { success: false, error: 'Failed to save round. Please try again.' };
      }

      if (rpcResult && !rpcResult.success) {
        // Return conflict errors with a distinct error key so the UI can prompt a reload
        if (rpcResult.error === 'conflict') {
          return { success: false, error: 'conflict', };
        }
        // Already-completed rounds are an expected race condition (auto-save fires
        // after submit completes) — return early without logging an error event.
        if (typeof rpcResult.error === 'string' && rpcResult.error.includes('already been completed')) {
          return { success: false, error: rpcResult.error };
        }
        void logServerError(`Auto-save RPC returned failure: ${rpcResult.error || 'unknown'}`, {
          action: 'savePartialRound',
          featureArea: 'shot_tracking',
          roundId: existingRoundId,
          playerId: player.id,
          userId: user.id,
          userEmail: user.email,
          extra: { rpcError: rpcResult.error, courseName: data.courseName, currentHole: data.currentHole },
        }, 'error');
        return { success: false, error: rpcResult.error || 'Failed to save round.' };
      }

      // Log warnings from resilient detail inserts (round saved successfully)
      const partialWarnings = rpcResult?.warnings?.length > 0
        ? (rpcResult.warnings as string[])
        : undefined;
      if (partialWarnings) {
        await logServerError(
          `Partial round saved with ${partialWarnings.length} detail warning(s)`,
          {
            action: 'savePartialRound',
            roundId: existingRoundId,
            playerId: player.id,
            userId: user.id,
            userEmail: user.email,
            extra: { warnings: partialWarnings, courseName: data.courseName },
          },
          'warning'
        );
      }

      roundId = existingRoundId;

      // Extract updated_at from RPC result for optimistic locking
      const rpcUpdatedAt = rpcResult?.updated_at as string | undefined;
      if (rpcUpdatedAt) {
        // NOTE: Do NOT call revalidatePath/updateTag here. Auto-save runs every
        // ~15s and triggering page revalidation on each save causes the Next.js
        // router to refetch layouts, which races with subsequent server action
        // calls and produces "An unexpected response was received from the server"
        // errors. Revalidation happens when the round is actually submitted via
        // submitGolfRoundComprehensive.
        return { success: true, data: { roundId, updatedAt: rpcUpdatedAt, warnings: partialWarnings } };
      }
    } else {
      // Check for existing in_progress round to avoid creating duplicates
      const { data: existingRound } = await supabase
        .from('golf_rounds')
        .select('id')
        .eq('player_id', player.id)
        .eq('status', 'in_progress')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let round: { id: string } | null = null;
      if (existingRound) {
        // Update the existing in-progress round — ONLY if still in_progress
        // (prevents reverting a round that was just completed by submit)
        const { data: updatedRound, error: updateError } = await supabase
          .from('golf_rounds')
          .update(roundData)
          .eq('id', existingRound.id)
          .eq('player_id', player.id)
          .eq('status', 'in_progress')
          .select()
          .maybeSingle();
        if (updateError) {
          logError(new Error(updateError.message), undefined, { action: 'savePartialRound.updateExisting' });
          await logServerError(`Auto-save update failed: ${updateError.message}`, {
            action: 'savePartialRound.updateExisting',
            roundId: existingRound.id,
            playerId: player.id,
            userId: user.id,
            userEmail: user.email,
            errorCode: updateError.code,
            errorHint: updateError.hint,
            errorDetails: updateError.details,
          });
          return { success: false, error: 'Failed to save round. Please try again.' };
        }
        if (!updatedRound) {
          // Round was completed by submit — don't create a new one, just return success
          return { success: true, data: { roundId: existingRound.id } };
        }
        round = updatedRound;
      }

      if (!round) {
        // Create new round with cleanup on partial failure
        const { data: newRound, error: roundError } = await supabase
          .from('golf_rounds')
          .insert(roundData)
          .select()
          .single();

        if (roundError) {
          logError(new Error(roundError.message), undefined, { action: 'savePartialRound.insertRound' });
          await logServerError(`Auto-save insert round failed: ${roundError.message}`, {
            action: 'savePartialRound.insertRound',
            playerId: player.id,
            userId: user.id,
            userEmail: user.email,
            errorCode: roundError.code,
            errorDetails: roundError.details,
          });
          return { success: false, error: 'Failed to save round. Please try again.' };
        }
        round = newRound;
      }

      roundId = round.id;

      // Upsert holes and shots — feedback_golf_no_destructive_writes:
      // never delete the user's existing data before the replacement is
      // durable. Upsert relies on UNIQUE(round_id, hole_number) from
      // migration 021 and UNIQUE(round_id, hole_number, shot_number)
      // from migration 20260304000003. Orphan trim runs AFTER all
      // upserts succeed so a mid-save failure leaves prior data intact.
      if (holesPayload.length > 0) {
        const holesData = holesPayload.map(h => ({ round_id: roundId, ...h }));
        const { data: insertedHoles, error: holesError } = await supabase
          .from('golf_holes')
          .upsert(holesData, { onConflict: 'round_id,hole_number' })
          .select('id, hole_number');

        if (holesError) {
          logError(new Error(holesError.message), undefined, { action: 'savePartialRound.insertHoles' });
          await logServerError(`Auto-save insert holes failed: ${holesError.message}`, {
            action: 'savePartialRound.insertHoles',
            roundId,
            playerId: player.id,
            userId: user.id,
            userEmail: user.email,
            holesCount: holesPayload.length,
            errorCode: holesError.code,
            errorDetails: holesError.details,
          });
          // Only clean up in_progress rounds — never delete a completed round
          const { error: cleanupErr } = await supabase
            .from('golf_rounds')
            .delete()
            .eq('id', roundId)
            .eq('status', 'in_progress');
          if (cleanupErr) {
            await logServerError(`Auto-save cleanup delete (holes) failed: ${cleanupErr.message}`, {
              action: 'savePartialRound.insertHoles.cleanup',
              roundId,
              errorCode: cleanupErr.code,
            });
          }
          return { success: false, error: 'Failed to save hole data. Please try again.' };
        }

        if (insertedHoles) {
          const holeIdMap = new Map(insertedHoles.map(h => [h.hole_number, h.id]));

          for (const group of shotsPayload) {
            const holeId = holeIdMap.get(group.hole_number);
            if (!holeId) continue;

            const shotsData = group.shots.map(shot => ({
              round_id: roundId,
              hole_id: holeId,
              hole_number: group.hole_number,
              ...shot,
            }));

            // Upsert on (round_id, hole_number, shot_number) — see migration
            // 20260304000003 for the UNIQUE constraint. Prior code did .insert()
            // which only worked because holes were deleted first (and cascaded
            // to shots). With the destructive delete removed, we must upsert
            // here too or re-saving the same shot_number would 409.
            const { data: insertedShots, error: shotsError } = await supabase
              .from('golf_shots')
              .upsert(shotsData, { onConflict: 'round_id,hole_number,shot_number' })
              .select('id, hole_number, shot_number');
            if (shotsError) {
              logError(new Error(shotsError.message), undefined, { action: 'savePartialRound.insertShots' });
              await logServerError(`Auto-save insert shots failed: ${shotsError.message}`, {
                action: 'savePartialRound.insertShots',
                roundId,
                playerId: player.id,
                userId: user.id,
                userEmail: user.email,
                holesCount: holesPayload.length,
                shotsCount: group.shots.length,
                errorCode: shotsError.code,
                errorDetails: shotsError.details,
                extra: { holeNumber: group.hole_number },
              });
              // Only clean up in_progress rounds — never delete a completed round
              const { error: cleanupErr } = await supabase
                .from('golf_rounds')
                .delete()
                .eq('id', roundId)
                .eq('status', 'in_progress');
              if (cleanupErr) {
                await logServerError(`Auto-save cleanup delete (shots) failed: ${cleanupErr.message}`, {
                  action: 'savePartialRound.insertShots.cleanup',
                  roundId,
                  errorCode: cleanupErr.code,
                });
              }
              return { success: false, error: 'Failed to save shot data. Please try again.' };
            }

            // Insert putt_details and approach_miss_details for this hole's shots
            if (insertedShots && insertedShots.length > 0) {
              const shotIdMap = new Map(insertedShots.map(s => [`${s.hole_number}-${s.shot_number}`, s.id]));

              // Filter putt details for this hole
              const holePuttDetails = puttDetailsPayload.filter(p => p.hole_number === group.hole_number);
              for (const pd of holePuttDetails) {
                const shotIdForPutt = shotIdMap.get(`${pd.hole_number}-${pd.shot_number}`);
                if (shotIdForPutt) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const { error: puttErr } = await (supabase as any).from('putt_details').insert({
                    shot_id: shotIdForPutt,
                    miss_tags: pd.miss_tags || [],
                    break_direction: pd.break_direction,
                    distance_feet: pd.distance_feet,
                    made: pd.made,
                  }).select();
                  if (puttErr) { /* non-critical — putt detail enrichment only */ }
                }
              }

              // Filter approach details for this hole
              const holeApproachDetails = approachDetailsPayload.filter(a => a.hole_number === group.hole_number);
              for (const ad of holeApproachDetails) {
                const shotIdForApproach = shotIdMap.get(`${ad.hole_number}-${ad.shot_number}`);
                if (shotIdForApproach) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const { error: approachErr } = await (supabase as any).from('approach_miss_details').insert({
                    shot_id: shotIdForApproach,
                    miss_direction: ad.miss_direction,
                    lie_type: ad.lie_type,
                    distance_from_green_yards: ad.distance_from_green_yards,
                  }).select();
                  if (approachErr) { /* non-critical — approach detail enrichment only */ }
                }
              }
            }
          }
        }
      }
    }

    // Orphan trim — runs AFTER every upsert above has succeeded, so a
    // mid-save failure can never strand the user with deleted data. Any
    // trim error is logged but not surfaced: the user's current draft is
    // intact in DB, just slightly larger than their working set, and the
    // next autosave will trim again.
    if (holesPayload.length > 0) {
      const keepHoleNumbers = holesPayload.map(h => h.hole_number);

      const { error: trimHolesErr } = await supabase
        .from('golf_holes')
        .delete()
        .eq('round_id', roundId)
        .not('hole_number', 'in', `(${keepHoleNumbers.join(',')})`);
      if (trimHolesErr) {
        await logServerError(`Auto-save orphan-hole trim failed (non-fatal): ${trimHolesErr.message}`, {
          action: 'savePartialRound.trimHoles',
          roundId,
          errorCode: trimHolesErr.code,
        });
      }

      for (const group of shotsPayload) {
        const keepShotNumbers = group.shots.map(s => s.shot_number);
        if (keepShotNumbers.length === 0) continue;

        const { error: trimShotsErr } = await supabase
          .from('golf_shots')
          .delete()
          .eq('round_id', roundId)
          .eq('hole_number', group.hole_number)
          .not('shot_number', 'in', `(${keepShotNumbers.join(',')})`);
        if (trimShotsErr) {
          await logServerError(`Auto-save orphan-shot trim failed (non-fatal): ${trimShotsErr.message}`, {
            action: 'savePartialRound.trimShots',
            roundId,
            extra: { holeNumber: group.hole_number },
            errorCode: trimShotsErr.code,
          });
        }
      }
    }

    // NOTE: Do NOT call revalidatePath/updateTag here — see comment in the
    // RPC path above. Auto-save should be invisible to the router.

    return { success: true, data: { roundId, updatedAt: undefined as string | undefined } };

  } catch (err) {
    logCritical(err instanceof Error ? err : new Error(String(err)), { action: 'savePartialRound' });
    await logServerError(`Auto-save unexpected error: ${err instanceof Error ? err.message : String(err)}`, {
      action: 'savePartialRound.catch',
      extra: { stack: err instanceof Error ? err.stack : undefined },
    }, 'critical');
    return {
      success: false,
      error: 'Failed to save round. Please try again.'
    };
  }
}

/**
 * Delete an in-progress round
 */
export async function deleteInProgressRound(roundId: string): Promise<ActionResult<void>> {
  try {
    // Validate UUID format
    const validId = CommonSchemas.uuid.safeParse(roundId);
    if (!validId.success) {
      return { success: false, error: 'Invalid round ID' };
    }

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
    updateTag(CACHE_TAGS.ROUNDS);

    return { success: true, data: undefined };

  } catch (error) {
    await logServerError(
      `deleteInProgressRound failed: ${error instanceof Error ? error.message : String(error)}`,
      {
        action: 'golf.deleteInProgressRound',
        featureArea: 'golf_rounds',
        roundId,
        extra: { stack: error instanceof Error ? error.stack : undefined },
      }
    );
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
        rounds_completed,
        total_score,
        total_to_par,
        qualifier_id,
        qualifier:golf_qualifiers(
          id,
          name,
          description,
          course_name,
          start_date,
          end_date,
          status
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

    if (roundsResult.error) {
      return { success: false, error: 'Failed to load qualifier round history.' };
    }

    const rounds = (roundsResult.data as unknown) as Array<{
      qualifier_id: string | null;
      qualifier_round_number: number | null;
      total_score: number | null;
      score_to_par: number | null;
    }> | null;

    // Build result with progress info
    type QualifierEntry = {
      qualifier_id: string;
      rounds_completed: number | null;
      total_score: number | null;
      total_to_par: number | null;
      qualifier: {
        id: string;
        name: string;
        description: string | null;
        course_name: string | null;
        start_date: string;
        end_date: string | null;
        status: string;
      } | null;
    };
    const qualifiers: PlayerQualifierInfo[] = (entries as unknown as QualifierEntry[])
      .filter((e) => e.qualifier && typeof e.qualifier === 'object' && !('error' in e.qualifier))
      .map((entry) => {
        const q = entry.qualifier as {
          id: string;
          name: string;
          description: string | null;
          course_name: string | null;
          start_date: string;
          end_date: string | null;
          status: string;
        };

        // Get rounds for this qualifier
        const qualifierRounds = (rounds || []).filter((r) => r.qualifier_id === q.id);
        const completedRoundNumbers = qualifierRounds
          .filter((r) => r.qualifier_round_number !== null)
          .map((r) => r.qualifier_round_number as number)
          .sort((a, b) => a - b);

        const totalScore = qualifierRounds.reduce((sum, r) => sum + (r.total_score || 0), 0);
        const totalToPar = qualifierRounds.reduce((sum, r) => sum + (r.score_to_par || 0), 0);
        const roundsCompleted = qualifierRounds.length > 0
          ? qualifierRounds.length
          : (entry.rounds_completed ?? 0);
        const numRounds = (q as Record<string, unknown>).num_rounds as number | null ?? (q.status === 'completed'
          ? Math.max(roundsCompleted, 1)
          : Math.max(roundsCompleted + 1, 1));

        return {
          id: q.id,
          name: q.name,
          description: q.description,
          courseName: q.course_name,
          location: null,
          numRounds,
          holesPerRound: 18,
          startDate: q.start_date,
          endDate: q.end_date,
          status: (q.status || 'upcoming') as 'upcoming' | 'in_progress' | 'completed',
          showLiveLeaderboard: true,
          roundsCompleted,
          completedRoundNumbers,
          totalScore: qualifierRounds.length > 0 ? totalScore : (entry.total_score ?? null),
          totalToPar: qualifierRounds.length > 0 ? totalToPar : (entry.total_to_par ?? null),
        };
      });

    return { success: true, data: qualifiers };

  } catch {
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

  } catch {
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
  averageScore: number | null;
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
    type LeaderboardEntry = { player_id: string; player: { id: string; first_name: string; last_name: string; avatar_url: string | null } | null };
    const leaderboard: QualifierLeaderboardEntry[] = (entries as unknown as LeaderboardEntry[])
      .filter((e) => e.player && typeof e.player === 'object' && !('error' in e.player))
      .map((entry) => {
        const player = entry.player as {
          id: string;
          first_name: string;
          last_name: string;
          avatar_url: string | null;
        };

        const playerRounds = (rounds || [])
          .filter((r) => r.player_id === entry.player_id)
          .sort((a, b) => (a.qualifier_round_number || 0) - (b.qualifier_round_number || 0));

        const totalScore = playerRounds.reduce((sum, r) => sum + (r.total_score || 0), 0);
        const totalToPar = playerRounds.reduce((sum, r) => sum + (r.score_to_par || 0), 0);
        const roundsCompleted = playerRounds.length;
        // Per-round average for this qualifier (display only — ranking is by
        // cumulative to-par below). null, not 0, when the player has no
        // completed rounds so the UI renders "—" rather than a fake "0.0".
        const averageScore = roundsCompleted > 0 ? totalScore / roundsCompleted : null;

        const roundScores = playerRounds.map((r) => ({
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
      // College qualifying ranks by CUMULATIVE TO-PAR (lower is better) — to-par
      // normalizes rounds played on different-par setups across the window.
      // Players with no completed round sink to the bottom (never rank "even").
      // Ties broken by raw total strokes, then by more rounds completed.
      .sort((a, b) => {
        const aScored = a.roundsCompleted > 0;
        const bScored = b.roundsCompleted > 0;
        if (aScored !== bScored) return aScored ? -1 : 1;
        const aPar = a.totalToPar ?? Infinity;
        const bPar = b.totalToPar ?? Infinity;
        if (aPar !== bPar) return aPar - bPar;
        if (a.totalScore !== b.totalScore) return a.totalScore - b.totalScore;
        return b.roundsCompleted - a.roundsCompleted;
      });

    // Assign positions and mark ties
    let currentPosition = 1;
    for (let i = 0; i < leaderboard.length; i++) {
      const entry = leaderboard[i]!;

      if (i > 0) {
        const prevEntry = leaderboard[i - 1]!;
        // Ties are on cumulative to-par (the ranking key) — and only between
        // players who have actually posted a round. Two no-score players don't
        // "tie for last"; they're both unranked.
        const bothScored = entry.roundsCompleted > 0 && prevEntry.roundsCompleted > 0;
        if (bothScored && entry.totalToPar === prevEntry.totalToPar && entry.totalScore === prevEntry.totalScore) {
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

  } catch {
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

    // Filter out rounds with null total_score to avoid summing 0 in place of missing data
    const scoredRounds = rounds.filter((r): r is typeof r & { total_score: number } => r.total_score != null);

    const totalScore = scoredRounds.reduce((sum, r) => sum + r.total_score, 0);
    const totalToPar = scoredRounds.reduce((sum, r) => sum + (r.score_to_par ?? 0), 0);
    const roundsCompleted = scoredRounds.length;

    // Update all aggregate columns on the qualifier entry
    await supabase
      .from('golf_qualifier_entries')
      .update({
        score: totalScore,
        total_score: totalScore,
        total_to_par: totalToPar,
        rounds_completed: roundsCompleted,
      })
      .eq('qualifier_id', qualifierId)
      .eq('player_id', playerId);

  } catch {
    // Non-critical — continue
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
  courseId: string | null;
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

/** DB row shape for golf_player_courses.
 *  Extended fields (city, state, rating, slope, tees, holeConfigs) are stored
 *  as JSON inside the `notes` column because those columns don't exist on the table.
 */
interface SavedCourseRow {
  id: string;
  course_id: string | null;
  course_name: string;
  notes: string | null;
  last_played_at: string | null;
  created_at: string;
}

/** Shape of the JSON stored in the notes column */
interface SavedCourseNotes {
  city?: string | null;
  state?: string | null;
  rating?: number | null;
  slope?: number | null;
  tees?: string | null;
  holesPerRound?: number;
  holeConfigs?: SavedCourseHoleConfig[];
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

  // Fetch saved courses (table has extended columns not in generated types)
  const { data: courses, error } = await fromUntyped(supabase, 'golf_player_courses')
    .select('*')
    .eq('player_id', player.id)
    .order('last_played_at', { ascending: false });

  if (error) {
    return { success: false, error: 'Failed to load saved courses' };
  }

  // Transform to client format — extended fields are stored in the `notes` JSON column
  const savedCourses: SavedCourse[] = ((courses || []) as SavedCourseRow[]).map((course) => {
    let parsed: SavedCourseNotes = {};
    if (course.notes) {
      try { parsed = JSON.parse(course.notes) as SavedCourseNotes; } catch { /* ignore */ }
    }
    return {
      id: course.id,
      courseId: course.course_id ?? null,
      courseName: course.course_name,
      courseCity: parsed.city ?? null,
      courseState: parsed.state ?? null,
      courseRating: parsed.rating ?? null,
      courseSlope: parsed.slope ?? null,
      teesPlayed: parsed.tees ?? null,
      holesPerRound: parsed.holesPerRound ?? 18,
      holeConfigs: parsed.holeConfigs || [],
      lastUsedAt: course.last_played_at ?? '',
      createdAt: course.created_at ?? '',
    };
  });

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
  const { data: existing } = await fromUntyped(supabase, 'golf_player_courses')
    .select('id')
    .eq('player_id', player.id)
    .ilike('course_name', input.courseName)
    .maybeSingle();

  // Try to resolve course_id from golf_courses by name
  const resolvedCourseId = await resolveCourseId(supabase, input.courseName);

  // Course data with extended fields - stored as JSON in notes if extended columns don't exist
  const courseData = {
    player_id: player.id,
    course_id: resolvedCourseId,
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

  let result: { data: Record<string, unknown> | null; error: { message: string } | null };
  if (existing) {
    // Update existing course
    result = await fromUntyped(supabase, 'golf_player_courses')
      .update(courseData)
      .eq('id', existing.id)
      .select()
      .single();
  } else {
    // Insert new course
    result = await fromUntyped(supabase, 'golf_player_courses')
      .insert(courseData)
      .select()
      .single();
  }

  if (result.error) {
    return { success: false, error: 'Failed to save course configuration' };
  }

  const course = result.data as unknown as SavedCourseRow;
  let parsed: SavedCourseNotes = {};
  if (course.notes) {
    try { parsed = JSON.parse(course.notes) as SavedCourseNotes; } catch { /* ignore */ }
  }
  const savedCourse: SavedCourse = {
    id: course.id,
    courseId: course.course_id ?? null,
    courseName: course.course_name,
    courseCity: parsed.city ?? null,
    courseState: parsed.state ?? null,
    courseRating: parsed.rating ?? null,
    courseSlope: parsed.slope ?? null,
    teesPlayed: parsed.tees ?? null,
    holesPerRound: parsed.holesPerRound ?? 18,
    holeConfigs: parsed.holeConfigs || [],
    lastUsedAt: course.last_played_at ?? '',
    createdAt: course.created_at ?? '',
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
 * RecentPlayedCourse — a saved course enriched with the player's
 * historical round count. Used by the new-round quick-pick tile grid.
 */
export interface RecentPlayedCourse extends SavedCourse {
  /** Total finished/in-progress rounds the player has logged at this course */
  roundCount: number;
  /** ISO date of the most recent round at this course (falls back to lastUsedAt) */
  lastPlayedAt: string;
}

/**
 * Get the player's recently-played courses for the "New Round" quick-pick.
 *
 * Source of truth: `golf_player_courses` (the saved-course record). We
 * enrich each row with a play count derived from `golf_rounds` so the
 * tile can show "{N} rounds". Matching is by `course_id` when present,
 * otherwise case-insensitive `course_name`.
 *
 * Sorted by `last_played_at` DESC, capped to `limit` (default 8).
 */
export async function getRecentCoursesForPlayer(
  limit = 8,
): Promise<ActionResult<RecentPlayedCourse[]>> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'You must be logged in' };
  }

  const { data: player } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!player) {
    return { success: false, error: 'Player profile not found' };
  }

  // Pull saved courses for the player (ordered by last played)
  const { data: courses, error } = await fromUntyped(supabase, 'golf_player_courses')
    .select('*')
    .eq('player_id', player.id)
    .order('last_played_at', { ascending: false })
    .limit(limit);

  if (error) {
    return { success: false, error: 'Failed to load recent courses' };
  }

  const savedRows = (courses || []) as SavedCourseRow[];

  // Empty fast-path — no saved courses yet, no need to query rounds
  if (savedRows.length === 0) {
    return { success: true, data: [] };
  }

  // Pull this player's rounds in one shot so we can build a count map.
  // We only need the matching keys + round_date for fallback ordering.
  const { data: rounds } = await supabase
    .from('golf_rounds')
    .select('course_id, course_name, round_date')
    .eq('player_id', player.id);

  const roundsList = (rounds || []) as Array<{
    course_id: string | null;
    course_name: string | null;
    round_date: string | null;
  }>;

  // Build a count map keyed by course_id (preferred) and lowercased course_name
  const countById = new Map<string, number>();
  const lastDateById = new Map<string, string>();
  const countByName = new Map<string, number>();
  const lastDateByName = new Map<string, string>();

  for (const r of roundsList) {
    const date = r.round_date ?? '';
    if (r.course_id) {
      countById.set(r.course_id, (countById.get(r.course_id) ?? 0) + 1);
      const prev = lastDateById.get(r.course_id);
      if (!prev || (date && date > prev)) lastDateById.set(r.course_id, date);
    }
    if (r.course_name) {
      const key = r.course_name.toLowerCase().trim();
      countByName.set(key, (countByName.get(key) ?? 0) + 1);
      const prev = lastDateByName.get(key);
      if (!prev || (date && date > prev)) lastDateByName.set(key, date);
    }
  }

  const enriched: RecentPlayedCourse[] = savedRows.map((course) => {
    let parsed: SavedCourseNotes = {};
    if (course.notes) {
      try { parsed = JSON.parse(course.notes) as SavedCourseNotes; } catch { /* ignore */ }
    }

    // Resolve play count: prefer course_id match, fall back to course_name
    const nameKey = course.course_name.toLowerCase().trim();
    const roundCount = course.course_id
      ? (countById.get(course.course_id) ?? countByName.get(nameKey) ?? 0)
      : (countByName.get(nameKey) ?? 0);
    const derivedLastPlayed = course.course_id
      ? (lastDateById.get(course.course_id) ?? lastDateByName.get(nameKey))
      : lastDateByName.get(nameKey);

    return {
      id: course.id,
      courseId: course.course_id ?? null,
      courseName: course.course_name,
      courseCity: parsed.city ?? null,
      courseState: parsed.state ?? null,
      courseRating: parsed.rating ?? null,
      courseSlope: parsed.slope ?? null,
      teesPlayed: parsed.tees ?? null,
      holesPerRound: parsed.holesPerRound ?? 18,
      holeConfigs: parsed.holeConfigs ?? [],
      lastUsedAt: course.last_played_at ?? '',
      createdAt: course.created_at ?? '',
      roundCount,
      lastPlayedAt: derivedLastPlayed || course.last_played_at || '',
    };
  });

  return { success: true, data: enriched };
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
    // Validate UUID format
    const validId = CommonSchemas.uuid.safeParse(shotId);
    if (!validId.success) {
      return { success: false, error: 'Invalid shot ID' };
    }

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

    // Verify the round belongs to this player and is still in progress
    const { data: round, error: roundError } = await supabase
      .from('golf_rounds')
      .select('id, player_id, status')
      .eq('id', shot.round_id)
      .eq('player_id', player.id)
      .single();

    if (roundError || !round) {
      return { success: false, error: 'You do not have permission to delete this shot' };
    }

    // Prevent score tampering on completed/verified rounds
    if (round.status !== 'in_progress') {
      return { success: false, error: 'Cannot delete shots from a completed or verified round' };
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
    updateTag(CACHE_TAGS.ROUNDS);

    // 2026-05-17: closes audit P-HIGH-4. Previously this only invalidated
    // CACHE_TAGS.ROUNDS — leaving stats stale until the next round submit or
    // nightly roster sweep (up to ~22h). Now we also invalidate the stats
    // cache so coach corrections show up on the player's dashboard quickly.
    // Run via after() to avoid blocking the user response. player_id is
    // looked up via the round inside the callback (golf_shots has no
    // direct player_id column).
    const revalidateRoundId = shot.round_id;
    after(async () => {
      try {
        const admin = createAdminClient();
        const { data: roundRow } = await admin
          .from('golf_rounds')
          .select('player_id')
          .eq('id', revalidateRoundId)
          .single();
        if (roundRow?.player_id) {
          await invalidateOnRoundComplete(roundRow.player_id, revalidateRoundId);
        }
      } catch (err) {
        void logServerError(`deleteShot stats cache invalidation failed: ${err instanceof Error ? err.message : String(err)}`, {
          action: 'deleteShot.invalidateStatsCache',
          featureArea: 'stats_cache',
          roundId: revalidateRoundId,
        }, 'warning');
      }
    });

    return { success: true, data: undefined };

  } catch (error) {
    logError(error instanceof Error ? error : new Error(String(error)), undefined, { action: 'deleteShot' });
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
  putt_miss_tags?: string[] | null;
  approach_miss_direction?: string | null;
  approach_miss_lie_type?: string | null;
}

/**
 * Update a specific shot in a round
 */
export async function updateShot(
  shotId: string,
  data: ShotUpdateData
): Promise<ActionResult<void>> {
  try {
    // Validate UUID format
    const validId = CommonSchemas.uuid.safeParse(shotId);
    if (!validId.success) {
      return { success: false, error: 'Invalid shot ID' };
    }

    // Validate update data
    const validData = shotUpdateSchema.safeParse(data);
    if (!validData.success) {
      return { success: false, error: 'Invalid update data' };
    }

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

    // Verify the round belongs to this player and is still in progress
    const { data: round, error: roundError } = await supabase
      .from('golf_rounds')
      .select('id, player_id, status')
      .eq('id', shot.round_id)
      .eq('player_id', player.id)
      .single();

    if (roundError || !round) {
      return { success: false, error: 'You do not have permission to update this shot' };
    }

    // Bug #44: Prevent score tampering on completed/verified rounds
    if (round.status !== 'in_progress') {
      return { success: false, error: 'Cannot modify shots on a completed or verified round' };
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
    const { error: updateError } = await fromUntyped(supabase, 'golf_shots')
      .update(updateData)
      .eq('id', shotId);

    if (updateError) {
      return { success: false, error: 'Failed to update shot' };
    }

    // Upsert putt miss details (separate table, non-critical)
    if (data.putt_miss_tags !== undefined) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sb = supabase as any;
        const clampedDist = data.putt_distance_feet != null ? Math.min(data.putt_distance_feet, 500) : null;
        if (data.putt_miss_tags && data.putt_miss_tags.length > 0) {
          await sb.from('putt_details').upsert({
            shot_id: shotId,
            miss_tags: data.putt_miss_tags,
            break_direction: data.putt_break ?? null,
            distance_feet: clampedDist,
            made: data.putt_made ?? false,
          }, { onConflict: 'shot_id' });
        } else if (data.putt_made !== undefined) {
          // Still upsert for made putts (even with empty miss tags) to keep conversion data accurate
          await sb.from('putt_details').upsert({
            shot_id: shotId,
            miss_tags: [],
            break_direction: data.putt_break ?? null,
            distance_feet: clampedDist,
            made: data.putt_made,
          }, { onConflict: 'shot_id' });
        }
      } catch {
        // Table may not exist — non-critical
      }
    }

    // Upsert approach miss details (separate table, non-critical)
    if (data.approach_miss_direction !== undefined) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sb = supabase as any;
        if (data.approach_miss_direction) {
          await sb.from('approach_miss_details').upsert({
            shot_id: shotId,
            miss_direction: data.approach_miss_direction,
            lie_type: toDbLieType(data.approach_miss_lie_type),
          }, { onConflict: 'shot_id' });
        } else {
          // Clear approach miss details if direction was removed
          await sb.from('approach_miss_details').delete().eq('shot_id', shotId);
        }
      } catch {
        // Table may not exist — non-critical
      }
    }

    // Revalidate relevant paths
    revalidatePath('/golf/dashboard/rounds');
    revalidatePath(`/golf/dashboard/rounds/${shot.round_id}`);
    updateTag(CACHE_TAGS.ROUNDS);

    // 2026-05-17: closes audit P-HIGH-4 (same fix as deleteShot above).
    const revalidateRoundId = shot.round_id;
    after(async () => {
      try {
        const admin = createAdminClient();
        const { data: roundRow } = await admin
          .from('golf_rounds')
          .select('player_id')
          .eq('id', revalidateRoundId)
          .single();
        if (roundRow?.player_id) {
          await invalidateOnRoundComplete(roundRow.player_id, revalidateRoundId);
        }
      } catch (err) {
        void logServerError(`updateShot stats cache invalidation failed: ${err instanceof Error ? err.message : String(err)}`, {
          action: 'updateShot.invalidateStatsCache',
          featureArea: 'stats_cache',
          roundId: revalidateRoundId,
        }, 'warning');
      }
    });

    return { success: true, data: undefined };

  } catch (error) {
    logError(error instanceof Error ? error : new Error(String(error)), undefined, { action: 'updateShot' });
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
  putt_miss_tags: string[] | null;
  approach_miss_direction: string | null;
  approach_miss_lie_type: string | null;
  approach_distance_from_green: number | null;
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
    const validId = CommonSchemas.uuid.safeParse(roundId);
    if (!validId.success) {
      return { success: false, error: 'Invalid round ID' };
    }

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
          .eq('status', 'active')
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
        yardage,
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
        yardage: number | null;
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

    // Fetch putt_details and approach_miss_details for the round's shots
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const shotIds = (shots || []).map((s: { id: string }) => s.id);
    const puttDetailsByShot: Record<string, { miss_tags: string[] | null }> = {};
    const approachDetailsByShot: Record<string, { miss_direction: string | null; lie_type: string | null; distance_from_green_yards: number | null }> = {};

    if (shotIds.length > 0) {
      const [puttRes, approachRes] = await Promise.all([
        sb.from('putt_details')
          .select('shot_id, miss_tags')
          .in('shot_id', shotIds),
        sb.from('approach_miss_details')
          .select('shot_id, miss_direction, lie_type, distance_from_green_yards')
          .in('shot_id', shotIds),
      ]);

      for (const pd of (puttRes?.data || [])) {
        puttDetailsByShot[pd.shot_id] = { miss_tags: pd.miss_tags };
      }
      for (const ad of (approachRes?.data || [])) {
        approachDetailsByShot[ad.shot_id] = {
          miss_direction: ad.miss_direction,
          lie_type: ad.lie_type,
          distance_from_green_yards: ad.distance_from_green_yards,
        };
      }
    }

    // Group shots by hole_number, merging detail table data
    const shotsByHole: Record<number, ShotDetail[]> = {};
    for (const shot of (shots || [])) {
      if (!shotsByHole[shot.hole_number]) {
        shotsByHole[shot.hole_number] = [];
      }
      const holeShots = shotsByHole[shot.hole_number];
      const puttDetail = puttDetailsByShot[shot.id];
      const approachDetail = approachDetailsByShot[shot.id];
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
          putt_miss_tags: puttDetail?.miss_tags ?? null,
          approach_miss_direction: approachDetail?.miss_direction ?? null,
          approach_miss_lie_type: approachDetail?.lie_type ?? null,
          approach_distance_from_green: approachDetail?.distance_from_green_yards ?? null,
        });
      }
    }

    // Combine holes with their shots
    const holesWithShots: HoleReviewData[] = (holes || []).map((hole) => {
      const holeShots = shotsByHole[hole.hole_number] || [];
      const teeShot = holeShots.find(shot => shot.shot_type === 'tee');
      const firstPutt = holeShots.find(shot => shot.shot_type === 'putting');

      // SG-2: a putt distance is ALWAYS in feet. Distance recorded with
      // distance_unit_before === 'yards' was being ×3'd into impossible
      // 390-foot "putts". Treat the raw value as feet regardless of the stored
      // unit and clamp to a realistic max (a putt can't be 120ft+).
      let firstPuttDistance: number | null = null;
      if (firstPutt?.distance_to_hole_before != null) {
        firstPuttDistance = Math.min(Math.max(Math.round(firstPutt.distance_to_hole_before), 0), 120);
      }

      return {
        id: hole.id,
        hole_number: hole.hole_number,
        par: hole.par,
        yardage: hole.yardage ?? null,
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
        // Canonical scramble definition (matches the DB round-stats trigger):
        // attempt = missed GIR with a recorded score (gir=false AND score IS
        // NOT NULL); made = that attempt scored par or better. The old
        // up_and_down-based flag counted "has an up/down entry" as an attempt,
        // which both over- and under-counted vs every stats surface.
        scramble_attempt: hole.gir === false && hole.score !== null,
        scramble_made: hole.gir === false && hole.score !== null && hole.score <= hole.par,
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
    await logServerError(
      `getRoundShotDetails failed: ${error instanceof Error ? error.message : String(error)}`,
      {
        action: 'golf.getRoundShotDetails',
        featureArea: 'golf_rounds',
        roundId,
        extra: { stack: error instanceof Error ? error.stack : undefined },
      }
    );
    return formatSafeErrorResponse(error);
  }
}
