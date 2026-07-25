/**
 * W30.5 — composite rules ship #2.
 *
 * Tests the 7 new rules introduced in W30.5. Two patterns:
 *   - Insight-driven (lag_distance_3putt, short_approach_proximity_gap):
 *     same shape as W28, no ctx needed.
 *   - Ctx-driven (the four hole-sequence + two lie-typed rules):
 *     synthesizes a CompositeContext fixture, verifies thresholds.
 */

import { describe, it, expect } from 'vitest';
import lagDistance3Putt from '@/lib/coachhelm/v3/composite/rules/lag-distance-3putt';
import shortApproachGap from '@/lib/coachhelm/v3/composite/rules/short-approach-proximity-gap';
import closingHoleFatigue from '@/lib/coachhelm/v3/composite/rules/closing-hole-fatigue';
import front9Starter from '@/lib/coachhelm/v3/composite/rules/front-9-starter';
import doublesAfterBogey from '@/lib/coachhelm/v3/composite/rules/doubles-after-bogey';
import shortSideScrambling from '@/lib/coachhelm/v3/composite/rules/short-side-scrambling-chain';
import flyerLieOverGreen from '@/lib/coachhelm/v3/composite/rules/flyer-lie-over-the-green';
import type {
  CompositeContext,
  EvidenceInsight,
  HoleScore,
  ShortGameShot,
  ApproachShotWithLie,
} from '@/lib/coachhelm/v3/composite/types';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeInsight(over: {
  type: string;
  signature: string;
  your_value?: number;
  team_pct?: number | null;
  /** On-green proximity (feet) for approach_miss — lands in evidence.detail,
   *  NOT your_value (the green-hit percent). */
  proximity_feet?: number | null;
  sample_n?: number;
}): EvidenceInsight {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const evidence: any = {
    metric: over.type,
    metric_label: over.type,
    unit: 'percent',
    your_value: over.your_value ?? 0,
    your_value_display: String(over.your_value ?? 0),
    comparison_value: 0,
    comparison_label: '',
    comparison_source: 'pga_baseline',
    sample_n: over.sample_n ?? 10,
    window_days: 90,
    window_start: '',
    window_end: '',
    strokes_impact: 0,
    strokes_impact_method: 'peer_delta',
    confidence: 0.5,
    confidence_factors: { sample_adequacy: 0.5, recency: 1, variance: 0.5 },
  };
  if (over.proximity_feet !== undefined) {
    evidence.detail = { proximity_when_hit_feet: over.proximity_feet };
  }
  if (over.team_pct !== undefined) {
    evidence.standing = {
      metric_id: over.type,
      player_value: over.your_value ?? 0,
      team_avg: 0,
      team_n: 5,
      team_pct: over.team_pct,
      pga_value: 0,
      pga_delta: null,
      computed_at: '2026-05-25T00:00:00.000Z',
    };
  }
  return {
    id: `insight-${over.signature}`,
    insight_type: over.type,
    category: over.type,
    signature: over.signature,
    player_id: 'p-1',
    evidence,
    engine_version: 'v3',
    created_at: '2026-05-25T00:00:00.000Z',
  };
}

function emptyCtx(): CompositeContext {
  return { hole_scores: [], short_game_shots: [], flyer_lie_shots: [] };
}

function holeScore(round_id: string, hole_number: number, par: number, score: number): HoleScore {
  return { round_id, hole_number, par, score };
}

function shortGameShot(over: Partial<ShortGameShot> = {}): ShortGameShot {
  return {
    round_id: over.round_id ?? 'r1',
    hole_number: over.hole_number ?? 1,
    lie_before: over.lie_before ?? 'rough',
    distance_to_hole_before: over.distance_to_hole_before ?? 30,
    distance_to_hole_after: over.distance_to_hole_after ?? 18,
  };
}

function flyerShot(over: Partial<ApproachShotWithLie> = {}): ApproachShotWithLie {
  return {
    round_id: over.round_id ?? 'r1',
    hole_number: over.hole_number ?? 5,
    lie_before: over.lie_before ?? 'light_rough',
    distance_to_hole_before: over.distance_to_hole_before ?? 150,
    distance_to_hole_after: over.distance_to_hole_after ?? 40,
  };
}

// ---------------------------------------------------------------------------
// lag_distance_3putt (insight-driven)
// ---------------------------------------------------------------------------

describe('lag_distance_3putt', () => {
  it('fires when weak lag + weak short-putt insights both present', () => {
    const insights = [
      makeInsight({ type: 'putt_distance', signature: 'v3:putt_distance:25_plus_ft', your_value: 12, team_pct: 30 }),
      makeInsight({ type: 'putt_distance', signature: 'v3:putt_distance:3_5ft', your_value: 75, team_pct: 35 }),
    ];
    const m = lagDistance3Putt.detect(insights);
    expect(m).not.toBeNull();
    expect(m!.source_insight_ids).toHaveLength(2);
    const c = lagDistance3Putt.compose(m!);
    expect(c.title).toContain('Lag putts');
    expect(c.content).toContain('75%');
  });

  it('does NOT fire when short-putt is healthy', () => {
    const insights = [
      makeInsight({ type: 'putt_distance', signature: 'v3:putt_distance:25_plus_ft', your_value: 12, team_pct: 30 }),
      makeInsight({ type: 'putt_distance', signature: 'v3:putt_distance:3_5ft', your_value: 92, team_pct: 70 }),
    ];
    expect(lagDistance3Putt.detect(insights)).toBeNull();
  });

  it('accepts legacy v2 bucket signatures (20_plus_ft)', () => {
    const insights = [
      makeInsight({ type: 'putt_distance', signature: 'v2:putt_distance:20_plus_ft', your_value: 8, team_pct: 25 }),
      makeInsight({ type: 'putt_distance', signature: 'v3:putt_distance:3_5ft', your_value: 75, team_pct: 30 }),
    ];
    expect(lagDistance3Putt.detect(insights)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// short_approach_proximity_gap (insight-driven)
// ---------------------------------------------------------------------------

describe('short_approach_proximity_gap', () => {
  it('fires on on-green proximity > 22 ft (feet) AND weak scrambling — NOT green-hit %', () => {
    const insights = [
      // your_value is green-hit % (55); the 28 ft on-green proximity is what fires + displays.
      makeInsight({ type: 'approach_miss', signature: 'v3:approach_miss:50_125ft', your_value: 55, proximity_feet: 28 }),
      makeInsight({ type: 'scrambling', signature: 'v3:scrambling:sand', your_value: 30, team_pct: 25 }),
    ];
    const m = shortApproachGap.detect(insights);
    expect(m).not.toBeNull();
    const c = shortApproachGap.compose(m!);
    expect(c.title).toContain('Short approaches');
    expect(c.content).toContain('28 ft'); // real proximity, not the 55% green-hit
    expect(c.content).not.toContain('55 ft');
  });

  it('does NOT fire when on-green proximity is acceptable (≤ 22 ft)', () => {
    const insights = [
      makeInsight({ type: 'approach_miss', signature: 'v3:approach_miss:50_125ft', your_value: 60, proximity_feet: 19 }),
      makeInsight({ type: 'scrambling', signature: 'v3:scrambling:sand', your_value: 30, team_pct: 25 }),
    ];
    expect(shortApproachGap.detect(insights)).toBeNull();
  });

  it('does NOT fire on a good ball-striker with no recorded proximity', () => {
    const insights = [
      makeInsight({ type: 'approach_miss', signature: 'v3:approach_miss:50_125ft', your_value: 75, proximity_feet: null }),
      makeInsight({ type: 'scrambling', signature: 'v3:scrambling:sand', your_value: 30, team_pct: 25 }),
    ];
    expect(shortApproachGap.detect(insights)).toBeNull();
  });

  it('derives sample_n as the MIN of its two sources, not a hardcoded literal', () => {
    const insights = [
      makeInsight({ type: 'approach_miss', signature: 'v3:approach_miss:50_125ft', your_value: 55, proximity_feet: 28, sample_n: 42 }),
      makeInsight({ type: 'scrambling', signature: 'v3:scrambling:sand', your_value: 30, team_pct: 25, sample_n: 17 }),
    ];
    const m = shortApproachGap.detect(insights);
    expect(m).not.toBeNull();
    expect(Number(m!.signals.sample_n)).toBe(17);
    const c = shortApproachGap.compose(m!);
    expect(c.evidence.sample_n).toBe(17); // the thinner source, never the old literal 10
  });
});

// ---------------------------------------------------------------------------
// closing_hole_fatigue (ctx-driven)
// ---------------------------------------------------------------------------

describe('closing_hole_fatigue', () => {
  it('fires when holes 13-18 avg ≥0.5 strokes/hole worse than 1-12', () => {
    const ctx = emptyCtx();
    // 3 rounds, opening 12 holes avg +0.2/hole, closing 6 holes avg +1.2/hole → delta = +1.0
    for (const rid of ['r1', 'r2', 'r3']) {
      for (let h = 1; h <= 12; h++) ctx.hole_scores.push(holeScore(rid, h, 4, 4)); // even
      for (let h = 13; h <= 18; h++) ctx.hole_scores.push(holeScore(rid, h, 4, 5)); // +1
    }
    const m = closingHoleFatigue.detect([], ctx);
    expect(m).not.toBeNull();
    expect(Number(m!.signals.delta)).toBeGreaterThan(0.5);
    const c = closingHoleFatigue.compose(m!);
    expect(c.title).toContain('Closing 6 holes');
  });

  it('does NOT fire below 3-round minimum', () => {
    const ctx = emptyCtx();
    for (let h = 1; h <= 18; h++) ctx.hole_scores.push(holeScore('r1', h, 4, 6));
    expect(closingHoleFatigue.detect([], ctx)).toBeNull();
  });

  it('does NOT fire when closing holes are equally clean', () => {
    const ctx = emptyCtx();
    for (const rid of ['r1', 'r2', 'r3']) {
      for (let h = 1; h <= 18; h++) ctx.hole_scores.push(holeScore(rid, h, 4, 4));
    }
    expect(closingHoleFatigue.detect([], ctx)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// front_9_starter (ctx-driven)
// ---------------------------------------------------------------------------

describe('front_9_starter', () => {
  it('fires when holes 1-3 avg ≥0.5 strokes/hole worse than 4-18', () => {
    const ctx = emptyCtx();
    for (const rid of ['r1', 'r2', 'r3']) {
      for (let h = 1; h <= 3; h++) ctx.hole_scores.push(holeScore(rid, h, 4, 6)); // double
      for (let h = 4; h <= 18; h++) ctx.hole_scores.push(holeScore(rid, h, 4, 4));
    }
    const m = front9Starter.detect([], ctx);
    expect(m).not.toBeNull();
    expect(Number(m!.signals.delta)).toBeGreaterThan(0.5);
  });

  it('does NOT fire when opening 3 are clean', () => {
    const ctx = emptyCtx();
    for (const rid of ['r1', 'r2', 'r3']) {
      for (let h = 1; h <= 18; h++) ctx.hole_scores.push(holeScore(rid, h, 4, 4));
    }
    expect(front9Starter.detect([], ctx)).toBeNull();
  });

  it('f9s-1: cross-suppresses when a warmup_hole insight already surfaced the opening tax', () => {
    const ctx = emptyCtx();
    for (const rid of ['r1', 'r2', 'r3']) {
      for (let h = 1; h <= 3; h++) ctx.hole_scores.push(holeScore(rid, h, 4, 6)); // double
      for (let h = 4; h <= 18; h++) ctx.hole_scores.push(holeScore(rid, h, 4, 4));
    }
    // Same data would otherwise fire — but warmup-hole already owns the leak.
    const warmup = makeInsight({ type: 'warmup_hole', signature: 'warmup_hole:hole_1', your_value: 0.8 });
    expect(front9Starter.detect([warmup], ctx)).toBeNull();
    // Sanity: still fires when no warmup insight exists.
    expect(front9Starter.detect([], ctx)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// doubles_after_bogey (ctx-driven)
// ---------------------------------------------------------------------------

describe('doubles_after_bogey', () => {
  it('fires when ≥20% of bogeys are followed by a double-or-worse', () => {
    const ctx = emptyCtx();
    // 4 rounds × 6 bogeys each = 24 opportunities, 6 compound (25%)
    for (let r = 1; r <= 4; r++) {
      const rid = `r${r}`;
      // Each round: 6 bogey-then-X sequences on holes 1-12 (paired holes)
      for (let i = 0; i < 6; i++) {
        const bogeyHole = i * 2 + 1; // 1,3,5,7,9,11
        const followHole = bogeyHole + 1;
        ctx.hole_scores.push(holeScore(rid, bogeyHole, 4, 5)); // bogey
        // First 2 follow holes per round are doubles, rest are pars
        const followScore = i < 2 ? 6 : 4;
        ctx.hole_scores.push(holeScore(rid, followHole, 4, followScore));
      }
      for (let h = 13; h <= 18; h++) ctx.hole_scores.push(holeScore(rid, h, 4, 4));
    }
    const m = doublesAfterBogey.detect([], ctx);
    expect(m).not.toBeNull();
    expect(Number(m!.signals.rate)).toBeGreaterThanOrEqual(0.2);
  });

  it('does NOT fire below the 10-opportunity floor', () => {
    const ctx = emptyCtx();
    ctx.hole_scores.push(holeScore('r1', 1, 4, 5));
    ctx.hole_scores.push(holeScore('r1', 2, 4, 6));
    expect(doublesAfterBogey.detect([], ctx)).toBeNull();
  });

  it('DAB-1/DAB-2: does NOT fire from a single 15-bogey blow-up round', () => {
    // One round, 15 bogey-then-X sequences (clears the 10-opp floor alone),
    // 8 of them compounding into doubles (53%). Without the round guards this
    // minted a 3.5-strokes/round "urgent" #1 card. Now it must no-op: only
    // 1 round in the window, and the bogeys span only 1 round.
    const ctx = emptyCtx();
    for (let i = 0; i < 15; i++) {
      const bogeyHole = i * 2 + 1;
      ctx.hole_scores.push(holeScore('r1', bogeyHole, 4, 5)); // bogey
      ctx.hole_scores.push(holeScore('r1', bogeyHole + 1, 4, i < 8 ? 6 : 4)); // double or par
    }
    expect(doublesAfterBogey.detect([], ctx)).toBeNull();
  });

  it('DAB-2: does NOT fire when ≥3 rounds exist but bogeys come from one round', () => {
    // 3 distinct rounds clear MIN_ROUNDS, but only r1 has any bogeys → the
    // signal is a single-round artifact and must not fire.
    const ctx = emptyCtx();
    for (let i = 0; i < 12; i++) {
      const bogeyHole = i * 2 + 1;
      ctx.hole_scores.push(holeScore('r1', bogeyHole, 4, 5)); // bogey
      ctx.hole_scores.push(holeScore('r1', bogeyHole + 1, 4, i < 4 ? 6 : 4));
    }
    // Two clean rounds — present in the window, no bogeys.
    for (let h = 1; h <= 18; h++) ctx.hole_scores.push(holeScore('r2', h, 4, 4));
    for (let h = 1; h <= 18; h++) ctx.hole_scores.push(holeScore('r3', h, 4, 4));
    expect(doublesAfterBogey.detect([], ctx)).toBeNull();
  });

  it('DAB: STILL fires when the pattern spans ≥2 rounds across ≥3 rounds', () => {
    // 3 rounds, bogeys in r1 + r2 (spanning ≥2 rounds), r3 clean.
    const ctx = emptyCtx();
    for (const rid of ['r1', 'r2']) {
      for (let i = 0; i < 6; i++) {
        const bogeyHole = i * 2 + 1;
        ctx.hole_scores.push(holeScore(rid, bogeyHole, 4, 5)); // bogey
        ctx.hole_scores.push(holeScore(rid, bogeyHole + 1, 4, i < 2 ? 6 : 4)); // 2 doubles/round
      }
    }
    for (let h = 1; h <= 18; h++) ctx.hole_scores.push(holeScore('r3', h, 4, 4));
    const m = doublesAfterBogey.detect([], ctx);
    expect(m).not.toBeNull();
    expect(Number(m!.signals.rounds)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// short_side_scrambling_chain (ctx-driven)
// ---------------------------------------------------------------------------

describe('short_side_scrambling_chain', () => {
  it('fires when ≥10 short-game attempts AND avg proximity > 15 ft', () => {
    const ctx = emptyCtx();
    for (let i = 0; i < 12; i++) {
      ctx.short_game_shots.push(shortGameShot({ distance_to_hole_after: 22 }));
    }
    const m = shortSideScrambling.detect([], ctx);
    expect(m).not.toBeNull();
    expect(Number(m!.signals.attempts)).toBe(12);
  });

  it('does NOT fire below 10 attempts', () => {
    const ctx = emptyCtx();
    for (let i = 0; i < 6; i++) ctx.short_game_shots.push(shortGameShot({ distance_to_hole_after: 22 }));
    expect(shortSideScrambling.detect([], ctx)).toBeNull();
  });

  it('does NOT fire when avg proximity is healthy', () => {
    const ctx = emptyCtx();
    for (let i = 0; i < 12; i++) ctx.short_game_shots.push(shortGameShot({ distance_to_hole_after: 8 }));
    expect(shortSideScrambling.detect([], ctx)).toBeNull();
  });

  it("sscc-1: counts real 'sand' recoveries as bunker (CHECK value is 'sand', not 'bunker')", () => {
    const ctx = emptyCtx();
    for (let i = 0; i < 12; i++) {
      ctx.short_game_shots.push(shortGameShot({ lie_before: 'sand', distance_to_hole_after: 22 }));
    }
    const m = shortSideScrambling.detect([], ctx);
    expect(m).not.toBeNull();
    // All shots are sand → bunkerPct is fully populated (was permanently 0
    // when the branch matched the non-canonical 'bunker' literal).
    expect(Number(m!.signals.bunker_pct)).toBe(100);
    expect(Number(m!.signals.rough_pct)).toBe(0);
    const c = shortSideScrambling.compose(m!);
    expect(c.content).toContain('% from bunker'); // prose now reflects the real sand mix
  });

  it('sscc-1: mixed rough + sand splits the dominant correctly', () => {
    const ctx = emptyCtx();
    for (let i = 0; i < 8; i++) {
      ctx.short_game_shots.push(shortGameShot({ lie_before: 'rough', distance_to_hole_after: 22 }));
    }
    for (let i = 0; i < 4; i++) {
      ctx.short_game_shots.push(shortGameShot({ lie_before: 'sand', distance_to_hole_after: 22 }));
    }
    const m = shortSideScrambling.detect([], ctx);
    expect(m).not.toBeNull();
    expect(Math.round(Number(m!.signals.rough_pct))).toBe(67);
    expect(Math.round(Number(m!.signals.bunker_pct))).toBe(33);
  });

  it('ships a non-zero strokes_impact derived from proximity-over-Tour', () => {
    const ctx = emptyCtx();
    for (let i = 0; i < 12; i++) ctx.short_game_shots.push(shortGameShot({ distance_to_hole_after: 22 }));
    const m = shortSideScrambling.detect([], ctx)!;
    const c = shortSideScrambling.compose(m);
    expect(c.evidence.strokes_impact).toBeGreaterThan(0);
    expect(c.evidence.strokes_impact).toBeLessThanOrEqual(1.5);
  });
});

// ---------------------------------------------------------------------------
// flyer_lie_over_the_green (ctx-driven)
// ---------------------------------------------------------------------------

describe('flyer_lie_over_the_green (DISABLED — blocked on rough-severity capture)', () => {
  // The supplemental loader filters lie_before='light_rough', which violates
  // the golf_shots CHECK (tee|fairway|rough|sand|green|other|penalty) → 0 rows.
  // The rule is explicitly disabled (RULE_ENABLED=false) so it can't fire on
  // data that can never exist; firing on the plain 'rough' bucket would
  // conflate flyer-prone light rough with deep rough. It returns null even
  // when given an (impossible) qualifying fixture.
  it('does NOT fire even with qualifying light_rough fixture (explicitly disabled)', () => {
    const ctx = emptyCtx();
    for (let i = 0; i < 12; i++) ctx.flyer_lie_shots.push(flyerShot({ distance_to_hole_after: 45 }));
    expect(flyerLieOverGreen.detect([], ctx)).toBeNull();
  });

  it('does NOT fire when proximity is acceptable', () => {
    const ctx = emptyCtx();
    for (let i = 0; i < 12; i++) ctx.flyer_lie_shots.push(flyerShot({ distance_to_hole_after: 28 }));
    expect(flyerLieOverGreen.detect([], ctx)).toBeNull();
  });
});
