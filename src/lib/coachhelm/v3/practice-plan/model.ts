/** The plan body (N-00 §8.1) and its pure functions. No React and no database, so both the chat tools and the screens import it. */
export type PlanArea = 'putting' | 'short_game' | 'bunker' | 'approach' | 'tee' | 'course' | 'fitness' | 'mental';
export type DrillKind = 'skill' | 'random' | 'pressure';
export type BlockKind = 'team' | 'stations' | 'course' | 'own' | 'break';
export interface DrillRef {
  src: 'team' | 'lib';
  id: string;
}
interface BlockBase {
  id: string;
  title: string;
  len: number;
  coach: string | null;
  note: string;
}
export interface TeamBlock extends BlockBase {
  kind: 'team';
  place: string;
  drill: DrillRef | null;
}
export interface BreakBlock extends BlockBase {
  kind: 'break';
  place: string;
}
export interface PlanStation {
  id: string;
  place: string;
  coach: string | null;
  drill: DrillRef | null;
  note: string;
}
export interface StationsBlock extends BlockBase {
  kind: 'stations';
  stations: PlanStation[];
  groupIds: string[];
  turnMin: number;
  moveMin: number;
  turns: number;
  grid: string[][] | null;
}
export interface CourseBlock extends BlockBase {
  kind: 'course';
  holeFrom: number;
  holeTo: number;
  format: 'stroke' | 'scramble' | 'best_ball' | 'worst_ball' | 'match';
  pairings: Array<{ teeMin: number; players: string[] }>;
  qualifierId: string | null;
}
export interface OwnBlock extends BlockBase {
  kind: 'own';
  place: string;
  lines: Record<string, string>;
}
export type PlanBlock = TeamBlock | BreakBlock | StationsBlock | CourseBlock | OwnBlock;
export interface PlanLayout {
  blocks: PlanBlock[];
}
export interface PlanGroup {
  id: string;
  name: string;
  players: string[];
  savedGroupId: string | null;
}
export interface PlanBodyV2 {
  v: 2;
  focus: string;
  notes: string;
  place: string;
  arrivalBufferMin: 0 | 5 | 10 | 15 | 20 | 25 | 30;
  bring: Array<{ item: string; qty: number }>;
  players: string[];
  groups: PlanGroup[];
  variants: { main: PlanLayout; rain: PlanLayout | null };
}

/** Why lines: beside the body, never in it, so a player copy can't carry them (Wiring gap 4). */
export interface PlanWhy {
  aim: string;
  because: string | null;
  sources: Array<{ ref: string; label: string }>;
  lean: boolean;
  routine: boolean;
}
export interface PlanDraft {
  body: PlanBodyV2;
  why: Record<string, PlanWhy>;
  version: number;
}

export const stationsLen = (b: Pick<StationsBlock, 'turns' | 'turnMin' | 'moveMin'>): number => b.turns * b.turnMin + (b.turns - 1) * b.moveMin;

export function parsePlanBody(json: unknown): PlanBodyV2 | null {
  if (!json || typeof json !== 'object') return null;
  const b = json as Partial<PlanBodyV2>;
  if (b.v !== 2 || !b.variants || !Array.isArray(b.variants.main?.blocks)) return null;
  return { v: 2, focus: b.focus ?? '', notes: b.notes ?? '', place: b.place ?? '', arrivalBufferMin: b.arrivalBufferMin ?? 15, bring: b.bring ?? [], players: b.players ?? [], groups: b.groups ?? [], variants: { main: b.variants.main, rain: b.variants.rain ?? null } };
}

/** The automatic rotation: [turn][station] = group id or ''. Each group moves one station a turn. */
export function autoGrid(b: Pick<StationsBlock, 'stations' | 'groupIds' | 'turns'>): string[][] {
  const n = b.stations.length;
  return Array.from({ length: b.turns }, (_, t) => {
    const row = Array.from({ length: n }, () => '');
    b.groupIds.forEach((g, i) => {
      if (n) row[(i + t) % n] = g;
    });
    return row;
  });
}
export const gridOf = (b: StationsBlock): string[][] => b.grid ?? autoGrid(b);

export interface PathStop {
  blockId: string;
  title: string;
  start: Date;
  end: Date;
  place: string;
  group: string | null;
  note: string;
}

/** A player's stops: the only thing a player's copy is built from. */
export function pathFor(body: PlanBodyV2, playerId: string, eventStart: Date, layout: PlanLayout = body.variants.main): PathStop[] {
  const group = body.groups.find((g) => g.players.includes(playerId)) ?? null;
  const out: PathStop[] = [];
  let at = eventStart.getTime();
  for (const b of layout.blocks) {
    const start = at;
    const end = start + b.len * 60_000;
    at = end;
    const stop = (place: string, s = start, e = end, note = b.note): PathStop => ({ blockId: b.id, title: b.title, start: new Date(s), end: new Date(e), place, group: group?.name ?? null, note });
    if (b.kind === 'team' || b.kind === 'break') out.push(stop(b.place || body.place));
    else if (b.kind === 'own') out.push(stop(b.place || body.place, start, end, b.lines[playerId] ?? ''));
    else if (b.kind === 'course') {
      if (!b.pairings.length || b.pairings.some((p) => p.players.includes(playerId))) out.push(stop(`Holes ${b.holeFrom} to ${b.holeTo}`));
    } else if (group) {
      gridOf(b).forEach((row, t) => {
        const i = row.indexOf(group.id);
        const station = i >= 0 ? b.stations[i] : undefined;
        if (!station) return;
        const s = start + t * (b.turnMin + b.moveMin) * 60_000;
        out.push(stop(station.place, s, s + b.turnMin * 60_000, station.note));
      });
    }
  }
  return out;
}

export function splitEvenly(players: readonly string[], n: number): string[][] {
  const out: string[][] = Array.from({ length: Math.max(1, n) }, () => []);
  players.forEach((p, i) => out[i % out.length]!.push(p));
  return out;
}

export const totalMinutes = (l: PlanLayout): number => l.blocks.reduce((s, b) => s + b.len, 0);

export function bringList(body: PlanBodyV2): Array<{ item: string; qty: number }> {
  return body.bring;
}

/** Minutes per kind, from each block's drills. Routine blocks and blocks with no known kind are left out. */
export function mixMinutes(body: PlanBodyV2, kinds: ReadonlyMap<string, DrillKind>): Record<DrillKind, number> {
  const mix: Record<DrillKind, number> = { skill: 0, random: 0, pressure: 0 };
  const add = (d: DrillRef | null | undefined, min: number) => {
    const k = d ? kinds.get(`${d.src}:${d.id}`) : undefined;
    if (k) mix[k] += min;
  };
  for (const b of body.variants.main.blocks) {
    if (b.kind === 'team') add(b.drill, b.len);
    if (b.kind === 'stations') b.stations.forEach((s) => add(s.drill, b.turnMin * b.turns));
  }
  return mix;
}

export interface PlanProblem {
  code: string;
  message: string;
  blockId?: string;
}

const clock = (d: Date, zone: string): string => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: zone }).format(d);

/** N-00's rules, plus the lane's three (02 §2.2). Errors refuse a publish; warnings pass. */
export function validatePlan(body: PlanBodyV2, ctx: { eventStart?: Date; eventEnd?: Date; zone?: string; drillIds?: ReadonlySet<string>; names?: ReadonlyMap<string, string> } = {}): { errors: PlanProblem[]; warnings: PlanProblem[] } {
  const errors: PlanProblem[] = [];
  const warnings: PlanProblem[] = [];
  const zone = ctx.zone ?? 'UTC';
  const blocks = body.variants.main.blocks;
  if (!blocks.length) errors.push({ code: 'CH-17116', message: 'Add a block to publish.' });
  if (blocks.length > 40) errors.push({ code: 'CH-17109', message: 'A plan can have up to 40 blocks.' });
  if (body.groups.length > 6) errors.push({ code: 'CH-17109', message: 'A plan can have up to 6 groups.' });
  if (totalMinutes(body.variants.main) > 360) errors.push({ code: 'CH-17109', message: 'A plan can be up to 6 hours.' });
  const groupName = (id: string) => body.groups.find((g) => g.id === id)?.name ?? 'A group';
  let at = ctx.eventStart?.getTime() ?? 0;
  const coachAt = new Map<string, Array<[number, number]>>();
  const mark = (coach: string | null, s: number, e: number, blockId: string) => {
    if (!coach) return;
    const spans = coachAt.get(coach) ?? [];
    if (spans.some(([a, b]) => s < b && a < e)) errors.push({ code: 'CH-17102', message: `${ctx.names?.get(coach) ?? 'A coach'} is at two places at ${ctx.eventStart ? clock(new Date(s), zone) : 'that time'}.`, blockId });
    coachAt.set(coach, [...spans, [s, e]]);
  };
  for (const b of blocks) {
    const start = at;
    if (b.kind === 'stations') {
      if (b.stations.length > 8) errors.push({ code: 'CH-17109', message: 'A block can have up to 8 stations.', blockId: b.id });
      if (b.len !== stationsLen(b)) errors.push({ code: 'CH-17109', message: `${b.title}: the length doesn’t match its turns.`, blockId: b.id });
      if (b.groupIds.length > b.stations.length) errors.push({ code: 'CH-17103', message: `${b.groupIds.length} groups but ${b.stations.length} stations. Add a station or take a group out of this block.`, blockId: b.id });
      for (const id of b.groupIds) if (!body.groups.find((g) => g.id === id)?.players.length) errors.push({ code: 'CH-17104', message: `${groupName(id)} has no players.`, blockId: b.id });
      gridOf(b).forEach((row, t) => {
        const seen = new Set<string>();
        const s = start + t * (b.turnMin + b.moveMin) * 60_000;
        row.forEach((g, i) => {
          if (g && seen.has(g)) errors.push({ code: 'CH-17101', message: `${groupName(g)} is at two stations at ${ctx.eventStart ? clock(new Date(s), zone) : `turn ${t + 1}`}.`, blockId: b.id });
          if (g) seen.add(g);
          const coach = b.stations[i]?.coach ?? null;
          mark(coach, s, s + b.turnMin * 60_000, b.id);
        });
      });
    } else {
      if (b.kind === 'course' && (!b.holeFrom || !b.holeTo || b.holeFrom > b.holeTo)) errors.push({ code: 'CH-17114', message: 'Pick the holes for Course.', blockId: b.id });
      mark(b.coach, start, start + b.len * 60_000, b.id);
    }
    at += b.len * 60_000;
    const drills = b.kind === 'team' ? [b.drill] : b.kind === 'stations' ? b.stations.map((s) => s.drill) : [];
    if (ctx.drillIds) for (const d of drills) if (d && !ctx.drillIds.has(`${d.src}:${d.id}`)) errors.push({ code: 'CH-17001', message: `${b.title}: that drill isn’t in the bank.`, blockId: b.id });
  }
  if (body.groups.length) {
    for (const p of body.players) if (!body.groups.some((g) => g.players.includes(p))) warnings.push({ code: 'CH-17105', message: `${ctx.names?.get(p) ?? 'A player'} isn’t in a group.` });
  }
  if (ctx.eventEnd && at > ctx.eventEnd.getTime()) warnings.push({ code: 'CH-17106', message: `${Math.round((at - ctx.eventEnd.getTime()) / 60000)} min past the end of practice (${clock(ctx.eventEnd, zone)}).` });
  return { errors, warnings };
}

export interface PlanDiff {
  wordingOnly: boolean;
  affected: string[];
  changes: Array<{ player: string; line: string }>;
}

/** What changed for each player, between two frozen bodies. A title or note edit alone is wording only: nobody is told. */
export function diffVersions(prev: PlanBodyV2, next: PlanBodyV2, eventStart: Date, zone: string): PlanDiff {
  const players = [...new Set([...prev.players, ...next.players])];
  const changes: PlanDiff['changes'] = [];
  for (const p of players) {
    const a = pathFor(prev, p, eventStart);
    const b = pathFor(next, p, eventStart);
    const before = new Map(a.map((s) => [s.blockId + s.place, s]));
    for (const s of b) {
      const old = before.get(s.blockId + s.place);
      if (!old) changes.push({ player: p, line: `${s.place} is new at ${clock(s.start, zone)}` });
      else if (old.start.getTime() !== s.start.getTime()) changes.push({ player: p, line: `${s.place} moved to ${clock(s.start, zone)}` });
    }
    for (const s of a) if (!b.some((x) => x.blockId === s.blockId && x.place === s.place)) changes.push({ player: p, line: `${s.place} is off the plan` });
  }
  return { wordingOnly: changes.length === 0, affected: [...new Set(changes.map((c) => c.player))], changes };
}

/** A player's copy: no Why, no Aim, and no other group's assignments (02 §2.2). */
export function toPlayerPlan(body: PlanBodyV2, playerId: string, eventStart: Date): { focus: string; group: string | null; stops: PathStop[] } {
  return { focus: body.focus, group: body.groups.find((g) => g.players.includes(playerId))?.name ?? null, stops: pathFor(body, playerId, eventStart) };
}
