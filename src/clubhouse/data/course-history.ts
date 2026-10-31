import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { withCanonicalRoundTotal } from '@/lib/golf/round-total';
import { chLogServer } from '../lib/track-server';
import { toCourseHistory, type ChCourseHistory, type ChCourseListRow, type ChCourseWindow } from './course-page-shape';
import { groupCourseRounds, parseCourseKey, resolveCourseKey } from './course-key';
import { loadTeamZone, SEASON_DEFAULT_TZ, seasonStartDate } from './season';
import type { ChCardHole } from './course-history-shape';
import type { ChPlayHole } from './stats-extra';

export type * from './course-page-shape';

/*
 * P-7: one player's history at one course (/golf/dashboard/rounds/course/[key]), for the player or a coach of their team.
 * Stage 1 reads the light list (and, for a coach, the membership and the player's name; for an id key, the library row);
 * stage 2 the holes of the rounds here and the last round's coach note. An unknown key, and a course where this viewer has
 * no rounds, are the same "No rounds here": the page never confirms someone else's rounds exist.
 */

/** `teamId` is the team whose zone turns the season (1 August in the team's zone); a player with no team uses the default. */
export type ChCourseViewer = { role: 'player'; playerId: string; teamId?: string | null } | { role: 'coach'; teamId: string; playerId: string };
export type ChCourseHistoryResult =
  | { kind: 'ok'; data: ChCourseHistory; playerName: string | null }
  | { kind: 'redirect'; to: string }
  | { kind: 'notFound' }
  | { kind: 'notOnTeam' }
  | { kind: 'error' };

const LIST_COLUMNS =
  'id, course_id, course_name, course_city, course_state, tee_id, tees_played, round_date, round_type, holes_played, total_score, score_to_par, front_nine, back_nine, total_putts, total_gir, total_gir_possible, total_fairways_hit, total_fairways, notes';
const HOLE_COLUMNS = 'round_id, hole_number, par, score, putts, gir, fairway_hit, yardage';
type HoleRow = { round_id: string; hole_number: number; par: number | null; score: number | null; putts: number | null; gir: boolean | null; fairway_hit: boolean | null; yardage: number | null };

const log = (what: string, err: unknown) => chLogServer('rounds.course', what, err);

export async function loadCourseHistory(rawKey: string, viewer: ChCourseViewer, opts: { window: ChCourseWindow }): Promise<ChCourseHistoryResult> {
  const key = parseCourseKey(rawKey);
  if (!key) return { kind: 'notFound' };
  const supabase = await createClient();
  const coach = viewer.role === 'coach';
  const zoneTeam = viewer.teamId ?? null;
  const [listRes, memberRes, playerRes, libraryRes, zone] = await Promise.all([
    fetchAllRowsResult<ChCourseListRow>(
      (from, to) => {
        let q = supabase.from('golf_rounds').select(LIST_COLUMNS).eq('player_id', viewer.playerId).eq('is_test', false).eq('status', 'completed');
        if (viewer.role === 'coach') q = q.eq('team_id', viewer.teamId);
        return q.order('round_date', { ascending: false }).order('id', { ascending: false }).range(from, to);
      },
      undefined,
      { table: 'golf_rounds', action: 'clubhouse.rounds.course', feature: 'round_tracking', sport: 'golf' },
    ),
    viewer.role === 'coach'
      ? supabase.from('golf_team_members').select('id').eq('team_id', viewer.teamId).eq('player_id', viewer.playerId).eq('status', 'active').limit(1)
      : Promise.resolve({ data: [{ id: 'self' }], error: null }),
    coach ? supabase.from('golf_players').select('first_name').eq('id', viewer.playerId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    key.kind === 'id' ? supabase.from('golf_courses').select('id, name, city, state').eq('id', key.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    zoneTeam ? loadTeamZone(supabase, zoneTeam, 'rounds.course') : Promise.resolve(SEASON_DEFAULT_TZ),
  ]);
  if (memberRes.error) {
    log('membership', memberRes.error);
    return { kind: 'error' };
  }
  if (!memberRes.data?.length) return { kind: 'notOnTeam' };
  if (listRes.error) {
    log('list', listRes.error);
    return { kind: 'error' };
  }
  if (libraryRes.error) log('library', libraryRes.error);
  if (playerRes.error) log('player', playerRes.error);
  // Canonical totals at the boundary (round-total.ts): the headline average, Best and Last time read the same total the library row
  // shows for the round, not the stored total_score that drifts by one on ~5% of rounds.
  const list = (listRes.data ?? []).map(withCanonicalRoundTotal);
  const library = libraryRes.data ? { name: libraryRes.data.name, city: libraryRes.data.city ?? null, state: libraryRes.data.state ?? null } : null;

  // Which rounds are here, to read only their holes and the newest one's coach note.
  const groups = groupCourseRounds(list);
  const resolved = resolveCourseKey(key, groups, library?.name ?? null);
  if (resolved.redirectTo) return { kind: 'redirect', to: resolved.redirectTo };
  const group = resolved.group ? groups.get(resolved.group) : null;
  if (!group) return { kind: 'notFound' };
  const ids = group.rounds.map((r) => r.id);

  const holesRead = (async (): Promise<Map<string, ChPlayHole[]> | null> => {
    const holes = new Map<string, ChPlayHole[]>();
    for (const chunk of chunkIds(ids)) {
      const res = await fetchAllRowsResult<HoleRow>(
        (from, to) => supabase.from('golf_holes').select(HOLE_COLUMNS).in('round_id', chunk).order('round_id').order('hole_number').range(from, to),
        undefined,
        { table: 'golf_holes', action: 'clubhouse.rounds.course', feature: 'round_tracking', sport: 'golf' },
      );
      if (res.error) {
        log('holes', res.error);
        return null;
      }
      for (const h of res.data ?? []) {
        if (h.par == null) continue;
        const arr = holes.get(h.round_id) ?? [];
        arr.push({ n: h.hole_number, par: h.par, score: h.score, putts: h.putts, gir: h.gir, fairway: h.fairway_hit, yards: h.yardage });
        holes.set(h.round_id, arr);
      }
    }
    return holes;
  })();
  // P-7 (e2): the tee cards of the nine-hole rounds here, so each nine can be placed on its card (`nineOf`). Readable by
  // every signed-in user; a failed read leaves the nines to the player's own card, logged.
  const nineTees = [...new Set(group.rounds.filter((r) => r.holes_played === 9 && r.tee_id).map((r) => r.tee_id as string))];
  const cardsRead = (async (): Promise<Map<string, Map<number, ChCardHole>>> => {
    const cards = new Map<string, Map<number, ChCardHole>>();
    if (!nineTees.length) return cards;
    const res = await supabase.from('golf_course_tee_holes').select('tee_id, hole_number, par, yardage').in('tee_id', nineTees);
    if (res.error) {
      log('tee-cards', res.error);
      return cards;
    }
    for (const h of res.data ?? []) {
      const card = cards.get(h.tee_id) ?? new Map<number, ChCardHole>();
      card.set(h.hole_number, { par: h.par, yards: h.yardage });
      cards.set(h.tee_id, card);
    }
    return cards;
  })();
  const [holes, noteRes, teeCards] = await Promise.all([holesRead, supabase.from('golf_round_reviews').select('coach_notes').eq('round_id', ids[0]!).maybeSingle(), cardsRead]);
  if (noteRes.error) log('coach-note', noteRes.error);

  const playerName = playerRes.data?.first_name?.trim() || null;
  const shaped = toCourseHistory({
    rawKey,
    list,
    holes,
    teeCards,
    library,
    coachNote: noteRes.error ? null : (noteRes.data?.coach_notes ?? null),
    window: opts.window,
    seasonStart: seasonStartDate(new Date(), zone),
    // A coach's page names the player; a name that didn't load reads as "This player", never an invented name.
    who: coach ? (playerName ?? 'This player') : null,
  });
  if (shaped.kind === 'redirect') return { kind: 'redirect', to: shaped.key };
  if (shaped.kind === 'notFound') return { kind: 'notFound' };
  return { kind: 'ok', data: shaped.data, playerName };
}
