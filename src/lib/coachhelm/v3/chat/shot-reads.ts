import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { PUTT_DISTANCE_BUCKETS, puttBucketFor } from '@/lib/golf/putt-distance-buckets';
import { requireRosterPlayer, type CoachChatContext } from './context';
import { nowIso, unavailableEnvelope, type ToolEnvelope } from './provenance';

type Sb = SupabaseClient<Database>;

/** The eight the round RPC allows (`submit_round_atomic`); shots store a direction and a distance, not a map position. */
export const MISS_DIRECTIONS = ['short', 'long', 'left', 'right', 'short_left', 'short_right', 'long_left', 'long_right'] as const;
export type MissDirection = (typeof MISS_DIRECTIONS)[number];

export interface ShotRow {
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

const SHOT_COLUMNS = 'miss_direction, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, lie_before, lie_after, club_type, is_penalty, putt_distance_feet, putt_made';

/** Team-scoped, only reads: never a write to `golf_shots`, `golf_rounds` or the round RPCs (SHARED-10). */
async function shotsOf(sb: Sb, ctx: CoachChatContext, input: { player_id?: string; since_days: number }): Promise<{ shots: ShotRow[]; rounds: number; since: string; playerName: string | null } | null> {
  const player = input.player_id ? requireRosterPlayer(ctx, input.player_id) : null;
  const since = new Date(Date.now() - input.since_days * 86_400_000).toISOString().slice(0, 10);
  let q = sb.from('golf_rounds').select('id').eq('team_id', ctx.team_id).eq('status', 'completed').eq('is_test', false).gte('round_date', since);
  if (player) q = q.eq('player_id', player.id);
  const rounds = await q;
  if (rounds.error) return null;
  const ids = (rounds.data ?? []).map((r) => r.id);
  const shots: ShotRow[] = [];
  for (const chunk of chunkIds(ids)) {
    // PostgREST stops at 1000 rows a response, so a long chunk is paged rather than silently cut short.
    const res = await fetchAllRowsResult<ShotRow>((from, to) => sb.from('golf_shots').select(SHOT_COLUMNS).in('round_id', chunk).order('id').range(from, to) as never);
    if (res.error) return null;
    shots.push(...(res.data ?? []));
  }
  return { shots, rounds: ids.length, since, playerName: player?.name ?? null };
}

const whose = (name: string | null, team: string) => name ?? team;

export async function getShotPattern(sb: Sb, ctx: CoachChatContext, input: { player_id?: string; club_type?: string; from_yards?: number; to_yards?: number; since_days: number; mode?: 'approach' | 'putting' }): Promise<ToolEnvelope> {
  const read = await shotsOf(sb, ctx, input);
  if (!read) return unavailableEnvelope('Could not read those shots.', 'The shots query failed. This is not the same as having none.');
  const who = whose(read.playerName, ctx.team_name);
  if (input.mode === 'putting') {
    const profile = puttProfileOf(read.shots);
    return { summary: `${who}: putting by distance, last ${input.since_days} days.`, measurements: [], series: [], detail: { kind: 'putt_profile', profile, rounds: read.rounds, since: read.since, since_days: input.since_days }, coverage: profile.attempts ? 'complete' : 'empty', coverage_note: profile.attempts ? null : 'No putts with a distance in this window.', as_of: nowIso() };
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
  return { summary: `${who}: ${pattern.total} shots, last ${input.since_days} days.`, measurements: [], series: [], detail: { kind: 'miss_pattern', pattern, rounds: read.rounds, since: read.since, since_days: input.since_days }, coverage: pattern.total ? 'complete' : 'empty', coverage_note: pattern.total ? null : 'No shots logged in this window.', as_of: nowIso() };
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
  return { summary: `${whose(read.playerName, ctx.team_name)}: proximity by band, last ${input.since_days} days.`, measurements: [], series: [], detail: { bands: rows, rounds: read.rounds }, coverage: rows.some((r) => r.shots) ? 'complete' : 'empty', coverage_note: rows.some((r) => r.shots) ? null : 'No approach shots in this window.', as_of: nowIso() };
}

/** Hole by hole for one of the team's rounds. A round off this team isn't read at all. */
export async function getRoundDetail(sb: Sb, ctx: CoachChatContext, input: { round_id: string }): Promise<ToolEnvelope> {
  const r = await sb.from('golf_rounds').select('id, player_id, round_date, course_name, total_score, score_to_par').eq('id', input.round_id).eq('team_id', ctx.team_id).maybeSingle();
  if (r.error) return unavailableEnvelope('Could not read that round.', 'The round query failed.');
  if (!r.data) return { summary: 'That round is not on this team.', measurements: [], series: [], coverage: 'empty', coverage_note: 'No round with that id on this team.', as_of: nowIso() };
  const player = requireRosterPlayer(ctx, r.data.player_id);
  const holes = await sb.from('golf_holes').select('hole_number, par, score, putts, penalty_strokes, gir').eq('round_id', input.round_id).order('hole_number');
  if (holes.error) return unavailableEnvelope('Could not read that round.', 'The holes query failed.');
  const list = holes.data ?? [];
  return { summary: `${player.name}, ${r.data.course_name ?? 'a round'} on ${r.data.round_date}.`, measurements: [], series: [], detail: { kind: 'hole_strip', round: { date: r.data.round_date, course: r.data.course_name, total: r.data.total_score, to_par: r.data.score_to_par }, holes: list }, coverage: list.length ? 'complete' : 'empty', coverage_note: list.length ? null : 'This round was posted as a total, with no holes.', as_of: nowIso() };
}
