/**
 * The player's reveal, pure. `golf_tournament_my_lineup` (held migration 20261024100300) answers the calling player's own
 * role and spot, and the round lineups only when they are in the lineup. This turns that answer into the view's
 * `ChTourReveal`, and works out whether the player's score counted in a round that is final, from the scores the
 * database lets a teammate read once a round is final (D-85), with the scoring engine's rule, never a second one.
 */
import { formatOf, teamRound, type ChTourPlayerScore } from './scoring';
import type { ChTourPlayer, ChTourReveal, ChTourRound, TourFormat } from './types';

/** The function's answer, as PostgREST returns it. */
export interface MyLineupRow {
  published_at: string;
  locked_at: string | null;
  role: 'lineup' | 'alternate' | 'individual' | 'not_travelling';
  slot: number | null;
  rounds: Array<{
    round_event_id: string;
    round_number: number;
    my_role: 'lineup' | 'alternate' | 'individual' | null;
    my_slot: number | null;
    players: Array<{ player_id: string; slot: number | null }>;
  }>;
}

export type CountState = ChTourReveal['counting'][number]['state'];

/** A player's score in a final round: the strokes (null while there is none) and how the round ended. */
export interface FinalScore {
  total: number | null;
  status: ChTourPlayerScore['status'];
}

/**
 * Whether `playerId` counted in a final round. Only a lineup player counts; the engine decides among the round's lineup
 * players by their totals. `pending` while a lineup player's score is not in yet (the round is final but a card is
 * missing), `not_playing` for the alternate, an individual or a player who is not travelling.
 */
export function countingIn(
  playerId: string,
  round: MyLineupRow['rounds'][number],
  scores: ReadonlyMap<string, FinalScore>,
  format: TourFormat,
  par: number,
): CountState {
  if (round.my_role !== 'lineup') return round.my_role === 'individual' ? 'individual' : 'not_playing';
  // Without the lineup list (the function sends it to lineup players only) nothing can be judged.
  if (round.players.length === 0) return 'pending';
  const lineup: ChTourPlayerScore[] = round.players.map((p) => ({ playerId: p.player_id, role: 'lineup', slot: p.slot, total: scores.get(p.player_id)?.total ?? null, status: scores.get(p.player_id)?.status ?? 'ok' }));
  const mine = lineup.find((s) => s.playerId === playerId);
  if (!mine) return 'pending';
  const result = teamRound(lineup, formatOf(format.kind, format.players, format.counting, format.holes), par);
  if (result.kind !== 'complete') return 'pending';
  if (result.tiedAtBoundary.includes(playerId)) return 'tie';
  return result.counting.includes(playerId) ? 'counted' : 'dropped';
}

/**
 * The player's own card for the round in play: only a live round they play (a lineup player or an individual), with the
 * course's holes for the format's length, and no total entered by the coach for it (a total and holes would disagree).
 * `strokes` are what their linked round already has. Null means the page offers no scoring.
 */
export function cardOf(
  round: ChTourRound | undefined,
  mine: MyLineupRow['rounds'][number] | undefined,
  courseHoles: ReadonlyArray<{ n: number; par: number }>,
  holesPerRound: number,
  strokes: ReadonlyMap<number, number | null>,
  enteredTotal: boolean,
): { roundEventId: string; roundNumber: number; date: string; holes: Array<{ n: number; par: number; strokes: number | null }> } | null {
  if (!round || round.status !== 'live' || enteredTotal) return null;
  if (mine?.my_role !== 'lineup' && mine?.my_role !== 'individual') return null;
  const holes = courseHoles.filter((h) => h.n <= holesPerRound);
  if (holes.length !== holesPerRound) return null;
  return { roundEventId: round.roundEventId, roundNumber: round.number, date: round.date, holes: holes.map((h) => ({ n: h.n, par: h.par, strokes: strokes.get(h.n) ?? null })) };
}

/** The reveal for the view, or null when the coach has not published (the function answered nothing). */
export function revealOf(
  row: MyLineupRow | null,
  ctx: { playerId: string; format: TourFormat; rounds: readonly ChTourRound[]; players: readonly ChTourPlayer[]; scoresByRound: ReadonlyMap<string, ReadonlyMap<string, FinalScore>> },
): ChTourReveal | null {
  if (!row) return null;
  const names = (ids: ReadonlyArray<{ player_id: string; slot: number | null }>) =>
    [...ids].sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99)).map((p) => ctx.players.find((x) => x.id === p.player_id)?.name ?? 'A teammate');
  // The top-level role and slot are the published entries and can be stale after a substitution: the per-round my_role and
  // my_slot (the locked snapshot) decide. Best role across the rounds: a lineup spot beats an individual, which beats the
  // alternate. With no per-round answer (nothing locked and no rounds) the published entry stands.
  const rank = { lineup: 3, individual: 2, alternate: 1 } as const;
  const best = [...row.rounds].filter((r) => r.my_role).sort((a, b) => rank[b.my_role!] - rank[a.my_role!])[0];
  const status: ChTourReveal['status'] = best?.my_role ?? row.role;
  const first = row.rounds.find((r) => r.my_role === 'lineup' && r.players.length > 0);
  const counting = row.rounds.map((r) => {
    const round = ctx.rounds.find((x) => x.roundEventId === r.round_event_id);
    const final = round?.status === 'final' || round?.status === 'official';
    const scores = ctx.scoresByRound.get(r.round_event_id);
    return { roundNumber: r.round_number, state: final && scores ? countingIn(ctx.playerId, r, scores, ctx.format, round!.par) : ('pending' as CountState) };
  });
  return {
    status,
    slot: status === 'lineup' ? (best?.my_role === 'lineup' ? best.my_slot : row.slot) : null,
    of: ctx.format.players,
    lineup: status === 'lineup' && first ? names(first.players) : [],
    privateLine: null,
    qualifying: null,
    next: null,
    postseason: false,
    firstView: false,
    changedFrom: null,
    lockedAt: row.locked_at,
    counting,
  };
}
