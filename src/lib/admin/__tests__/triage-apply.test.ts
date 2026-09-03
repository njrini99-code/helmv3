import { describe, it, expect, vi } from 'vitest';
import { applyPlan, resolveTriageMember } from '@/lib/admin/triage-apply';
import type { TriagePlan, TriageGroup } from '@/lib/admin/triage-engine';
import type { AdminClient } from '@/lib/admin/triage-collect';

function member(over: Partial<TriageGroup['members'][number]> = {}) {
  return {
    key: 'fp-1',
    origin: 'admin_events' as const,
    title: 'Boom',
    message: null,
    route: null,
    severity: 'error' as const,
    errorCode: null,
    feature: null,
    action: null,
    source: null,
    occurrences: 1,
    firstSeen: '2026-09-01T00:00:00.000Z',
    lastSeen: '2026-09-01T00:00:00.000Z',
    seenBy: ['admin_events'],
    evidenceUrl: null,
    existingAnalysisFix: null,
    ...over,
  };
}

function group(over: Partial<TriageGroup> = {}): TriageGroup {
  const members = over.members ?? [member()];
  return {
    causeKey: 'cause-1',
    title: 'Boom',
    severity: 'error',
    route: null,
    errorCode: null,
    verdict: 'not-a-defect',
    reason: 'Classified non-actionable',
    category: null,
    members,
    occurrences: members.length,
    firstSeen: '2026-09-01T00:00:00.000Z',
    lastSeen: '2026-09-01T00:00:00.000Z',
    origins: ['admin_events'],
    corroborated: false,
    evidenceUrls: [],
    ...over,
  };
}

function fakeAdmin(opts: {
  updateCount?: number | null;
  updateError?: { message: string } | null;
  rpcResult?: boolean | null;
  rpcError?: { message: string } | null;
}) {
  const calls: { updates: unknown[]; rpc: unknown[] } = { updates: [], rpc: [] };
  const admin = {
    from: (table: string) => ({
      update: (payload: unknown) => {
        calls.updates.push({ table, payload });
        const chain = {
          eq: () => chain,
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ error: opts.updateError ?? null, count: opts.updateCount ?? 1 }).then(resolve),
        };
        return chain;
      },
    }),
    rpc: (fn: string, args: unknown) => {
      calls.rpc.push({ fn, args });
      return Promise.resolve({ data: opts.rpcResult ?? true, error: opts.rpcError ?? null });
    },
  };
  return { admin: admin as unknown as AdminClient, calls };
}

describe('resolveTriageMember', () => {
  it('resolves the admin_events row and records the ledger for an admin_events member', async () => {
    const { admin, calls } = fakeAdmin({ updateCount: 1, rpcResult: true });
    const result = await resolveTriageMember(admin, member(), 'triage: routine telemetry');
    expect(result).toEqual({ rowsResolved: 1, ledger: 'recorded' });
    expect(calls.updates).toHaveLength(1);
    expect(calls.rpc).toHaveLength(1);
  });

  it('never flips an admin_events row for a rel: reliability-signal member — ledger only', async () => {
    const { admin, calls } = fakeAdmin({ rpcResult: true });
    const result = await resolveTriageMember(
      admin,
      member({ key: 'rel:sig-1', origin: 'sentry', seenBy: ['sentry'] }),
      'triage: routine telemetry',
    );
    expect(result).toEqual({ rowsResolved: 0, ledger: 'recorded' });
    expect(calls.updates).toHaveLength(0);
    expect(calls.rpc).toHaveLength(1);
  });

  it('declines the ledger write when the RPC says a human already resolved it', async () => {
    const { admin } = fakeAdmin({ updateCount: 1, rpcResult: false });
    const result = await resolveTriageMember(admin, member(), 'triage: routine telemetry');
    expect(result).toEqual({ rowsResolved: 1, ledger: 'declined' });
  });

  it('reports the ledger write as failed without throwing on an RPC error', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { admin } = fakeAdmin({ updateCount: 1, rpcError: { message: 'timeout' } });
    const result = await resolveTriageMember(admin, member(), 'triage: routine telemetry');
    expect(result).toEqual({ rowsResolved: 1, ledger: 'failed' });
    errSpy.mockRestore();
  });

  it('reports failed and skips the RPC call when the UPDATE itself errors', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { admin, calls } = fakeAdmin({ updateError: { message: 'connection reset' } });
    const result = await resolveTriageMember(admin, member(), 'triage: routine telemetry');
    expect(result).toEqual({ rowsResolved: 0, ledger: 'failed' });
    expect(calls.rpc).toHaveLength(0);
    errSpy.mockRestore();
  });
});

describe('applyPlan', () => {
  it('closes every member of every closeable group and sums BOTH writes across the whole plan', async () => {
    const { admin } = fakeAdmin({ updateCount: 1, rpcResult: true });
    const plan: TriagePlan = {
      windowHours: 72,
      generatedAt: '2026-09-02T00:00:00.000Z',
      groups: [],
      queue: [],
      closeable: [
        group({ members: [member({ key: 'fp-1' }), member({ key: 'fp-2' })] }),
        group({ members: [member({ key: 'fp-3' })] }),
      ],
      quiet: [],
      sourceHealth: [],
      blindSources: [],
      counts: {
        candidates: 3,
        groups: 2,
        analysed: 0,
        notADefect: 2,
        needsAnalysis: 0,
        corroborated: 0,
        collapsed: 0,
        quietUnrecognised: 0,
      },
    };

    const result = await applyPlan(admin, plan);
    expect(result).toEqual({ rowsResolved: 3, ledgerRecorded: 3, ledgerDeclined: 0 });
  });
});
