import { describe, it, expect } from 'vitest';
import { computeFeatureAutonomy, AUTONOMY_CEILING, type FeatureAutonomyEvidence } from '../policy';

const CLEAN: FeatureAutonomyEvidence = {
  featureId: 'qualifiers',
  repairClass: 'lifecycle',
  capabilityState: 'proven',
  recentRecurrence: false,
  recentVerificationFailure: false,
};

describe('computeFeatureAutonomy', () => {
  it('reaches the full ceiling when capability is proven and both recurrence/failure checks are clean', () => {
    const result = computeFeatureAutonomy(CLEAN);
    expect(result.tier).toBe(AUTONOMY_CEILING);
  });

  it('demotes to observe_only when recurrence is true, regardless of capability', () => {
    const result = computeFeatureAutonomy({ ...CLEAN, recentRecurrence: true });
    expect(result.tier).toBe('observe_only');
  });

  it('demotes to observe_only when a verification failure is on record, regardless of capability', () => {
    const result = computeFeatureAutonomy({ ...CLEAN, recentVerificationFailure: true });
    expect(result.tier).toBe('observe_only');
  });

  it('a simulated recurrence lowers the tier from a previously-clean evidence set with no human step required', () => {
    const before = computeFeatureAutonomy(CLEAN);
    const after = computeFeatureAutonomy({ ...CLEAN, recentRecurrence: true });
    expect(before.tier).not.toBe('observe_only');
    expect(after.tier).toBe('observe_only');
  });

  it('defaults to observe_only when capability is unproven', () => {
    const result = computeFeatureAutonomy({ ...CLEAN, capabilityState: 'unproven' });
    expect(result.tier).toBe('observe_only');
  });

  it('defaults to observe_only when capability is unknown', () => {
    const result = computeFeatureAutonomy({ ...CLEAN, capabilityState: 'unknown' });
    expect(result.tier).toBe('observe_only');
  });

  it('defaults to observe_only when recurrence could not be checked (null), even with proven capability', () => {
    const result = computeFeatureAutonomy({ ...CLEAN, recentRecurrence: null });
    expect(result.tier).toBe('observe_only');
  });

  it('defaults to observe_only when verification-failure history could not be checked (null)', () => {
    const result = computeFeatureAutonomy({ ...CLEAN, recentVerificationFailure: null });
    expect(result.tier).toBe('observe_only');
  });

  it('never exceeds an explicitly lower ceiling override', () => {
    const result = computeFeatureAutonomy(CLEAN, 'may_prepare_repairs');
    expect(result.tier).toBe('may_prepare_repairs');
  });

  it('never exceeds AUTONOMY_CEILING even with a clean record and no override', () => {
    const result = computeFeatureAutonomy(CLEAN);
    const AUTONOMY_TIERS = ['observe_only', 'may_prepare_repairs', 'may_open_prs', 'may_merge_low_risk'];
    expect(AUTONOMY_TIERS.indexOf(result.tier)).toBeLessThanOrEqual(AUTONOMY_TIERS.indexOf(AUTONOMY_CEILING));
  });

  it('every result carries at least one reason', () => {
    expect(computeFeatureAutonomy(CLEAN).reasons.length).toBeGreaterThan(0);
    expect(computeFeatureAutonomy({ ...CLEAN, recentRecurrence: true }).reasons.length).toBeGreaterThan(0);
  });

  it('preserves featureId and repairClass through the result', () => {
    const result = computeFeatureAutonomy(CLEAN);
    expect(result.featureId).toBe('qualifiers');
    expect(result.repairClass).toBe('lifecycle');
  });
});
