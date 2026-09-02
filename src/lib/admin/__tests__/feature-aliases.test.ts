import { describe, it, expect } from 'vitest';
import { FEATURE_AREA_ALIASES, FEATURE_KEYS, resolveFeatureKey } from '@/lib/admin/feature-registry';

/**
 * Feature attribution bypassed the alias table: an explicit `feature` was
 * returned untouched, and `featureArea` values that no alias listed landed as
 * their raw string — so `calendar` (12 sites) was never counted against
 * calendar_events, and a dozen other keys carried rows in 30d against nothing.
 */
describe('FEATURE_AREA_ALIASES', () => {
  it('every alias resolves to a REGISTERED feature key', () => {
    for (const [alias, target] of Object.entries(FEATURE_AREA_ALIASES)) {
      expect(FEATURE_KEYS.has(target), `${alias} -> ${target} is not a registry key`).toBe(true);
    }
  });

  it('no alias shadows a real key (a registry key must never be silently rewritten)', () => {
    for (const alias of Object.keys(FEATURE_AREA_ALIASES)) {
      expect(FEATURE_KEYS.has(alias), `${alias} is itself a registry key and must not be aliased`).toBe(false);
    }
  });

  it.each([
    ['calendar', 'calendar_events'],
    ['insights', 'coachhelm_ai_engine'],
    ['coachhelm_chat', 'coachhelm_ai_engine'],
    ['coachhelm', 'coachhelm_ai_engine'],
    ['coachhelm.mining', 'coachhelm_ai_engine'],
    ['coachhelm/v2/mining/course-management', 'coachhelm_ai_engine'],
    ['coachhelm_effectiveness', 'coachhelm_analytics'],
    ['teams', 'join_team_flow'],
    ['shot_tracking', 'round_tracking'],
    ['stats_cache', 'stats_analytics'],
    ['rounds', 'round_tracking'],
  ])('the measured unregistered key %s maps to %s', (alias, target) => {
    expect(FEATURE_AREA_ALIASES[alias]).toBe(target);
  });

  it('crm is DELIBERATELY not aliased — CRM is never tagged onto the Bridge (owner directive)', () => {
    expect(FEATURE_AREA_ALIASES.crm).toBeUndefined();
    expect(resolveFeatureKey(null, 'crm')).toBe('crm');
  });

  it('lifting-onboarding has no home: Lift Lab is not in the registry, so it stays visibly unregistered', () => {
    expect(FEATURE_AREA_ALIASES['lifting-onboarding']).toBeUndefined();
    expect(FEATURE_AREA_ALIASES.lifting_onboarding).toBeUndefined();
    expect(FEATURE_KEYS.has('lifting_onboarding')).toBe(false);
  });
});

describe('resolveFeatureKey', () => {
  it('aliases an explicit `feature`, not only `featureArea`', () => {
    expect(resolveFeatureKey('coachhelm_chat', null)).toBe('coachhelm_ai_engine');
    expect(resolveFeatureKey('calendar', 'whatever')).toBe('calendar_events');
  });

  it('aliases `featureArea` when no feature is given', () => {
    expect(resolveFeatureKey(null, 'calendar')).toBe('calendar_events');
    expect(resolveFeatureKey(undefined, 'teams')).toBe('join_team_flow');
  });

  it('returns a registered key untouched, and an unknown tag raw so it stays visible', () => {
    expect(resolveFeatureKey('round_tracking', null)).toBe('round_tracking');
    expect(resolveFeatureKey(null, 'round_tracking')).toBe('round_tracking');
    expect(resolveFeatureKey('brand-new-tag', null)).toBe('brand-new-tag');
    expect(resolveFeatureKey(null, 'brand-new-tag')).toBe('brand-new-tag');
  });

  it('explicit feature wins over featureArea; null when neither is given', () => {
    expect(resolveFeatureKey('round_tracking', 'calendar')).toBe('round_tracking');
    expect(resolveFeatureKey(null, null)).toBeNull();
    expect(resolveFeatureKey('  ', '')).toBeNull();
  });
});
