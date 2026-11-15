import { formatWith, partsWith } from '../../../../lib/dates';
import { gridOf, type PlanBodyV2, type PlanWhy } from '@/lib/coachhelm/v3/practice-plan/model';

export interface SheetRow {
  id: string;
  start: string;
  mins: number;
  title: string;
  detail: string;
  who: Array<{ letter: string; text: string }> | 'all';
  rotation: { turns: string[]; rows: Array<{ place: string; note: string; cells: string[] }> } | null;
  /** Coach copy only; the key is absent from a player's model. */
  why?: string;
}
export interface PlanSheetModel {
  copy: 'coach' | 'player';
  team: string;
  mark: string;
  title: string;
  focus: string;
  dayWord: string;
  dayNum: string;
  /** "NOV", under the day. */
  monthWord: string;
  meta: Array<{ label: string; value: string }>;
  groups: Array<{ letter: string; names: string[] }>;
  rows: SheetRow[];
  bring: string[];
  /** "9 players", beside Groups. */
  playersLine: string;
  /** "3 h", beside Schedule. */
  totalLine: string;
  notes: string;
  foot: string;
  /** The team's format (S-FMT): its order and names for the sheet's sections, and the foot's line. Absent: the standard sheet. */
  format?: PlanSheetFormat | null;
}
export type PlanSheetSection = 'groups' | 'schedule' | 'bring' | 'notes';
export interface PlanSheetFormat {
  name: string;
  /** Header isn't here: the sheet always opens with it. */
  sections: Array<{ key: PlanSheetSection; name: string }>;
}
/** A saved format's sections, ready for the sheet: anything it left out still prints, after the ones it named. */
export function sheetFormat(input: { name: string; sections: Array<{ key: string; name: string }> } | null | undefined): PlanSheetFormat | null {
  if (!input?.sections?.length) return null;
  const known: PlanSheetSection[] = ['groups', 'schedule', 'bring', 'notes'];
  const named = input.sections.filter((s): s is { key: PlanSheetSection; name: string } => (known as string[]).includes(s.key));
  const rest = known.filter((k) => !named.some((s) => s.key === k)).map((key) => ({ key, name: '' }));
  return { name: input.name, sections: [...named, ...rest] };
}

const LETTER = 'ABCDEF';
/** The printed sheet's empty cell: plain text, because this model is strings for paper. */
const BLANK = '—';
// The one clock Practice prints in a column: no AM or PM. The sheet's Time row says the period once.
const clock = (d: Date | null, zone: string | null) => (d && zone ? formatWith(d, { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: zone }).replace(/\s?[AP]M$/, '') : BLANK);
const clockFull = (d: Date | null, zone: string | null) => (d && zone ? formatWith(d, { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: zone }) : BLANK);

/**
 * What the sheet draws. A player's model has no `why` key at all, and of the groups only the viewer's own: another group's names, letters and
 * rotation cells are not in the model, so they can't reach the DOM or the payload (02 §2.3, owner 4 Nov). A player copy with no viewer, or a viewer in no group, has no group part.
 */
export function toSheetModel(input: { body: PlanBodyV2; why?: Record<string, PlanWhy>; title: string; team: string; start: Date | null; end: Date | null; zone: string | null; coaches: string[]; names: ReadonlyMap<string, string>; state: string; format?: PlanSheetFormat | null }, copy: 'coach' | 'player', viewer?: string): PlanSheetModel {
  const { body, zone } = input;
  const letterOf = (groupId: string) => LETTER[body.groups.findIndex((g) => g.id === groupId)] ?? '';
  const player = copy === 'player';
  const ownGroup = player && viewer ? (body.groups.find((g) => g.players.includes(viewer)) ?? null) : null;
  const ownLetter = ownGroup ? letterOf(ownGroup.id) : '';
  // No practice picked yet: the sheet says it doesn't know the day and the times. It never makes them up from now.
  const parts = input.start && zone ? partsWith(input.start, { weekday: 'short', day: 'numeric', month: 'short', timeZone: zone }) : [];
  const dated = !!input.start && !!zone;
  let at = input.start?.getTime() ?? 0;
  const rows: SheetRow[] = body.variants.main.blocks.flatMap((b): SheetRow[] => {
    const start = dated ? new Date(at) : null;
    at += b.len * 60_000;
    const why = copy === 'coach' ? input.why?.[b.id] : undefined;
    const base: SheetRow = { id: b.id, start: clock(start, zone), mins: b.len, title: b.title, detail: b.note, who: 'all', rotation: null };
    if (b.kind === 'team' || b.kind === 'break') base.detail = [b.place, b.note].filter(Boolean).join(' · ');
    if (b.kind === 'own') base.detail = [b.place, b.note].filter(Boolean).join(' · ');
    if (b.kind === 'stations') {
      const grid = gridOf(b);
      const turnClock = (t: number) => clock(start ? new Date(start.getTime() + t * (b.turnMin + b.moveMin) * 60_000) : null, zone);
      if (player) {
        // Only the turns and stations this player's group is at. No group, or a block their group sits out, is no row at all.
        const turns = ownGroup ? grid.flatMap((row, t) => (row.includes(ownGroup.id) ? [t] : [])) : [];
        if (!turns.length) return [];
        const stationRows = b.stations.flatMap((s, i) => (turns.some((t) => grid[t]?.[i] === ownGroup?.id) ? [{ place: s.place, note: s.note, cells: turns.map((t) => (grid[t]?.[i] === ownGroup?.id ? ownLetter : '')) }] : []));
        base.rotation = { turns: turns.map(turnClock), rows: stationRows };
      } else {
        base.rotation = { turns: grid.map((_, t) => turnClock(t)), rows: b.stations.map((s, i) => ({ place: s.place, note: s.note, cells: grid.map((row) => letterOf(row[i] ?? '')) })) };
      }
    }
    if (b.kind === 'course') {
      base.detail = `Holes ${b.holeFrom} to ${b.holeTo}`;
      const pairings = player ? b.pairings.filter((p) => !!viewer && p.players.includes(viewer)) : b.pairings;
      if (b.pairings.length && !pairings.length) return [];
      if (pairings.length) base.who = pairings.map((p) => ({ letter: letterOf(body.groups.find((g) => p.players.every((x) => g.players.includes(x)))?.id ?? ''), text: `Tee +${p.teeMin}` }));
    }
    if (why && !why.routine && why.because) return [{ ...base, why: why.because }];
    // A routine block makes no claim, and its note is why it's there: the coach's copy draws it as the Why (S-ASK.full-plan).
    if (copy === 'coach' && why?.routine && b.note && b.kind !== 'course' && b.kind !== 'stations') return [{ ...base, detail: 'place' in b ? b.place : '', why: b.note }];
    return [base];
  });
  return {
    copy,
    team: input.team,
    mark: input.team.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase(),
    title: input.title,
    focus: body.focus,
    dayWord: (parts.find((p) => p.type === 'weekday')?.value ?? '').toUpperCase(),
    dayNum: parts.find((p) => p.type === 'day')?.value ?? BLANK,
    monthWord: (parts.find((p) => p.type === 'month')?.value ?? '').toUpperCase(),
    meta: [
      { label: 'Time', value: input.end ? `${clock(input.start, zone)} to ${clockFull(input.end, zone)}` : clockFull(input.start, zone) },
      { label: 'Place', value: body.place || BLANK },
      { label: 'Coaches', value: input.coaches.join(', ') || BLANK },
    ],
    groups: body.groups.flatMap((g, i) => (player && g.id !== ownGroup?.id ? [] : [{ letter: LETTER[i] ?? '', names: g.players.map((p) => input.names.get(p) ?? BLANK) }])),
    rows,
    playersLine: `${new Set(body.groups.flatMap((g) => g.players)).size} players`.replace(/^1 players$/, '1 player'),
    totalLine: (() => {
      const total = body.variants.main.blocks.reduce((sum, b) => sum + b.len, 0);
      return total >= 60 ? `${Math.round((total / 60) * 10) / 10} h` : `${total} min`;
    })(),
    bring: body.bring.map((b) => (b.qty > 1 ? `${b.item} · ${b.qty}` : b.item)),
    notes: body.notes,
    foot: input.state,
    format: input.format ?? null,
  };
}
