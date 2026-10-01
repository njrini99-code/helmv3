import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { chLogServer } from '../lib/track-server';
import { homeClock } from './home';
import { seasonStartDate } from './season';
import { courseName, roundType, seasonFrom, teeColorFor, teeLabel, toLibraryRound, type ChLibraryRound, type ChRoundListRow, type ChRoundsLibrary, type ChUnfinishedRound } from './rounds-shape';

export type * from './rounds-shape';

/**
 * Rounds library (Clubhouse P011; design/handoff/Player - Rounds.html,
 * rounds-flow.jsx `Library`). One server read for the player's own rounds.
 *
 * Every completed round is listed. Only countable rounds (isCountableRound)
 * that are full 18-hole rounds set the season figures and the ribbon, the
 * same rule Home and Stats use, so the numbers agree across screens. A round
 * that doesn't count still shows, marked as not counted.
 *
 * `rounds.error`: the list didn't load, and the page says so; it is never
 * shown as "no rounds". `unfinished.error`: the in-progress read failed, and
 * only that card says so.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

const LIST_COLUMNS =
  'id, course_name, tees_played, round_date, round_type, total_score, score_to_par, front_nine, back_nine, holes_played, total_putts, total_gir, total_gir_possible, total_fairways_hit, total_fairways';

const UNFINISHED_COLUMNS = 'id, course_name, tees_played, round_date, round_type, holes_played, current_hole, updated_at';

const log = (what: string, err: unknown) => chLogServer('rounds', what, err);

async function loadUnfinished(supabase: Supabase, playerId: string, completed: ChLibraryRound[]): Promise<{ list: ChUnfinishedRound[]; error: boolean }> {
  const res = await supabase
    .from('golf_rounds')
    .select(UNFINISHED_COLUMNS)
    .eq('player_id', playerId)
    .eq('is_test', false)
    .eq('status', 'in_progress')
    .order('updated_at', { ascending: false })
    .limit(20);
  if (res.error) {
    log('unfinished', res.error);
    return { list: [], error: true };
  }
  const rows = res.data ?? [];
  if (!rows.length) return { list: [], error: false };

  // Durable per-hole scores, the source continue-round reads (not draft_data, which each autosave replaces).
  const holes = await fetchAllRowsResult<{ round_id: string; hole_number: number; par: number | null; score: number | null }>(
    (from, to) =>
      supabase
        .from('golf_holes')
        .select('round_id, hole_number, par, score')
        .in(
          'round_id',
          rows.map((r) => r.id),
        )
        .order('id', { ascending: true })
        .range(from, to),
    undefined,
    { table: 'golf_holes', action: 'clubhouse.rounds', feature: 'round_tracking', sport: 'golf' },
  );
  // The card still shows the round without its strip; the hole read failing is logged, not claimed as "no holes played".
  if (holes.error) log('unfinished-holes', holes.error);
  const byRound = new Map<string, Array<{ n: number; score: number; par: number | null }>>();
  for (const h of holes.data ?? []) {
    if (h.score == null) continue;
    const xs = byRound.get(h.round_id) ?? [];
    xs.push({ n: h.hole_number, score: h.score, par: h.par });
    byRound.set(h.round_id, xs);
  }
  // Never nudge a player to submit a second finished round onto a course and day that already has one (legacy R8).
  const taken = new Set(completed.map((r) => `${r.course}|${r.date}`));

  return {
    error: false,
    list: rows.map((r) => {
      const total = r.holes_played ?? 18;
      const played = (byRound.get(r.id) ?? []).sort((a, b) => a.n - b.n);
      const withPar = played.filter((h): h is { n: number; score: number; par: number } => h.par != null);
      const scored = new Set(played.map((h) => h.n));
      let next: number | null = null;
      for (let n = 1; n <= total; n++)
        if (!scored.has(n)) {
          next = n;
          break;
        }
      const course = courseName(r.course_name);
      const date = r.round_date.slice(0, 10);
      return {
        id: r.id,
        course,
        tee: teeLabel(r.tees_played),
        teeColor: teeColorFor(r.tees_played),
        type: roundType(r.round_type),
        holes: total,
        date,
        played,
        toParThru: withPar.length ? withPar.reduce((a, h) => a + h.score - h.par, 0) : null,
        nextHole: holes.error ? (r.current_hole ?? null) : next,
        readyToSubmit: !holes.error && total > 0 && played.length >= total && !taken.has(`${course}|${date}`),
      };
    }),
  };
}

export async function loadRoundsLibrary(input: { playerId: string; teamId: string | null }): Promise<ChRoundsLibrary> {
  const supabase = await createClient();
  const now = new Date();
  const clock = input.teamId ? await homeClock(supabase, input.teamId, now) : null;
  const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: clock?.tz ?? 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

  const listRes = await fetchAllRowsResult<ChRoundListRow>(
    (from, to) =>
      supabase
        .from('golf_rounds')
        .select(LIST_COLUMNS)
        .eq('player_id', input.playerId)
        .eq('is_test', false)
        .eq('status', 'completed')
        .order('round_date', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to),
    undefined,
    { table: 'golf_rounds', action: 'clubhouse.rounds', feature: 'round_tracking', sport: 'golf' },
  );
  if (listRes.error) log('list', listRes.error);
  const list = listRes.error ? [] : (listRes.data ?? []).map(toLibraryRound).filter((r): r is ChLibraryRound => r != null);
  const unfinished = await loadUnfinished(supabase, input.playerId, list);

  return {
    todayIso,
    rounds: { list, error: !!listRes.error },
    season: seasonFrom(list, seasonStartDate(now)),
    unfinished,
  };
}
