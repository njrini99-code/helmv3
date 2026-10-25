/**
 * `golf_event_attendance_counts(p_event_ids)` belongs to held migration 20261017102000, so the generated database types
 * (which mirror production) do not list it yet. This is its one typed call site; the callers treat a missing function
 * (PGRST202 / 42883) as "not deployed". When the migration is applied and `npm run db:types` runs, replace the cast with
 * `supabase.rpc(...)`, delete this file, and delete the `golf_event_attendance_counts` line in `sharedIgnoreErrors`
 * (src/instrumentation.ts), which keeps the pre-apply PGRST202 out of Sentry.
 */
export interface AttendanceCountsRow {
  event_id: string;
  invited: number;
  accepted: number;
  declined: number;
  pending: number;
  coach_invited: number;
}

interface AttendanceCountsResponse {
  data: AttendanceCountsRow[] | null;
  error: { code?: string; message?: string } | null;
}

interface ClientWithAttendanceCounts {
  rpc(fn: 'golf_event_attendance_counts', args: { p_event_ids: string[] }): PromiseLike<AttendanceCountsResponse>;
}

export function rpcAttendanceCounts(supabase: unknown, eventIds: string[]): PromiseLike<AttendanceCountsResponse> {
  return (supabase as ClientWithAttendanceCounts).rpc('golf_event_attendance_counts', { p_event_ids: eventIds });
}
