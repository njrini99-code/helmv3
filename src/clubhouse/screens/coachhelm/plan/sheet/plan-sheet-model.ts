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
  meta: Array<{ label: string; value: string }>;
  groups: Array<{ letter: string; names: string[] }>;
  rows: SheetRow[];
  bring: string[];
  notes: string;
  foot: string;
}

const LETTER = 'ABCDEF';
const clock = (d: Date, zone: string) => formatWith(d, { hour: 'numeric', minute: '2-digit', timeZone: zone });

/** What the sheet draws. A player's model has no `why` key at all, so it can't reach the DOM or the payload (02 §2.3). */
export function toSheetModel(input: { body: PlanBodyV2; why?: Record<string, PlanWhy>; title: string; team: string; start: Date; end: Date | null; zone: string; coaches: string[]; names: ReadonlyMap<string, string>; state: string }, copy: 'coach' | 'player'): PlanSheetModel {
  const { body, zone } = input;
  const letterOf = (groupId: string) => LETTER[body.groups.findIndex((g) => g.id === groupId)] ?? '';
  const parts = partsWith(input.start, { weekday: 'short', day: 'numeric', timeZone: zone });
  let at = input.start.getTime();
  const rows: SheetRow[] = body.variants.main.blocks.map((b) => {
    const start = new Date(at);
    at += b.len * 60_000;
    const why = copy === 'coach' ? input.why?.[b.id] : undefined;
    const base: SheetRow = { id: b.id, start: clock(start, zone), mins: b.len, title: b.title, detail: b.note, who: 'all', rotation: null };
    if (b.kind === 'team' || b.kind === 'break') base.detail = [b.place, b.note].filter(Boolean).join(' · ');
    if (b.kind === 'own') base.detail = [b.place, b.note].filter(Boolean).join(' · ');
    if (b.kind === 'stations') {
      const grid = gridOf(b);
      base.rotation = { turns: grid.map((_, t) => clock(new Date(start.getTime() + t * (b.turnMin + b.moveMin) * 60_000), zone)), rows: b.stations.map((s, i) => ({ place: s.place, note: s.note, cells: grid.map((row) => letterOf(row[i] ?? '')) })) };
    }
    if (b.kind === 'course') {
      base.detail = `Holes ${b.holeFrom} to ${b.holeTo}`;
      if (b.pairings.length) base.who = b.pairings.map((p) => ({ letter: letterOf(body.groups.find((g) => p.players.every((x) => g.players.includes(x)))?.id ?? ''), text: `Tee +${p.teeMin}` }));
    }
    return why && !why.routine && why.because ? { ...base, why: why.because } : base;
  });
  return {
    copy,
    team: input.team,
    mark: input.team.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase(),
    title: input.title,
    focus: body.focus,
    dayWord: (parts.find((p) => p.type === 'weekday')?.value ?? '').toUpperCase(),
    dayNum: parts.find((p) => p.type === 'day')?.value ?? '',
    meta: [
      { label: 'Time', value: `${clock(input.start, zone)}${input.end ? ` to ${clock(input.end, zone)}` : ''}` },
      { label: 'Place', value: body.place || 'Not set' },
      { label: 'Coaches', value: input.coaches.join(', ') || 'Not set' },
    ],
    groups: body.groups.map((g, i) => ({ letter: LETTER[i] ?? '', names: g.players.map((p) => input.names.get(p) ?? 'Player') })),
    rows,
    bring: body.bring.map((b) => (b.qty > 1 ? `${b.item} × ${b.qty}` : b.item)),
    notes: body.notes,
    foot: input.state,
  };
}
