import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * E-mail, phone and GPA of players, for a signed-in session.
 *
 * `golf_players.email`, `.phone` and `.gpa` are not readable through the table once
 * 20261112090000_golf_players_coaches_contact_columns.sql is applied (security review 2026-11-11, finding 1: a player could read
 * every teammate's contact details and GPA straight from PostgREST). The one door is `golf_player_private_fields(uuid[])`, which
 * returns a player their own row and a staffed coach their team's players and applicants, and nothing for anyone else.
 *
 * Until the migration is applied the function does not exist; then this reads the three columns from the table as before, so
 * the app works on both sides of the apply. A service-role client does not need this: it still reads the columns directly.
 */
export interface PlayerPrivateFields {
  email: string | null;
  phone: string | null;
  gpa: number | null;
}

/** A missing function: Postgres 42883, PostgREST PGRST202. */
const MISSING_FUNCTION = new Set(['42883', 'PGRST202']);

type Row = { id: string; email: string | null; phone: string | null; gpa: number | string | null };
// Structural: works with the server and the browser client, typed or not.
type Reader = Pick<SupabaseClient, 'rpc' | 'from'>;

const toGpa = (v: number | string | null | undefined): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function readPlayerPrivateFields(
  sb: Reader,
  playerIds: ReadonlyArray<string>,
): Promise<{ data: Map<string, PlayerPrivateFields>; error: { message: string; code?: string } | null }> {
  const ids = [...new Set(playerIds.filter(Boolean))];
  const data = new Map<string, PlayerPrivateFields>();
  if (ids.length === 0) return { data, error: null };

  const viaRpc = await sb.rpc('golf_player_private_fields' as never, { p_player_ids: ids } as never);
  let rows: Row[] | null = null;
  let error: { message: string; code?: string } | null = null;
  if (!viaRpc.error) {
    rows = Array.isArray(viaRpc.data) ? (viaRpc.data as Row[]) : [];
  } else if (typeof viaRpc.error.code === 'string' && MISSING_FUNCTION.has(viaRpc.error.code)) {
    const viaTable = await sb.from('golf_players').select('id, email, phone, gpa').in('id', ids);
    rows = Array.isArray(viaTable.data) ? (viaTable.data as Row[]) : null;
    error = viaTable.error ? { message: viaTable.error.message, code: viaTable.error.code } : null;
  } else {
    error = { message: viaRpc.error.message, code: viaRpc.error.code };
  }
  for (const r of rows ?? []) data.set(r.id, { email: r.email ?? null, phone: r.phone ?? null, gpa: toGpa(r.gpa) });
  return { data, error };
}
