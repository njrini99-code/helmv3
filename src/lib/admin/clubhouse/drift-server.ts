import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RuntimeDrift, RuntimeDriftRow } from './drift';

/**
 * Postgres and PostgREST codes for "this relation or column isn't there": the table is in held migration
 * 20261124090000_clubhouse_bridge_signals.sql, so until it is applied a read says "No signal yet", never zero.
 */
export const MISSING_SCHEMA_CODES: ReadonlySet<string> = new Set(['42P01', 'PGRST205', '42703', 'PGRST204']);

export function isMissingSchema(error: { code?: string | null } | null | undefined): boolean {
  return !!error?.code && MISSING_SCHEMA_CODES.has(error.code);
}

/** The newest 500 drift rows (plan §4.3), read as the super admin (RLS grants SELECT through is_super_admin()). */
export async function readRuntimeDrift(client: SupabaseClient): Promise<RuntimeDrift> {
  try {
    const { data, error } = await client
      .from('clubhouse_drift')
      .select('kind, code, release, drift_count, first_seen, last_seen')
      .order('last_seen', { ascending: false })
      .limit(500);
    if (error) {
      if (isMissingSchema(error)) return { state: 'no-signal', reason: 'clubhouse_drift is not in this database yet (held migration 20261124090000).' };
      return { state: 'failed', message: error.message };
    }
    return { state: 'ok', rows: (data ?? []) as RuntimeDriftRow[] };
  } catch (err) {
    return { state: 'failed', message: err instanceof Error ? err.message : String(err) };
  }
}
