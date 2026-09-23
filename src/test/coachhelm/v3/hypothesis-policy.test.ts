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
  type MetricStatusInput,
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
    miss_direction: null,
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

  it.each<MetricStatusInput>(['insufficient', 'descriptive_only', 'invalid'])(
    'a %s-status metric neither elevates nor contradicts',
    (status) => {
      const facts = [roughApproachShot('go_for_green')];
      const metrics: MetricResultInput[] = [
        { metricId: 'approach_measured_contribution', value: -0.9, status },
      ];
      const result = buildHypotheses(metrics, facts);
      const roughGap = result.find((h) => h.family === 'rough_gap')!;
      expect(roughGap.state).toBe('candidate');
      expect(roughGap.supportingClaimIds).toEqual([shotClaimId(facts[0]!)]);
      expect(roughGap.contradictingClaimIds).toEqual([]);
    },
  );
});

describe('buildHypotheses — recovery has no corroborating producer today, always no_data', () => {
  it('always reports the missing recovery-outcome metric with no supporting claim', () => {
    const facts = [roughApproachShot('recovery')];
    const result = buildHypotheses([], facts);
    const recovery = result.find((h) => h.family === 'recovery')!;
    // Deliberately empty: the triggering shot's own tag is not cited as
    // its own support (that would be circular), and no metric corroborates
    // a recovery-specific outcome today — see module doc comment.
    expect(recovery.state).toBe('no_data');
    expect(recovery.supportingClaimIds).toEqual([]);
    expect(recovery.contradictingClaimIds).toEqual([]);
    expect(recovery.missingInputs).toContain(metricClaimId('approach_recovery_outcome_rate'));
  });
});

describe('buildHypotheses — short_bias has no producer today, no_data until a metric lands', () => {
  it('is withheld (no_data: empty claims, missingInputs populated) once there is an approach shot', () => {
    const facts = [roughApproachShot('go_for_green')];
    const result = buildHypotheses([], facts);
    const shortBias = result.find((h) => h.family === 'short_bias')!;
    expect(shortBias).toBeDefined();
    expect(shortBias.state).toBe('no_data');
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
      miss_direction: null,
      observed_at: '2026-07-01T10:00:00.000Z',
    };
    const result = buildHypotheses([], [puttOnly]);
    expect(result.some((h) => h.family === 'short_bias')).toBe(false);
  });

  it('a supported miss rate at or above the support floor elevates to supported_association', () => {
    const facts = [roughApproachShot('go_for_green')];
    const metrics: MetricResultInput[] = [
      { metricId: 'approach_short_miss_rate', value: 70, status: 'supported' },
    ];
    const result = buildHypotheses(metrics, facts);
    const shortBias = result.find((h) => h.family === 'short_bias')!;
    expect(shortBias.state).toBe('supported_association');
    expect(shortBias.supportingClaimIds).toEqual([metricClaimId('approach_short_miss_rate')]);
    assertClaimsResolve(result, metrics, facts);
  });

  it('a supported miss rate at or below the refute floor contradicts it (should-fix #3)', () => {
    const facts = [roughApproachShot('go_for_green')];
    const metrics: MetricResultInput[] = [
      { metricId: 'approach_short_miss_rate', value: 25, status: 'supported' },
    ];
    const result = buildHypotheses(metrics, facts);
    const shortBias = result.find((h) => h.family === 'short_bias')!;
    expect(shortBias.state).toBe('candidate');
    expect(shortBias.contradictingClaimIds).toEqual([metricClaimId('approach_short_miss_rate')]);
    expect(shortBias.supportingClaimIds).toEqual([]);
    assertClaimsResolve(result, metrics, facts);
  });

  it('a supported miss rate strictly between the floors neither supports nor contradicts', () => {
    const facts = [roughApproachShot('go_for_green')];
    const metrics: MetricResultInput[] = [
      { metricId: 'approach_short_miss_rate', value: 50, status: 'supported' },
    ];
    const result = buildHypotheses(metrics, facts);
    const shortBias = result.find((h) => h.family === 'short_bias')!;
    expect(shortBias.state).toBe('no_data');
    expect(shortBias.supportingClaimIds).toEqual([]);
    expect(shortBias.contradictingClaimIds).toEqual([]);
  });
});

describe('buildHypotheses — par5_opportunity_loss is metric-only and contradiction downgrades it', () => {
  it('missing the opportunity metric reports no_data with the gap named', () => {
    const result = buildHypotheses([], []);
    const par5 = result.find((h) => h.family === 'par5_opportunity_loss')!;
    expect(par5).toBeDefined();
    expect(par5.state).toBe('no_data');
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

  it.each<MetricStatusInput>(['insufficient', 'descriptive_only', 'invalid'])(
    'a %s-status opportunity metric never elevates',
    (status) => {
      const metrics: MetricResultInput[] = [
        { metricId: 'par5_regulation_opportunity_rate', value: 20, status },
      ];
      const result = buildHypotheses(metrics, []);
      const par5 = result.find((h) => h.family === 'par5_opportunity_loss')!;
      expect(par5.state).toBe('no_data');
      expect(par5.supportingClaimIds).toEqual([]);
    },
  );
});

describe('buildHypotheses — description is a function of state, not a fixed template', () => {
  const HEDGE_WORDS = ['may', 'not yet corroborated', 'no data', 'neither'];
  const ASSOCIATION_WORDS = ['associated with', 'association'];
  const BANNED_ABSOLUTE_TERMS = ['proven', 'proves', 'definitely', 'certainly', 'causes', 'caused by'];

  function describedFamily(state: 'no_data' | 'candidate' | 'supported_association', family: string) {
    return function assertWording(description: string) {
      const lower = description.toLowerCase();
      for (const term of BANNED_ABSOLUTE_TERMS) {
        expect(lower, `${family}/${state} description must not say "${term}": ${description}`).not.toContain(term);
      }
      if (state === 'supported_association') {
        expect(
          ASSOCIATION_WORDS.some((w) => lower.includes(w)),
          `${family}/supported_association description should read as an association: ${description}`,
        ).toBe(true);
      } else {
        expect(
          HEDGE_WORDS.some((w) => lower.includes(w)),
          `${family}/${state} description should read as hedged/uncertain: ${description}`,
        ).toBe(true);
      }
    };
  }

  it('short_bias reads differently across no_data, candidate, and supported_association', () => {
    const noData = buildHypotheses([], [roughApproachShot('go_for_green')]).find((h) => h.family === 'short_bias')!;
    // short_bias only ever reaches 'candidate' via a contradiction (it has
    // no fact-based supporting claim of its own) — a below-refute-floor
    // value is the only route there.
    const candidate = buildHypotheses(
      [{ metricId: 'approach_short_miss_rate', value: 25, status: 'supported' }],
      [roughApproachShot('go_for_green')],
    ).find((h) => h.family === 'short_bias')!;
    const supported = buildHypotheses(
      [{ metricId: 'approach_short_miss_rate', value: 70, status: 'supported' }],
      [roughApproachShot('go_for_green')],
    ).find((h) => h.family === 'short_bias')!;

    expect(new Set([noData.description, candidate.description, supported.description]).size).toBe(3);
    describedFamily('no_data', 'short_bias')(noData.description);
    describedFamily('candidate', 'short_bias')(candidate.description);
    describedFamily('supported_association', 'short_bias')(supported.description);
  });

  it('recovery (always no_data today) reads as a stated gap, never as corroborated', () => {
    const recovery = buildHypotheses([], [roughApproachShot('recovery')]).find((h) => h.family === 'recovery')!;
    expect(recovery.state).toBe('no_data');
    describedFamily('no_data', 'recovery')(recovery.description);
  });

  it('rough_gap reads differently across candidate and supported_association', () => {
    const candidate = buildHypotheses([], [roughApproachShot('go_for_green')]).find((h) => h.family === 'rough_gap')!;
    const supported = buildHypotheses(
      [{ metricId: 'approach_measured_contribution', value: -0.4, status: 'supported' }],
      [roughApproachShot('go_for_green')],
    ).find((h) => h.family === 'rough_gap')!;

    expect(candidate.description).not.toBe(supported.description);
    describedFamily('candidate', 'rough_gap')(candidate.description);
    describedFamily('supported_association', 'rough_gap')(supported.description);
  });

  it('par5_opportunity_loss reads differently across no_data, candidate-via-contradiction, and supported_association', () => {
    const noData = buildHypotheses([], []).find((h) => h.family === 'par5_opportunity_loss')!;
    const supported = buildHypotheses(
      [{ metricId: 'par5_regulation_opportunity_rate', value: 40, status: 'supported' }],
      [],
    ).find((h) => h.family === 'par5_opportunity_loss')!;
    const downgraded = buildHypotheses(
      [
        { metricId: 'par5_regulation_opportunity_rate', value: 40, status: 'supported' },
        { metricId: 'par5_green_in_two_rate', value: 85, status: 'supported' },
      ],
      [],
    ).find((h) => h.family === 'par5_opportunity_loss')!;

    expect(new Set([noData.description, supported.description, downgraded.description]).size).toBe(3);
    describedFamily('no_data', 'par5_opportunity_loss')(noData.description);
    describedFamily('supported_association', 'par5_opportunity_loss')(supported.description);
    describedFamily('candidate', 'par5_opportunity_loss')(downgraded.description);
  });
});

describe('buildHypotheses — never infers psychology, fatigue, or mechanics', () => {
  const BANNED_TERMS = [
    'pressure', 'nervous', 'confiden', 'tired', 'fatigu', 'swing', 'grip',
    'tempo', 'mechanic', 'psycholog', 'mental', 'anxious', 'choke', 'choked',
    'focus', 'motivat', 'clutch', 'yips',
  ];

  it('scans the full serialized form of every hypothesis produced across the whole registry', () => {
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
    for (const h of result) {
      const text = JSON.stringify(h).toLowerCase();
      for (const term of BANNED_TERMS) {
        expect(text, `${h.id} (${h.family}) contains banned term "${term}"`).not.toContain(term);
      }
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
