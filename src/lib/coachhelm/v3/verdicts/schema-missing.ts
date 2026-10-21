/**
 * The prescription columns arrive with
 * supabase/migrations/20261020120000_golf_focus_area_prescription.sql, which
 * is HELD until the owner applies it. Main can deploy first, so every read
 * and write of those columns treats "the database does not have this yet"
 * as "feature not available": Postgres 42703 (undefined column) / 42P01
 * (undefined table), PostgREST PGRST204 (column not in the schema cache) /
 * PGRST205 (table not in the schema cache).
 *
 * Pure.
 */
const MISSING_SCHEMA_CODES: ReadonlySet<string> = new Set(['42703', '42P01', 'PGRST204', 'PGRST205']);

export function isMissingSchemaError(error: { code?: string | null } | null | undefined): boolean {
  return !!error && typeof error.code === 'string' && MISSING_SCHEMA_CODES.has(error.code);
}
