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

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// The push path (held migration 20261025050100): the database sends `lane`, `hide` and `gone` on private topics.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** One hole inside a broadcast: `{ n, p, y, s, at }` (number, par, yards, score, time). */
export interface LiveMessageHole {
  n: number;
  p: number | null;
  y: number | null;
  s: number | null;
  at: string | null;
}

/**
 * The payload of version 1 (8.10). `full` says whether `h` is every hole or only the ones that changed; `cur` is the hole
 * NUMBER the player is on. The player's name is never in it: it comes from the roster.
 */
export interface LiveMessageV1 {
  v: 1;
  k: 'lane' | 'hide' | 'gone';
  r: string;
  p?: string;
  seq: number;
  rt?: string;
  q?: string | null;
  qr?: number | null;
  d?: string;
  c?: string | null;
  cn?: string | null;
  hp?: number;
  sp?: number;
  cur?: number | null;
  ph?: string;
  t?: number;
  tp?: number | null;
  st?: number | null;
  la?: string | null;
  hd?: string;
  sh?: string;
  e?: string | null;
  late?: boolean;
  full?: boolean;
  h?: LiveMessageHole[];
}

export interface BroadcastResult {
  lanes: LiveLane[];
  /** The message could not be applied alone (an unknown round with only some holes, or a player with no name yet): read the snapshot. */
  needsSnapshot: boolean;
  /** Whether the lanes differ from the ones given. */
  changed: boolean;
}

/** Narrow an unknown channel payload to a version 1 message, or null. */
export function parseBroadcast(raw: unknown): LiveMessageV1 | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const k = m.k;
  if (m.v !== 1 || (k !== 'lane' && k !== 'hide' && k !== 'gone') || typeof m.r !== 'string' || !m.r) return null;
  const seq = num(m.seq);
  if (seq == null) return null;
  return { ...(m as unknown as LiveMessageV1), seq };
}

const toHole = (h: LiveMessageHole): LiveHole => ({ n: num(h.n) ?? 0, par: num(h.p), yds: num(h.y), score: num(h.s), at: h.at ?? null });

/**
 * Applies one broadcast to the lanes on screen (8.10). A message older than the lane (`seq`) is dropped; `hide` and
 * `gone` remove the lane; a partial `lane` message merges only the holes it names, and when the round is not known it asks
 * for a snapshot instead of guessing. Pure: the hook turns the result into a queued update.
 */
export function applyBroadcast(lanes: readonly LiveLane[], raw: unknown, roster: LiveRoster): BroadcastResult {
  const msg = parseBroadcast(raw);
  const same: BroadcastResult = { lanes: [...lanes], needsSnapshot: false, changed: false };
  if (!msg) return same;
  const at = lanes.findIndex((l) => l.roundId === msg.r);
  const known = at >= 0 ? lanes[at]! : null;

  if (msg.k === 'hide' || msg.k === 'gone') {
    if (!known) return same;
    // A hide older than what is on screen is a stale message; a gone always wins (the round no longer exists).
    if (msg.k === 'hide' && msg.seq <= known.seq) return same;
    return { lanes: lanes.filter((l) => l.roundId !== msg.r), needsSnapshot: false, changed: true };
  }

  if (known && msg.seq <= known.seq) return same;
  const phase = PHASES.find((p) => p === msg.ph) ?? known?.phase;
  const share = SHARES.find((s) => s === msg.sh) ?? known?.share;
  const playerId = msg.p ?? known?.playerId;
  if (!phase || !share || !playerId) return { ...same, needsSnapshot: !known };

  let holes: LiveHole[];
  if (msg.full === true && Array.isArray(msg.h)) {
    holes = msg.h.map(toHole).filter((h) => h.n >= 1 && h.n <= 18);
  } else if (known) {
    const byNumber = new Map(known.holes.map((h) => [h.n, h]));
    for (const h of (Array.isArray(msg.h) ? msg.h : []).map(toHole)) if (h.n >= 1 && h.n <= 18) byNumber.set(h.n, h);
    holes = [...byNumber.values()];
  } else {
    // An unknown round with only the holes that changed: the snapshot has the rest.
    return { ...same, needsSnapshot: true };
  }
  holes.sort((a, b) => a.n - b.n);

  const holesPlanned = msg.hp != null ? planned(msg.hp) : (known?.holesPlanned ?? 18);
  const name = known?.name || roster[playerId] || '';
  const next: LiveLane = {
    roundId: msg.r,
    playerId,
    name,
    initials: initials(name),
    roundType: msg.rt ? normalizeRoundType(msg.rt) : (known?.roundType ?? 'practice'),
    qualifierId: msg.q !== undefined ? msg.q : (known?.qualifierId ?? null),
    qualifierRound: msg.qr !== undefined ? msg.qr : (known?.qualifierRound ?? null),
    courseId: msg.c !== undefined ? msg.c : (known?.courseId ?? null),
    courseName: msg.cn !== undefined ? msg.cn : (known?.courseName ?? null),
    roundDate: msg.d ?? known?.roundDate ?? '',
    holesPlanned,
    startPosition: msg.sp != null ? normalizeStartHole(msg.sp, holesPlanned) : (known?.startPosition ?? 1),
    currentHole: msg.cur !== undefined ? holeNumberOrNull(msg.cur) : (known?.currentHole ?? null),
    share,
    phase,
    thru: num(msg.t) ?? thruOf(holes),
    toPar: msg.tp !== undefined ? num(msg.tp) : (known?.toPar ?? null),
    strokes: msg.st !== undefined ? num(msg.st) : (known?.strokes ?? null),
    holes,
    lastHoleAt: msg.la !== undefined ? msg.la : (known?.lastHoleAt ?? null),
    heardAt: msg.hd ?? known?.heardAt ?? new Date().toISOString(),
    startedAt: known?.startedAt ?? null,
    endedAt: msg.e !== undefined ? msg.e : (known?.endedAt ?? null),
    seq: msg.seq,
    source: 'live',
  };
  const out = [...lanes];
  if (at >= 0) out[at] = next;
  else out.push(next);
  // A player whose name the roster does not have yet is shown only once the snapshot brings it.
  return { lanes: out, needsSnapshot: !name, changed: true };
}
