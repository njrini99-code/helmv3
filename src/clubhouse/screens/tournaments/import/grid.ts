/**
 * The whole-round hole grid (launch readiness F-01): every player in one round down the side, the holes across, as a
 * coach types a stack of paper cards in after the round. Pure: the rows, what a cell may hold, and what a save sends
 * (the same `importTournamentResults` input as a file import, so one write path keeps one score store).
 *
 * A submitted round is shown and never changed (D-82). A card still open is corrected hole by hole. A total entered by
 * hand is replaced by the card once holes are typed, so the round's total is the holes' sum. A hole already saved can
 * be changed but not emptied here: the write never deletes a hole.
 */
import type { ChTourCourse, ChTourEvent, ChTourHoleLedger, ChTourPlayer, ScoreStatus } from '../types';
import { playsRound, roundPars, type ChImportCardInput } from './plan';

/** The most strokes a hole may take (the action's limit). */
export const MAX_HOLE_STROKES = 15;

export interface ChGridRow {
  playerId: string;
  name: string;
  /** Holes already saved on the player's card for the round (null where none). */
  saved: Array<number | null>;
  /** Why the row can't be typed in: a submitted round. */
  locked: 'submitted' | null;
  /** A total entered by hand, which the holes replace. */
  entered: number | null;
  /** The card's status (WD, DQ or DQ pending kept): typing a hole corrects strokes, never reinstates a player. */
  status: ScoreStatus;
}

export interface ChGrid {
  roundNumber: number;
  roundEventId: string;
  date: string;
  pars: number[];
  rows: ChGridRow[];
}

/** The grid for one round, or why there is none: the round isn't in the event, its course has no hole pars, or no one plays it. */
export function gridFor(
  event: ChTourEvent,
  players: readonly ChTourPlayer[],
  ledger: ChTourHoleLedger | null,
  courses: Record<string, ChTourCourse>,
  roundNumber: number,
): { ok: true; grid: ChGrid } | { ok: false; why: 'no_round' | 'no_pars' | 'no_players' } {
  const round = event.rounds.find((r) => r.number === roundNumber);
  if (!round) return { ok: false, why: 'no_round' };
  const pars = roundPars(round, courses, event.format.holes);
  if (!pars) return { ok: false, why: 'no_pars' };
  const ids = new Set<string>();
  for (const e of event.entries) if (playsRound(event, e.playerId, roundNumber)) ids.add(e.playerId);
  for (const p of event.playerRounds) if (p.roundNumber === roundNumber && p.role !== 'alternate') ids.add(p.playerId);
  const slotOf = (id: string) => event.entries.find((e) => e.playerId === id);
  const rows = [...ids]
    .map((id): ChGridRow => {
      const pr = event.playerRounds.find((p) => p.playerId === id && p.roundNumber === roundNumber);
      const card = ledger?.cards.find((c) => c.playerId === id && c.roundNumber === roundNumber);
      const saved = Array.from({ length: pars.length }, (_, i) => card?.holes.find((h) => h.n === i + 1)?.strokes ?? null);
      return {
        playerId: id,
        name: players.find((p) => p.id === id)?.name ?? 'Player',
        saved,
        locked: pr?.roundId && pr.cardOpen === false ? 'submitted' : null,
        entered: pr && !pr.roundId && pr.total != null ? pr.total : null,
        status: pr?.status ?? 'ok',
      };
    })
    // Lineup first by slot, then individuals, each by name.
    .sort((a, b) => {
      const ea = slotOf(a.playerId);
      const eb = slotOf(b.playerId);
      const ra = ea?.role === 'individual' ? 1 : 0;
      const rb = eb?.role === 'individual' ? 1 : 0;
      return ra - rb || (ea?.slot ?? 99) - (eb?.slot ?? 99) || a.name.localeCompare(b.name);
    });
  if (!rows.length) return { ok: false, why: 'no_players' };
  return { ok: true, grid: { roundNumber, roundEventId: round.roundEventId, date: round.date, pars, rows } };
}

export type ChCellError = 'not_a_score' | 'too_many' | 'cleared';

/** What a typed cell holds: a hole score, nothing, or why it can't be saved. */
export function readCell(text: string, saved: number | null): { value: number | null } | { error: ChCellError } {
  const t = text.trim();
  if (!t) return saved != null ? { error: 'cleared' } : { value: null };
  if (!/^\d{1,2}$/.test(t)) return { error: 'not_a_score' };
  const n = Number(t);
  if (n < 1) return { error: 'not_a_score' };
  if (n > MAX_HOLE_STROKES) return { error: 'too_many' };
  return { value: n };
}

export const CELL_ERROR_WORDS: Record<ChCellError, string> = {
  not_a_score: 'A hole score is a whole number of strokes, 1 or more.',
  too_many: `A hole score is ${MAX_HOLE_STROKES} strokes at most.`,
  cleared: 'A saved hole can be changed here, not emptied.',
};

/** Typed text by `playerId:hole`. */
export type ChGridEdits = Readonly<Record<string, string>>;

export const cellKey = (playerId: string, hole: number) => `${playerId}:${hole}`;

/** Each row's holes as they would be saved: what was typed over what is saved. Null where a cell can't be read. */
export function rowHoles(row: ChGridRow, edits: ChGridEdits): Array<number | null> | null {
  const out: Array<number | null> = [];
  for (let i = 0; i < row.saved.length; i += 1) {
    const text = edits[cellKey(row.playerId, i + 1)];
    if (text === undefined) {
      out.push(row.saved[i] ?? null);
      continue;
    }
    const c = readCell(text, row.saved[i] ?? null);
    if ('error' in c) return null;
    out.push(c.value);
  }
  return out;
}

/** Each row's holes as the grid shows them while typing: what reads as a score, else what is saved (a bad cell drops out of the sums). */
export function shownHoles(row: ChGridRow, edits: ChGridEdits): Array<number | null> {
  return row.saved.map((saved, i) => {
    const text = edits[cellKey(row.playerId, i + 1)];
    if (text === undefined) return saved ?? null;
    const c = readCell(text, saved ?? null);
    return 'error' in c ? (saved ?? null) : c.value;
  });
}

/** The cells that can't be saved, with why. */
export function gridErrors(grid: ChGrid, edits: ChGridEdits): Array<{ playerId: string; hole: number; error: ChCellError }> {
  const out: Array<{ playerId: string; hole: number; error: ChCellError }> = [];
  for (const row of grid.rows) {
    if (row.locked) continue;
    row.saved.forEach((s, i) => {
      const text = edits[cellKey(row.playerId, i + 1)];
      if (text === undefined) return;
      const c = readCell(text, s);
      if ('error' in c) out.push({ playerId: row.playerId, hole: i + 1, error: c.error });
    });
  }
  return out;
}

/** The rows a save changes, as the import action takes them: only rows with a hole that differs from what is saved. */
export function gridCards(grid: ChGrid, edits: ChGridEdits): ChImportCardInput[] {
  const cards: ChImportCardInput[] = [];
  for (const row of grid.rows) {
    if (row.locked) continue;
    const holes = rowHoles(row, edits);
    if (!holes) continue;
    const changed = holes.some((h, i) => h !== (row.saved[i] ?? null));
    if (!changed || holes.every((h) => h == null)) continue;
    cards.push({ roundEventId: grid.roundEventId, playerId: row.playerId, date: grid.date, holes, pars: grid.pars, total: null, status: row.status, replace: row.entered != null });
  }
  return cards;
}

/** Strokes over the holes there are, and to par over those holes. */
export function rowSum(holes: ReadonlyArray<number | null>, pars: readonly number[]): { strokes: number; toPar: number; played: number } {
  let strokes = 0;
  let par = 0;
  let played = 0;
  holes.forEach((h, i) => {
    if (h == null) return;
    strokes += h;
    par += pars[i] ?? 0;
    played += 1;
  });
  return { strokes, toPar: strokes - par, played };
}

/**
 * Where typing goes next. A digit from 2 to 9 is a whole score, so the cursor moves on; a 1 may be the start of 10 to
 * 15, so it waits for the second digit (or the coach moving on).
 */
export function advancesAfter(text: string): boolean {
  return /^[2-9]$/.test(text) || /^1[0-5]$/.test(text);
}
