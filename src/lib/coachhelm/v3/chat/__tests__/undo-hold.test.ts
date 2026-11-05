import { describe, expect, it, vi } from 'vitest';
import type { ActionReceipt } from '../action-types';
import { cancelHeld, commitHeldNow, sweepHeld, type HeldRow } from '../undo-hold';

type Row = HeldRow & { coach_id: string; idempotency_key: string; status: string; decided_at: string | null; result: ActionReceipt | null };

const receipt = (status: ActionReceipt['status'] = 'completed'): ActionReceipt => ({ status, action: 'x', summary: 'Done.', created: [], notifications: [], partial_failures: [], retryable: false, at: '2026-11-04T00:00:00Z' });

/** Enough of PostgREST for the ledger: conditional updates race on the row, as the database does. */
function ledger(rows: Row[], hooks: { beforeUpdate?: () => void } = {}) {
  return {
    from: () => {
      const filters: Array<(r: Row) => boolean> = [];
      let patch: Partial<Row> | null = null;
      const chain = {
        select: () => chain,
        update: (p: Partial<Row>) => ((patch = p), chain),
        eq: (k: keyof Row, v: unknown) => (filters.push((r) => r[k] === v), chain),
        lte: (k: keyof Row, v: string) => (filters.push((r) => String(r[k]) <= v), chain),
        gt: (k: keyof Row, v: string) => (filters.push((r) => String(r[k]) > v), chain),
        order: () => chain,
        limit: () => chain,
        run() {
          if (patch) hooks.beforeUpdate?.();
          const hit = rows.filter((r) => filters.every((f) => f(r)));
          if (patch) for (const r of hit) Object.assign(r, patch);
          return hit;
        },
        maybeSingle: async () => ({ data: chain.run()[0] ?? null, error: null }),
        then: (ok: (v: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: chain.run(), error: null }).then(ok),
      };
      return chain;
    },
  } as never;
}

const row = (over: Partial<Row> = {}): Row => ({ id: 'r1', coach_id: 'c1', team_id: 't1', idempotency_key: 'k1', tool_name: 'create_event', proposed_input: {}, status: 'held', run_at: '2020-01-01T00:00:00.000Z', decided_at: '2020-01-01T00:00:00.000Z', result: null, ...over });

describe('sweepHeld', () => {
  it('commits an overdue held row once, and records the outcome', async () => {
    const rows = [row()];
    const run = vi.fn(async () => receipt());
    const n = await sweepHeld(ledger(rows), { coach_id: 'c1', team_id: 't1', resolve: () => ({ run }) });
    expect(n).toBe(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(rows[0]!.status).toBe('completed');
  });

  it('does not start the write when it loses the row to the release (no double write under the race)', async () => {
    const rows = [row()];
    const run = vi.fn(async () => receipt());
    // The other runner takes the row between the sweep's read and its take.
    const sb = ledger(rows, { beforeUpdate: () => { rows[0]!.status = 'approved'; } });
    const n = await sweepHeld(sb, { coach_id: 'c1', team_id: 't1', resolve: () => ({ run }) });
    expect(n).toBe(0);
    expect(run).not.toHaveBeenCalled();
  });

  it('leaves a row still inside its hold alone', async () => {
    const rows = [row({ run_at: new Date(Date.now() + 8000).toISOString() })];
    const run = vi.fn(async () => receipt());
    await sweepHeld(ledger(rows), { coach_id: 'c1', team_id: 't1', resolve: () => ({ run }) });
    expect(run).not.toHaveBeenCalled();
    expect(rows[0]!.status).toBe('held');
  });

  it('never commits a row of another team (the coach switched teams)', async () => {
    const rows = [row({ team_id: 't2' })];
    const run = vi.fn(async () => receipt());
    await sweepHeld(ledger(rows), { coach_id: 'c1', team_id: 't1', resolve: () => ({ run }) });
    expect(run).not.toHaveBeenCalled();
    expect(rows[0]!.status).toBe('held');
  });

  it('restarts the in-flight clock when it takes an overdue row, so a late sweep is not read as abandoned', async () => {
    const rows = [row()];
    let seen: string | null = null;
    await sweepHeld(ledger(rows), { coach_id: 'c1', team_id: 't1', resolve: () => ({ run: async () => { seen = rows[0]!.decided_at; return receipt(); } }) });
    expect(Date.parse(seen!)).toBeGreaterThan(Date.now() - 60_000);
  });

  it('records completed when the action reports failure but the read-back finds the row', async () => {
    const rows = [row()];
    await sweepHeld(ledger(rows), { coach_id: 'c1', team_id: 't1', resolve: () => ({ run: async () => receipt('failed'), readBack: async () => receipt() }) });
    expect(rows[0]!.status).toBe('completed');
  });
});

describe('commitHeldNow', () => {
  it('Open commits inside the window; the release then finds nothing to take', async () => {
    const rows = [row({ run_at: new Date(Date.now() + 5000).toISOString() })];
    const run = vi.fn(async () => receipt());
    const first = await commitHeldNow(ledger(rows), { coach_id: 'c1', idempotency_key: 'k1', resolve: () => ({ run }) });
    const second = await commitHeldNow(ledger(rows), { coach_id: 'c1', idempotency_key: 'k1', resolve: () => ({ run }) });
    expect(first?.status).toBe('completed');
    expect(second).toBeNull();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('due_only never cuts the window short', async () => {
    const rows = [row({ run_at: new Date(Date.now() + 5000).toISOString() })];
    const run = vi.fn(async () => receipt());
    expect(await commitHeldNow(ledger(rows), { coach_id: 'c1', idempotency_key: 'k1', due_only: true, resolve: () => ({ run }) })).toBeNull();
    expect(run).not.toHaveBeenCalled();
    expect(rows[0]!.status).toBe('held');
  });

  it('does nothing to an undone row', async () => {
    const rows = [row({ status: 'cancelled' })];
    const run = vi.fn(async () => receipt());
    expect(await commitHeldNow(ledger(rows), { coach_id: 'c1', idempotency_key: 'k1', resolve: () => ({ run }) })).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });
});

describe('cancelHeld', () => {
  it('Undo inside the window cancels and the action never runs; after the window it is late', async () => {
    const inside = [row({ run_at: new Date(Date.now() + 5000).toISOString() })];
    expect(await cancelHeld(ledger(inside), { coach_id: 'c1', idempotency_key: 'k1' })).toBe('cancelled');
    expect(inside[0]!.status).toBe('cancelled');
    const after = [row()];
    expect(await cancelHeld(ledger(after), { coach_id: 'c1', idempotency_key: 'k1' })).toBe('late');
    expect(after[0]!.status).toBe('held');
  });
});
