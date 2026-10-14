/**
 * Qualifiers, pure logic shared by the loader, the screens, the preview and
 * the tests. Nothing here reads the database or the clock.
 *
 * Ranking (D-33): players with a scored round first, then the shared order
 * in src/lib/coachhelm/v3/qualifying/ranking.ts (to par, strokes, more
 * rounds, name), the same order the selection workspace and the squad
 * confirmation use. Two scored players tie only when to par and total
 * strokes both match; ties share a position shown with a T. The legacy
 * getQualifierLeaderboard RPC orders differently and is not this rule.
 */

import { compareStandings, sameStanding } from '@/lib/coachhelm/v3/qualifying/ranking';

export type ChQStatus = 'upcoming' | 'in_progress' | 'completed';
export type ChQSelectionState = 'open' | 'scoring' | 'closed' | 'selected';
export type ChQRowState = 'qualifying' | 'bubble' | 'qualified' | 'selected' | 'pick' | null | 'tie';

export interface ChQRound {
  id: string;
  playerId: string;
  /** qualifier_round_number: the slot this round fills (1..num_rounds). */
  number: number;
  total: number | null;
  toPar: number | null;
  date: string;
  course: string | null;
  holesPlayed: number | null;
}

export interface ChQHole {
  n: number;
  par: number;
  score: number | null;
}

export interface ChQEntrant {
  playerId: string;
  name: string;
  classYear: string | null;
}

export interface ChQRow extends ChQEntrant {
  /** 1-based position, shared by ties; null when no round is in. */
  position: number | null;
  tied: boolean;
  played: number;
  toPar: number | null;
  total: number | null;
  /** Average over full (18-hole) rounds only; null when there are none. */
  avg: number | null;
  /** Rounds left out of the average because they weren't 18 holes. */
  shortRounds: number;
  /** Places gained (positive) or lost (negative) since the previous round; null when there is nothing to compare. */
  move: number | null;
  state: ChQRowState;
  rounds: ChQRound[];
}

export interface ChQSelection {
  playerId: string;
  type: 'top_score' | 'coach_pick';
  /** Coach only (D-33); always null in a player's data. */
  reasoning: string | null;
}

export interface ChQBoard {
  rows: ChQRow[];
  unscored: ChQRow[];
  /** Places decided on score: squad size minus coach's picks. */
  topScore: number;
  squad: number;
  submitted: number;
}

/** "T3", "4", or a dash for someone with no round in. */
export function positionLabel(row: Pick<ChQRow, 'position' | 'tied'>): string {
  if (row.position == null) return '—';
  return (row.tied ? 'T' : '') + row.position;
}

export function isFullRound(r: Pick<ChQRound, 'holesPlayed'>): boolean {
  return r.holesPlayed == null || r.holesPlayed >= 18;
}

export function parseStatus(s: string | null | undefined): ChQStatus {
  return s === 'in_progress' || s === 'completed' ? s : 'upcoming';
}
export function parseSelectionState(s: string | null | undefined): ChQSelectionState {
  return s === 'scoring' || s === 'closed' || s === 'selected' ? s : 'open';
}

/** The scored rows ranked, with positions and ties assigned (states left null), and the unscored rows by name. */
function rankRows(entrants: ChQEntrant[], rounds: ChQRound[]): { scored: ChQRow[]; unscored: ChQRow[]; all: ChQRow[] } {
  const byPlayer = new Map<string, ChQRound[]>();
  for (const r of rounds) {
    const list = byPlayer.get(r.playerId) ?? [];
    list.push(r);
    byPlayer.set(r.playerId, list);
  }
  const all: ChQRow[] = entrants.map((e) => {
    const rounds = (byPlayer.get(e.playerId) ?? []).slice().sort((a, b) => a.number - b.number);
    // A completed round without a total is unknown, not a free zero: it neither counts as played nor adds to the
    // sums, the same rule as the stored entry aggregate (updateQualifierEntryStats).
    // A total without a to-par is unknown too (it would otherwise count as even), and a second round in the same
    // qualifier round counts once: the first listed stands (audit §11.2, §11.3).
    const seen = new Set<number>();
    const withScore = rounds.filter((r) => {
      if (r.total == null || r.toPar == null || seen.has(r.number)) return false;
      seen.add(r.number);
      return true;
    });
    const full = withScore.filter(isFullRound);
    const sum = (k: 'total' | 'toPar') => withScore.reduce((s, r) => s + (r[k] ?? 0), 0);
    return {
      ...e,
      position: null,
      tied: false,
      played: withScore.length,
      toPar: withScore.length ? sum('toPar') : null,
      total: withScore.length ? sum('total') : null,
      avg: full.length ? full.reduce((s, r) => s + (r.total as number), 0) / full.length : null,
      shortRounds: withScore.length - full.length,
      move: null,
      state: null,
      rounds,
    };
  });
  const scored = all.filter((r) => r.played > 0);
  const unscored = all.filter((r) => r.played === 0).sort((a, b) => a.name.localeCompare(b.name));
  scored.sort((a, b) => compareStandings(standingKey(a), standingKey(b)));
  scored.forEach((row, i) => {
    const prev = scored[i - 1];
    if (prev && sameStanding(standingKey(prev), standingKey(row))) {
      row.position = prev.position;
      row.tied = true;
      prev.tied = true;
    } else {
      row.position = i + 1;
    }
  });
  return { scored, unscored, all };
}

const standingKey = (r: ChQRow) => ({ toPar: r.toPar as number, total: r.total as number, played: r.played, name: r.name });

/** A counted round: it has a total and a to-par (the rule `rankRows` applies). */
const counted = (r: ChQRound) => r.total != null && r.toPar != null;

/**
 * The fewest rounds a player needs in before the board frames them as on the Bubble (P009-C2, owner 2026-10-08): at
 * least half the scheduled rounds, rounded up (1 of 1, 1 of 2, 2 of 3, 2 of 4, 3 of 5). One round of three is too thin a
 * sample to call a player contending; the ranking rule itself does not change.
 */
export function bubbleMinRounds(numRounds: number): number {
  return Math.max(1, Math.ceil(Math.max(0, numRounds) / 2));
}

/**
 * Places gained (positive) or lost (negative) since the previous round (P009-A1): each row's position against the
 * board as it stood with every round of the latest round number left out. Null for a player who wasn't ranked then,
 * or when there is no earlier round to compare with. Never a refresh-to-refresh delta.
 */
function movement(entrants: ChQEntrant[], rounds: ChQRound[], scored: ChQRow[]): void {
  const latest = rounds.filter(counted).reduce((m, r) => Math.max(m, r.number), 0);
  if (latest < 2) return;
  const before = rankRows(entrants, rounds.filter((r) => r.number < latest)).scored;
  const was = new Map(before.map((r) => [r.playerId, r.position]));
  for (const row of scored) {
    const p = was.get(row.playerId);
    row.move = p != null && row.position != null ? p - row.position : null;
  }
}

/**
 * The leaderboard: entrants ranked, positions and ties assigned, and each
 * row's state against the cut lines. Rounds from players who aren't entered
 * are ignored.
 */
export function buildBoard(input: {
  entrants: ChQEntrant[];
  rounds: ChQRound[];
  squad: number;
  picks: number;
  status: ChQStatus;
  selectionState: ChQSelectionState;
  selections: ChQSelection[] | null;
  /**
   * The rounds scheduled. With it, a player is on the Bubble only with at least `bubbleMinRounds` rounds in (P009-C2).
   * Every Clubhouse caller passes it; a caller without it (an older test of the shared ranking) gets the ungated state.
   */
  numRounds?: number;
}): ChQBoard {
  const { scored, unscored, all } = rankRows(input.entrants, input.rounds);
  movement(input.entrants, input.rounds, scored);

  const squad = Math.max(0, input.squad);
  const topScore = Math.max(0, squad - Math.max(0, input.picks));
  const minBubble = input.numRounds != null ? bubbleMinRounds(input.numRounds) : 0;
  const confirmed = input.selectionState === 'selected' && input.selections ? new Map(input.selections.map((s) => [s.playerId, s.type])) : null;
  // Q-114 (owner, 2026-10-01): players level with both the last place on score and the next player share a "Tie at
  // cut" until the coach chooses in Manage selections; name order no longer decides it.
  const cutRow = topScore > 0 ? scored[topScore - 1] : undefined;
  const tieAtCut = !!cutRow && !!scored[topScore] && sameStanding(standingKey(cutRow), standingKey(scored[topScore]!));
  const tied = (row: ChQRow) => tieAtCut && sameStanding(standingKey(row), standingKey(cutRow!));
  scored.forEach((row, i) => {
    if (confirmed) row.state = confirmed.get(row.playerId) === 'coach_pick' ? 'pick' : confirmed.has(row.playerId) ? 'selected' : null;
    else if (tied(row)) row.state = 'tie';
    else if (input.status === 'completed') row.state = i < topScore ? 'qualified' : null;
    else row.state = i < topScore ? 'qualifying' : i <= squad && row.played >= minBubble ? 'bubble' : null;
  });

  return { rows: scored, unscored, topScore, squad, submitted: all.reduce((s, r) => s + r.played, 0) };
}

/** P009-C2, the board's caption: why a player below the line isn't on the Bubble yet, when one round isn't enough to say so. */
export function bubbleNote(numRounds: number, status: ChQStatus): string {
  const min = bubbleMinRounds(numRounds);
  return status === 'in_progress' && min > 1 ? ` The bubble needs ${min} of ${plural(numRounds, 'round')} in.` : '';
}

/**
 * The sample-size note (P009-C2): "1 of 3 rounds" on a ranked row with fewer rounds in than the most anyone has, so a
 * total over one round never reads as the same thing as a total over two. Null when the row has kept pace.
 */
export function sampleNote(row: Pick<ChQRow, 'played'>, board: Pick<ChQBoard, 'rows'>, numRounds: number): string | null {
  const most = board.rows.reduce((m, r) => Math.max(m, r.played), 0);
  return row.played > 0 && row.played < most ? `${row.played} of ${plural(numRounds, 'round')}` : null;
}

/**
 * Whether a re-read changed who stands where (P009-B1): the ranked players' order, compared with the order drawn
 * before. A first draw (no previous order) is not a change, and neither is a refresh that only moved scores.
 */
export function rankOrderChanged(prev: readonly string[] | null, next: readonly string[]): boolean {
  if (!prev) return false;
  return prev.length !== next.length || prev.some((id, i) => next[i] !== id);
}

/**
 * The day to hold a qualifier's end date against (P009-D3), for a server-side `now`: the calendar date where the day
 * starts last (UTC−12), so a qualifier reads as ended only once its last day is over everywhere.
 */
export function endDayFor(now: Date): string {
  return new Date(now.getTime() - 12 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * A qualifier still open after its end date (P009-D3): it reads "Ended · n rounds outstanding", never Live. Null while
 * it is not live, has no end date, the day is unknown, or its last day isn't over.
 */
export function endedLive(input: {
  status: ChQStatus;
  endDate: string | null;
  today: string | null | undefined;
  entrants: number;
  numRounds: number;
  submitted: number | null;
}): { outstanding: number | null } | null {
  if (input.status !== 'in_progress' || !input.endDate || !input.today || input.today.slice(0, 10) <= input.endDate.slice(0, 10)) return null;
  return { outstanding: input.submitted == null ? null : Math.max(0, input.entrants * input.numRounds - input.submitted) };
}

/** "Ended · 3 rounds outstanding", or "Ended" when nothing is outstanding or the count didn't load. */
export function endedLabel(e: { outstanding: number | null }): string {
  return e.outstanding ? `Ended · ${plural(e.outstanding, 'round')} outstanding` : 'Ended';
}

export const STATE_LABEL: Record<Exclude<ChQRowState, null>, { tone: 'positive' | 'warning' | 'accent'; label: string }> = {
  qualifying: { tone: 'positive', label: 'Qualifying' },
  bubble: { tone: 'warning', label: 'Bubble' },
  qualified: { tone: 'positive', label: 'Qualified' },
  selected: { tone: 'positive', label: 'Selected' },
  pick: { tone: 'accent', label: 'Coach’s pick' },
  tie: { tone: 'warning', label: 'Tie at cut' },
};

export const STATUS_LABEL: Record<ChQStatus, { tone: 'accent' | 'warning' | 'neutral'; label: string }> = {
  in_progress: { tone: 'accent', label: 'Live' },
  upcoming: { tone: 'warning', label: 'Upcoming' },
  completed: { tone: 'neutral', label: 'Completed' },
};

export function ctaLabel(status: ChQStatus): string {
  return status === 'in_progress' ? 'View leaderboard' : status === 'completed' ? 'View results' : 'View details';
}

/** The list's lede, by who reads it. The list and its skeleton say the same sentence, so the skeleton's lines wrap where the page's do. */
export function listLede(coach: boolean, mode: 'all' | 'mine'): string {
  if (coach) return 'Run head-to-head qualifiers to decide who plays this week.';
  return mode === 'mine' ? 'The qualifiers you’re entered in, and where you stand.' : 'Your team’s qualifiers, and where you stand in the ones you’re entered in.';
}

/**
 * Par for each round: the assigned tee's par, else the par every submitted
 * round in that slot agrees on (total minus to par), else unknown. The
 * qualifier has one par only when every round has the same one (D-33).
 */
export function roundPars(input: {
  numRounds: number;
  teePars: Map<number, number | null>;
  rounds: ChQRound[];
}): { byRound: Array<number | null>; single: number | null } {
  const byRound: Array<number | null> = [];
  for (let n = 1; n <= input.numRounds; n++) {
    const tee = input.teePars.get(n);
    if (tee != null) {
      byRound.push(tee);
      continue;
    }
    const seen = new Set(
      input.rounds
        .filter((r) => r.number === n && r.total != null && r.toPar != null && isFullRound(r))
        .map((r) => (r.total as number) - (r.toPar as number)),
    );
    byRound.push(seen.size === 1 ? [...seen][0]! : null);
  }
  const known = new Set(byRound);
  return { byRound, single: known.size === 1 && !known.has(null) ? byRound[0]! : null };
}

const DAY = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
const DAY_YEAR = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
const asDate = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`);

/** "Sep 22" for a calendar date. */
export function dayLabel(d: string): string {
  return DAY.format(asDate(d));
}
/** "Sep 22, 2026 – Oct 1, 2026", or one date when it starts and ends the same day. */
export function rangeLabel(start: string, end: string | null): string {
  return !end || end === start ? DAY_YEAR.format(asDate(start)) : `${DAY_YEAR.format(asDate(start))} – ${DAY_YEAR.format(asDate(end))}`;
}
/** "Sep 22 – Oct 1" without the year, for the facts strip. */
export function shortRange(start: string, end: string | null): string {
  return !end || end === start ? dayLabel(start) : `${dayLabel(start)} – ${dayLabel(end)}`;
}
export function yearOf(d: string): string {
  return d.slice(0, 4);
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The form's lede, creating or editing. Its skeleton draws the same sentence, so the lines wrap alike. */
export const FORM_LEDE = 'Players enter rounds from their app. The leaderboard builds as they sign.';

/** The help under the form's first fields, shared with its skeleton so each help wraps where the form's does. */
export const FORM_HELP = {
  description: 'What players should expect: format and stakes.',
  endDate: 'For multi-day qualifiers.',
  entryDeadline: 'Shown to players. On or before the start date.',
  rounds: 'How many rounds count. Players can’t enter more than this.',
} as const;

/**
 * What Manage selections is waiting for, by stage (0 standings, 1 picks, 2 confirmed). Its skeleton draws the standings
 * stage's sentence, the commonest way in, so the note's lines wrap where the page's do.
 */
export function stageNoteText(stage: 0 | 1 | 2, o: { topN: number; picks: number; picksReady?: boolean; nobody?: boolean; tie?: number }): string {
  const { topN, picks, picksReady = false, nobody = false, tie = 0 } = o;
  if (stage === 1 && tie > 0) return `Players are level at the last place on score. Give ${plural(tie, 'more place', 'more places')} to confirm the squad.`;
  if (stage === 0) return `Start selecting when the standings are where you want them.${picks ? ` Then choose ${plural(picks, 'coach’s pick', 'coach’s picks')}, each with a reason.` : ''} The top ${topN} on score are set when you confirm.`;
  if (stage === 1) {
    if (nobody) return 'Nobody has a score in and no pick is made yet, so there is no squad to confirm.';
    return picksReady ? 'Every pick is made. Confirm the squad to tell the players.' : `Choose ${plural(picks, 'coach’s pick', 'coach’s picks')}, each with a reason, to confirm the squad.`;
  }
  return 'The squad is confirmed, and every entrant has been told whether they made it.';
}

/** The form's rules, run before anything is sent. Each problem carries its catalog number. */
export interface ChQFormValues {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  entryDeadline: string;
  rounds: string;
  oneRoundAck: boolean;
  course: string;
  rules: string;
  squad: string;
  picks: string;
  playerIds: string[];
}
export type ChQField = 'name' | 'startDate' | 'endDate' | 'entryDeadline' | 'rounds' | 'oneRoundAck' | 'playerIds' | 'squad' | 'picks';
export interface ChQProblem {
  field: ChQField;
  text: string;
  code: string;
}

/** Fields in reading order, so focus lands on the first problem on screen. */
export const FIELD_ORDER: ChQField[] = ['name', 'startDate', 'endDate', 'entryDeadline', 'rounds', 'oneRoundAck', 'playerIds', 'squad', 'picks'];

export const SQUAD_MAX = 12;
export const ROUNDS_MAX = 50;

const wholeIn = (s: string, lo: number, hi: number) => /^\d+$/.test(s.trim()) && Number(s) >= lo && Number(s) <= hi;

export function validateForm(v: ChQFormValues, opts: { minRounds?: number } = {}): ChQProblem[] {
  const out: ChQProblem[] = [];
  if (!v.name.trim()) out.push({ field: 'name', text: 'Give the qualifier a name.', code: 'CH-09101' });
  if (!v.startDate) out.push({ field: 'startDate', text: 'Add a start date.', code: 'CH-09102' });
  if (v.endDate && v.startDate && v.endDate < v.startDate) out.push({ field: 'endDate', text: 'The end date is before the start date.', code: 'CH-09103' });
  if (v.entryDeadline && v.startDate && v.entryDeadline > v.startDate) {
    out.push({ field: 'entryDeadline', text: 'The entry deadline has to be on or before the start date.', code: 'CH-09104' });
  }
  const minRounds = opts.minRounds ?? 1;
  if (!wholeIn(v.rounds, 1, ROUNDS_MAX)) out.push({ field: 'rounds', text: `Rounds must be a whole number from 1 to ${ROUNDS_MAX}.`, code: 'CH-09105' });
  else if (Number(v.rounds) < minRounds) {
    out.push({ field: 'rounds', text: `Round ${minRounds} already has scores, so the qualifier needs at least ${plural(minRounds, 'round')}.`, code: 'CH-09105' });
  } else if (Number(v.rounds) === 1 && !v.oneRoundAck) {
    out.push({ field: 'oneRoundAck', text: 'Confirm that this qualifier is meant to have one round.', code: 'CH-09106' });
  }
  if (!v.playerIds.length) out.push({ field: 'playerIds', text: 'Choose at least one player.', code: 'CH-09107' });
  if (!wholeIn(v.squad, 1, SQUAD_MAX)) out.push({ field: 'squad', text: `Squad size must be a whole number from 1 to ${SQUAD_MAX}.`, code: 'CH-09108' });
  else if (!wholeIn(v.picks, 0, Number(v.squad))) out.push({ field: 'picks', text: 'Coach’s picks must be a whole number no bigger than the squad.', code: 'CH-09109' });
  return out;
}
