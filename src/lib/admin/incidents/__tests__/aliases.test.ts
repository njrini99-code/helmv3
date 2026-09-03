import { describe, it, expect } from 'vitest';
import {
  classifyMergeConfidence,
  groupIntoRootIncidents,
  DEFAULT_TIGHT_WINDOW_MS,
  type MergeCandidateFacts,
} from '../aliases';

function fact(id: string, overrides: Partial<MergeCandidateFacts> = {}): MergeCandidateFacts {
  return {
    id,
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
    occurredAt: '2026-09-01T12:00:00.000Z',
    source: null,
    userId: null,
    message: '',
    ...overrides,
  };
}

describe('classifyMergeConfidence — highest tier', () => {
  it('same Helm trace id -> highest, even with nothing else in common', () => {
    const a = fact('a', { helmTraceId: 'trace-1', featureId: 'golf', occurredAt: '2026-09-01T00:00:00Z' });
    const b = fact('b', { helmTraceId: 'trace-1', featureId: 'baseball', occurredAt: '2026-09-05T00:00:00Z' });
    const d = classifyMergeConfidence(a, b);
    expect(d.tier).toBe('highest');
    expect(d.matchedOn).toEqual(['helmTraceId']);
  });

  it('same Sentry trace id -> highest', () => {
    const a = fact('a', { sentryTraceId: 'sentry-trace-1' });
    const b = fact('b', { sentryTraceId: 'sentry-trace-1' });
    expect(classifyMergeConfidence(a, b).tier).toBe('highest');
  });

  it('same Flight Recorder run -> highest', () => {
    const a = fact('a', { flightRecorderRunId: 'run-1' });
    const b = fact('b', { flightRecorderRunId: 'run-1' });
    expect(classifyMergeConfidence(a, b).tier).toBe('highest');
  });

  it('same canonical fingerprint -> highest', () => {
    const a = fact('a', { canonicalFingerprint: 'fp-1' });
    const b = fact('b', { canonicalFingerprint: 'fp-1' });
    expect(classifyMergeConfidence(a, b).tier).toBe('highest');
  });

  it('same RPC + code + feature (all three) -> highest', () => {
    const a = fact('a', { rpc: 'submit_round_atomic', errorCode: '42501', featureId: 'round_tracking' });
    const b = fact('b', { rpc: 'submit_round_atomic', errorCode: '42501', featureId: 'round_tracking' });
    const d = classifyMergeConfidence(a, b);
    expect(d.tier).toBe('highest');
    expect(d.matchedOn).toEqual(['rpc', 'errorCode', 'featureId']);
  });

  it('RPC + code but DIFFERENT feature does not reach highest via that rule', () => {
    const a = fact('a', { rpc: 'submit_round_atomic', errorCode: '42501', featureId: 'round_tracking' });
    const b = fact('b', { rpc: 'submit_round_atomic', errorCode: '42501', featureId: 'stats_analytics' });
    expect(classifyMergeConfidence(a, b).tier).toBe('none');
  });

  it('null identity fields never count as a match against each other', () => {
    const a = fact('a', { helmTraceId: null });
    const b = fact('b', { helmTraceId: null });
    expect(classifyMergeConfidence(a, b).tier).toBe('none');
  });
});

describe('classifyMergeConfidence — medium tier', () => {
  const baseA: Partial<MergeCandidateFacts> = {
    featureId: 'round_tracking',
    operation: 'savePartialRound',
    normalizedTopFrames: 'golf.ts:6219|withAdminObserved',
    errorCode: '42501',
    releaseCohort: '8e4c5b7d',
    occurredAt: '2026-09-01T12:00:00.000Z',
  };

  it('all six dimensions aligned, within the tight window -> medium', () => {
    const a = fact('a', baseA);
    const b = fact('b', { ...baseA, occurredAt: '2026-09-01T12:05:00.000Z' });
    const d = classifyMergeConfidence(a, b);
    expect(d.tier).toBe('medium');
    expect(d.matchedOn).toContain('window');
  });

  it('outside the tight window -> none, even with every other dimension aligned', () => {
    const a = fact('a', baseA);
    const b = fact('b', { ...baseA, occurredAt: '2026-09-01T13:00:00.000Z' }); // 1h later
    expect(classifyMergeConfidence(a, b).tier).toBe('none');
  });

  it('exactly at the boundary is still within window (inclusive)', () => {
    const a = fact('a', { ...baseA, occurredAt: '2026-09-01T12:00:00.000Z' });
    const b = fact('b', { ...baseA, occurredAt: new Date(Date.parse(a.occurredAt) + DEFAULT_TIGHT_WINDOW_MS).toISOString() });
    expect(classifyMergeConfidence(a, b).tier).toBe('medium');
  });

  it('one dimension short (different release) -> none, medium requires ALL six', () => {
    const a = fact('a', baseA);
    const b = fact('b', { ...baseA, releaseCohort: 'different-sha' });
    expect(classifyMergeConfidence(a, b).tier).toBe('none');
  });

  it('different normalized frames alone breaks medium', () => {
    const a = fact('a', baseA);
    const b = fact('b', { ...baseA, normalizedTopFrames: 'other.ts:1|other' });
    expect(classifyMergeConfidence(a, b).tier).toBe('none');
  });

  it('a custom tight window widens or narrows the boundary', () => {
    const a = fact('a', baseA);
    const b = fact('b', { ...baseA, occurredAt: '2026-09-01T12:20:00.000Z' }); // 20 minutes later
    expect(classifyMergeConfidence(a, b, { tightWindowMs: 15 * 60_000 }).tier).toBe('none');
    expect(classifyMergeConfidence(a, b, { tightWindowMs: 30 * 60_000 }).tier).toBe('medium');
  });
});

describe('classifyMergeConfidence — never-merge rules (brief §8, explicit)', () => {
  it('never merges solely on a similar message string', () => {
    const a = fact('a', { message: 'Client error: Load failed' });
    const b = fact('b', { message: 'Client error: Load failed' });
    expect(classifyMergeConfidence(a, b).tier).toBe('none');
  });

  it('never merges solely on the same time', () => {
    const a = fact('a', { occurredAt: '2026-09-01T12:00:00.000Z' });
    const b = fact('b', { occurredAt: '2026-09-01T12:00:00.000Z' });
    expect(classifyMergeConfidence(a, b).tier).toBe('none');
  });

  it('never merges solely on both being from Supabase', () => {
    const a = fact('a', { source: 'supabase' });
    const b = fact('b', { source: 'supabase' });
    expect(classifyMergeConfidence(a, b).tier).toBe('none');
  });

  it('never merges solely on both being "fetch failed"', () => {
    const a = fact('a', { message: 'TypeError: fetch failed' });
    const b = fact('b', { message: 'TypeError: fetch failed' });
    expect(classifyMergeConfidence(a, b).tier).toBe('none');
  });

  it('never merges solely on the same user', () => {
    const a = fact('a', { userId: 'user-1' });
    const b = fact('b', { userId: 'user-1' });
    expect(classifyMergeConfidence(a, b).tier).toBe('none');
  });

  it('a pile-up of every weak signal at once STILL never merges without a real dimension', () => {
    const a = fact('a', {
      message: 'TypeError: fetch failed',
      occurredAt: '2026-09-01T12:00:00.000Z',
      source: 'supabase',
      userId: 'user-1',
    });
    const b = fact('b', {
      message: 'TypeError: fetch failed',
      occurredAt: '2026-09-01T12:00:00.000Z',
      source: 'supabase',
      userId: 'user-1',
    });
    expect(classifyMergeConfidence(a, b).tier).toBe('none');
  });
});

describe('groupIntoRootIncidents', () => {
  it('groups nothing when no pair reaches even the medium tier', () => {
    const groups = groupIntoRootIncidents([fact('a'), fact('b'), fact('c')]);
    expect(groups).toHaveLength(3);
    expect(groups.every((g) => g.aliases.length === 0)).toBe(true);
  });

  it('a direct highest-tier match groups two candidates under the earliest as root', () => {
    const later = fact('b', { canonicalFingerprint: 'fp-1', occurredAt: '2026-09-05T00:00:00Z' });
    const earlier = fact('a', { canonicalFingerprint: 'fp-1', occurredAt: '2026-09-01T00:00:00Z' });
    const groups = groupIntoRootIncidents([later, earlier]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.rootId).toBe('a');
    expect(groups[0]!.aliases.map((al) => al.id)).toEqual(['b']);
    expect(groups[0]!.aliases[0]!.tier).toBe('highest');
    expect(groups[0]!.memberIds).toEqual(['a', 'b']);
  });

  it('transitivity: a~b via trace id, b~c via a different fingerprint -> one root incident with two aliases', () => {
    const a = fact('a', { helmTraceId: 'trace-1', occurredAt: '2026-09-01T00:00:00Z' });
    const b = fact('b', { helmTraceId: 'trace-1', canonicalFingerprint: 'fp-shared', occurredAt: '2026-09-01T00:05:00Z' });
    const c = fact('c', { canonicalFingerprint: 'fp-shared', occurredAt: '2026-09-01T00:10:00Z' });
    // a and c share NOTHING directly.
    expect(classifyMergeConfidence(a, c).tier).toBe('none');

    const groups = groupIntoRootIncidents([a, b, c]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.rootId).toBe('a');
    expect(new Set(groups[0]!.memberIds)).toEqual(new Set(['a', 'b', 'c']));
  });

  it('two unrelated fingerprint pairs form two separate root incidents', () => {
    const a1 = fact('a1', { canonicalFingerprint: 'fp-A', occurredAt: '2026-09-01T00:00:00Z' });
    const a2 = fact('a2', { canonicalFingerprint: 'fp-A', occurredAt: '2026-09-01T00:05:00Z' });
    const b1 = fact('b1', { canonicalFingerprint: 'fp-B', occurredAt: '2026-09-02T00:00:00Z' });
    const b2 = fact('b2', { canonicalFingerprint: 'fp-B', occurredAt: '2026-09-02T00:05:00Z' });
    const groups = groupIntoRootIncidents([a1, b1, a2, b2]);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.rootId).toBe('a1');
    expect(groups[1]!.rootId).toBe('b1');
  });

  it('never-merge fixtures never end up grouped, even alongside real matches', () => {
    const realA = fact('real-a', { canonicalFingerprint: 'fp-real', occurredAt: '2026-09-01T00:00:00Z' });
    const realB = fact('real-b', { canonicalFingerprint: 'fp-real', occurredAt: '2026-09-01T00:05:00Z' });
    const weak1 = fact('weak-1', { message: 'TypeError: fetch failed', source: 'supabase', occurredAt: '2026-09-01T00:00:00Z' });
    const weak2 = fact('weak-2', { message: 'TypeError: fetch failed', source: 'supabase', occurredAt: '2026-09-01T00:00:00Z' });
    const groups = groupIntoRootIncidents([realA, realB, weak1, weak2]);
    expect(groups).toHaveLength(3);
    const singleton = groups.find((g) => g.memberIds.length === 1 && g.rootId === 'weak-1');
    expect(singleton).toBeDefined();
  });
});
