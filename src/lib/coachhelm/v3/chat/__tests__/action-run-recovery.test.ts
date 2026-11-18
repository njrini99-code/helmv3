import { describe, expect, it } from 'vitest';
import { APPROVED_RUN_TTL_MS, claimForExecution, recordOutcome } from '../action-runs';
import { receiptFor } from '../undo-hold';
import type { ActionReceipt } from '../action-types';

const failed = (extra: Partial<ActionReceipt> = {}): ActionReceipt => ({ status: 'failed', action: 'create_event', summary: 'Not saved.', created: [], notifications: [], partial_failures: [], retryable: true, at: new Date().toISOString(), ...extra });

function ledger(over: Record<string, unknown> = {}, options: { missingHold?: boolean; outcomeError?: boolean } = {}) {
  const row = { id: 'r', status: 'held', result: null, run_at: '2026-11-01T00:00:00.000Z', ...over };
  const sb = {
    from: () => {
      let columns = '';
      let patch: Record<string, unknown> | undefined;
      const filters: Array<() => boolean> = [];
      const run = () => {
        if (options.missingHold && columns.includes('run_at')) return { data: null, error: { code: '42703' } };
        if (patch && options.outcomeError) return { data: null, error: { code: '57014' } };
        if (!filters.every((f) => f())) return { data: null, error: null };
        if (patch) Object.assign(row, patch);
        return { data: { ...row }, error: null };
      };
      const chain = {
        select: (c: string) => { columns = c; return chain; },
        update: (p: Record<string, unknown>) => { patch = p; return chain; },
        eq: (k: string, value: unknown) => { if (k === 'status') filters.push(() => row.status === value); return chain; },
        lt: () => chain,
        in: (_k: string, values: unknown[]) => { filters.push(() => values.includes(row.status)); return chain; },
        maybeSingle: async () => run(),
        then: (ok: (v: unknown) => unknown) => Promise.resolve(run()).then(ok),
      };
      return chain;
    },
  } as never;
  return { sb, row };
}

describe('durable action receipt recovery', () => {
  const args = { coach_id: 'c', idempotency_key: 'k' };

  it('reads an immediate completed receipt when HM1 is absent', async () => {
    const receipt = failed({ status: 'completed', retryable: false });
    const { sb } = ledger({ status: 'completed', result: receipt }, { missingHold: true });
    expect(await receiptFor(sb, args)).toEqual({ status: 'completed', receipt, run_at: null });
  });

  it('returns cancelled durably without a stale deadline or fake receipt', async () => {
    const { sb } = ledger({ status: 'cancelled' });
    expect(await receiptFor(sb, args)).toEqual({ status: 'cancelled', receipt: null, run_at: null });
    expect(await claimForExecution(sb, args)).toMatchObject({ kind: 'error', message: expect.stringMatching(/undone/) });
  });

  it('polling a stale in-flight run records a failure instead of spinning forever or executing again', async () => {
    const { sb, row } = ledger({ status: 'approved', decided_at: new Date(Date.now() - APPROVED_RUN_TTL_MS - 1000).toISOString() });
    expect(await receiptFor(sb, args)).toMatchObject({ status: 'failed', receipt: { status: 'failed', retryable: false }, run_at: null });
    expect(row.status).toBe('failed');
    expect(await claimForExecution(sb, args)).toMatchObject({ kind: 'error' });
  });

  it('synthesizes an honest receipt for a legacy failure with no result', async () => {
    const { sb } = ledger({ status: 'failed', error_message: 'Interrupted', tool_name: 'create_task' });
    expect(await receiptFor(sb, args)).toMatchObject({ status: 'failed', receipt: { status: 'failed', action: 'create_task', retryable: false, summary: 'Interrupted' } });
  });

  it('allows a true no-write failure to retry, but blocks a non-retryable failure', async () => {
    expect(await claimForExecution(ledger({ status: 'failed', result: failed() }).sb, args)).toMatchObject({ kind: 'claimed' });
    expect(await claimForExecution(ledger({ status: 'failed', result: failed({ retryable: false }) }).sb, args)).toMatchObject({ kind: 'error' });
  });

  it('prevents a failed receipt with real rows from creating duplicates even if the caller allowed retry', async () => {
    const { sb, row } = ledger({ status: 'approved' });
    await recordOutcome(sb, { run_id: 'r', receipt: failed({ created: [{ kind: 'task', count: 1, href: '/golf/dashboard/tasks' }], error: 'Assignments failed' }) });
    expect(row.status).toBe('failed');
    expect(row.result).toMatchObject({ status: 'failed', retryable: false, created: [{ kind: 'task', count: 1, href: '/golf/dashboard/tasks' }] });
    expect(await claimForExecution(sb, args)).toMatchObject({ kind: 'error' });
  });

  it('replays the existing partial receipt on duplicate approval', async () => {
    const { sb, row } = ledger({ status: 'approved' });
    await recordOutcome(sb, { run_id: 'r', receipt: failed({ status: 'partial', retryable: false, created: [{ kind: 'task', count: 1 }], partial_failures: ['Assignments failed'] }) });
    expect(row.status).toBe('completed');
    expect(await claimForExecution(sb, args)).toMatchObject({ kind: 'already_completed', receipt: { status: 'partial', retryable: false } });
  });

  it('does not silently report a receipt as durable when its ledger update failed', async () => {
    const { sb } = ledger({ status: 'approved' }, { outcomeError: true });
    await expect(recordOutcome(sb, { run_id: 'r', receipt: failed() })).rejects.toThrow(/save the action receipt/);
  });
});
