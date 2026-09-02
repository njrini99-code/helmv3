import { describe, expect, it } from 'vitest';
import { postgrestErrorContext, toPostgrestError } from '@/lib/utils/describe-error';

/**
 * These two helpers exist to replace `new Error(err.message)`, which discarded
 * `code`/`details`/`hint` at ~50 call sites and left the Bridge's ERROR CODE
 * column blank for every Supabase failure reported from the client.
 */
const RLS_DENIAL = {
  message: 'new row violates row-level security policy for table "golf_conversations"',
  code: '42501',
  details: null,
  hint: 'Check the INSERT policy for the authenticated role.',
};

describe('toPostgrestError', () => {
  it('puts the Postgres code on .name — the only channel /api/log-error reads', () => {
    const err = toPostgrestError(RLS_DENIAL);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('42501');
  });

  it('leaves .message byte-identical to the driver text', () => {
    expect(toPostgrestError(RLS_DENIAL).message).toBe(RLS_DENIAL.message);
  });

  it('keeps details OUT of the message so fingerprints stay stable', () => {
    const a = toPostgrestError({
      message: 'duplicate key value violates unique constraint',
      code: '23505',
      details: 'Key (id)=(aaaa-1111) already exists.',
    });
    const b = toPostgrestError({
      message: 'duplicate key value violates unique constraint',
      code: '23505',
      details: 'Key (id)=(bbbb-2222) already exists.',
    });
    expect(a.message).toBe(b.message);
    expect(a.name).toBe(b.name);
  });

  it('passes a real Error straight through untouched', () => {
    const original = new TypeError('fetch failed');
    expect(toPostgrestError(original)).toBe(original);
  });

  it('falls back to describeError when there is no message', () => {
    expect(toPostgrestError({ code: '57014' }).message).toContain('57014');
    expect(toPostgrestError(null).message).toBe('unknown');
  });

  it('leaves .name as "Error" for a transport failure with an empty code', () => {
    const err = toPostgrestError({ message: 'TypeError: fetch failed', code: '' });
    expect(err.name).toBe('Error');
  });
});

describe('postgrestErrorContext', () => {
  it('uses the names incident-report.ts actually renders', () => {
    expect(postgrestErrorContext(RLS_DENIAL)).toEqual({
      errorCode: '42501',
      errorHint: 'Check the INSERT policy for the authenticated role.',
      errorDetails: null,
    });
  });

  it('nulls empty strings rather than emitting blank fields', () => {
    expect(postgrestErrorContext({ code: '', hint: '', details: '' })).toEqual({
      errorCode: null,
      errorHint: null,
      errorDetails: null,
    });
  });

  it('survives a non-object', () => {
    expect(postgrestErrorContext('boom')).toEqual({
      errorCode: null,
      errorHint: null,
      errorDetails: null,
    });
  });
});
