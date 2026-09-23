/**
 * Pure-core tests for `buildHypotheses` (addendum §13, work package A5,
 * slice 1). No DB, no adapters — plain `MetricResultInput`/`ShotFact`
 * fixtures.
 */
import { describe, it, expect } from 'vitest';
import type { ShotFact, ShotIntent } from '@/lib/coachhelm/v3/context/types';
import {
  buildHypotheses,
  metricClaimId,
  shotClaimId,
  type MetricResultInput,
} from '@/lib/coachhelm/v3/reasoning/hypothesis-policy';

function roughApproachShot(intent: ShotIntent, overrides: Partial<ShotFact> = {}): ShotFact {
  return {
    round_id: 'round-rough',
    hole_number: 5,
    shot_number: 2,
    shot_type: 'approach',
    club_type: 'non_driver',
    intent,
    distance_to_hole_before_feet: 450,
    distance_to_hole_after_feet: 30,
    lie_before: 'rough',
    lie_after: 'rough',
    result: 'rough',
    is_penalty: false,
    putt_made: null,
    observed_at: '2026-07-01T10:00:00.000Z',
    ...overrides,
  };
}

/** Every supporting/contradicting claim id must resolve back to an actual
 *  element of the inputs this module was given — never a dangling
 *  reference. */
function assertClaimsResolve(
  hypotheses: readonly { supportingClaimIds: string[]; contradictingClaimIds: string[] }[],
  metrics: readonly MetricResultInput[],
  facts: readonly ShotFact[],
): void {
  const knownMetricClaims = new Set(metrics.map((m) => metricClaimId(m.metricId)));
  const knownShotClaims = new Set(facts.map((f) => shotClaimId(f)));
  for (const h of hypotheses) {
    for (const claim of [...h.supportingClaimIds, ...h.contradictingClaimIds]) {
      expect(knownMetricClaims.has(claim) || knownShotClaims.has(claim)).toBe(true);
    }
  }
}

describe('buildHypotheses — rough-lie approach: identical shot, different intent, different hypothesis', () => {
  it('go_for_green intent produces rough_gap, not recovery or insufficient', () => {
    const facts = [roughApproachShot('go_for_green')];
    const result = buildHypotheses([], facts);
    const roughFamily = result.filter((h) => h.id.includes(shotClaimId(facts[0]!)));
    expect(roughFamily).toHaveLength(1);
    expect(roughFamily[0]!.family).toBe('rough_gap');
    assertClaimsResolve(result, [], facts);
  });

  it('recovery intent produces recovery, not rough_gap or insufficient', () => {
    const facts = [roughApproachShot('recovery')];
    const result = buildHypotheses([], facts);
    const roughFamily = result.filter((h) => h.id.includes(shotClaimId(facts[0]!)));
    expect(roughFamily).toHaveLength(1);
    expect(roughFamily[0]!.family).toBe('recovery');
    assertClaimsResolve(result, [], facts);
  });

  it('unknown intent produces neither — insufficient to distinguish instead', () => {
    const facts = [roughApproachShot('unknown')];
    const result = buildHypotheses([], facts);
    const roughFamily = result.filter((h) => h.id.includes(shotClaimId(facts[0]!)));
    expect(roughFamily).toHaveLength(1);
    expect(roughFamily[0]!.family).toBe('insufficient');
    expect(roughFamily[0]!.state).toBe('candidate');
    expect(roughFamily[0]!.nextCheck).toEqual({
      distinguishes: ['rough_gap', 'recovery'],
      requires: 'fact:intent',
    });
    expect(roughFamily[0]!.missingInputs).toContain('fact:intent');
  });

  it('an explicit layup from the rough is neither family', () => {
    const facts = [roughApproachShot('layup')];
    const result = buildHypotheses([], facts);
    const roughFamily = result.filter((h) => h.id.includes(shotClaimId(facts[0]!)));
    expect(roughFamily).toHaveLength(0);
  });

  it('never emits both rough_gap and recovery for the same shot', () => {
    for (const intent of ['go_for_green', 'recovery', 'unknown', 'layup'] as const) {
      const facts = [roughApproachShot(intent)];
      const result = buildHypotheses([], facts);
      const families = new Set(result.filter((h) => h.id.includes(shotClaimId(facts[0]!))).map((h) => h.family));
      expect(families.has('rough_gap') && families.has('recovery')).toBe(false);
    }
  });
});

describe('buildHypotheses — rough_gap elevates only with a corroborating, uncontradicted metric', () => {
  it('missing the corroborating metric caps state at candidate and reports the gap', () => {
    const facts = [roughApproachShot('go_for_green')];
    const result = buildHypotheses([], facts);
    const roughGap = result.find((h) => h.family === 'rough_gap')!;
    expect(roughGap.state).toBe('candidate');
    expect(roughGap.missingInputs).toContain(metricClaimId('approach_measured_contribution'));
    expect(roughGap.supportingClaimIds).toEqual([shotClaimId(facts[0]!)]);
  });

  it('a supported, below-expectation contribution elevates to supported_association', () => {
    const facts = [roughApproachShot('go_for_green')];
    const metrics: MetricResultInput[] = [
      { metricId: 'approach_measured_contribution', value: -0.4, status: 'supported' },
    ];
    const result = buildHypotheses(metrics, facts);
    const roughGap = result.find((h) => h.family === 'rough_gap')!;
    expect(roughGap.state).toBe('supported_association');
    expect(roughGap.supportingClaimIds).toContain(metricClaimId('approach_measured_contribution'));
    expect(roughGap.missingInputs).toEqual([]);
    assertClaimsResolve(result, metrics, facts);
  });

  it('a supported, above-expectation contribution contradicts it and caps at candidate', () => {
    const facts = [roughApproachShot('go_for_green')];
    const metrics: MetricResultInput[] = [
      { metricId: 'approach_measured_contribution', value: 0.3, status: 'supported' },
    ];
    const result = buildHypotheses(metrics, facts);
    const roughGap = result.find((h) => h.family === 'rough_gap')!;
    expect(roughGap.state).toBe('candidate');
    expect(roughGap.contradictingClaimIds).toContain(metricClaimId('approach_measured_contribution'));
    assertClaimsResolve(result, metrics, facts);
  });

  it('an insufficient-status metric neither elevates nor contradicts', () => {
    const facts = [roughApproachShot('go_for_green')];
    const metrics: MetricResultInput[] = [
      { metricId: 'approach_measured_contribution', value: -0.9, status: 'insufficient' },
    ];
    const result = buildHypotheses(metrics, facts);
    const roughGap = result.find((h) => h.family === 'rough_gap')!;
    expect(roughGap.state).toBe('candidate');
    expect(roughGap.supportingClaimIds).toEqual([shotClaimId(facts[0]!)]);
    expect(roughGap.contradictingClaimIds).toEqual([]);
  });
});

describe('buildHypotheses — recovery never rises past candidate (no producer today)', () => {
  it('always reports the missing recovery-outcome metric', () => {
    const facts = [roughApproachShot('recovery')];
    const result = buildHypotheses([], facts);
    const recovery = result.find((h) => h.family === 'recovery')!;
    expect(recovery.state).toBe('candidate');
    expect(recovery.missingInputs).toContain(metricClaimId('approach_recovery_outcome_rate'));
    expect(recovery.supportingClaimIds).toEqual([shotClaimId(facts[0]!)]);
  });
});

describe('buildHypotheses — short_bias has no producer today', () => {
  it('is withheld (empty claims, missingInputs populated) once there is an approach shot', () => {
    const facts = [roughApproachShot('go_for_green')];
    const result = buildHypotheses([], facts);
    const shortBias = result.find((h) => h.family === 'short_bias')!;
    expect(shortBias).toBeDefined();
    expect(shortBias.state).toBe('candidate');
    expect(shortBias.supportingClaimIds).toEqual([]);
    expect(shortBias.missingInputs).toContain(metricClaimId('approach_short_miss_rate'));
  });

  it('is not emitted at all when there is no approach shot to speak of', () => {
    const puttOnly: ShotFact = {
      round_id: 'round-putt-only',
      hole_number: 1,
      shot_number: 1,
      shot_type: 'putting',
      club_type: 'putter',
      intent: 'putt',
      distance_to_hole_before_feet: 10,
      distance_to_hole_after_feet: 0,
      lie_before: 'green',
      lie_after: 'hole',
      result: 'hole',
      is_penalty: false,
      putt_made: true,
      observed_at: '2026-07-01T10:00:00.000Z',
    };
    const result = buildHypotheses([], [puttOnly]);
    expect(result.some((h) => h.family === 'short_bias')).toBe(false);
  });
});

describe('buildHypotheses — par5_opportunity_loss is metric-only and contradiction downgrades it', () => {
  it('missing the opportunity metric caps state at candidate with the gap reported', () => {
    const result = buildHypotheses([], []);
    const par5 = result.find((h) => h.family === 'par5_opportunity_loss')!;
    expect(par5).toBeDefined();
    expect(par5.state).toBe('candidate');
    expect(par5.missingInputs).toContain(metricClaimId('par5_regulation_opportunity_rate'));
    expect(par5.supportingClaimIds).toEqual([]);
  });

  it('a low, supported opportunity rate elevates to supported_association', () => {
    const metrics: MetricResultInput[] = [
      { metricId: 'par5_regulation_opportunity_rate', value: 40, status: 'supported' },
    ];
    const result = buildHypotheses(metrics, []);
    const par5 = result.find((h) => h.family === 'par5_opportunity_loss')!;
    expect(par5.state).toBe('supported_association');
    expect(par5.supportingClaimIds).toEqual([metricClaimId('par5_regulation_opportunity_rate')]);
    // Corroborating green-in-two metric absent — still a stated gap even
    // though the base signal alone was enough to elevate.
    expect(par5.missingInputs).toEqual([metricClaimId('par5_green_in_two_rate')]);
    assertClaimsResolve(result, metrics, []);
  });

  it('adding a high, supported green-in-two rate downgrades supported_association back to candidate', () => {
    // Same base fixture as the elevation test above, PLUS a contradicting
    // second metric — the downgrade, not a candidate-to-candidate no-op.
    const baseMetrics: MetricResultInput[] = [
      { metricId: 'par5_regulation_opportunity_rate', value: 40, status: 'supported' },
    ];
    const baseline = buildHypotheses(baseMetrics, []).find((h) => h.family === 'par5_opportunity_loss')!;
    expect(baseline.state).toBe('supported_association'); // precondition

    const contradictingMetrics: MetricResultInput[] = [
      ...baseMetrics,
      { metricId: 'par5_green_in_two_rate', value: 85, status: 'supported' },
    ];
    const result = buildHypotheses(contradictingMetrics, []);
    const par5 = result.find((h) => h.family === 'par5_opportunity_loss')!;
    expect(par5.state).toBe('candidate');
    expect(par5.contradictingClaimIds).toEqual([metricClaimId('par5_green_in_two_rate')]);
    expect(par5.missingInputs).toEqual([]);
    assertClaimsResolve(result, contradictingMetrics, []);
  });
});

describe('buildHypotheses — never infers psychology, fatigue, or mechanics', () => {
  const BANNED_TERMS = [
    'pressure', 'nervous', 'confiden', 'tired', 'fatigu', 'swing', 'grip',
    'tempo', 'mechanic', 'psycholog', 'mental', 'anxious', 'choke', 'choked',
    'focus', 'motivat', 'clutch', 'yips',
  ];

  it('scans every hypothesis produced across the whole registry for banned terms', () => {
    const facts: ShotFact[] = [
      roughApproachShot('go_for_green'),
      roughApproachShot('recovery', { shot_number: 3 }),
      roughApproachShot('unknown', { shot_number: 4 }),
    ];
    const metrics: MetricResultInput[] = [
      { metricId: 'approach_short_miss_rate', value: 70, status: 'supported' },
      { metricId: 'approach_measured_contribution', value: -0.4, status: 'supported' },
      { metricId: 'par5_regulation_opportunity_rate', value: 30, status: 'supported' },
      { metricId: 'par5_green_in_two_rate', value: 20, status: 'supported' },
    ];
    const result = buildHypotheses(metrics, facts);
    expect(result.length).toBeGreaterThan(0);
    const text = result
      .map((h) => `${h.id} ${h.family} ${h.description}`)
      .join(' ')
      .toLowerCase();
    for (const term of BANNED_TERMS) {
      expect(text).not.toContain(term);
    }
  });
});

describe('buildHypotheses — claim ids always resolve to an input element', () => {
  it('holds across every fixture combination exercised above', () => {
    const facts: ShotFact[] = [
      roughApproachShot('go_for_green'),
      roughApproachShot('recovery', { shot_number: 3 }),
    ];
    const metrics: MetricResultInput[] = [
      { metricId: 'approach_measured_contribution', value: -0.2, status: 'supported' },
      { metricId: 'par5_regulation_opportunity_rate', value: 45, status: 'supported' },
      { metricId: 'par5_green_in_two_rate', value: 90, status: 'supported' },
    ];
    const result = buildHypotheses(metrics, facts);
    assertClaimsResolve(result, metrics, facts);
  });
});
