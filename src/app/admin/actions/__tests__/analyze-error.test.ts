import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Mirrors incident-resolver.test.ts's chain-builder mock for the admin
 * client, plus sentry-resolve.test.ts's requireSuperAdmin mock shape. `rca`
 * is mocked through `importOriginal` so `rcaAnalysisSchema` and the real
 * `RcaAnalysis`/`RcaResult` types stay live — only `runRcaAnalysis` (the
 * network-shaped call) is replaced.
 */
const mocks = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(async () => ({ userId: 'admin-1', email: 'a@b.c' })),
  fetchFingerprintDetail: vi.fn(),
  runRcaAnalysis: vi.fn(),
  logServerError: vi.fn(),
  inserted: [] as Array<Record<string, unknown>>,
  insertError: null as { message: string } | null,
  selectResult: { data: null as { metadata: unknown } | null, error: null as { message: string } | null },
}));

vi.mock('@/lib/admin/require-super-admin', () => ({ requireSuperAdmin: mocks.requireSuperAdmin }));
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
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: () => Promise.resolve(mocks.selectResult),
                }),
              }),
            }),
          }),
        }),
      };
    },
  }),
}));

import { analyzeErrorFingerprint, getStoredRcaAnalysis } from '@/app/admin/actions/analyze-error';

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
  mocks.requireSuperAdmin.mockClear();
  mocks.requireSuperAdmin.mockResolvedValue({ userId: 'admin-1', email: 'a@b.c' });
  mocks.fetchFingerprintDetail.mockReset();
  mocks.runRcaAnalysis.mockReset();
  mocks.logServerError.mockReset();
  mocks.inserted.length = 0;
  mocks.insertError = null;
  mocks.selectResult = { data: null, error: null };
});

describe('analyzeErrorFingerprint', () => {
  it('is super-admin gated on the first line — throws before touching the detail fetch', async () => {
    mocks.requireSuperAdmin.mockRejectedValue(new Error('Forbidden'));

    await expect(analyzeErrorFingerprint('fp-1')).rejects.toThrow('Forbidden');
    expect(mocks.fetchFingerprintDetail).not.toHaveBeenCalled();
  });

  it('rejects a blank fingerprint without calling the detail fetch', async () => {
    const result = await analyzeErrorFingerprint('   ');
    expect(result).toEqual({ status: 'error', message: 'A fingerprint is required.' });
    expect(mocks.fetchFingerprintDetail).not.toHaveBeenCalled();
  });

  it('surfaces a detail-fetch failure as a typed error instead of throwing', async () => {
    mocks.fetchFingerprintDetail.mockRejectedValue(new Error('query blew up'));

    const result = await analyzeErrorFingerprint('fp-1');

    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.message).toContain('query blew up');
    expect(mocks.runRcaAnalysis).not.toHaveBeenCalled();
  });

  it('returns an error for a fingerprint with no events, without calling the model', async () => {
    mocks.fetchFingerprintDetail.mockResolvedValue({ events: [], report: '', summary: {} });

    const result = await analyzeErrorFingerprint('fp-1');

    expect(result).toEqual({ status: 'error', message: 'No events found for this fingerprint.' });
    expect(mocks.runRcaAnalysis).not.toHaveBeenCalled();
  });

  it('assembles the context from the fingerprint detail and calls runRcaAnalysis with it', async () => {
    mocks.fetchFingerprintDetail.mockResolvedValue(detailWithEvents);
    mocks.runRcaAnalysis.mockResolvedValue({ status: 'ok', analysis: okAnalysis });

    await analyzeErrorFingerprint('fp-1');

    const call = mocks.runRcaAnalysis.mock.calls[0]?.[0];
    expect(call.fingerprint).toBe('fp-1');
    // Only the newest event carries a stack trace.
    expect(call.rawStacks).toEqual(['Error: boom\n    at foo (a.ts:1:1)']);
    // No ACCESS_PHRASES/EMPTY_STATE/INTEGRATION/TELEMETRY match and no
    // errorCode -> falls to the severity ladder for an 'error' row.
    expect(call.classificationKind).toBe('defect');
    // feature is null on every event, so resolveActionFilePath short-circuits.
    expect(call.sourceFilePath).toBeNull();
    expect(call.nearbyDeploys).toEqual(detailWithEvents.summary.nearbyDeploys);
    // Rebuilt via buildIncidentReport from the events themselves, NOT
    // `detail.report` — the fixture's raw 'REPORT TEXT' must never appear
    // (data/errors.ts's own report is built from unfiltered rows; see
    // isOwnRcaAnalysisRow's doc comment).
    expect(call.incidentReport).toContain('# Incident report: Boom');
    expect(call.incidentReport).toContain('insert failed');
    expect(call.incidentReport).not.toContain('REPORT TEXT');
  });

  it('excludes its own prior analysis rows from context, even though fetchFingerprintDetail hands them back unfiltered', async () => {
    // fetchFingerprintDetail (data/errors.ts) scopes only by fingerprint, so
    // a prior rca_analysis row for this SAME fingerprint comes back as just
    // another — and here the NEWEST — occurrence. Without the defensive
    // filter this becomes `last`, and the whole analysis grounds itself on
    // its own previous output instead of the real incident.
    const priorAnalysisRow = {
      id: 'e3',
      title: 'RCA analysis: fp-1',
      message: null,
      severity: 'info' as const,
      created_at: '2026-08-25T11:00:00.000Z', // newest by created_at
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

    await analyzeErrorFingerprint('fp-1');

    const call = mocks.runRcaAnalysis.mock.calls[0]?.[0];
    // Still classifies off the real incident (severity 'error'), not the
    // analysis row's own severity:'info', which would otherwise fall to
    // 'telemetry' on the severity ladder.
    expect(call.classificationKind).toBe('defect');
    expect(call.incidentReport).not.toContain('RCA analysis: fp-1');
    expect(call.incidentReport).toContain('Boom');
  });

  it('persists a successful analysis as a born-resolved rca_analysis row', async () => {
    mocks.fetchFingerprintDetail.mockResolvedValue(detailWithEvents);
    mocks.runRcaAnalysis.mockResolvedValue({ status: 'ok', analysis: okAnalysis });

    const result = await analyzeErrorFingerprint('fp-1');

    expect(result).toEqual({ status: 'ok', analysis: okAnalysis });
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
    expect(typeof row.resolved_at).toBe('string');
  });

  it('does not persist anything for an unconfigured result', async () => {
    mocks.fetchFingerprintDetail.mockResolvedValue(detailWithEvents);
    mocks.runRcaAnalysis.mockResolvedValue({
      status: 'unconfigured',
      message: 'Root-cause analysis needs ANTHROPIC_API_KEY configured — set it and retry.',
    });

    const result = await analyzeErrorFingerprint('fp-1');

    expect(result.status).toBe('unconfigured');
    expect(mocks.inserted).toHaveLength(0);
  });

  it('does not persist anything for a model-error result', async () => {
    mocks.fetchFingerprintDetail.mockResolvedValue(detailWithEvents);
    mocks.runRcaAnalysis.mockResolvedValue({ status: 'error', message: 'model unavailable' });

    const result = await analyzeErrorFingerprint('fp-1');

    expect(result).toEqual({ status: 'error', message: 'model unavailable' });
    expect(mocks.inserted).toHaveLength(0);
  });

  it('still returns the ok analysis to the caller even when persistence itself fails', async () => {
    mocks.fetchFingerprintDetail.mockResolvedValue(detailWithEvents);
    mocks.runRcaAnalysis.mockResolvedValue({ status: 'ok', analysis: okAnalysis });
    mocks.insertError = { message: 'insert failed' };

    const result = await analyzeErrorFingerprint('fp-1');

    expect(result).toEqual({ status: 'ok', analysis: okAnalysis });
    expect(mocks.logServerError).toHaveBeenCalledTimes(1);
    expect(mocks.logServerError.mock.calls[0]?.[0]).toContain('fp-1');
  });
});

describe('getStoredRcaAnalysis', () => {
  it('is super-admin gated on the first line', async () => {
    mocks.requireSuperAdmin.mockRejectedValue(new Error('Forbidden'));

    await expect(getStoredRcaAnalysis('fp-1')).rejects.toThrow('Forbidden');
  });

  it('returns null for a blank fingerprint', async () => {
    expect(await getStoredRcaAnalysis('  ')).toBeNull();
  });

  it('returns null when no stored analysis exists — a genuine empty state, not an error', async () => {
    mocks.selectResult = { data: null, error: null };
    expect(await getStoredRcaAnalysis('fp-1')).toBeNull();
  });

  it('returns null when the query itself errors', async () => {
    mocks.selectResult = { data: null, error: { message: 'boom' } };
    expect(await getStoredRcaAnalysis('fp-1')).toBeNull();
  });

  it('returns the parsed analysis when a valid row is stored', async () => {
    mocks.selectResult = { data: { metadata: okAnalysis }, error: null };
    expect(await getStoredRcaAnalysis('fp-1')).toEqual(okAnalysis);
  });

  it('returns null rather than a malformed object when the stored metadata fails validation', async () => {
    mocks.selectResult = { data: { metadata: { probableCause: 'incomplete row' } }, error: null };
    expect(await getStoredRcaAnalysis('fp-1')).toBeNull();
  });
});
