import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * E-mail and phone of players, for a signed-in session.
 *
 * `golf_players.email` and `.phone` are not readable through the table once
 * 20261112090000_golf_players_coaches_contact_columns.sql is applied (security review 2026-11-11, finding 1: a player could read
 * every teammate's contact details straight from PostgREST). The one door is `golf_player_contacts(uuid[])`, which returns a
 * player their own row and a staffed coach their team's players and applicants, and nothing for anyone else.
 *
 * Until the migration is applied the function does not exist; then this reads the two columns from the table as before, so the
 * app works on both sides of the apply. A service-role client does not need this: it still reads the columns directly.
 */
export interface PlayerContact {
  email: string | null;
  phone: string | null;
}

/** A missing function: Postgres 42883, PostgREST PGRST202. */
const MISSING_FUNCTION = new Set(['42883', 'PGRST202']);

type ContactRow = { id: string; email: string | null; phone: string | null };
// Structural: works with the server and the browser client, typed or not.
type Reader = Pick<SupabaseClient, 'rpc' | 'from'>;

export async function readPlayerContacts(
  sb: Reader,
  playerIds: ReadonlyArray<string>,
): Promise<{ data: Map<string, PlayerContact>; error: { message: string; code?: string } | null }> {
  const ids = [...new Set(playerIds.filter(Boolean))];
  const data = new Map<string, PlayerContact>();
  if (ids.length === 0) return { data, error: null };

  const viaRpc = await sb.rpc('golf_player_contacts' as never, { p_player_ids: ids } as never);
  let rows: ContactRow[] | null = null;
  let error: { message: string; code?: string } | null = null;
  if (!viaRpc.error) {
    rows = Array.isArray(viaRpc.data) ? (viaRpc.data as ContactRow[]) : [];
  } else if (typeof viaRpc.error.code === 'string' && MISSING_FUNCTION.has(viaRpc.error.code)) {
    const viaTable = await sb.from('golf_players').select('id, email, phone').in('id', ids);
    rows = Array.isArray(viaTable.data) ? (viaTable.data as ContactRow[]) : null;
    error = viaTable.error ? { message: viaTable.error.message, code: viaTable.error.code } : null;
  } else {
    error = { message: viaRpc.error.message, code: viaRpc.error.code };
  }
  for (const r of rows ?? []) data.set(r.id, { email: r.email ?? null, phone: r.phone ?? null });
  return { data, error };
}
