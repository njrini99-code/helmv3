import { initials } from '../lib/names';
import { normalizeStartHole } from '@/lib/golf/round-session/play-order';
import { normalizeRoundType, thruOf, toParOf, type LiveHole, type LiveLane, type LivePhase, type LiveShare } from './model';

/**
 * Two sources become the same `LiveLane` (8.15): a row of `golf_round_live` (held migration 1), and a round read the v0
 * way from `golf_rounds` and `golf_holes`. Names are never in either: they come from the roster the snapshot carries.
 */

export type LiveRoster = Record<string, string>;

/** `public.golf_round_live`, as PostgREST returns it. The table is not in the generated types until it is applied. */
export interface GolfRoundLiveRow {
  round_id: string;
  team_id: string;
  player_id: string;
  round_type: string;
  qualifier_id: string | null;
  qualifier_round: number | null;
  round_date: string;
  course_id: string | null;
  course_name: string | null;
  holes_planned: number;
  start_position: number;
  current_hole: number | null;
  share: string;
  phase: string;
  thru: number;
  to_par: number | null;
  strokes: number | null;
  holes: Array<{ n: number; p: number | null; y: number | null; s: number | null; at: string | null }> | null;
  last_hole_at: string | null;
  heard_at: string;
  started_at: string | null;
  ended_at: string | null;
  seq: number | string;
}

/** A `golf_rounds` row with its plan and scored holes, the v0 poll's shape (8.14). */
export interface PollRoundRow {
  id: string;
  player_id: string;
  team_id: string | null;
  round_type: string | null;
  qualifier_id: string | null;
  qualifier_round_number: number | null;
  round_date: string;
  course_id: string | null;
  course_name: string | null;
  holes_played: number | null;
  current_hole: number | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  /** `draft_data->holes`: the hole plan, `{ number, par, yardage }` per hole. */
  plan: Array<{ number?: number | string; par?: number | string | null; yardage?: number | string | null }> | null;
  /** `draft_data->startHole`. */
  start_hole: number | string | null;
  golf_holes: Array<{ hole_number: number; par: number | null; score: number | null; yardage: number | null }> | null;
}

const SHARES: readonly LiveShare[] = ['off', 'coaches', 'team'];
const PHASES: readonly LivePhase[] = ['on_course', 'finished', 'posted', 'stopped'];

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/** `current_hole` is a hole number; anything outside 1..18 is unknown (the refresh stores it as NULL too). */
export const holeNumberOrNull = (v: unknown): number | null => {
  const n = num(v);
  return n != null && Number.isInteger(n) && n >= 1 && n <= 18 ? n : null;
};

const planned = (v: unknown): 9 | 18 => (num(v) === 9 ? 9 : 18);

export function laneFromLiveRow(row: GolfRoundLiveRow, roster: LiveRoster): LiveLane | null {
  const phase = PHASES.find((p) => p === row.phase);
  const share = SHARES.find((s) => s === row.share);
  if (!row.round_id || !row.player_id || !phase || !share) return null;
  const holesPlanned = planned(row.holes_planned);
  const holes: LiveHole[] = (Array.isArray(row.holes) ? row.holes : [])
    .map((h) => ({ n: num(h.n) ?? 0, par: num(h.p), yds: num(h.y), score: num(h.s), at: h.at ?? null }))
    .filter((h) => h.n >= 1 && h.n <= 18)
    .sort((a, b) => a.n - b.n);
  const name = roster[row.player_id] ?? '';
  return {
    roundId: row.round_id,
    playerId: row.player_id,
    name,
    initials: initials(name),
    roundType: normalizeRoundType(row.round_type),
    qualifierId: row.qualifier_id,
    qualifierRound: row.qualifier_round,
    courseId: row.course_id,
    courseName: row.course_name,
    roundDate: row.round_date,
    holesPlanned,
    startPosition: normalizeStartHole(row.start_position, holesPlanned),
    currentHole: holeNumberOrNull(row.current_hole),
    share,
    phase,
    thru: num(row.thru) ?? thruOf(holes),
    toPar: num(row.to_par),
    strokes: num(row.strokes),
    holes,
    lastHoleAt: row.last_hole_at,
    heardAt: row.heard_at,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    seq: num(row.seq) ?? 0,
    source: 'live',
  };
}

/**
 * A round read the v0 way. The hole plan (`draft_data.holes`) and the scored `golf_holes` merge as the refresh does:
 * a hole with no score is unplayed (the save writes a row for every planned hole with `score: null`). A hole's time is
 * what the previous read said while its score is unchanged, else `nowIso`, the moment this poll first saw it; on the
 * first read there is no earlier read, so it is unknown.
 */
export function laneFromPollRow(row: PollRoundRow, roster: LiveRoster, prev?: LiveLane, nowIso?: string): LiveLane | null {
  if (!row.id || !row.player_id) return null;
  const holesPlanned = planned(row.holes_played);
  const merged = new Map<number, { par: number | null; yds: number | null; score: number | null }>();
  for (const p of Array.isArray(row.plan) ? row.plan : []) {
    const n = num(p?.number);
    if (n == null || n < 1 || n > 18) continue;
    const par = num(p.par);
    const yds = num(p.yardage);
    merged.set(n, { par: par != null && par >= 1 && par <= 9 ? par : null, yds: yds != null && yds > 0 ? yds : null, score: null });
  }
  for (const h of Array.isArray(row.golf_holes) ? row.golf_holes : []) {
    const n = num(h.hole_number);
    if (n == null || n < 1 || n > 18) continue;
    const cur = merged.get(n) ?? { par: null, yds: null, score: null };
    const score = num(h.score);
    merged.set(n, { par: num(h.par) ?? cur.par, yds: num(h.yardage) && num(h.yardage)! > 0 ? num(h.yardage) : cur.yds, score: score != null && score > 0 ? score : null });
  }
  const before = new Map((prev?.holes ?? []).map((h) => [h.n, h]));
  const holes: LiveHole[] = [...merged.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([n, h]) => {
      const was = before.get(n);
      const at = h.score == null ? null : was?.score === h.score ? was.at : prev && nowIso ? nowIso : null;
      return { n, par: h.par, yds: h.yds, score: h.score, at };
    });
  const thru = thruOf(holes);
  const status = row.status;
  const phase: LivePhase = status === 'completed' ? 'posted' : status === 'abandoned' ? 'stopped' : thru >= holesPlanned ? 'finished' : 'on_course';
  const times = holes.map((h) => h.at).filter((t): t is string => !!t).sort();
  const heardAt = row.updated_at ?? row.created_at ?? nowIso ?? new Date(0).toISOString();
  const name = roster[row.player_id] ?? '';
  const scored = holes.filter((h) => h.score != null);
  return {
    roundId: row.id,
    playerId: row.player_id,
    name,
    initials: initials(name),
    roundType: normalizeRoundType(row.round_type),
    qualifierId: row.qualifier_id,
    qualifierRound: row.qualifier_round_number,
    courseId: row.course_id,
    courseName: row.course_name,
    roundDate: row.round_date,
    holesPlanned,
    startPosition: normalizeStartHole(num(row.start_hole), holesPlanned),
    currentHole: holeNumberOrNull(row.current_hole),
    // The poll can only read the rounds a coach may always see: qualifier and tournament, which are shown to coaches.
    share: 'coaches',
    phase,
    thru,
    toPar: toParOf(holes),
    strokes: scored.length ? scored.reduce((sum, h) => sum + (h.score ?? 0), 0) : null,
    holes,
    // The newest score time this poll knows, else the round's last save when it has any score at all.
    lastHoleAt: times.length ? times[times.length - 1]! : thru > 0 ? heardAt : null,
    heardAt,
    startedAt: row.created_at,
    endedAt: phase === 'posted' || phase === 'stopped' ? heardAt : null,
    seq: 0,
    source: 'poll',
  };
}
