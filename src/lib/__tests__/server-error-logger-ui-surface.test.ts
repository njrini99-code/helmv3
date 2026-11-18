/**
 * A server error raised while serving Clubhouse carries `ui: 'clubhouse'` into error_logs and admin_events, so the
 * Bridge's Clubhouse-only views (src/lib/admin/bridge-scope.ts) see it. Before 2026-11-17 only chLogServer passed the
 * tag; a server action, a CoachHelm chat turn or a round save logged with none.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
  scope: {
    setLevel: vi.fn(), setTag: vi.fn(), setUser: vi.fn(),
    setContext: vi.fn(), setFingerprint: vi.fn(),
  },
  isolation: {} as Record<string, unknown>,
  isolationThrows: false,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        gte: () => chain,
        order: () => chain,
        limit: async () => ({ data: [], error: null }),
        upsert: (row: Record<string, unknown>) => {
          mocks.inserts.push({ table, row });
          return Promise.resolve({ data: null, error: null });
        },
      };
      return chain;
    },
  }),
}));

vi.mock('@sentry/nextjs', () => ({
  withScope: (fn: (scope: unknown) => void) => fn(mocks.scope),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  getIsolationScope: () => ({
    getScopeData: () => {
      if (mocks.isolationThrows) throw new Error('scope unavailable');
      return mocks.isolation;
    },
  }),
}));

import { logServerError } from '@/lib/server-error-logger';

const rowFor = (table: string) => mocks.inserts.find((i) => i.table === table)?.row;
const contextOf = (table: string) =>
  (table === 'error_logs' ? rowFor(table)?.context : rowFor(table)?.metadata) as Record<string, unknown> | undefined;

describe('server-error-logger: the request UI reaches both Bridge tables', () => {
  beforeEach(() => {
    mocks.inserts.length = 0;
    mocks.isolation = {};
    mocks.isolationThrows = false;
    for (const fn of Object.values(mocks.scope)) fn.mockClear();
    vi.stubEnv('ADMIN_EVENTS_FORCE_CAPTURE', '1');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('tags an untagged log from a Clubhouse render (the gate.ts isolation tag)', async () => {
    mocks.isolation = { tags: { ui: 'clubhouse' } };
    await logServerError('chat/stream: context resolution failed', { action: 'v3.chat.stream.ctx' });

    for (const table of ['error_logs', 'admin_events']) {
      const ctx = contextOf(table);
      expect(ctx?.ui).toBe('clubhouse');
      expect((ctx?.tags as Record<string, unknown>).ui).toBe('clubhouse');
    }
    expect(mocks.scope.setTag).toHaveBeenCalledWith('ui', 'clubhouse');
  });

  it('tags a server action by the Clubhouse page it posted to', async () => {
    mocks.isolation = {
      tags: {},
      sdkProcessingMetadata: { normalizedRequest: { url: 'https://helm.example/golf/dashboard/rounds/new', headers: {} } },
    };
    await logServerError('Auto-save failed', { action: 'savePartialRound' });
    expect(contextOf('admin_events')?.ui).toBe('clubhouse');
  });

  it('keeps an explicit ui tag from the caller', async () => {
    mocks.isolation = { tags: { ui: 'clubhouse' } };
    await logServerError('x', { action: 'a', tags: { ui: 'other', surface: 's' } });
    const ctx = contextOf('error_logs');
    expect(ctx?.ui).toBe('other');
    expect(ctx?.tags).toEqual({ ui: 'other', surface: 's' });
  });

  it('leaves a cron log untagged and its row shape unchanged', async () => {
    mocks.isolation = {
      tags: {},
      sdkProcessingMetadata: { normalizedRequest: { url: 'https://helm.example/api/cron/admin-digest', headers: {} } },
    };
    await logServerError('digest failed', { action: 'cron.admin-digest' });
    const ctx = contextOf('admin_events');
    expect(ctx).toBeDefined();
    expect('ui' in (ctx ?? {})).toBe(false);
    expect(ctx?.tags).toEqual({});
  });

  it('still writes the row when the isolation scope cannot be read', async () => {
    mocks.isolationThrows = true;
    await logServerError('x', { action: 'a' });
    expect(rowFor('error_logs')).toBeDefined();
    expect('ui' in (contextOf('error_logs') ?? {})).toBe(false);
  });
});
