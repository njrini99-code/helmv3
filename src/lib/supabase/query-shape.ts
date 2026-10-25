import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Reads and writes (live rounds, P-6) on the tables that are not in `database.ts` yet: the live table and its preferences (held migration 1)
 * and the tournament tables (P-5's held migrations). Written as the small query shape the live code actually uses, rather
 * than through a type escape hatch, so a wrong call still fails to compile. Once the migrations are applied and
 * `db:types` is regenerated, these callers move to the typed client and this file goes.
 */
export interface LiveTableError {
  message?: string;
  code?: string | null;
}
export interface LiveTableResult<T> {
  data: T | null;
  error: LiveTableError | null;
}
export interface LiveTableQuery<Row> extends PromiseLike<LiveTableResult<Row[]>> {
  select(columns: string): LiveTableQuery<Row>;
  eq(column: string, value: string | number | boolean): LiveTableQuery<Row>;
  gte(column: string, value: string | number): LiveTableQuery<Row>;
  in(column: string, values: readonly string[]): LiveTableQuery<Row>;
  limit(count: number): LiveTableQuery<Row>;
  maybeSingle(): PromiseLike<LiveTableResult<Row>>;
  upsert(values: Record<string, string | number | boolean | null>, options?: { onConflict?: string }): PromiseLike<LiveTableResult<null>>;
}

/** A table the generated types do not know yet, as the query shape above. `client` is any Supabase client. */
export function liveTable<Row = Record<string, unknown>>(client: Pick<SupabaseClient, 'from'> | object, table: string): LiveTableQuery<Row> {
  return (client as { from: (name: string) => unknown }).from(table) as LiveTableQuery<Row>;
}
