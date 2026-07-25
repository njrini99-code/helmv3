import { describe, it, expect, vi, beforeEach } from 'vitest';
import { claimForExecution, recordOutcome, recordDenial } from '@/lib/coachhelm/v3/chat/action-runs';
import type { ActionReceipt } from '@/lib/coachhelm/v3/chat/action-types';

/**
 * The failure this guards against, concretely:
 *
 *   coach confirms → eight practices are created → the response is lost →
 *   the client retries → eight MORE practices are created.
 *
 * Claiming a run before executing turns that retry into a read of the first
 * run's receipt. These tests pin each branch of the claim.
 */

const receipt: ActionReceipt = {
  status: 'completed',
  action: 'Create a recurring practice',
  summary: '8 practices created.',
  created: [{ kind: 'practice', count: 8 }],
  notifications: [],
  partial_failures: [],
  retryable: false,
  at: '2026-07-25T12:00:00Z',
};

/** Supabase double whose UPDATE honours the `.in(status, [...])` guard. */
function makeSb(row: { id: string; status: string; result: ActionReceipt | null } | null) {
  const updateGuard = { statuses: [] as string[], applied: false };

  const chain = () => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'update', 'upsert']) c[m] = vi.fn(() => c);
    c.in = vi.fn((_col: string, values: string[]) => {
      updateGuard.statuses = values;
      return c;
    });
    c.maybeSingle = vi.fn(async () => {
      // A read before any update returns the current row.
      if (updateGuard.statuses.length === 0) return { data: row, error: null };
      // The conditional update only matches when the row's status is allowed.
      const allowed = row !== null && updateGuard.statuses.includes(row.status);
      updateGuard.applied = allowed;
      return { data: allowed ? { id: row!.id } : null, error: null };
    });
    return c;
  };

  return { sb: { from: vi.fn(() => chain()) } as never, updateGuard };
}

describe('claimForExecution', () => {
  beforeEach(() => vi.clearAllMocks());

  it('claims a fresh proposal', async () => {
    const { sb } = makeSb({ id: 'run-1', status: 'proposed', result: null });
    const claim = await claimForExecution(sb, { coach_id: 'c1', idempotency_key: 'k1' });
    expect(claim).toEqual({ kind: 'claimed', run_id: 'run-1' });
  });

  it('returns the ORIGINAL receipt instead of executing again', async () => {
    // This is the lost-response retry. Nothing new may be created.
    const { sb } = makeSb({ id: 'run-1', status: 'completed', result: receipt });
    const claim = await claimForExecution(sb, { coach_id: 'c1', idempotency_key: 'k1' });
    expect(claim).toEqual({ kind: 'already_completed', receipt });
  });

  it('refuses to start a second execution while one is in flight', async () => {
    // Two concurrent confirmations race on the database, and the loser backs
    // off rather than creating a duplicate series.
    const { sb } = makeSb({ id: 'run-1', status: 'approved', result: null });
    const claim = await claimForExecution(sb, { coach_id: 'c1', idempotency_key: 'k1' });
    expect(claim).toEqual({ kind: 'in_flight' });
  });

  it('lets a failed run be retried — it wrote nothing worth protecting', async () => {
    const { sb } = makeSb({ id: 'run-1', status: 'failed', result: null });
    const claim = await claimForExecution(sb, { coach_id: 'c1', idempotency_key: 'k1' });
    expect(claim).toEqual({ kind: 'claimed', run_id: 'run-1' });
  });

  it('errors rather than executing when no proposal was ever recorded', async () => {
    // No ledger row means no audit trail and no idempotency guarantee, so this
    // must not fall through into a write.
    const { sb } = makeSb(null);
    const claim = await claimForExecution(sb, { coach_id: 'c1', idempotency_key: 'k1' });
    expect(claim.kind).toBe('error');
  });

  it('only ever claims from a re-claimable status', async () => {
    const { sb, updateGuard } = makeSb({ id: 'run-1', status: 'proposed', result: null });
    await claimForExecution(sb, { coach_id: 'c1', idempotency_key: 'k1' });
    expect(updateGuard.statuses).toEqual(['proposed', 'denied', 'failed']);
    expect(updateGuard.statuses).not.toContain('approved');
    expect(updateGuard.statuses).not.toContain('completed');
  });
});

describe('recordOutcome', () => {
  it('stores the receipt so a later retry can return it verbatim', async () => {
    const captured: Record<string, unknown>[] = [];
    const sb = {
      from: vi.fn(() => {
        const c: Record<string, unknown> = {};
        c.update = vi.fn((payload: Record<string, unknown>) => {
          captured.push(payload);
          return c;
        });
        c.eq = vi.fn(() => c);
        c.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(r);
        return c;
      }),
    } as never;

    await recordOutcome(sb, { run_id: 'run-1', receipt });
    expect(captured[0]?.status).toBe('completed');
    expect(captured[0]?.result).toEqual(receipt);
  });

  it('marks a failed receipt as failed, so the run stays re-claimable', async () => {
    const captured: Record<string, unknown>[] = [];
    const sb = {
      from: vi.fn(() => {
        const c: Record<string, unknown> = {};
        c.update = vi.fn((payload: Record<string, unknown>) => {
          captured.push(payload);
          return c;
        });
        c.eq = vi.fn(() => c);
        c.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(r);
        return c;
      }),
    } as never;

    await recordOutcome(sb, {
      run_id: 'run-1',
      receipt: { ...receipt, status: 'failed', error: 'calendar rejected it', retryable: true },
    });
    expect(captured[0]?.status).toBe('failed');
    expect(captured[0]?.error_message).toBe('calendar rejected it');
  });
});

describe('recordDenial', () => {
  it('records the decline as evidence rather than discarding it', async () => {
    const captured: Record<string, unknown>[] = [];
    const sb = {
      from: vi.fn(() => {
        const c: Record<string, unknown> = {};
        c.update = vi.fn((payload: Record<string, unknown>) => {
          captured.push(payload);
          return c;
        });
        c.eq = vi.fn(() => c);
        c.in = vi.fn(() => c);
        c.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(r);
        return c;
      }),
    } as never;

    await recordDenial(sb, { coach_id: 'c1', idempotency_key: 'k1' });
    expect(captured[0]?.status).toBe('denied');
    expect(captured[0]?.decided_at).toBeTruthy();
  });
});
