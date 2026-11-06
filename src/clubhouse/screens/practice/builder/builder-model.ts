import { autoGrid, stationsLen, splitEvenly, type CourseBlock, type DrillRef, type PlanBlock, type PlanBodyV2, type PlanDraft, type PlanGroup, type StationsBlock, type PlanWhy } from '@/lib/coachhelm/v3/practice-plan/model';

/** The builder's edits as pure functions over the plan body: no React and no server, so they are tested on their own. Every result stays inside what the save checks. */
export type BuilderStep = 'blocks' | 'groups' | 'drills' | 'review';
export const STEPS: ReadonlyArray<{ value: BuilderStep; label: string }> = [
  { value: 'blocks', label: 'Blocks' },
  { value: 'groups', label: 'Groups' },
  { value: 'drills', label: 'Drills' },
  { value: 'review', label: 'Review' },
];

export const BLOCK_KINDS: ReadonlyArray<{ kind: PlanBlock['kind']; label: string; line: string }> = [
  { kind: 'team', label: 'Team', line: 'Everyone together: warm-up, talk, lift, film.' },
  { kind: 'stations', label: 'Stations', line: 'Groups rotate between stations.' },
  { kind: 'course', label: 'Course', line: 'Holes on the course.' },
  { kind: 'own', label: 'Own work', line: 'Each player works on their own list.' },
  { kind: 'break', label: 'Break', line: 'Travel, water, moving between places.' },
];
export const PLACES = ['Putting green', 'Short game area', 'Range', 'Bunker', 'Course', 'Indoor bay', 'Gym', 'Film room'];
const LETTERS = 'ABCDEF';

export const MAX_MIN = 360;

let seq = 0;
/** A block or station id, unique within a plan: the save refuses a repeat. */
export function newId(prefix = 'b'): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

export const blocksOf = (body: PlanBodyV2): PlanBlock[] => body.variants.main.blocks;
const withBlocks = (body: PlanBodyV2, blocks: PlanBlock[]): PlanBodyV2 => ({ ...body, variants: { ...body.variants, main: { blocks } } });
export const totalOf = (body: PlanBodyV2): number => blocksOf(body).reduce((s, b) => s + b.len, 0);

export function makeBlock(kind: PlanBlock['kind'], body: PlanBodyV2, id: string = newId()): PlanBlock {
  const base = { id, len: 30, coach: null, note: '' };
  if (kind === 'team') return { ...base, kind, title: 'Team block', place: body.place.slice(0, 40), drill: null };
  if (kind === 'break') return { ...base, kind, len: 10, title: 'Break', place: '' };
  if (kind === 'own') return { ...base, kind, title: 'Own work', place: '', lines: {} };
  if (kind === 'course') return { ...base, kind, len: 60, title: 'On the course', holeFrom: 1, holeTo: 9, format: 'stroke', pairings: [], qualifierId: null };
  const stations = ['Putting green', 'Short game area', 'Range'].map((place) => ({ id: newId('s'), place, coach: null, drill: null, note: '' }));
  const block: StationsBlock = { ...base, kind, title: 'Rotation', stations, groupIds: body.groups.map((g) => g.id).slice(0, stations.length), turnMin: 20, moveMin: 0, turns: stations.length, grid: null };
  return { ...block, len: stationsLen(block) };
}

/** A plan with nothing in it yet, or N-00's Blank when there's no helper to fill it: one Warm-up at the practice's place. */
export function emptyBody(place: string, roster: readonly string[], withWarmup: boolean): PlanBodyV2 {
  const body: PlanBodyV2 = { v: 2, focus: '', notes: '', place: place.slice(0, 80), arrivalBufferMin: 15, bring: [], players: roster.slice(0, 60), groups: [], variants: { main: { blocks: [] }, rain: null } };
  if (!withWarmup) return body;
  return withBlocks(body, [{ id: newId(), kind: 'team', title: 'Warm-up', len: 15, coach: null, note: '', place: place.slice(0, 40), drill: null }]);
}

/** Copying a past practice (N-00 4.3) keeps blocks, stations, drills and groups, and leaves own-work lines and pairings behind. Members stay only if still active. */
export function copyBody(source: PlanBodyV2, roster: readonly string[]): PlanBodyV2 {
  const active = new Set(roster);
  const groups = source.groups.map((g) => ({ ...g, players: g.players.filter((p) => active.has(p)) }));
  const blocks = blocksOf(source).map((b): PlanBlock => {
    if (b.kind === 'own') return { ...b, lines: {} };
    if (b.kind === 'course') return { ...b, pairings: [] };
    return b;
  });
  return { ...source, players: roster.slice(0, 60), groups, variants: { main: { blocks }, rain: null } };
}

export const addBlock = (body: PlanBodyV2, block: PlanBlock, at?: number): PlanBodyV2 => {
  const blocks = [...blocksOf(body)];
  blocks.splice(at ?? blocks.length, 0, block);
  return withBlocks(body, blocks);
};
export const removeBlock = (body: PlanBodyV2, id: string): PlanBodyV2 => withBlocks(body, blocksOf(body).filter((b) => b.id !== id));
export const patchBlock = (body: PlanBodyV2, id: string, next: (b: PlanBlock) => PlanBlock): PlanBodyV2 => withBlocks(body, blocksOf(body).map((b) => (b.id === id ? next(b) : b)));

export function moveBlock(body: PlanBodyV2, id: string, by: -1 | 1): PlanBodyV2 {
  const blocks = [...blocksOf(body)];
  const at = blocks.findIndex((b) => b.id === id);
  const to = at + by;
  if (at < 0 || to < 0 || to >= blocks.length) return body;
  const [b] = blocks.splice(at, 1);
  blocks.splice(to, 0, b!);
  return withBlocks(body, blocks);
}

/** Length in 5s, 5 to 360. A Stations block's length is its turns, so the step changes its turn minutes instead (N-00 4.5). */
export function stepLength(b: PlanBlock, by: -5 | 5): PlanBlock {
  if (b.kind === 'stations') {
    const turnMin = Math.min(60, Math.max(5, b.turnMin + by));
    const next = { ...b, turnMin };
    return { ...next, len: stationsLen(next) };
  }
  return { ...b, len: Math.min(MAX_MIN, Math.max(5, b.len + by)) };
}

export function setStationCount(b: StationsBlock, n: number, body: PlanBodyV2): StationsBlock {
  const count = Math.min(8, Math.max(1, n));
  const stations = [...b.stations];
  while (stations.length < count) stations.push({ id: newId('s'), place: PLACES[stations.length % PLACES.length] ?? 'Range', coach: null, drill: null, note: '' });
  stations.length = count;
  const next: StationsBlock = { ...b, stations, turns: count, groupIds: body.groups.map((g) => g.id).slice(0, count), grid: null };
  return { ...next, len: stationsLen(next) };
}

export function setHoles(b: CourseBlock, from: number, to: number): CourseBlock {
  return { ...b, holeFrom: Math.min(18, Math.max(1, from)), holeTo: Math.min(18, Math.max(1, to)) };
}

/** Which stations rotate who follows the plan's groups, and a coach's grid gives way to the automatic one when they change. */
function syncStations(body: PlanBodyV2): PlanBodyV2 {
  const ids = body.groups.map((g) => g.id);
  return withBlocks(body, blocksOf(body).map((b) => (b.kind === 'stations' ? { ...b, groupIds: ids.slice(0, b.stations.length), grid: null } : b)));
}

const letterOf = (i: number) => LETTERS[i] ?? String(i + 1);
const nextGroupId = (body: PlanBodyV2) => {
  let n = body.groups.length + 1;
  while (body.groups.some((g) => g.id === `g${n}`)) n += 1;
  return `g${n}`;
};

/** Deal the plan's players into `n` groups, A onward. */
export function splitGroups(body: PlanBodyV2, n: number): PlanBodyV2 {
  const count = Math.min(6, Math.max(2, n));
  const dealt = splitEvenly(body.players, count);
  const groups: PlanGroup[] = dealt.map((players, i) => ({ id: `g${i + 1}`, name: letterOf(i), players, savedGroupId: null }));
  return syncStations({ ...body, groups });
}
export function addGroup(body: PlanBodyV2): PlanBodyV2 {
  if (body.groups.length >= 6) return body;
  return syncStations({ ...body, groups: [...body.groups, { id: nextGroupId(body), name: letterOf(body.groups.length), players: [], savedGroupId: null }] });
}
export function removeGroup(body: PlanBodyV2, id: string): PlanBodyV2 {
  const groups = body.groups.filter((g) => g.id !== id).map((g, i) => ({ ...g, name: letterOf(i) }));
  return syncStations({ ...body, groups });
}
/** One player, to one group or to none. `out` also takes them out of this practice. */
export function movePlayer(body: PlanBodyV2, player: string, to: string | null, out = false): PlanBodyV2 {
  const groups = body.groups.map((g) => ({ ...g, players: g.id === to ? [...g.players.filter((p) => p !== player), player] : g.players.filter((p) => p !== player) }));
  const players = out ? body.players.filter((p) => p !== player) : body.players.includes(player) ? body.players : [...body.players, player];
  return { ...body, players, groups };
}

export interface DrillSlot {
  id: string;
  blockId: string;
  head: string;
  sub: string;
  drill: DrillRef | null;
  /** The minutes this slot has, for "Drill runs 25 min; turn is 20" (CH-13180). */
  minutes: number;
}
export function drillSlots(body: PlanBodyV2): DrillSlot[] {
  return blocksOf(body).flatMap((b): DrillSlot[] => {
    if (b.kind === 'team') return [{ id: b.id, blockId: b.id, head: b.title, sub: b.place || 'Everyone', drill: b.drill, minutes: b.len }];
    if (b.kind === 'stations') return b.stations.map((s, i) => ({ id: s.id, blockId: b.id, head: `${b.title} · station ${i + 1}`, sub: s.place, drill: s.drill, minutes: b.turnMin }));
    return [];
  });
}
export function setSlotDrill(body: PlanBodyV2, slotId: string, drill: DrillRef | null): PlanBodyV2 {
  return withBlocks(body, blocksOf(body).map((b) => {
    if (b.kind === 'team' && b.id === slotId) return { ...b, drill };
    if (b.kind === 'stations' && b.stations.some((s) => s.id === slotId)) return { ...b, stations: b.stations.map((s) => (s.id === slotId ? { ...s, drill } : s)) };
    return b;
  }));
}
export const refOf = (ref: string): DrillRef | null => {
  const [src, id] = ref.split(':');
  return (src === 'team' || src === 'lib') && id ? { src, id } : null;
};
export const keyOfDrill = (d: DrillRef | null | undefined) => (d ? `${d.src}:${d.id}` : '');

/** "45 min", "3 h", "2 h 45". */
export function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? (m ? `${h} h ${m}` : `${h} h`) : `${m} min`;
}

/** The ribbon's words (S-PRC.bld-ribbon): "2 h 45 of 3 h" and "15 min open", "On time" or "15 min over". */
export function ribbon(total: number, window: number | null): { used: string; rest: string; over: boolean } {
  if (window == null) return { used: fmtMinutes(total), rest: '', over: false };
  const used = total === 0 ? `0 of ${fmtMinutes(window)}` : `${fmtMinutes(total)} of ${fmtMinutes(window)}`;
  if (total > window) return { used, rest: `${fmtMinutes(total - window)} over`, over: true };
  if (total === window) return { used, rest: 'On time', over: false };
  return { used, rest: `${fmtMinutes(window - total)} open`, over: false };
}

/** The clock at each block, from the practice's start. Times are never stored: reordering moves them. */
export function clockFor(start: string, zone: string, minutes: number): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: zone }).format(new Date(Date.parse(start) + minutes * 60_000)).replace(/\s?[AP]M$/, '');
}

export function blockSub(b: PlanBlock): string {
  if (b.kind === 'stations') return `${b.stations.length} stations · ${b.groupIds.length} groups · ${b.turnMin} min turns`;
  if (b.kind === 'course') return `Holes ${b.holeFrom} to ${b.holeTo}`;
  if (b.kind === 'own') return b.place || 'Each player’s own list';
  return b.place || (b.kind === 'team' ? 'Everyone' : '');
}

/* Suggestions: a draft from CoachHelm, held beside the plan. Nothing joins it until kept, and a suggestion never overwrites a block the coach made. */
export interface Ghost {
  id: string;
  block: PlanBlock;
  why: PlanWhy | null;
}

/** A draft's blocks as suggestions, each with an id of its own so keeping one can't collide with a block already in the plan. */
export function ghostsFrom(draft: PlanDraft): Ghost[] {
  return blocksOf(draft.body).map((block) => ({ id: `g-${block.id}`, block: { ...block, id: `g-${block.id}` }, why: draft.why[block.id] ?? null }));
}

/** Keeping a suggestion: the block joins the plan's end, with the draft's groups if the plan has none yet, and its Why travels beside the body. */
export function keepGhost(body: PlanBodyV2, why: Record<string, PlanWhy>, ghost: Ghost, draftBody: PlanBodyV2): { body: PlanBodyV2; why: Record<string, PlanWhy> } {
  const withGroups = body.groups.length === 0 && draftBody.groups.length > 0 && ghost.block.kind === 'stations' ? { ...body, groups: draftBody.groups, players: [...new Set([...body.players, ...draftBody.players])] } : body;
  const known = new Set(withGroups.groups.map((g) => g.id));
  const block: PlanBlock = ghost.block.kind === 'stations' ? (() => {
    const b = ghost.block as StationsBlock;
    const groupIds = b.groupIds.filter((g) => known.has(g));
    return { ...b, groupIds, grid: autoGrid({ stations: b.stations, groupIds, turns: b.turns }) };
  })() : ghost.block;
  return { body: addBlock(withGroups, block), why: ghost.why ? { ...why, [block.id]: ghost.why } : why };
}
