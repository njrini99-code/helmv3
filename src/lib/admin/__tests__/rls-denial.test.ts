/**
 * @vitest-environment node
 *
 * Server-module test. The default project environment is jsdom, which
 * defines `window` — and rls-denial.ts gates its capture on
 * `typeof window === 'undefined'` so server-only logging never lands in a
 * client bundle. Under jsdom that guard is false, the capture branch never
 * runs, and these assertions silently test nothing. Pin to node so the code
 * path under test is the one that actually executes on the server.
 */
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

import { isRlsDenial, maybeCaptureRlsDenial, flushRlsDenialLogs } from '@/lib/admin/rls-denial';

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

  it('emits a warning event with source=rls_denial for a denial', async () => {
    const captured = maybeCaptureRlsDenial(
      { code: '42501', message: 'permission denied for table golf_rounds' },
      { table: 'golf_rounds', verb: 'update', action: 'saveRound', userId: 'u1', sport: 'golf' },
    );
    expect(captured).toBe(true);
    await flushRlsDenialLogs();
    expect(mocks.logServerEvent).toHaveBeenCalledTimes(1);
    const [message, ctx, severity] = mocks.logServerEvent.mock.calls[0]!;
    expect(message).toContain('RLS denial');
    expect(ctx).toMatchObject({ source: 'rls_denial', sport: 'golf', errorCode: '42501', action: 'saveRound' });
    expect(severity).toBe('warning');
  });
  it('does nothing for non-denials', async () => {
    maybeCaptureRlsDenial({ code: '23505', message: 'dup' }, { table: 't', verb: 'insert', action: 'x' });
    await flushRlsDenialLogs();
    expect(mocks.logServerEvent).not.toHaveBeenCalled();
  });

  it('returns true when it captures a denial, false otherwise — callers gate their own generic logging on this', () => {
    const capturedDenial = maybeCaptureRlsDenial(
      { code: '42501', message: 'permission denied for table golf_rounds' },
      { table: 'golf_rounds', verb: 'update', action: 'saveRound' },
    );
    expect(capturedDenial).toBe(true);

    const capturedNonDenial = maybeCaptureRlsDenial(
      { code: '23505', message: 'dup' },
      { table: 't', verb: 'insert', action: 'x' },
    );
    expect(capturedNonDenial).toBe(false);
  });
  it('never throws even if the logger rejects', async () => {
    mocks.logServerEvent.mockRejectedValueOnce(new Error('logger down'));
    expect(() =>
      maybeCaptureRlsDenial({ code: '42501', message: 'denied' }, { table: 't', verb: 'select', action: 'x' }),
    ).not.toThrow();
    await expect(flushRlsDenialLogs()).resolves.toBeUndefined();
  });

  it('carries an explicit feature through to the emitted context', async () => {
    maybeCaptureRlsDenial(
      { code: '42501', message: 'denied' },
      { table: 'golf_courses', verb: 'update', action: 'updateCourse', feature: 'course_library' },
    );
    await flushRlsDenialLogs();
    const [, ctx] = mocks.logServerEvent.mock.calls[0]!;
    expect(ctx).toMatchObject({ feature: 'course_library' });
  });

  it('defaults feature from the table map (featureForTable) when omitted', async () => {
    maybeCaptureRlsDenial(
      { code: '42501', message: 'denied' },
      { table: 'golf_rounds', verb: 'update', action: 'saveRound' },
    );
    await flushRlsDenialLogs();
    const [, ctx] = mocks.logServerEvent.mock.calls[0]!;
    expect(ctx).toMatchObject({ feature: 'round_tracking' });
  });

  it('feature is null for an unrecognized table with no explicit override', async () => {
    maybeCaptureRlsDenial(
      { code: '42501', message: 'denied' },
      { table: 'some_unregistered_table', verb: 'select', action: 'x' },
    );
    await flushRlsDenialLogs();
    const [, ctx] = mocks.logServerEvent.mock.calls[0]!;
    expect(ctx).toMatchObject({ feature: null });
  });
});
