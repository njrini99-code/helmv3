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

/**
 * Build a structured `extra` payload for a failed write.
 *
 * `describeError` makes the incident MESSAGE readable, but the message is also
 * what incident fingerprints hash, so the useful discriminators (which Postgres
 * error code, which columns, which scope) cannot live there without minting a
 * new incident group per variant. Put them in `extra` instead: the group stays
 * stable and one click still names the cause.
 *
 * `code`/`details`/`hint` are lifted out of the Postgres-shaped error so the
 * common triage question — constraint violation vs. RLS denial vs. statement
 * timeout vs. a transport failure — is answerable without a repro. Note that
 * supabase-js also reports fetch/transport failures through this same shape
 * (with an empty `code`), so `transport: true` distinguishes those.
 */
export function describeWriteFailure(
  err: unknown,
  context: Record<string, unknown> = {},
): Record<string, unknown> {
  const e = (err && typeof err === 'object' ? err : {}) as Record<string, unknown>;
  const code = typeof e.code === 'string' && e.code.length > 0 ? e.code : null;

  return {
    ...context,
    pgCode: code,
    pgDetails: e.details ?? null,
    pgHint: e.hint ?? null,
    // supabase-js wraps a failed fetch as `{ message: 'TypeError: fetch
    // failed', code: '' }` — no Postgres code, so an empty code with a
    // message is a transport problem, not a database rejection.
    transport: !(err instanceof Error) && code === null && e.message != null,
  };
}
