import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TriageGroup, TriagePlan } from '@/lib/admin/triage-engine';

/**
 * Isolates the ROUTE's own orchestration from the already-tested engine
 * (`triage-engine.test.ts`), collectors (`triage-collect.test.ts`) and
 * analyzer (`rca-run.test.ts`): `buildTriagePlan` is replaced with a
 * hand-built fixture per test, and the analyzer calls are replaced with
 * canned results, so these tests are entirely about what the route DOES with
 * a plan and an analysis — apply the closeable set, cap the queue, resolve
 * only what the contract allows, and write the heartbeat last.
 *
 * `applyPlan` / `resolveTriageMember` (`@/lib/admin/triage-apply`) run for
 * REAL against a fake admin client that logs every call in order — that is
 * what makes "closeable set still applied despite a later analyzer failure"
 * and "heartbeat written last" checkable at all.
 */

const mocks = vi.hoisted(() => ({
  buildTriagePlan: vi.fn<(input: unknown) => TriagePlan>(),
  runRcaForFingerprint: vi.fn(),
  runRcaForReliabilitySignal: vi.fn(),
  persistRcaAnalysis: vi.fn(),
  getProductionDeployAt: vi.fn(),
}));

vi.mock('@/lib/cron/auth', () => ({ requireCronAuth: () => null }));
vi.mock('@/lib/admin/job-log', () => ({ recordJobRun: (_jobType: string, fn: () => Promise<Response>) => fn() }));

vi.mock('@/lib/admin/triage-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/admin/triage-engine')>();
  return { ...actual, buildTriagePlan: mocks.buildTriagePlan };
});

vi.mock('@/lib/admin/rca-run', () => ({
  runRcaForFingerprint: mocks.runRcaForFingerprint,
  runRcaForReliabilitySignal: mocks.runRcaForReliabilitySignal,
  persistRcaAnalysis: mocks.persistRcaAnalysis,
}));

vi.mock('@/lib/admin/auto-resolve', () => ({
  getProductionDeployAt: mocks.getProductionDeployAt,
  RELEASE_GRACE_MS: 24 * 3600_000,
}));

/** A fake admin client with a call log ORDER can be asserted against —
 *  mirrors the chain-builder doubles in triage-collect.test.ts /
 *  log-retention/route.test.ts, extended with `update`/`rpc`/`insert` so
 *  `applyPlan`/`resolveTriageMember` (real code, not mocked) and the route's
 *  own heartbeat write can run against it. */
function makeFakeAdmin() {
  const callLog: string[] = [];
  const rpcCalls: Array<{ fingerprint: string }> = [];
  const heartbeatInserts: Array<Record<string, unknown>> = [];

  function selectChain() {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      not: () => chain,
      like: () => chain,
      gte: () => chain,
      order: () => chain,
      range: () => chain,
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return chain;
  }

  const admin = {
    from(table: string) {
      if (table === 'admin_events') {
        const chain = selectChain();
        return {
          ...chain,
          update: (_payload: Record<string, unknown>) => {
            const updFilters: Record<string, unknown> = {};
            const updChain = {
              eq: (col: string, val: unknown) => {
                updFilters[col] = val;
                return updChain;
              },
              then: (resolve: (v: unknown) => unknown) => {
                callLog.push(`update:admin_events:${updFilters.fingerprint}`);
                return Promise.resolve({ data: null, error: null, count: 1 }).then(resolve);
              },
            };
            return updChain;
          },
        };
      }
      if (table === 'background_job_logs') {
        const chain = selectChain();
        return {
          ...chain,
          insert: (row: Record<string, unknown>) => {
            callLog.push(`insert:background_job_logs:${row.job_type}`);
            heartbeatInserts.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    rpc: (_fn: string, args: Record<string, unknown>) => {
      const fp = String(args.p_fingerprint);
      callLog.push(`rpc:admin_auto_resolve_error_fingerprint:${fp}`);
      rpcCalls.push({ fingerprint: fp });
      return Promise.resolve({ data: true, error: null });
    },
  };

  return { admin, callLog, rpcCalls, heartbeatInserts };
}

const { fakeAdmin } = vi.hoisted(() => ({ fakeAdmin: { current: null as ReturnType<typeof Object> | null } }));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => fakeAdmin.current,
}));

// Imported after the mocks above so the route picks up every one of them.
import { GET } from '@/app/api/cron/selfheal-triage/route';

function member(over: Partial<TriageGroup['members'][number]> = {}) {
  return {
    key: 'fp-1',
    origin: 'admin_events' as const,
    title: 'Boom',
    message: 'insert failed',
    route: null,
    severity: 'error' as const,
    errorCode: null,
    feature: null,
    action: null,
    source: null,
    occurrences: 1,
    firstSeen: '2026-08-30T00:00:00.000Z',
    lastSeen: '2026-08-30T00:00:00.000Z',
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
    verdict: 'needs-analysis',
    reason: 'Actionable',
    category: null,
    members,
    occurrences: members.length,
    firstSeen: '2026-08-30T00:00:00.000Z',
    lastSeen: '2026-08-30T00:00:00.000Z',
    origins: ['admin_events'],
    corroborated: false,
    evidenceUrls: [],
    ...over,
  };
}

const okHealth = [
  { source: 'admin_events', status: 'ok' as const, reason: null },
  { source: 'sentry', status: 'ok' as const, reason: null },
  { source: 'supabase', status: 'ok' as const, reason: null },
  { source: 'vercel', status: 'ok' as const, reason: null },
];

function plan(over: Partial<TriagePlan> = {}): TriagePlan {
  const queue = over.queue ?? [];
  const closeable = over.closeable ?? [];
  return {
    windowHours: 72,
    generatedAt: '2026-09-02T09:17:00.000Z',
    groups: [...queue, ...closeable],
    queue,
    closeable,
    quiet: [],
    sourceHealth: okHealth,
    blindSources: [],
    counts: {
      candidates: queue.length + closeable.length,
      groups: queue.length + closeable.length,
      analysed: 0,
      notADefect: closeable.length,
      needsAnalysis: queue.length,
      corroborated: 0,
      collapsed: 0,
      quietUnrecognised: 0,
    },
    ...over,
  };
}

const okAnalysis = {
  probableCause: 'Something',
  suspectFiles: [],
  suggestedFix: 'FIX HERE: do the thing',
  confidence: 'high' as const,
  relatedFingerprints: [],
  model: 'anthropic/claude-sonnet-5',
  generatedAt: '2026-09-02T09:17:00.000Z',
};

function req(): Request {
  return new Request('https://example.com/api/cron/selfheal-triage', {
    headers: { authorization: 'Bearer test' },
  });
}

async function heartbeatOf(admin: ReturnType<typeof makeFakeAdmin>) {
  const row = admin.heartbeatInserts.find((r) => r.job_type === 'selfheal-triage');
  return row as { status: string; error_message: string | null; metadata: Record<string, unknown> } | undefined;
}

beforeEach(() => {
  mocks.buildTriagePlan.mockReset();
  mocks.runRcaForFingerprint.mockReset();
  mocks.runRcaForReliabilitySignal.mockReset();
  mocks.persistRcaAnalysis.mockReset();
  mocks.persistRcaAnalysis.mockResolvedValue({ persisted: true });
  mocks.getProductionDeployAt.mockResolvedValue({ deployAt: null, deploySha: null, reason: 'no ready production deployment found' });
  fakeAdmin.current = makeFakeAdmin().admin;
});

afterEach(() => {
  delete process.env.SELFHEAL_TRIAGE_MAX_ANALYSES;
});

describe('GET /api/cron/selfheal-triage', () => {
  it('cap reached: only the cap is analysed, capped:true, the rest land in left_open', async () => {
    process.env.SELFHEAL_TRIAGE_MAX_ANALYSES = '1';
    const admin = makeFakeAdmin();
    fakeAdmin.current = admin.admin;

    const groupA = group({ causeKey: 'cause-a', members: [member({ key: 'fp-a' })] });
    const groupB = group({ causeKey: 'cause-b', members: [member({ key: 'fp-b' })] });
    mocks.buildTriagePlan.mockReturnValue(plan({ queue: [groupA, groupB] }));
    mocks.runRcaForFingerprint.mockResolvedValue({ status: 'ok', analysis: okAnalysis });

    const res = await GET(req());
    expect(res.status).toBe(200);

    expect(mocks.runRcaForFingerprint).toHaveBeenCalledTimes(1);
    expect(mocks.runRcaForFingerprint).toHaveBeenCalledWith('fp-a');

    const hb = await heartbeatOf(admin);
    expect(hb?.metadata.capped).toBe(true);
    expect(hb?.metadata.analysed).toBe(1);
    expect(hb?.metadata.still_open_unanalysed).toBe(1);
    expect((hb?.metadata.queue as { left_open: string[] }).left_open).toContain('cause-b');
    expect((hb?.metadata.queue as { analysed: string[] }).analysed).toContain('cause-a');
  });

  it('a blind arm inside an otherwise-healthy snapshot completes, degraded, naming the arm — never fails the heartbeat', async () => {
    const admin = makeFakeAdmin();
    fakeAdmin.current = admin.admin;

    mocks.buildTriagePlan.mockReturnValue(
      plan({
        sourceHealth: [
          { source: 'admin_events', status: 'ok', reason: null },
          { source: 'sentry', status: 'ok', reason: null },
          { source: 'supabase', status: 'ok', reason: null },
          { source: 'vercel', status: 'blind', reason: 'rate limited' },
        ],
      }),
    );

    const res = await GET(req());
    expect(res.status).toBe(200);

    const hb = await heartbeatOf(admin);
    expect(hb?.status).toBe('completed');
    expect(hb?.metadata.degraded).toBe(true);
    expect(hb?.error_message).toContain('vercel');
  });

  it('an analyzer error for one group leaves it open, still applies the closeable set, and fails the heartbeat naming the fingerprint', async () => {
    const admin = makeFakeAdmin();
    fakeAdmin.current = admin.admin;

    const failingGroup = group({ causeKey: 'cause-fail', members: [member({ key: 'fp-fail' })] });
    const closeableGroup = group({
      causeKey: 'cause-close',
      verdict: 'not-a-defect',
      reason: 'routine telemetry',
      members: [member({ key: 'fp-close' })],
    });
    mocks.buildTriagePlan.mockReturnValue(plan({ queue: [failingGroup], closeable: [closeableGroup] }));
    mocks.runRcaForFingerprint.mockResolvedValue({ status: 'error', message: 'model unavailable' });

    const res = await GET(req());
    expect(res.status).toBe(503);

    // The closeable set was applied REGARDLESS of the later analyzer failure
    // — both writes for the closeable member landed.
    expect(admin.callLog).toContain('update:admin_events:fp-close');
    expect(admin.callLog).toContain('rpc:admin_auto_resolve_error_fingerprint:fp-close');

    const hb = await heartbeatOf(admin);
    expect(hb?.status).toBe('failed');
    expect(hb?.error_message).toContain('fp-fail');
    expect((hb?.metadata.queue as { left_open: string[] }).left_open).toContain('cause-fail');
  });

  it('never resolves a fingerprint carrying a provider fault, even when the model says NOT A DEFECT', async () => {
    const admin = makeFakeAdmin();
    fakeAdmin.current = admin.admin;

    // Mirrors the real production shape: metadata.errorCode is null, but the
    // message text plainly names an Inngest credential fault.
    const providerGroup = group({
      causeKey: 'cause-inngest',
      members: [
        member({
          key: 'fp-inngest',
          errorCode: null,
          message: 'Inngest API Error: 404 Event key not found — INNGEST_SIGNING_KEY does not match',
        }),
      ],
    });
    mocks.buildTriagePlan.mockReturnValue(plan({ queue: [providerGroup] }));
    mocks.runRcaForFingerprint.mockResolvedValue({
      status: 'ok',
      analysis: { ...okAnalysis, suggestedFix: 'NOT A DEFECT: transient noise' },
    });

    const res = await GET(req());
    expect(res.status).toBe(200);

    // Analysed (persisted) — but never resolved.
    expect(mocks.persistRcaAnalysis).toHaveBeenCalled();
    expect(admin.callLog.some((c) => c.includes('fp-inngest'))).toBe(false);

    const hb = await heartbeatOf(admin);
    expect(hb?.metadata.analysed).toBe(1);
    expect(hb?.metadata.resolved).toBe(0);
  });

  it('writes the heartbeat LAST — after every apply/persist/resolve call', async () => {
    const admin = makeFakeAdmin();
    fakeAdmin.current = admin.admin;

    const resolvableGroup = group({
      causeKey: 'cause-resolve',
      members: [member({ key: 'fp-resolve' })],
    });
    const closeableGroup = group({
      causeKey: 'cause-close',
      verdict: 'not-a-defect',
      reason: 'routine telemetry',
      members: [member({ key: 'fp-close-2' })],
    });
    mocks.buildTriagePlan.mockReturnValue(plan({ queue: [resolvableGroup], closeable: [closeableGroup] }));
    mocks.runRcaForFingerprint.mockResolvedValue({
      status: 'ok',
      analysis: { ...okAnalysis, suggestedFix: 'NOT A DEFECT: expected control flow' },
    });

    const res = await GET(req());
    expect(res.status).toBe(200);

    expect(admin.callLog.length).toBeGreaterThan(1);
    const heartbeatIndex = admin.callLog.findIndex((c) => c.startsWith('insert:background_job_logs:selfheal-triage'));
    expect(heartbeatIndex).toBe(admin.callLog.length - 1);
    // Sanity: both the closeable-set write and the analysis-driven resolve
    // happened BEFORE it.
    expect(admin.callLog.indexOf('update:admin_events:fp-close-2')).toBeLessThan(heartbeatIndex);
    expect(admin.callLog.indexOf('update:admin_events:fp-resolve')).toBeLessThan(heartbeatIndex);
  });
});
