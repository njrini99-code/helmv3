import type { createClient } from '@/lib/supabase/server';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { rpcAttendanceCounts } from '@/lib/golf/attendance-counts-rpc';

/**
 * RSVP counts for a player's screens, without reading teammates' rows.
 *
 * Migration 20261017102000 narrows golf_event_attendance so a player reads only their own row; the counts a player
 * sees ("5 of 6 going", "6 players", D2-8's "a meeting with no invitees is the coach's own") come from
 * `golf_event_attendance_counts(p_event_ids)` instead, which returns numbers only, for the caller's own teams. The
 * buckets mirror `rsvpOf` (data/calendar.ts): maybe/tentative count in `invited` only.
 *
 * Until the migration is applied the function does not exist (PostgREST PGRST202, Postgres 42883): the result is
 * `missing` and each caller keeps today's direct read unchanged. Any other failure is a failed read (`error`).
 */
export interface ChAttendanceCounts {
  invited: number;
  accepted: number;
  declined: number;
  pending: number;
  /** Rows the coach's invitation wrote (`notified_at`): zero means the event is open to the whole team. */
  coachInvited: number;
}

export type ChAttendanceCountsResult =
  | { kind: 'ok'; byEvent: Map<string, ChAttendanceCounts> }
  | { kind: 'missing' }
  | { kind: 'error'; error: unknown };

type Client = Awaited<ReturnType<typeof createClient>>;

const NOT_DEPLOYED = new Set(['PGRST202', '42883']);

/**
 * How many each meeting invites, for D2-8 when a player's own replies didn't load: from the counts function or, until
 * migration 20261017102000 is applied, from the invite rows. Null when neither could be read (`onError` gets the error);
 * the caller then hides the meetings (playerSeesMeeting fails closed).
 */
export async function loadInvitedCounts(supabase: Client, ids: string[], onError: (error: unknown) => void): Promise<Map<string, number> | null> {
  if (!ids.length) return new Map();
  const counts = await loadAttendanceCounts(supabase, ids);
  if (counts.kind === 'ok') return new Map(ids.map((id) => [id, counts.byEvent.get(id)?.invited ?? 0]));
  if (counts.kind === 'error') {
    onError(counts.error);
    return null;
  }
  const byEvent = new Map(ids.map((id) => [id, 0]));
  for (const chunk of chunkIds([...new Set(ids)])) {
    // A chunk of meetings' invitees: well under the row cap.
    const { data, error } = await supabase.from('golf_event_attendance').select('event_id').in('event_id', chunk).limit(1000);
    if (error) {
      onError(error);
      return null;
    }
    for (const row of data ?? []) byEvent.set(row.event_id, (byEvent.get(row.event_id) ?? 0) + 1);
  }
  return byEvent;
}

/**
 * The player's own attendance rows for these events, by event (`player_id` is checked again, so a teammate's row, which
 * RLS returns until migration 20261017102000, never counts as theirs). Null when the read failed (`onError` gets it).
 */
export async function loadOwnRows(supabase: Client, ids: string[], playerId: string, onError: (error: unknown) => void): Promise<Map<string, string | null> | null> {
  const own = new Map<string, string | null>();
  for (const chunk of chunkIds([...new Set(ids)])) {
    const { data, error } = await supabase.from('golf_event_attendance').select('event_id, player_id, status').in('event_id', chunk).eq('player_id', playerId).limit(1000);
    if (error) {
      onError(error);
      return null;
    }
    for (const row of data ?? []) if (row.player_id === playerId) own.set(row.event_id, row.status);
  }
  return own;
}

/** Every requested event the caller may see has a row (all zeros when nobody is invited); an absent id reads as zero. */
export async function loadAttendanceCounts(supabase: Client, eventIds: string[]): Promise<ChAttendanceCountsResult> {
  const ids = [...new Set(eventIds)];
  if (!ids.length) return { kind: 'ok', byEvent: new Map() };
  // One POST body, not a query string, so no .in() URL-length chunking is needed.
  const { data, error } = await rpcAttendanceCounts(supabase, ids);
  if (error) {
    const code = (error as { code?: string }).code;
    return code && NOT_DEPLOYED.has(code) ? { kind: 'missing' } : { kind: 'error', error };
  }
  const byEvent = new Map<string, ChAttendanceCounts>();
  for (const r of data ?? []) {
    byEvent.set(r.event_id, { invited: r.invited ?? 0, accepted: r.accepted ?? 0, declined: r.declined ?? 0, pending: r.pending ?? 0, coachInvited: r.coach_invited ?? 0 });
  }
  return { kind: 'ok', byEvent };
}
