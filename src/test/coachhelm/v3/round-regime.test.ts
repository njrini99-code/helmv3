/**
 * Which lens actually explains a round depends on how many greens were hit,
 * and nothing in the engine knew that.
 *
 * `docs/v3-research-golf-domain.md` §4 "GIR → Scrambling Load (Inverse
 * Coupling)": *"If player hits 12+ GIR, putting drives score. If 8 or fewer,
 * scrambling % is more predictive than putting."*
 *
 * That is not just a citation — the coupling is visible in this product's own
 * data. All 328 completed rounds with a GIR figure, measured 2026-08-18:
 *
 *     regime (18-hole basis)   rounds    %      avg score_to_par   avg putts
 *     putting_driven  >= 12      170    51.8%        +1.78            33.2
 *     transitional    9-11       122    37.2%        +5.15            31.7
 *     scrambling_driven <= 8      36    11.0%        +9.44            29.8
 *
 * Putts per round FALL as greens fall (33.2 → 31.7 → 29.8) while the score
 * climbs by seven and a half strokes. A player who misses greens chips close
 * and 1-putts for bogey, so his putt total flatters him precisely when he
 * played worst.
 *
 * That matters because `buildPrompt` in v3/llm/round-review.ts hands the model
 * a bare "29 putts" with no context. On one of those 36 rounds the natural
 * sentence to write is "your putting held up well" — which is false, and the
 * citation verifier cannot catch it because 29 IS the putt count. The number is
 * real; the INFERENCE is the fabrication.
 *
 * SCOPE, decided by measurement rather than preference. A PLAYER-level regime
 * was the original plan and would have been a no-op: of 22 players with 8+
 * rounds, ZERO are scrambling-dominant, 15 are putting-dominant, and the
 * highest scrambling share on the whole platform is 25%. Classifying players
 * emits one constant. Classifying ROUNDS fires on 36 real rounds today.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyRoundRegime,
  regimeGuidanceLine,
  SCRAMBLING_DRIVEN_MAX_GIR,
  PUTTING_DRIVEN_MIN_GIR,
} from '@/lib/coachhelm/v3/insights/round-regime';

describe('classifyRoundRegime', () => {
  it('calls a 12+ green round putting-driven', () => {
    expect(classifyRoundRegime({ gir: 12, gir_total: 18 })).toBe('putting_driven');
    expect(classifyRoundRegime({ gir: 15, gir_total: 18 })).toBe('putting_driven');
  });

  it('calls an 8-or-fewer green round scrambling-driven', () => {
    expect(classifyRoundRegime({ gir: 8, gir_total: 18 })).toBe('scrambling_driven');
    expect(classifyRoundRegime({ gir: 4, gir_total: 18 })).toBe('scrambling_driven');
  });

  it('leaves the 9-11 band transitional rather than forcing a lens', () => {
    expect(classifyRoundRegime({ gir: 9, gir_total: 18 })).toBe('transitional');
    expect(classifyRoundRegime({ gir: 11, gir_total: 18 })).toBe('transitional');
  });

  it('normalizes to an 18-hole basis so a 9-hole round is not misread', () => {
    // 6 of 9 greens is a 12-green pace — putting-driven, not scrambling.
    expect(classifyRoundRegime({ gir: 6, gir_total: 9 })).toBe('putting_driven');
    // 3 of 9 is an 6-green pace.
    expect(classifyRoundRegime({ gir: 3, gir_total: 9 })).toBe('scrambling_driven');
  });

  it('is unknown when greens were not recorded — never guessed', () => {
    expect(classifyRoundRegime({ gir: null, gir_total: 18 })).toBe('unknown');
    expect(classifyRoundRegime({ gir: 10, gir_total: null })).toBe('unknown');
    expect(classifyRoundRegime({ gir: 10, gir_total: 0 })).toBe('unknown');
  });

  it('pins the thresholds to the cited research values', () => {
    expect(PUTTING_DRIVEN_MIN_GIR).toBe(12);
    expect(SCRAMBLING_DRIVEN_MAX_GIR).toBe(8);
  });
});

describe('regimeGuidanceLine — what the round-review prompt is told', () => {
  it('warns that a low putt count is confounded on a scrambling-driven round', () => {
    const line = regimeGuidanceLine({ gir: 6, gir_total: 18, total_putts: 29 });

    expect(line).not.toBeNull();
    expect(line).toMatch(/6\/18/);
    // The instruction that stops "your putting held up well".
    expect(line).toMatch(/not evidence of good putting|not a putting strength/i);
    expect(line).toMatch(/scrambling|short game/i);
  });

  it('names putting as the lever on a putting-driven round', () => {
    const line = regimeGuidanceLine({ gir: 14, gir_total: 18, total_putts: 33 });

    expect(line).not.toBeNull();
    expect(line).toMatch(/14\/18/);
    expect(line).toMatch(/putting/i);
  });

  it('says nothing on a transitional round rather than inventing a lens', () => {
    expect(regimeGuidanceLine({ gir: 10, gir_total: 18, total_putts: 31 })).toBeNull();
  });

  it('says nothing when greens were not recorded', () => {
    expect(regimeGuidanceLine({ gir: null, gir_total: null, total_putts: 30 })).toBeNull();
  });

  it('still warns on a scrambling round with no putt count, minus the putt clause', () => {
    const line = regimeGuidanceLine({ gir: 5, gir_total: 18, total_putts: null });
    expect(line).not.toBeNull();
    expect(line).toMatch(/scrambling|short game/i);
  });
});

/**
 * The wiring: the round-review prompt must carry the lens, not just the numbers.
 *
 * `buildPrompt` hands the model "29 putts, 4/14 fairways, 6/18 greens" and then
 * says "Mention the score and at least one of the stats". On a 6-green round
 * the most quotable stat is the flattering putt count, and praising it is the
 * single most likely wrong sentence the surface can produce. The citation
 * verifier cannot save it — 29 IS the putt count, so the claim verifies while
 * the inference is false.
 */
describe('round-review prompt carries the round lens', () => {
  const BASE = {
    player_id: 'p1',
    coach_id: 'c1',
    player_first_name: 'Cole',
    total_score: 82,
    score_to_par: 10,
    course_name: 'Lakewood Country Club',
    total_putts: 29,
    fairways_hit: 4,
    fairways_total: 14,
    gir: 6,
    gir_total: 18,
    fallback_summary: 'You shot 82.',
  };

  it('tells the model not to praise a low putt count on a scrambling round', async () => {
    const { __testables } = await import('@/lib/coachhelm/v3/llm/round-review');
    const prompt = __testables.buildPrompt(BASE);

    expect(prompt).toMatch(/NOT evidence of good putting/);
    expect(prompt).toMatch(/6\/18/);
    expect(prompt).toMatch(/do not praise the putt total/i);
  });

  it('names putting as the lever when greens were hit', async () => {
    const { __testables } = await import('@/lib/coachhelm/v3/llm/round-review');
    const prompt = __testables.buildPrompt({ ...BASE, gir: 14, total_putts: 33 });

    expect(prompt).toMatch(/Lens for this round/);
    expect(prompt).toMatch(/putting is the lever/i);
  });

  it('adds no lens line on a transitional round', async () => {
    const { __testables } = await import('@/lib/coachhelm/v3/llm/round-review');
    const prompt = __testables.buildPrompt({ ...BASE, gir: 10, total_putts: 31 });

    expect(prompt).not.toMatch(/Lens for this round/);
  });

  it('adds no lens line when greens were not recorded', async () => {
    const { __testables } = await import('@/lib/coachhelm/v3/llm/round-review');
    const prompt = __testables.buildPrompt({ ...BASE, gir: null, gir_total: null });

    expect(prompt).not.toMatch(/Lens for this round/);
  });
});
