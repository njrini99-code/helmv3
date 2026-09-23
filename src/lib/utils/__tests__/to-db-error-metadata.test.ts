import { describe, it, expect } from 'vitest';
import { toDbErrorMetadata } from '@/lib/utils/describe-error';

/**
 * `toDbErrorMetadata` exists because `JSON.stringify(new Error('x'))` is
 * `'{}'` — Error's own `name`/`message`/`stack` are non-enumerable — so a raw
 * Error instance stored directly under `metadata: { dbError }` silently
 * disappears the moment `server-error-logger.ts`'s `normalizeContext` rounds
 * it through `JSON.parse(JSON.stringify(...))` before the `admin_events`
 * write. That is exactly the case `generator-base.ts` / `orchestrator.ts`'s
 * `dbError` call sites were fixed to capture (a thrown Error, not just a
 * Postgrest-shaped rejection), so this pins the normalized shape directly.
 */
describe('toDbErrorMetadata', () => {
  it('extracts name + message from a real Error instance, and survives JSON round-trip', () => {
    const err = new Error('boom');
    const metadata = toDbErrorMetadata(err);

    expect(metadata.message).toBe('boom');
    expect(metadata.name).toBe('Error');
    // The property this whole function exists for: JSON.stringify(err)
    // directly would have been '{}'.
    expect(JSON.parse(JSON.stringify(metadata))).toEqual({ name: 'Error', message: 'boom' });
  });

  it('picks code/details/hint off a Postgrest-shaped plain object', () => {
    const dbError = {
      code: 'PGRST002',
      message: 'Could not query the database for the schema cache. Retrying.',
      details: null,
      hint: null,
    };
    const metadata = toDbErrorMetadata(dbError);

    // null details/hint are dropped, not carried through as null.
    expect(metadata).toEqual({
      message: 'Could not query the database for the schema cache. Retrying.',
      code: 'PGRST002',
    });
  });

  it('keeps details/hint when the Postgrest-shaped object actually has them', () => {
    const dbError = {
      code: '23514',
      message: 'new row violates check constraint',
      details: 'Failing row contains (…)',
      hint: 'Check the constraint definition.',
    };
    expect(toDbErrorMetadata(dbError)).toEqual({
      message: 'new row violates check constraint',
      code: '23514',
      details: 'Failing row contains (…)',
      hint: 'Check the constraint definition.',
    });
  });

  it('falls back to describeError text for a non-Error, non-Postgrest value', () => {
    expect(toDbErrorMetadata('plain string failure')).toEqual({ message: 'plain string failure' });
    expect(toDbErrorMetadata(null)).toEqual({ message: 'unknown' });
  });
});
