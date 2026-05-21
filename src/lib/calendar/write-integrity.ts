/**
 * WriteIntegrityError + requireWriteSuccess — typed error and assertion
 * helper for Supabase write paths.
 *
 * The 2026-05-17 audit found that `updateRSVP` (and several recurring-event
 * writes) called `.upsert(...)` / `.update(...)` without destructuring
 * `{ error }`. The Supabase JS client returns RLS denials and constraint
 * violations in `result.error` — it does not throw. Code that didn't read
 * the error returned `success: true` to the user even when zero rows were
 * persisted.
 *
 * Use this helper after every insert/update/upsert/delete the user expects
 * to persist. It throws WriteIntegrityError when:
 *   - the Supabase result has a non-null `error`, OR
 *   - the result returned no rows (data is null or empty array).
 *
 * Callers should `try { ... } catch (err) { if (err instanceof
 * WriteIntegrityError) ... }` and surface a real error to the user.
 */
export class WriteIntegrityError extends Error {
  public readonly operation: string;
  public readonly underlying?: unknown;
  public readonly affectedRows?: number;

  constructor(operation: string, underlying?: unknown, affectedRows?: number) {
    const reason =
      underlying instanceof Error
        ? underlying.message
        : typeof underlying === 'string'
          ? underlying
          : underlying != null
            ? JSON.stringify(underlying)
            : 'no rows affected';
    super(`Write integrity check failed for ${operation}: ${reason}`);
    this.name = 'WriteIntegrityError';
    this.operation = operation;
    this.underlying = underlying;
    this.affectedRows = affectedRows;
  }
}

interface SupabaseWriteResult<T> {
  data: T | T[] | null;
  error: unknown;
  count?: number | null;
}

/**
 * Assert that a Supabase write actually succeeded. Throws WriteIntegrityError
 * when error != null, or when no rows were returned/affected. Use after every
 * insert/update/upsert/delete that the user expects to persist.
 *
 * Pattern:
 *   const result = await supabase.from('t').upsert(payload, ...).select('id');
 *   requireWriteSuccess(result, 'updateRSVP');
 */
export function requireWriteSuccess<T>(
  result: SupabaseWriteResult<T>,
  operation: string,
): T[] {
  if (result.error != null) {
    throw new WriteIntegrityError(operation, result.error);
  }
  const rows = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
  if (rows.length === 0 && (result.count == null || result.count === 0)) {
    throw new WriteIntegrityError(operation, 'no rows affected', 0);
  }
  return rows;
}
