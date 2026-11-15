import 'server-only';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { createClient } from '@/lib/supabase/server';
import { chLogServer } from '../lib/track-server';
import { exampleRoundIds } from './coachhelm-dive-shape';
import type { ChReadExtras, ReadCacheRow, ReadHoleRow, ReadRoundRow } from './coachhelm-read-extras-shape';
import { seasonStartDate } from './season';

/** The most rounds read for one player: the season and the eight before it fit many times over. */
const ROUNDS_READ = 200;

const ROUND_COLUMNS =
  'id, round_date, holes_played, total_score, front_nine, back_nine, total_putts, score_to_par, strokes_gained_total, strokes_gained_tee, strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting, total_penalties';
const CACHE_COLUMNS =
  'round_id, strokes_gained_total, penalty_strokes, greens_hit, greens_total, fairways_hit, fairways_total, sand_saves, sand_attempts, scrambles_converted, scramble_attempts, eagles, birdies, pars, bogeys, double_bogeys, triple_plus';

/**
 * What the read page reads beside the read (see `coachhelm-read-extras-shape.ts`): the player's completed rounds with their stats
 * rows, and the holes of the rounds a counted path names. Read only, and only for the one player the page has already been scoped to
 * (the coach's checked scope, or the session's own player): `playerId` is never the address's. Three reads at most, side by side.
 * Null when the rounds did not load: the page then draws no trend, no newer-round count and no hole scores, and the read is unchanged.
 */
export async function loadReadExtras(input: { playerId: string; raw: EvidenceInsight | undefined }): Promise<ChReadExtras | null> {
  if (!input.raw) return null;
  try {
    const supabase = await createClient();
    const holeRounds = exampleRoundIds(input.raw.evidence);
    const [rounds, cache, holes] = await Promise.all([
      supabase.from('golf_rounds').select(ROUND_COLUMNS).eq('player_id', input.playerId).eq('is_test', false).eq('status', 'completed').order('round_date', { ascending: false }).limit(ROUNDS_READ),
      supabase.from('golf_round_stats_cache').select(CACHE_COLUMNS).eq('player_id', input.playerId).order('updated_at', { ascending: false }).limit(ROUNDS_READ * 2),
      holeRounds.length > 0 ? supabase.from('golf_holes').select('round_id, hole_number, score, par').in('round_id', holeRounds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (rounds.error) {
      chLogServer('coachhelm.read', 'extras.rounds', rounds.error);
      return null;
    }
    if (cache.error) chLogServer('coachhelm.read', 'extras.cache', cache.error);
    if (holes.error) chLogServer('coachhelm.read', 'extras.holes', holes.error);
    return {
      rounds: (rounds.data ?? []) as ReadRoundRow[],
      cache: (cache.error ? [] : (cache.data ?? [])) as unknown as ReadCacheRow[],
      holes: (holes.error ? [] : (holes.data ?? [])) as ReadHoleRow[],
      seasonSince: seasonStartDate(),
    };
  } catch (err) {
    chLogServer('coachhelm.read', 'extras', err);
    return null;
  }
}
