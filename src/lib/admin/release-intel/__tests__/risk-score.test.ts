import { describe, it, expect } from 'vitest';
import { scoreChange } from '../risk-score';
import type { ChangeRiskInput } from '../types';

const CLEAN: ChangeRiskInput = {
  featureCriticalities: [],
  impactedFeatureCount: 0,
  touchesMigration: false,
  touchesAuthOrRls: false,
  touchesDestructiveWrite: false,
  incidentDensity: 0,
  testCoverageConfidence: 'covered',
};

describe('scoreChange', () => {
  it('scores an entirely clean, fully-read diff as R0 with no missing inputs', () => {
    const result = scoreChange(CLEAN);
    expect(result.tier).toBe('R0');
    expect(result.inputsMissing).toEqual([]);
  });

  it('a migration-touching diff always scores at least R2 (F.5)', () => {
    const result = scoreChange({ ...CLEAN, touchesMigration: true });
    expect(['R2', 'R3']).toContain(result.tier);
    expect(result.reasons.some((r) => r.input === 'touchesMigration')).toBe(true);
  });

  it('an auth/RLS-touching diff scores R3', () => {
    const result = scoreChange({ ...CLEAN, touchesAuthOrRls: true });
    expect(result.tier).toBe('R3');
  });

  it('a destructive-write diff scores at least R2', () => {
    const result = scoreChange({ ...CLEAN, touchesDestructiveWrite: true });
    expect(['R2', 'R3']).toContain(result.tier);
  });

  it('biases every unknown input toward the HIGHER tier, never the lower one (F.7)', () => {
    const allUnknown: ChangeRiskInput = {
      featureCriticalities: [],
      impactedFeatureCount: null,
      touchesMigration: null,
      touchesAuthOrRls: null,
      touchesDestructiveWrite: null,
      incidentDensity: null,
      testCoverageConfidence: null,
    };
    const result = scoreChange(allUnknown);
    // touchesAuthOrRls === null escalates to at least R2 by design.
    expect(['R2', 'R3']).toContain(result.tier);
    expect(result.inputsMissing).toEqual(
      expect.arrayContaining(['impactedFeatureCount', 'touchesMigration', 'touchesAuthOrRls', 'touchesDestructiveWrite', 'incidentDensity', 'testCoverageConfidence']),
    );
  });

  it('never scores LOWER than a fully-known equivalent diff when an input is unknown', () => {
    const known = scoreChange({ ...CLEAN, touchesMigration: false });
    const unknown = scoreChange({ ...CLEAN, touchesMigration: null });
    const order = ['R0', 'R1', 'R2', 'R3'];
    expect(order.indexOf(unknown.tier)).toBeGreaterThanOrEqual(order.indexOf(known.tier));
  });

  it('an unresolvable feature criticality inside a non-empty array is treated as high', () => {
    const result = scoreChange({ ...CLEAN, featureCriticalities: ['low', null] });
    expect(['R2', 'R3']).toContain(result.tier);
  });

  it('an empty featureCriticalities array is not treated as missing', () => {
    const result = scoreChange(CLEAN);
    expect(result.inputsMissing).not.toContain('featureCriticalities');
  });

  it('a wide blast radius raises the tier even with nothing else touched', () => {
    const result = scoreChange({ ...CLEAN, impactedFeatureCount: 6 });
    expect(['R2', 'R3']).toContain(result.tier);
  });

  it('high historical incident density raises the tier', () => {
    const result = scoreChange({ ...CLEAN, incidentDensity: 4 });
    expect(['R2', 'R3']).toContain(result.tier);
  });

  it('test coverage confidence never raises the tier on its own', () => {
    const covered = scoreChange({ ...CLEAN, testCoverageConfidence: 'covered' });
    const none = scoreChange({ ...CLEAN, testCoverageConfidence: 'none' });
    expect(covered.tier).toBe('R0');
    expect(none.tier).toBe('R0');
  });

  it('always includes at least one reason, even for a clean R0 result', () => {
    const result = scoreChange(CLEAN);
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});
