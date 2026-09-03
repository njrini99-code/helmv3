import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Mirrors analyze-error.test.ts's mocking shape — this module is the
 * extraction that test was written against, so the same doubles cover it.
 * `rca` is mocked through `importOriginal` so `runRcaAnalysis` (the
 * network-shaped call) is replaced while every pure export (schema,
 * category helpers) stays live.
 */
const mocks = vi.hoisted(() => ({
  fetchFingerprintDetail: vi.fn(),
  runRcaAnalysis: vi.fn(),
  logServerError: vi.fn(),
  inserted: [] as Array<Record<string, unknown>>,
  insertError: null as { message: string } | null,
}));

vi.mock('@/lib/admin/data/errors', () => ({ fetchFingerprintDetail: mocks.fetchFingerprintDetail }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: mocks.logServerError }));

vi.mock('@/lib/admin/rca', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/admin/rca')>();
  return { ...actual, runRcaAnalysis: mocks.runRcaAnalysis };
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'admin_events') throw new Error(`unexpected table ${table}`);
      return {
        insert: (row: Record<string, unknown>) => {
          mocks.inserted.push(row);
          return Promise.resolve({ error: mocks.insertError });
        },
      };
    },
  }),
}));

import {
  runRcaForFingerprint,
  runRcaForReliabilitySignal,
  persistRcaAnalysis,
} from '@/lib/admin/rca-run';

const okAnalysis = {
  probableCause: 'Null pointer in the save path',
  suspectFiles: [{ path: 'src/lib/golf/foo.ts', reason: 'named in the stack trace' }],
  suggestedFix: 'Guard the null case',
  confidence: 'high' as const,
  relatedFingerprints: [],
  model: 'anthropic/claude-sonnet-5',
  generatedAt: '2026-08-25T10:05:00.000Z',
};

const detailWithEvents = {
  events: [
    {
      id: 'e2',
      title: 'Boom',
      message: 'insert failed',
      severity: 'error' as const,
      created_at: '2026-08-25T10:00:00.000Z',
      user_email: null,
      user_id: 'u1',
      team_id: null,
      url: '/golf/dashboard/rounds',
      stack_trace: 'Error: boom\n    at foo (a.ts:1:1)',
      source: 'server_action',
      feature: null,
      sport: 'golf',
      metadata: { action: 'saveThing' },
    },
    {
      id: 'e1',
      title: 'Boom',
      message: 'insert failed',
      severity: 'error' as const,
      created_at: '2026-08-24T10:00:00.000Z',
      user_email: null,
      user_id: 'u2',
      team_id: null,
      url: '/golf/dashboard/rounds',
      stack_trace: null,
      source: 'server_action',
      feature: null,
      sport: 'golf',
      metadata: {},
    },
  ],
  report: 'REPORT TEXT',
  summary: {
    totalCount: 2,
    truncated: false,
    firstSeen: '2026-08-24T10:00:00.000Z',
    lastSeen: '2026-08-25T10:00:00.000Z',
    affectedUserCount: 2,
    nearbyDeploys: [{ sha: 'abc1234', time: '2026-08-25T09:00:00.000Z' }],
  },
};

beforeEach(() => {
  mocks.fetchFingerprintDetail.mockReset();
  mocks.runRcaAnalysis.mockReset();
  mocks.logServerError.mockReset();
  mocks.inserted.length = 0;
  mocks.insertError = null;
});

describe('runRcaForFingerprint', () => {
  // Regression test: this is what `analyzeErrorFingerprint` used to do
  // inline, minus the `requireSuperAdmin()` gate — the extraction must not
  // have changed anything OBSERVABLE about the analysis itself.

  it('rejects a blank fingerprint without calling the detail fetch', async () => {
    const result = await runRcaForFingerprint('   ');
    expect(result).toEqual({ status: 'error', message: 'A fingerprint is required.' });
    expect(mocks.fetchFingerprintDetail).not.toHaveBeenCalled();
  });

  it('surfaces a detail-fetch failure as a typed error instead of throwing', async () => {
    mocks.fetchFingerprintDetail.mockRejectedValue(new Error('query blew up'));

    const result = await runRcaForFingerprint('fp-1');

    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.message).toContain('query blew up');
    expect(mocks.runRcaAnalysis).not.toHaveBeenCalled();
  });

  it('returns an error for a fingerprint with no events, without calling the model', async () => {
    mocks.fetchFingerprintDetail.mockResolvedValue({ events: [], report: '', summary: {} });

    const result = await runRcaForFingerprint('fp-1');

    expect(result).toEqual({ status: 'error', message: 'No events found for this fingerprint.' });
    expect(mocks.runRcaAnalysis).not.toHaveBeenCalled();
  });

  it('assembles the context from the fingerprint detail and calls runRcaAnalysis with it', async () => {
    mocks.fetchFingerprintDetail.mockResolvedValue(detailWithEvents);
    mocks.runRcaAnalysis.mockResolvedValue({ status: 'ok', analysis: okAnalysis });

    await runRcaForFingerprint('fp-1');

    const call = mocks.runRcaAnalysis.mock.calls[0]?.[0];
    expect(call.fingerprint).toBe('fp-1');
    expect(call.rawStacks).toEqual(['Error: boom\n    at foo (a.ts:1:1)']);
    expect(call.classificationKind).toBe('defect');
    expect(call.sourceFilePath).toBeNull();
    expect(call.nearbyDeploys).toEqual(detailWithEvents.summary.nearbyDeploys);
    expect(call.incidentReport).toContain('# Incident report: Boom');
    expect(call.incidentReport).toContain('insert failed');
    expect(call.incidentReport).not.toContain('REPORT TEXT');
  });

  it('excludes its own prior analysis rows from context', async () => {
    const priorAnalysisRow = {
      id: 'e3',
      title: 'RCA analysis: fp-1',
      message: null,
      severity: 'info' as const,
      created_at: '2026-08-25T11:00:00.000Z',
      user_email: null,
      user_id: null,
      team_id: null,
      url: null,
      stack_trace: null,
      source: 'system',
      feature: 'admin_dashboard',
      sport: null,
      metadata: okAnalysis,
    };
    mocks.fetchFingerprintDetail.mockResolvedValue({
      ...detailWithEvents,
      events: [priorAnalysisRow, ...detailWithEvents.events],
    });
    mocks.runRcaAnalysis.mockResolvedValue({ status: 'ok', analysis: okAnalysis });

    await runRcaForFingerprint('fp-1');

    const call = mocks.runRcaAnalysis.mock.calls[0]?.[0];
    expect(call.classificationKind).toBe('defect');
    expect(call.incidentReport).not.toContain('RCA analysis: fp-1');
  });

  it('does NOT persist anything itself — the caller decides whether to persist', async () => {
    mocks.fetchFingerprintDetail.mockResolvedValue(detailWithEvents);
    mocks.runRcaAnalysis.mockResolvedValue({ status: 'ok', analysis: okAnalysis });

    await runRcaForFingerprint('fp-1');

    expect(mocks.inserted).toHaveLength(0);
  });
});

describe('runRcaForReliabilitySignal', () => {
  it('builds an incident report from the signal fields, with no admin_events read at all', async () => {
    mocks.runRcaAnalysis.mockResolvedValue({ status: 'ok', analysis: okAnalysis });

    await runRcaForReliabilitySignal('rel:sig-1', {
      title: 'Vercel build failing',
      message: 'permission denied on baseball_players',
      route: null,
      severity: 'error',
      errorCode: null,
      feature: 'baseball',
      occurrences: 23,
      firstSeen: '2026-09-01T00:00:00.000Z',
      lastSeen: '2026-09-02T00:00:00.000Z',
      evidenceUrls: ['https://vercel.com/deployments/abc'],
    });

    expect(mocks.fetchFingerprintDetail).not.toHaveBeenCalled();
    const call = mocks.runRcaAnalysis.mock.calls[0]?.[0];
    expect(call.fingerprint).toBe('rel:sig-1');
    expect(call.rawStacks).toEqual([]);
    expect(call.sourceFilePath).toBeNull();
    expect(call.incidentReport).toContain('Vercel build failing');
    expect(call.incidentReport).toContain('permission denied on baseball_players');
  });

  it('picks a sentry URL out of evidenceUrls when one exists', async () => {
    mocks.runRcaAnalysis.mockResolvedValue({ status: 'ok', analysis: okAnalysis });

    await runRcaForReliabilitySignal('rel:sig-2', {
      title: 'Chat stream error',
      message: null,
      route: '/golf/coach',
      severity: 'warning',
      errorCode: 'E1',
      feature: 'golf',
      occurrences: 4,
      firstSeen: '2026-09-01T00:00:00.000Z',
      lastSeen: '2026-09-02T00:00:00.000Z',
      evidenceUrls: ['https://vercel.com/x', 'https://sentry.io/issues/123'],
    });

    const call = mocks.runRcaAnalysis.mock.calls[0]?.[0];
    expect(call.incidentReport).toContain('sentry.io/issues/123');
  });
});

describe('persistRcaAnalysis', () => {
  it('reports persisted:true and writes the born-resolved rca_analysis row', async () => {
    const outcome = await persistRcaAnalysis('fp-1', okAnalysis);

    expect(outcome).toEqual({ persisted: true });
    expect(mocks.inserted).toHaveLength(1);
    const row = mocks.inserted[0]!;
    expect(row).toMatchObject({
      event_type: 'rca_analysis',
      severity: 'info',
      source: 'system',
      feature: 'admin_dashboard',
      fingerprint: 'fp-1',
      metadata: okAnalysis,
      resolved: true,
    });
  });

  it('reports persisted:false with the error, without throwing, on an insert failure', async () => {
    mocks.insertError = { message: 'insert failed' };

    const outcome = await persistRcaAnalysis('fp-1', okAnalysis);

    expect(outcome.persisted).toBe(false);
    expect(outcome.error).toContain('insert failed');
    expect(mocks.logServerError).toHaveBeenCalledTimes(1);
    expect(mocks.logServerError.mock.calls[0]?.[0]).toContain('fp-1');
  });
});
