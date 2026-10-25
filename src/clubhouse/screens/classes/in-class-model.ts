import type { ChClassBlock, ChClassDay, ChClassDayPlayer } from '../../data/class-day-shape';
import {
  classLabel,
  classStatusFor,
  mergeIslands,
  minutesOfDay,
  statusClock,
  teamNow,
  windowRange,
  type ChIsland,
  type ChStatusTextOptions,
} from '../../data/class-status';
import { clockFromMinutes } from '../../lib/clock-format';
import { plural } from '../../lib/plural';
import { shortDate } from '../home/home-line';

/**
 * P-10 class awareness: what the In class now sheet draws, as a pure function of the payload, the instant and the clock.
 * Sections (In class, Next today, Travelling, No class status), the today strip (one lane per tracked player with a
 * block, or a density bar above 12 lanes) and the sheet's title and sub. Class names are for coaches only; this sheet
 * is coach only.
 */

export const DENSITY_ABOVE_LANES = 12;

export type SheetRow = {
  playerId: string;
  name: string;
  /** Right-hand text: "until 11:50 AM", "1:00 PM to 2:15 PM". Never truncated. */
  time: string | null;
  /** The second line: the class, "CHEM 101 · then BIO 110 until 1:50 PM", or the trip. */
  meta: string | null;
  /** One sentence for assistive tech. */
  label: string;
};

export type StripLane = { playerId: string; blocks: Array<{ left: number; width: number; exam: boolean }> };
export type StripDensity = { slots: Array<{ left: number; width: number; height: 0 | 3 | 6 | 9 | 12 }>; teamSize: number };
export type SheetStrip = {
  /** Hour ticks, as percentages along the strip. */
  ticks: Array<{ at: number; label: string }>;
  lanes: StripLane[];
  density: StripDensity | null;
  /** The now line, a percentage, or null outside the strip. */
  now: number | null;
  free: { left: number; width: number; label: string } | null;
};

export type SheetModel = {
  title: string;
  sub: string;
  inClass: SheetRow[];
  next: SheetRow[];
  travelling: SheetRow[];
  /** Players with no class status (untracked), names only. */
  none: string[];
  strip: SheetStrip | null;
  /** Nobody on the team has a block today. */
  empty: boolean;
};

const nameOf = (p: ChClassDayPlayer) => [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Player';

const blockLabel = (b: ChClassBlock) => classLabel(b.label || 'Class');

const startMs = (b: ChClassBlock) => Date.parse(b.startsAt);
const endMs = (b: ChClassBlock) => Date.parse(b.endsAt);

/** "CHEM 101 · then BIO 110 until 1:50 PM": the block under way, and the next block of the same island. */
function islandMeta(island: ChIsland, now: number, o: ChStatusTextOptions): string | null {
  const blocks = [...island.blocks].sort((a, b) => startMs(a) - startMs(b));
  const current = blocks.find((b) => startMs(b) <= now && now < endMs(b)) ?? blocks.find((b) => endMs(b) > now) ?? blocks[0];
  if (!current) return null;
  const after = blocks.find((b) => startMs(b) >= endMs(current) && b !== current);
  const head = blockLabel(current);
  if (!after) return head;
  const until = statusClock(endMs(after), o);
  return until ? `${head} · then ${blockLabel(after)} until ${until}` : head;
}

function travelMeta(p: ChClassDayPlayer): string {
  const where = p.away?.destination ?? null;
  const back = p.away?.returnDate ? `back ${new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(new Date(`${p.away.returnDate}T12:00:00Z`))}` : null;
  return [where, back].filter(Boolean).join(' · ') || 'Travelling';
}

export function sheetModel(day: ChClassDay, now: number, o: ChStatusTextOptions): SheetModel {
  const tn = teamNow(day, now);
  const total = day.players.length;
  const inClass: Array<{ row: SheetRow; end: number }> = [];
  const next: Array<{ row: SheetRow; start: number }> = [];
  const travelling: SheetRow[] = [];
  const none: string[] = [];

  for (const p of day.players) {
    const name = nameOf(p);
    if (p.away?.confirmed) {
      const meta = travelMeta(p);
      travelling.push({ playerId: p.playerId, name, time: null, meta, label: `${name}, travelling, ${meta}` });
      continue;
    }
    if (!p.tracked) {
      none.push(name);
      continue;
    }
    if (p.onCourse) continue;
    const status = classStatusFor(p, now);
    if (status.kind === 'in_class' || status.kind === 'exam') {
      const until = statusClock(status.until, o);
      const meta = islandMeta(status.island, now, o);
      const word = status.kind === 'exam' ? 'in an exam' : 'in class';
      inClass.push({ end: status.until, row: { playerId: p.playerId, name, time: until ? `until ${until}` : null, meta, label: [name, until ? `${word} until ${until}` : word, meta].filter(Boolean).join(', ') } });
      continue;
    }
    const island = mergeIslands(p.blocks).find((i) => i.startsAt > now);
    if (island) {
      const range = windowRange(island.startsAt, island.endsAt, o);
      const meta = islandMeta(island, island.startsAt, o);
      next.push({ start: island.startsAt, row: { playerId: p.playerId, name, time: range, meta, label: [name, range ? `next class ${range}` : 'next class later today', meta].filter(Boolean).join(', ') } });
    }
  }
  inClass.sort((a, b) => a.end - b.end);
  next.sort((a, b) => a.start - b.start);

  const inBlock = tn.inClassNow + tn.inExamNow;
  const hasBlocks = tn.lastEndAt != null;
  const strip = hasBlocks ? buildStrip(day, now, o, tn) : null;
  const shared = 'Class names show to coaches only.';
  return {
    title: hasBlocks ? 'In class now' : 'No classes today',
    sub: hasBlocks ? `${tn.tracked < total ? `${inBlock} of ${tn.tracked} tracked` : `${inBlock} of ${total}`} · ${shared}` : `${plural(total, 'player')} · ${shared}`,
    inClass: inClass.map((r) => r.row),
    next: next.map((r) => r.row),
    travelling,
    none,
    strip,
    empty: !hasBlocks,
  };
}

const HOUR = 60;

function buildStrip(day: ChClassDay, now: number, o: ChStatusTextOptions, tn: ReturnType<typeof teamNow>): SheetStrip | null {
  const zone = day.classTimeZone;
  const lanesRaw: Array<{ playerId: string; blocks: Array<{ s: number; e: number; exam: boolean }> }> = [];
  let min = 8 * HOUR;
  let max = 19 * HOUR;
  for (const p of day.players) {
    if (!p.tracked || p.onCourse || p.away?.confirmed) continue;
    const blocks: Array<{ s: number; e: number; exam: boolean }> = [];
    for (const b of p.blocks) {
      const s = minutesOfDay(startMs(b), zone);
      const e = minutesOfDay(endMs(b), zone);
      if (s == null || e == null || e <= s) continue;
      blocks.push({ s, e, exam: b.kind === 'exam' });
      min = Math.min(min, Math.floor(s / HOUR) * HOUR);
      max = Math.max(max, Math.ceil(e / HOUR) * HOUR);
    }
    if (blocks.length) lanesRaw.push({ playerId: p.playerId, blocks });
  }
  if (lanesRaw.length === 0) return null;
  min = Math.max(min, 6 * HOUR);
  max = Math.min(max, 22 * HOUR);
  const span = max - min;
  if (span <= 0) return null;
  const pct = (m: number) => Math.max(0, Math.min(100, ((m - min) / span) * 100));
  const lanes: StripLane[] = lanesRaw.map((l) => ({
    playerId: l.playerId,
    blocks: l.blocks.map((b) => ({ left: pct(b.s), width: Math.max(0.5, pct(b.e) - pct(b.s)), exam: b.exam })),
  }));
  const dense = lanes.length > DENSITY_ABOVE_LANES;
  const density: StripDensity | null = dense
    ? (() => {
        const slots: StripDensity['slots'] = [];
        for (let m = min; m < max; m += 15) {
          const count = lanesRaw.filter((l) => l.blocks.some((b) => b.s < m + 15 && b.e > m)).length;
          const share = count / lanesRaw.length;
          slots.push({ left: pct(m), width: pct(m + 15) - pct(m), height: count === 0 ? 0 : share <= 0.25 ? 3 : share <= 0.5 ? 6 : share <= 0.75 ? 9 : 12 });
        }
        return { slots, teamSize: lanesRaw.length };
      })()
    : null;
  // Labels every 2 hours (the sheet drops to every 4 at accessibility sizes in CSS).
  const ticks: SheetStrip['ticks'] = [];
  for (let m = Math.ceil(min / HOUR) * HOUR; m <= max; m += 2 * HOUR) ticks.push({ at: pct(m), label: clockFromMinutes(m, o.clock).replace(':00', '') });
  const nowMin = minutesOfDay(now, zone);
  const fw = tn.freeWindow;
  let free: SheetStrip['free'] = null;
  if (fw && fw !== 'none_before_cutoff') {
    const from = minutesOfDay(fw.from, zone);
    // An unbounded window runs to the end of the strip: "Everyone out from 2:15 PM".
    const to = fw.to != null ? minutesOfDay(fw.to, zone) : max;
    const range = fw.to != null ? windowRange(fw.from, fw.to, o) : statusClock(fw.from, o);
    if (from != null && to != null && range) free = { left: pct(from), width: Math.max(0, pct(to) - pct(from)), label: `${tn.tracked < day.players.length ? 'Tracked players' : 'Everyone'} out ${fw.to != null ? '' : 'from '}${range}` };
  }
  return { ticks, lanes, density, now: nowMin != null && nowMin >= min && nowMin <= max ? pct(nowMin) : null, free };
}

/** The footer's term row: "Fall 2026 · Aug 24 to Dec 11 · exams to Dec 18", or null with no term. */
export function termRow(day: ChClassDay): string | null {
  const t = day.term;
  if (!t) return null;
  const short = (iso: string) => shortDate(iso).replace(/^\w+, /, '');
  return `${t.label} · ${short(t.classesStart)} to ${short(t.classesEnd)} · exams to ${short(t.examsEnd)}`;
}
