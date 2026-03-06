import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Schemas are internal to golf.ts ('use server' files cannot export const).
// Duplicate minimal versions here for testing validation logic.
const comprehensiveShotSchema = z.object({
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

const comprehensiveHoleSchema = z.object({
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
});

const partialRoundSchema = z.object({
  courseName: z.string().min(1).max(200),
  roundType: z.enum(['practice', 'tournament', 'qualifier']),
  roundDate: z.string(),
  holes: z.array(z.object({
    holeNumber: z.number().int().min(1).max(18),
    par: z.number().int().min(3).max(6),
    yardage: z.number().min(0),
  }).passthrough()).max(18),
});

const shotUpdateSchema = z.object({
  shot_type: z.enum(['tee', 'approach', 'around_green', 'putting', 'penalty']).optional(),
  club_type: z.enum(['driver', 'non_driver', 'putter']).optional(),
  result: z.enum(['fairway', 'rough', 'sand', 'green', 'hole', 'other', 'penalty']).optional(),
});

// ============================================================================
// comprehensiveShotSchema
// ============================================================================

describe('comprehensiveShotSchema', () => {
  const validShot = {
    shotNumber: 1,
    shotType: 'tee',
    clubType: 'driver',
    lieBefore: 'tee',
    distanceToHoleBefore: 400,
    distanceUnitBefore: 'yards',
    result: 'fairway',
    distanceToHoleAfter: 150,
    distanceUnitAfter: 'yards',
    shotDistance: 250,
    isPenalty: false,
  };

  it('accepts a valid tee shot', () => {
    const result = comprehensiveShotSchema.safeParse(validShot);
    expect(result.success).toBe(true);
  });

  it('accepts a valid putt with optional fields', () => {
    const putt = {
      ...validShot,
      shotNumber: 3,
      shotType: 'putting',
      clubType: 'putter',
      lieBefore: 'green',
      distanceToHoleBefore: 15,
      distanceUnitBefore: 'feet',
      result: 'hole',
      distanceToHoleAfter: 0,
      distanceUnitAfter: 'feet',
      shotDistance: 15,
      puttBreak: 'left_to_right',
      puttSlope: 'uphill',
      puttMissTags: ['low', 'short'],
      puttDistanceFeet: 15,
    };
    expect(comprehensiveShotSchema.safeParse(putt).success).toBe(true);
  });

  it('rejects invalid shot type', () => {
    const result = comprehensiveShotSchema.safeParse({ ...validShot, shotType: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('rejects negative distance', () => {
    const result = comprehensiveShotSchema.safeParse({ ...validShot, distanceToHoleBefore: -10 });
    expect(result.success).toBe(false);
  });

  it('rejects shot number 0', () => {
    const result = comprehensiveShotSchema.safeParse({ ...validShot, shotNumber: 0 });
    expect(result.success).toBe(false);
  });

  it('accepts penalty shot', () => {
    const penalty = {
      ...validShot,
      shotType: 'penalty',
      isPenalty: true,
      penaltyType: 'ob',
      result: 'penalty',
    };
    expect(comprehensiveShotSchema.safeParse(penalty).success).toBe(true);
  });
});

// ============================================================================
// comprehensiveHoleSchema
// ============================================================================

describe('comprehensiveHoleSchema', () => {
  const validShot = {
    shotNumber: 1,
    shotType: 'tee',
    clubType: 'driver',
    lieBefore: 'tee',
    distanceToHoleBefore: 400,
    distanceUnitBefore: 'yards',
    result: 'fairway',
    distanceToHoleAfter: 150,
    distanceUnitAfter: 'yards',
    shotDistance: 250,
    isPenalty: false,
  };

  const validHole = {
    holeNumber: 1,
    par: 4,
    yardage: 400,
    score: 4,
    putts: 2,
    fairwayHit: true,
    greenInRegulation: true,
    penaltyStrokes: 0,
    scrambleAttempt: false,
    scrambleMade: false,
    sandSaveAttempt: false,
    sandSaveMade: false,
    shots: [validShot],
  };

  it('accepts a valid hole', () => {
    expect(comprehensiveHoleSchema.safeParse(validHole).success).toBe(true);
  });

  it('accepts hole with optional stat fields', () => {
    const hole = {
      ...validHole,
      drivingDistance: 280,
      usedDriver: true,
      approachDistance: 150,
      firstPuttDistance: 20,
    };
    expect(comprehensiveHoleSchema.safeParse(hole).success).toBe(true);
  });

  it('rejects hole number > 18', () => {
    expect(comprehensiveHoleSchema.safeParse({ ...validHole, holeNumber: 19 }).success).toBe(false);
  });

  it('rejects par 2', () => {
    expect(comprehensiveHoleSchema.safeParse({ ...validHole, par: 2 }).success).toBe(false);
  });

  it('rejects empty shots array', () => {
    expect(comprehensiveHoleSchema.safeParse({ ...validHole, shots: [] }).success).toBe(false);
  });

  it('accepts fairwayHit as null (par 3)', () => {
    expect(comprehensiveHoleSchema.safeParse({ ...validHole, fairwayHit: null }).success).toBe(true);
  });
});

// ============================================================================
// partialRoundSchema
// ============================================================================

describe('partialRoundSchema', () => {
  const validPartial = {
    courseName: 'Augusta National',
    roundType: 'practice',
    roundDate: '2026-03-04',
    currentHole: 5,
    holesToPlay: 18,
    holes: [],
  };

  it('accepts valid partial round data', () => {
    expect(partialRoundSchema.safeParse(validPartial).success).toBe(true);
  });

  it('accepts 9-hole round', () => {
    expect(partialRoundSchema.safeParse({ ...validPartial, holesToPlay: 9 }).success).toBe(true);
  });

  it('rejects empty course name', () => {
    expect(partialRoundSchema.safeParse({ ...validPartial, courseName: '' }).success).toBe(false);
  });

  it('rejects invalid round type', () => {
    expect(partialRoundSchema.safeParse({ ...validPartial, roundType: 'fun' }).success).toBe(false);
  });

  it('rejects current hole > 18', () => {
    expect(partialRoundSchema.safeParse({ ...validPartial, currentHole: 19 }).success).toBe(false);
  });

  it('accepts null current hole', () => {
    expect(partialRoundSchema.safeParse({ ...validPartial, currentHole: null }).success).toBe(true);
  });

  it('accepts optional fields', () => {
    const full = {
      ...validPartial,
      courseCity: 'Augusta',
      courseState: 'GA',
      courseRating: 72.5,
      courseSlope: 135,
      teesPlayed: 'Championship',
      courseId: '123e4567-e89b-12d3-a456-426614174000',
      qualifierId: null,
    };
    expect(partialRoundSchema.safeParse(full).success).toBe(true);
  });
});

// ============================================================================
// shotUpdateSchema
// ============================================================================

describe('shotUpdateSchema', () => {
  it('accepts valid partial update', () => {
    expect(shotUpdateSchema.safeParse({ result: 'green' }).success).toBe(true);
  });

  it('accepts multiple fields', () => {
    const update = {
      shot_type: 'approach',
      distance_to_hole_before: 150,
      result: 'green',
    };
    expect(shotUpdateSchema.safeParse(update).success).toBe(true);
  });

  it('rejects empty object', () => {
    expect(shotUpdateSchema.safeParse({}).success).toBe(false);
  });

  it('accepts null for nullable fields', () => {
    expect(shotUpdateSchema.safeParse({ miss_direction: null }).success).toBe(true);
  });

  it('rejects negative distance', () => {
    expect(shotUpdateSchema.safeParse({ distance_to_hole_before: -5 }).success).toBe(false);
  });

  it('accepts valid penalty update', () => {
    expect(shotUpdateSchema.safeParse({ is_penalty: true, penalty_type: 'water' }).success).toBe(true);
  });
});
