import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the terminal dependency (matches src/lib/admin/__tests__/rls-denial.test.ts)
// so we exercise the REAL isRlsDenial/maybeCaptureRlsDenial logic end-to-end
// without hitting Sentry/Supabase — RLS-denial detection stays centralized in
// rls-denial.ts, not duplicated here.
const mocks = vi.hoisted(() => ({
  logServerEvent: vi.fn(async (..._args: unknown[]) => {}),
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerEvent: mocks.logServerEvent,
}));

import { fetchAllRows, fetchAllRowsResult, type RlsCaptureCtx } from '@/lib/supabase/fetch-all-rows';

type Row = { id: number };
type QueryError = { message: string; code?: string | null };

function page(rows: Row[], error: QueryError | null = null) {
  return async (_from: number, _to: number) => (error ? { data: null, error } : { data: rows, error: null });
}

describe('fetchAllRows', () => {
  beforeEach(() => mocks.logServerEvent.mockClear());

  it('unchanged contract: paginates across pages and returns all rows on success', async () => {
    let call = 0;
    const rows = await fetchAllRows<Row>(async () => {
      call += 1;
      if (call === 1) {
        return { data: Array.from({ length: 3 }, (_, i) => ({ id: i })), error: null };
      }
      return { data: [{ id: 3 }], error: null };
    }, 3);
    expect(rows).toEqual([{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }]);
  });

  it('unchanged contract: throws `fetchAllRows: <message>` on a first-page error', async () => {
    await expect(
      fetchAllRows<Row>(page([], { message: 'boom', code: '23505' })),
    ).rejects.toThrow('fetchAllRows: boom');
  });

  it('accepts a PostgREST-shaped error at the type level (widened error type includes code)', async () => {
    type PostgrestErrorLike = { message: string; details: string; hint: string; code: string; name: string };
    const err: PostgrestErrorLike = {
      message: 'permission denied for table golf_rounds',
      details: '',
      hint: '',
      code: '42501',
      name: 'PostgrestError',
    };
    await expect(fetchAllRows<Row>(async () => ({ data: null, error: err }))).rejects.toThrow();
  });

  it('a 42501 first-page error captures exactly one RLS denial with the passed ctx, and still throws', async () => {
    const ctx: RlsCaptureCtx = {
      table: 'golf_rounds',
      action: 'loadRounds',
      feature: 'round_tracking',
      sport: 'golf',
      userId: 'u1',
    };

    await expect(
      fetchAllRows<Row>(
        page([], { message: 'permission denied for table golf_rounds', code: '42501' }),
        1000,
        ctx,
      ),
    ).rejects.toThrow('fetchAllRows: permission denied for table golf_rounds');

    expect(mocks.logServerEvent).toHaveBeenCalledTimes(1);
    const [message, eventCtx, severity] = mocks.logServerEvent.mock.calls[0]!;
    expect(message).toContain('RLS denial');
    expect(eventCtx).toMatchObject({
      source: 'rls_denial',
      action: 'loadRounds',
      sport: 'golf',
      feature: 'round_tracking',
      userId: 'u1',
      errorCode: '42501',
      metadata: { table: 'golf_rounds', verb: 'select' },
    });
    expect(severity).toBe('warning');
  });

  it('non-denial errors capture nothing, even with an explicit ctx', async () => {
    await expect(
      fetchAllRows<Row>(
        page([], { message: 'duplicate key value', code: '23505' }),
        1000,
        { table: 'golf_rounds', action: 'loadRounds' },
      ),
    ).rejects.toThrow('fetchAllRows: duplicate key value');
    expect(mocks.logServerEvent).not.toHaveBeenCalled();
  });

  it('omitted rlsCtx still captures with table:"unknown" when the message matches the isRlsDenial regex fallback', async () => {
    await expect(
      fetchAllRows<Row>(
        page([], { message: 'new row violates row-level security policy for table "x"' }),
      ),
    ).rejects.toThrow();
    expect(mocks.logServerEvent).toHaveBeenCalledTimes(1);
    const [, eventCtx] = mocks.logServerEvent.mock.calls[0]!;
    expect(eventCtx).toMatchObject({ metadata: { table: 'unknown' } });
  });

  it('omitted rlsCtx captures nothing when the error does not look like a denial', async () => {
    await expect(
      fetchAllRows<Row>(page([], { message: 'network timeout' })),
    ).rejects.toThrow();
    expect(mocks.logServerEvent).not.toHaveBeenCalled();
  });
});

describe('fetchAllRowsResult', () => {
  beforeEach(() => mocks.logServerEvent.mockClear());

  it('unchanged contract: returns {data, error:null} across pages on success', async () => {
    const { data, error } = await fetchAllRowsResult<Row>(page([{ id: 1 }]));
    expect(error).toBeNull();
    expect(data).toEqual([{ id: 1 }]);
  });

  it('unchanged contract: returns {data:null, error} on a first-page error', async () => {
    const { data, error } = await fetchAllRowsResult<Row>(page([], { message: 'boom', code: '23505' }));
    expect(data).toBeNull();
    expect(error).toEqual({ message: 'boom', code: '23505' });
  });

  it('a 42501 first-page error captures exactly one RLS denial with the passed ctx, and still returns {data:null, error}', async () => {
    const ctx: RlsCaptureCtx = {
      table: 'golf_shots',
      action: 'loadShots',
      feature: 'round_tracking',
      sport: 'golf',
    };

    const { data, error } = await fetchAllRowsResult<Row>(
      page([], { message: 'permission denied for table golf_shots', code: '42501' }),
      1000,
      ctx,
    );

    expect(data).toBeNull();
    expect(error).toEqual({ message: 'permission denied for table golf_shots', code: '42501' });
    expect(mocks.logServerEvent).toHaveBeenCalledTimes(1);
    const [, eventCtx] = mocks.logServerEvent.mock.calls[0]!;
    expect(eventCtx).toMatchObject({
      source: 'rls_denial',
      action: 'loadShots',
      sport: 'golf',
      feature: 'round_tracking',
      errorCode: '42501',
      metadata: { table: 'golf_shots', verb: 'select' },
    });
  });

  it('non-denial errors capture nothing, even with an explicit ctx', async () => {
    const { data, error } = await fetchAllRowsResult<Row>(
      page([], { message: 'dup', code: '23505' }),
      1000,
      { table: 'golf_shots', action: 'loadShots' },
    );
    expect(data).toBeNull();
    expect(error).toEqual({ message: 'dup', code: '23505' });
    expect(mocks.logServerEvent).not.toHaveBeenCalled();
  });

  it('omitted rlsCtx still captures with table:"unknown" when the message matches the isRlsDenial regex fallback', async () => {
    const { data, error } = await fetchAllRowsResult<Row>(
      page([], { message: 'violates row-level security policy for table "y"' }),
    );
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(mocks.logServerEvent).toHaveBeenCalledTimes(1);
    const [, eventCtx] = mocks.logServerEvent.mock.calls[0]!;
    expect(eventCtx).toMatchObject({ metadata: { table: 'unknown' } });
  });

  it('omitted rlsCtx captures nothing when the error does not look like a denial', async () => {
    const { data, error } = await fetchAllRowsResult<Row>(page([], { message: 'timeout' }));
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(mocks.logServerEvent).not.toHaveBeenCalled();
  });
});
