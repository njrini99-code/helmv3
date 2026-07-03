import { describe, it, expect } from 'vitest';
import { describeError } from '@/lib/utils/describe-error';

describe('describeError', () => {
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
