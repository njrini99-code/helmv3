import 'server-only';
/**
 * CoachHelm reads: the held table `golf_coach_reads`, through a narrow typed wrapper.
 *
 * The table is held (supabase/migrations/20261117120000_golf_coach_reads.sql, HELD.md), so it is not in the generated
 * `database.ts` and is never hand-added there. Every call goes through `table()` with the row type below. When the
 * table does not exist yet (42P01 / PGRST205) a read returns `held` and a write writes nothing: everything runs before
 * the owner applies it.
 *
 * Writes are append-only and only when the content hash differs from the player's latest row.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingSchemaError } from '@/lib/coachhelm/v3/verdicts/schema-missing';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { contentHash } from './hash';
import type { FocusLink } from './focus';
import type { CoachFeedback } from './memory';
import { READS_ANALYST_VERSION, type ReadPayload, type ReadTrigger } from './types';

export const READS_TABLE = 'golf_coach_reads';
export const READS_CURRENT_VIEW = 'golf_coach_reads_current';

export interface CoachReadRow {
  id: string;
  team_id: string;
  player_id: string;
  computed_at: string;
  through_date: string | null;
  n_rounds: number;
  signature: string | null;
  certainty: string | null;
  analyst_version: string;
  content_hash: string;
  payload: ReadPayload;
  trigger: ReadTrigger;
  round_id: string | null;
}

export type CoachReadInsert = Omit<CoachReadRow, 'id' | 'computed_at'>;

type QueryError = { message: string; code?: string | null } | null;
interface Untyped {
  select(columns: string): Untyped;
  eq(column: string, value: string): Untyped;
  in(column: string, values: readonly string[]): Untyped;
  order(column: string, opts: { ascending: boolean }): Untyped;
  range(from: number, to: number): Untyped;
  insert(rows: readonly CoachReadInsert[]): PromiseLike<{ error: QueryError }>;
  then: PromiseLike<{ data: unknown[] | null; error: QueryError }>['then'];
}

/** The one untyped seam: the held table and its view are not in `database.ts`. */
function table(sb: SupabaseClient, name: typeof READS_TABLE | typeof READS_CURRENT_VIEW): Untyped {
  return (sb as unknown as { from(t: string): Untyped }).from(name);
}

const COLUMNS = 'id, team_id, player_id, computed_at, through_date, n_rounds, signature, certainty, analyst_version, content_hash, payload, trigger, round_id';

export type ReadsResult<T> = { status: 'ok'; data: T } | { status: 'held' } | { status: 'failed'; error: string };

/** The latest read of each listed player on a team (the current view), by player id. */
export async function loadCurrentReads(sb: SupabaseClient, teamId: string, playerIds?: readonly string[]): Promise<ReadsResult<Map<string, CoachReadRow>>> {
  const out = new Map<string, CoachReadRow>();
  const chunks = playerIds ? chunkIds(playerIds) : [null];
  for (const chunk of chunks) {
    if (chunk && !chunk.length) continue;
    // One row per player per team, so a chunk is far under the 1,000-row cap; page anyway on a stable order.
    for (let from = 0; ; from += 1000) {
      let q = table(sb, READS_CURRENT_VIEW).select(COLUMNS).eq('team_id', teamId);
      if (chunk) q = q.in('player_id', chunk);
      const { data, error } = await q.order('player_id', { ascending: true }).range(from, from + 999);
      if (error) return isMissingSchemaError(error) ? { status: 'held' } : { status: 'failed', error: error.message };
      for (const r of (data ?? []) as CoachReadRow[]) out.set(r.player_id, r);
      if ((data ?? []).length < 1000) break;
    }
  }
  return { status: 'ok', data: out };
}

/** One player's reads on a team, newest first (history; Stage 4). */
export async function loadReadHistory(sb: SupabaseClient, teamId: string, playerId: string, limit = 50): Promise<ReadsResult<CoachReadRow[]>> {
  const { data, error } = await table(sb, READS_TABLE).select(COLUMNS).eq('team_id', teamId).eq('player_id', playerId).order('computed_at', { ascending: false }).range(0, limit - 1);
  if (error) return isMissingSchemaError(error) ? { status: 'held' } : { status: 'failed', error: error.message };
  return { status: 'ok', data: (data ?? []) as CoachReadRow[] };
}

export function rowFor(payload: ReadPayload, trigger: ReadTrigger, roundId: string | null): CoachReadInsert {
  return {
    team_id: payload.team_id,
    player_id: payload.player_id,
    through_date: payload.through_date,
    n_rounds: payload.n_rounds,
    signature: payload.priority ? `${payload.priority.area}/${payload.priority.where.finding === 'band' ? payload.priority.where.band : payload.priority.where.finding}/${payload.priority.pattern?.id ?? '-'}` : null,
    certainty: payload.priority?.certainty ?? null,
    analyst_version: READS_ANALYST_VERSION,
    content_hash: contentHash(payload),
    payload,
    trigger,
    round_id: roundId,
  };
}

/** Rows to insert: only the players whose content differs from their latest saved read. Pure. */
export function changedRows(payloads: readonly ReadPayload[], latest: ReadonlyMap<string, Pick<CoachReadRow, 'content_hash'>>, trigger: ReadTrigger, roundId: string | null): CoachReadInsert[] {
  return payloads.map((p) => rowFor(p, trigger, roundId)).filter((r) => latest.get(r.player_id)?.content_hash !== r.content_hash);
}

export async function insertReads(sb: SupabaseClient, rows: readonly CoachReadInsert[]): Promise<ReadsResult<number>> {
  if (!rows.length) return { status: 'ok', data: 0 };
  const { error } = await table(sb, READS_TABLE).insert(rows);
  if (error) return isMissingSchemaError(error) ? { status: 'held' } : { status: 'failed', error: error.message };
  return { status: 'ok', data: rows.length };
}

/** Stage 4 (held: 20261117121000): each player’s latest "not useful" or "wrong" on a team. A missing table is none. */
export async function loadLatestFeedback(sb: SupabaseClient, teamId: string): Promise<Map<string, CoachFeedback>> {
  const out = new Map<string, CoachFeedback>();
  const q = (sb as unknown as { from(t: string): Untyped }).from('golf_coach_read_feedback');
  const { data, error } = await q.select('player_id, card_key, verdict, reason, created_at, lost_per_round, certainty, area').eq('team_id', teamId).order('created_at', { ascending: false }).range(0, 999);
  if (error) {
    if (isMissingSchemaError(error)) return out;
    throw new Error(`reads: reading golf_coach_read_feedback failed: ${error.message}`);
  }
  for (const r of (data ?? []) as Array<{ player_id: string; card_key: string; verdict: CoachFeedback['verdict']; reason: string; created_at: string; lost_per_round: number | string; certainty: CoachFeedback['certainty']; area: string }>) {
    if (!out.has(r.player_id)) out.set(r.player_id, { card_key: r.card_key, verdict: r.verdict, reason: r.reason, at: r.created_at, lost_per_round: Number(r.lost_per_round), certainty: r.certainty, area: r.area });
  }
  return out;
}

/** Stage 4 (held): each player’s latest focus link on a team. A missing table is none. */
export async function loadFocusLinks(sb: SupabaseClient, teamId: string): Promise<Map<string, FocusLink>> {
  const out = new Map<string, FocusLink>();
  const q = (sb as unknown as { from(t: string): Untyped }).from('golf_coach_read_focus');
  const { data, error } = await q.select('player_id, card_key, part, set_on, value_on_day, rounds_on_day, team_lost_on_day, created_at').eq('team_id', teamId).order('created_at', { ascending: false }).range(0, 999);
  if (error) {
    if (isMissingSchemaError(error)) return out;
    throw new Error(`reads: reading golf_coach_read_focus failed: ${error.message}`);
  }
  for (const r of (data ?? []) as Array<{ player_id: string; card_key: string; part: FocusLink['part']; set_on: string; value_on_day: number | string; rounds_on_day: number; team_lost_on_day: number | string | null }>) {
    if (!out.has(r.player_id)) out.set(r.player_id, { card_key: r.card_key, part: r.part, set_on: r.set_on, value_on_day: Number(r.value_on_day), rounds_on_day: r.rounds_on_day, team_lost_on_day: r.team_lost_on_day == null ? null : Number(r.team_lost_on_day) });
  }
  return out;
}
