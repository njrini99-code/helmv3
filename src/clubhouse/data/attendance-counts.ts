import type { createClient } from '@/lib/supabase/server';

/**
 * RSVP counts for a player's screens, without reading teammates' rows.
 *
 * Migration 20261017102000 narrows golf_event_attendance so a player reads only their own row; the counts a player
 * sees ("5 of 6 confirmed", "6 players", D2-8's "a meeting with no invitees is the coach's own") come from
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
}

export type ChAttendanceCountsResult =
  | { kind: 'ok'; byEvent: Map<string, ChAttendanceCounts> }
  | { kind: 'missing' }
  | { kind: 'error'; error: unknown };

type Client = Awaited<ReturnType<typeof createClient>>;

const NOT_DEPLOYED = new Set(['PGRST202', '42883']);

/** Every requested event the caller may see has a row (all zeros when nobody is invited); an absent id reads as zero. */
export async function loadAttendanceCounts(supabase: Client, eventIds: string[]): Promise<ChAttendanceCountsResult> {
  const ids = [...new Set(eventIds)];
  if (!ids.length) return { kind: 'ok', byEvent: new Map() };
  // One POST body, not a query string, so no .in() URL-length chunking is needed.
  const { data, error } = await supabase.rpc('golf_event_attendance_counts', { p_event_ids: ids });
  if (error) {
    const code = (error as { code?: string }).code;
    return code && NOT_DEPLOYED.has(code) ? { kind: 'missing' } : { kind: 'error', error };
  }
  const byEvent = new Map<string, ChAttendanceCounts>();
  for (const r of data ?? []) {
    byEvent.set(r.event_id, { invited: r.invited ?? 0, accepted: r.accepted ?? 0, declined: r.declined ?? 0, pending: r.pending ?? 0 });
  }
  return { kind: 'ok', byEvent };
}
