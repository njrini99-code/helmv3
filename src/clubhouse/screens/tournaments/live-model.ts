/**
 * The live round's math, pure. A round's lanes (one per player who plays it) and its team result are built from what
 * the event already holds (entered and linked totals, `ChTourPlayerRound`) plus the holes a linked GolfHelm round has
 * scored so far (`golf_holes`, the rows Fairway's round tracker writes). The team result is the scoring engine's
 * (`scoring.ts`), live while anyone is on the course: the best to-par scores so far among the players who have started or
 * finished. Nothing here is recomputed by a view. No React, no clock.
 */
import { formatOf, teamRound, type ChTourPlayerScore, type ChTourTeamRound } from './scoring';
import type { ChTourCount, ChTourEvent, ChTourHoleScore, ChTourLivePlayer, ChTourRound, TeamRoundResult } from './types';

/** A scored hole of a linked GolfHelm round still being played: the columns the loader reads from `golf_holes`. */
export interface LiveHoleRow {
  roundId: string;
  hole: number;
  par: number | null;
  score: number | null;
}

export interface LiveBuild {
  lanes: ChTourLivePlayer[];
  team: TeamRoundResult;
}

const NONE: TeamRoundResult = { kind: 'none', total: null, toPar: null, counting: [], dropped: [], tiedAtBoundary: [] };

/** Holes scored so far, in hole order, and the to-par of those with a known par. */
export function progressOf(rows: readonly LiveHoleRow[]): { holes: Array<ChTourHoleScore & { pending: boolean }>; thru: number; toPar: number | null } {
  const scored = rows.filter((r) => r.score != null).sort((a, b) => a.hole - b.hole);
  const known = scored.filter((r) => r.par != null);
  return {
    holes: scored.map((r) => ({ n: r.hole, par: r.par ?? 0, strokes: r.score, source: 'card' as const, disputed: false, pending: false })),
    thru: scored.length,
    toPar: known.length === scored.length && scored.length > 0 ? known.reduce((s, r) => s + (r.score! - r.par!), 0) : null,
  };
}

/** Maps the engine's round onto the snapshot's team shape, with how many counting scores are still to come while live. */
function teamOf(r: ChTourTeamRound, counting: number): TeamRoundResult {
  return {
    kind: r.kind,
    total: r.total,
    toPar: r.toPar,
    counting: r.counting,
    dropped: r.dropped,
    tiedAtBoundary: r.tiedAtBoundary,
    ...(r.reason ? { reason: r.reason } : {}),
    ...(r.missing.length ? { missing: r.missing } : {}),
    short: r.kind === 'live' ? Math.max(0, counting - r.counting.length) : 0,
  };
}

function countOf(role: ChTourLivePlayer['role'], playerId: string, team: ChTourTeamRound | null): ChTourCount {
  if (role === 'individual') return 'individual';
  if (!team || team.kind === 'none') return 'none';
  if (team.tiedAtBoundary.includes(playerId)) return 'tie';
  if (team.counting.includes(playerId)) return 'counted';
  return team.dropped.includes(playerId) ? 'dropped' : 'none';
}

/**
 * The lanes and the team result of one round. `holes` are the scored holes of any linked round not finished, keyed by
 * round id. A player with no score yet still has a lane (they are in the lineup): "not started".
 */
export function buildLive(event: ChTourEvent, round: ChTourRound, holes: ReadonlyMap<string, readonly LiveHoleRow[]> = new Map()): LiveBuild {
  const format = formatOf(event.format.kind, event.format.players, event.format.counting, event.format.holes);
  const rows = event.playerRounds.filter((p) => p.roundNumber === round.number && p.role !== 'alternate');
  const field = rows.length
    ? rows.map((p) => ({ playerId: p.playerId, role: p.role as 'lineup' | 'individual', slot: p.slot, row: p }))
    : event.entries.filter((e) => e.role !== 'alternate').map((e) => ({ playerId: e.playerId, role: e.role as 'lineup' | 'individual', slot: e.slot, row: null }));

  const progress = field.map((f) => {
    const p = f.row;
    const prog = p?.roundId && p.total == null ? progressOf(holes.get(p.roundId) ?? []) : null;
    const live = prog && prog.thru > 0 && prog.toPar != null ? { thru: prog.thru, toPar: prog.toPar } : null;
    return { f, prog, live };
  });

  const scores: ChTourPlayerScore[] = progress.map(({ f, live }) => ({ playerId: f.playerId, role: f.role, slot: f.slot, total: f.row?.total ?? null, status: f.row?.status ?? 'ok', live }));
  const result = scores.some((s) => s.total != null || s.live) ? teamRound(scores, format, round.par) : null;

  const lanes: ChTourLivePlayer[] = progress.map(({ f, prog, live }) => {
    const p = f.row;
    const finished = p?.total != null;
    return {
      playerId: f.playerId,
      slot: f.slot,
      role: f.role,
      teeAt: round.firstTeeAt,
      startHole: 1,
      holes: prog?.holes ?? [],
      thru: finished ? format.holes : (live?.thru ?? null),
      toPar: finished ? (p?.toPar ?? null) : (live?.toPar ?? null),
      status: p?.status ?? 'ok',
      card: 'none',
      count: countOf(f.role, f.playerId, result),
      lastPostAt: null,
      projection: null,
    };
  });
  // The lineup in spot order, then individuals by name order of arrival.
  lanes.sort((a, b) => (a.role === b.role ? (a.slot ?? 99) - (b.slot ?? 99) : a.role === 'lineup' ? -1 : 1));
  return { lanes, team: result ? teamOf(result, format.counting) : NONE };
}
