/**
 * A8 slice 1/3 shared core — `computeEvidenceRevision` must be STABLE against
 * cosmetic regen noise (key order, float jitter, array order) and SENSITIVE
 * to any field that actually changes what a coach approved (confidence,
 * status, the evidence numbers, the window, engine_version).
 */
import { describe, it, expect } from 'vitest';
import {
  computeEvidenceRevision,
  canonicalizeForFingerprint,
  type EvidenceRevisionInput,
} from './evidence-revision';

function baseInput(overrides: Partial<EvidenceRevisionInput> = {}): EvidenceRevisionInput {
  return {
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
    ...overrides,
  };
}

describe('computeEvidenceRevision — stability', () => {
  it('is deterministic for the identical input', () => {
    const a = computeEvidenceRevision(baseInput());
    const b = computeEvidenceRevision(baseInput());
    expect(a).toBe(b);
  });

  it('is a sha256 hex digest', () => {
    const revision = computeEvidenceRevision(baseInput());
    expect(revision).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not change when the caller builds the object with different key order', () => {
    const a = computeEvidenceRevision(baseInput());
    const reordered: EvidenceRevisionInput = {
      engineVersion: 'v3.4.1',
      windowEnd: '2026-09-23T00:00:00.000Z',
      windowStart: '2026-08-24T00:00:00.000Z',
      windowDays: 30,
      sampleN: 42,
      secondaryValue: 1.9,
      comparisonValue: 2.4,
      yourValue: 3.1,
      confidence: 0.72,
      status: 'detected',
    };
    const b = computeEvidenceRevision(reordered);
    expect(a).toBe(b);
  });

  it('does not change on float noise well below meaningful precision', () => {
    const a = computeEvidenceRevision(baseInput({ confidence: 0.7 }));
    const b = computeEvidenceRevision(baseInput({ confidence: 0.7 + 1e-9 }));
    expect(a).toBe(b);
  });

  it('is unaffected by fields that are not part of the input at all (ids/timestamps are simply never passed in)', () => {
    // The caller is responsible for never including id/created_at/updated_at/
    // acknowledged_at/dismissed_at/resolved_at in the input it builds — this
    // test locks in that the SAME logical evidence produces the same
    // revision across two calls a caller might make at different real times,
    // as long as the resolved EvidenceRevisionInput itself is identical.
    const a = computeEvidenceRevision(baseInput());
    const b = computeEvidenceRevision(baseInput());
    expect(a).toBe(b);
  });

  it('null and omitted secondaryValue fingerprint the same way (both normalize to null)', () => {
    const withNull = computeEvidenceRevision(baseInput({ secondaryValue: null }));
    const omitted = computeEvidenceRevision({
      status: 'detected',
      confidence: 0.72,
      yourValue: 3.1,
      comparisonValue: 2.4,
      sampleN: 42,
      windowDays: 30,
      windowStart: '2026-08-24T00:00:00.000Z',
      windowEnd: '2026-09-23T00:00:00.000Z',
      engineVersion: 'v3.4.1',
    });
    expect(withNull).toBe(omitted);
  });
});

describe('computeEvidenceRevision — sensitivity', () => {
  it('changes when confidence changes meaningfully', () => {
    const a = computeEvidenceRevision(baseInput({ confidence: 0.72 }));
    const b = computeEvidenceRevision(baseInput({ confidence: 0.4 }));
    expect(a).not.toBe(b);
  });

  it('changes when status changes (e.g. tentative -> detected promotion)', () => {
    const a = computeEvidenceRevision(baseInput({ status: 'tentative' }));
    const b = computeEvidenceRevision(baseInput({ status: 'detected' }));
    expect(a).not.toBe(b);
  });

  it('changes when your_value changes', () => {
    const a = computeEvidenceRevision(baseInput({ yourValue: 3.1 }));
    const b = computeEvidenceRevision(baseInput({ yourValue: 3.6 }));
    expect(a).not.toBe(b);
  });

  it('changes when comparison_value changes', () => {
    const a = computeEvidenceRevision(baseInput({ comparisonValue: 2.4 }));
    const b = computeEvidenceRevision(baseInput({ comparisonValue: 2.9 }));
    expect(a).not.toBe(b);
  });

  it('changes when secondary_value changes or is added/removed', () => {
    const withValue = computeEvidenceRevision(baseInput({ secondaryValue: 1.9 }));
    const withoutValue = computeEvidenceRevision(baseInput({ secondaryValue: null }));
    const differentValue = computeEvidenceRevision(baseInput({ secondaryValue: 2.2 }));
    expect(withValue).not.toBe(withoutValue);
    expect(withValue).not.toBe(differentValue);
  });

  it('changes when sample_n changes', () => {
    const a = computeEvidenceRevision(baseInput({ sampleN: 42 }));
    const b = computeEvidenceRevision(baseInput({ sampleN: 51 }));
    expect(a).not.toBe(b);
  });

  it('changes when the window (days or start/end) changes', () => {
    const a = computeEvidenceRevision(baseInput());
    const differentDays = computeEvidenceRevision(baseInput({ windowDays: 45 }));
    const differentStart = computeEvidenceRevision(baseInput({ windowStart: '2026-08-01T00:00:00.000Z' }));
    const differentEnd = computeEvidenceRevision(baseInput({ windowEnd: '2026-09-30T00:00:00.000Z' }));
    expect(a).not.toBe(differentDays);
    expect(a).not.toBe(differentStart);
    expect(a).not.toBe(differentEnd);
  });

  it('changes when engine_version changes (a new generator build re-derived this evidence)', () => {
    const a = computeEvidenceRevision(baseInput({ engineVersion: 'v3.4.1' }));
    const b = computeEvidenceRevision(baseInput({ engineVersion: 'v3.5.0' }));
    expect(a).not.toBe(b);
  });

  it('a real, larger confidence swing (e.g. a maturation-triggering regen) changes the revision', () => {
    // Mirrors the maturation-key fingerprint concept in
    // coachhelm-evidence-contract.md:169-174 — a distinct evidence revision
    // is exactly what that system already treats as "not the same regen".
    const detected = computeEvidenceRevision(baseInput({ status: 'detected', confidence: 0.55 }));
    const matured = computeEvidenceRevision(baseInput({ status: 'matured', confidence: 0.81 }));
    expect(detected).not.toBe(matured);
  });
});

describe('canonicalizeForFingerprint', () => {
  it('sorts object keys regardless of insertion order', () => {
    const a = canonicalizeForFingerprint({ b: 1, a: 2, c: 3 });
    const b = canonicalizeForFingerprint({ c: 3, a: 2, b: 1 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('sorts nested object keys', () => {
    const a = canonicalizeForFingerprint({ outer: { z: 1, y: 2 } });
    const b = canonicalizeForFingerprint({ outer: { y: 2, z: 1 } });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('sorts arrays of primitives regardless of original order', () => {
    const a = canonicalizeForFingerprint([3, 1, 2]);
    const b = canonicalizeForFingerprint([1, 2, 3]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('sorts arrays of objects regardless of original order', () => {
    const a = canonicalizeForFingerprint([{ id: 'b' }, { id: 'a' }]);
    const b = canonicalizeForFingerprint([{ id: 'a' }, { id: 'b' }]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('still distinguishes genuinely different arrays', () => {
    const a = canonicalizeForFingerprint([1, 2, 3]);
    const b = canonicalizeForFingerprint([1, 2, 4]);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('leaves primitives and null untouched', () => {
    expect(canonicalizeForFingerprint('x')).toBe('x');
    expect(canonicalizeForFingerprint(5)).toBe(5);
    expect(canonicalizeForFingerprint(null)).toBe(null);
  });
});
