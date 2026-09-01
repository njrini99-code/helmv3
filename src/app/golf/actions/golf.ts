'use server';

import { randomInt } from 'crypto';
import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { derivePlayerQualifierProgress } from './qualifier-progress';
import { fromUntyped } from '@/lib/supabase/untyped';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { postRoundTrigger } from '@/lib/coachhelm/v2/post-round-trigger';
// Plain server module, NOT a 'use server' export surface — imported for use
// here, never re-exported (see the header of progress-drivers.ts).
import {
  evaluateAndPersistGoals,
  evaluateAndPersistFocusAreas,
} from '@/lib/golf/progress-drivers';
import { inngest, isInngestConfigured } from '@/lib/inngest/client';
import { revalidatePath, updateTag } from 'next/cache';
import { CACHE_TAGS } from '@/lib/cache/tags';
import type { HoleStats, ShotRecord } from '@/lib/types/golf';
import { z } from 'zod';
import {
  AuthorizationError,
  NotFoundError
} from '@/lib/auth/ownership';
// roundTypeToDb was a no-op (identity function) and has been removed.
// Frontend and DB both use 'practice' | 'qualifier' | 'tournament'.
import { formatSafeErrorResponse, CommonSchemas } from '@/lib/validation/server-action-validator';
import { notifyQualifierCreated } from '@/lib/notifications';
import type { RSVPStatus } from '@/lib/calendar/rsvp';
import { invalidateOnRoundComplete } from '@/lib/cache/golf-stats-calculator';
import { isPlausibleApproach } from '@/lib/golf/approach-plausibility';
// 2026-05-17: CoachHelm trigger now runs via after(postRoundTrigger) — see
// docs/architecture/coachhelm-evidence-contract.md and Plan 04. The previous
// HTTP self-call + keepalive approach was retired (audit Finding 2/A-NEW-6).
import { logRoundSubmitted } from '@/lib/admin-logger';
import { logServerError, logServerException, logServerEvent } from '@/lib/server-error-logger';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { maybeCaptureRlsDenial } from '@/lib/admin/rls-denial';
import { classifyProviderFault, providerFaultSeverity } from '@/lib/admin/provider-fault';
import { createAdminClient } from '@/lib/supabase/admin';
import { updateQualifierEntryStats } from '@/lib/golf/qualifier-standings';
import { expectRows } from '@/lib/supabase/expect-rows';
import { deriveLieAfterFromResult, deriveLieAfter } from '@/lib/utils/shot-helpers';
import type { Database, Json } from '@/lib/types/database';
import { getQualifierAutomaticTransition } from '@/lib/golf/qualifier-lifecycle';
import {
  createHelmFlightRecorder,
  recordRescuedStepOutcome,
  type HelmFlightRecorder,
  type StartHelmFlightRecorderInput,
} from '@/lib/observability/helm-flight-recorder';

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
  | { success: false; error: string; code?: string };

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
 * Normalize an RSVP deadline through the SAME timezone-offset convention that
 * start_time uses (buildDateTimeString). The UI sends datetime-local wall
 * time ("YYYY-MM-DDTHH:MM"); storing that verbatim made Postgres treat it as
 * UTC, shifting an ET coach's 6 PM deadline to 2 PM (audit finding #15).
 * Strings that already carry an explicit offset (Z or ±HH:MM) pass through.
 */
function buildRsvpDeadlineString(
  deadline: string | undefined | null,
  timezoneOffset?: number
): string | null {
  if (!deadline) return null;
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(deadline)) return deadline;
  const [date, time] = deadline.split('T');
  if (!date) return null;
  // datetime-local yields HH:MM (occasionally HH:MM:SS) — buildDateTimeString
  // accepts either; date-only deadlines resolve to midnight in the coach's tz.
  return buildDateTimeString(date, time || '00:00', timezoneOffset);
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
  requires_rsvp?: boolean | null;
  rsvp_deadline?: string | null;
  max_attendees?: number | null;
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

/**
 * This codebase has two words for the same patch of sand, and they are not
 * interchangeable by field:
 *
 *   lieBefore / result        accept 'sand'   and NOT 'bunker'
 *   approachMissLieType       accepts 'bunker' and NOT 'sand'
 *
 * Verified 2026-08-24 against production `golf_shots`: every stored lie is in
 * the 'sand' vocabulary, so nothing is corrupt today — but the UI layer maps
 * between the two in at least three places (`parseApproachMissLieType`,
 * `FairwayEditShotModal`, `approach-analytics`), and a single missed mapping
 * sends 'bunker' into a `lieBefore` that rejects it. That is a validation
 * failure caused entirely by our own inconsistent naming, and the player pays
 * for it mid-round.
 *
 * Accept both spellings and normalize. Reconciling the vocabulary properly is
 * still worth doing; until then this stops the mismatch reaching a player.
 */
const toLieVocabulary = (value: unknown) => (value === 'bunker' ? 'sand' : value);
const toMissLieVocabulary = (value: unknown) => (value === 'sand' ? 'bunker' : value);

const comprehensiveShotSchema = z.object({
  shotNumber: z.number().int().min(1),
  shotType: z.enum(['tee', 'approach', 'around_green', 'putting', 'penalty']),
  clubType: z.string().min(1),
  lieBefore: z.preprocess(toLieVocabulary, z.enum(['tee', 'fairway', 'rough', 'sand', 'green', 'other'])),
  distanceToHoleBefore: z.number().min(0).max(1000),
  distanceUnitBefore: z.enum(['yards', 'feet']),
  result: z.preprocess(toLieVocabulary, z.enum(['fairway', 'rough', 'sand', 'green', 'hole', 'other', 'penalty'])),
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
  approachMissLieType: z.preprocess(toMissLieVocabulary, z.enum(['fairway', 'rough', 'bunker', 'hazard']).optional()),
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

/**
 * One completed hole in an auto-save payload.
 *
 * Named (rather than inlined into `partialRoundSchema`) so a validation
 * failure can be re-run against THIS schema alone. When the array element
 * fails, Zod reports the issue at the element path (`holes.16`) and — for a
 * nullable/union wrapper — collapses the reason to a bare "Invalid input"
 * with no field path. Production logged exactly that three times on
 * 2026-08-23 (`holes.1`, `holes.6`, `holes.16`, each at `currentHole - 1`),
 * which told nobody which field was actually wrong. See
 * `describeHoleValidationFailure`.
 */
const partialHoleSchema = z.object({
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
}).passthrough();

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
  holes: z.array(partialHoleSchema.nullable()).max(18),
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

type ZodIssueLike = { path: readonly PropertyKey[]; message: string };

function formatIssuePath(path: readonly PropertyKey[]): string {
  return path.map(String).join('.');
}

/**
 * Recover the real cause behind a masked `holes.<n>` validation failure.
 *
 * Zod reports a failing array element at the element path. Depending on how
 * the element is wrapped (`.nullable()`, a union, a refine) the reason can
 * collapse to a bare "Invalid input" with no field path — which is exactly
 * what production logged, and exactly why three successive repairs to this
 * code path could not identify what was wrong. Re-validating the single hole
 * against `partialHoleSchema` restores the field-level issue.
 *
 * Diagnostic only: it never changes what is accepted or rejected.
 */
function describeHoleValidationFailure(
  issues: readonly ZodIssueLike[],
  holes: unknown,
): string[] {
  const described: string[] = [];

  for (const issue of issues.slice(0, 10)) {
    const path = formatIssuePath(issue.path);
    const elementOnly = /^holes\.(\d+)$/.exec(path);

    if (!elementOnly || !Array.isArray(holes)) {
      described.push(`${path || '(root)'}: ${issue.message}`);
      continue;
    }

    const index = Number(elementOnly[1]);
    const hole: unknown = holes[index];

    if (hole === null || hole === undefined) {
      described.push(
        `${path}: hole slot is ${hole === null ? 'null' : 'undefined'} — no data for hole ${index + 1}`,
      );
      continue;
    }

    const inner = partialHoleSchema.safeParse(hole);
    if (inner.success) {
      // The element parses fine on its own, so the wrapper rejected it.
      described.push(`${path}: ${issue.message} (element valid in isolation)`);
      continue;
    }

    for (const innerIssue of inner.error.issues.slice(0, 5)) {
      const suffix = innerIssue.path.length ? `.${formatIssuePath(innerIssue.path)}` : '';
      described.push(`${path}${suffix}: ${innerIssue.message}`);
    }
  }

  return described;
}

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

/**
 * End must not precede start (audit finding #17 — 3 inverted rows reached
 * prod and exported inverted DTEND to external calendars). The DB CHECK
 * golf_events_end_after_start is live as the backstop; this refine produces a
 * friendly message first. Wall-time string comparison is valid because both
 * sides carry the same timezone offset.
 */
function refineEventEndAfterStart(
  d: { startDate?: string; endDate?: string; startTime?: string; endTime?: string; allDay?: boolean },
  ctx: z.RefinementCtx
): void {
  if (!d.startDate) return;
  // A strictly earlier end DATE is inverted under every all-day/timed
  // convention (create defaults allDay→true, update defaults timed — only
  // flag what is wrong in both).
  if (d.endDate && d.endDate < d.startDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'End date must be on or after the start date',
      path: ['endDate'],
    });
    return;
  }
  // Explicitly timed with both times on the same effective dates.
  if (d.allDay === false && d.startTime && d.endTime) {
    const start = `${d.startDate}T${d.startTime}`;
    const end = `${d.endDate || d.startDate}T${d.endTime}`;
    if (end < start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End time must be after the start time',
        path: ['endTime'],
      });
    }
  }
}

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
}).superRefine(refineEventEndAfterStart);

// Feature G — one course assignment per qualifier round (coach-set).
const qualifierRoundCourseSchema = z.object({
  roundNumber: z.number().int().min(1).max(50),
  courseId: z.string().uuid().optional().nullable(),
  courseName: z.string().max(200).optional().nullable(),
  teeId: z.string().uuid().optional().nullable(),
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
    // The round cap controls whether a player may enter another result; it
    // must be explicit so a caller can never silently create a one-round
    // qualifier by omitting it.
    numRounds: z.number().int().min(1).max(50),
    roundCourses: z.array(qualifierRoundCourseSchema).max(50).optional(),
  })
  .refine(
    (d) =>
      d.selectionSlotsTotal === undefined ||
      d.selectionSlotsCoachPick === undefined ||
      d.selectionSlotsCoachPick <= d.selectionSlotsTotal,
    { message: 'Coach picks cannot exceed the total travel-squad size', path: ['selectionSlotsCoachPick'] },
  )
  // The qualifier window must be coherent: the end date cannot precede the start.
  .refine((d) => !d.endDate || d.endDate >= d.startDate, {
    message: 'End date cannot be before the start date',
    path: ['endDate'],
  })
  // Players must confirm in before play opens: the entry deadline cannot fall
  // after the qualifier has already started.
  .refine((d) => !d.entryDeadline || d.entryDeadline <= d.startDate, {
    message: 'Entry deadline must be on or before the start date',
    path: ['entryDeadline'],
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
import { describeError } from '@/lib/utils/describe-error';

/**
 * Helper to get team_id for a coach (since golf_coaches doesn't have team_id column).
 * Looks up via organization_id -> golf_teams.
 * Delegates to the shared deterministic resolver (never throws on orgs with >1 team).
 */
async function getCoachTeamId(
  supabase: SupabaseClient,
  organizationId: string | null,
  coachId: string | null
): Promise<string | null> {
  // Cookie-aware: honours the program head's golf_active_team selection
  // (validated server-side) so coach WRITES target the toggled team.
  return resolveCoachTeamIdWithCookie(supabase, organizationId, coachId);
}

/**
 * Helper to get team_id for a player (since golf_players doesn't have team_id column)
 * Looks up via golf_team_members
 */
async function getPlayerTeamId(
  supabase: SupabaseClient,
  playerId: string
): Promise<string | null> {
  // Prefer the active membership.
  //
  // Both reads below bind their error for a specific reason: this function's
  // only failure signal is `null`, and both callers write that null straight
  // into `golf_rounds.team_id`. The coach SELECT policy is keyed on
  // `team_id IS NOT NULL AND is_golf_team_coach(team_id)`, so a round saved
  // with a null team is invisible to the coach forever — and the player, who
  // can always see their own rounds, has no way to notice. A read that failed
  // and a player who genuinely has no team produce the identical null, so
  // without these logs there is nothing to tell them apart afterwards.
  const { data: active, error: activeError } = await supabase
    .from('golf_team_members')
    .select('team_id')
    .eq('player_id', playerId)
    .eq('status', 'active')
    .maybeSingle();

  // PGRST116 is not a failure here — it is `.maybeSingle()` meeting a player
  // with two active memberships, and the ordered fallback below handles that
  // case correctly. Logging it would be noise on a working path.
  if (activeError && activeError.code !== 'PGRST116') {
    await logServerError(
      `active membership read failed for player ${playerId}: ${describeError(activeError)}`,
      { action: 'golf.getPlayerTeamId', featureArea: 'rounds' },
      'warning'
    );
  }
  if (active?.team_id) return active.team_id;

  // F147: an injured/redshirt/inactive member still belongs to a team. If we
  // returned null here, the round would be saved with team_id = NULL and become
  // invisible to the coach — the golf_rounds coach SELECT RLS is keyed on
  // `team_id IS NOT NULL AND is_golf_team_coach(team_id)`, and the roster query
  // asks for the round by player_id expecting to see it. Fall back to the
  // player's most recent membership so the round stays coach-visible. This does
  // NOT loosen RLS (no cross-team leak): the round only carries the player's own
  // real team_id, which only that team's coach can read.
  const { data: anyMembership, error: anyError } = await supabase
    .from('golf_team_members')
    .select('team_id')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (anyError) {
    // Both reads are now exhausted, so this null is about to be written to a
    // round. Record it at error level: the round still saves — a player who
    // has just entered eighteen holes must never lose them to a membership
    // lookup — but the round will not reach their coach, and this line is the
    // only trace of why.
    await logServerError(
      `membership lookup failed for player ${playerId}; the round will be saved with no team and will not appear on the coach's roster: ${describeError(anyError)}`,
      { action: 'golf.getPlayerTeamId', featureArea: 'rounds' },
      'error'
    );
  }

  return anyMembership?.team_id ?? null;
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
  /** Cloud Course Library tee set (golf_course_tees.id). Optional; when present
   *  it records provenance + sources the new-round hole defaults. Par/yards are
   *  STILL snapshot into golf_holes from `holes` — the tee never rewrites them. */
  teeId?: string;
  roundType: 'practice' | 'tournament' | 'qualifier';
  roundDate: string;
  holes: HoleStats[];
  // Qualifier-specific fields
  qualifierId?: string;
  qualifierRoundNumber?: number;
}

export interface GolfEventInput {
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

/**
 * Input contract for updateGolfEvent.
 *
 * ATTENDEE SEMANTICS (2026-06-10, audit finding #4): the legacy `attendeeIds`
 * field is ADDITIVE-ONLY — players missing from the list are NEVER removed
 * (edit forms used to seed it empty and silently wipe every existing RSVP).
 * Removals must be explicit via `removeAttendeeIds`.
 */
export type GolfEventUpdateInput = Partial<GolfEventInput> & {
  /** Players to invite (attendance row + invitation). Additive. */
  addAttendeeIds?: string[];
  /** Players to explicitly remove from the event's attendance list. */
  removeAttendeeIds?: string[];
};

/** Options for deleteGolfEvent. Default (no options) = soft cancellation. */
export interface DeleteGolfEventOptions {
  /**
   * Permanently delete the row. Only permitted when the event is already
   * cancelled OR has zero attendance rows — otherwise the action fails and
   * the caller must cancel first.
   */
  hard?: boolean;
  /** Optional cancellation reason shown to attendees (soft-cancel only). */
  reason?: string;
}

/**
 * Machine-readable RSVP failure codes the UI can branch on. The lock strings
 * match useRSVP's RsvpLockCode union (rsvpLockMessage renders them).
 */
export type RSVPErrorCode =
  | 'rsvp_deadline_passed'
  | 'event_started'
  | 'event_cancelled'
  | 'not_team_member'
  | 'write_failed';

export type RespondToEventResult =
  | { success: true; data: undefined }
  | { success: false; error: string; code?: RSVPErrorCode };

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
  /** How many rounds the qualifier runs; this is the enforced player cap. */
  numRounds: number;
  /** Feature G — the course assigned to each round (omit → none). */
  roundCourses?: QualifierRoundCourseInput[];
}

/** Feature G — a single round's course assignment within a qualifier. */
export interface QualifierRoundCourseInput {
  roundNumber: number;
  courseId?: string | null;
  courseName?: string | null;
  teeId?: string | null;
}

/** Feature G — a round's course assignment as read back from the DB. */
export interface QualifierRoundCourse {
  roundNumber: number;
  courseId: string | null;
  courseName: string | null;
  teeId: string | null;
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

const toYards = (
  distance: number | null | undefined,
  unit: string | null | undefined,
): number | null =>
  distance == null ? null : unit === 'feet' ? distance / 3 : distance;

/**
 * Should this shot produce an `approach_miss_details` row?
 *
 * `shot_type` is assigned by ordinal, so 'approach' also covers layups on par
 * 5s and the replayed tee shot after a penalty. Neither is a shot at the
 * green, but the tracker still forces a miss direction on both (it offers no
 * "laid up" option), so they used to be written as approach misses tagged
 * 'short' — dragging every approach-miss aggregate short with them. Gate on
 * the shared plausibility rule so those rows never reach the table.
 */
function isRealApproachShot(shot: ShotRecord, par: number): boolean {
  const isApproachShot =
    shot.shotType === 'approach' ||
    shot.shotType === 'around_green' ||
    (shot.shotType === 'tee' && par === 3);
  if (!isApproachShot) return false;

  return isPlausibleApproach({
    distanceToHoleBeforeYards: toYards(shot.distanceToHoleBefore, shot.distanceUnitBefore),
    distanceToHoleAfterYards: toYards(shot.distanceToHoleAfter, shot.distanceUnitAfter),
    lieBefore: shot.lieBefore,
    par,
  });
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
  tee_id: string | null;
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

/**
 * Mirrors createHelmFlightRecorder's own production opt-in gate
 * (src/lib/observability/helm-flight-recorder.ts: `enabled`) so the
 * Postgres-side helm_private.trace_checkpoint() log volume follows the
 * IDENTICAL policy as the JS-side helm_debug persistence, instead of firing
 * on every round write in production while the JS side stays silently
 * disabled (helm_private.configure_trace_context has no gate of its own —
 * whatever _helm_trace.enabled the caller sends is what runs). This
 * necessarily duplicates that file's expression rather than inventing a new
 * one; see crossFile note asking the recorder to expose it instead.
 */
function shouldEmitHelmTraceContext(): boolean {
  return process.env.VERCEL_ENV !== 'production' || process.env.HELM_FLIGHT_RECORDER_ENABLED === 'true';
}

/**
 * The `_helm_trace` key shape helm_private.configure_trace_context expects
 * (supabase/migrations/20260825200811_helm_flight_recorder.sql). Omitted
 * entirely when tracing is off so the RPC's own no-op default applies —
 * never sent as `enabled: false`, which would still cost a jsonb key lookup
 * per checkpoint for zero benefit.
 */
function helmTracePayload(traceId: string): Record<string, unknown> {
  return shouldEmitHelmTraceContext() ? { _helm_trace: { trace_id: traceId, enabled: true } } : {};
}

/**
 * The flight recorder must NEVER fail or slow a round write. Every write
 * createHelmFlightRecorder makes already fails open internally (see that
 * file's `failOpen`), but this guards construction itself so an unexpected
 * rejection there can't propagate into a round-lifecycle action. Returns a
 * fully inert recorder on failure — same shape as the library's own
 * disabled-mode no-op.
 */
async function createSafeFlightRecorder(input: StartHelmFlightRecorderInput): Promise<HelmFlightRecorder> {
  try {
    return await createHelmFlightRecorder(input);
  } catch {
    const noop = async () => undefined;
    return {
      traceId: input.traceId ?? 'unavailable',
      workflow: input.workflow,
      start: noop,
      complete: noop,
      fail: noop,
      warn: noop,
      skip: noop,
      finalize: noop,
    };
  }
}

function getPreservedRoundSubmitError(backupPersisted: boolean): string {
  // Only promise preservation when a backup actually landed. On 2026-08-20 a
  // player was told "your round data was preserved... do not re-enter it" while
  // the backup write had ALSO timed out and the round was then destroyed.
  // Telling someone not to re-enter a round you did not save is the worst
  // available outcome — it costs them the scorecard too.
  return backupPersisted
    ? 'Round submission hit a server error, but your round data was saved. Reload this round and try again — do not re-enter it.'
    : 'Round submission failed and we could not confirm a backup. Reload this round to check what was saved before you re-enter anything.';
}

/**
 * True when getUser() failed to REACH the auth server, as opposed to the auth
 * server rejecting the session.
 *
 * `const { data: { user } } = await supabase.auth.getUser()` conflates two
 * different facts behind `user === null`:
 *   - the session is genuinely invalid (GoTrue answered 401/403), and
 *   - the auth check itself failed in transit (abort, network, 5xx) — GoTrue
 *     never ruled on the session at all.
 *
 * On 2026-08-19 the second case fired 6 times across 4 Guilford rounds and was
 * logged as "user session expired mid-round". It wasn't: every affected player
 * held a valid, unexpired access token at that moment (verified against
 * auth.refresh_tokens rotation chains), the failures exist ONLY inside the
 * DB-contention window of the round-submit incident, and GoTrue shares the
 * contended Postgres — the old 10s client abort was killing the /auth/v1/user
 * round trip. Treating that as "signed out" tells a mid-round player their
 * session died when nothing is wrong with it.
 *
 * Discriminator: a real rejection carries a 4xx status. Everything else —
 * AuthRetryableFetchError (status 0), missing status, 5xx, fetch/abort
 * message shapes — is transit failure, and the only honest answer is "retry".
 */
function isTransientAuthCheckFailure(
  error: { status?: number; name?: string; message?: string } | null | undefined
): boolean {
  if (!error) {
    return false;
  }
  if (typeof error.status === 'number' && error.status >= 400 && error.status < 500) {
    return false;
  }
  return true;
}

/**
 * True when a write failed in a way that leaves the transaction's OUTCOME UNKNOWN.
 *
 * An HTTP abort (the `AbortSignal.timeout` in `src/lib/supabase/server.ts`)
 * cancels only the *request*. PostgreSQL keeps executing and frequently COMMITS
 * — these RPCs grant themselves a `statement_timeout` well above the client's
 * abort, so the window is wide. On 2026-08-20 `submit_round_atomic` committed
 * round `8e89c73e` in full, the client aborted at 10s and read that as failure,
 * and the "recovery" fallback then deleted the 18 holes and 72 shots the RPC had
 * just written. See docs/audits/ROUND_SUBMIT_TIMEOUT_INVERSION_2026-08-20.md.
 *
 * A DB-returned error (57014 statement_timeout, a constraint, a deadlock) is NOT
 * indeterminate: Postgres rolled the transaction back and the rows are untouched,
 * so a rebuild is safe there. The discriminator is SQLSTATE — a Postgres error
 * always carries one, a client-side abort never does.
 */
function isIndeterminateWriteFailure(
  error: { message?: string | null; code?: string | null } | null | undefined
): boolean {
  if (!error) {
    return false;
  }
  if (typeof error.code === 'string' && error.code.trim() !== '') {
    return false;
  }
  const message = (error.message ?? '').toLowerCase();
  return message.includes('abort')
    || message.includes('timeouterror')
    || message.includes('the operation was aborted')
    || message.includes('fetch failed')
    // Safari/WKWebView's opaque Fetch rejection. This has no SQLSTATE and
    // carries the same unknown-commit semantics as AbortSignal.timeout.
    || message.includes('load failed')
    || message.includes('network');
}

/**
 * A client-side timeout only tells us that the HTTP response was lost, not
 * whether Postgres committed the atomic transaction. Never infer a commit from
 * the error alone: confirm the authenticated player's own round transitioned
 * to completed before acknowledging success. If that read cannot confirm the
 * state, the existing recovery path keeps every durable copy intact and asks
 * the player to retry.
 */
async function hasConfirmedRoundSubmission(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  roundId: string,
  playerId: string
): Promise<boolean> {
  try {
    const { data, error } = await fromUntyped(supabase, 'golf_rounds')
      .select('id, status')
      .eq('id', roundId)
      .eq('player_id', playerId)
      .maybeSingle();

    return !error && data?.status === 'completed';
  } catch {
    // A failed confirmation is deliberately treated as unknown. The caller
    // must preserve the round and recovery backup rather than guess.
    return false;
  }
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
    // At this point the snapshot in memory is the ONLY remaining copy of the
    // player's round. A restore that fails silently loses it for good — that is
    // exactly how round 8e89c73e was destroyed on 2026-08-20: the deletes below
    // succeeded, the re-inserts timed out, and the bare `catch {}` that used to
    // sit here swallowed it. If we cannot re-seat the rows, the snapshot MUST
    // reach the log so the round is recoverable from something.
    const failRestore = async (stage: string, detail: string): Promise<void> => {
      await logServerError(
        `CRITICAL: round rollback failed at ${stage} — holes/shots may be LOST for round ${roundId}. Snapshot attached.`,
        {
          action: 'submitRoundDirectFallback.restoreSnapshot',
          roundId,
          playerId,
          holesCount: Array.isArray(holeSnapshot) ? holeSnapshot.length : 0,
          shotsCount: Array.isArray(shotSnapshot) ? shotSnapshot.length : 0,
          extra: { stage, detail, holeSnapshot, shotSnapshot },
        },
        'critical'
      );
    };

    try {
      // nosemgrep: helmv3-destructive-write-pattern -- this IS the rollback: re-seating the snapshot captured (and null-guarded) above after a failed swap
      const { error: clearShots } = await supabase.from('golf_shots').delete().eq('round_id', roundId);
      if (clearShots) {
        await failRestore('clear_shots', clearShots.message);
        return;
      }
      // nosemgrep: helmv3-destructive-write-pattern -- rollback path, see above
      const { error: clearHoles } = await supabase.from('golf_holes').delete().eq('round_id', roundId);
      if (clearHoles) {
        await failRestore('clear_holes', clearHoles.message);
        return;
      }
      if (Array.isArray(holeSnapshot) && holeSnapshot.length > 0) {
        const { error: holesBack } = await supabase.from('golf_holes').insert(holeSnapshot);
        if (holesBack) {
          await failRestore('reinsert_holes', holesBack.message);
          return;
        }
      }
      if (Array.isArray(shotSnapshot) && shotSnapshot.length > 0) {
        const { error: shotsBack } = await supabase.from('golf_shots').insert(shotSnapshot);
        if (shotsBack) {
          await failRestore('reinsert_shots', shotsBack.message);
        }
      }
    } catch (restoreError) {
      await failRestore(
        'threw',
        restoreError instanceof Error ? restoreError.message : String(restoreError)
      );
    }
  };

  // nosemgrep: helmv3-destructive-write-pattern -- guarded swap: snapshot captured + null-checked BEFORE any delete, every failure path restores it (restoreSnapshot above); this is the manual fallback for the atomic RPC
  const { error: deleteShotsError } = await supabase
    .from('golf_shots')
    .delete()
    .eq('round_id', roundId);

  if (deleteShotsError) {
    // Nothing destroyed yet (the delete itself failed) — no restore needed.
    return { success: false, error: `Fallback failed while clearing shots: ${deleteShotsError.message}` };
  }

  // nosemgrep: helmv3-destructive-write-pattern -- same guarded swap (snapshot + restore on every failure path), see the shots delete above
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

// The destructive fallback is intentionally not callable from the submit
// workflow. Keep this historical implementation temporarily for forensic
// rollback review, but make that non-use explicit to TypeScript and future
// maintainers; the protected atomic RPC is the only live submission path.
void submitRoundDirectFallback;

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
  status?: string;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
}

// ============================================================================
// ROUND ACTIONS
// ============================================================================

/**
 * Submit a golf round with comprehensive shot-by-shot stats
 */
async function submitGolfRoundComprehensiveImpl(
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

    const { data: { user }, error: authCheckError } = await supabase.auth.getUser();
    if (!user) {
      // Transit failure ≠ dead session. The player is mid-round with (almost
      // always) a perfectly valid token; telling them to sign in would cost
      // them the flow for nothing. Their data is intact locally either way.
      if (isTransientAuthCheckFailure(authCheckError)) {
        void logServerError('Round submit auth check failed in transit (NOT a session expiry) — retryable', {
          action: 'submitGolfRoundComprehensive',
          featureArea: 'shot_tracking',
          errorDetails: authCheckError?.message,
          extra: { courseName: data.courseName, holesCount: data.holes?.length, authStatus: authCheckError?.status ?? null },
        }, 'warning');
        return {
          success: false,
          error: 'Could not verify your session — check your connection and submit again. Your round is still saved on this device.',
        };
      }
      void logServerError('Round submit failed: user session expired or not signed in', {
        action: 'submitGolfRoundComprehensive',
        featureArea: 'shot_tracking',
        extra: { courseName: data.courseName, holesCount: data.holes?.length },
      }, 'error');
      return { success: false, error: 'You must be signed in to submit rounds' };
    }

    // Get player record.
    //
    // This is the archetype `expectRows` call site (see the header of
    // src/lib/supabase/expect-rows.ts): the block below already classified
    // an empty read here as an 'error'-severity `logServerError` call
    // BEFORE expectRows existed — i.e. the code's own pre-existing judgment
    // is that "no golf_players row for this authenticated user" is an
    // anomaly at this exact call site, not a benign "still onboarding"
    // empty state. (Every route that can invoke this action also sits
    // under the `(dashboard)` layout, which redirects to `/golf/player`
    // unless `player.onboarding_completed` is true — corroborating, though
    // that's a page-render gate, not a guarantee the server action itself
    // re-checks.) And `golf_players_select`'s first RLS clause is the
    // unconditional `user_id = auth.uid()` (verified against production,
    // no team/status predicate), so for a caller reading their OWN row by
    // that exact user_id, RLS can never be the reason a row that exists
    // comes back hidden — the read is "guaranteed-context" in the sense
    // expectRows requires.
    // `.maybeSingle()` (not `.single()`) so a silent `{ data: null, error:
    // null }` reaches expectRows instead of being pre-converted to a
    // PGRST116 Postgres error — same downstream `if (!player)` branch
    // either way, since only `data` was ever destructured here.
    const playerLookupResult = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    const { data: player } = expectRows(playerLookupResult, {
      action: 'submitGolfRoundComprehensive',
      featureArea: 'shot_tracking',
      feature: 'round_tracking',
      table: 'golf_players',
      userId: user.id,
    });

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

    // Existing in-progress rows are the authority for their identity. A browser
    // can be old, resumed from recovery, or have lost setup state while it was
    // backgrounded; it must never be able to detach or retarget a started
    // qualifier round when it submits the scorecard.
    let effectiveRoundType = data.roundType;
    let effectiveQualifierId = data.qualifierId;
    let effectiveQualifierRoundNumber = data.qualifierRoundNumber;

    // If updating an existing round, verify ownership and that it's not already completed
    if (existingRoundId) {
      // SECURITY: Verify the round belongs to this player and is not already completed
      const { data: existingRound, error: verifyError } = await supabase
        .from('golf_rounds')
        .select('id, player_id, status, round_type, qualifier_id, qualifier_round_number')
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

      effectiveRoundType = (existingRound.round_type ?? data.roundType) as GolfRoundInputComprehensive['roundType'];
      const persistedQualifierId = existingRound.qualifier_id;
      const persistedQualifierRoundNumber = existingRound.qualifier_round_number;

      if (persistedQualifierId) {
        if (data.qualifierId && data.qualifierId !== persistedQualifierId) {
          void logServerError('Round submit rejected: stale client tried to retarget an existing qualifier round', {
            action: 'submitGolfRoundComprehensive.qualifierIdentity',
            featureArea: 'qualifiers',
            roundId: existingRoundId,
            playerId: player.id,
            extra: { persistedQualifierId, submittedQualifierId: data.qualifierId },
          }, 'warning');
          return { success: false, error: 'This round belongs to a different qualifier. Reload it and try again.' };
        }
        if (
          data.qualifierRoundNumber != null &&
          persistedQualifierRoundNumber != null &&
          data.qualifierRoundNumber !== persistedQualifierRoundNumber
        ) {
          void logServerError('Round submit rejected: stale client tried to change an existing qualifier round number', {
            action: 'submitGolfRoundComprehensive.qualifierIdentity',
            featureArea: 'qualifiers',
            roundId: existingRoundId,
            playerId: player.id,
            extra: {
              persistedQualifierId,
              persistedQualifierRoundNumber,
              submittedQualifierRoundNumber: data.qualifierRoundNumber,
            },
          }, 'warning');
          return { success: false, error: 'This round belongs to a different qualifier round. Reload it and try again.' };
        }

        // A stored qualifier link is always a qualifier round. This also
        // normalizes legacy parents whose type was incorrectly left as
        // "practice" while their qualifier_id was already durable.
        effectiveRoundType = 'qualifier';
        effectiveQualifierId = persistedQualifierId;
        // Older parents can have the qualifier link but lack the round number.
        // Keep the durable number when present; otherwise validate the supplied
        // number instead of silently erasing it at completion.
        effectiveQualifierRoundNumber = persistedQualifierRoundNumber ?? data.qualifierRoundNumber;
      } else if (existingRound.round_type !== 'qualifier' && data.qualifierId) {
        // A submitted scorecard is still not the place to RECLASSIFY a round —
        // that is `updateRoundType`, which validates the qualifier and leaves an
        // audit trail. What changed 2026-08-31 is the consequence: the client's
        // stale qualifier data is now IGNORED rather than used to refuse the
        // submission.
        //
        // Refusing stranded a real case. A player may now change their own live
        // round's type from the scoring screen, so "was a qualifier round when
        // this client loaded, is a practice round now" is an ordinary sequence,
        // not a stale-client attack. The old branch met it with "ask a coach to
        // update its type" — for a change the player had just made themselves,
        // on a round they could no longer submit.
        //
        // Dropping the value keeps the protection intact (the client still
        // cannot reclassify through submit) and honours the rule stated at the
        // top of this block: the persisted row is the authority for its own
        // identity.
        void logServerError(
          'Round submit: client carried qualifier data for a round that is no longer a qualifier round; using the persisted identity and ignoring it',
          {
            action: 'submitGolfRoundComprehensive.qualifierIdentity',
            featureArea: 'qualifiers',
            roundId: existingRoundId,
            playerId: player.id,
            extra: { persistedRoundType: existingRound.round_type, submittedQualifierId: data.qualifierId },
          },
          'warning',
        );
        effectiveQualifierId = undefined;
        effectiveQualifierRoundNumber = undefined;
      }
    }

    // Server-side qualifier validation
    if (effectiveQualifierId) {
      // Verify qualifier exists and is not completed
      const { data: qualifierRaw, error: qualifierError } = await supabase
        .from('golf_qualifiers')
        .select('id, status, num_rounds')
        .eq('id', effectiveQualifierId)
        .single();

      const qualifier = qualifierRaw as { id: string; status: string; num_rounds: number } | null;

      if (qualifierError || !qualifier) {
        return { success: false, error: 'Qualifier not found.' };
      }

      // REMOVED 2026-08-31, owner instruction: "there should be no time
      // constraints." A concluded qualifier used to refuse submission here
      // with `qualifier_closed`. It no longer does — a round that belongs in a
      // qualifier still belongs in it after the coach has closed it, and the
      // coach is the one who closed it.
      //
      // Every other rule below is untouched and is what keeps this safe: the
      // player must be ENTERED, the round number must be within `num_rounds`,
      // and the slot must not already be taken. Those are the rules that
      // protect the standings; the status check only protected the clock.
      //
      // The Sentry-tiering note this comment replaced is preserved in the
      // codepath that still needs it — `qualifier_closed` remains in
      // EXPECTED_SOFT_FAILURE_CODES, and removing the last producer of a code
      // does not make the allowlist wrong, only unused.

      // Verify the player has an entry in this qualifier
      const { data: qualifierEntry, error: entryError } = await supabase
        .from('golf_qualifier_entries')
        .select('id')
        .eq('qualifier_id', effectiveQualifierId)
        .eq('player_id', player.id)
        .single();

      if (entryError || !qualifierEntry) {
        return { success: false, error: 'You are not entered in this qualifier.' };
      }

      // num_rounds IS a live, typed golf_qualifiers column (the "removed in the
      // schema rebuild" note above was stale — the write path was reconciled
      // long ago but this read/cap-check path never was, so a qualifier
      // configured for e.g. 1 round never stopped accepting round 2, 3, 4...).
      const numRounds = qualifier.num_rounds ?? 1;
      if (
        effectiveQualifierRoundNumber == null
        || !Number.isInteger(effectiveQualifierRoundNumber)
        || effectiveQualifierRoundNumber < 1
      ) {
        return {
          success: false,
          error: 'This started qualifier round needs a valid qualifier round number. Reload it and try again.',
        };
      }
      if (effectiveQualifierRoundNumber && effectiveQualifierRoundNumber > numRounds) {
        return {
          success: false,
          error: `This qualifier only has ${numRounds} round${numRounds === 1 ? '' : 's'}. Round ${effectiveQualifierRoundNumber} is beyond the configured count.`,
        };
      }

      // Prevent duplicate qualifier round numbers
      if (effectiveQualifierRoundNumber) {
        const { data: existingRound } = await supabase
          .from('golf_rounds')
          .select('id')
          .eq('qualifier_id', effectiveQualifierId)
          .eq('player_id', player.id)
          .eq('qualifier_round_number', effectiveQualifierRoundNumber)
          .neq('status', 'abandoned')
          .maybeSingle();

        if (existingRound && existingRound.id !== existingRoundId) {
          // `code` keys the Bridge's expected-soft-failure classification
          // (EXPECTED_SOFT_FAILURE_CODES in observe-action-result.ts) — the
          // registry knew this code but no envelope carried it, so this
          // by-design rejection minted error-severity incidents.
          return { success: false, code: 'qualifier_round_already_exists', error: `You have already submitted round ${effectiveQualifierRoundNumber} for this qualifier.` };
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
    let resolvedCourseId = await resolveCourseId(supabase, data.courseName, data.courseId);
    // When a Cloud Course Library tee is chosen, its course is authoritative for
    // course_id (more reliable than fuzzy name matching). Par/yards still come
    // from the client hole payload — the tee only sets provenance + course link.
    if (data.teeId) {
      const { data: teeRow } = await supabase
        .from('golf_course_tees')
        .select('course_id')
        .eq('id', data.teeId)
        .maybeSingle();
      if (teeRow?.course_id) resolvedCourseId = teeRow.course_id;
    }
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
      tee_id: data.teeId || null,
      round_type: effectiveRoundType,
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
      qualifier_id: effectiveQualifierId || null,
      qualifier_round_number: effectiveQualifierRoundNumber || null,
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

        // Tee shots on par 3s ARE the approach; layups and post-penalty tee
        // shots are NOT, even though they carry shot_type='approach'.
        if (isRealApproachShot(shot, hole.par) &&
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
      _roundId: string,
      _path: 'existing_round' | 'new_round_rpc',
      _trigger: Record<string, unknown>,
      backupPersisted: boolean
    ): Promise<{ success: true; warnings?: string[] } | { success: false; error: string }> => {
      // A direct delete-and-reinsert submit path can never prove that an
      // indeterminate RPC did not already commit. Preserve the server draft
      // and local recovery payload; recovery retries only the atomic RPC.
      return { success: false, error: getPreservedRoundSubmitError(backupPersisted) };
    };

    let round: { id: string };
    let detailWarnings: string[] | undefined;

    // One recorder for the whole submit call, spanning both the
    // existing-round and new-round branches below — a single trace per
    // submit, correlated to the same db.submit_round_atomic step either way.
    const flightRecorder = await createSafeFlightRecorder({
      workflow: 'golf.round.submit',
      roundId: existingRoundId ?? null,
      teamId,
      playerId: player.id,
      qualifierId: effectiveQualifierId ?? null,
      existingRoundId: existingRoundId ?? null,
    });

    if (existingRoundId) {
      let backupPersisted = false;
      try {
        await persistRoundSubmissionBackup(supabase, existingRoundId, player.id, submissionBackup);
        backupPersisted = true;
      } catch (backupError) {
        await logServerError(
          `Failed to persist round submission backup: ${describeError(backupError)}`,
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
      void flightRecorder.start('db.submit_round_atomic');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rpcResult, error: rpcError } = await (supabase as any).rpc(
        'submit_round_atomic',
        {
          p_round_id: existingRoundId,
          p_round_data: { ...roundData, ...helmTracePayload(flightRecorder.traceId) },
          p_holes: holesPayload,
          p_shots: shotsPayload,
          p_putt_details: puttDetailsPayload,
          p_approach_details: approachDetailsPayload,
        }
      );

      if (rpcError) {
        const submissionCommitted = isIndeterminateWriteFailure(rpcError)
          && await hasConfirmedRoundSubmission(supabase, existingRoundId, player.id);

        if (submissionCommitted) {
          // The atomic RPC completed after the client lost its response. Its
          // transaction guarantees the scorecard and shots committed together,
          // so acknowledge the actual durable result instead of inviting a
          // duplicate submit or emitting a false production error.
          void flightRecorder.complete('db.submit_round_atomic', { metadata: { reconciled_after_transport_error: true } });
          void flightRecorder.finalize('success');
          round = { id: existingRoundId };
        } else {
          await logServerException(new Error(rpcError.message), { action: 'submitGolfRoundComprehensive.rpc', helmTraceId: flightRecorder.traceId, traceStep: 'db.submit_round_atomic' });
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
            helmTraceId: flightRecorder.traceId,
            traceStep: 'db.submit_round_atomic',
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
          // Deferred until AFTER the fallback resolves — see
          // recordRescuedStepOutcome's own doc. Marking db.submit_round_atomic
          // failed before this point would poison finalize() into reporting
          // 'failure' even if the fallback above had just saved the round.
          void recordRescuedStepOutcome(flightRecorder, {
            failedStepKey: 'db.submit_round_atomic',
            fallbackStepKey: 'db.direct_submit_fallback',
            rescued: fallbackResult.success,
            stepInput: { errorCode: rpcError.code, errorSummary: rpcError.message },
            fallbackStepInput: { observed: { round_id: existingRoundId } },
          });
          if (!fallbackResult.success) {
            return fallbackResult;
          }

          detailWarnings = mergeRoundWarnings(detailWarnings, fallbackResult.warnings);
          round = { id: existingRoundId };
        }
      } else {
        if (rpcResult && !rpcResult.success) {
          // 'busy' = single-flight guard: a same-round auto-save (or a second
          // submit) still held the row past the RPC's bounded 3s wait
          // (supabase/migrations/20260821043500_single_flight_round_submit.sql).
          // Expected under concurrent-save load, not a failure — no
          // error-severity log.
          if (rpcResult.error === 'busy') {
            void flightRecorder.warn('db.submit_round_atomic', { errorSummary: 'busy' });
            void flightRecorder.finalize('warning');
            return { success: false, error: 'Another save for this round is just finishing — try again in a moment.' };
          }
          // submit_round_atomic only ever returns {success:false, error:<a
          // fixed validation/lock message>} — see supabase/migrations/
          // 20260821043500_single_flight_round_submit.sql and
          // 20260820170000_single_flight_partial_round_save.sql, its shared
          // template. It never emits error_code/step/detail; a genuine
          // internal fault surfaces as a transport `rpcError` (handled
          // above, with a real SQLSTATE) instead. The prior isInternalError
          // branch here — keyed on an `error === 'internal_error'` value
          // this RPC has never produced — is removed rather than kept as
          // dead code implying a response shape that isn't real.
          // submit_round_atomic answers "not found", "already completed" and
          // "not yours" with ONE message, so the raw string cannot tell a player
          // which of the three happened — and two of them have opposite fixes.
          // Disambiguate against the row itself before deciding.
          //
          // This is the submit-side twin of the savePartialRound 'round_missing'
          // bug measured 2026-09-01: there, a client held a roundId with no row
          // and retried forever. Here the failure is user-visible rather than a
          // silent loop, but the outcome is the same — a finished round that
          // cannot be submitted.
          if (typeof rpcResult.error === 'string' && SUBMIT_ROUND_UNAVAILABLE.test(rpcResult.error)) {
            const alreadyCommitted = await hasConfirmedRoundSubmission(supabase, existingRoundId, player.id);
            if (alreadyCommitted) {
              // The round IS submitted — an auto-save racing the submit, or a
              // double-tap. Acknowledge the durable result rather than telling
              // the player their finished round is missing.
              void flightRecorder.complete('db.submit_round_atomic', { metadata: { already_completed: true } });
              void flightRecorder.finalize('success');
              round = { id: existingRoundId };
            } else {
              // No row for this id. Re-submitting as a NEW round is safe
              // precisely BECAUSE we just proved nothing is there to duplicate;
              // blind recreation without this check could duplicate a completed
              // round, which is why the key is only returned after the lookup.
              void flightRecorder.warn('db.submit_round_atomic', { errorSummary: 'round_missing' });
              void flightRecorder.finalize('warning');
              await logServerError(`Round submit target is missing — client may re-submit as new: ${rpcResult.error}`, {
                action: 'submitGolfRoundComprehensive',
                roundId: existingRoundId,
                playerId: player.id,
                userId: user.id,
                userEmail: user.email,
                holesCount: holesPayload.length,
                shotsCount,
                helmTraceId: flightRecorder.traceId,
                traceStep: 'db.submit_round_atomic',
                extra: { rpcResult, path: 'existing_round' },
              }, 'warning');
              return { success: false, error: 'round_missing' };
            }
          } else {
          void flightRecorder.fail('db.submit_round_atomic', { errorSummary: rpcResult.error });
          void flightRecorder.finalize('failure');
          await logServerError(`Round submit RPC returned failure: ${rpcResult.error}`, {
            action: 'submitGolfRoundComprehensive',
            roundId: existingRoundId,
            playerId: player.id,
            userId: user.id,
            userEmail: user.email,
            holesCount: holesPayload.length,
            shotsCount,
            helmTraceId: flightRecorder.traceId,
            traceStep: 'db.submit_round_atomic',
            extra: { rpcResult, path: 'existing_round' },
          }, 'error');
          return { success: false, error: rpcResult.error || 'Failed to submit round.' };
          }
        } else {
          void flightRecorder.complete('db.submit_round_atomic', { observed: { round_id: existingRoundId } });
          void flightRecorder.finalize('success');
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
                helmTraceId: flightRecorder.traceId,
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
        // The draft insert never reached the RPC, so db.submit_round_atomic
        // stays 'pending' (a missing required step) rather than being marked
        // failed for a step that was never attempted.
        void flightRecorder.finalize('failure');
        return { success: false, error: 'Failed to save round. Please try again.' };
      }

      // Atomically set status='completed' + insert holes/shots inside one transaction.
      // The stats trigger fires AFTER all hole data exists.
      void flightRecorder.start('db.submit_round_atomic');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rpcResult, error: rpcError } = await (supabase as any).rpc(
        'submit_round_atomic',
        {
          p_round_id: newRound.id,
          p_round_data: { ...roundData, ...helmTracePayload(flightRecorder.traceId) },
          p_holes: holesPayload,
          p_shots: shotsPayload,
          p_putt_details: puttDetailsPayload,
          p_approach_details: approachDetailsPayload,
        }
      );

      if (rpcError) {
        const submissionCommitted = isIndeterminateWriteFailure(rpcError)
          && await hasConfirmedRoundSubmission(supabase, newRound.id, player.id);

        if (submissionCommitted) {
          void flightRecorder.complete('db.submit_round_atomic', { metadata: { reconciled_after_transport_error: true } });
          void flightRecorder.finalize('success');
          round = { id: newRound.id };
        } else {
          // Do NOT delete the round — preserve it so the user can retry.
          // Deleting here caused permanent data loss when the RPC failed
          // (e.g., trigger errors, network timeouts, race conditions).
          await logServerException(new Error(rpcError.message), { action: 'submitGolfRoundComprehensive.rpc.new', helmTraceId: flightRecorder.traceId, traceStep: 'db.submit_round_atomic' });
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
            helmTraceId: flightRecorder.traceId,
            traceStep: 'db.submit_round_atomic',
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
          // Deferred until AFTER the fallback resolves — see
          // recordRescuedStepOutcome's own doc. Marking db.submit_round_atomic
          // failed before this point would poison finalize() into reporting
          // 'failure' even if the fallback above had just saved the round.
          void recordRescuedStepOutcome(flightRecorder, {
            failedStepKey: 'db.submit_round_atomic',
            fallbackStepKey: 'db.direct_submit_fallback',
            rescued: fallbackResult.success,
            stepInput: { errorCode: rpcError.code, errorSummary: rpcError.message },
            fallbackStepInput: { observed: { round_id: newRound.id } },
          });
          if (!fallbackResult.success) {
            return fallbackResult;
          }

          detailWarnings = mergeRoundWarnings(detailWarnings, fallbackResult.warnings);
          round = { id: newRound.id };
        }
      } else {
        if (rpcResult && !rpcResult.success) {
          // Do NOT delete — the round is preserved as a draft for retry
          // 'busy' = single-flight guard: a same-round auto-save (or a second
          // submit) still held the row past the RPC's bounded 3s wait
          // (supabase/migrations/20260821043500_single_flight_round_submit.sql).
          // Expected under concurrent-save load, not a failure — no
          // error-severity log.
          if (rpcResult.error === 'busy') {
            void flightRecorder.warn('db.submit_round_atomic', { errorSummary: 'busy' });
            void flightRecorder.finalize('warning');
            return { success: false, error: 'Another save for this round is just finishing — try again in a moment.' };
          }
          // submit_round_atomic only ever returns {success:false,
          // error:<a fixed validation/lock message>} — see
          // supabase/migrations/20260821043500_single_flight_round_submit.sql.
          // It never emits error_code/step/detail; a genuine internal fault
          // surfaces as a transport `rpcError` (handled above, with a real
          // SQLSTATE) instead. The prior isInternalError branch here is
          // removed rather than kept as dead code implying a response shape
          // that isn't real — see the mirrored comment on the existing-round
          // branch above.
          void flightRecorder.fail('db.submit_round_atomic', { errorSummary: rpcResult.error });
          void flightRecorder.finalize('failure');
          await logServerError(`Round submit RPC returned failure (new round): ${rpcResult.error}`, {
            action: 'submitGolfRoundComprehensive',
            roundId: newRound.id,
            playerId: player.id,
            userId: user.id,
            userEmail: user.email,
            holesCount: holesPayload.length,
            shotsCount,
            helmTraceId: flightRecorder.traceId,
            traceStep: 'db.submit_round_atomic',
            extra: { rpcResult, path: 'new_round_rpc' },
          }, 'error');
          return { success: false, error: rpcResult.error || 'Failed to submit round.' };
        } else {
          void flightRecorder.complete('db.submit_round_atomic', { observed: { round_id: newRound.id } });
          void flightRecorder.finalize('success');
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
                helmTraceId: flightRecorder.traceId,
                extra: { warnings: rpcResult.warnings, path: 'new_round_rpc' },
              },
              'warning'
            );
          }

          round = { id: newRound.id };
        }
      }
    }

    // If this is a qualifier round, update the qualifier entry stats and
    // auto-advance its start only (F029/F138). The first completed round
    // transitions upcoming→in_progress. Completion is intentionally manual:
    // neither entrant progress nor scheduled dates can close a qualifier.
    if (effectiveQualifierId) {
      try {
        await updateQualifierEntryStats(effectiveQualifierId, player.id);
      } catch (err) {
        await logServerError(`Failed to update qualifier entry stats after round submit: ${describeError(err)}`, {
          action: 'submitGolfRoundComprehensive.qualifierStats',
          featureArea: 'qualifiers',
          roundId: round.id,
          playerId: player.id,
          userId: user.id,
          userEmail: user.email,
          extra: {
            qualifierId: effectiveQualifierId,
            stack: err instanceof Error ? err.stack : undefined,
          },
        }, 'warning');
      }

      try {
        await advanceQualifierOnRoundSubmit(supabase, effectiveQualifierId);
      } catch (err) {
        await logServerError(`Failed to auto-advance qualifier status after round submit: ${describeError(err)}`, {
          action: 'submitGolfRoundComprehensive.qualifierAutoAdvance',
          featureArea: 'qualifiers',
          roundId: round.id,
          playerId: player.id,
          userId: user.id,
          userEmail: user.email,
          extra: { qualifierId: effectiveQualifierId },
        }, 'warning');
      }
    }

    // 2026-05-17: closes audit P-HIGH-1. Previously this awaited the stats-
    // cache invalidation inside the user-facing response, adding 0.5–2s of
    // p99 latency to round submits. Move to after() so the user response
    // returns immediately; warnings are still logged from the after callback.
    //
    // 2026-07-17: closes #920 (race). This used to be a SECOND, independent
    // after() callback that ran concurrently with the postRoundTrigger
    // after() below — the CoachHelm engine could read golf_player_stats_cache
    // before invalidateOnRoundComplete finished writing it, producing
    // insights/predictions off a stale cache. Chained into a single after()
    // so the cache refresh is fully awaited BEFORE postRoundTrigger runs.
    const cacheRoundId = round.id;
    const cachePlayerId = player.id;
    const cacheHolesCount = holesPayload.length;
    const cacheShotsCount = shotsCount;
    const cacheUserId = user.id;
    const cacheUserEmail = user.email;
    const backgroundPlayerId = player.id;
    const backgroundRoundId = round.id;
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
        await logServerError(`Failed to invalidate stats cache after round submit: ${describeError(err)}`, {
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

      // ── Goal + focus-area progress (#1243) ──────────────────────────────
      // A completed round is the state change these track, so advance them
      // HERE. Before this, the ONLY caller of the progress drivers was the
      // nightly standing-refresh cron (02:20 UTC), so a player finished a
      // round, opened My Development to see whether it helped, and the bar had
      // not moved — for up to ~24h. Verified end-to-end on 2026-08-02: two
      // completed rounds took an accepted 61 → 66 fairways area from 61 to
      // nowhere; invoking the cron by hand immediately produced the correct
      // windowed 82.
      //
      // Deliberately placed BEFORE the Inngest branch below, which `return`s
      // when Inngest is configured — putting this after it would leave the
      // durable-queue path (i.e. production) still stale-until-morning.
      //
      // This is the round-SUBMIT write path, not a page render: it does not
      // reintroduce the read-path-writes problem that had the on-view hooks
      // removed (a page read racing the coachhelm crons into a 40P01 deadlock;
      // see player-coachhelm-dashboard-readonly.test.ts). The drivers are
      // idempotent and same-day deduped, so this composes with the nightly
      // cron rather than replacing it — the cron stays as the durability net
      // for players whose standing moves without a submission.
      try {
        await Promise.all([
          evaluateAndPersistGoals(backgroundPlayerId),
          evaluateAndPersistFocusAreas(backgroundPlayerId),
        ]);
        revalidatePath('/golf/dashboard/coachhelm');
        revalidatePath('/golf/dashboard/intelligence');
      } catch (progressErr) {
        // Never let progress tracking take down round analysis behind it.
        await logServerError(
          `Post-round goal/focus-area progress failed: ${describeError(progressErr)}`,
          {
            action: 'submitGolfRoundComprehensive.progressDrivers',
            featureArea: 'coachhelm',
            roundId: backgroundRoundId,
            playerId: backgroundPlayerId,
            extra: { stack: progressErr instanceof Error ? progressErr.stack : undefined },
          },
          'warning',
        );
      }

      // 2026-05-17: closes audit Finding 2 + A-NEW-6. Previously this fetched
      // /api/coachhelm/analyze-player with `keepalive: true`. That had three
      // problems: (1) an extra internal HTTP hop with cold-start risk;
      // (2) keepalive's lifetime guarantees are best-effort on Fluid Compute;
      // (3) the COACHHELM_INTERNAL_SECRET was a credential management surface.
      //
      // Runs via Next.js `after()` so the trigger fires post-response in the
      // same function instance, AFTER the stats-cache refresh above has
      // resolved (success or failure — postRoundTrigger reads the round's own
      // shot/hole data, not the cache, so it still proceeds even if the cache
      // refresh warned). postRoundTrigger writes terminal state to
      // golf_rounds.coachhelm_{analyzed,failed}_at so the safety-net cron can
      // recover deterministically if the after-callback dies.
      //
      // 2026-07-25: Fix 3 of the CoachHelm remediation plan. `after()` is
      // fire-and-forget and NOT durable — if this instance is torn down
      // before postRoundTrigger finishes, it silently never ran, no error,
      // no failure flag. That's how 206 of 290 rounds went unanalyzed. When
      // Inngest is configured (INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY, set
      // in Vercel Production BEFORE this deploy — Vercel bakes env vars in
      // at deploy time), route through it instead for retries + durability.
      // When it's NOT configured, or the send itself fails, fall through to
      // the exact direct call below — byte-for-byte identical to today's
      // behavior. Never silently stop analyzing rounds because keys are
      // absent; that would be strictly worse than the status quo.
      if (isInngestConfigured()) {
        try {
          await inngest.send({
            name: 'coachhelm/round.submitted',
            data: { roundId: backgroundRoundId, playerId: backgroundPlayerId },
          });
          return;
        } catch (err) {
          // A rotated/invalid INNGEST_EVENT_KEY is a provider-account fault, not
          // a code defect: `isInngestConfigured()` sees the variable and reports
          // the integration as live, so the raw text ("Inngest API Error: 404
          // Event key not found") reads like a transient upstream blip when in
          // fact every round submitted since the key rotated has silently lost
          // its durability guarantee and fallen back to the non-durable
          // `after()` path below. Naming the fault, with a stable code, is what
          // lets that show up as one standing incident instead of one line per
          // round submitted.
          const fault = classifyProviderFault(err);
          await logServerError(
            fault
              ? `Round analysis lost its durable queue and ran inline instead: ${fault.summary}`
              : `Failed to send coachhelm/round.submitted to Inngest, falling back to direct postRoundTrigger: ${describeError(err)}`,
            {
              action: 'submitGolfRoundComprehensive.inngestSendFailed',
              featureArea: 'coachhelm',
              roundId: backgroundRoundId,
              playerId: backgroundPlayerId,
              userId: cacheUserId,
              userEmail: cacheUserEmail,
              ...(fault ? { errorCode: fault.code, skipSentry: true } : {}),
              extra: {
                stack: err instanceof Error ? err.stack : undefined,
                ...(fault
                  ? {
                      providerFaultKind: fault.kind,
                      provider: fault.provider,
                      providerMessage: describeError(err).slice(0, 300),
                    }
                  : {}),
              },
            },
            // Was a hardcoded 'warning'. providerFaultSeverity assigns 'error'
            // to an operator-blocking fault, and 'warning' sits BELOW
            // FAILURE_SEVERITIES — so a dead Inngest credential was excluded
            // from the briefing's error-cluster check, the release ledger and
            // every headline count. This was the lone hand-written outlier;
            // schedule-image.ts, chat/stream/route.ts and compose.ts all use
            // the helper.
            fault ? providerFaultSeverity(fault).severity : 'warning',
          );
        }
      } else {
        await logServerEvent(
          'Inngest not configured for round submit (INNGEST_EVENT_KEY/INNGEST_SIGNING_KEY unset) — using direct postRoundTrigger',
          {
            action: 'submitGolfRoundComprehensive.inngestNotConfigured',
            featureArea: 'coachhelm',
            roundId: backgroundRoundId,
            playerId: backgroundPlayerId,
            skipSentry: true,
          },
          'info',
        );
      }

      const admin = createAdminClient();
      await postRoundTrigger(admin, {
        playerId: backgroundPlayerId,
        roundId: backgroundRoundId,
        triggerReason: 'round_submitted',
      });
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

      if (effectiveQualifierId) {
        revalidatePath('/golf/dashboard/qualifiers');
        revalidatePath(`/golf/dashboard/qualifiers/${effectiveQualifierId}`);
      }
    } catch (cacheErr) {
      await logServerError(`Next cache revalidation failed after round submit: ${describeError(cacheErr)}`, {
        action: 'submitGolfRoundComprehensive.revalidatePaths',
        featureArea: 'stats_cache',
        roundId: round.id,
        playerId: player.id,
        userId: user.id,
        userEmail: user.email,
        extra: {
          qualifierId: effectiveQualifierId ?? null,
          stack: cacheErr instanceof Error ? cacheErr.stack : undefined,
        },
      }, 'warning');
    }

    // Log round submission event (fire-and-forget)
    logRoundSubmitted(user.id, user.email || '', round.id, {
      courseName: data.courseName,
      totalScore,
      scoreToPar: totalToPar,
      roundType: effectiveRoundType,
      holesPlayed: data.holes.length,
    }).catch((err) => {
      logServerError(`logRoundSubmitted failed: ${describeError(err)}`, {
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
          await logServerError(`[Push] round_submitted notification failed: ${describeError(pushErr)}`, { action: 'golf.submitGolfRoundComprehensive' });
        }
      })();
    }

    return { success: true, data: { roundId: round.id, warnings: detailWarnings } };

  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid round data. Please check your inputs.' };
    }
    await logServerError(`Round submit unexpected error: ${describeError(error)}`, {
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

const observedSubmitGolfRoundComprehensive = withAdminObserved(
  'submitGolfRoundComprehensive',
  { sport: 'golf', feature: 'round_tracking' },
  submitGolfRoundComprehensiveImpl,
);

export async function submitGolfRoundComprehensive(
  data: GolfRoundInputComprehensive,
  existingRoundId?: string
): Promise<ActionResult<{ roundId: string; warnings?: string[] }>> {
  return observedSubmitGolfRoundComprehensive(data, existingRoundId);
}

// ============================================================================
// EVENT ACTIONS
// ============================================================================

async function createGolfEventImpl(data: GolfEventInput): Promise<ActionResult<{ eventId: string }>> {
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
      teamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);
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
      // RSVP config (audit finding #5): these were silently dropped — every
      // event created with RSVP on landed disarmed. The deadline goes through
      // the same timezone-offset convention as start_time (finding #15).
      requires_rsvp: validatedData.requiresRsvp ?? false,
      rsvp_deadline: buildRsvpDeadlineString(validatedData.rsvpDeadline, tz),
      max_attendees: validatedData.maxAttendees ?? null,
      // F042: stamp the active lifecycle status so one-off events match the
      // recurring path (recurring-events.ts inserts 'confirmed'). Without it the
      // row landed with a null status, leaving it outside the 'confirmed'
      // lifecycle (restore/cancel transitions key off 'confirmed') — the event
      // was effectively "stuck" in an undefined state on some surfaces.
      status: 'confirmed',
    };

    // Only add created_by if it's not null (coaches only)
    if (createdBy) {
      insertData.created_by = createdBy;
    }

    // Legacy UI shape: timed event with an endDate but no endTime resolves to
    // midnight, which can precede a same-day timed start. The DB CHECK
    // golf_events_end_after_start (live) would reject the row — store an open
    // end instead. (Explicitly inverted endTime is rejected by zod above.)
    if (
      insertData.end_time &&
      new Date(insertData.end_time).getTime() < new Date(insertData.start_time).getTime()
    ) {
      insertData.end_time = null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: event, error } = await (supabase as any)
      .from('golf_events')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      // 23514 = CHECK violation (golf_events_end_after_start backstop).
      if ((error as { code?: string }).code === '23514') {
        return { success: false, error: 'End time must be after the start time.' };
      }
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

    // Notify all team players about the new event (in-app + email + push).
    // 2026-06-10 (audit finding #11): the save previously awaited a sequential
    // per-player email loop (prefs query + Resend HTTP each), adding ~3–10s of
    // latency on a 15-player roster. The whole fan-out now runs post-response
    // via next/server `after()` (same pattern as invalidateOnRoundComplete),
    // with the three channels parallelized through Promise.allSettled. Reads
    // inside the callback use the admin client — the request-scoped client is
    // not guaranteed usable once the response has flushed.
    const fanOutEventId: string = event.id;
    const fanOutTeamId = teamId;
    const fanOutTitle = validatedData.title;
    const fanOutStartDate = validatedData.startDate;
    const fanOutLocation = validatedData.location || '';
    after(async () => {
      try {
        const adminClient = createAdminClient();
        // Fire-and-forget fan-out for a newly created event. Both reads
        // discarded their error and both `length === 0` guards then `return`,
        // so a failed roster read meant NOBODY was told about a new team event
        // — and because this runs inside after(), there is no return value to
        // carry a failure and nothing surfaced anywhere. Silent in the truest
        // sense: no error, no user feedback, no record.
        //
        // It cannot fail the request (the event was created successfully and
        // should stay created), so the honest thing is to say so in the log.
        const { data: teamMembers, error: teamMembersError } = await adminClient
          .from('golf_team_members')
          .select('player_id')
          .eq('team_id', fanOutTeamId)
          .eq('status', 'active');

        if (teamMembersError) {
          await logServerError(
            `[createGolfEvent.fanOut] roster read failed — no one was notified about this event: ${describeError(teamMembersError)}`,
            { action: 'golf.createEvent.fanOut', featureArea: 'calendar' },
          );
          return;
        }

        const playerIds = (teamMembers ?? [])
          .map((m) => m.player_id)
          .filter((id): id is string => Boolean(id));
        if (playerIds.length === 0) return;

        const { data: players, error: playersError } = await adminClient
          .from('golf_players')
          .select('id, user_id')
          .in('id', playerIds);

        if (playersError) {
          await logServerError(
            `[createGolfEvent.fanOut] player lookup failed — no one was notified about this event: ${describeError(playersError)}`,
            { action: 'golf.createEvent.fanOut', featureArea: 'calendar' },
          );
          return;
        }

        const userIds = (players ?? [])
          .map((p) => p.user_id)
          .filter((id): id is string => Boolean(id));
        if (userIds.length === 0) return;

        // 1. In-app notifications (golf_calendar_notifications)
        const inAppPromise = (async () => {
          const notifications = userIds.map((uid) => ({
            user_id: uid,
            event_id: fanOutEventId,
            notification_type: 'event_invitation',
            title: `New event: ${fanOutTitle}`,
            message: `${fanOutStartDate}${fanOutLocation ? ` at ${fanOutLocation}` : ''}`,
            action_url: `/golf/dashboard/calendar`,
          }));
          const { error: notifError } = await fromUntyped(adminClient, 'golf_calendar_notifications')
            .upsert(notifications, { onConflict: 'event_id,user_id,notification_type', ignoreDuplicates: true });
          if (notifError) {
            await logServerError(`createGolfEvent notification insert failed: ${notifError.message}`, {
              action: 'createGolfEvent.insertNotifications',
              featureArea: 'events',
              extra: { errorCode: notifError.code },
            });
          }
        })();

        // 2. Email notifications — parallel per recipient (the bulk helper
        // loops sequentially; Promise.allSettled keeps one slow Resend call
        // from serializing the rest).
        const emailPromise = (async () => {
          const { sendEmailNotification } = await import('@/lib/notifications/email');
          const { data: userRows } = await adminClient
            .from('users')
            .select('id, email')
            .in('id', userIds);
          const recipients = (userRows ?? [])
            .filter((u) => Boolean(u.email))
            .map((u) => ({ id: u.id, email: u.email as string }));
          if (recipients.length === 0) return;
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://helmsportslabs.com';
          const results = await Promise.allSettled(
            recipients.map((u) =>
              sendEmailNotification('event_rsvp_reminder', u.id, u.email, {
                eventName: fanOutTitle,
                eventDate: fanOutStartDate,
                location: fanOutLocation,
                eventUrl: `${baseUrl}/golf/dashboard/calendar`,
              })
            )
          );
          const failed = results.filter((r) => r.status === 'rejected').length;
          if (failed > 0) {
            await logServerError(`createGolfEvent email notification failed for ${failed}/${recipients.length} recipients`, {
              action: 'createGolfEvent.emailNotification',
              featureArea: 'events',
            });
          }
        })();

        // 3. Push notifications
        const pushPromise = (async () => {
          const { sendBulkPushNotification } = await import('@/lib/notifications/push');
          await sendBulkPushNotification('event_rsvp_reminder', userIds, {
            eventName: fanOutTitle,
          });
        })();

        const channelResults = await Promise.allSettled([inAppPromise, emailPromise, pushPromise]);
        const channelNames = ['inApp', 'email', 'push'] as const;
        for (let i = 0; i < channelResults.length; i++) {
          const result = channelResults[i];
          if (result?.status === 'rejected') {
            await logServerError(`createGolfEvent ${channelNames[i]} fan-out failed: ${describeError(result.reason)}`, {
              action: 'createGolfEvent.notificationFanOut',
              featureArea: 'events',
              extra: { channel: channelNames[i], eventId: fanOutEventId },
            });
          }
        }
      } catch (notifErr) {
        await logServerError(`createGolfEvent notification creation failed: ${describeError(notifErr)}`, {
          action: 'createGolfEvent.notifications',
          featureArea: 'events',
        });
      }
    });

    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/calendar');
    updateTag(CACHE_TAGS.DASHBOARD);
    updateTag(CACHE_TAGS.CALENDAR);

    return { success: true, data: { eventId: event.id } };

  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstIssue = error.issues[0]?.message;
      return { success: false, error: firstIssue || 'Invalid event data. Please check your inputs.' };
    }
    return formatSafeErrorResponse(error);
  }
}

const observedCreateGolfEvent = withAdminObserved(
  'createGolfEvent',
  { demoSafe: true, sport: 'golf', feature: 'calendar_events' },
  createGolfEventImpl,
);

export async function createGolfEvent(data: GolfEventInput): Promise<ActionResult<{ eventId: string }>> {
  return observedCreateGolfEvent(data);
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
  // ADDITIVE-ONLY (audit finding #4): players listed here are invited if
  // missing; players absent from this list are never touched.
  attendeeIds: z.array(z.string().uuid()).optional(),
  addAttendeeIds: z.array(z.string().uuid()).optional(),
  // The ONLY way to remove attendees — explicit, never derived from an
  // incomplete client list.
  removeAttendeeIds: z.array(z.string().uuid()).optional(),
  timezoneOffset: z.number().int().optional(),
  // Restore (un-cancel) a soft-cancelled event. Constrained to 'confirmed' so
  // this update path can never be used to silently flip an event to other
  // lifecycle states; cancellation still flows exclusively through
  // deleteGolfEvent (which also notifies attendees). Setting it clears the
  // cancellation bookkeeping below.
  status: z.literal('confirmed').optional(),
}).superRefine(refineEventEndAfterStart);

async function updateGolfEventImpl(
  eventId: string,
  data: GolfEventUpdateInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to update events' };
    }

    // Try to get coach profile first
    // Note: golf_coaches doesn't have team_id - we look it up via organization_id
    const { data: coach, error: coachError } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    // Denying on a failed read is right — a gate that could not run must not
    // pass — but "Only coaches can update team events" and "Event not found"
    // are statements about the caller and the event, not about the query. A
    // coach told they are not a coach, or that the event open in front of them
    // does not exist, has no reason to try again.
    if (coachError) {
      await logServerError(
        `update event: coach read failed: ${describeError(coachError)}`,
        { action: 'golf.updateGolfEvent', featureArea: 'calendar' },
        'warning',
      );
      return { success: false, error: "Couldn't verify your access to this event. Please try again." };
    }

    // Only coaches can update team events (matches createGolfEvent behavior)
    if (!coach) {
      return { success: false, error: 'Only coaches can update team events' };
    }

    const teamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);
    if (!teamId) {
      return { success: false, error: 'Coach not assigned to a team' };
    }

    // Verify event belongs to coach's team
    const { data: existingEvent, error: existingEventError } = await supabase
      .from('golf_events')
      .select('team_id')
      .eq('id', eventId)
      .single();

    // `.single()` reports a genuine no-row as PGRST116 — that one really is
    // "event not found" and keeps its message.
    if (existingEventError && existingEventError.code !== 'PGRST116') {
      await logServerError(
        `event lifecycle: event read failed for ${eventId}: ${describeError(existingEventError)}`,
        { action: 'golf.eventLifecycle', featureArea: 'calendar' },
        'warning',
      );
      return { success: false, error: "Couldn't verify your access to this event. Please try again." };
    }

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
    // Deadline goes through the same timezone-offset convention as start_time
    // (audit finding #15: stored as UTC wall-time, shifting the coach's
    // intended deadline by the UTC offset).
    if (validatedData.rsvpDeadline !== undefined) {
      updateData.rsvp_deadline = buildRsvpDeadlineString(validatedData.rsvpDeadline, tz);
    }
    if (validatedData.maxAttendees !== undefined) updateData.max_attendees = validatedData.maxAttendees;
    // Restore (un-cancel): flip back to confirmed and clear the cancellation
    // bookkeeping set by deleteGolfEvent's soft-cancel path so the event no
    // longer renders as cancelled.
    if (validatedData.status === 'confirmed') {
      updateData.status = 'confirmed';
      updateData.cancelled_at = null;
      updateData.cancellation_reason = null;
    }

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
      // 23514 = CHECK violation (golf_events_end_after_start). Partial updates
      // can invert against the UNCHANGED half of the range (e.g. moving the
      // start past the existing end) — the DB constraint is the arbiter.
      if ((error as { code?: string }).code === '23514') {
        return { success: false, error: 'End time must be after the start time. Adjust the event end as well.' };
      }
      return { success: false, error: 'Failed to update event' };
    }

    if (!updatedRows || updatedRows.length === 0) {
      return { success: false, error: 'Event could not be updated. You may not have permission to edit this event.' };
    }

    // Attendee sync — ADDITIVE-ONLY contract (audit finding #4).
    // Previously this diffed golf_event_attendance against the client's
    // attendeeIds and DELETED every player missing from the list. Edit forms
    // seeded attendeeIds: [] — so adding one player silently wiped every other
    // attendance row (RSVPs, check-in state, reminder eligibility). House rule:
    // no destructive deletes driven by incomplete client state.
    //
    // New contract: attendeeIds + addAttendeeIds insert missing players and
    // NEVER delete; removals happen only via explicit removeAttendeeIds.
    const inviteIds = Array.from(new Set([
      ...(validatedData.attendeeIds ?? []),
      ...(validatedData.addAttendeeIds ?? []),
    ]));
    const removeIds = validatedData.removeAttendeeIds ?? [];

    if (inviteIds.length > 0) {
      const { data: attendanceRows } = await supabase
        .from('golf_event_attendance')
        .select('player_id')
        .eq('event_id', eventId);

      const existingIds = new Set((attendanceRows || []).map(row => row.player_id));
      const toAdd = inviteIds.filter((id) => !existingIds.has(id));

      if (toAdd.length > 0) {
        try {
          const { sendEventInvitations } = await import('@/lib/calendar/rsvp');
          await sendEventInvitations(eventId, toAdd, supabase);
        } catch {
          // Don't fail the whole update if invitations fail
        }
      }
    }

    if (removeIds.length > 0) {
      const { error: removeError } = await supabase
        .from('golf_event_attendance')
        .delete()
        .eq('event_id', eventId)
        .in('player_id', removeIds);

      if (removeError) {
        await logServerError(`updateGolfEvent attendee removal failed: ${removeError.message}`, {
          action: 'updateGolfEvent.removeAttendees',
          featureArea: 'events',
          extra: { eventId, removeIds },
        });
        return { success: false, error: 'Event updated, but removing attendees failed. Please retry.' };
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
      const firstIssue = err.issues[0]?.message;
      return { success: false, error: firstIssue || 'Invalid input data' };
    }
    return { success: false, error: 'An unexpected error occurred' };
  }
}

const observedUpdateGolfEvent = withAdminObserved(
  'updateGolfEvent',
  { demoSafe: true, sport: 'golf', feature: 'calendar_events' },
  updateGolfEventImpl,
);

export async function updateGolfEvent(
  eventId: string,
  data: GolfEventUpdateInput
): Promise<{ success: boolean; error?: string }> {
  return observedUpdateGolfEvent(eventId, data);
}

/**
 * Delete a golf event.
 *
 * 2026-06-10 (audit finding #19): the default is now a SOFT CANCELLATION —
 * the event's status flips to 'cancelled' (cancelled_at/cancellation_reason
 * set), attendees are notified (in-app + email), and all RSVP rows are kept.
 * The previous behavior was a hard DELETE whose FK cascade silently erased
 * every attendance row and the attendees' notification history with no
 * warning to anyone.
 *
 * A hard delete ({ hard: true } or deleteGolfEventPermanently) is only
 * permitted when the event is already cancelled OR has zero attendance rows.
 */
async function deleteGolfEventImpl(
  eventId: string,
  options?: DeleteGolfEventOptions
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to delete events' };
    }

    // Try to get coach profile first
    // Note: golf_coaches doesn't have team_id - we look it up via organization_id
    const { data: coach, error: coachError } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    // Denying on a failed read is right — a gate that could not run must not
    // pass — but "Only coaches can update team events" and "Event not found"
    // are statements about the caller and the event, not about the query. A
    // coach told they are not a coach, or that the event open in front of them
    // does not exist, has no reason to try again.
    if (coachError) {
      await logServerError(
        `delete event: coach read failed: ${describeError(coachError)}`,
        { action: 'golf.deleteGolfEvent', featureArea: 'calendar' },
        'warning',
      );
      return { success: false, error: "Couldn't verify your access to this event. Please try again." };
    }

    // Only coaches can delete team events (matches createGolfEvent behavior)
    if (!coach) {
      return { success: false, error: 'Only coaches can delete team events' };
    }

    const teamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);
    if (!teamId) {
      return { success: false, error: 'Coach not assigned to a team' };
    }

    // Verify event belongs to coach's team
    const { data: existingEvent, error: existingEventError } = await supabase
      .from('golf_events')
      .select('team_id, title, status, start_time, location')
      .eq('id', eventId)
      .single();

    // `.single()` reports a genuine no-row as PGRST116 — that one really is
    // "event not found" and keeps its message.
    if (existingEventError && existingEventError.code !== 'PGRST116') {
      await logServerError(
        `event lifecycle: event read failed for ${eventId}: ${describeError(existingEventError)}`,
        { action: 'golf.eventLifecycle', featureArea: 'calendar' },
        'warning',
      );
      return { success: false, error: "Couldn't verify your access to this event. Please try again." };
    }

    if (!existingEvent) {
      return { success: false, error: 'Event not found' };
    }

    if (existingEvent.team_id !== teamId) {
      return { success: false, error: 'Access denied' };
    }

    if (options?.hard) {
      // Hard delete is gated: only an already-cancelled event, or one with
      // zero attendance rows, may be permanently removed (the FK cascade
      // destroys RSVPs and attendee notification history).
      if (existingEvent.status !== 'cancelled') {
        const { count } = await supabase
          .from('golf_event_attendance')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', eventId);

        if ((count ?? 0) > 0) {
          return {
            success: false,
            error: 'This event has invitees. Cancel it first — permanent deletion is only allowed for cancelled events or events with no attendance records.',
          };
        }
      }

      const { data: deletedRows, error } = await supabase
        .from('golf_events')
        .delete()
        .eq('id', eventId)
        .eq('team_id', teamId)
        .select('id');

      if (error) {
        return { success: false, error: 'Failed to delete event' };
      }

      if (!deletedRows || deletedRows.length === 0) {
        return { success: false, error: 'Event could not be deleted. You may not have permission to delete this event.' };
      }
    } else {
      // Soft cancellation — keep the row + every RSVP, mark cancelled,
      // notify attendees.
      if (existingEvent.status === 'cancelled') {
        // Idempotent: already cancelled, don't re-notify.
        revalidatePath('/golf/dashboard/calendar');
        updateTag(CACHE_TAGS.DASHBOARD);
        updateTag(CACHE_TAGS.CALENDAR);
        return { success: true };
      }

      const { data: cancelledRows, error } = await supabase
        .from('golf_events')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancellation_reason: options?.reason ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', eventId)
        .eq('team_id', teamId)
        .select('id');

      if (error) {
        return { success: false, error: 'Failed to cancel event' };
      }

      if (!cancelledRows || cancelledRows.length === 0) {
        return { success: false, error: 'Event could not be cancelled. You may not have permission to modify this event.' };
      }

      // Notify every invited player post-response (same after() pattern as
      // the create fan-out): in-app 'event_cancelled' rows + email.
      const cancelTitle = existingEvent.title;
      const cancelStart = existingEvent.start_time;
      const cancelLocation = existingEvent.location;
      const cancelReason = options?.reason ?? '';
      after(async () => {
        try {
          const adminClient = createAdminClient();
          const { data: attendances } = await adminClient
            .from('golf_event_attendance')
            .select('player:golf_players(user_id)')
            .eq('event_id', eventId);

          const attendanceUserIds = (attendances ?? [])
            .map((row) => {
              const playerRef = (row as { player: { user_id: string | null } | Array<{ user_id: string | null }> | null }).player;
              const playerRow = Array.isArray(playerRef) ? playerRef[0] ?? null : playerRef;
              return playerRow?.user_id ?? null;
            })
            .filter((id): id is string => Boolean(id));

          // Union with the whole active team (2026-07-10 calendar-travel
          // audit, P1): a coach's CREATE fan-out notifies every active
          // golf_team_members row unconditionally, regardless of whether
          // attendeeIds was populated — but this cancel fan-out previously
          // queried golf_event_attendance ONLY, so a whole-team event
          // cancelled before anyone RSVP'd (zero attendance rows) silently
          // notified nobody even though the team was told it was happening.
          // Same two-query shape as the create fan-out above (team_members →
          // player_id → golf_players.user_id) rather than an embedded join.
          const { data: teamMembers } = await adminClient
            .from('golf_team_members')
            .select('player_id')
            .eq('team_id', teamId)
            .eq('status', 'active');
          const activePlayerIds = (teamMembers ?? [])
            .map((m) => m.player_id)
            .filter((id): id is string => Boolean(id));
          let teamUserIds: string[] = [];
          if (activePlayerIds.length > 0) {
            const { data: activePlayers, error: activePlayersError } = await adminClient
              .from('golf_players')
              .select('id, user_id')
              .in('id', activePlayerIds);
            // Same fan-out, same silence: a failed lookup here drops the whole
            // team from the recipient set for an event UPDATE, leaving only
            // whoever had already RSVP'd.
            if (activePlayersError) {
              await logServerError(
                `[golf event update.fanOut] player lookup failed — the team was dropped from this notification: ${describeError(activePlayersError)}`,
                { action: 'golf.updateEvent.fanOut', featureArea: 'calendar' },
              );
            }
            teamUserIds = (activePlayers ?? [])
              .map((p) => p.user_id)
              .filter((id): id is string => Boolean(id));
          }

          const userIds = [...new Set([...attendanceUserIds, ...teamUserIds])];
          if (userIds.length === 0) return;

          const startLabel = cancelStart
            ? new Date(cancelStart).toLocaleString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })
            : 'TBD';
          const detail = `${startLabel}${cancelLocation ? ` at ${cancelLocation}` : ''}${cancelReason ? ` — ${cancelReason}` : ''}`;

          const inAppPromise = (async () => {
            const notifications = userIds.map((uid) => ({
              user_id: uid,
              event_id: eventId,
              notification_type: 'event_cancelled',
              title: `Cancelled: ${cancelTitle}`,
              message: detail,
              action_url: `/golf/dashboard/calendar?event=${eventId}`,
            }));
            const { error: notifError } = await fromUntyped(adminClient, 'golf_calendar_notifications')
              .upsert(notifications, { onConflict: 'event_id,user_id,notification_type', ignoreDuplicates: false });
            if (notifError) {
              await logServerError(`deleteGolfEvent cancellation notification insert failed: ${notifError.message}`, {
                action: 'deleteGolfEvent.insertNotifications',
                featureArea: 'events',
                extra: { eventId },
              });
            }
          })();

          const emailPromise = (async () => {
            const { sendEmailNotification } = await import('@/lib/notifications/email');
            const { data: userRows } = await adminClient
              .from('users')
              .select('id, email')
              .in('id', userIds);
            const recipients = (userRows ?? [])
              .filter((u) => Boolean(u.email))
              .map((u) => ({ id: u.id, email: u.email as string }));
            if (recipients.length === 0) return;
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://helmsportslabs.com';
            const results = await Promise.allSettled(
              recipients.map((u) =>
                sendEmailNotification('team_announcement', u.id, u.email, {
                  title: `Event cancelled: ${cancelTitle}`,
                  content: `This event has been cancelled. ${detail}`,
                  announcementUrl: `${baseUrl}/golf/dashboard/calendar`,
                })
              )
            );
            const failed = results.filter((r) => r.status === 'rejected').length;
            if (failed > 0) {
              await logServerError(`deleteGolfEvent cancellation email failed for ${failed}/${recipients.length} recipients`, {
                action: 'deleteGolfEvent.emailNotification',
                featureArea: 'events',
                extra: { eventId },
              });
            }
          })();

          const channelResults = await Promise.allSettled([inAppPromise, emailPromise]);
          for (const result of channelResults) {
            if (result.status === 'rejected') {
              await logServerError(`deleteGolfEvent cancellation fan-out failed: ${describeError(result.reason)}`, {
                action: 'deleteGolfEvent.cancellationFanOut',
                featureArea: 'events',
                extra: { eventId },
              });
            }
          }
        } catch (notifErr) {
          await logServerError(`deleteGolfEvent cancellation notify failed: ${describeError(notifErr)}`, {
            action: 'deleteGolfEvent.cancellationNotify',
            featureArea: 'events',
            extra: { eventId },
          });
        }
      });
    }

    revalidatePath('/golf/dashboard/calendar');
    updateTag(CACHE_TAGS.DASHBOARD);
    updateTag(CACHE_TAGS.CALENDAR);
    return { success: true };

  } catch {
    return { success: false, error: 'An unexpected error occurred' };
  }
}

const observedDeleteGolfEvent = withAdminObserved(
  'deleteGolfEvent',
  { demoSafe: true, sport: 'golf', feature: 'calendar_events' },
  deleteGolfEventImpl,
);

export async function deleteGolfEvent(
  eventId: string,
  options?: DeleteGolfEventOptions
): Promise<{ success: boolean; error?: string }> {
  return observedDeleteGolfEvent(eventId, options);
}

/**
 * Permanently delete an event. Gated: only allowed when the event is already
 * cancelled OR has zero attendance rows (see deleteGolfEvent).
 */
async function deleteGolfEventPermanentlyImpl(
  eventId: string
): Promise<{ success: boolean; error?: string }> {
  return deleteGolfEvent(eventId, { hard: true });
}

const observedDeleteGolfEventPermanently = withAdminObserved(
  'deleteGolfEventPermanently',
  { demoSafe: true, sport: 'golf', feature: 'calendar_events' },
  deleteGolfEventPermanentlyImpl,
);

export async function deleteGolfEventPermanently(
  eventId: string
): Promise<{ success: boolean; error?: string }> {
  return observedDeleteGolfEventPermanently(eventId);
}

// ============================================================================
// QUALIFIER ACTIONS
// ============================================================================

async function createGolfQualifierImpl(data: GolfQualifierInput): Promise<ActionResult<{ qualifierId: string }>> {
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

    // Resolve the coach's ACTIVE team (cookie-aware; honours the program
    // head's team toggle and never throws on multi-team orgs).
    const orgTeamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);

    if (!orgTeamId) {
      return { success: false, error: 'Team not found for your organization' };
    }

    // Create qualifier
    const { data: qualifier, error: qualifierError } = await supabase
      .from('golf_qualifiers')
      .insert({
        team_id: orgTeamId,
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
        // The round cap is an entry rule, not optional follow-up metadata.
        // Persist it in the same write as the qualifier so a transient
        // secondary UPDATE can never leave a multi-round qualifier capped at
        // the database default of one round.
        num_rounds: validatedData.numRounds,
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

    // Feature G — persist the per-round course assignments. Best-effort write
    // through fromUntyped (golf_qualifier_round_courses is not yet in the
    // generated Database types; the migration is unapplied). A failure here must
    // NOT roll back the qualifier the coach already created — surface it and move
    // on so courses can be re-assigned via setQualifierRoundCourses().
    if (validatedData.roundCourses && validatedData.roundCourses.length > 0) {
      const numRounds = validatedData.numRounds;
      const rows = validatedData.roundCourses
        // Defensive: never write a round beyond the declared count.
        .filter((rc) => rc.roundNumber >= 1 && rc.roundNumber <= numRounds)
        .map((rc) => ({
          qualifier_id: qualifier.id,
          round_number: rc.roundNumber,
          course_id: rc.courseId ?? null,
          course_name: rc.courseName ?? null,
          tee_id: rc.teeId ?? null,
        }));

      if (rows.length > 0) {
        const { error: roundCoursesError } = await fromUntyped(
          supabase,
          'golf_qualifier_round_courses',
        ).insert(rows);

        if (roundCoursesError) {
          await logServerError(
            `createGolfQualifier round-course write failed: ${roundCoursesError.message}`,
            { action: 'createGolfQualifier.roundCourses', featureArea: 'qualifiers' },
          );
        }
      }
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
          // `user_id` is nullable once an account is deleted and the player's history
          // is preserved (20260819200000). A null is not a recipient — drop it so the
          // rest of the batch still gets notified, matching the three fan-outs in
          // golf.ts that already do this. NOT NULL in production today, so this
          // removes nothing yet: that is what lets it ship before the migration.
          const userIds = playerRows.map(p => p.user_id).filter((id): id is string => Boolean(id));
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
        await logServerError(`createGolfQualifier notification failed: ${describeError(notifErr)}`, {
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

const observedCreateGolfQualifier = withAdminObserved(
  'createGolfQualifier',
  { demoSafe: true, sport: 'golf', feature: 'qualifiers' },
  createGolfQualifierImpl,
);

export async function createGolfQualifier(data: GolfQualifierInput): Promise<ActionResult<{ qualifierId: string }>> {
  return observedCreateGolfQualifier(data);
}

/**
 * Feature G — read the per-round course assignments for a qualifier.
 * Returns one entry per assigned round (ascending). RLS lets any team member
 * (coach OR active player) read these, so this powers BOTH the coach edit view
 * and the player detail view. Reads through fromUntyped because the table is not
 * yet in the generated Database types (migration unapplied).
 */
async function getQualifierRoundCoursesImpl(
  qualifierId: string,
): Promise<QualifierRoundCourse[]> {
  try {
    const supabase = await createClient();

    // Auth gate (project hard rule: every exported action checks auth before a
    // DB call). RLS would silently return [] for an anonymous caller, which is
    // indistinguishable from "no courses assigned" — fail fast instead.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await fromUntyped(supabase, 'golf_qualifier_round_courses')
      .select('round_number, course_id, course_name, tee_id')
      .eq('qualifier_id', qualifierId)
      .order('round_number', { ascending: true });

    if (error || !Array.isArray(data)) {
      // withAdminObserved cannot see this: it only inspects an ActionResult
      // ({success:false}) shape, and Array.isArray(result) short-circuits
      // extractActionSoftFailure to null for this function's return type —
      // a real read failure here was silently indistinguishable from "no
      // courses assigned yet". Observability only; the fallback [] is
      // unchanged.
      void logServerError(
        `getQualifierRoundCourses read failed: ${error?.message ?? 'non-array data returned'}`,
        {
          action: 'getQualifierRoundCourses',
          featureArea: 'qualifiers',
          errorCode: error?.code,
          errorDetails: error?.details,
          extra: { qualifierId },
        },
        'warning'
      );
      return [];
    }

    return (data as Array<{
      round_number: number;
      course_id: string | null;
      course_name: string | null;
      tee_id: string | null;
    }>).map((row) => ({
      roundNumber: row.round_number,
      courseId: row.course_id ?? null,
      courseName: row.course_name ?? null,
      teeId: row.tee_id ?? null,
    }));
  } catch (err) {
    void logServerError(
      `getQualifierRoundCourses threw: ${describeError(err)}`,
      {
        action: 'getQualifierRoundCourses',
        featureArea: 'qualifiers',
        extra: { qualifierId, stack: err instanceof Error ? err.stack : undefined },
      },
      'error'
    );
    return [];
  }
}

const observedGetQualifierRoundCourses = withAdminObserved(
  'getQualifierRoundCourses',
  { sport: 'golf', feature: 'qualifiers' },
  getQualifierRoundCoursesImpl,
);

export async function getQualifierRoundCourses(
  qualifierId: string,
): Promise<QualifierRoundCourse[]> {
  return observedGetQualifierRoundCourses(qualifierId);
}

/**
 * Feature G — set (replace) the round count + per-round course assignments for an
 * existing qualifier. Coach-only; RLS enforces team ownership on every write.
 *
 * Strategy: stage-and-swap by round_number via upsert on the
 * (qualifier_id, round_number) unique key, then delete any rounds that fell
 * outside the new num_rounds — never a blind delete-all-then-insert (that would
 * destroy assignments on a transient failure). Reads/writes through fromUntyped
 * because the table is not yet in the generated Database types.
 */
async function setQualifierRoundCoursesImpl(
  qualifierId: string,
  numRounds: number,
  roundCourses: QualifierRoundCourseInput[],
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to edit a qualifier' };
    }

    // Never coerce a malformed update into a one-round qualifier. That turns a
    // client bug into a live cap that can strand players after their next
    // completed round. Reject it and preserve the existing configuration.
    if (!Number.isInteger(numRounds) || numRounds < 1 || numRounds > 50) {
      return { success: false, error: 'Round count must be between 1 and 50.' };
    }
    const safeNumRounds = numRounds;

    // Keep golf_qualifiers.num_rounds in sync. RLS (coach-only UPDATE) gates
    // this — and `.select('id')` is what makes that gate observable. A
    // PostgREST UPDATE that RLS refuses matches no rows and resolves
    // `{ data: null, error: null }`, indistinguishable from a successful one,
    // so relying on `error` alone reported "saved" for a write that did
    // nothing. The single-round edit path is the one that bites: it sends an
    // empty roundCourses array, so this is the ONLY write in the function and
    // there is nothing downstream to fail loudly instead.
    const { data: qualifierRows, error: numRoundsError } = await fromUntyped(supabase, 'golf_qualifiers')
      .update({ num_rounds: safeNumRounds })
      .eq('id', qualifierId)
      .select('id');

    if (numRoundsError) {
      return { success: false, error: 'Failed to update the round count. Please try again.' };
    }

    if (!Array.isArray(qualifierRows) || qualifierRows.length === 0) {
      await logServerError(
        `setQualifierRoundCourses matched no rows for qualifier ${qualifierId} — the write was refused or the qualifier is gone`,
        { action: 'setQualifierRoundCourses.numRounds', featureArea: 'qualifiers' },
        'warning',
      );
      return {
        success: false,
        error: "Couldn't save the round setup — the qualifier may have been deleted, or you may not have edit access to this team.",
      };
    }

    // Upsert the assignments that fall within the declared round count.
    const rows = roundCourses
      .filter((rc) => rc.roundNumber >= 1 && rc.roundNumber <= safeNumRounds)
      .map((rc) => ({
        qualifier_id: qualifierId,
        round_number: rc.roundNumber,
        course_id: rc.courseId ?? null,
        course_name: rc.courseName ?? null,
        tee_id: rc.teeId ?? null,
      }));

    if (rows.length > 0) {
      const { error: upsertError } = await fromUntyped(supabase, 'golf_qualifier_round_courses')
        .upsert(rows, { onConflict: 'qualifier_id,round_number' });

      if (upsertError) {
        return { success: false, error: 'Failed to save the round courses. Please try again.' };
      }
    }

    // Prune any assignments left over above the new round count (e.g. the coach
    // reduced num_rounds). Targeted delete, never delete-all.
    const { error: pruneError } = await fromUntyped(supabase, 'golf_qualifier_round_courses')
      .delete()
      .eq('qualifier_id', qualifierId)
      .gt('round_number', safeNumRounds);

    if (pruneError) {
      await logServerError(`setQualifierRoundCourses prune failed: ${pruneError.message}`, {
        action: 'setQualifierRoundCourses.prune',
        featureArea: 'qualifiers',
      });
    }

    revalidatePath('/golf/dashboard/qualifiers');
    revalidatePath(`/golf/dashboard/qualifiers/${qualifierId}`);
    revalidatePath('/golf/dashboard/my-qualifiers');

    return { success: true, data: undefined };
  } catch (error) {
    return formatSafeErrorResponse(error);
  }
}

const observedSetQualifierRoundCourses = withAdminObserved(
  'setQualifierRoundCourses',
  { sport: 'golf', feature: 'qualifiers' },
  setQualifierRoundCoursesImpl,
);

export async function setQualifierRoundCourses(
  qualifierId: string,
  numRounds: number,
  roundCourses: QualifierRoundCourseInput[],
): Promise<ActionResult> {
  return observedSetQualifierRoundCourses(qualifierId, numRounds, roundCourses);
}

async function updateQualifierStatusImpl(
  qualifierId: string,
  status: 'upcoming' | 'in_progress' | 'completed'
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to update qualifier status' };
    }

    // THREE READS, ONE VERDICT, AND EVERY FAILURE LOOKED LIKE A FINDING.
    //
    // The qualifier read said "Qualifier not found" for one the coach has
    // open. The coach and team reads both feed a single `!coach ||
    // !qualifierTeam || org mismatch` test, so a failure in either produced a
    // bare "Unauthorized" — the least informative thing this surface can say,
    // and one that reads as a statement about the coach's standing.
    //
    // Refusing when the check cannot run is right and is kept. `.single()`
    // reports a genuine no-row as PGRST116, so a qualifier that really is gone
    // still says so, and a coach who really is in another org is still
    // refused.
    const QUALIFIER_UNREADABLE =
      "Couldn't verify your access to this qualifier. Please try again.";

    const { data: qualifier, error: qualifierError } = await supabase
      .from('golf_qualifiers')
      .select('team_id')
      .eq('id', qualifierId)
      .single();

    if (qualifierError && qualifierError.code !== 'PGRST116') {
      await logServerError(
        `qualifier gate: qualifier read failed for ${qualifierId}: ${describeError(qualifierError)}`,
        { action: 'golf.qualifierGate', featureArea: 'qualifiers' },
        'warning',
      );
      return { success: false, error: QUALIFIER_UNREADABLE };
    }

    if (!qualifier) return { success: false, error: 'Qualifier not found' };

    const { data: coach, error: coachError } = await supabase
      .from('golf_coaches')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    const { data: qualifierTeam, error: qualifierTeamError } = await supabase
      .from('golf_teams')
      .select('organization_id')
      .eq('id', qualifier.team_id)
      .single();

    const gateReadFailed =
      (coachError && coachError.code !== 'PGRST116') ||
      (qualifierTeamError && qualifierTeamError.code !== 'PGRST116');

    if (gateReadFailed) {
      await logServerError(
        `qualifier gate: authorization read failed for ${qualifierId}: ${describeError(coachError ?? qualifierTeamError)}`,
        { action: 'golf.qualifierGate', featureArea: 'qualifiers' },
        'warning',
      );
      return { success: false, error: QUALIFIER_UNREADABLE };
    }

    if (!coach || !qualifierTeam || coach.organization_id !== qualifierTeam.organization_id) {
      return { success: false, error: 'Unauthorized' };
    }

    // PostgREST reports an RLS-filtered UPDATE as a successful request with
    // zero returned rows. Select the id so the coach is never told a manual
    // close worked when the qualifier was not actually changed.
    const { data: updatedQualifiers, error } = await supabase
      .from('golf_qualifiers')
      .update({ status })
      .eq('id', qualifierId)
      .select('id');

    if (error) {
      return { success: false, error: 'Failed to update qualifier status. Please try again.' };
    }

    if (!updatedQualifiers || updatedQualifiers.length !== 1) {
      await logServerError(
        `qualifier status update matched no row for ${qualifierId}`,
        { action: 'golf.updateQualifierStatus', featureArea: 'qualifiers' },
        'warning',
      );
      return {
        success: false,
        error: "Couldn't update this qualifier — it may have been deleted, or you may not have edit access to this team.",
      };
    }

    revalidatePath('/golf/dashboard/qualifiers');
    updateTag(CACHE_TAGS.DASHBOARD);

    return { success: true, data: undefined };

  } catch (error) {
    return formatSafeErrorResponse(error);
  }
}

const observedUpdateQualifierStatus = withAdminObserved(
  'updateQualifierStatus',
  { demoSafe: true, sport: 'golf', feature: 'qualifiers' },
  updateQualifierStatusImpl,
);

export async function updateQualifierStatus(
  qualifierId: string,
  status: 'upcoming' | 'in_progress' | 'completed'
): Promise<ActionResult> {
  return observedUpdateQualifierStatus(qualifierId, status);
}

/** Editable scalar fields on an existing qualifier. All optional — only the
 *  keys the caller actually sends are written. */
export interface UpdateGolfQualifierDetailsInput {
  name?: string;
  description?: string | null;
  courseName?: string | null;
  rules?: string | null;
  entryDeadline?: string | null;
  startDate?: string;
  endDate?: string | null;
  spotsAvailable?: number | null;
}

const updateGolfQualifierDetailsSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    courseName: z.string().max(200).nullable().optional(),
    rules: z.string().max(5000).nullable().optional(),
    entryDeadline: z.string().nullable().optional(),
    startDate: z.string().optional(),
    endDate: z.string().nullable().optional(),
    spotsAvailable: z.number().int().min(1).nullable().optional(),
  })
  .refine((d) => !d.endDate || !d.startDate || d.endDate >= d.startDate, {
    message: 'End date cannot be before the start date',
    path: ['endDate'],
  })
  .refine((d) => !d.entryDeadline || !d.startDate || d.entryDeadline <= d.startDate, {
    message: 'Entry deadline must be on or before the start date',
    path: ['entryDeadline'],
  });

/**
 * Feature — edit an existing qualifier's basic details (name, description,
 * dates, rules, spots). Coach-only; mirrors the auth/team-ownership check
 * every other qualifier mutation in this file uses. Round count + per-round
 * course assignments are a separate concern, already handled by the
 * existing setQualifierRoundCourses — this only touches golf_qualifiers'
 * scalar columns, closing the "no edit surface after creation" gap.
 */
async function updateGolfQualifierDetailsImpl(
  qualifierId: string,
  data: UpdateGolfQualifierDetailsInput,
): Promise<ActionResult> {
  try {
    const validatedData = updateGolfQualifierDetailsSchema.parse(data);
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to edit a qualifier' };
    }

    // Verify coach owns this qualifier's team (same check as updateQualifierStatusImpl).
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

    // Only write fields the caller actually sent — undefined keys stay
    // untouched, an explicit null clears the column.
    const updateData: Database['public']['Tables']['golf_qualifiers']['Update'] = {};
    if (validatedData.name !== undefined) updateData.name = validatedData.name;
    if (validatedData.description !== undefined) updateData.description = validatedData.description;
    if (validatedData.courseName !== undefined) updateData.course_name = validatedData.courseName;
    if (validatedData.rules !== undefined) updateData.rules = validatedData.rules;
    if (validatedData.entryDeadline !== undefined) updateData.entry_deadline = validatedData.entryDeadline;
    if (validatedData.startDate !== undefined) updateData.start_date = validatedData.startDate;
    if (validatedData.endDate !== undefined) updateData.end_date = validatedData.endDate;
    if (validatedData.spotsAvailable !== undefined) updateData.spots_available = validatedData.spotsAvailable;

    if (Object.keys(updateData).length === 0) {
      return { success: true, data: undefined };
    }

    // `.select('id')` so a 0-row update surfaces as a failure instead of a
    // false success — a PostgREST UPDATE matching no rows resolves
    // `{ data: null, error: null }`, exactly like one that matched. Same
    // reasoning, and the same fix, as recordFocusAreaOutcomeImpl in
    // development.ts and the WriteIntegrityError guard in rsvp.ts.
    //
    // It can genuinely match nothing. The gate above compares ORGANISATIONS,
    // while `golf_qualifiers_update_coach` is `is_golf_team_coach(team_id)` —
    // a `golf_team_coach_staff` row for that specific team, which is the
    // narrower set. A concurrently deleted qualifier does it too. Either way
    // `FairwayEditQualifier` used to navigate to the detail page as though the
    // edit had landed, and the coach found out on reload.
    const { data: updatedRows, error } = await supabase
      .from('golf_qualifiers')
      .update(updateData)
      .eq('id', qualifierId)
      .select('id');

    if (error) {
      return { success: false, error: 'Failed to update qualifier. Please try again.' };
    }

    if (!updatedRows || updatedRows.length === 0) {
      await logServerError(
        `updateGolfQualifierDetails matched no rows for qualifier ${qualifierId} — the org-level gate passed but the write did not land`,
        { action: 'golf.updateGolfQualifierDetails', featureArea: 'qualifiers' },
        'warning',
      );
      return {
        success: false,
        error: "Couldn't save this qualifier — it may have been deleted, or you may not have edit access to this team.",
      };
    }

    revalidatePath('/golf/dashboard/qualifiers');
    revalidatePath(`/golf/dashboard/qualifiers/${qualifierId}`);
    revalidatePath('/golf/dashboard/my-qualifiers');
    updateTag(CACHE_TAGS.DASHBOARD);

    return { success: true, data: undefined };

  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid qualifier data. Please check your inputs.' };
    }
    return formatSafeErrorResponse(error);
  }
}

const observedUpdateGolfQualifierDetails = withAdminObserved(
  'updateGolfQualifierDetails',
  { demoSafe: true, sport: 'golf', feature: 'qualifiers' },
  updateGolfQualifierDetailsImpl,
);

export async function updateGolfQualifierDetails(
  qualifierId: string,
  data: UpdateGolfQualifierDetailsInput,
): Promise<ActionResult> {
  return observedUpdateGolfQualifierDetails(qualifierId, data);
}

// ============================================================================
// ANNOUNCEMENT ACTIONS
// ============================================================================

async function createAnnouncementImpl(data: {
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

    const teamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);
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

const observedCreateAnnouncement = withAdminObserved(
  'createAnnouncement',
  { demoSafe: true, sport: 'golf', feature: 'announcements' },
  createAnnouncementImpl,
);

export async function createAnnouncement(data: {
  title: string;
  body: string;
  urgency: 'low' | 'normal' | 'high' | 'urgent';
  requiresAcknowledgement: boolean;
}): Promise<ActionResult<{ announcementId: string }>> {
  return observedCreateAnnouncement(data);
}

// ============================================================================
// PLAYER ACTIONS
// ============================================================================

async function invitePlayerToTeamImpl(

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

    const teamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);
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

const observedInvitePlayerToTeam = withAdminObserved(
  'invitePlayerToTeam',
  { sport: 'golf', feature: 'roster_management' },
  invitePlayerToTeamImpl,
);

export async function invitePlayerToTeam(
  _email: string // Email parameter reserved for future email invitations
): Promise<ActionResult<{ inviteCode: string; inviteLink: string }>> {
  return observedInvitePlayerToTeam(_email);
}

async function updatePlayerStatusImpl(
  playerId: string,
  // The golf_team_members.status column allows active/inactive/removed; the
  // roster UI now offers active/inactive only (B4/F007). 'injured'/'redshirt'
  // remain in the param type as a no-op for any stale caller but can no longer
  // be selected from the UI.
  status: 'active' | 'injured' | 'redshirt' | 'inactive'
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to update player status' };
    }

    // F153/F154: resolve the coach's ACTIVE team via the cookie-aware resolver
    // (mirrors removePlayerFromTeam). The previous requireGolfCoach() path
    // resolved the team with an org-wide .maybeSingle() that ERRORS on a
    // two-team org (men's + women's) — the status picker silently failed for any
    // such program. resolveCoachTeamIdWithCookie never throws on multi-team orgs
    // and honours the active-team toggle.
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!coach) {
      return { success: false, error: 'Only coaches can update player status' };
    }

    const teamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);
    if (!teamId) {
      return { success: false, error: 'Coach not assigned to a team' };
    }

    // Verify the player is on the coach's resolved team.
    const { data: membership } = await supabase
      .from('golf_team_members')
      .select('id')
      .eq('player_id', playerId)
      .eq('team_id', teamId)
      .maybeSingle();

    if (!membership) {
      return { success: false, error: 'Player is not on your team' };
    }

    // Update status on golf_team_members. The status CHECK allows
    // active/inactive/removed; the UI only sends active/inactive.
    const { error } = await supabase
      .from('golf_team_members')
      .update({
        // Cast to bypass strict enum typing — the DB CHECK governs the value.
        status: status as unknown as 'active' | 'inactive',
        updated_at: new Date().toISOString()
      })
      .eq('player_id', playerId)
      .eq('team_id', teamId);

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

const observedUpdatePlayerStatus = withAdminObserved(
  'updatePlayerStatus',
  { demoSafe: true, sport: 'golf', feature: 'roster_management' },
  updatePlayerStatusImpl,
);

export async function updatePlayerStatus(
  playerId: string,
  status: 'active' | 'injured' | 'redshirt' | 'inactive'
): Promise<{ success: boolean; error?: string }> {
  return observedUpdatePlayerStatus(playerId, status);
}

// ============================================================================
// RSVP & CALENDAR ACTIONS
// ============================================================================

/**
 * Player responds to an event invitation
 */
/**
 * Player self-RSVP.
 *
 * 2026-06-10 (audit findings #8, #16):
 * - Authz is team membership, not a pre-seeded invite: any ACTIVE member of
 *   the event's team may RSVP. The write is an upsert on
 *   (event_id, player_id) — the golf_event_attendance_insert_self RLS policy
 *   (live) lets a player INSERT their own row, so whole-team events no longer
 *   hard-error for players the coach didn't pre-pick.
 * - Locks: RSVPs are rejected after the event starts and after rsvp_deadline
 *   (enforced inside updateRSVP). Failures carry a machine-readable `code`
 *   the UI can branch on.
 */
async function respondToEventImpl(
  eventId: string,
  status: 'pending' | 'accepted' | 'declined' | 'tentative'
): Promise<RespondToEventResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'You must be signed in' };
    }

    // The three reads below decide what a player is told when they tap Going.
    // Refusing on a failed read is right — RSVP is authorized here as well as
    // at the DB, and a check that could not run must not pass. What each one
    // must NOT do is dress a failure up as a finding: this path otherwise
    // tells a player with a profile "Player profile not found", tells them the
    // event they are looking at does not exist, or tells an active member of
    // the team that only active members may RSVP. All three read as the app
    // having lost them, and none suggests trying again.
    const UNREADABLE = "Couldn't check your RSVP for this event. Please try again.";

    // Get player ID
    const { data: player, error: playerError } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (playerError && playerError.code !== 'PGRST116') {
      await logServerError(
        `RSVP player read failed: ${describeError(playerError)}`,
        { action: 'golf.respondToEvent', featureArea: 'calendar' },
        'warning'
      );
      return { success: false, error: UNREADABLE };
    }

    if (!player) {
      return { success: false, error: 'Player profile not found' };
    }

    // Authorize: the event must be visible and the caller must be an ACTIVE
    // member of its team. The RLS INSERT policy enforces the same rule at the
    // DB — this check exists to return a typed, renderable error instead of a
    // generic write failure.
    const { data: event, error: eventError } = await supabase
      .from('golf_events')
      .select('id, team_id')
      .eq('id', eventId)
      .maybeSingle();

    if (eventError) {
      await logServerError(
        `RSVP event read failed for ${eventId}: ${describeError(eventError)}`,
        { action: 'golf.respondToEvent', featureArea: 'calendar' },
        'warning'
      );
      return { success: false, error: UNREADABLE };
    }

    if (!event) {
      return { success: false, error: 'Event not found' };
    }

    const { data: membership, error: membershipError } = await supabase
      .from('golf_team_members')
      .select('id')
      .eq('team_id', event.team_id)
      .eq('player_id', player.id)
      .eq('status', 'active')
      .maybeSingle();

    if (membershipError) {
      await logServerError(
        `RSVP membership read failed for player ${player.id}: ${describeError(membershipError)}`,
        { action: 'golf.respondToEvent', featureArea: 'calendar' },
        'warning'
      );
      return { success: false, error: UNREADABLE };
    }

    if (!membership) {
      return {
        success: false,
        error: "Only active members of this event's team can RSVP.",
        code: 'not_team_member',
      };
    }

    const { updateRSVP, RSVPDeadlinePassedError, RSVPLockedError } = await import('@/lib/calendar/rsvp');
    const { WriteIntegrityError } = await import('@/lib/calendar/write-integrity');
    try {
      await updateRSVP(eventId, player.id, status, supabase);
    } catch (err) {
      if (err instanceof RSVPDeadlinePassedError) {
        return { success: false, error: 'RSVP deadline has passed for this event.', code: 'rsvp_deadline_passed' };
      }
      if (err instanceof RSVPLockedError) {
        const message = err.code === 'event_cancelled'
          ? 'This event has been cancelled — RSVPs are closed.'
          : 'This event has already started — RSVPs are locked.';
        // Lib code 'deadline_passed' is unreachable here (caught above) but
        // map it anyway so the union stays exhaustive.
        const code: RSVPErrorCode = err.code === 'deadline_passed' ? 'rsvp_deadline_passed' : err.code;
        return { success: false, error: message, code };
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
          code: 'write_failed',
        };
      }
      throw err;
    }

    revalidatePath('/golf/dashboard/calendar');
    updateTag(CACHE_TAGS.DASHBOARD);
    updateTag(CACHE_TAGS.CALENDAR);
    return { success: true, data: undefined };

  } catch (err) {
    await logServerError(`respondToEvent failed: ${describeError(err)}`, {
      action: 'respondToEvent.unexpected',
      featureArea: 'calendar',
      extra: { stack: err instanceof Error ? err.stack : undefined },
    }, 'warning');
    return { success: false, error: 'Failed to update RSVP', code: 'write_failed' };
  }
}

const observedRespondToEvent = withAdminObserved(
  'respondToEvent',
  { sport: 'golf', feature: 'calendar_events' },
  respondToEventImpl,
);

export async function respondToEvent(
  eventId: string,
  status: 'pending' | 'accepted' | 'declined' | 'tentative'
): Promise<RespondToEventResult> {
  return observedRespondToEvent(eventId, status);
}

/**
 * Coach-triggered reminder: drops in-app rows into golf_calendar_notifications
 * for the supplied players, deduplicated against the cron-generated reminders
 * by a distinct notification_type. Use admin client because notifications are
 * inserted on behalf of other users.
 */
async function sendEventReminderToPlayersImpl(
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
    const { data: teamPlayers, error: teamPlayersError } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', event.team_id)
      .eq('status', 'active')
      .in('player_id', playerIds);

    // Scoping to the event's team must FAIL CLOSED — that is the point of this
    // read and it is kept. What was wrong is that it failed closed while
    // reporting `success: true, sent: 0`: the coach is told the send worked
    // and that it reached nobody, in the same breath, and no player gets the
    // reminder for an event they are expected to attend.
    //
    // Third instance of this shape found today, after the announcements roster
    // read and createTaskFromTemplate. Sending to nobody is never a success.
    if (teamPlayersError) {
      await logServerError(
        `[notifyEventPlayers] recipient scoping read failed — nothing was sent: ${describeError(teamPlayersError)}`,
        { action: 'golf.notifyEventPlayers', featureArea: 'calendar' },
      );
      return { success: false, error: "Couldn't confirm who to notify, so nothing was sent. Please try again." };
    }

    const allowedPlayerIds = (teamPlayers ?? [])
      .map((m) => m.player_id)
      .filter((id): id is string => Boolean(id));
    if (allowedPlayerIds.length === 0) {
      return { success: true, data: { sent: 0 } };
    }

    const { data: players, error: playersError } = await supabase
      .from('golf_players')
      .select('id, user_id')
      .in('id', allowedPlayerIds);

    if (playersError) {
      await logServerError(
        `[notifyEventPlayers] player lookup failed — nothing was sent: ${describeError(playersError)}`,
        { action: 'golf.notifyEventPlayers', featureArea: 'calendar' },
      );
      return { success: false, error: "Couldn't confirm who to notify, so nothing was sent. Please try again." };
    }

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
    await logServerError(`sendEventReminderToPlayers error: ${describeError(err)}`, {
      action: 'sendEventReminderToPlayers',
      featureArea: 'calendar',
      extra: { eventId },
    });
    return { success: false, error: 'Failed to send reminders' };
  }
}

const observedSendEventReminderToPlayers = withAdminObserved(
  'sendEventReminderToPlayers',
  { sport: 'golf', feature: 'calendar_events' },
  sendEventReminderToPlayersImpl,
);

export async function sendEventReminderToPlayers(
  eventId: string,
  playerIds: string[],
): Promise<ActionResult<{ sent: number }>> {
  return observedSendEventReminderToPlayers(eventId, playerIds);
}

/**
 * Check for scheduling conflicts when creating/editing an event
 */
/**
 * Restrict a conflict check to people the caller actually shares a team with.
 *
 * `attendeeIds` are golf_players TABLE ids — NOT auth user ids. The comment
 * that previously said "auth user ids" was the bug: the editor's roster picker
 * sends `golf_players.id` (calendar page selects `golf_players(id, ...)`), and
 * the conflict library filters `golf_players .in('id', attendeeIds)` — so the
 * ids were always player ids end to end. This gate compared them against a set
 * of USER ids, which contains no player id, ever, so every conflict check with
 * at least one attendee was denied for every coach from the moment the gate
 * shipped. Caught in the Bridge 2026-08-20 19:03Z: the Guilford HEAD COACH
 * told "Not authorized to check availability for these people" about his own
 * roster.
 *
 * The allowed set is therefore the PLAYER ids on the caller's teams — staffed
 * teams if they are a coach, joined teams if they are a player, both if both.
 * (The picker offers only players, so coach ids never appear in the list.)
 *
 * Fails CLOSED on a failed read, and says so separately from a real denial — a
 * coach whose roster read timed out must be told to retry, not told their own
 * athletes are strangers.
 */
async function resolveSharedScheduleScope(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  attendeeIds: string[],
  /** The event being edited, when there is one. Its existing attendees are in
   * scope even if they have since left the roster — see the note below. */
  excludeEventId?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const requested = [...new Set(attendeeIds.filter(Boolean))].filter((id) => id !== userId);
  if (requested.length === 0) return { ok: true };

  const RETRY = "Couldn't verify your team just now. Please try again.";
  const DENIED = 'Not authorized to check availability for these people';

  const [{ data: coachRows, error: coachErr }, { data: playerRows, error: playerErr }] =
    await Promise.all([
      supabase.from('golf_coaches').select('id').eq('user_id', userId),
      supabase.from('golf_players').select('id').eq('user_id', userId),
    ]);
  if (coachErr || playerErr) return { ok: false, error: RETRY };

  const coachIds = (coachRows ?? []).map((r) => r.id);
  const playerIds = (playerRows ?? []).map((r) => r.id);

  const [staffTeams, memberTeams] = await Promise.all([
    coachIds.length
      ? supabase.from('golf_team_coach_staff').select('team_id').in('coach_id', coachIds)
      : Promise.resolve({ data: [] as Array<{ team_id: string }>, error: null }),
    playerIds.length
      ? supabase.from('golf_team_members').select('team_id').in('player_id', playerIds)
      : Promise.resolve({ data: [] as Array<{ team_id: string }>, error: null }),
  ]);
  if (staffTeams.error || memberTeams.error) return { ok: false, error: RETRY };

  const teamIds = [
    ...new Set([
      ...(staffTeams.data ?? []).map((r) => r.team_id),
      ...(memberTeams.data ?? []).map((r) => r.team_id),
    ]),
  ].filter((t): t is string => Boolean(t));

  if (teamIds.length === 0) return { ok: false, error: DENIED };

  const teamPlayers = await supabase
    .from('golf_team_members')
    .select('player_id')
    .in('team_id', teamIds);
  if (teamPlayers.error) return { ok: false, error: RETRY };

  // PLAYER-table ids, matching what the client sends and what
  // checkEventConflicts filters on. The caller's own player ids are included
  // so a player checking their own availability passes without a roster row
  // lookup ordering hazard.
  const allowed = new Set<string>(playerIds);
  for (const row of teamPlayers.data ?? []) {
    if (row.player_id) allowed.add(row.player_id);
  }

  // PLAYERS WHO HAVE LEFT THE TEAM ARE STILL ON THE EVENTS THEY ATTENDED.
  //
  // The roster is current; an event's attendee list is historical. When a coach
  // opens an existing event the editor seeds attendeeIds from that event, so a
  // single departed player makes every event they ever attended un-checkable —
  // the whole conflict check is denied, not just their row.
  //
  // Measured 2026-09-01 on the Guilford team: 12 current members, but 41 events
  // carrying attendance rows for 2 players with zero team rows left. That is
  // the SAME denial message as the 2026-08-20 user-id/player-id bug and a
  // completely different cause — worth stating, because the message alone sent
  // the last reader to the wrong fix.
  //
  // Widening to "already attending the event under edit" keeps the gate's
  // point intact: it still refuses an arbitrary id list, and the widening is
  // bounded by an event the caller's own team owns, which they can already see
  // in the UI. It is not a general escape hatch.
  if (excludeEventId) {
    const existing = await supabase
      .from('golf_event_attendance')
      .select('player_id, golf_events!inner(team_id)')
      .eq('event_id', excludeEventId)
      .in('golf_events.team_id', teamIds);
    if (existing.error) return { ok: false, error: RETRY };
    for (const row of (existing.data ?? []) as Array<{ player_id: string | null }>) {
      if (row.player_id) allowed.add(row.player_id);
    }
  }

  if (requested.some((id) => !allowed.has(id))) return { ok: false, error: DENIED };
  return { ok: true };
}

async function checkScheduleConflictsImpl(
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string,
  attendeeIds: string[],
  excludeEventId?: string,
  /** Client timezone offset (Date.getTimezoneOffset() minutes). When provided,
   * the proposed window is anchored to the coach's wall clock instead of the
   * server's (audit finding #7 — server-TZ parse made the comparison window
   * drift against UTC-stored timed events). Omitted → UTC, which matches the
   * previous prod behavior deterministically. */
  timezoneOffset?: number
): Promise<ActionResult<ConflictResult>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');

    // `attendeeIds` are auth user ids, and authentication was the only gate on
    // them. checkEventConflicts returns each attendee's NAME, AVATAR and the
    // TITLE of whatever they are busy with — including class schedules — so an
    // arbitrary id list turned this into a scheduling oracle for anyone the
    // caller could name. The editor only ever offers roster members, so
    // requiring a shared team costs legitimate callers nothing.
    const scope = await resolveSharedScheduleScope(supabase, user.id, attendeeIds, excludeEventId);
    if (!scope.ok) {
      return { success: false, error: scope.error };
    }

    const start = new Date(buildDateTimeString(startDate, startTime, timezoneOffset));
    const end = new Date(buildDateTimeString(endDate, endTime, timezoneOffset));

    const { checkEventConflicts } = await import('@/lib/calendar/conflicts');
    const result = await checkEventConflicts(
      start,
      end,
      attendeeIds,
      supabase,
      { excludeEventId }
    );

    /**
     * Serialize Date objects to ISO strings for client transport.
     *
     * `checkEventConflicts` returns the alternative slots as `suggestedTimes`.
     * This action's client contract calls the same field `suggestions`, and the
     * mapping below used to READ `.suggestions` off the library result — a key
     * that type never had. It was therefore always `undefined || []`, so the
     * editor's suggested-time chips (which render from `conflicts.suggestions`)
     * could not appear even when the engine had found slots. The whole
     * "find a time" path was dead on a one-word mismatch, and the
     * `as unknown as` double cast is what stopped the compiler saying so.
     */
    const serialized = {
      ...(result as unknown as ConflictResult),
      suggestions: (result.suggestedTimes ?? []).map((s) => ({
        start: s.start instanceof Date ? s.start.toISOString() : s.start,
        end: s.end instanceof Date ? s.end.toISOString() : s.end,
      })),
    } as unknown as ConflictResult;
    return { success: true, data: serialized };

  } catch {
    return { success: false, error: 'Failed to check conflicts' };
  }
}

const observedCheckScheduleConflicts = withAdminObserved(
  'checkScheduleConflicts',
  { sport: 'golf', feature: 'calendar_events' },
  checkScheduleConflictsImpl,
);

export async function checkScheduleConflicts(
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string,
  attendeeIds: string[],
  excludeEventId?: string,
  timezoneOffset?: number
): Promise<ActionResult<ConflictResult>> {
  return observedCheckScheduleConflicts(startDate, startTime, endDate, endTime, attendeeIds, excludeEventId, timezoneOffset);
}

/**
 * Get availability for a specific player on a specific date
 * Used for the availability day view overlay
 */
async function getPlayerAvailabilityImpl(
  memberId: string,
  startDate: string, // YYYY-MM-DD
  endDate: string, // YYYY-MM-DD
  /** Client timezone offset (Date.getTimezoneOffset() minutes). Anchors the
   * day window to the viewer's local day; omitted → UTC day (deterministic,
   * matches previous prod behavior). */
  timezoneOffset?: number
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

    // Deterministic window bounds — the old bare `new Date('...T00:00:00')`
    // parsed in the SERVER's timezone (audit finding #7).
    const dayStart = new Date(buildDateTimeString(startDate, '00:00:00', timezoneOffset));
    const dayEnd = new Date(buildDateTimeString(endDate, '23:59:59', timezoneOffset));

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

const observedGetPlayerAvailability = withAdminObserved(
  'getPlayerAvailability',
  { sport: 'golf', feature: 'calendar_events' },
  getPlayerAvailabilityImpl,
);

export async function getPlayerAvailability(
  memberId: string,
  startDate: string, // YYYY-MM-DD
  endDate: string, // YYYY-MM-DD
  timezoneOffset?: number
): Promise<ActionResult<SerializedBusyPeriod[]>> {
  return observedGetPlayerAvailability(memberId, startDate, endDate, timezoneOffset);
}

/**
 * Get the current user's busy periods (works for both coaches and players)
 * Used to show YOUR schedule when viewing availability alongside a team member
 */
async function getCurrentUserBusyPeriodsImpl(
  startDate: string, // YYYY-MM-DD
  endDate: string, // YYYY-MM-DD
  /** Client timezone offset (Date.getTimezoneOffset() minutes) — see
   * getPlayerAvailability. */
  timezoneOffset?: number
): Promise<ActionResult<SerializedBusyPeriod[]>> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const dayStart = new Date(buildDateTimeString(startDate, '00:00:00', timezoneOffset));
    const dayEnd = new Date(buildDateTimeString(endDate, '23:59:59', timezoneOffset));

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

const observedGetCurrentUserBusyPeriods = withAdminObserved(
  'getCurrentUserBusyPeriods',
  { sport: 'golf', feature: 'calendar_events' },
  getCurrentUserBusyPeriodsImpl,
);

export async function getCurrentUserBusyPeriods(
  startDate: string, // YYYY-MM-DD
  endDate: string, // YYYY-MM-DD
  timezoneOffset?: number
): Promise<ActionResult<SerializedBusyPeriod[]>> {
  return observedGetCurrentUserBusyPeriods(startDate, endDate, timezoneOffset);
}

/**
 * Get all calendar notifications for the current user
 * Note: golf_calendar_notifications table may not be in types
 */
async function getNotificationsImpl(limit: number = 50): Promise<ActionResult<CalendarNotification[]>> {
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

const observedGetNotifications = withAdminObserved(
  'getNotifications',
  { sport: 'golf', feature: 'notifications' },
  getNotificationsImpl,
);

export async function getNotifications(limit: number = 50): Promise<ActionResult<CalendarNotification[]>> {
  return observedGetNotifications(limit);
}

/**
 * Mark a notification as read
 * Note: golf_calendar_notifications table may not be in types
 */
async function markNotificationReadImpl(
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

const observedMarkNotificationRead = withAdminObserved(
  'markNotificationRead',
  { sport: 'golf', feature: 'notifications' },
  markNotificationReadImpl,
);

export async function markNotificationRead(
  notificationId: string
): Promise<ActionResult> {
  return observedMarkNotificationRead(notificationId);
}

/**
 * Mark all notifications as read for the current user
 * Note: golf_calendar_notifications table may not be in types
 */
async function markAllNotificationsReadImpl(): Promise<ActionResult> {
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

const observedMarkAllNotificationsRead = withAdminObserved(
  'markAllNotificationsRead',
  { sport: 'golf', feature: 'notifications' },
  markAllNotificationsReadImpl,
);

export async function markAllNotificationsRead(): Promise<ActionResult> {
  return observedMarkAllNotificationsRead();
}

/**
 * Get pending event invitations for the current player
 */
async function getPendingInvitationsImpl(): Promise<ActionResult<EventInvitation[]>> {
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
      .maybeSingle();

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

const observedGetPendingInvitations = withAdminObserved(
  'getPendingInvitations',
  { sport: 'golf', feature: 'roster_management' },
  getPendingInvitationsImpl,
);

export async function getPendingInvitations(): Promise<ActionResult<EventInvitation[]>> {
  return observedGetPendingInvitations();
}

/**
 * Get the current player's RSVP status for an event
 */
async function getPlayerEventRSVPImpl(
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
      .maybeSingle();

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

const observedGetPlayerEventRSVP = withAdminObserved(
  'getPlayerEventRSVP',
  { sport: 'golf', feature: 'calendar_events' },
  getPlayerEventRSVPImpl,
);

export async function getPlayerEventRSVP(
  eventId: string
): Promise<ActionResult<{ status: RSVPStatus; respondedAt: string | null } | null>> {
  return observedGetPlayerEventRSVP(eventId);
}

/**
 * Get RSVP summary for an event (coach view)
 */
async function getEventRSVPImpl(eventId: string): Promise<ActionResult<RSVPStats>> {
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

const observedGetEventRSVP = withAdminObserved(
  'getEventRSVP',
  { sport: 'golf', feature: 'calendar_events' },
  getEventRSVPImpl,
);

export async function getEventRSVP(eventId: string): Promise<ActionResult<RSVPStats>> {
  return observedGetEventRSVP(eventId);
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
async function addCoachBlockedTimeImpl(
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

const observedAddCoachBlockedTime = withAdminObserved(
  'addCoachBlockedTime',
  { demoSafe: true, sport: 'golf', feature: 'calendar_events' },
  addCoachBlockedTimeImpl,
);

export async function addCoachBlockedTime(
  data: z.infer<typeof blockedTimeSchema>
): Promise<ActionResult<{ id: string }>> {
  return observedAddCoachBlockedTime(data);
}

/**
 * Delete coach blocked time
 */
async function deleteCoachBlockedTimeImpl(id: string): Promise<ActionResult<void>> {
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

const observedDeleteCoachBlockedTime = withAdminObserved(
  'deleteCoachBlockedTime',
  { demoSafe: true, sport: 'golf', feature: 'calendar_events' },
  deleteCoachBlockedTimeImpl,
);

export async function deleteCoachBlockedTime(id: string): Promise<ActionResult<void>> {
  return observedDeleteCoachBlockedTime(id);
}

/**
 * Update coach blocked time
 */
async function updateCoachBlockedTimeImpl(
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

const observedUpdateCoachBlockedTime = withAdminObserved(
  'updateCoachBlockedTime',
  { demoSafe: true, sport: 'golf', feature: 'calendar_events' },
  updateCoachBlockedTimeImpl,
);

export async function updateCoachBlockedTime(
  id: string,
  data: Partial<z.infer<typeof blockedTimeSchema>>
): Promise<ActionResult<void>> {
  return observedUpdateCoachBlockedTime(id, data);
}

/**
 * Get coach blocked time periods
 */
async function getCoachBlockedTimeImpl(
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

const observedGetCoachBlockedTime = withAdminObserved(
  'getCoachBlockedTime',
  { sport: 'golf', feature: 'calendar_events' },
  getCoachBlockedTimeImpl,
);

export async function getCoachBlockedTime(
  startDate: string,
  endDate: string
): Promise<ActionResult<BlockedTimePeriod[]>> {
  return observedGetCoachBlockedTime(startDate, endDate);
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
  /** Cloud Library tee link (golf_course_tees.id) so a draft/partial save keeps
   *  its catalog tee provenance instead of writing tee_id=NULL. */
  teeId?: string;
  roundType: 'practice' | 'tournament' | 'qualifier';
  roundDate: string;
  qualifierId?: string;
  qualifierRoundNumber?: number;
  // Progress tracking
  currentHole: number;
  holesToPlay: number; // 9 or 18
  // Completed holes data
  // Sparse browser arrays cross the Server Action boundary as `undefined`
  // entries. The persistence contract represents an uncompleted hole as an
  // explicit null instead, so every transport can validate the same shape.
  holes: Array<HoleStats | null>;
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
 *
 * Wrapped in withAdminObserved below (Helm Bridge W6 exemplar retrofit) —
 * the mutation-heaviest golf path. Renamed to *Impl and re-exported under
 * the original name so no caller changes.
 */
async function savePartialRoundImpl(
  data: PartialRoundData,
  existingRoundId?: string
): Promise<ActionResult<{ roundId: string; updatedAt?: string; warnings?: string[] }>> {
  try {
    // A browser may retain an older JS bundle across a deployment. Those older
    // bundles built this array sparsely; Server Action transport preserves the
    // empty slots as `undefined`, while the durable persistence contract uses
    // explicit `null` for an uncompleted hole. Normalize at the server boundary
    // as well as in current clients so a cached mobile bundle cannot turn a
    // completed-hole checkpoint into a validation failure.
    //
    // `Array.prototype.map` preserves sparse slots, so use Array.from to visit
    // every index and materialize `null` values before Zod sees the payload.
    const normalizedData = {
      ...data,
      holes: Array.isArray(data?.holes)
        ? Array.from({ length: data.holes.length }, (_, index) => data.holes[index] ?? null)
        : data?.holes,
    } as PartialRoundData;
    data = normalizedData;

    // Validate input with Zod after normalizing legacy transport holes.
    const validated = partialRoundSchema.safeParse(data);
    if (!validated.success) {
      // Drill through the element-level mask BEFORE building the message, so
      // the log names the offending field rather than "holes.16 — Invalid
      // input". Falls back to the raw issue when nothing needs unmasking.
      const described = describeHoleValidationFailure(validated.error.issues, data?.holes);
      const firstError = validated.error.issues[0];
      const rawDetail = `${formatIssuePath(firstError?.path ?? [])} — ${firstError?.message ?? 'unknown'}`;
      const detail = described[0] ?? rawDetail;

      void logServerError(`Auto-save validation failed: ${detail}`, {
        action: 'savePartialRound',
        featureArea: 'shot_tracking',
        extra: {
          courseName: data.courseName,
          currentHole: data.currentHole,
          // Unmasked, field-level issues — the thing that was missing.
          zodErrors: described,
          // The raw issue kept alongside so a wrapper-level change is still
          // visible if the two ever disagree.
          zodErrorsRaw: validated.error.issues
            .slice(0, 5)
            .map(i => `${formatIssuePath(i.path)}: ${i.message}`),
          holesCount: Array.isArray(data?.holes) ? data.holes.length : null,
          emptyHoleSlots: Array.isArray(data?.holes)
            ? data.holes.reduce<number[]>(
                (acc, hole, index) => (hole === null || hole === undefined ? [...acc, index] : acc),
                [],
              )
            : null,
        },
      }, 'warning');

      // A payload mismatch must NEVER cost the player their shot.
      //
      // This used to `return { success: false }`, which threw away the WHOLE
      // round — 17 good holes discarded because hole 18 had one field the
      // schema didn't like — and surfaced as "Error updating shot" / "Error
      // deleting shot" mid-round. The mismatch is ours to reconcile on the
      // server, not the player's to lose data over.
      //
      // So: keep every hole that validates, null out the ones that don't (the
      // array is positional, so a hole is nulled rather than removed — dropping
      // it would renumber everything after it), and carry on with the save. The
      // discarded holes are logged above with their real field-level cause, so
      // the defect is still visible and still gets fixed — just not by the
      // player, mid-round, on the course.
      const salvagedHoles = Array.isArray(data.holes)
        ? data.holes.map((hole) =>
            hole === null || hole === undefined || partialHoleSchema.safeParse(hole).success
              ? hole ?? null
              : null,
          )
        : data.holes;

      const salvaged = partialRoundSchema.safeParse({ ...data, holes: salvagedHoles });

      if (!salvaged.success) {
        // The failure is outside `holes` (course name, round type, dates) —
        // nothing to salvage, and retrying the identical payload would just
        // fail again. Report `retry` so the caller treats it like a transient
        // skip rather than telling the player their round is broken.
        void logServerError(
          `Auto-save unsalvageable (failure outside holes): ${describeHoleValidationFailure(salvaged.error.issues, salvagedHoles)[0] ?? detail}`,
          {
            action: 'savePartialRound',
            featureArea: 'shot_tracking',
            extra: { courseName: data.courseName, currentHole: data.currentHole },
          },
          'error',
        );
        return { success: false, error: 'retry' };
      }

      const droppedHoles = Array.isArray(data.holes)
        ? data.holes.reduce<number[]>(
            (acc, hole, index) =>
              hole != null && (salvagedHoles as unknown[])[index] === null ? [...acc, index + 1] : acc,
            [],
          )
        : [];

      void logServerEvent(
        `Auto-save salvaged: saved the round without ${droppedHoles.length} unparseable hole(s)`,
        {
          action: 'savePartialRound.salvage',
          featureArea: 'shot_tracking',
          extra: { courseName: data.courseName, currentHole: data.currentHole, droppedHoles },
        },
        'warning',
      );

      data = { ...data, holes: salvagedHoles } as PartialRoundData;
    }

    // Bug #3: Clamp currentHole to holesToPlay for 9-hole rounds
    if (data.currentHole && data.holesToPlay) {
      data.currentHole = Math.min(data.currentHole, data.holesToPlay);
    }

    const supabase = await createClient();

    const { data: { user }, error: authCheckError } = await supabase.auth.getUser();
    if (!user) {
      // See isTransientAuthCheckFailure: on 2026-08-19 this branch logged
      // "session expired mid-round" 6 times for players holding valid tokens,
      // because the auth round trip died in transit during DB contention. A
      // background auto-save must treat that like 'busy' — silent skip, the
      // next tick re-sends everything — not like a sign-out.
      if (isTransientAuthCheckFailure(authCheckError)) {
        void logServerError('Auto-save auth check failed in transit (NOT a session expiry) — skipped, next tick covers', {
          action: 'savePartialRound',
          featureArea: 'shot_tracking',
          roundId: existingRoundId,
          errorDetails: authCheckError?.message,
          extra: { courseName: data.courseName, currentHole: data.currentHole, authStatus: authCheckError?.status ?? null },
        }, 'warning');
        return { success: false, error: 'retry' };
      }
      void logServerError('Auto-save failed: user session expired mid-round', {
        action: 'savePartialRound',
        featureArea: 'shot_tracking',
        roundId: existingRoundId,
        extra: { courseName: data.courseName, currentHole: data.currentHole },
      }, 'error');
      return { success: false, error: 'You must be signed in' };
    }

    // Get player record.
    //
    // `.maybeSingle()`, not `.single()`, and the error is BOUND rather than
    // discarded. Both halves were live defects, found 2026-08-27 from four
    // production events on `POST /golf/dashboard/rounds/continue/:id`:
    //
    //   1. `.single()` raises PGRST116 ("Cannot coerce the result to a single
    //      JSON object") when it finds no row. A user without a player
    //      profile is an EXPECTED state here, not an exception — and
    //      `Sentry.instrumentSupabaseClient` reports the failed query
    //      independently of how this code handles it, so a correctly-handled
    //      miss still surfaced as a production error with an unhandled
    //      mechanism. `.maybeSingle()` returns `{ data: null, error: null }`
    //      and the `if (!player)` branch below behaves identically.
    //
    //   2. `const { data: player } =` threw the error away, so an RLS denial
    //      or a transport failure was indistinguishable from "this user has no
    //      player row" — the auto-save reported "Player profile not found" to
    //      a player who has one. `error → []` is the shape the OS contract
    //      forbids; a read that FAILED must not be reported as a read that
    //      found nothing.
    const { data: player, error: playerError } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (playerError) {
      // Distinct message and code from the not-found branch on purpose: this
      // one is retryable and the next auto-save tick may well succeed, so it
      // must not tell the player their profile is missing.
      void logServerError(`Auto-save player lookup failed: ${playerError.message}`, {
        action: 'savePartialRound',
        featureArea: 'shot_tracking',
        roundId: existingRoundId,
        userId: user.id,
        errorCode: playerError.code,
        errorHint: playerError.hint,
        errorDetails: playerError.details,
        extra: { courseName: data.courseName, currentHole: data.currentHole },
      }, 'error');
      return { success: false, error: 'retry' };
    }

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

    // A lost browser-side round id must never turn a qualifier restart into an
    // update of a different persisted attempt. The client normally redirects
    // to Continue Round before it reaches this action; this server check is
    // the independent backstop for stale clients and direct callers.
    if (!existingRoundId && data.qualifierId && data.qualifierRoundNumber != null) {
      const { data: activeQualifierRounds, error: activeQualifierRoundsError } = await supabase
        .from('golf_rounds')
        .select('id')
        .eq('player_id', player.id)
        .eq('qualifier_id', data.qualifierId)
        .eq('qualifier_round_number', data.qualifierRoundNumber)
        .eq('status', 'in_progress')
        .limit(2);

      if (activeQualifierRoundsError) {
        return {
          success: false,
          error: 'We could not verify your saved qualifier round. Please try again before starting.',
        };
      }
      if ((activeQualifierRounds?.length ?? 0) > 0) {
        return {
          success: false,
          error: `Qualifier round ${data.qualifierRoundNumber} is already saved. Use Continue Round so its scorecard stays intact.`,
        };
      }
    }

    // An active qualifier round MUST carry its round number.
    //
    // A NULL here is a deadlock with no in-app way out: the cap check in
    // `getNextQualifierRoundNumber` counts the player's COMPLETED round numbers,
    // so a player who has used up the qualifier's rounds cannot start another —
    // and a numberless active round cannot be submitted either, because it has
    // no slot to submit into. Observed 2026-08-24: one player on a one-round
    // qualifier sat stuck for 33 hours with 46 shots recorded, reachable only
    // by a direct database write.
    //
    // Deriving the number costs one read and removes the state entirely.
    let resolvedQualifierRoundNumber = data.qualifierRoundNumber ?? null;
    if (data.qualifierId && !resolvedQualifierRoundNumber) {
      const { data: priorRounds, error: priorRoundsError } = await supabase
        .from('golf_rounds')
        .select('qualifier_round_number')
        .eq('qualifier_id', data.qualifierId)
        .eq('player_id', player.id)
        .eq('status', 'completed');

      if (priorRoundsError) {
        // A failed read must not masquerade as "no prior rounds": deriving
        // number 1 from an outage could claim a slot the player already
        // holds. Skip derivation — the save proceeds numberless exactly as
        // before this feature, and the next auto-save retries the read.
        void logServerEvent(
          'Auto-save could not read prior qualifier rounds; skipping round-number derivation this save',
          {
            action: 'savePartialRound.deriveQualifierRoundNumber',
            featureArea: 'shot_tracking',
            playerId: player.id,
            extra: { qualifierId: data.qualifierId, errorCode: priorRoundsError.code },
          },
          'warning',
        );
      } else {
        const usedNumbers = (priorRounds ?? [])
          .map(r => r.qualifier_round_number)
          .filter((n): n is number => typeof n === 'number');

        resolvedQualifierRoundNumber = (usedNumbers.length ? Math.max(...usedNumbers) : 0) + 1;

        void logServerEvent(
          `Auto-save derived a missing qualifier round number (${resolvedQualifierRoundNumber})`,
          {
            action: 'savePartialRound.deriveQualifierRoundNumber',
            featureArea: 'shot_tracking',
            playerId: player.id,
            extra: { qualifierId: data.qualifierId, usedNumbers },
          },
          'info',
        );
      }
    }

    const roundData = {
      player_id: player.id,
      team_id: teamId,
      course_id: resolvedCourseId,
      // Cloud Library tee link — the partial-save RPC reads p_round_data->>'tee_id'
      // (migration 20260613170000); without this, draft rounds persist tee_id=NULL.
      tee_id: data.teeId || null,
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
      qualifier_round_number: resolvedQualifierRoundNumber,
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
      if (!hole) continue;
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

        // Tee shots on par 3s ARE the approach; layups and post-penalty tee
        // shots are NOT, even though they carry shot_type='approach'.
        const holeData = completedHolesByNumber.get(holeNumber);
        if (holeData?.par != null &&
            isRealApproachShot(shot, holeData.par) &&
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
      const flightRecorder = await createSafeFlightRecorder({
        workflow: 'golf.round.autosave',
        roundId: existingRoundId,
        teamId,
        playerId: player.id,
        qualifierId: data.qualifierId ?? null,
        existingRoundId,
      });

      // Use atomic RPC — wraps delete+insert in a single transaction
      // RPC not in generated types yet — use type escape
      const rpcParams: Record<string, unknown> = {
        p_round_id: existingRoundId,
        p_round_data: { ...roundData, ...helmTracePayload(flightRecorder.traceId) },
        p_holes: holesPayload,
        p_shots: shotsPayload,
        p_putt_details: puttDetailsPayload,
        p_approach_details: approachDetailsPayload,
      };

      // Optimistic locking: pass expected updated_at to detect concurrent edits
      if (data.expectedUpdatedAt) {
        rpcParams.p_expected_updated_at = data.expectedUpdatedAt;
      }

      void flightRecorder.start('db.save_partial_round_atomic');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rpcResult, error: rpcError } = await (supabase as any).rpc(
        'save_partial_round_atomic',
        rpcParams
      );

      if (rpcError) {
        void flightRecorder.fail('db.save_partial_round_atomic', { errorCode: rpcError.code, errorSummary: rpcError.message });
        void flightRecorder.finalize('failure');
        // Single log call per failure — logServerError already carries the
        // richer domain context (roundId/playerId/errorCode/hint/details);
        // a paired logServerException here would just double-write the
        // same failure to admin_events.
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
          helmTraceId: flightRecorder.traceId,
          traceStep: 'db.save_partial_round_atomic',
          extra: { courseName: data.courseName, currentHole: data.currentHole },
        });
        return { success: false, error: 'Failed to save round. Please try again.' };
      }

      if (rpcResult && !rpcResult.success) {
        // Return conflict errors with a distinct error key so the UI can prompt a reload
        if (rpcResult.error === 'conflict') {
          void flightRecorder.warn('db.save_partial_round_atomic', { errorSummary: 'conflict' });
          void flightRecorder.finalize('warning');
          return { success: false, error: 'conflict', };
        }
        // 'busy' = single-flight skip: another save (or a submit) already holds
        // this round's row, so the RPC declined to queue behind it
        // (FOR UPDATE NOWAIT — see 20260820170000_single_flight_partial_round_save.sql).
        // Expected under normal team-session load, not a failure: every save
        // carries the full round state, so the next tick covers this one. No
        // error event — 15 of these across one Guilford evening is healthy
        // coalescing, not 15 incidents.
        if (rpcResult.error === 'busy') {
          void flightRecorder.warn('db.save_partial_round_atomic', { errorSummary: 'busy' });
          void flightRecorder.finalize('warning');
          return { success: false, error: 'busy' };
        }
        // Already-completed rounds are an expected race condition (auto-save fires
        // after submit completes) — return early without logging an error event.
        if (typeof rpcResult.error === 'string' && rpcResult.error.includes('already been completed')) {
          void flightRecorder.warn('db.save_partial_round_atomic', { errorSummary: rpcResult.error });
          void flightRecorder.finalize('warning');
          return { success: false, error: rpcResult.error };
        }
        // The round row is GONE. save_partial_round_atomic returns one string for
        // "no such row" and "not yours", but in practice this is the first: a client
        // can hold a roundId whose row never landed (a create that failed) or was
        // deleted, and every auto-save after that targets a row that does not exist.
        //
        // Without a distinct key the caller cannot tell this from a transient
        // failure, so it retries the same dead id forever and the player's round has
        // nowhere to land. Measured 2026-09-01: three auto-saves at Winchester CC
        // hole 9 failed this way in 55 seconds, each writing its own error event,
        // while the round id they named had zero rows in golf_rounds, golf_holes and
        // golf_shots — it had never existed.
        //
        // 'round_missing' lets the client drop the stale id and re-save as a CREATE.
        // That is safe even in the genuine not-yours case: the new round is owned by
        // the caller, so this can only ever recreate the caller's own snapshot, never
        // touch someone else's row. Logged as a warning, not an error — the client
        // recovers automatically and a recovered save is not an incident.
        if (typeof rpcResult.error === 'string' && ROUND_MISSING_RPC_ERROR.test(rpcResult.error)) {
          void flightRecorder.warn('db.save_partial_round_atomic', { errorSummary: 'round_missing' });
          void flightRecorder.finalize('warning');
          void logServerError(`Auto-save target round is missing — client will re-create: ${rpcResult.error}`, {
            action: 'savePartialRound',
            featureArea: 'shot_tracking',
            roundId: existingRoundId,
            playerId: player.id,
            userId: user.id,
            userEmail: user.email,
            helmTraceId: flightRecorder.traceId,
            traceStep: 'db.save_partial_round_atomic',
            extra: { rpcError: rpcResult.error, courseName: data.courseName, currentHole: data.currentHole },
          }, 'warning');
          return { success: false, error: 'round_missing' };
        }
        void flightRecorder.fail('db.save_partial_round_atomic', { errorSummary: rpcResult.error });
        void flightRecorder.finalize('failure');
        void logServerError(`Auto-save RPC returned failure: ${rpcResult.error || 'unknown'}`, {
          action: 'savePartialRound',
          featureArea: 'shot_tracking',
          roundId: existingRoundId,
          playerId: player.id,
          userId: user.id,
          userEmail: user.email,
          helmTraceId: flightRecorder.traceId,
          traceStep: 'db.save_partial_round_atomic',
          extra: { rpcError: rpcResult.error, courseName: data.courseName, currentHole: data.currentHole },
        }, 'error');
        return { success: false, error: rpcResult.error || 'Failed to save round.' };
      }

      void flightRecorder.complete('db.save_partial_round_atomic', { observed: { round_id: existingRoundId } });
      void flightRecorder.finalize('success');

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
            helmTraceId: flightRecorder.traceId,
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
      // Recover a session that lost its local roundId (e.g. a backgrounded/
      // killed tab) by looking for an in_progress round to resume — but
      // scope the match tightly (course + round date + qualifier context),
      // not just "most recently updated in_progress round for this player".
      // An unscoped recency match can collide with an unrelated unfinished
      // round (product supports multiple simultaneous in-progress rounds),
      // silently repurposing it and orphan-trimming its holes/shots away.
      // If the course can't even be resolved to an id there's no safe way
      // to disambiguate, so skip the heuristic and always insert fresh.
      let existingRound: { id: string } | null = null;
      if (resolvedCourseId) {
        let existingRoundQuery = supabase
          .from('golf_rounds')
          .select('id')
          .eq('player_id', player.id)
          .eq('status', 'in_progress')
          .eq('course_id', resolvedCourseId)
          .eq('round_date', data.roundDate);
        existingRoundQuery = data.qualifierId
          ? existingRoundQuery.eq('qualifier_id', data.qualifierId)
          : existingRoundQuery.is('qualifier_id', null);
        existingRoundQuery = data.qualifierRoundNumber != null
          ? existingRoundQuery.eq('qualifier_round_number', data.qualifierRoundNumber)
          : existingRoundQuery.is('qualifier_round_number', null);

        const { data: candidateRound } = await existingRoundQuery
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        existingRound = candidateRound;
      }

      let round: { id: string } | null = null;
      if (existingRound) {
        // Identity columns (player_id, team_id, qualifier_id, qualifier_round_number)
        // are set on INSERT and never change for an in-progress round. Stripping
        // them from the UPDATE payload avoids Postgres' per-column UPDATE-privilege
        // check on identity columns the baseline `authenticated` GRANT intentionally
        // omits (see 20260603040000_grant_update_golf_rounds_authenticated.sql) —
        // production stayed 42501-broken on this fallback path while that migration
        // was on disk but not yet applied.
        const { player_id: _pid, team_id: _tid, qualifier_id: _qid, qualifier_round_number: _qrn, ...updatePayload } = roundData;
        void _pid; void _tid; void _qid; void _qrn;
        // Update the existing in-progress round — ONLY if still in_progress
        // (prevents reverting a round that was just completed by submit)
        const { data: updatedRound, error: updateError } = await supabase
          .from('golf_rounds')
          .update(updatePayload)
          .eq('id', existingRound.id)
          .eq('player_id', player.id)
          .eq('status', 'in_progress')
          .select()
          .maybeSingle();
        if (updateError) {
          // maybeCaptureRlsDenial fires first and reports whether it
          // already logged this failure under the rls_denial classification.
          // Only fall through to the generic logServerError when it did NOT
          // — otherwise the same Postgres failure writes two admin_events
          // rows (one per classification) instead of one.
          const capturedAsRlsDenial = maybeCaptureRlsDenial(updateError, {
            table: 'golf_rounds',
            verb: 'update',
            action: 'savePartialRound',
            feature: 'round_tracking',
            sport: 'golf',
          });
          if (!capturedAsRlsDenial) {
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
          }
          return { success: false, error: 'Failed to save round. Please try again.' };
        }
        if (!updatedRound) {
          // Round was completed by submit — don't create a new one, just return success
          return { success: true, data: { roundId: existingRound.id } };
        }
        round = updatedRound;
      }

      if (!round) {
        // Create the parent round first. If a subsequent child write fails,
        // preserve this in-progress row and every previously durable child so
        // the next auto-save (or local recovery) can retry without losing the
        // player's round.
        const { data: newRound, error: roundError } = await supabase
          .from('golf_rounds')
          .insert(roundData)
          .select()
          .single();

        if (roundError) {
          // Same single-row-per-failure contract as the updateExisting
          // branch above: check RLS classification first, only log the
          // generic error when it wasn't already captured as a denial.
          const capturedAsRlsDenial = maybeCaptureRlsDenial(roundError, {
            table: 'golf_rounds',
            verb: 'insert',
            action: 'savePartialRound',
            feature: 'round_tracking',
            sport: 'golf',
          });
          if (!capturedAsRlsDenial) {
            await logServerError(`Auto-save insert round failed: ${roundError.message}`, {
              action: 'savePartialRound.insertRound',
              playerId: player.id,
              userId: user.id,
              userEmail: user.email,
              errorCode: roundError.code,
              errorDetails: roundError.details,
            });
          }
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
          // Single log call per failure (see updateExisting branch above).
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
          // Do NOT clean up the parent round here. A network or database
          // failure while saving holes is recoverable; deleting the
          // in-progress round turns that transient failure into data loss.
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
              // Single log call per failure (see updateExisting branch above).
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
              // Do NOT clean up the parent round here. A network or database
              // failure while saving shots is recoverable; deleting the
              // in-progress round turns that transient failure into data loss.
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
    // Single log call per failure (see updateExisting branch above) — keep
    // logServerError since it already carries the stack via `extra.stack`
    // below; a paired logServerException would only double-write this
    // same unexpected error to admin_events.
    await logServerError(`Auto-save unexpected error: ${describeError(err)}`, {
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
 * Observed wrapper — logging never alters behavior (see observed-action
 * tests). `'use server'` requires exported server actions to be async
 * function declarations (const-export form breaks Next's build), so the
 * wrapped closure is built once at module scope and the export just
 * delegates to it.
 */
const observedSavePartialRound = withAdminObserved(
  'savePartialRound',
  {
    sport: 'golf',
    feature: 'round_tracking',
    // Every returned-failure branch in savePartialRoundImpl already records
    // its own admin_events row (via logServerError or maybeCaptureRlsDenial)
    // with richer domain context (roundId/playerId/errorCode/etc). Without
    // this flag the wrapper's generic soft-failure observer ALSO fires on
    // every success-false return, doubling admin_events writes for real
    // failures and even logging the intentionally-silent 'conflict' /
    // "already been completed" race-condition returns that the impl
    // deliberately chose not to log. See src/app/golf/actions/insights.ts
    // getPlayerPatterns for the established idiom.
    observeSoftFailures: false,
  },
  savePartialRoundImpl,
);

/**
 * The exact failure save_partial_round_atomic returns when the target row is
 * not visible to the caller. Kept as one regex so the string lives in a single
 * place — it is matched against an RPC message, and a second copy is a second
 * thing to drift out of step with the migration that defines it.
 */
const ROUND_MISSING_RPC_ERROR = /round not found or you do not have permission to update it/i;

/**
 * submit_round_atomic's equivalent. It deliberately conflates three causes in
 * one sentence, so matching it is only the FIRST half of the decision — the
 * caller must then look the round up to tell "gone" from "already submitted".
 */
const SUBMIT_ROUND_UNAVAILABLE = /round not found, already completed, or no permission/i;

export async function savePartialRound(
  data: PartialRoundData,
  existingRoundId?: string
): Promise<ActionResult<{ roundId: string; updatedAt?: string; warnings?: string[] }>> {
  return observedSavePartialRound(data, existingRoundId);
}

/**
 * Delete an in-progress round
 */
async function deleteInProgressRoundImpl(roundId: string): Promise<ActionResult<void>> {
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
      .maybeSingle();

    if (!player) {
      return { success: false, error: 'Player profile not found' };
    }

    // Delete the round (cascades to holes and shots).
    //
    // `.select('id')` so a 0-row delete is distinguishable from a real one. Two
    // of the three filters are ownership and are unremarkable; the third,
    // `status = 'in_progress'`, is SEMANTIC — a round that has already been
    // submitted stops matching. A PostgREST DELETE that matches nothing
    // resolves `{ data: null, error: null }`, so checking `error` alone
    // returned success for a discard that discarded nothing.
    //
    // The caller acts on that answer: continue-round-client's handleDeleteRound
    // calls `clearEmergencySave(roundId)` — an irreversible
    // localStorage.removeItem — and navigates away. So the player lost their
    // local recovery snapshot while the round stayed on the server, and was
    // told nothing. The race is ordinary: a submit that succeeded server-side
    // but errored on the client, or a round finished in another tab.
    const { data: deletedRows, error } = await supabase
      .from('golf_rounds')
      .delete()
      .eq('id', roundId)
      .eq('player_id', player.id)
      .eq('status', 'in_progress')
      .select('id');

    if (error) {
      return { success: false, error: 'Failed to delete round' };
    }

    if (!deletedRows || deletedRows.length === 0) {
      // Deliberately specific. The player is one tap from losing their local
      // recovery copy, so "try again" would be the wrong steer — the round is
      // not in a discardable state and retrying cannot change that.
      return {
        success: false,
        error: "This round can no longer be discarded — it looks like it was already finished or removed.",
      };
    }

    revalidatePath('/golf/dashboard/rounds');
    updateTag(CACHE_TAGS.ROUNDS);

    return { success: true, data: undefined };

  } catch (error) {
    await logServerError(
      `deleteInProgressRound failed: ${describeError(error)}`,
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

const observedDeleteInProgressRound = withAdminObserved(
  'deleteInProgressRound',
  { sport: 'golf', feature: 'round_tracking' },
  deleteInProgressRoundImpl,
);

export async function deleteInProgressRound(roundId: string): Promise<ActionResult<void>> {
  return observedDeleteInProgressRound(roundId);
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
async function getPlayerQualifiersImpl(): Promise<ActionResult<PlayerQualifierInfo[]>> {
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
      .maybeSingle();

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
          status,
          num_rounds
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
        num_rounds: number | null;
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
          num_rounds: number | null;
        };

        // Get rounds for this qualifier
        const qualifierRounds = (rounds || []).filter((r) => r.qualifier_id === q.id);
        const { roundsCompleted, completedRoundNumbers, totalScore, totalToPar } =
          derivePlayerQualifierProgress(qualifierRounds, {
            roundsCompleted: entry.rounds_completed,
            totalScore: entry.total_score,
            totalToPar: entry.total_to_par,
          });
        // num_rounds is a live, typed golf_qualifiers column (NOT NULL, default
        // 1) — read it directly instead of falling back to a computed guess
        // that was always roundsCompleted+1 (structurally always "one more
        // round to go", so a 1-round qualifier never left the active picker).
        const numRounds = q.num_rounds ?? 1;

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
          totalScore,
          totalToPar,
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

const observedGetPlayerQualifiers = withAdminObserved(
  'getPlayerQualifiers',
  { sport: 'golf', feature: 'my_qualifiers' },
  getPlayerQualifiersImpl,
);

export async function getPlayerQualifiers(): Promise<ActionResult<PlayerQualifierInfo[]>> {
  return observedGetPlayerQualifiers();
}

/**
 * Get the next available round number for a qualifier
 */
async function getNextQualifierRoundNumberImpl(
  qualifierId: string
): Promise<ActionResult<{
  nextRoundNumber: number;
  availableRounds: number[];
  /** A started qualifier round is never replaced by a blank new-round save. */
  activeRoundId?: string;
}>> {
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
      .maybeSingle();

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

    // Verify qualifier exists and remains coach-open. Scheduled dates never
    // close a qualifier, but an explicit coach completion must stop stale
    // direct links before they can start another round.
    const { data: qualifier } = await supabase
      .from('golf_qualifiers')
      .select('id, num_rounds, status')
      .eq('id', qualifierId)
      .single();

    if (!qualifier) {
      return { success: false, error: 'Qualifier not found' };
    }
    // REMOVED 2026-08-31 alongside the submit-side check above. Opening only
    // submission would have been half a fix: a round has to be STARTED before
    // it can be submitted, so this guard would have become the new dead end
    // one step earlier, with a message about the coach closing the qualifier
    // rather than anything the player could act on.

    // A started qualifier round owns its number until it is submitted or
    // explicitly discarded. Returning it here lets the client resume the
    // durable parent instead of creating a second parent or overwriting the
    // existing scorecard with a blank setup payload.
    const { data: activeRounds, error: activeRoundsError } = await supabase
      .from('golf_rounds')
      .select('id, qualifier_round_number')
      .eq('qualifier_id', qualifierId)
      .eq('player_id', player.id)
      .eq('status', 'in_progress')
      .order('updated_at', { ascending: false })
      .limit(2);

    if (activeRoundsError) {
      return { success: false, error: 'We could not verify your saved qualifier round. Please try again before starting.' };
    }
    if ((activeRounds?.length ?? 0) > 1) {
      return {
        success: false,
        error: 'You have more than one saved round for this qualifier. Do not start another one; use Continue Round so your existing scorecards stay intact.',
      };
    }
    if (activeRounds?.[0]) {
      const active = activeRounds[0];
      return {
        success: true,
        data: {
          nextRoundNumber: active.qualifier_round_number ?? 1,
          availableRounds: [],
          activeRoundId: active.id,
        },
      };
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

    const numRounds = qualifier.num_rounds ?? 1;

    // Qualifier progression is the first configured number the player has not
    // submitted, not `max(completed) + 1`. The latter skips a recoverable gap
    // in legacy/out-of-order data (for example 1 and 3 becoming 4) and can
    // falsely report that a player has exhausted their configured rounds.
    const unusedConfiguredRounds = Array.from(
      { length: numRounds },
      (_, index) => index + 1,
    ).filter((roundNumber) => !completedRoundNumbers.has(roundNumber));
    const nextRoundNumber = unusedConfiguredRounds[0];

    if (nextRoundNumber === undefined) {
      const roundLabel = numRounds === 1 ? 'round' : 'rounds';
      // See qualifier_round_already_exists above: the code routes this
      // expected lifecycle outcome to 'warning', not a Sentry error
      // (observed live 2026-08-25 as Sentry JAVASCRIPT-NEXTJS-P8 / Bridge
      // fingerprint 709e5658 — a player at their configured limit).
      return {
        success: false,
        code: 'qualifier_round_limit_reached',
        error: `This qualifier is still open, but your coach configured ${numRounds} ${roundLabel}. You have submitted ${numRounds} of ${numRounds}. Ask a coach to raise the round count before starting another round.`,
      };
    }

    return {
      success: true,
      data: { nextRoundNumber, availableRounds: [nextRoundNumber] }
    };

  } catch {
    return {
      success: false,
      error: 'Failed to get round number. Please try again.'
    };
  }
}

const observedGetNextQualifierRoundNumber = withAdminObserved(
  'getNextQualifierRoundNumber',
  { sport: 'golf', feature: 'qualifiers' },
  getNextQualifierRoundNumberImpl,
);

export async function getNextQualifierRoundNumber(
  qualifierId: string
): Promise<ActionResult<{
  nextRoundNumber: number;
  availableRounds: number[];
  activeRoundId?: string;
}>> {
  return observedGetNextQualifierRoundNumber(qualifierId);
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

async function getQualifierLeaderboardImpl(
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

    // PGRST116 is PostgREST's "no rows" for .single(); that one really is
    // "not found". Every other error is a read that failed, and telling a
    // coach their qualifier doesn't exist because a connection dropped sends
    // them looking for data loss that never happened.
    if (qualifierError && (qualifierError as { code?: string }).code !== 'PGRST116') {
      await logServerError(
        `[getQualifierLeaderboard] qualifier read failed: ${describeError(qualifierError)}`,
        { action: 'getQualifierLeaderboard.qualifier', featureArea: 'qualifiers', userId: user.id },
      );
      return { success: false, error: "Couldn't load this qualifier. Please try again." };
    }

    if (!qualifier) {
      return { success: false, error: 'Qualifier not found' };
    }

    // Get current player (if exists).
    //
    // "No row" and "the read failed" are NOT the same answer, and this used to
    // discard the error and treat both as no row. A coach legitimately has no
    // golf_players row, so null is expected — but when the query itself fails,
    // `isPlayerEntered` below would be computed against a player id we never
    // learned, and the page would tell an entered player they hadn't entered
    // and offer them the Enter button again.
    const { data: currentPlayer, error: currentPlayerError } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (currentPlayerError) {
      await logServerError(
        `[getQualifierLeaderboard] player lookup failed: ${describeError(currentPlayerError)}`,
        { action: 'getQualifierLeaderboard.playerLookup', featureArea: 'qualifiers', userId: user.id },
      );
      return { success: false, error: "Couldn't load this qualifier. Please try again." };
    }

    // Get all entries with player info
    const { data: entries, error: entriesError } = await supabase
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

    // A failed read is not an empty field. Without this branch the early
    // return below answers `success: true, leaderboard: []` — the exact same
    // payload as a qualifier nobody has entered yet — so an RLS denial or a
    // dropped connection rendered as "no entries yet" on a full field.
    if (entriesError) {
      await logServerError(
        `[getQualifierLeaderboard] entries read failed: ${describeError(entriesError)}`,
        { action: 'getQualifierLeaderboard.entries', featureArea: 'qualifiers', userId: user.id },
      );
      return { success: false, error: "Couldn't load the field for this qualifier. Please try again." };
    }

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

    // This one is the most dangerous of the three to swallow. Every downstream
    // calculation reads `rounds || []`, so a failed read doesn't blank the
    // page — it produces a complete, confident leaderboard in which nobody has
    // posted a score. Coaches make lineup decisions off this screen.
    if (roundsResult.error) {
      await logServerError(
        `[getQualifierLeaderboard] rounds read failed: ${describeError(roundsResult.error)}`,
        { action: 'getQualifierLeaderboard.rounds', featureArea: 'qualifiers', userId: user.id },
      );
      return { success: false, error: "Couldn't load scores for this qualifier. Please try again." };
    }

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

const observedGetQualifierLeaderboard = withAdminObserved(
  'getQualifierLeaderboard',
  { sport: 'golf', feature: 'qualifiers' },
  getQualifierLeaderboardImpl,
);

export async function getQualifierLeaderboard(
  qualifierId: string
): Promise<ActionResult<QualifierLeaderboardData>> {
  return observedGetQualifierLeaderboard(qualifierId);
}

/**
 * Auto-advance a qualifier's lifecycle when a round is submitted (F029/F138).
 *
 * The first completed round flips an 'upcoming' qualifier to 'in_progress'.
 * This is the missing server-side caller that updateQualifierStatus never had:
 * without it the leaderboard's realtime "Live" pill (status === 'in_progress')
 * never illuminated once play actually started.
 *
 * Its calendar dates and entrant progress are scheduling/reporting metadata,
 * never a player lockout. A coach closes a qualifier manually via
 * updateQualifierStatus (the qualifying workspace's "Conclude qualifier"
 * action); there is deliberately no automatic `completed` transition.
 *
 * Uses the admin client for both status writes below: this is a system
 * transition triggered by a PLAYER's round submission, and
 * golf_qualifiers_update_coach RLS only grants UPDATE to the team's coach —
 * a player-session client would silently no-op (0 rows matched, no error).
 *
 * Best-effort and non-fatal: a failure here must never block the round submit.
 */
async function advanceQualifierOnRoundSubmit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  qualifierId: string,
): Promise<void> {
  const { data: qualifier } = await supabase
    .from('golf_qualifiers')
    .select('status')
    .eq('id', qualifierId)
    .maybeSingle();

  const automaticTransition = getQualifierAutomaticTransition(qualifier?.status);
  if (!automaticTransition) return;

  // This is the one permitted system transition. It starts play after a
  // verified submitted round; it never closes a qualifier.
  const admin = createAdminClient();
  await admin
    .from('golf_qualifiers')
    .update({ status: automaticTransition })
    .eq('id', qualifierId)
    // Guard against a concurrent transition (only start from 'upcoming').
    .eq('status', 'upcoming');
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
async function getPlayerSavedCoursesImpl(): Promise<ActionResult<SavedCourse[]>> {
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

const observedGetPlayerSavedCourses = withAdminObserved(
  'getPlayerSavedCourses',
  { sport: 'golf', feature: 'course_library' },
  getPlayerSavedCoursesImpl,
);

export async function getPlayerSavedCourses(): Promise<ActionResult<SavedCourse[]>> {
  return observedGetPlayerSavedCourses();
}

/**
 * Save a new course configuration or update existing one
 */
async function savePlayerCourseImpl(input: SaveCourseInput): Promise<ActionResult<SavedCourse>> {
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

const observedSavePlayerCourse = withAdminObserved(
  'savePlayerCourse',
  { sport: 'golf', feature: 'course_library' },
  savePlayerCourseImpl,
);

export async function savePlayerCourse(input: SaveCourseInput): Promise<ActionResult<SavedCourse>> {
  return observedSavePlayerCourse(input);
}

/**
 * Update the last_used_at timestamp for a saved course
 */
async function touchSavedCourseImpl(courseId: string): Promise<ActionResult<void>> {
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

const observedTouchSavedCourse = withAdminObserved(
  'touchSavedCourse',
  { sport: 'golf', feature: 'course_library' },
  touchSavedCourseImpl,
);

export async function touchSavedCourse(courseId: string): Promise<ActionResult<void>> {
  return observedTouchSavedCourse(courseId);
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
async function getRecentCoursesForPlayerImpl(
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

const observedGetRecentCoursesForPlayer = withAdminObserved(
  'getRecentCoursesForPlayer',
  { sport: 'golf', feature: 'course_library' },
  getRecentCoursesForPlayerImpl,
);

export async function getRecentCoursesForPlayer(
  limit = 8,
): Promise<ActionResult<RecentPlayedCourse[]>> {
  return observedGetRecentCoursesForPlayer(limit);
}

// ============================================================================
// SHOT MANAGEMENT ACTIONS
// ============================================================================

/**
 * Delete a specific shot from a round
 * The database trigger will automatically resequence remaining shots
 */
async function deleteShotImpl(shotId: string): Promise<ActionResult<void>> {
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
      .maybeSingle();

    if (!player) {
      return { success: false, error: 'Player profile not found' };
    }

    // Verify ownership: Get the shot and its associated round
    const { data: shot, error: shotError } = await supabase
      .from('golf_shots')
      .select('id, round_id, hole_number')
      .eq('id', shotId)
      .single();

    // Supabase returns PGRST116 when `.single()` found no visible row. That
    // is the one case the client may safely reconcile as a stale local ID.
    // A transport/database error must remain a normal failure: treating it as
    // a missing shot would make an offline player temporarily hide valid
    // progress from their own scorecard.
    if (shotError && shotError.code !== 'PGRST116') {
      return { success: false, error: 'Failed to verify shot. Please try again.' };
    }

    if (!shot) {
      // The caller may still hold a locally persisted ID after another tab,
      // an earlier retry, or a successfully committed request deleted it.
      // Keep the user-scoped/RLS-safe message (do not disclose row
      // existence), but give round-entry clients a stable reconciliation code
      // so they can remove only their stale local reference.
      return { success: false, error: 'Shot not found', code: 'shot_not_found' };
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
        void logServerError(`deleteShot stats cache invalidation failed: ${describeError(err)}`, {
          action: 'deleteShot.invalidateStatsCache',
          featureArea: 'stats_cache',
          roundId: revalidateRoundId,
        }, 'warning');
      }
    });

    return { success: true, data: undefined };

  } catch (error) {
    await logServerException(error instanceof Error ? error : new Error(String(error)), { action: 'deleteShot' });
    return formatSafeErrorResponse(error);
  }
}

const observedDeleteShot = withAdminObserved(
  'deleteShot',
  { sport: 'golf', feature: 'round_tracking' },
  deleteShotImpl,
);

export async function deleteShot(shotId: string): Promise<ActionResult<void>> {
  return observedDeleteShot(shotId);
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
async function updateShotImpl(
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
      .maybeSingle();

    if (!player) {
      return { success: false, error: 'Player profile not found' };
    }

    // Verify ownership: Get the shot and its associated round
    const { data: shot, error: shotError } = await supabase
      .from('golf_shots')
      .select('id, round_id')
      .eq('id', shotId)
      .single();

    // Match deleteShot's reconciliation contract: only an explicit no-row
    // response is stale local state. A transient lookup failure must preserve
    // the local shot and let the player retry.
    if (shotError && shotError.code !== 'PGRST116') {
      return { success: false, error: 'Failed to verify shot. Please try again.' };
    }

    if (!shot) {
      // An edit can race with an Undo, a second tab, or a request whose
      // successful response never reached this browser. Keep ownership/RLS
      // opaque, but give the round-entry UI the same stable reconciliation
      // signal as deleteShot so it removes only its stale local reference.
      return { success: false, error: 'Shot not found', code: 'shot_not_found' };
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
        void logServerError(`updateShot stats cache invalidation failed: ${describeError(err)}`, {
          action: 'updateShot.invalidateStatsCache',
          featureArea: 'stats_cache',
          roundId: revalidateRoundId,
        }, 'warning');
      }
    });

    return { success: true, data: undefined };

  } catch (error) {
    await logServerException(error instanceof Error ? error : new Error(String(error)), { action: 'updateShot' });
    return formatSafeErrorResponse(error);
  }
}

const observedUpdateShot = withAdminObserved(
  'updateShot',
  { sport: 'golf', feature: 'round_tracking' },
  updateShotImpl,
);

export async function updateShot(
  shotId: string,
  data: ShotUpdateData
): Promise<ActionResult<void>> {
  return observedUpdateShot(shotId, data);
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
async function getRoundShotDetailsImpl(
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
    // Staff-scoped: the coach may view this round iff the round's player is an
    // active member of a team the coach STAFFS. (Was an org `.maybeSingle()` that
    // THREW on a two-team program and only checked one arbitrary team.)
    let isCoach = false;
    if (coach?.id) {
      const { data: staffRows } = await supabase
        .from('golf_team_coach_staff')
        .select('team_id')
        .eq('coach_id', coach.id);
      const staffTeamIds = (staffRows ?? []).map((r) => r.team_id).filter(Boolean) as string[];

      if (staffTeamIds.length > 0) {
        const { data: teamMembership } = await supabase
          .from('golf_team_members')
          .select('id')
          .in('team_id', staffTeamIds)
          .eq('player_id', round.player_id)
          .eq('status', 'active')
          .limit(1)
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
      `getRoundShotDetails failed: ${describeError(error)}`,
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

const observedGetRoundShotDetails = withAdminObserved(
  'getRoundShotDetails',
  { sport: 'golf', feature: 'round_tracking' },
  getRoundShotDetailsImpl,
);

export async function getRoundShotDetails(
  roundId: string
): Promise<ActionResult<RoundShotReviewData>> {
  return observedGetRoundShotDetails(roundId);
}
