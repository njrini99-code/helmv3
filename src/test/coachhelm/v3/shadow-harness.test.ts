/**
 * A10 slice 1 — shadow-mode evaluation harness (repair-plan addendum §13:
 * "run all new families in shadow mode on de-identified fixed snapshots
 * before coach-visible writes").
 *
 * Two layers: (1) the two grouping-invariant counters
 * (`countUnsupportedCauseClaims`/`countDuplicateLeadingPriority`) are unit-
 * tested directly against hand-built inputs, including a hand-built
 * VIOLATING input for each — "a gate that cannot fail is not a gate"
 * (`.claude/rules/quality-gates.md`). (2) `runShadowEvaluation` is run
 * against the real 2×2 snapshot fixture matrix
 * (`fixtures/shadow-eval-snapshots.ts`) and asserted against real A2/A3/A4
 * rollup/A5/A6 output — never hand-picked numbers.
 */
import { describe, expect, it } from 'vitest';
import type { Hypothesis, MetricResultInput } from '@/lib/coachhelm/v3/reasoning/hypothesis-policy';
import type { Issue } from '@/lib/coachhelm/v3/ranking/situational-ranking';
import {
  countDuplicateLeadingPriority,
  countUnsupportedCauseClaims,
  runShadowEvaluation,
} from '@/lib/coachhelm/v3/eval/shadow-harness';
import {
  establishedRosterComplete,
  establishedRosterIncomplete,
  newRosterComplete,
  newRosterIncomplete,
} from './fixtures/shadow-eval-snapshots';
import type { ShotFact } from '@/lib/coachhelm/v3/context/types';

// ---------------------------------------------------------------------------
// Test-local builders for the counter unit tests — deliberately hand-built,
// not run through `groupIssues`/`buildHypotheses`, so each counter is
// proven against its OWN contract independent of whether real production
// code currently produces a violation.
// ---------------------------------------------------------------------------

function issue(overrides: {
  id: string;
  sourceShotIds: string[];
  ownerClaimId: string | null;
}): Issue {
  return {
    id: overrides.id,
    sourceShotIds: overrides.sourceShotIds,
    claims: [],
    impactOwnership: { ownerClaimId: overrides.ownerClaimId, nonOwningClaimIds: [] },
    opportunityFrequency: { shotCount: overrides.sourceShotIds.length, distinctRounds: 1 },
    policyInput: { strokesImpact: 0, confidence: 0, sampleSize: 0 },
  };
}

function hypothesis(overrides: Partial<Hypothesis> & Pick<Hypothesis, 'state'>): Hypothesis {
  return {
    id: 'h-1',
    family: 'par5_opportunity_loss',
    description: 'test hypothesis',
    prerequisites: [],
    supportingClaimIds: [],
    contradictingClaimIds: [],
    missingInputs: [],
    nextCheck: null,
    ...overrides,
  };
}

function metric(overrides: Partial<MetricResultInput> & Pick<MetricResultInput, 'metricId'>): MetricResultInput {
  return { value: 10, status: 'supported', ...overrides };
}

function fact(overrides: Partial<ShotFact> & Pick<ShotFact, 'round_id' | 'hole_number' | 'shot_number'>): ShotFact {
  return {
    shot_type: 'unknown',
    club_type: null,
    intent: 'unknown',
    distance_to_hole_before_feet: null,
    distance_to_hole_after_feet: null,
    lie_before: null,
    lie_after: null,
    result: null,
    is_penalty: false,
    putt_made: null,
    miss_direction: null,
    observed_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// countDuplicateLeadingPriority
// ---------------------------------------------------------------------------

describe('countDuplicateLeadingPriority', () => {
  it('is 0 for an empty issue list', () => {
    expect(countDuplicateLeadingPriority([])).toBe(0);
  });

  it('is 0 when every issue has disjoint shots and a distinct owner', () => {
    const issues = [
      issue({ id: 'i1', sourceShotIds: ['shot:r1:1:1'], ownerClaimId: 'claim-1' }),
      issue({ id: 'i2', sourceShotIds: ['shot:r2:1:1'], ownerClaimId: 'claim-2' }),
    ];
    expect(countDuplicateLeadingPriority(issues)).toBe(0);
  });

  it('catches a shot id appearing in two issues (MUST fail if the check is removed)', () => {
    const issues = [
      issue({ id: 'i1', sourceShotIds: ['shot:r1:1:1', 'shot:r1:1:2'], ownerClaimId: 'claim-1' }),
      issue({ id: 'i2', sourceShotIds: ['shot:r1:1:2'], ownerClaimId: 'claim-2' }),
    ];
    expect(countDuplicateLeadingPriority(issues)).toBe(1);
  });

  it('catches the same claim owning two different issues', () => {
    const issues = [
      issue({ id: 'i1', sourceShotIds: ['shot:r1:1:1'], ownerClaimId: 'claim-shared' }),
      issue({ id: 'i2', sourceShotIds: ['shot:r2:1:1'], ownerClaimId: 'claim-shared' }),
    ];
    expect(countDuplicateLeadingPriority(issues)).toBe(1);
  });

  it('counts both violations at once when they co-occur', () => {
    const issues = [
      issue({ id: 'i1', sourceShotIds: ['shot:r1:1:1', 'shot:r1:1:2'], ownerClaimId: 'claim-shared' }),
      issue({ id: 'i2', sourceShotIds: ['shot:r1:1:2'], ownerClaimId: 'claim-shared' }),
    ];
    expect(countDuplicateLeadingPriority(issues)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// countUnsupportedCauseClaims
// ---------------------------------------------------------------------------

describe('countUnsupportedCauseClaims', () => {
  const facts = [fact({ round_id: 'r1', hole_number: 1, shot_number: 1 })];

  it('is 0 for an empty hypothesis list', () => {
    expect(countUnsupportedCauseClaims([], [], facts)).toBe(0);
  });

  it('is 0 for a supported_association hypothesis whose supporting metric is real and status supported', () => {
    const metrics = [metric({ metricId: 'par5_regulation_opportunity_rate', status: 'supported', value: 10 })];
    const hyps = [
      hypothesis({
        state: 'supported_association',
        supportingClaimIds: ['metric:par5_regulation_opportunity_rate'],
      }),
    ];
    expect(countUnsupportedCauseClaims(hyps, metrics, facts)).toBe(0);
  });

  it('catches a supported_association hypothesis whose supporting metric is not in the input set at all', () => {
    const hyps = [
      hypothesis({
        state: 'supported_association',
        supportingClaimIds: ['metric:par5_regulation_opportunity_rate'],
      }),
    ];
    expect(countUnsupportedCauseClaims(hyps, [], facts)).toBe(1);
  });

  it('catches a supported_association hypothesis whose cited metric exists but is not actually status: supported', () => {
    const metrics = [metric({ metricId: 'par5_regulation_opportunity_rate', status: 'descriptive_only', value: 10 })];
    const hyps = [
      hypothesis({
        state: 'supported_association',
        supportingClaimIds: ['metric:par5_regulation_opportunity_rate'],
      }),
    ];
    expect(countUnsupportedCauseClaims(hyps, metrics, facts)).toBe(1);
  });

  it('catches any claim id that does not resolve to a given input element, regardless of state', () => {
    const hyps = [
      hypothesis({ state: 'candidate', supportingClaimIds: ['shot:r1:1:99'] }), // shot never given
    ];
    expect(countUnsupportedCauseClaims(hyps, [], facts)).toBe(1);
  });

  it('never flags no_data/candidate states with fully-resolvable claims', () => {
    const hyps = [
      hypothesis({ state: 'no_data', missingInputs: ['metric:approach_short_miss_rate'] }),
      hypothesis({ state: 'candidate', supportingClaimIds: ['shot:r1:1:1'] }),
    ];
    expect(countUnsupportedCauseClaims(hyps, [], facts)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// runShadowEvaluation — real 2x2 snapshot matrix
// ---------------------------------------------------------------------------

function statusFor(byStatus: Record<string, number>, status: string): number {
  return byStatus[status] ?? 0;
}

describe('runShadowEvaluation — new vs. established roster', () => {
  it('new roster + incomplete data: nothing clears any floor, the hole is suppressed', () => {
    const report = runShadowEvaluation(newRosterIncomplete);
    expect(report.sequencePerHole.attributed).toBe(0);
    expect(report.sequencePerHole.suppressed).toBe(1);
    expect(statusFor(report.distance.byStatus, 'supported')).toBe(0);
    expect(statusFor(report.par.byStatus, 'supported')).toBe(0);
    expect(statusFor(report.sequenceRollup.byStatus, 'supported')).toBe(0);
    expect(report.grouping.unsupportedCauseClaims).toBe(0);
    expect(report.grouping.duplicateLeadingPriority).toBe(0);
  });

  it('new roster + complete data: real values, but insufficient (under every floor) — never a supported row', () => {
    const report = runShadowEvaluation(newRosterComplete);
    expect(report.sequencePerHole.attributed).toBe(2);
    expect(report.sequencePerHole.suppressed).toBe(0);
    // Complete data means denominator > 0 somewhere, so 'invalid' should
    // not be the only outcome — but a single round never clears a floor.
    expect(statusFor(report.sequenceRollup.byStatus, 'supported')).toBe(0);
    expect(statusFor(report.par.byStatus, 'supported')).toBe(0);
    expect(statusFor(report.distance.byStatus, 'supported')).toBe(0);
    expect(report.grouping.unsupportedCauseClaims).toBe(0);
    expect(report.grouping.duplicateLeadingPriority).toBe(0);
  });

  it('established roster + complete data: the real population clears every family\'s floor (precondition)', () => {
    const report = runShadowEvaluation(establishedRosterComplete);

    const par4All = report.par; // summarized; check the underlying real rows via the report's own totals
    expect(statusFor(par4All.byStatus, 'supported')).toBeGreaterThan(0);
    expect(statusFor(report.distance.byStatus, 'supported')).toBeGreaterThan(0);
    expect(statusFor(report.sequenceRollup.byStatus, 'supported')).toBeGreaterThan(0);

    // The one real, unforced path to a supported_association hypothesis:
    // par5_opportunity_loss, corroborated by a real, supported
    // par5_regulation_opportunity_rate row at value 0%.
    expect(report.hypotheses.byState.supported_association).toBeGreaterThan(0);

    expect(report.grouping.packetCount).toBeGreaterThan(0);
    expect(report.grouping.unsupportedCauseClaims).toBe(0);
    expect(report.grouping.duplicateLeadingPriority).toBe(0);
    expect(report.grouping.duplicateIssueRate).toBeGreaterThanOrEqual(0);
    expect(report.grouping.duplicateIssueRate).toBeLessThanOrEqual(1);
  });

  it('established roster + incomplete data: still clears the floors, but honestly reports the gap', () => {
    const complete = runShadowEvaluation(establishedRosterComplete);
    const withGap = runShadowEvaluation(establishedRosterIncomplete);

    // Volume absorbs one incomplete hole — the established rows already
    // supported in the complete snapshot stay supported here too.
    expect(statusFor(withGap.sequenceRollup.byStatus, 'supported')).toBe(
      statusFor(complete.sequenceRollup.byStatus, 'supported'),
    );
    expect(withGap.sequencePerHole.suppressed).toBe(1);
    expect(Object.keys(withGap.sequencePerHole.suppressionReasonHistogram).length).toBeGreaterThan(0);

    expect(withGap.grouping.unsupportedCauseClaims).toBe(0);
    expect(withGap.grouping.duplicateLeadingPriority).toBe(0);
  });

  it('short_bias is unreachable on any real snapshot — no A2/A3 family emits approach_short_miss_rate (shadow-mode finding, not a bug here)', () => {
    for (const snapshot of [newRosterIncomplete, newRosterComplete, establishedRosterComplete, establishedRosterIncomplete]) {
      const report = runShadowEvaluation(snapshot);
      // short_bias can only ever read 'no_data' — never elevated, never
      // contradicted, because its metric producer doesn't exist yet.
      expect(report.hypotheses.missingInputDistribution['metric:approach_short_miss_rate']).toBeGreaterThan(0);
    }
  });
});
