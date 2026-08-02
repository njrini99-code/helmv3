/**
 * #1239 — every `target_metric` the live DB holds must either canonicalize onto
 * a vocabulary the progress driver recognizes, or be explicitly known-manual.
 * The defect was silence: an unrecognized id looked exactly like a tracking one.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveFocusTargetMetric,
  isTrackableFocusMetric,
  LEGACY_TARGET_METRIC_ALIASES,
} from '../target-metric';
import { isMetricId } from '@/lib/coachhelm/v3/metrics/registry';
import { findMetric } from '../catalog';

describe('resolveFocusTargetMetric', () => {
  it('canonicalizes a legacy catalog LABEL onto its stable key', () => {
    expect(resolveFocusTargetMetric('Fairways Hit %')).toBe('fairways_hit_pct');
    expect(resolveFocusTargetMetric('Putts Per Round')).toBe('putts_per_round');
    expect(resolveFocusTargetMetric('GIR %')).toBe('gir_pct');
  });

  it('passes a catalog key through unchanged', () => {
    expect(resolveFocusTargetMetric('fairways_hit_pct')).toBe('fairways_hit_pct');
  });

  it('passes a v3 registry metric id through unchanged', () => {
    expect(resolveFocusTargetMetric('putts_made_3_5ft_pct')).toBe('putts_made_3_5ft_pct');
    expect(resolveFocusTargetMetric('approach_proximity_50_125ft')).toBe('approach_proximity_50_125ft');
  });

  it('maps the legacy orphans found live onto canonical ids', () => {
    expect(resolveFocusTargetMetric('make_pct_5_10')).toBe('putts_made_5_10ft_pct');
    expect(resolveFocusTargetMetric('Avg proximity 80-120y')).toBe('approach_proximity_50_125ft');
    expect(resolveFocusTargetMetric('avg_proximity_ft')).toBe('approach_proximity_125_175ft');
  });

  it('is whitespace- and case-tolerant on aliases', () => {
    expect(resolveFocusTargetMetric('  AVG PROXIMITY 80-120Y  ')).toBe('approach_proximity_50_125ft');
  });

  it('returns null for genuinely custom text rather than pretending', () => {
    expect(resolveFocusTargetMetric('three_putt_chain')).toBeNull();
    expect(resolveFocusTargetMetric('Mental Toughness')).toBeNull();
    expect(resolveFocusTargetMetric('')).toBeNull();
    expect(resolveFocusTargetMetric(null)).toBeNull();
    expect(resolveFocusTargetMetric(undefined)).toBeNull();
  });

  it('every alias target is itself a real, recognized id', () => {
    // Guards the alias table against rotting into pointing at nothing.
    for (const [legacy, canonical] of Object.entries(LEGACY_TARGET_METRIC_ALIASES)) {
      const recognized = isMetricId(canonical) || findMetric(canonical) !== null;
      expect(recognized, `alias ${legacy} -> ${canonical} must resolve`).toBe(true);
    }
  });

  it('isTrackableFocusMetric mirrors resolution', () => {
    expect(isTrackableFocusMetric('Fairways Hit %')).toBe(true);
    expect(isTrackableFocusMetric('make_pct_5_10')).toBe(true);
    expect(isTrackableFocusMetric('three_putt_chain')).toBe(false);
    expect(isTrackableFocusMetric(null)).toBe(false);
  });
});
