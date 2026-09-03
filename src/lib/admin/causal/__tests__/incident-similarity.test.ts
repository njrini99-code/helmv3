import { describe, it, expect } from 'vitest';
import { findSimilarIncidents } from '../incident-similarity';
import type { MergeCandidateFacts } from '@/lib/admin/incidents/aliases';

function facts(overrides: Partial<MergeCandidateFacts> & { id: string }): MergeCandidateFacts {
  return {
    helmTraceId: null,
    sentryTraceId: null,
    flightRecorderRunId: null,
    canonicalFingerprint: null,
    rpc: null,
    errorCode: null,
    featureId: null,
    operation: null,
    normalizedTopFrames: null,
    releaseCohort: null,
    occurredAt: '2026-09-01T00:00:00Z',
    source: null,
    userId: null,
    message: '',
    ...overrides,
  };
}

describe('findSimilarIncidents', () => {
  it('returns no matches when the corpus has nothing structurally similar', () => {
    const target = facts({ id: 'target', canonicalFingerprint: 'fp-a' });
    const corpus = [facts({ id: 'other', canonicalFingerprint: 'fp-b' })];
    expect(findSimilarIncidents(target, corpus)).toEqual([]);
  });

  it('finds a highest-tier match via shared canonical fingerprint', () => {
    const target = facts({ id: 'target', canonicalFingerprint: 'fp-a' });
    const match = facts({ id: 'match', canonicalFingerprint: 'fp-a' });
    const result = findSimilarIncidents(target, [match]);
    expect(result).toHaveLength(1);
    expect(result[0]!.candidate.id).toBe('match');
    expect(result[0]!.tier).toBe('highest');
  });

  it('excludes the target from its own corpus by id', () => {
    const target = facts({ id: 'target', canonicalFingerprint: 'fp-a' });
    const result = findSimilarIncidents(target, [target]);
    expect(result).toEqual([]);
  });

  it('ranks highest-tier matches before medium-tier matches', () => {
    const target = facts({
      id: 'target',
      featureId: 'golf_round_lifecycle',
      operation: 'save_round',
      normalizedTopFrames: 'frame-a',
      errorCode: 'E1',
      releaseCohort: 'sha-1',
      occurredAt: '2026-09-01T00:00:00Z',
    });
    const mediumMatch = facts({
      id: 'medium',
      featureId: 'golf_round_lifecycle',
      operation: 'save_round',
      normalizedTopFrames: 'frame-a',
      errorCode: 'E1',
      releaseCohort: 'sha-1',
      occurredAt: '2026-09-01T00:05:00Z',
    });
    const highestMatch = facts({ id: 'highest', canonicalFingerprint: 'fp-shared' });
    const targetWithFp = { ...target, canonicalFingerprint: 'fp-shared' };

    const result = findSimilarIncidents(targetWithFp, [mediumMatch, highestMatch]);
    expect(result.map((r) => r.candidate.id)).toEqual(['highest', 'medium']);
  });

  it('never reads message/source/userId to produce a match (aliases.ts never-merge rule holds through this wrapper)', () => {
    const target = facts({ id: 'target', message: 'Null pointer exception', source: 'sentry', userId: 'user-1' });
    const sameMessageOnly = facts({ id: 'same-message', message: 'Null pointer exception', source: 'sentry', userId: 'user-1' });
    expect(findSimilarIncidents(target, [sameMessageOnly])).toEqual([]);
  });

  it('is deterministic — same input order produces the same output order', () => {
    const target = facts({ id: 'target', canonicalFingerprint: 'fp-a' });
    const corpus = [
      facts({ id: 'a', canonicalFingerprint: 'fp-a' }),
      facts({ id: 'b', canonicalFingerprint: 'fp-a' }),
    ];
    const result1 = findSimilarIncidents(target, corpus).map((r) => r.candidate.id);
    const result2 = findSimilarIncidents(target, corpus).map((r) => r.candidate.id);
    expect(result1).toEqual(result2);
    expect(result1).toEqual(['a', 'b']);
  });
});
