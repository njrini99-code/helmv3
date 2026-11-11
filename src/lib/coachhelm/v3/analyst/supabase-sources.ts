/**
 * CoachHelm analyst: the fact sheet's sources over a Supabase client. READ-ONLY: every call is a SELECT.
 *
 * The caller hands in the client (the dry run builds one from explicit flags; nothing here reads an env file or
 * creates a client), so this module cannot reach a database on its own.
 *
 * PostgREST returns at most 1,000 rows and a long `.in()` list overflows the URL, so every read is chunked
 * (`chunkIds`) and paged (`fetchAllRowsResult`) on a stable order that ends in the primary key
 * (.claude/skills/helm-supabase/SKILL.md). A failed page throws: a partial read is never returned as a whole one.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getValidTimezone } from '@/lib/calendar/timezone';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import type { Database } from '@/lib/types/database';
import type { AnalystSources, HoleRow, RoundCacheRow, RoundRow, ShotRow, TourStandardRow } from './sources';

type Client = SupabaseClient<Database>;
type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string; code?: string | null } | null }>;

const ROUND_COLUMNS =
  'id, player_id, round_date, round_type, total_score, score_to_par, front_nine, back_nine, holes_played, total_putts, strokes_gained_total, strokes_gained_tee, strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting';
const CACHE_COLUMNS =
  'round_id, greens_hit, greens_total, fairways_hit, fairways_total, total_putts, scramble_attempts, scrambles_converted, sand_attempts, sand_saves, three_putts, penalty_strokes, birdies, eagles, pars, bogeys, double_bogeys, triple_plus';
const HOLE_COLUMNS = 'id, round_id, hole_number, par, score';
const SHOT_COLUMNS =
  'id, round_id, hole_id, shot_type, lie_before, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, lie_after, putt_made, putt_distance_feet';

/** Every row of a chunked, paged read; throws with the table's name when a page fails. */
async function readAll<T>(what: string, ids: readonly string[], page: (ids: string[], from: number, to: number) => Page<T>): Promise<T[]> {
  const rows: T[] = [];
  for (const chunk of chunkIds(ids)) {
    const res = await fetchAllRowsResult<T>((from, to) => page(chunk, from, to));
    if (res.error) throw new Error(`analyst: reading ${what} failed: ${res.error.message}`);
    rows.push(...(res.data ?? []));
  }
  return rows;
}

export function supabaseAnalystSources(sb: Client): AnalystSources {
  return {
    async team(teamId) {
      const { data: team, error } = await sb.from('golf_teams').select('id, gender').eq('id', teamId).maybeSingle();
      if (error) throw new Error(`analyst: reading golf_teams failed: ${error.message}`);
      if (!team) return null;
      // The zone the season turns in is the team settings' (src/clubhouse/data/season.ts loadTeamZone), with the product default behind it.
      const settings = await sb.from('golf_team_settings').select('timezone').eq('team_id', teamId).maybeSingle();
      if (settings.error) throw new Error(`analyst: reading golf_team_settings failed: ${settings.error.message}`);
      return { id: team.id, gender: team.gender, timezone: getValidTimezone(settings.data?.timezone ?? null) };
    },

    async activePlayerIds(teamId) {
      const res = await fetchAllRowsResult<{ player_id: string }>(
        (from, to) => sb.from('golf_team_members').select('player_id').eq('team_id', teamId).eq('status', 'active').order('id', { ascending: true }).range(from, to) as unknown as Page<{ player_id: string }>,
      );
      if (res.error) throw new Error(`analyst: reading golf_team_members failed: ${res.error.message}`);
      return [...new Set((res.data ?? []).map((r) => r.player_id))].sort();
    },

    rounds(playerIds, since) {
      // The same rows src/clubhouse/data/season.ts loadSeasonRounds asks for.
      return readAll<RoundRow>('golf_rounds', playerIds, (ids, from, to) =>
        sb
          .from('golf_rounds')
          .select(ROUND_COLUMNS)
          .in('player_id', ids)
          .eq('is_test', false)
          .eq('status', 'completed')
          .not('total_score', 'is', null)
          .gte('round_date', since)
          .order('round_date', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to) as unknown as Page<RoundRow>,
      );
    },

    roundCache(roundIds) {
      return readAll<RoundCacheRow>('golf_round_stats_cache', roundIds, (ids, from, to) =>
        sb.from('golf_round_stats_cache').select(CACHE_COLUMNS).in('round_id', ids).order('id', { ascending: true }).range(from, to) as unknown as Page<RoundCacheRow>,
      );
    },

    holes(roundIds) {
      return readAll<HoleRow>('golf_holes', roundIds, (ids, from, to) =>
        sb.from('golf_holes').select(HOLE_COLUMNS).in('round_id', ids).order('id', { ascending: true }).range(from, to) as unknown as Page<HoleRow>,
      );
    },

    shots(roundIds) {
      return readAll<ShotRow>('golf_shots', roundIds, (ids, from, to) =>
        sb.from('golf_shots').select(SHOT_COLUMNS).in('round_id', ids).order('id', { ascending: true }).range(from, to) as unknown as Page<ShotRow>,
      );
    },

    async tourStandards(tour) {
      const { data, error } = await sb.from('golf_pga_standards').select('metric_id, season, pga_tour_value, source').eq('tour', tour).order('season', { ascending: false }).order('metric_id', { ascending: true });
      if (error) throw new Error(`analyst: reading golf_pga_standards failed: ${error.message}`);
      // The newest season per metric (src/lib/coachhelm/v3/standing/pga-standards.ts loadStandardsForTour).
      const byMetric = new Map<string, TourStandardRow>();
      for (const r of data ?? []) {
        if (byMetric.has(r.metric_id)) continue;
        const value = r.pga_tour_value == null ? null : Number(r.pga_tour_value);
        byMetric.set(r.metric_id, { metric_id: r.metric_id, value: value != null && Number.isFinite(value) ? value : null, source: r.source });
      }
      return [...byMetric.values()];
    },
  };
}
