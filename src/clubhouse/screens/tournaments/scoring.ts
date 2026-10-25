/**
 * Tournaments (P016), the team format engine. Pure: nothing here reads the database, the clock or the DOM, so the
 * loaders, the screens, the preview, the server's re-check before results are marked official and the tests all
 * share one answer. Plan: /mnt/project-files/clubhouse-handoff/tournaments-plan.md, section 2 and step 1.1.
 *
 * College golf counts whole rounds, never best holes: each round the team score is the sum of the lowest `counting`
 * scores among that round's lineup players (5 count 4 by default), and the event total is the sum of the round
 * totals. Individuals and alternates never count. A round with fewer valid scores than the format counts has no
 * team score at all ("incomplete"), never a smaller sum. A withdrawal or disqualification costs that player that
 * round only; the dropped score then counts in their place.
 */

export type ChTourFormatKind = '5c4' | '6c5' | '6c4' | 'custom' | 'match' | 'medal_match' | 'individual';

export interface ChTourFormat {
  kind: ChTourFormatKind;
  /** Lineup players per round. */
  players: number;
  /** Scores that count per round. */
  counting: number;
  /** Holes per round. A nine-hole round is kept as nine, never doubled. */
  holes: 9 | 18;
}

const PRESETS: Record<'5c4' | '6c5' | '6c4', { players: number; counting: number }> = {
  '5c4': { players: 5, counting: 4 },
  '6c5': { players: 6, counting: 5 },
  '6c4': { players: 6, counting: 4 },
};

/** A format from the stored row; the three NCAA stroke formats ignore the players and counting columns. */
export function formatOf(kind: ChTourFormatKind, players = 5, counting = 4, holes: 9 | 18 = 18): ChTourFormat {
  if (kind === '5c4' || kind === '6c5' || kind === '6c4') return { kind, ...PRESETS[kind], holes };
  return { kind, players, counting: Math.min(counting, players), holes };
}

/** Whether the format produces a stroke-play team score at all. */
export function hasTeamScore(format: ChTourFormat): boolean {
  return format.kind === '5c4' || format.kind === '6c5' || format.kind === '6c4' || format.kind === 'custom';
}

export type ChTourRole = 'lineup' | 'alternate' | 'individual';
/** `dq_pending`: a disqualification being looked at; the score still counts until it is confirmed. */
export type ChTourScoreStatus = 'ok' | 'wd' | 'dq' | 'dq_pending';

export interface ChTourPlayerScore {
  playerId: string;
  /** The player's role in this round (after any substitution). */
  role: ChTourRole;
  /** Lineup position 1..n, or null for alternates and individuals. */
  slot: number | null;
  /** The finished round's strokes; null while the round is being played or when there is no score. */
  total: number | null;
  status: ChTourScoreStatus;
  /** Set while the round is being played: holes finished and to par so far. */
  live?: { thru: number; toPar: number } | null;
}

export type ChTourRoundKind = 'complete' | 'incomplete' | 'live' | 'none';

export interface ChTourTeamRound {
  kind: ChTourRoundKind;
  /** Team strokes: the counting scores' sum. Null unless the round is complete. */
  total: number | null;
  /** Team to par. Complete: total minus par for each counting score. Live: the best scores so far. */
  toPar: number | null;
  /** Lineup players whose score counts, best first. */
  counting: string[];
  /** Lineup players whose score does not count (including WD and DQ), best first. */
  dropped: string[];
  /** Both sides of a tie at the counting boundary: either score could count and the total is the same. */
  tiedAtBoundary: string[];
  /** Lineup players without a valid score, when that is why the round is incomplete. */
  missing: string[];
  reason: 'too_few_scores' | null;
  /** The sum of the dropped valid scores (WD and DQ have none): the NCAA's first team tiebreaker. */
  droppedTotal: number | null;
  /** The first counting score under review, and what the round would be if it were a DQ. */
  dqSwapPreview: ChTourDqPreview | null;
}

export interface ChTourDqPreview {
  ifDq: string;
  /** The player whose score would count instead; null when the round would be left without a team score. */
  nowCounts: string | null;
  total: number | null;
  toPar: number | null;
}

const NONE: ChTourTeamRound = {
  kind: 'none',
  total: null,
  toPar: null,
  counting: [],
  dropped: [],
  tiedAtBoundary: [],
  missing: [],
  reason: null,
  droppedTotal: null,
  dqSwapPreview: null,
};

const hasScore = (s: ChTourPlayerScore): boolean => (s.status === 'ok' || s.status === 'dq_pending') && s.total != null;
const isPlaying = (s: ChTourPlayerScore): boolean => (s.status === 'ok' || s.status === 'dq_pending') && s.live != null;
const slotOrder = (s: ChTourPlayerScore): number => s.slot ?? Number.MAX_SAFE_INTEGER;

/**
 * One round's team result.
 *
 * @param scores every player with a role in the round; only `lineup` players are considered
 * @param par the course par for one player's round (72 for 18 holes, 36 for nine)
 */
export function teamRound(scores: readonly ChTourPlayerScore[], format: ChTourFormat, par: number): ChTourTeamRound {
  if (!hasTeamScore(format)) return NONE;
  const lineup = scores.filter((s) => s.role === 'lineup');
  if (lineup.some(isPlaying)) return liveRound(lineup, format, par);
  return finalRound(lineup, format, par, true);
}

function finalRound(
  lineup: readonly ChTourPlayerScore[],
  format: ChTourFormat,
  par: number,
  withPreview: boolean,
): ChTourTeamRound {
  // Lowest strokes first; on equal strokes the lower slot number counts, so the answer never depends on input order.
  const valid = lineup.filter(hasScore).sort((a, b) => a.total! - b.total! || slotOrder(a) - slotOrder(b));
  const invalid = lineup.filter((s) => !hasScore(s)).sort((a, b) => slotOrder(a) - slotOrder(b));
  if (valid.length < format.counting) {
    return {
      ...NONE,
      kind: 'incomplete',
      dropped: [...valid, ...invalid].map((s) => s.playerId),
      missing: invalid.map((s) => s.playerId),
      reason: 'too_few_scores',
    };
  }
  const counted = valid.slice(0, format.counting);
  const extra = valid.slice(format.counting);
  const total = counted.reduce((sum, s) => sum + s.total!, 0);
  const edge = counted[counted.length - 1]?.total;
  const tiedAtBoundary = extra.length > 0 && extra[0]?.total === edge ? valid.filter((s) => s.total === edge).map((s) => s.playerId) : [];
  const round: ChTourTeamRound = {
    kind: 'complete',
    total,
    toPar: total - par * format.counting,
    counting: counted.map((s) => s.playerId),
    dropped: [...extra, ...invalid].map((s) => s.playerId),
    tiedAtBoundary,
    missing: [],
    reason: null,
    droppedTotal: extra.length > 0 ? extra.reduce((sum, s) => sum + s.total!, 0) : null,
    dqSwapPreview: null,
  };
  if (!withPreview) return round;
  const pending = counted.find((s) => s.status === 'dq_pending');
  if (!pending) return round;
  const ifDq = finalRound(
    lineup.map((s) => (s.playerId === pending.playerId ? { ...s, status: 'dq' as const } : s)),
    format,
    par,
    false,
  );
  const nowCounts = ifDq.counting.find((id) => !round.counting.includes(id)) ?? null;
  return { ...round, dqSwapPreview: { ifDq: pending.playerId, nowCounts, total: ifDq.total, toPar: ifDq.toPar } };
}

/** While the round is being played: count the best to-par scores so far among players who have started or finished. */
function liveRound(lineup: readonly ChTourPlayerScore[], format: ChTourFormat, par: number): ChTourTeamRound {
  const toParOf = (s: ChTourPlayerScore): number | null => (s.live != null ? s.live.toPar : s.total != null ? s.total - par : null);
  const going = lineup
    .filter((s) => (s.status === 'ok' || s.status === 'dq_pending') && toParOf(s) != null)
    .sort((a, b) => toParOf(a)! - toParOf(b)! || slotOrder(a) - slotOrder(b));
  const counted = going.slice(0, format.counting);
  const counting = counted.map((s) => s.playerId);
  return {
    ...NONE,
    kind: 'live',
    toPar: counted.length > 0 ? counted.reduce((sum, s) => sum + toParOf(s)!, 0) : null,
    counting,
    dropped: lineup.filter((s) => !counting.includes(s.playerId)).map((s) => s.playerId),
    missing: lineup.filter((s) => toParOf(s) == null).map((s) => s.playerId),
  };
}

export interface ChTourTeamEvent {
  kind: 'complete' | 'incomplete' | 'live' | 'none';
  /** Sum of the round totals; null unless every round is complete. */
  total: number | null;
  /** Sum of the rounds' to par, live rounds included; null when a round has no team score. */
  toPar: number | null;
  rounds: ChTourTeamRound[];
  /** Sum of every round's dropped scores: the NCAA's first team tiebreaker. */
  droppedTotal: number | null;
}

/** The event from its rounds in order. Rounds not yet started are left out by the caller. */
export function teamEvent(rounds: readonly ChTourTeamRound[]): ChTourTeamEvent {
  if (rounds.length === 0 || rounds.every((r) => r.kind === 'none')) {
    return { kind: 'none', total: null, toPar: null, rounds: [...rounds], droppedTotal: null };
  }
  const incomplete = rounds.some((r) => r.kind === 'incomplete' || r.kind === 'none');
  const live = rounds.some((r) => r.kind === 'live');
  const kind = incomplete ? 'incomplete' : live ? 'live' : 'complete';
  const sum = (pick: (r: ChTourTeamRound) => number | null): number | null =>
    rounds.reduce<number | null>((acc, r) => (acc == null || pick(r) == null ? null : acc + pick(r)!), 0);
  return {
    kind,
    total: kind === 'complete' ? sum((r) => r.total) : null,
    toPar: incomplete ? null : sum((r) => r.toPar),
    rounds: [...rounds],
    droppedTotal: kind === 'complete' ? rounds.reduce((acc, r) => acc + (r.droppedTotal ?? 0), 0) : null,
  };
}

export interface ChTourScoredRound {
  scores: readonly ChTourPlayerScore[];
  result: ChTourTeamRound;
}

/**
 * How often a player's score counted: rounds counted over rounds played as a lineup player, in complete rounds only.
 * Individuals and alternates are never lineup players, so they never have a rate.
 */
export function countingRate(playerId: string, rounds: readonly ChTourScoredRound[]): { counted: number; played: number; rate: number | null } {
  let counted = 0;
  let played = 0;
  for (const { scores, result } of rounds) {
    if (result.kind !== 'complete') continue;
    if (!scores.some((s) => s.playerId === playerId && s.role === 'lineup')) continue;
    played += 1;
    if (result.counting.includes(playerId)) counted += 1;
  }
  return { counted, played, rate: played > 0 ? counted / played : null };
}

/**
 * Strokes better than the round's worst dropped score, averaged over the player's counting rounds. When the player
 * was the drop, the round adds their gap to the worst counting score instead (zero or less). Rounds with no dropped
 * valid score (exactly enough scores) say nothing about the gap and are skipped.
 */
export function gapToDrop(playerId: string, rounds: readonly ChTourScoredRound[]): { value: number | null; n: number } {
  let sum = 0;
  let n = 0;
  for (const { scores, result } of rounds) {
    if (result.kind !== 'complete') continue;
    const mine = scores.find((s) => s.playerId === playerId && s.role === 'lineup');
    if (!mine || !hasScore(mine)) continue;
    const totals = (ids: readonly string[]): number[] =>
      ids.flatMap((id) => {
        const s = scores.find((x) => x.playerId === id);
        return s && hasScore(s) ? [s.total!] : [];
      });
    const droppedTotals = totals(result.dropped);
    if (droppedTotals.length === 0) continue;
    if (result.counting.includes(playerId)) sum += Math.max(...droppedTotals) - mine.total!;
    else sum += Math.max(...totals(result.counting)) - mine.total!;
    n += 1;
  }
  return { value: n > 0 ? sum / n : null, n };
}
