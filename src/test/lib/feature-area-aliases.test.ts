import { describe, it, expect } from 'vitest';
import {
  resolveFeatureKey,
  FEATURE_AREA_ALIASES,
  FEATURE_KEYS,
} from '@/lib/admin/feature-registry';

describe('resolveFeatureKey — the featureArea promotion bug', () => {
  it('promotes each known legacy featureArea to a REAL registry key', () => {
    // The bug: `feature: context.feature ?? context.featureArea` wrote free
    // text into the canonical column, so the Bridge showed "unregistered tag"
    // and resolveActionFilePath returned null => blank SOURCE FILE.
    for (const [area, key] of Object.entries(FEATURE_AREA_ALIASES)) {
      expect(resolveFeatureKey(null, area)).toBe(key);
      expect(FEATURE_KEYS.has(key)).toBe(true);
    }
  });

  it('maps the five values actually seen in production', () => {
    expect(resolveFeatureKey(null, 'shot_tracking')).toBe('round_tracking');
    expect(resolveFeatureKey(null, 'stats_cache')).toBe('stats_analytics');
    expect(resolveFeatureKey(null, 'coachhelm.mining')).toBe('coachhelm_ai_engine');
    expect(resolveFeatureKey(null, 'coachhelm')).toBe('coachhelm_ai_engine');
    // A file path that reached production as a feature tag.
    expect(resolveFeatureKey(null, 'coachhelm/v2/mining/course-management')).toBe(
      'coachhelm_ai_engine',
    );
  });

  it('an explicit feature always wins over featureArea', () => {
    expect(resolveFeatureKey('calendar_events', 'shot_tracking')).toBe('calendar_events');
  });

  it('passes an UNRECOGNISED featureArea through unchanged', () => {
    // Deliberate. `integrations` owns the Inngest handler and is a genuinely
    // new feature needing its own registry entry. Nulling it here would trade
    // a visible "unregistered tag" warning on the Health board for an
    // invisible gap in the unattributed bucket.
    expect(resolveFeatureKey(null, 'integrations')).toBe('integrations');
    // Registered 2026-08-27, so this pass-through now lands on a REAL key
    // rather than free text the Health board could only show untiered.
    expect(FEATURE_KEYS.has('integrations')).toBe(true);
  });

  it('returns null when neither is supplied', () => {
    expect(resolveFeatureKey(null, null)).toBeNull();
    expect(resolveFeatureKey(undefined, undefined)).toBeNull();
  });

  it('every alias target is a registry key, so none can rot into free text', () => {
    for (const key of Object.values(FEATURE_AREA_ALIASES)) {
      expect(FEATURE_KEYS.has(key)).toBe(true);
    }
  });
});
