/**
 * The lineup builder's rules, pure. A draft is who plays each spot, the one alternate and the individuals; every move
 * keeps the rules the database also enforces (`golf_tournament_set_entries`): one role per player, a spot holds one
 * player, one alternate, no more players than the format allows. The caller sends `entriesOf(draft)` to
 * `setTournamentEntries` and never anything else. No React, no clock.
 */
import type { TourEntriesInput } from '@/app/golf/actions/tournaments';
import type { ChTourAvailability, ChTourCandidate, ChTourEvent, ChTourFormPoint, ChTourLineupData, ChTourPlayer } from './types';

export interface LineupDraft {
  /** Index 0 is spot 1. */
  slots: Array<string | null>;
  alternate: string | null;
  individuals: string[];
}

export type LineupTarget = { kind: 'slot'; slot: number } | { kind: 'alternate' } | { kind: 'individual' } | { kind: 'bench' };

/** The most entries one event takes (the action's own cap). */
export const MAX_ENTRIES = 20;
/** Count chance is shown from this many eligible team rounds (D-93). */
export const CHANCE_GATE = 6;

export function draftOf(data: Pick<ChTourLineupData, 'slots' | 'alternate' | 'individuals'>): LineupDraft {
  const size = data.slots.length;
  const slots: Array<string | null> = Array.from({ length: size }, () => null);
  for (const s of data.slots) if (s.slot >= 1 && s.slot <= size) slots[s.slot - 1] = s.playerId;
  return { slots, alternate: data.alternate, individuals: [...data.individuals] };
}

/** Everyone in the draft, in spot order, then the alternate, then the individuals. */
export function placedIds(d: LineupDraft): string[] {
  return [...d.slots.filter((x): x is string => !!x), ...(d.alternate ? [d.alternate] : []), ...d.individuals];
}

export type LineupWhere = { kind: 'slot'; slot: number } | { kind: 'alternate' } | { kind: 'individual' } | null;

export function whereIs(d: LineupDraft, playerId: string): LineupWhere {
  const i = d.slots.indexOf(playerId);
  if (i >= 0) return { kind: 'slot', slot: i + 1 };
  if (d.alternate === playerId) return { kind: 'alternate' };
  if (d.individuals.includes(playerId)) return { kind: 'individual' };
  return null;
}

/** "Spot 2", "Alternate", "Individual", or "" for the bench. */
export function whereWords(w: LineupWhere): string {
  if (!w) return '';
  return w.kind === 'slot' ? `Spot ${w.slot}` : w.kind === 'alternate' ? 'Alternate' : 'Individual';
}

function without(d: LineupDraft, playerId: string): LineupDraft {
  return {
    slots: d.slots.map((x) => (x === playerId ? null : x)),
    alternate: d.alternate === playerId ? null : d.alternate,
    individuals: d.individuals.filter((x) => x !== playerId),
  };
}

/**
 * Puts a player at a target. They leave wherever they were (one role each). A taken spot or alternate sends its player
 * to the bench, except that a player moving from one spot to another swaps with the one there, so a reorder loses
 * nobody. Returns the same draft when the move is refused (no spot, the entry cap).
 */
export function place(d: LineupDraft, playerId: string, to: LineupTarget): LineupDraft {
  const from = whereIs(d, playerId);
  const base = without(d, playerId);
  if (to.kind === 'bench') return base;
  if (to.kind === 'slot') {
    const i = to.slot - 1;
    if (i < 0 || i >= d.slots.length) return d;
    const occupant = d.slots[i] ?? null;
    if (occupant === playerId) return d;
    const next = { ...base, slots: [...base.slots] };
    next.slots[i] = playerId;
    // A swap: the one who was there takes the spot the mover left.
    if (occupant && from?.kind === 'slot') next.slots[from.slot - 1] = occupant;
    return next;
  }
  if (to.kind === 'alternate') return { ...base, alternate: playerId };
  if (placedIds(base).length >= MAX_ENTRIES) return d;
  return { ...base, individuals: [...base.individuals, playerId] };
}

/** The first open spot, else the alternate when it is free, else null: where "Add" puts a player. */
export function nextOpen(d: LineupDraft): LineupTarget | null {
  const i = d.slots.findIndex((x) => !x);
  if (i >= 0) return { kind: 'slot', slot: i + 1 };
  return d.alternate ? null : { kind: 'alternate' };
}

export function setCount(d: LineupDraft): { set: number; of: number } {
  return { set: d.slots.filter(Boolean).length, of: d.slots.length };
}

/** The `setTournamentEntries` payload: the lineup with its spots, the alternate and the individuals. */
export function entriesOf(d: LineupDraft): TourEntriesInput {
  return [
    ...d.slots.flatMap((p, i) => (p ? [{ playerId: p, role: 'lineup' as const, slot: i + 1 }] : [])),
    ...(d.alternate ? [{ playerId: d.alternate, role: 'alternate' as const, slot: null }] : []),
    ...d.individuals.map((p) => ({ playerId: p, role: 'individual' as const, slot: null })),
  ];
}

export function sameDraft(a: LineupDraft, b: LineupDraft): boolean {
  return a.slots.length === b.slots.length && a.slots.every((x, i) => x === b.slots[i]) && a.alternate === b.alternate && a.individuals.length === b.individuals.length && a.individuals.every((x, i) => x === b.individuals[i]);
}

/** A lineup can be changed until it locks; a locked one changes by substitution only. */
export const isEditable = (status: ChTourEvent['lineup']['status']) => status !== 'locked';

const AVAILABILITY_WORDS: Record<ChTourAvailability, string> = { available: '', injured: 'marked injured', academic: 'out for academics', not_travelling: 'not travelling' };

export interface LineupNote {
  playerId: string;
  /** `block` stops Publish; `warn` is the coach's call. */
  tone: 'warn' | 'block';
  text: string;
}

/** What to say about the draft: players who are unavailable or have left stay allowed (a warning) except alumni (blocked). */
export function notesOf(d: LineupDraft, players: readonly ChTourPlayer[], availability: ReadonlyMap<string, ChTourAvailability>): LineupNote[] {
  const out: LineupNote[] = [];
  for (const id of placedIds(d)) {
    const p = players.find((x) => x.id === id);
    if (!p) continue;
    if (p.alumni) {
      out.push({ playerId: id, tone: 'block', text: `${p.first} has left the team and can’t be in a lineup.` });
      continue;
    }
    const a = availability.get(id) ?? p.availability;
    if (a !== 'available') out.push({ playerId: id, tone: 'warn', text: `${p.first} is ${AVAILABILITY_WORDS[a]}.` });
  }
  return out;
}

/** Why Publish is off, or null when it may go: every spot filled, nobody who has left. */
export function publishBlock(d: LineupDraft, notes: readonly LineupNote[]): string | null {
  const { set, of } = setCount(d);
  if (set < of) return `Fill every spot to publish (${set} of ${of} set).`;
  const blocked = notes.find((n) => n.tone === 'block');
  return blocked ? blocked.text : null;
}

// ── The roster beside the lineup: form and how often a player counts ────────────────────────────────────────────

export type CountChance = NonNullable<ChTourCandidate['chance']>;

/** The word for a count rate (D-93: bands, never a percentage), null below the gate. */
export function chanceOf(rate: number | null, rounds: number): CountChance | null {
  if (rate == null || rounds < CHANCE_GATE) return null;
  return rate >= 0.75 ? 'usually' : rate >= 0.5 ? 'often' : 'sometimes';
}

export const CHANCE_WORDS: Record<CountChance, string> = { usually: 'Usually counts', often: 'Often counts', sometimes: 'Sometimes counts' };

/**
 * One player's record in finished team events other than `exceptEventId`: their last five lineup rounds as form, how
 * often they counted, and how they have played the event's courses. Reads the event shapes the loader already built;
 * nothing is recomputed from scores.
 */
export function candidateStats(
  playerId: string,
  events: readonly ChTourEvent[],
  exceptEventId: string,
  courseIds: readonly string[],
): Pick<ChTourCandidate, 'form' | 'countRate' | 'countRounds' | 'chance' | 'chancePct' | 'eligibleRounds' | 'course'> {
  const rows = events
    .filter((e) => e.id !== exceptEventId && e.status === 'complete')
    .flatMap((e) => e.playerRounds.filter((p) => p.playerId === playerId && p.role === 'lineup' && p.total != null).map((p) => ({ e, p })))
    .sort((a, b) => a.e.startDate.localeCompare(b.e.startDate) || a.p.roundNumber - b.p.roundNumber);
  const judged = rows.filter(({ p }) => p.count === 'counted' || p.count === 'dropped' || p.count === 'tie');
  const counted = judged.filter(({ p }) => p.count === 'counted' || p.count === 'tie').length;
  const rate = judged.length ? counted / judged.length : null;
  const form: ChTourFormPoint[] = rows.slice(-5).map(({ e, p }) => ({ roundId: p.roundEventId, date: e.rounds.find((r) => r.roundEventId === p.roundEventId)?.date ?? e.startDate, toPar: p.toPar, counted: p.count === 'none' ? null : p.count === 'counted' || p.count === 'tie' }));
  const here = rows.filter(({ e, p }) => p.toPar != null && e.courseIds.some((c) => courseIds.includes(c)));
  const avg = here.length ? Math.round((here.reduce((s, { p }) => s + (p.toPar ?? 0), 0) / here.length) * 10) / 10 : null;
  const chance = chanceOf(rate, judged.length);
  return { form, countRate: rate, countRounds: judged.length, chance, chancePct: chance && rate != null ? Math.round(rate * 100) : null, eligibleRounds: rows.length, course: { rounds: here.length, avgToPar: avg } };
}
