// Regression pack — #415: stat event import review-band server authority.
//
// The issue: commitEventImport must recompute the auto-commit band
// server-side from the raw file bytes whenever they're available, rather
// than trusting a client-supplied `detectionAutoCommit` echo — a stale or
// tampered client could otherwise claim `auto_commit_silent` for a file the
// server would have classified `hold_for_review` or `do_not_commit`.
//
// This test drives the real commitEventImport body with a table-recording
// fake Supabase client (same pattern as imports-registry.test.ts) and mocks
// only the pure parse/detect layer (@/lib/baseball/adapters) so the
// server-recompute branch is fully controllable. applyEventImportPlan (the
// event-row write core) is never reached by the do_not_commit /
// hold_for_review assertions below, since both paths return before it runs.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/baseball/with-baseball-action', () => ({
  withBaseballAction:
    (_name: string, _opts: unknown, fn: (ctx: unknown, ...a: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn(
        { user: { id: 'user-1' }, activeCoachId: 'coach-1', targetTeamId: 'team-1', activeTeamId: 'team-1' },
        ...args,
      ),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/baseball/import-raw-file-storage', () => ({
  uploadImportRawFile: vi.fn(async () => null),
  signImportRawFileUrl: vi.fn(async () => null),
}));

/** Controlled per-test: what the "server recompute" band resolves to. */
let serverDetectedBand: 'auto_commit_silent' | 'auto_commit_warn' | 'hold_for_review' | 'do_not_commit' = 'auto_commit_silent';

vi.mock('@/lib/baseball/adapters', async () => {
  const actual = await vi.importActual<typeof import('@/lib/baseball/adapters')>('@/lib/baseball/adapters');
  return {
    ...actual,
    hasConcreteEventAdapter: vi.fn(() => true),
    validateEventRows: vi.fn(() => []),
    getConcreteParser: vi.fn(() => (_body: string) => ({
      sourceKey: 'trackman_csv',
      rows: [],
      rowsRead: 10,
      warnings: [],
      preservedText: '',
    })),
    detectFromParse: vi.fn(() => ({
      detectedSource: 'trackman_csv',
      grains: ['pitch'],
      trustCeiling: 'official',
      autoCommit: serverDetectedBand,
    })),
  };
});

type Row = Record<string, unknown>;
const inserted: Record<string, Row[]> = {};

function tableHandle(table: string) {
  const result = (data: unknown) => ({ data, error: null });
  const chain: Record<string, unknown> = {};
  const ret = () => chain;
  for (const m of ['select', 'eq', 'in', 'or', 'order', 'limit']) chain[m] = vi.fn(ret);

  // Import-source registry lookup (assertImportSourceAllowed): unregistered
  // source, so it's allowed by default. Also used for baseball_stat_sources
  // lookups inside resolveSourceId.
  chain.then = (resolve: (v: unknown) => unknown) => resolve(result([]));
  chain.maybeSingle = vi.fn(async () => result(null));
  chain.single = vi.fn(async () => {
    if (table === 'baseball_import_runs') return result({ id: 'run-1' });
    return result({ id: `${table}-1` });
  });

  chain.insert = vi.fn((rows: Row | Row[]) => {
    (inserted[table] ??= []).push(...(Array.isArray(rows) ? rows : [rows]));
    const idResult = table === 'baseball_import_runs' ? result({ id: 'run-1' }) : result({ id: `${table}-1` });
    return {
      select: vi.fn(() => ({
        single: vi.fn(async () => idResult),
        maybeSingle: vi.fn(async () => idResult),
      })),
      then: (r: (v: unknown) => unknown) => r(result(null)),
    };
  });
  chain.update = vi.fn((row: Row) => {
    (inserted[`${table}:update`] ??= []).push(row);
    return { eq: vi.fn(() => ({ then: (r: (v: unknown) => unknown) => r(result(null)) })) };
  });

  return chain;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => tableHandle(table),
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
  })),
}));

import { commitEventImport } from '@/app/baseball/actions/stat-event-imports';

function baseArgs(overrides: Record<string, unknown> = {}) {
  return {
    teamId: 'team-1',
    sourceKey: 'trackman_csv' as const,
    fileName: 'session.csv',
    rows: [],
    resolutionOverrides: [],
    ...overrides,
  };
}

beforeEach(() => {
  for (const k of Object.keys(inserted)) delete inserted[k];
  serverDetectedBand = 'auto_commit_silent';
});

describe('commitEventImport review-band server authority (#415)', () => {
  it('do_not_commit (server-recomputed) throws before any run/event rows are written', async () => {
    serverDetectedBand = 'do_not_commit';
    await expect(
      commitEventImport(baseArgs({ rawFileBody: 'garbage,data\n1,2', detectionAutoCommit: 'auto_commit_silent' })),
    ).rejects.toThrow(/cannot be committed automatically/i);
    expect(inserted['baseball_import_runs'] ?? []).toHaveLength(0);
  });

  it('server recompute OVERRIDES a forged high-confidence client detectionAutoCommit', async () => {
    // The client claims auto_commit_silent (as if a stale/tampered UI state),
    // but the server, given the raw bytes, recomputes do_not_commit. The
    // server's recomputation must win.
    serverDetectedBand = 'do_not_commit';
    await expect(
      commitEventImport(
        baseArgs({ rawFileBody: 'real-file-bytes', detectionAutoCommit: 'auto_commit_silent' }),
      ),
    ).rejects.toThrow(/cannot be committed automatically/i);
  });

  it('hold_for_review (server-recomputed) stages the run with ZERO event-row writes', async () => {
    serverDetectedBand = 'hold_for_review';
    const result = await commitEventImport(
      baseArgs({ rawFileBody: 'ambiguous-file-bytes', detectionAutoCommit: 'auto_commit_silent' }),
    );

    expect(result.heldForReview).toBe(true);
    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);

    const runHeader = (inserted['baseball_import_runs'] ?? [])[0];
    expect(runHeader?.status).toBe('review');
    expect(runHeader?.review_state).toBe('pending_review');

    const staged = (inserted['baseball_stat_uploads'] ?? [])[0];
    expect(staged).toBeTruthy();
    expect(staged?.status).toBe('needs_review');
    expect((staged?.unmatched_data as Record<string, unknown>)?.staged).toBe(true);

    // No event-grain table received an insert.
    expect(inserted['baseball_pitch_events'] ?? []).toHaveLength(0);
    expect(inserted['baseball_batted_ball_events'] ?? []).toHaveLength(0);
    expect(inserted['baseball_swing_events'] ?? []).toHaveLength(0);
  });

  it('without rawFileBody, the server falls back to the client-echoed band (documented current behavior)', async () => {
    // No rawFileBody => no server recompute is possible; the action falls
    // back to args.detectionAutoCommit. This is the one path where a
    // forged client value would still be trusted — tracked as a residual
    // #415 follow-up rather than silently assumed safe.
    const result = await commitEventImport(
      baseArgs({ detectionAutoCommit: 'hold_for_review' }),
    );
    expect(result.heldForReview).toBe(true);
  });
});
