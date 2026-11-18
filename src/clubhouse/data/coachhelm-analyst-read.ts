import 'server-only';
/**
 * CoachHelm reads for the coach's file on one player (P013), behind `coachhelm_reads_v1` for the listed team.
 *
 * Read with the coach's own session: the table's RLS (`is_team_coach(team_id)`) decides. Not a 'use client' module;
 * the card imports only types from `coachhelm-analyst-read-shape.ts`. Before the held migration is applied the read answers
 * "off" and the file is exactly as before.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { readsEnabled } from '@/lib/coachhelm/v3/analyst/reads/flag';
import { forPlayer, isSuppressed } from '@/lib/coachhelm/v3/analyst/reads/player-card';
import { loadCurrentReads, loadPlayerReadActions } from '@/lib/coachhelm/v3/analyst/reads/store';
import type { ReadPayload } from '@/lib/coachhelm/v3/analyst/reads/types';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { chLogServer } from '../lib/track-server';
import { toChAnalystRead, toPlayerRead, withCoachActions, type ChAnalystReadLoad } from './coachhelm-analyst-read-shape';

const log = (where: string, err: unknown) => chLogServer('coachhelm.reads', where, err, 'coachhelm');

/** Whether the reads replace today's cards for this team: the flag is on and the team is listed. */
export function readsOnForTeam(teamId: string | null | undefined): boolean {
  try {
    return readsEnabled(teamId);
  } catch {
    return false;
  }
}

/** The coach's card for one player of their team. */
export async function loadCoachAnalystRead(input: { teamId: string; playerId: string }, deps: { client?: SupabaseClient; enabled?: boolean } = {}): Promise<ChAnalystReadLoad> {
  if (!(deps.enabled ?? readsOnForTeam(input.teamId))) return { status: 'off' };
  try {
    const sb = deps.client ?? ((await createClient()) as unknown as SupabaseClient);
    const res = await loadCurrentReads(sb, input.teamId, [input.playerId]);
    if (res.status === 'held') return { status: 'off' };
    if (res.status === 'failed') {
      log('load', new Error(res.error));
      return { status: 'failed' };
    }
    const row = res.data.get(input.playerId);
    if (!row) return { status: 'none' };
    const read = toChAnalystRead(row.payload);
    // The coach's own focus or verdict since this read was saved (held tables; a missing one is none). A failed read of
    // them is logged and the card stands as saved: the actions are still offered, and a repeat is written once.
    const actions = await loadPlayerReadActions(sb, input.teamId, input.playerId);
    if (actions.status === 'failed') log('actions', new Error(actions.error));
    return { status: 'ready', read: actions.status === 'ok' ? withCoachActions(read, row.computed_at, actions.data) : read };
  } catch (err) {
    log('load', err);
    return { status: 'failed' };
  }
}

/**
 * A player's own card (Stage 5): served by the server with the service role, because the table has no player policy,
 * and stripped of every coach-only block before it leaves (`forPlayer`). The caller passes the player id from the
 * session, never from the address, and a client that can read the row.
 */
export async function loadPlayerOwnRead(input: { teamId: string; playerId: string }, deps: { admin: SupabaseClient; enabled?: boolean }): Promise<{ status: 'off' } | { status: 'none' } | { status: 'ready'; payload: ReadPayload } | { status: 'failed' }> {
  if (!(deps.enabled ?? readsOnForTeam(input.teamId))) return { status: 'off' };
  try {
    const res = await loadCurrentReads(deps.admin, input.teamId, [input.playerId]);
    if (res.status === 'held') return { status: 'off' };
    if (res.status === 'failed') {
      log('player', new Error(res.error));
      return { status: 'failed' };
    }
    const row = res.data.get(input.playerId);
    // A read the coach marked "not useful" or "wrong" is not shown to the player at all (and the verdict never is).
    if (!row || isSuppressed(row.payload)) return { status: 'none' };
    return { status: 'ready', payload: forPlayer(row.payload) };
  } catch (err) {
    log('player', err);
    return { status: 'failed' };
  }
}

/**
 * The signed-in player's own card, for their CoachHelm (Your week), behind `coachhelm_reads_v1` for their team.
 *
 * Security: `golf_coach_reads` has no player SELECT policy, by design. A saved read carries coach-only blocks (the team
 * sentence, the teammates' middle figures, the coach's own verdict and the focus verdict), and an RLS policy grants a row, not
 * a part of one. So the player's card is read on the server with the service role, for exactly one row: the team comes
 * from the player's own active membership read with their session (RLS), the player id is the session's (never the
 * address's), and the payload is passed through `forPlayer` before it leaves the server. Nothing else of the row reaches the
 * page: the card is built from the stripped payload alone.
 */
export async function loadPlayerOwnAnalystRead(input: { playerId: string }, deps: { client?: SupabaseClient; admin?: () => SupabaseClient; enabled?: (teamId: string) => boolean } = {}): Promise<ChAnalystReadLoad> {
  try {
    const sb = deps.client ?? ((await createClient()) as unknown as SupabaseClient);
    const { data, error } = await sb.from('golf_team_members').select('team_id').eq('player_id', input.playerId).eq('status', 'active');
    if (error) {
      log('player.team', error);
      return { status: 'failed' };
    }
    const on = deps.enabled ?? readsOnForTeam;
    const teamId = [...new Set(((data ?? []) as Array<{ team_id: string }>).map((r) => r.team_id))].sort().find((t) => on(t));
    if (!teamId) return { status: 'off' };
    const admin = deps.admin ? deps.admin() : (createAdminClient() as unknown as SupabaseClient);
    const own = await loadPlayerOwnRead({ teamId, playerId: input.playerId }, { admin, enabled: true });
    if (own.status !== 'ready') return own;
    return { status: 'ready', read: toPlayerRead(own.payload) };
  } catch (err) {
    log('player', err);
    return { status: 'failed' };
  }
}
