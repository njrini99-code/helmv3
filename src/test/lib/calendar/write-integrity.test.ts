import { describe, expect, it } from 'vitest';
import { requireWriteSuccess, WriteIntegrityError } from '@/lib/calendar/write-integrity';

describe('requireWriteSuccess', () => {
  it('throws WriteIntegrityError when error is non-null', () => {
    expect(() =>
      requireWriteSuccess({ data: null, error: { message: 'rls denied', code: '42501' } }, 'updateRSVP'),
    ).toThrow(WriteIntegrityError);
  });

  it('throws when data is empty array AND count is 0', () => {
    expect(() => requireWriteSuccess({ data: [], error: null, count: 0 }, 'updateRSVP')).toThrow(WriteIntegrityError);
  });

  it('throws when data is null', () => {
    expect(() => requireWriteSuccess({ data: null, error: null }, 'updateRSVP')).toThrow(WriteIntegrityError);
  });

  it('returns data array when at least one row was affected', () => {
    const data = [{ id: 'a' }];
    const result = requireWriteSuccess({ data, error: null, count: 1 }, 'updateRSVP');
    expect(result).toEqual(data);
  });

  it('returns data wrapped in array when a single row was returned', () => {
    const result = requireWriteSuccess({ data: { id: 'a' }, error: null }, 'updateRSVP');
    expect(result).toEqual([{ id: 'a' }]);
  });

  it('attaches operation name + underlying to the error', () => {
    try {
      requireWriteSuccess({ data: null, error: { message: 'boom' } }, 'createEvent');
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(WriteIntegrityError);
      expect((err as WriteIntegrityError).operation).toBe('createEvent');
      expect((err as WriteIntegrityError).underlying).toEqual({ message: 'boom' });
    }
  });
});
