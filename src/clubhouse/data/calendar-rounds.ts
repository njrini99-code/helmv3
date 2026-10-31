import 'server-only';
import { tourTable } from './tournaments-db';
import type { ChCalRoundRef } from '../screens/calendar/model';

type RoundRow = {
  round_event_id: string;
  tournament_id: string;
  round_number: number;
  start_type: ChCalRoundRef['startType'];
  status: ChCalRoundRef['status'];
  course_label: string | null;
  tournament: { id: string; name: string; rounds_count: number; version: number; lineup_locked_at: string | null; lineup_published_at: string | null } | null;
};

/**
 * P-5 8.10: the round refs for the calendar's tournament events, read only when golf_tournaments_v1 is on and the window
 * has tournament events. One read of the rounds (with their tournament), one of every round of those tournaments (to
 * tell a cancelled tournament), and, for a coach only, one of the entries (a draft lineup). Players learn only whether
 * the lineup is published (4.33's revealed-only rule): `lineup_published_at` set and reached. A lock is not a publish, so
 * a locked lineup that is not published (or whose publish is scheduled later) reads `none` to a player. Any failure
 * returns `failed`: events load without refs.
 */
export async function loadRoundRefs(
  supabase: object,
  eventIds: string[],
  role: 'coach' | 'player',
  nowMs: number = Date.now(),
): Promise<{ refs: Map<string, ChCalRoundRef>; failed: boolean; error?: unknown }> {
  const refs = new Map<string, ChCalRoundRef>();
  if (!eventIds.length) return { refs, failed: false };
  const { data, error } = await tourTable(supabase, 'golf_tournament_rounds')
    .select('round_event_id, tournament_id, round_number, start_type, status, course_label, tournament:golf_tournaments(id, name, rounds_count, version, lineup_locked_at, lineup_published_at)')
    .in('round_event_id', eventIds);
  if (error) return { refs, failed: true, error };
  const rows = (data ?? []) as unknown as RoundRow[];
  if (!rows.length) return { refs, failed: false };
  const tids = [...new Set(rows.map((r) => r.tournament_id))];
  const [allRes, entriesRes] = await Promise.all([
    tourTable(supabase, 'golf_tournament_rounds').select('tournament_id, event:golf_events(status)').in('tournament_id', tids),
    role === 'coach' ? tourTable(supabase, 'golf_tournament_entries').select('tournament_id').in('tournament_id', tids) : null,
  ]);
  if (allRes.error) return { refs, failed: true, error: allRes.error };
  if (entriesRes?.error) return { refs, failed: true, error: entriesRes.error };
  const live = new Map<string, boolean>();
  for (const r of (allRes.data ?? []) as unknown as Array<{ tournament_id: string; event: { status: string | null } | Array<{ status: string | null }> | null }>) {
    const ev = Array.isArray(r.event) ? r.event[0] : r.event;
    if (ev?.status !== 'cancelled') live.set(r.tournament_id, true);
  }
  const drafted = new Set(((entriesRes?.data ?? []) as Array<{ tournament_id: string }>).map((e) => e.tournament_id));
  for (const r of rows) {
    const t = r.tournament;
    if (!t) continue;
    const lineup = lineupFor(t, role, drafted.has(t.id), nowMs);
    refs.set(r.round_event_id, {
      tournamentId: t.id,
      name: t.name,
      roundNo: r.round_number,
      roundsCount: t.rounds_count,
      version: t.version,
      status: r.status,
      startType: r.start_type,
      // Lock state is the coach's: a player's ref never carries it (only coach drag code reads it).
      lockedAt: role === 'coach' ? t.lineup_locked_at : null,
      lineup,
      tournamentCancelled: !live.get(t.id),
      courseLabel: r.course_label,
      // 4.33's tee sheet (100300) is not written yet: no round has per-player tee times to shift.
      teeSheet: false,
    });
  }
  return { refs, failed: false };
}

/**
 * A round's lineup in the calendar's word. A coach sees the whole state (locked first, then published, then a draft from
 * the entries). A player sees `published` only once `lineup_published_at` is set and has been reached, the same reveal
 * the Tournaments page uses (`lineupStateOf`); otherwise `none`, never `locked` or `draft`.
 */
export function lineupFor(
  t: { lineup_locked_at: string | null; lineup_published_at: string | null },
  role: 'coach' | 'player',
  drafted: boolean,
  nowMs: number,
): ChCalRoundRef['lineup'] {
  if (role === 'player') {
    const at = t.lineup_published_at ? Date.parse(t.lineup_published_at) : NaN;
    return Number.isFinite(at) && at <= nowMs ? 'published' : 'none';
  }
  if (t.lineup_locked_at) return 'locked';
  if (t.lineup_published_at) return 'published';
  return drafted ? 'draft' : 'none';
}
