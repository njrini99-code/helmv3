/**
 * Serialize any thrown value into a human-readable string suitable for
 * logs and admin telemetry.
 *
 * Why this exists: `String(someError)` on a plain object returns the
 * useless `"[object Object]"`. The common pattern across the codebase
 * was `error instanceof Error ? error.message : String(error)`, which
 * produced `[object Object]` in 20+ telemetry incidents because Supabase
 * `PostgrestError` and similar plain objects do NOT extend Error.
 *
 * Order of precedence:
 *   1. Error instance → `.message`
 *   2. Supabase/Postgres-shaped object → compact `code=X msg=Y details=Z hint=W`
 *   3. Plain object → `JSON.stringify` (with a circular-safe fallback)
 *   4. Anything else → `String(x)`
 */
export function describeError(err: unknown): string {
  if (err == null) return 'unknown';
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (typeof err !== 'object') return String(err);

  const e = err as Record<string, unknown>;

  // Supabase / node-postgres shape — these are the plain objects that were
  // producing `[object Object]` in telemetry. We collapse them into a single
  // line so grep-by-code still works in admin dashboards.
  const parts = [
    e.code ? `code=${e.code}` : null,
    e.message ? `msg=${e.message}` : null,
    e.details ? `details=${e.details}` : null,
    e.hint ? `hint=${e.hint}` : null,
  ].filter(Boolean);
  if (parts.length > 0) return parts.join(' ');

  // Fallback: JSON.stringify. Wrap in try/catch for circular references.
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
