// =============================================================================
// src/lib/baseball/practice-validation.ts
//
// Packet: practice-intel
//
// PURE, FRAMEWORK-FREE validation for the Practice Planner (V7 "publish
// validation") and the Scrimmage Lineup Builder (V7 §Scrimmage Lineup Builder).
//
// WHY THIS FILE EXISTS (build-fidelity):
//   The two validators below are called SYNCHRONOUSLY by client components
//   (TimeRailBuilder, ScrimmageLineupBuilder) to surface live, on-rail warnings
//   AND are re-run SERVER-SIDE inside the publish gate so the coach sees exactly
//   what the server enforces. They CANNOT live in a `'use server'` module: Next.js
//   requires every export of a `'use server'` file to be an async Server Action,
//   so exporting these synchronous pure functions from the action files breaks
//   `next build` ("Server Actions must be async functions"). Keeping them in this
//   plain (no-directive) module lets both the action files and the client
//   components import the SAME implementation without violating that rule.
//
// No DB access, no React, no server-only imports — safe in both runtimes.
// =============================================================================

import {
  FIELD_POSITIONS,
  type BaseballScrimmageMode,
  type BaseballScrimmageSide,
  type BaseballDefensivePosition,
} from '@/lib/types/baseball-practice-deep';

// -----------------------------------------------------------------------------
// Practice (time-rail) publish validation. Pure — operates on block rows.
// Returns blocking errors (must fix before publish) + non-blocking warnings.
// -----------------------------------------------------------------------------

export interface PracticeValidationIssue {
  /** Stable code so the UI can map to a field; not shown raw to players. */
  code:
    | 'no_blocks'
    | 'missing_headline'
    | 'overlap'
    | 'unassigned_owner'
    | 'owner_conflict'
    | 'measured_without_target'
    | 'zero_duration';
  message: string;
  /** Block index(es) the issue points at (for inline highlighting). */
  blockKeys?: number[];
}

export interface PracticeValidationResult {
  ok: boolean;
  errors: PracticeValidationIssue[];
  warnings: PracticeValidationIssue[];
}

export interface ValidatableBlock {
  startOffsetMin: number;
  durationMin: number;
  activity: string;
  coachOwnerId?: string | null;
  isMeasured?: boolean;
  measurementTarget?: string | null;
}

export function validatePracticeForPublish(
  blocks: ValidatableBlock[],
): PracticeValidationResult {
  const errors: PracticeValidationIssue[] = [];
  const warnings: PracticeValidationIssue[] = [];

  if (blocks.length === 0) {
    errors.push({ code: 'no_blocks', message: 'Add at least one block before publishing.' });
    return { ok: false, errors, warnings };
  }

  // Missing headline / zero duration — hard errors.
  blocks.forEach((b, i) => {
    if (!b.activity.trim()) {
      errors.push({ code: 'missing_headline', message: 'Every block needs a headline.', blockKeys: [i] });
    }
    if (b.durationMin <= 0) {
      errors.push({ code: 'zero_duration', message: 'Block duration must be greater than zero.', blockKeys: [i] });
    }
  });

  // Time-rail overlap — two blocks occupying the same minutes is a hard error.
  const sorted = blocks
    .map((b, i) => ({ ...b, i }))
    .sort((a, z) => a.startOffsetMin - z.startOffsetMin);
  for (let k = 1; k < sorted.length; k++) {
    const prev = sorted[k - 1];
    const cur = sorted[k];
    if (!prev || !cur) continue;
    const prevEnd = prev.startOffsetMin + prev.durationMin;
    if (cur.startOffsetMin < prevEnd) {
      errors.push({
        code: 'overlap',
        message: 'Two blocks overlap on the time rail.',
        blockKeys: [prev.i, cur.i],
      });
    }
  }

  // Owner conflict — same staff owns two blocks that overlap in time (a coach
  // can't be in two places at once). Warning, not a hard block (a coach may
  // legitimately float). Unassigned owner is a warning too.
  for (let a = 0; a < sorted.length; a++) {
    const ba = sorted[a];
    if (!ba) continue;
    if (!ba.coachOwnerId) {
      warnings.push({
        code: 'unassigned_owner',
        message: 'Block has no staff owner.',
        blockKeys: [ba.i],
      });
    }
    for (let z = a + 1; z < sorted.length; z++) {
      const bz = sorted[z];
      if (!bz || !ba.coachOwnerId || !bz.coachOwnerId) continue;
      if (ba.coachOwnerId !== bz.coachOwnerId) continue;
      const aEnd = ba.startOffsetMin + ba.durationMin;
      if (bz.startOffsetMin < aEnd) {
        warnings.push({
          code: 'owner_conflict',
          message: 'The same staff owner is assigned to two overlapping blocks.',
          blockKeys: [ba.i, bz.i],
        });
      }
    }
  }

  // Measured station without a measurement target — warning.
  blocks.forEach((b, i) => {
    if (b.isMeasured && !(b.measurementTarget ?? '').trim()) {
      warnings.push({
        code: 'measured_without_target',
        message: 'Measured station has no measurement target.',
        blockKeys: [i],
      });
    }
  });

  return { ok: errors.length === 0, errors, warnings };
}

// -----------------------------------------------------------------------------
// Scrimmage lineup publish validation (V7) — pure, operates on slot inputs.
// -----------------------------------------------------------------------------

/** The slot shape the lineup validator + builder operate on. */
export interface LineupSlotInput {
  playerId: string;
  side?: BaseballScrimmageSide | null;
  defensivePosition?: BaseballDefensivePosition | null;
  battingOrder?: number | null;
  inningStart?: number | null;
  inningEnd?: number | null;
  note?: string | null;
}

export interface LineupValidationIssue {
  code:
    | 'no_slots'
    | 'duplicate_position'
    | 'duplicate_batting_order'
    | 'incomplete_field'
    | 'player_double_booked';
  message: string;
  /** The side the issue applies to (intrasquad), when relevant. */
  side?: BaseballScrimmageSide | null;
}

export interface LineupValidationResult {
  ok: boolean;
  errors: LineupValidationIssue[];
  warnings: LineupValidationIssue[];
}

export function validateScrimmageForPublish(
  mode: BaseballScrimmageMode,
  slots: LineupSlotInput[],
): LineupValidationResult {
  const errors: LineupValidationIssue[] = [];
  const warnings: LineupValidationIssue[] = [];

  if (slots.length === 0) {
    errors.push({ code: 'no_slots', message: 'Add at least one player to the lineup.' });
    return { ok: false, errors, warnings };
  }

  // Group slots by side (intrasquad uses both blue/white; others use a single
  // null bucket).
  const sides: (BaseballScrimmageSide | null)[] =
    mode === 'intrasquad' ? ['blue', 'white'] : [null];

  for (const side of sides) {
    const sideSlots = slots.filter((s) => (s.side ?? null) === (side ?? null));
    if (sideSlots.length === 0) continue;

    // Duplicate FIELD position on the same side is a hard conflict (two players
    // can't man the same spot). bench/bullpen/DH may repeat.
    const posCount = new Map<string, number>();
    for (const s of sideSlots) {
      if (!s.defensivePosition) continue;
      if (!FIELD_POSITIONS.includes(s.defensivePosition)) continue;
      posCount.set(s.defensivePosition, (posCount.get(s.defensivePosition) ?? 0) + 1);
    }
    for (const [pos, n] of posCount) {
      if (n > 1) {
        errors.push({
          code: 'duplicate_position',
          message: `Two players are assigned to ${pos}.`,
          side,
        });
      }
    }

    // A player appearing twice on the same side is a hard conflict.
    const playerCount = new Map<string, number>();
    for (const s of sideSlots) {
      playerCount.set(s.playerId, (playerCount.get(s.playerId) ?? 0) + 1);
    }
    for (const [, n] of playerCount) {
      if (n > 1) {
        errors.push({
          code: 'player_double_booked',
          message: 'A player is assigned to more than one slot on the same squad.',
          side,
        });
        break;
      }
    }

    // Duplicate batting order (1..9) is a hard conflict.
    const orderCount = new Map<number, number>();
    for (const s of sideSlots) {
      if (s.battingOrder == null) continue;
      orderCount.set(s.battingOrder, (orderCount.get(s.battingOrder) ?? 0) + 1);
    }
    for (const [, n] of orderCount) {
      if (n > 1) {
        errors.push({
          code: 'duplicate_batting_order',
          message: 'Two players share the same batting-order spot.',
          side,
        });
        break;
      }
    }

    // Incomplete field — warning only for modes that need a full defense.
    if (mode === 'intrasquad' || mode === 'defense_only' || mode === 'situational') {
      const filled = new Set(
        sideSlots
          .map((s) => s.defensivePosition)
          .filter((p): p is BaseballDefensivePosition => !!p && FIELD_POSITIONS.includes(p)),
      );
      if (filled.size < FIELD_POSITIONS.length) {
        warnings.push({
          code: 'incomplete_field',
          message: `Defense is not fully filled (${filled.size}/${FIELD_POSITIONS.length} positions).`,
          side,
        });
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
