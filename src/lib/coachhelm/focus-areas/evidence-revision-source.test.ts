/**
 * A8 slice 1 — `buildEvidenceRevisionInput`/`computeInsightEvidenceRevision`
 * must degrade to `null` for any row shape the fingerprint can't safely
 * consume, and must correctly bridge a real `golf_coach_insights`-shaped row
 * into `computeEvidenceRevision`'s input otherwise.
 */
import { describe, it, expect } from 'vitest';
import {
  buildEvidenceRevisionInput,
  computeInsightEvidenceRevision,
  type InsightEvidenceSourceRow,
} from './evidence-revision-source';
import { computeEvidenceRevision } from './evidence-revision';

function row(overrides: Partial<InsightEvidenceSourceRow> = {}): InsightEvidenceSourceRow {
  return {
    lifecycle_state: 'detected',
    evidence: {
      confidence: 0.72,
      your_value: 3.1,
      comparison_value: 2.4,
      secondary_value: 1.9,
      sample_n: 42,
      window_days: 30,
      window_start: '2026-08-24T00:00:00.000Z',
      window_end: '2026-09-23T00:00:00.000Z',
    },
    engine_version: 'v3.4.1',
    ...overrides,
  };
}

describe('buildEvidenceRevisionInput', () => {
  it('maps a well-formed row to the full EvidenceRevisionInput shape', () => {
    const input = buildEvidenceRevisionInput(row());
    expect(input).toEqual({
      status: 'detected',
      confidence: 0.72,
      yourValue: 3.1,
      comparisonValue: 2.4,
      secondaryValue: 1.9,
      sampleN: 42,
      windowDays: 30,
      windowStart: '2026-08-24T00:00:00.000Z',
      windowEnd: '2026-09-23T00:00:00.000Z',
      engineVersion: 'v3.4.1',
    });
  });

  it('maps a missing secondary_value to null, not undefined or a throw', () => {
    const evidence = { ...(row().evidence as Record<string, unknown>) };
    delete evidence.secondary_value;
    const input = buildEvidenceRevisionInput(row({ evidence }));
    expect(input?.secondaryValue).toBeNull();
  });

  it('returns null when lifecycle_state is null', () => {
    expect(buildEvidenceRevisionInput(row({ lifecycle_state: null }))).toBeNull();
  });

  it('returns null when evidence is null', () => {
    expect(buildEvidenceRevisionInput(row({ evidence: null }))).toBeNull();
  });

  it('returns null when evidence is not an object (legacy/malformed row)', () => {
    expect(buildEvidenceRevisionInput(row({ evidence: 'not-json' }))).toBeNull();
    expect(buildEvidenceRevisionInput(row({ evidence: 42 }))).toBeNull();
  });

  it('returns null when evidence is an array', () => {
    expect(buildEvidenceRevisionInput(row({ evidence: [1, 2, 3] }))).toBeNull();
  });

  it('returns null when a required numeric field is missing', () => {
    const evidence = { ...(row().evidence as Record<string, unknown>) };
    delete evidence.confidence;
    expect(buildEvidenceRevisionInput(row({ evidence }))).toBeNull();
  });

  it('returns null when a required numeric field is not finite (NaN/Infinity)', () => {
    const evidence = { ...(row().evidence as Record<string, unknown>), sample_n: Number.NaN };
    expect(buildEvidenceRevisionInput(row({ evidence }))).toBeNull();
  });

  it('returns null when a required string field (window_start/window_end) is missing', () => {
    const evidence = { ...(row().evidence as Record<string, unknown>) };
    delete evidence.window_end;
    expect(buildEvidenceRevisionInput(row({ evidence }))).toBeNull();
  });

  it('passes through a null engine_version rather than rejecting the row', () => {
    const input = buildEvidenceRevisionInput(row({ engine_version: null }));
    expect(input?.engineVersion).toBeNull();
  });
});

describe('computeInsightEvidenceRevision', () => {
  it('produces the same fingerprint computeEvidenceRevision would for the equivalent input', () => {
    const viaSource = computeInsightEvidenceRevision(row());
    const direct = computeEvidenceRevision({
      status: 'detected',
      confidence: 0.72,
      yourValue: 3.1,
      comparisonValue: 2.4,
      secondaryValue: 1.9,
      sampleN: 42,
      windowDays: 30,
      windowStart: '2026-08-24T00:00:00.000Z',
      windowEnd: '2026-09-23T00:00:00.000Z',
      engineVersion: 'v3.4.1',
    });
    expect(viaSource).toBe(direct);
  });

  it('returns null (not a throw) for a malformed row', () => {
    expect(computeInsightEvidenceRevision(row({ evidence: null }))).toBeNull();
  });
});
