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
  /**
   * F-05: the B team, when the event can hold one (held migration 20261116090000). Its spots and alternate are stored
   * as individuals and an alternate of squad B, so no team score ever reads them (D-92). Absent: no B team offered.
   */
  b?: { slots: Array<string | null>; alternate: string | null };
}

export type LineupTarget =
  | { kind: 'slot'; slot: number }
  | { kind: 'alternate' }
  | { kind: 'individual' }
  | { kind: 'bslot'; slot: number }
  | { kind: 'balternate' }
  | { kind: 'bench' };

/** The most entries one event takes (the action's own cap). */
export const MAX_ENTRIES = 20;
/** Count chance is shown from this many eligible team rounds (D-93). */
export const CHANCE_GATE = 6;

export function draftOf(data: Pick<ChTourLineupData, 'slots' | 'alternate' | 'individuals' | 'bTeam'>): LineupDraft {
  const size = data.slots.length;
  const slots: Array<string | null> = Array.from({ length: size }, () => null);
  for (const s of data.slots) if (s.slot >= 1 && s.slot <= size) slots[s.slot - 1] = s.playerId;
  const d: LineupDraft = { slots, alternate: data.alternate, individuals: [...data.individuals] };
  if (data.bTeam) {
    const b: Array<string | null> = Array.from({ length: size }, () => null);
    // A B player with no stored spot (or one past the format) takes the first free spot, so nobody is dropped.
    const loose: string[] = [];
    for (const x of data.bTeam.slots) {
      if (x.slot != null && x.slot >= 1 && x.slot <= size && !b[x.slot - 1]) b[x.slot - 1] = x.playerId;
      else loose.push(x.playerId);
    }
    for (const id of loose) {
      const i = b.indexOf(null);
      if (i >= 0) b[i] = id;
    }
    d.b = { slots: b, alternate: data.bTeam.alternate };
  }
  return d;
}

/** Everyone in the draft, in spot order, then the alternate, then the individuals, then the B team. */
export function placedIds(d: LineupDraft): string[] {
  return [
    ...d.slots.filter((x): x is string => !!x),
    ...(d.alternate ? [d.alternate] : []),
    ...d.individuals,
    ...(d.b ? [...d.b.slots.filter((x): x is string => !!x), ...(d.b.alternate ? [d.b.alternate] : [])] : []),
  ];
}

export type LineupWhere = { kind: 'slot'; slot: number } | { kind: 'alternate' } | { kind: 'individual' } | { kind: 'bslot'; slot: number } | { kind: 'balternate' } | null;

export function whereIs(d: LineupDraft, playerId: string): LineupWhere {
  const i = d.slots.indexOf(playerId);
  if (i >= 0) return { kind: 'slot', slot: i + 1 };
  if (d.alternate === playerId) return { kind: 'alternate' };
  if (d.individuals.includes(playerId)) return { kind: 'individual' };
  if (d.b) {
    const j = d.b.slots.indexOf(playerId);
    if (j >= 0) return { kind: 'bslot', slot: j + 1 };
    if (d.b.alternate === playerId) return { kind: 'balternate' };
  }
  return null;
}

/** "Spot 2", "Alternate", "Individual", "B spot 2", "B alternate", or "" for the bench. */
export function whereWords(w: LineupWhere): string {
  if (!w) return '';
  switch (w.kind) {
    case 'slot':
      return `Spot ${w.slot}`;
    case 'alternate':
      return 'Alternate';
    case 'individual':
      return 'Individual';
    case 'bslot':
      return `B spot ${w.slot}`;
    case 'balternate':
      return 'B alternate';
  }
}

function without(d: LineupDraft, playerId: string): LineupDraft {
  return {
    slots: d.slots.map((x) => (x === playerId ? null : x)),
    alternate: d.alternate === playerId ? null : d.alternate,
    individuals: d.individuals.filter((x) => x !== playerId),
    ...(d.b ? { b: { slots: d.b.slots.map((x) => (x === playerId ? null : x)), alternate: d.b.alternate === playerId ? null : d.b.alternate } } : {}),
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
  if (to.kind === 'bslot' || to.kind === 'balternate') {
    if (!base.b) return d;
    // A player new to the draft adds an entry: the event's cap holds (a move within the draft adds none).
    if (!from && placedIds(base).length >= MAX_ENTRIES) return d;
    if (to.kind === 'balternate') return { ...base, b: { ...base.b, alternate: playerId } };
    const i = to.slot - 1;
    if (i < 0 || i >= base.b.slots.length) return d;
    const occupant = d.b?.slots[i] ?? null;
    if (occupant === playerId) return d;
    const slots = [...base.b.slots];
    slots[i] = playerId;
    if (occupant && from?.kind === 'bslot') slots[from.slot - 1] = occupant;
    return { ...base, b: { ...base.b, slots } };
  }
  if (placedIds(base).length >= MAX_ENTRIES) return d;
  return { ...base, individuals: [...base.individuals, playerId] };
}

/**
 * Where "Add" puts a player: the first open spot, else the alternate when it is free, else null. With `squad` B, the
 * same on the B team (null when the draft holds no B team).
 */
export function nextOpen(d: LineupDraft, squad: 'A' | 'B' = 'A'): LineupTarget | null {
  if (squad === 'B') {
    if (!d.b) return null;
    const j = d.b.slots.findIndex((x) => !x);
    if (j >= 0) return { kind: 'bslot', slot: j + 1 };
    return d.b.alternate ? null : { kind: 'balternate' };
  }
  const i = d.slots.findIndex((x) => !x);
  if (i >= 0) return { kind: 'slot', slot: i + 1 };
  return d.alternate ? null : { kind: 'alternate' };
}

export function setCount(d: LineupDraft): { set: number; of: number } {
  return { set: d.slots.filter(Boolean).length, of: d.slots.length };
}

/**
 * The `setTournamentEntries` payload: the lineup with its spots, the alternate and the individuals, then the B team as
 * individuals of squad B in spot order and its alternate. The A entries carry no squad, so a payload with no B team is
 * exactly what it was before F-05.
 */
export function entriesOf(d: LineupDraft): TourEntriesInput {
  return [
    ...d.slots.flatMap((p, i) => (p ? [{ playerId: p, role: 'lineup' as const, slot: i + 1 }] : [])),
    ...(d.alternate ? [{ playerId: d.alternate, role: 'alternate' as const, slot: null }] : []),
    ...d.individuals.map((p) => ({ playerId: p, role: 'individual' as const, slot: null })),
    ...(d.b ? d.b.slots.flatMap((p, i) => (p ? [{ playerId: p, role: 'individual' as const, slot: i + 1, squad: 'B' as const }] : [])) : []),
    ...(d.b?.alternate ? [{ playerId: d.b.alternate, role: 'alternate' as const, slot: null, squad: 'B' as const }] : []),
  ];
}

const sameList = (a: ReadonlyArray<string | null>, b: ReadonlyArray<string | null>) => a.length === b.length && a.every((x, i) => x === b[i]);

export function sameDraft(a: LineupDraft, b: LineupDraft): boolean {
  const sameB = !a.b || !b.b ? !a.b === !b.b : sameList(a.b.slots, b.b.slots) && a.b.alternate === b.b.alternate;
  return sameList(a.slots, b.slots) && a.alternate === b.alternate && sameList(a.individuals, b.individuals) && sameB;
}

/** How many B spots are set, of how many. */
export function bCount(d: LineupDraft): { set: number; of: number } | null {
  return d.b ? { set: d.b.slots.filter(Boolean).length, of: d.b.slots.length } : null;
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
