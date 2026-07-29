import { describe, it, expect } from 'vitest';
import { describeError } from '@/lib/utils/describe-error';

describe('describeError', () => {
  // ── The safety net had the original bug inside it ────────────────────────
  // Production, 2026-07-29: `[recurring_events.editRecurringEvent]
  // [editRecurringEvent Error]: [object Object]`, logged twice while a coach
  // failed to edit a recurring event — from a call site that DOES use
  // describeError. The circular-reference catch fell back to `String(err)`,
  // which is exactly the value this module exists to eliminate.

  it('never returns "[object Object]" for a CIRCULAR object', () => {
    const circular: Record<string, unknown> = { code: '', message: '' };
    circular.self = circular;

    const described = describeError(circular);

    expect(described).not.toBe('[object Object]');
    expect(described).toContain('keys=');
  });

  it('never returns "[object Object]" when a BigInt makes the value unserializable', () => {
    // JSON.stringify throws TypeError on BigInt, same catch, same old outcome.
    const described = describeError({ attempted: BigInt(10), retries: BigInt(3) });
    expect(described).not.toBe('[object Object]');
    expect(described).toContain('attempted');
  });

  it('does not return the string "undefined" when JSON.stringify yields undefined', () => {
    // A function/symbol serializes to `undefined`, which never reached the
    // catch at all — so a try/catch alone would not have fixed this one.
    const described = describeError({ handler: () => {} } as unknown);
    expect(described).not.toBe('undefined');
    expect(described).not.toBe('[object Object]');
    expect(described).toContain('handler');
  });

  it('surfaces a message field even when the value cannot be serialized', () => {
    const circular: Record<string, unknown> = { message: 'update failed' };
    circular.self = circular;
    expect(describeError(circular)).toContain('update failed');
  });

  it('names the constructor when it falls through to the shape describer', () => {
    // No message/code/details/hint, so it does NOT take the Postgrest branch —
    // an earlier draft of this test gave the class a `message` and then
    // asserted the constructor name, which fails correctly: a value WITH a
    // message should report the message, not its shape.
    class WeirdTransportError {
      retries = BigInt(10);
      self?: unknown;
    }
    const e = new WeirdTransportError();
    e.self = e;
    expect(describeError(e)).toContain('WeirdTransportError');
  });

  it('unwraps a real Error instance to its message', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
  });

  it('returns a plain string unchanged', () => {
    expect(describeError('already a string')).toBe('already a string');
  });

  it('serializes a Supabase PostgrestError-shaped object into code/msg/details/hint — never "[object Object]"', () => {
    // This is the exact incident shape: PostgrestError is a plain object,
    // NOT an Error instance, so `error instanceof Error ? error.message :
    // String(error)` used to fall through to String(error) === "[object Object]".
    const postgrestError = {
      code: '42P01',
      message: 'relation "crm_coach_engagement" does not exist',
      details: 'matview missing',
      hint: 'run the refresh job',
    };

    const described = describeError(postgrestError);

    expect(described).not.toBe('[object Object]');
    expect(described).toContain('42P01');
    expect(described).toContain('relation "crm_coach_engagement" does not exist');
    expect(described).toContain('matview missing');
    expect(described).toContain('run the refresh job');
  });

  it('serializes a partial Postgrest-shaped object (missing hint/details) without dropping what is present', () => {
    const described = describeError({ code: '23505', message: 'duplicate key value' });
    expect(described).not.toBe('[object Object]');
    expect(described).toContain('23505');
    expect(described).toContain('duplicate key value');
  });

  it('falls back to JSON.stringify for a plain object with no code/message/details/hint', () => {
    const described = describeError({ foo: 'bar', n: 1 });
    expect(described).not.toBe('[object Object]');
    expect(described).toBe('{"foo":"bar","n":1}');
  });

  it('never throws on a circular object, even without a code/message to fall back on', () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    expect(() => describeError(circular)).not.toThrow();
    expect(typeof describeError(circular)).toBe('string');
  });

  it('prefers the code/message/details/hint summary over JSON.stringify even when the object is otherwise circular', () => {
    const circular: Record<string, unknown> = { code: '500', message: 'circular but diagnosable' };
    circular.self = circular;
    expect(describeError(circular)).toBe('code=500 msg=circular but diagnosable');
  });

  it('handles null/undefined without throwing', () => {
    expect(describeError(null)).toBe('unknown');
    expect(describeError(undefined)).toBe('unknown');
  });

  it('stringifies non-object primitives (number/boolean)', () => {
    expect(describeError(404)).toBe('404');
    expect(describeError(false)).toBe('false');
  });
});
