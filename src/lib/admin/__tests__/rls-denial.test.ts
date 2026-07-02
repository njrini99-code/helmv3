import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  // Typed with a variadic rest param (not `()`) so `.mock.calls[0]` below is
  // `unknown[]` and destructurable — `vi.fn(async () => {})` infers a
  // zero-arity tuple and TS rejects indexing it.
  logServerEvent: vi.fn(async (..._args: unknown[]) => {}),
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerEvent: mocks.logServerEvent,
}));

import { isRlsDenial, maybeCaptureRlsDenial } from '@/lib/admin/rls-denial';

describe('isRlsDenial', () => {
  it('detects 42501', () => {
    expect(isRlsDenial({ code: '42501', message: 'permission denied' })).toBe(true);
  });
  it('detects row-level security message text (PostgREST shapes vary)', () => {
    expect(isRlsDenial({ code: null, message: 'new row violates row-level security policy for table "golf_rounds"' })).toBe(true);
  });
  it('ignores ordinary errors and nulls', () => {
    expect(isRlsDenial({ code: '23505', message: 'duplicate key' })).toBe(false);
    expect(isRlsDenial(null)).toBe(false);
  });
});

describe('maybeCaptureRlsDenial', () => {
  beforeEach(() => mocks.logServerEvent.mockClear());

  it('emits a warning event with source=rls_denial for a denial', () => {
    maybeCaptureRlsDenial(
      { code: '42501', message: 'permission denied for table golf_rounds' },
      { table: 'golf_rounds', verb: 'update', action: 'saveRound', userId: 'u1', sport: 'golf' },
    );
    expect(mocks.logServerEvent).toHaveBeenCalledTimes(1);
    const [message, ctx, severity] = mocks.logServerEvent.mock.calls[0]!;
    expect(message).toContain('RLS denial');
    expect(ctx).toMatchObject({ source: 'rls_denial', sport: 'golf', errorCode: '42501', action: 'saveRound' });
    expect(severity).toBe('warning');
  });
  it('does nothing for non-denials', () => {
    maybeCaptureRlsDenial({ code: '23505', message: 'dup' }, { table: 't', verb: 'insert', action: 'x' });
    expect(mocks.logServerEvent).not.toHaveBeenCalled();
  });
  it('never throws even if the logger rejects', () => {
    mocks.logServerEvent.mockRejectedValueOnce(new Error('logger down'));
    expect(() =>
      maybeCaptureRlsDenial({ code: '42501', message: 'denied' }, { table: 't', verb: 'select', action: 'x' }),
    ).not.toThrow();
  });
});
