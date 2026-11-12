import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { PUTT_DISTANCE_BUCKETS, puttBucketFor } from '@/lib/golf/putt-distance-buckets';
import { requireRosterPlayer, type CoachChatContext } from './context';
import { nowIso, readFigure, unavailableEnvelope, type Measurement, type ToolEnvelope } from './provenance';
import { MISS_DIRECTIONS, type MissDirection } from './miss-directions';
import { UI_ONLY_KEY } from './ui-only';

type Sb = SupabaseClient<Database>;

export { MISS_DIRECTIONS, type MissDirection };

export interface ShotRow {
  /** The shot, its round and its hole: kept so the shots behind a miss pattern can be listed and opened (Miss Compass). */
  id?: string;
  round_id?: string;
  hole_id?: string | null;
  miss_direction: string | null;
  distance_to_hole_before: number | null;
  distance_unit_before: string | null;
  distance_to_hole_after: number | null;
  distance_unit_after: string | null;
  lie_before: string | null;
  lie_after: string | null;
  club_type: string | null;
  is_penalty: boolean | null;
  putt_distance_feet: number | null;
  putt_made: boolean | null;
}

const toFeet = (v: number | null, unit: string | null): number | null => {
  if (v == null || !Number.isFinite(v)) return null;
  const u = (unit ?? 'yards').toLowerCase();
  if (u.startsWith('f')) return v;
  if (u.startsWith('m')) return v * 3.28084;
  return v * 3;
};

export interface MissPattern {
  total: number;
  /** Shots with no miss logged: counted apart, never guessed. */
  no_direction: number;
  wedges: Array<{ direction: MissDirection; count: number; avg_left_ft: number | null }>;
  inside_15: number;
  inside_25: number;
  penalties: number;
  lies: Record<string, number>;
}

/** Pure, so the counting is tested without a database. A null direction is counted separately; distances convert by unit. */
export function missPatternOf(shots: readonly ShotRow[]): MissPattern {
  const by = new Map<MissDirection, { n: number; left: number; withLeft: number }>();
  let none = 0;
  let in15 = 0;
  let in25 = 0;
  let pen = 0;
  const lies: Record<string, number> = {};
  for (const s of shots) {
    const left = toFeet(s.distance_to_hole_after, s.distance_unit_after);
    if (left != null && left <= 15) in15++;
    if (left != null && left <= 25) in25++;
    if (s.is_penalty) pen++;
    if (s.lie_after) lies[s.lie_after] = (lies[s.lie_after] ?? 0) + 1;
    const d = s.miss_direction as MissDirection | null;
    if (!d || !MISS_DIRECTIONS.includes(d)) {
      none++;
      continue;
    }
    const e = by.get(d) ?? { n: 0, left: 0, withLeft: 0 };
    e.n++;
    if (left != null) {
      e.left += left;
      e.withLeft++;
    }
    by.set(d, e);
  }
  return {
    total: shots.length,
    no_direction: none,
    wedges: MISS_DIRECTIONS.map((direction) => {
      const e = by.get(direction);
      return { direction, count: e?.n ?? 0, avg_left_ft: e?.withLeft ? Math.round((e.left / e.withLeft) * 10) / 10 : null };
    }),
    inside_15: in15,
    inside_25: in25,
    penalties: pen,
    lies,
  };
}

/** How many shots each direction lists for the coach to open; the true count is always beside the list. */
export const MISS_SHOTS_CAP = 40;

/** One shot behind a miss pattern, as the drawer lists it and opens its round. Distances in feet, as the shot stored them. */
export interface MissShot {
  id: string;
  round_id: string;
  hole_id: string | null;
  round_date: string | null;
  course: string | null;
  from_ft: number | null;
  left_ft: number | null;
  lie_before: string | null;
}

/** The shots behind each wedge: the true count, and up to `cap` of them, newest round first. */
export interface MissShots {
  cap: number;
  directions: Record<MissDirection, { count: number; shots: MissShot[] }>;
}

const oneDecimal = (v: number | null): number | null => (v == null ? null : Math.round(v * 10) / 10);

/**
 * Pure, beside `missPatternOf` and counted the same way (a direction outside the eight is no direction), so each wedge's
 * `count` is its count there. The list is the newest rounds' shots first, then by shot id, so the same `cap` shots come back
 * on every read.
 */
export function missShotsOf(shots: readonly ShotRow[], rounds: ReadonlyMap<string, { round_date: string | null; course: string | null }>, cap = MISS_SHOTS_CAP): MissShots {
  const by = new Map<MissDirection, ShotRow[]>();
  for (const s of shots) {
    const d = s.miss_direction as MissDirection | null;
    if (!d || !MISS_DIRECTIONS.includes(d)) continue;
    (by.get(d) ?? by.set(d, []).get(d)!).push(s);
  }
  const dateOf = (s: ShotRow) => (s.round_id ? (rounds.get(s.round_id)?.round_date ?? '') : '');
  const directions = {} as MissShots['directions'];
  for (const d of MISS_DIRECTIONS) {
    const all = by.get(d) ?? [];
    const listed = all
      .filter((s): s is ShotRow & { id: string; round_id: string } => typeof s.id === 'string' && typeof s.round_id === 'string')
      .sort((a, b) => dateOf(b).localeCompare(dateOf(a)) || a.id.localeCompare(b.id))
      .slice(0, cap)
      .map((s) => {
        const round = rounds.get(s.round_id);
        return {
          id: s.id,
          round_id: s.round_id,
          hole_id: s.hole_id ?? null,
          round_date: round?.round_date ?? null,
          course: round?.course ?? null,
          from_ft: oneDecimal(toFeet(s.distance_to_hole_before, s.distance_unit_before)),
          left_ft: oneDecimal(toFeet(s.distance_to_hole_after, s.distance_unit_after)),
          lie_before: s.lie_before,
        };
      });
    directions[d] = { count: all.length, shots: listed };
  }
  return { cap, directions };
}

export interface PuttProfile {
  attempts: number;
  buckets: Array<{ id: string; label: string; attempts: number; made: number; rate: number | null }>;
}

/** Make rate by the Stats page's six buckets, left-inclusive. */
export function puttProfileOf(shots: ReadonlyArray<Pick<ShotRow, 'putt_distance_feet' | 'putt_made'>>): PuttProfile {
  const n = new Map<string, { a: number; m: number }>();
  let attempts = 0;
  for (const s of shots) {
    if (s.putt_distance_feet == null) continue;
    const b = puttBucketFor(s.putt_distance_feet);
    const e = n.get(b.id) ?? { a: 0, m: 0 };
    e.a++;
    if (s.putt_made) e.m++;
    n.set(b.id, e);
    attempts++;
  }
  return { attempts, buckets: PUTT_DISTANCE_BUCKETS.map((b) => ({ id: b.id, label: b.label, attempts: n.get(b.id)?.a ?? 0, made: n.get(b.id)?.m ?? 0, rate: n.get(b.id)?.a ? Math.round((n.get(b.id)!.m / n.get(b.id)!.a) * 1000) / 10 : null })) };
}

const SHOT_COLUMNS = 'id, round_id, hole_id, miss_direction, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, lie_before, lie_after, club_type, is_penalty, putt_distance_feet, putt_made';

/** Team-scoped, only reads: never a write to `golf_shots`, `golf_rounds` or the round RPCs (SHARED-10). */
async function shotsOf(sb: Sb, ctx: CoachChatContext, input: { player_id?: string; since_days: number }): Promise<{ shots: ShotRow[]; rounds: number; roundsById: Map<string, { round_date: string | null; course: string | null }>; since: string; playerName: string | null; entity: Measurement['entity']; scope: { player_id: string } | { team_scope: true } } | null> {
  const player = input.player_id ? requireRosterPlayer(ctx, input.player_id) : null;
  const since = new Date(Date.now() - input.since_days * 86_400_000).toISOString().slice(0, 10);
  let q = sb.from('golf_rounds').select('id, round_date, course_name').eq('team_id', ctx.team_id).eq('status', 'completed').eq('is_test', false).gte('round_date', since);
  if (player) q = q.eq('player_id', player.id);
  const rounds = await q;
  if (rounds.error) return null;
  const ids = (rounds.data ?? []).map((r) => r.id);
  // The date and course of each round, so a listed shot says where it was played (the same rows, no second query).
  const roundsById = new Map((rounds.data ?? []).map((r) => [r.id, { round_date: r.round_date ?? null, course: r.course_name ?? null }] as const));
  const shots: ShotRow[] = [];
  for (const chunk of chunkIds(ids)) {
    // PostgREST stops at 1000 rows a response, so a long chunk is paged rather than silently cut short.
    const res = await fetchAllRowsResult<ShotRow>((from, to) => sb.from('golf_shots').select(SHOT_COLUMNS).in('round_id', chunk).order('id').range(from, to) as never);
    if (res.error) return null;
    shots.push(...(res.data ?? []));
  }
  return {
    shots,
    rounds: ids.length,
    roundsById,
    since,
    playerName: player?.name ?? null,
    entity: player ? { kind: 'player', id: player.id, label: player.name } : { kind: 'team', id: ctx.team_id, label: ctx.team_name },
    // Every figure in `detail` belongs to this one player or to the team, so the claim audit can't let it stand for anyone else.
    scope: player ? { player_id: player.id } : { team_scope: true },
  };
}

const SEASON_DAYS = 270;
const whose = (name: string | null, team: string) => name ?? team;
const today = () => nowIso().slice(0, 10);

/**
 * `drawer`: also keep, per direction, the shots behind each wedge (`detail.ui_only.miss_shots`, capped with the true count), for
 * the Miss Compass to list and open. They are the app's alone: never in `measurements`, never read out to the model, never a
 * figure an answer is checked against (ui-only.ts). Without it the envelope is exactly what it was.
 */
export async function getShotPattern(sb: Sb, ctx: CoachChatContext, input: { player_id?: string; club_type?: string; from_yards?: number; to_yards?: number; since_days: number; mode?: 'approach' | 'putting'; drawer?: boolean }): Promise<ToolEnvelope> {
  const read = await shotsOf(sb, ctx, input);
  if (!read) return unavailableEnvelope('Could not read those shots.', 'The shots query failed. This is not the same as having none.');
  const who = whose(read.playerName, ctx.team_name);
  if (input.mode === 'putting') {
    const window = puttProfileOf(read.shots);
    // The season tick on each bar (ASK_REDESIGN 3.4): the same player over the season. A failed second read just draws no tick.
    const seasonRead = (input.since_days ?? 0) < SEASON_DAYS ? await shotsOf(sb, ctx, { ...input, since_days: SEASON_DAYS }).catch(() => null) : null;
    const season = seasonRead ? puttProfileOf(seasonRead.shots) : null;
    const profile = { ...window, buckets: window.buckets.map((b) => ({ ...b, season_rate: season?.buckets.find((x) => x.id === b.id)?.rate ?? null })) };
    const measurements = profile.buckets.flatMap((b) => (b.rate == null ? [] : [readFigure({ metric_id: `putt_make_rate_${b.id}`, metric_label: `Make rate, ${b.label}`, unit: 'percent', value: b.rate, entity: read.entity, window_start: read.since, window_end: today(), sample_size: b.attempts, sample_unit: 'attempts', denominator: b.attempts, direction: 'higher_better', source: 'shots', method: 'putts_made_over_attempts_by_stats_bucket' })]));
    return { summary: `${who}: putting by distance, last ${input.since_days} days.`, measurements, series: [], detail: { ...read.scope, metric_scope: 'putt_make_rate', kind: 'putt_profile', profile, rounds: read.rounds, since: read.since, since_days: input.since_days }, coverage: profile.attempts ? 'complete' : 'empty', coverage_note: profile.attempts ? null : 'No putts with a distance in this window.', as_of: nowIso() };
  }
  const list = read.shots.filter((s) => {
    if (s.putt_distance_feet != null) return false;
    if (input.club_type && s.club_type !== input.club_type) return false;
    const from = toFeet(s.distance_to_hole_before, s.distance_unit_before);
    if (input.from_yards != null && (from == null || from < input.from_yards * 3)) return false;
    if (input.to_yards != null && (from == null || from >= input.to_yards * 3)) return false;
    return true;
  });
  const pattern = missPatternOf(list);
  const shotCount = (metric_id: string, metric_label: string, value: number) => readFigure({ metric_id, metric_label, unit: 'count', value, entity: read.entity, window_start: read.since, window_end: today(), sample_size: pattern.total, sample_unit: 'shots', source: 'shots', method: 'count_of_logged_shots' });
  const measurements = pattern.total ? [shotCount('shots_logged', 'Shots logged', pattern.total), shotCount('shots_inside_15ft', 'Left inside 15 ft', pattern.inside_15), shotCount('shots_inside_25ft', 'Left inside 25 ft', pattern.inside_25)] : [];
  const drawer = input.drawer && pattern.total > 0 ? { [UI_ONLY_KEY]: { miss_shots: missShotsOf(list, read.roundsById) } } : {};
  return { summary: `${who}: ${pattern.total} shots, last ${input.since_days} days.`, measurements, series: [], detail: { ...read.scope, kind: 'miss_pattern', pattern, rounds: read.rounds, since: read.since, since_days: input.since_days, ...drawer }, coverage: pattern.total ? 'complete' : 'empty', coverage_note: pattern.total ? null : 'No shots logged in this window.', as_of: nowIso() };
}

/** Average distance left by approach band, from where the approach was played. */
export async function getProximityByBand(sb: Sb, ctx: CoachChatContext, input: { player_id?: string; bands: Array<[number, number]>; since_days: number }): Promise<ToolEnvelope> {
  const read = await shotsOf(sb, ctx, input);
  if (!read) return unavailableEnvelope('Could not read those shots.', 'The shots query failed.');
  const rows = input.bands.map(([lo, hi]) => {
    const inBand = read.shots.filter((s) => {
      const from = toFeet(s.distance_to_hole_before, s.distance_unit_before);
      return s.putt_distance_feet == null && from != null && from >= lo * 3 && from < hi * 3;
    });
    const lefts = inBand.map((s) => toFeet(s.distance_to_hole_after, s.distance_unit_after)).filter((v): v is number => v != null);
    return { from_yards: lo, to_yards: hi, shots: inBand.length, avg_left_ft: lefts.length ? Math.round((lefts.reduce((a, b) => a + b, 0) / lefts.length) * 10) / 10 : null };
  });
  const measurements = rows.flatMap((r) => (r.avg_left_ft == null ? [] : [readFigure({ metric_id: `proximity_${r.from_yards}_${r.to_yards}_yards`, metric_label: `Average left from ${r.from_yards} to ${r.to_yards} yards`, unit: 'feet', value: r.avg_left_ft, entity: read.entity, window_start: read.since, window_end: today(), sample_size: r.shots, sample_unit: 'shots', direction: 'lower_better', source: 'shots', method: 'mean_distance_to_hole_after_by_approach_band' })]));
  return { summary: `${whose(read.playerName, ctx.team_name)}: proximity by band, last ${input.since_days} days.`, measurements, series: [], detail: { ...read.scope, bands: rows, rounds: read.rounds }, coverage: rows.some((r) => r.shots) ? 'complete' : 'empty', coverage_note: rows.some((r) => r.shots) ? null : 'No approach shots in this window.', as_of: nowIso() };
}
