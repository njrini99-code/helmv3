import { describe, it, expect, vi } from 'vitest';
import {
  classifyCommitOutcome,
  verifyDurableOutcome,
  summarizeAttempts,
  compareDurableChildCounts,
  type AttemptRecord,
} from '../commit-outcome';

describe('classifyCommitOutcome', () => {
  it('a clean response with a SQLSTATE is DURABLE_FAILURE — no read-back needed', () => {
    expect(classifyCommitOutcome({ transportError: false, sqlstate: '40P01' })).toBe('DURABLE_FAILURE');
  });

  it('a clean response with no code and no transport error is UNKNOWN_COMMIT (not a success guess)', () => {
    expect(classifyCommitOutcome({ transportError: false, sqlstate: null })).toBe('UNKNOWN_COMMIT');
    expect(classifyCommitOutcome({ transportError: false })).toBe('UNKNOWN_COMMIT');
  });

  it('a timeout with a confirmed read-back is DURABLE_SUCCESS_AFTER_TIMEOUT', () => {
    expect(classifyCommitOutcome({ transportError: true, readBack: 'confirmed' })).toBe(
      'DURABLE_SUCCESS_AFTER_TIMEOUT',
    );
  });

  it('a timeout with a not_found read-back is TRANSPORT_TIMEOUT', () => {
    expect(classifyCommitOutcome({ transportError: true, readBack: 'not_found' })).toBe('TRANSPORT_TIMEOUT');
  });

  it('a timeout with no read-back, or an unknown read-back, is UNKNOWN_COMMIT — never guesses', () => {
    expect(classifyCommitOutcome({ transportError: true })).toBe('UNKNOWN_COMMIT');
    expect(classifyCommitOutcome({ transportError: true, readBack: 'unknown' })).toBe('UNKNOWN_COMMIT');
  });

  it('a SQLSTATE present alongside transportError=true does not override the timeout branch', () => {
    // The client never got a clean response, so an incidentally-set sqlstate
    // field must not be trusted as if it came from a real response.
    expect(classifyCommitOutcome({ transportError: true, sqlstate: '42501', readBack: 'not_found' })).toBe(
      'TRANSPORT_TIMEOUT',
    );
  });

  it('never throws on a malformed input', () => {
    expect(() => classifyCommitOutcome({} as never)).not.toThrow();
  });
});

describe('verifyDurableOutcome', () => {
  it('resolves confirmed when the read-back function finds the row', async () => {
    await expect(verifyDurableOutcome(() => Promise.resolve(true))).resolves.toBe('confirmed');
  });

  it('resolves not_found when the read-back function does not find the row', async () => {
    await expect(verifyDurableOutcome(() => Promise.resolve(false))).resolves.toBe('not_found');
  });

  it('resolves unknown when the read-back function throws', async () => {
    await expect(verifyDurableOutcome(() => Promise.reject(new Error('db down')))).resolves.toBe('unknown');
  });

  it('resolves unknown when the read-back function never settles before the timeout', async () => {
    vi.useFakeTimers();
    try {
      const never = new Promise<boolean>(() => {});
      const outcome = verifyDurableOutcome(() => never, { timeoutMs: 50 });
      await vi.advanceTimersByTimeAsync(60);
      await expect(outcome).resolves.toBe('unknown');
    } finally {
      vi.useRealTimers();
    }
  });

  it('never rejects even when given a synchronously-throwing function', async () => {
    const thrower = (): Promise<boolean> => {
      throw new Error('sync throw');
    };
    await expect(verifyDurableOutcome(thrower)).resolves.toBe('unknown');
  });
});

function attempt(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    fingerprint: 'supabase|postgres|round_tracking|rpc|save_partial_round_atomic|57014',
    occurredAt: '2026-09-03T12:00:00.000Z',
    attemptNumber: 1,
    success: false,
    terminal: false,
    ...overrides,
  };
}

describe('summarizeAttempts', () => {
  it('counts a single successful first attempt as final_success only', () => {
    const summary = summarizeAttempts([attempt({ success: true, terminal: true })]);
    expect(summary).toMatchObject({
      attemptFailureCount: 0,
      retryCount: 0,
      finalSuccessCount: 1,
      terminalFailureCount: 0,
      retryStorm: false,
    });
  });

  it('counts a failed, then retried, then succeeded sequence correctly', () => {
    const attempts = [
      attempt({ attemptNumber: 1, success: false, terminal: false, occurredAt: '2026-09-03T12:00:00.000Z' }),
      attempt({ attemptNumber: 2, success: true, terminal: true, occurredAt: '2026-09-03T12:00:01.000Z' }),
    ];
    const summary = summarizeAttempts(attempts);
    expect(summary.attemptFailureCount).toBe(1);
    expect(summary.retryCount).toBe(1); // only the second attempt is a retry
    expect(summary.finalSuccessCount).toBe(1);
    expect(summary.terminalFailureCount).toBe(0);
  });

  it('counts a fully exhausted retry budget as terminal_failure, not final_success', () => {
    const attempts = [
      attempt({ attemptNumber: 1, success: false, terminal: false }),
      attempt({ attemptNumber: 2, success: false, terminal: false }),
      attempt({ attemptNumber: 3, success: false, terminal: true }),
    ];
    const summary = summarizeAttempts(attempts);
    expect(summary.attemptFailureCount).toBe(3);
    expect(summary.retryCount).toBe(2);
    expect(summary.finalSuccessCount).toBe(0);
    expect(summary.terminalFailureCount).toBe(1);
  });

  it('flags a retry storm: >= 5 attempts within 60s on one fingerprint', () => {
    const fp = 'supabase|postgrest|round_tracking|select|golf_rounds|PGRST003';
    const attempts = Array.from({ length: 5 }, (_, i) =>
      attempt({
        fingerprint: fp,
        attemptNumber: i + 1,
        occurredAt: new Date(Date.parse('2026-09-03T12:00:00.000Z') + i * 5_000).toISOString(),
        terminal: i === 4,
      }),
    );
    const summary = summarizeAttempts(attempts);
    expect(summary.retryStorm).toBe(true);
    expect(summary.retryStormFingerprints).toEqual([fp]);
  });

  it('does NOT flag a retry storm when 5 attempts are spread beyond the 60s window', () => {
    const fp = 'supabase|postgrest|round_tracking|select|golf_rounds|PGRST003';
    const attempts = Array.from({ length: 5 }, (_, i) =>
      attempt({
        fingerprint: fp,
        attemptNumber: i + 1,
        occurredAt: new Date(Date.parse('2026-09-03T12:00:00.000Z') + i * 20_000).toISOString(),
      }),
    );
    const summary = summarizeAttempts(attempts);
    expect(summary.retryStorm).toBe(false);
    expect(summary.retryStormFingerprints).toEqual([]);
  });

  it('evaluates the storm window PER fingerprint — one noisy mechanism does not flag another', () => {
    const noisy = 'supabase|postgrest|a|select|t|PGRST003';
    const quiet = 'supabase|postgrest|b|select|t|PGRST003';
    const attempts = [
      ...Array.from({ length: 5 }, (_, i) =>
        attempt({ fingerprint: noisy, attemptNumber: i + 1, occurredAt: `2026-09-03T12:00:0${i}.000Z` }),
      ),
      attempt({ fingerprint: quiet, attemptNumber: 1, occurredAt: '2026-09-03T12:00:00.000Z' }),
    ];
    const summary = summarizeAttempts(attempts);
    expect(summary.retryStormFingerprints).toEqual([noisy]);
  });

  it('never throws on an empty or malformed attempt list', () => {
    expect(() => summarizeAttempts([])).not.toThrow();
    expect(() => summarizeAttempts([{ occurredAt: 'not-a-date' } as never])).not.toThrow();
    const summary = summarizeAttempts([{ occurredAt: 'not-a-date' } as never]);
    expect(summary.retryStorm).toBe(false);
  });
});

describe('compareDurableChildCounts', () => {
  it('flags a shrink with no declared edit intent', () => {
    const result = compareDurableChildCounts({ expected: 18, durable: 12, isEdit: false });
    expect(result.shrank).toBe(true);
    expect(result.flagged).toBe(true);
    expect(result.delta).toBe(-6);
  });

  it('does NOT flag the same shrink when the caller declares it a deliberate edit', () => {
    const result = compareDurableChildCounts({ expected: 18, durable: 12, isEdit: true });
    expect(result.shrank).toBe(true);
    expect(result.flagged).toBe(false);
  });

  it('does not flag a growth (more durable children than expected)', () => {
    const result = compareDurableChildCounts({ expected: 12, durable: 18, isEdit: false });
    expect(result.shrank).toBe(false);
    expect(result.flagged).toBe(false);
    expect(result.delta).toBe(6);
  });

  it('does not flag an exact match', () => {
    const result = compareDurableChildCounts({ expected: 18, durable: 18, isEdit: false });
    expect(result.shrank).toBe(false);
    expect(result.flagged).toBe(false);
  });

  it('degrades a non-finite input toward suspicion rather than throwing', () => {
    expect(() => compareDurableChildCounts({ expected: NaN, durable: 12, isEdit: false })).not.toThrow();
  });
});
