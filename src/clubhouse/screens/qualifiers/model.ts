/**
 * Qualifiers, pure logic shared by the loader, the screens, the preview and
 * the tests. Nothing here reads the database or the clock.
 *
 * Ranking (D-33, the live getQualifierLeaderboard rule): players with a
 * completed round first, then total to par, then total strokes, then more
 * rounds played. Two scored players tie only when to par and total strokes
 * both match; ties share a position shown with a T.
 */

export type ChQStatus = 'upcoming' | 'in_progress' | 'completed';
export type ChQSelectionState = 'open' | 'scoring' | 'closed' | 'selected';
export type ChQRowState = 'qualifying' | 'bubble' | 'qualified' | 'selected' | 'pick' | null;

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
}): ChQBoard {
  const byPlayer = new Map<string, ChQRound[]>();
  for (const r of input.rounds) {
    const list = byPlayer.get(r.playerId) ?? [];
    list.push(r);
    byPlayer.set(r.playerId, list);
  }
  const all: ChQRow[] = input.entrants.map((e) => {
    const rounds = (byPlayer.get(e.playerId) ?? []).slice().sort((a, b) => a.number - b.number);
    const withScore = rounds.filter((r) => r.total != null);
    const full = withScore.filter(isFullRound);
    const sum = (k: 'total' | 'toPar') => rounds.reduce((s, r) => s + (r[k] ?? 0), 0);
    return {
      ...e,
      position: null,
      tied: false,
      played: rounds.length,
      toPar: rounds.length ? sum('toPar') : null,
      total: rounds.length ? sum('total') : null,
      avg: full.length ? full.reduce((s, r) => s + (r.total as number), 0) / full.length : null,
      shortRounds: withScore.length - full.length,
      state: null,
      rounds,
    };
  });
  const scored = all.filter((r) => r.played > 0);
  const unscored = all.filter((r) => r.played === 0).sort((a, b) => a.name.localeCompare(b.name));
  scored.sort(
    (a, b) =>
      (a.toPar as number) - (b.toPar as number) || (a.total as number) - (b.total as number) || b.played - a.played || a.name.localeCompare(b.name),
  );
  scored.forEach((row, i) => {
    const prev = scored[i - 1];
    if (prev && prev.toPar === row.toPar && prev.total === row.total) {
      row.position = prev.position;
      row.tied = true;
      prev.tied = true;
    } else {
      row.position = i + 1;
    }
  });

  const squad = Math.max(0, input.squad);
  const topScore = Math.max(0, squad - Math.max(0, input.picks));
  const confirmed = input.selectionState === 'selected' && input.selections ? new Map(input.selections.map((s) => [s.playerId, s.type])) : null;
  scored.forEach((row, i) => {
    if (confirmed) row.state = confirmed.get(row.playerId) === 'coach_pick' ? 'pick' : confirmed.has(row.playerId) ? 'selected' : null;
    else if (input.status === 'completed') row.state = i < topScore ? 'qualified' : null;
    else row.state = i < topScore ? 'qualifying' : i <= squad ? 'bubble' : null;
  });

  return { rows: scored, unscored, topScore, squad, submitted: all.reduce((s, r) => s + r.played, 0) };
}

export const STATE_LABEL: Record<Exclude<ChQRowState, null>, { tone: 'positive' | 'warning' | 'accent'; label: string }> = {
  qualifying: { tone: 'positive', label: 'Qualifying' },
  bubble: { tone: 'warning', label: 'Bubble' },
  qualified: { tone: 'positive', label: 'Qualified' },
  selected: { tone: 'positive', label: 'Selected' },
  pick: { tone: 'accent', label: 'Coach’s pick' },
};

export const STATUS_LABEL: Record<ChQStatus, { tone: 'accent' | 'warning' | 'neutral'; label: string }> = {
  in_progress: { tone: 'accent', label: 'Live' },
  upcoming: { tone: 'warning', label: 'Upcoming' },
  completed: { tone: 'neutral', label: 'Completed' },
};

export function ctaLabel(status: ChQStatus): string {
  return status === 'in_progress' ? 'View leaderboard' : status === 'completed' ? 'View results' : 'View details';
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
