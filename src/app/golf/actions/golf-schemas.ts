/**
 * Zod validation schemas for golf round data.
 *
 * These are in a separate file because Next.js 'use server' files
 * must only export async functions — exporting Zod objects (consts)
 * causes runtime errors: "A 'use server' file can only export async
 * functions, found object."
 */

import { z } from 'zod';

export const comprehensiveShotSchema = z.object({
  shotNumber: z.number().int().min(1),
  shotType: z.enum(['tee', 'approach', 'around_green', 'putting', 'penalty']),
  clubType: z.string().min(1),
  lieBefore: z.enum(['tee', 'fairway', 'rough', 'sand', 'green', 'other']),
  distanceToHoleBefore: z.number().min(0),
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

export const comprehensiveHoleSchema = z.object({
  holeNumber: z.number().int().min(1).max(18),
  par: z.number().int().min(3).max(6),
  yardage: z.number().min(0),
  score: z.number().int().min(1).max(20),
  putts: z.number().int().min(0).max(10),
  fairwayHit: z.boolean().nullable(),
  greenInRegulation: z.boolean(),
  penaltyStrokes: z.number().int().min(0),
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

export const partialRoundSchema = z.object({
  courseName: z.string().min(1).max(200),
  courseCity: z.string().max(100).optional(),
  courseState: z.string().max(2).optional(),
  courseRating: z.number().min(60).max(80).optional().nullable(),
  courseSlope: z.number().int().min(55).max(155).optional().nullable(),
  teesPlayed: z.string().max(50).optional(),
  courseId: z.string().uuid().optional().nullable(),
  roundType: z.enum(['practice', 'tournament', 'qualifier']),
  roundDate: z.string(),
  currentHole: z.number().int().min(1).max(18).optional().nullable(),
  holesToPlay: z.union([z.literal(9), z.literal(18)]).optional().nullable(),
  qualifierId: z.string().uuid().optional().nullable(),
  qualifierRoundNumber: z.number().int().min(1).optional().nullable(),
  holes: z.array(z.object({
    holeNumber: z.number().int().min(1).max(18),
    par: z.number().int().min(3).max(6),
    yardage: z.number().min(0),
    score: z.number().int().min(0).max(30).optional().nullable(),
    putts: z.number().int().min(0).max(15).optional().nullable(),
    fairwayHit: z.boolean().optional().nullable(),
    greenInRegulation: z.boolean().optional().nullable(),
    penaltyStrokes: z.number().int().min(0).max(10).optional().nullable(),
    scrambleAttempt: z.boolean().optional().nullable(),
    scrambleMade: z.boolean().optional().nullable(),
    sandSaveAttempt: z.boolean().optional().nullable(),
    sandSaveMade: z.boolean().optional().nullable(),
    shots: z.array(comprehensiveShotSchema).optional(),
  }).passthrough()).max(18),
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

export const shotUpdateSchema = z.object({
  shot_type: z.enum(['tee', 'approach', 'around_green', 'putting', 'penalty']).optional(),
  club_type: z.enum(['driver', 'non_driver', 'putter']).optional(),
  lie_before: z.enum(['tee', 'fairway', 'rough', 'sand', 'green', 'other']).optional(),
  lie_after: z.enum(['tee', 'fairway', 'rough', 'sand', 'green', 'other', 'penalty']).nullable().optional(),
  distance_to_hole_before: z.number().min(0).optional(),
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
