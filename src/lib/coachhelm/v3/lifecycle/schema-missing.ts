/**
 * `golf_coachhelm_player_state` arrives with
 * supabase/migrations/20261020122000_golf_coachhelm_player_state.sql, and
 * `golf_coachhelm_corrections` with Slice 6a's 20261020121000 (PR #2226).
 * Both are HELD until the owner applies them, and main can deploy first, so
 * every read and write treats "the database does not have this yet" as
 * "feature not available": Postgres 42P01 (undefined table) / 42703
 * (undefined column), PostgREST PGRST205 (table not in the schema cache) /
 * PGRST204 (column not in the schema cache).
 *
 * Copied from Slice 4 (PR #2227, `v3/verdicts/schema-missing.ts`) rather
 * than imported, because that branch is not on main yet. Pure.
 */
const MISSING_SCHEMA_CODES: ReadonlySet<string> = new Set(['42703', '42P01', 'PGRST204', 'PGRST205']);

export function isMissingSchemaError(error: { code?: string | null } | null | undefined): boolean {
  return !!error && typeof error.code === 'string' && MISSING_SCHEMA_CODES.has(error.code);
}
