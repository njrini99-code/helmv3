import { describe, it, expect, vi } from 'vitest';
import {
  APPROVED_RUN_TTL_MS,
  claimForExecution,
  linkProposalsToMessage,
  proposalKeysFromParts,
  recordProposal,
} from '@/lib/coachhelm/v3/chat/action-runs';

/**
 * Audit row 50.
 *
 * (a) A run left 'approved' by a crash (the function died between the claim
 *     and `recordOutcome`) returned `in_flight` forever: the coach could never
 *     retry. The downstream writes (createRecurringEvent, createFocusArea,
 *     createTask, createEnrichedAnnouncement) take NO idempotency key, so a
 *     silent re-run could create the series twice. A stale 'approved' run is
 *     therefore resolved to 'failed' with a clear message — NOT re-executed in
 *     the same call — and the coach retries explicitly.
 * (b) `message_id` was never written, so a run could not be tied back to the
 *     message that proposed it.
 * Also: `recordProposal` upserted `status: 'proposed'` with
 *     ignoreDuplicates:false, i.e. ON CONFLICT DO UPDATE — re-proposing the
 *     same plan reset a completed run to 'proposed', which the claim then
 *     treats as claimable, re-running the write.
 */

interface Op {
  table: string;
  kind: 'select' | 'update' | 'upsert' | 'insert';
  payload?: Record<string, unknown>;
  options?: Record<string, unknown>;
  filters: Array<[string, string, unknown]>;
}

/** A Supabase double that records every chain and answers from `respond`. */
function makeSb(respond: (op: Op) => { data: unknown; error: unknown }) {
  const ops: Op[] = [];
  const sb = {
    from: vi.fn((table: string) => {
      const op: Op = { table, kind: 'select', filters: [] };
      ops.push(op);
      const c: Record<string, unknown> = {};
      c.select = vi.fn(() => c);
      c.update = vi.fn((payload: Record<string, unknown>) => {
        op.kind = 'update';
        op.payload = payload;
        return c;
      });
      c.upsert = vi.fn((payload: Record<string, unknown>, options: Record<string, unknown>) => {
        op.kind = 'upsert';
        op.payload = payload;
        op.options = options;
        return c;
      });
      c.insert = vi.fn((payload: Record<string, unknown>) => {
        op.kind = 'insert';
        op.payload = payload;
        return c;
      });
      for (const f of ['eq', 'in', 'lt', 'is', 'neq']) {
        c[f] = vi.fn((col: string, val: unknown) => {
          op.filters.push([f, col, val]);
          return c;
        });
      }
      c.maybeSingle = vi.fn(async () => respond(op));
      c.then = (r: (v: unknown) => unknown) => Promise.resolve(respond(op)).then(r);
      return c;
    }),
  };
  return { sb: sb as never, ops };
}

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

describe('claimForExecution — approved TTL', () => {
  it('still reports in_flight for a fresh approved run', async () => {
    const { sb, ops } = makeSb((op) =>
      op.kind === 'select'
        ? { data: { id: 'r1', status: 'approved', result: null, decided_at: iso(30_000) }, error: null }
        : { data: null, error: null },
    );
    expect(await claimForExecution(sb, { coach_id: 'c1', idempotency_key: 'k1' })).toEqual({ kind: 'in_flight' });
    expect(ops.some((o) => o.kind === 'update')).toBe(false);
  });

  it('fails a stale approved run closed instead of re-executing it', async () => {
    const { sb, ops } = makeSb((op) =>
      op.kind === 'select'
        ? { data: { id: 'r1', status: 'approved', result: null, decided_at: iso(APPROVED_RUN_TTL_MS + 60_000) }, error: null }
        : { data: { id: 'r1' }, error: null },
    );
    const claim = await claimForExecution(sb, { coach_id: 'c1', idempotency_key: 'k1' });
    expect(claim.kind).toBe('stale_failed');
    if (claim.kind === 'stale_failed') expect(claim.message).toMatch(/check/i);

    const update = ops.find((o) => o.kind === 'update');
    expect(update?.payload?.status).toBe('failed');
    expect(String(update?.payload?.error_message)).toMatch(/interrupted/i);
    // Conditional on still being approved AND still stale — a run that just
    // completed can never be overwritten to 'failed'.
    expect(update?.filters).toContainEqual(['eq', 'status', 'approved']);
    expect(update?.filters.some(([f, col]) => f === 'lt' && col === 'decided_at')).toBe(true);
    // Never claimed back to 'approved' in the same call.
    expect(ops.filter((o) => o.kind === 'update')).toHaveLength(1);
  });

  it('reports in_flight when the stale run finished between the read and the update', async () => {
    const { sb } = makeSb((op) =>
      op.kind === 'select'
        ? { data: { id: 'r1', status: 'approved', result: null, decided_at: iso(APPROVED_RUN_TTL_MS + 60_000) }, error: null }
        : { data: null, error: null },
    );
    expect((await claimForExecution(sb, { coach_id: 'c1', idempotency_key: 'k1' })).kind).toBe('in_flight');
  });

  it('leaves an approved run with no decided_at alone (staleness cannot be proven)', async () => {
    // The claim always stamps decided_at when it approves, so this shape is
    // not produced by this code; refusing is the conservative answer.
    const { sb, ops } = makeSb((op) =>
      op.kind === 'select'
        ? { data: { id: 'r1', status: 'approved', result: null, decided_at: null }, error: null }
        : { data: { id: 'r1' }, error: null },
    );
    expect((await claimForExecution(sb, { coach_id: 'c1', idempotency_key: 'k1' })).kind).toBe('in_flight');
    expect(ops.some((o) => o.kind === 'update')).toBe(false);
  });

  it('keeps the TTL well above the chat route maxDuration (120s)', () => {
    expect(APPROVED_RUN_TTL_MS).toBeGreaterThanOrEqual(5 * 120_000);
  });
});

describe('recordProposal — never resets an existing run', () => {
  it('inserts with ON CONFLICT DO NOTHING and reads the existing id back', async () => {
    const { sb, ops } = makeSb((op) =>
      op.kind === 'upsert' ? { data: null, error: null } : { data: { id: 'existing-run' }, error: null },
    );
    const out = await recordProposal(sb, {
      coach_id: 'c1',
      team_id: 't1',
      conversation_id: 'conv',
      tool_name: 'create_task',
      proposed_input: {},
      idempotency_key: 'k1',
    });
    expect(out).toEqual({ run_id: 'existing-run' });
    const write = ops.find((o) => o.kind === 'upsert');
    expect(write?.options).toMatchObject({ ignoreDuplicates: true });
    // Nothing in the chain may flip a completed/approved run back to 'proposed'.
    expect(ops.some((o) => o.kind === 'update')).toBe(false);
  });

  it('returns the new id on a fresh proposal', async () => {
    const { sb } = makeSb((op) => (op.kind === 'upsert' ? { data: { id: 'new-run' }, error: null } : { data: null, error: null }));
    const out = await recordProposal(sb, {
      coach_id: 'c1',
      team_id: 't1',
      conversation_id: null,
      tool_name: 'create_task',
      proposed_input: {},
      idempotency_key: 'k1',
    });
    expect(out).toEqual({ run_id: 'new-run' });
  });
});

describe('linkProposalsToMessage', () => {
  it('writes message_id onto the coach’s unlinked runs for those keys', async () => {
    const { sb, ops } = makeSb(() => ({ data: null, error: null }));
    await linkProposalsToMessage(sb, { coach_id: 'c1', message_id: 'm1', idempotency_keys: ['k1', 'k2', 'k1'] });
    const update = ops.find((o) => o.kind === 'update');
    expect(update?.payload).toEqual({ message_id: 'm1' });
    expect(update?.filters).toContainEqual(['eq', 'coach_id', 'c1']);
    expect(update?.filters).toContainEqual(['in', 'idempotency_key', ['k1', 'k2']]);
    // The proposing message wins; a later continuation never overwrites it.
    expect(update?.filters).toContainEqual(['is', 'message_id', null]);
  });

  it('does nothing without keys', async () => {
    const { sb, ops } = makeSb(() => ({ data: null, error: null }));
    await linkProposalsToMessage(sb, { coach_id: 'c1', message_id: 'm1', idempotency_keys: [] });
    expect(ops).toHaveLength(0);
  });
});

describe('proposalKeysFromParts', () => {
  it('reads the idempotency key off every action card and ignores everything else', () => {
    expect(
      proposalKeysFromParts([
        { type: 'text', text: 'Drafted.' },
        { type: 'data-action-proposal', id: 'proposal-k1', data: { idempotency_key: 'k1', summary: 's' } },
        { type: 'data-action-receipt', data: { idempotency_key: 'k9' } },
        { type: 'data-action-proposal', data: {} },
        null,
        { type: 'data-action-proposal', data: { idempotency_key: 'k2' } },
      ]),
    ).toEqual(['k1', 'k2']);
  });
});
