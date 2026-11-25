/**
 * Course plan (Slice 7c; supercharge 04 Example 10, 03 table row 8).
 *
 * A player's own history on one course, read hole by hole, turned into at
 * most three plan lines, ranked by strokes at stake:
 *
 * - Tee trouble: par 4s and 5s that average a stroke or more over par, where
 *   the tee shots lean to one side or the penalties pile up. Research §Penalty
 *   strokes → scoring (each penalty ≈ 1.5 strokes for amateurs) and §Course
 *   management (on tight holes, the target that keeps the penalty out of play
 *   is net positive) in docs/v3-research-golf-domain.md.
 * - Par 3s: over par a round across the par 3s, greens hit, and the short /
 *   long (or left / right) lean of the misses. Research §Approach (proximity
 *   and GIR by distance); Arccos "3 mistakes" in supercharge 05-sources
 *   (aiming at pins). A short lean is answered with a target past the middle.
 * - Greens: three-putts a round here against the player's other rounds.
 *   Research §Lag putting → 3-putt avoidance (speed control, leave inside 3 ft).
 *
 * Nick's rule (2026-10-21): players do not record clubs. The only club-like
 * field is `golf_shots.club_type` (driver / non_driver on tee shots), which
 * may be counted ("driver on 5 of 6 tee shots") but is never turned into a
 * club recommendation. Plans name targets, sides and practice, never a club.
 *
 * It is a plan, not a read: no ladder word ("Likely", "Confirmed") appears,
 * and below six rounds the "thin history" line is mandatory.
 *
 * Pure: data in, plan out. No Supabase, no React, no LLM.
 */

/** Rounds on the course before a plan is built (04 Example 10 rules). */
export const COURSE_PLAN_MIN_ROUNDS = 3;
/** Below this many rounds the thin-history line is mandatory. */
export const COURSE_PLAN_SOLID_ROUNDS = 6;
/** Plan lines shown at most. */
export const COURSE_PLAN_MAX_LINES = 3;
/** A hole is read only once it has been played this often here. */
export const MIN_HOLE_PLAYS = 3;
/** A par 4 or 5 is tee trouble from this average over par. */
export const TROUBLE_OVER_PAR = 1;
/** Tee trouble with no side lean still qualifies on this many penalties. */
export const TROUBLE_MIN_PENALTIES = 2;
/** A side lean: at least this many misses to one side ... */
export const LEAN_MIN_MISSES = 3;
/** ... and at least this share of the side misses. */
export const SIDE_LEAN_SHARE = 2 / 3;
/** Par-3 short / long lean: this share of the tagged misses, from LEAN_MIN_TAGGED. */
export const DEPTH_LEAN_SHARE = 0.6;
export const LEAN_MIN_TAGGED = 4;
/** A line is offered only when it holds at least this many strokes a round. */
export const MIN_STAKE = 1;
/** Greens: three-putts a round here before the line is considered. */
export const GREENS_MIN_RATE = 0.5;
/** Greens: and at least this many more a round than elsewhere, when elsewhere is known. */
export const GREENS_MIN_GAP = 0.3;
/** Holes named in one tee line at most. */
const MAX_HOLES_PER_LINE = 3;

export interface CoursePlanHole {
  roundId: string;
  holeNumber: number;
  par: number;
  score: number | null;
  putts: number | null;
  penaltyStrokes: number | null;
  yardage: number | null;
}

export interface CoursePlanShot {
  roundId: string;
  holeNumber: number;
  shotNumber: number;
  shotType: string | null;
  clubType: string | null;
  missDirection: string | null;
  result: string | null;
  penaltyType: string | null;
  distanceBefore: number | null;
  distanceUnitBefore: string | null;
}

export interface CoursePlanInput {
  courseName: string;
  /** Countable rounds the player has on this course. */
  roundIds: readonly string[];
  holes: readonly CoursePlanHole[];
  shots: readonly CoursePlanShot[];
  /** Three-putts across the player's other rounds that recorded putts; null when not read. */
  elsewhere: { rounds: number; threePutts: number } | null;
}

export type CoursePlanLineKind = 'tee' | 'par3' | 'greens';

export interface CoursePlanLine {
  kind: CoursePlanLineKind;
  /** Hole numbers the line is about (empty for greens). */
  holes: number[];
  /** Strokes a round the line is about; lines are ranked by it. */
  stake: number;
  coach: string;
  player: string;
}

export type CoursePlan =
  | { status: 'too_few'; courseName: string; rounds: number }
  | {
      status: 'plan';
      courseName: string;
      rounds: number;
      thin: boolean;
      lines: CoursePlanLine[];
      coach: { title: string; lines: string[]; thinLine: string | null };
      /**
       * The player's own copy (chs-21): the lines in "you" voice, the thin-history line in the same voice below six rounds,
       * and a line for a plan with nothing in it (the coach's `none`), so the player never reads an empty plan.
       */
      player: { title: string; lines: string[]; thinLine: string | null; emptyLine: string | null };
    };

/** Per-hole history on the course. */
export interface HoleHistory {
  holeNumber: number;
  par: number;
  plays: number;
  overParAvg: number;
  penalties: number;
  waterPenalties: number;
  teeShots: number;
  driver: number;
  missLeft: number;
  missRight: number;
  greensHit: number;
  greensTried: number;
  missShort: number;
  missLong: number;
  missTagged: number;
  yardage: number | null;
}

const key = (roundId: string, hole: number) => `${roundId}#${hole}`;
const isPenaltyShot = (s: CoursePlanShot) => s.shotType === 'penalty' || s.result === 'penalty' || s.penaltyType != null;
const has = (dir: string | null, part: string) => !!dir && dir.split('_').includes(part);

function mode(values: number[]): number | null {
  if (values.length === 0) return null;
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = values[0]!;
  for (const [v, c] of counts) if (c > counts.get(best)! || (c === counts.get(best)! && v < best)) best = v;
  return best;
}

/** The player's history on each hole of the course, from the rounds given. */
export function buildHoleHistory(input: Pick<CoursePlanInput, 'roundIds' | 'holes' | 'shots'>): HoleHistory[] {
  const rounds = new Set(input.roundIds);
  const shotsByHole = new Map<string, CoursePlanShot[]>();
  for (const s of input.shots) {
    if (!rounds.has(s.roundId)) continue;
    const k = key(s.roundId, s.holeNumber);
    const list = shotsByHole.get(k);
    if (list) list.push(s);
    else shotsByHole.set(k, [s]);
  }
  const byNumber = new Map<number, CoursePlanHole[]>();
  const seen = new Set<string>();
  for (const h of input.holes) {
    if (!rounds.has(h.roundId) || h.score == null || h.score <= 0) continue;
    const k = key(h.roundId, h.holeNumber);
    if (seen.has(k)) continue;
    seen.add(k);
    const list = byNumber.get(h.holeNumber);
    if (list) list.push(h);
    else byNumber.set(h.holeNumber, [h]);
  }
  const out: HoleHistory[] = [];
  for (const [holeNumber, plays] of [...byNumber].sort((a, b) => a[0] - b[0])) {
    const par = mode(plays.map((p) => p.par)) ?? 4;
    const h: HoleHistory = {
      holeNumber,
      par,
      plays: plays.length,
      overParAvg: plays.reduce((n, p) => n + (p.score! - p.par), 0) / plays.length,
      penalties: 0,
      waterPenalties: 0,
      teeShots: 0,
      driver: 0,
      missLeft: 0,
      missRight: 0,
      greensHit: 0,
      greensTried: 0,
      missShort: 0,
      missLong: 0,
      missTagged: 0,
      yardage: mode(plays.map((p) => p.yardage).filter((y): y is number => y != null && y > 0)),
    };
    const firstShotYards: number[] = [];
    for (const play of plays) {
      const shots = (shotsByHole.get(key(play.roundId, holeNumber)) ?? []).slice().sort((a, b) => a.shotNumber - b.shotNumber);
      const pens = shots.filter(isPenaltyShot);
      // A hole entered without shots still carries its penalty count.
      h.penalties += Math.max(pens.length, play.penaltyStrokes ?? 0);
      h.waterPenalties += pens.filter((s) => s.penaltyType === 'water').length;
      const first = shots.find((s) => s.shotNumber === 1);
      if (!first) continue;
      if (par >= 4) {
        if (first.shotType === 'tee') {
          h.teeShots += 1;
          if (first.clubType === 'driver') h.driver += 1;
          if (has(first.missDirection, 'left')) h.missLeft += 1;
          else if (has(first.missDirection, 'right')) h.missRight += 1;
        } else if (isPenaltyShot(first)) {
          // A tee shot that found trouble is entered as the penalty row: a tee shot, its club and side unknown.
          h.teeShots += 1;
        }
      } else if (par === 3) {
        if (first.distanceBefore != null && first.distanceBefore > 0 && first.distanceUnitBefore !== 'feet') firstShotYards.push(first.distanceBefore);
        h.greensTried += 1;
        if (first.result === 'green' || first.result === 'hole') {
          h.greensHit += 1;
        } else if (first.missDirection) {
          h.missTagged += 1;
          if (has(first.missDirection, 'short')) h.missShort += 1;
          else if (has(first.missDirection, 'long')) h.missLong += 1;
          if (has(first.missDirection, 'left')) h.missLeft += 1;
          else if (has(first.missDirection, 'right')) h.missRight += 1;
        }
      }
    }
    if (h.yardage == null) h.yardage = mode(firstShotYards.map((y) => Math.round(y)));
    out.push(h);
  }
  return out;
}

const one = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const penalties = (n: number) => `${n} ${n === 1 ? 'penalty' : 'penalties'}`;

/** "4", "4 and 11", "4, 9 and 11". */
export function holeList(holes: readonly number[]): string {
  if (holes.length <= 1) return holes.map(String).join('');
  return `${holes.slice(0, -1).join(', ')} and ${holes.at(-1)}`;
}

type SideLean = 'left' | 'right' | null;
function sideLean(left: number, right: number): SideLean {
  const sides = left + right;
  if (left >= LEAN_MIN_MISSES && left / sides >= SIDE_LEAN_SHARE) return 'left';
  if (right >= LEAN_MIN_MISSES && right / sides >= SIDE_LEAN_SHARE) return 'right';
  return null;
}
const other = (side: 'left' | 'right') => (side === 'left' ? 'right' : 'left');

function teeLines(history: readonly HoleHistory[]): CoursePlanLine[] {
  const groups = new Map<SideLean, HoleHistory[]>();
  for (const h of history) {
    if (h.par < 4 || h.plays < MIN_HOLE_PLAYS || h.overParAvg < TROUBLE_OVER_PAR) continue;
    const lean = sideLean(h.missLeft, h.missRight);
    if (!lean && h.penalties < TROUBLE_MIN_PENALTIES) continue;
    const list = groups.get(lean);
    if (list) list.push(h);
    else groups.set(lean, [h]);
  }
  const lines: CoursePlanLine[] = [];
  for (const [lean, all] of groups) {
    const holes = all
      .slice()
      .sort((a, b) => b.overParAvg - a.overParAvg || a.holeNumber - b.holeNumber)
      .slice(0, MAX_HOLES_PER_LINE)
      .sort((a, b) => a.holeNumber - b.holeNumber);
    const stake = holes.reduce((n, h) => n + h.overParAvg, 0);
    const sum = (f: (h: HoleHistory) => number) => holes.reduce((n, h) => n + f(h), 0);
    const tee = sum((h) => h.teeShots);
    const pens = sum((h) => h.penalties);
    const water = sum((h) => h.waterPenalties);
    const driver = sum((h) => h.driver);
    const nums = holes.map((h) => h.holeNumber);
    const label = `${holes.length === 1 ? 'Hole' : 'Holes'} ${holeList(nums)}`;
    const facts: string[] = [];
    const missed = lean === 'left' ? sum((h) => h.missLeft) : lean === 'right' ? sum((h) => h.missRight) : 0;
    if (lean) facts.push(missed === tee ? `all ${tee} tee shots missed ${lean}` : `${missed} of ${tee} tee shots missed ${lean}`);
    if (driver > 0) facts.push(`driver on ${driver} of ${tee}`);
    if (pens > 0) facts.push(water === pens ? `${penalties(pens)}, all water` : penalties(pens));
    const target = lean ? `favour the ${other(lean)} half off the tee` : 'aim at the widest part of the fairway';
    const those = holes.length === 1 ? 'that hole' : holes.length === 2 ? 'those two' : 'those three';
    const coach = `${label}: ${facts.join(', ')}. Plan: ${target}. ${one(stake)} over par a round on ${those}.`;
    const why = lean
      ? `${missed === tee ? `All ${tee}` : `${missed} of your ${tee}`} tee shots there missed ${lean}${pens > 0 ? ` and you've taken ${penalties(pens)}` : ''}.`
      : `You've taken ${penalties(pens)} there${water === pens ? ', all in the water' : ''}.`;
    const player = `${holeList(nums)}: ${lean ? `aim at the ${other(lean)} half off the tee` : 'aim at the widest part of the fairway'}. ${why}`;
    lines.push({ kind: 'tee', holes: nums, stake, coach, player });
  }
  return lines;
}

function par3Line(history: readonly HoleHistory[]): CoursePlanLine | null {
  const holes = history.filter((h) => h.par === 3 && h.plays >= MIN_HOLE_PLAYS);
  if (holes.length === 0) return null;
  const stake = holes.reduce((n, h) => n + h.overParAvg, 0);
  const sum = (f: (h: HoleHistory) => number) => holes.reduce((n, h) => n + f(h), 0);
  const tried = sum((h) => h.greensTried);
  const hit = sum((h) => h.greensHit);
  const tagged = sum((h) => h.missTagged);
  const short = sum((h) => h.missShort);
  const long = sum((h) => h.missLong);
  const side = sideLean(sum((h) => h.missLeft), sum((h) => h.missRight));
  const yards = holes.map((h) => h.yardage).filter((y): y is number => y != null);
  const range = yards.length === holes.length && yards.length > 0 ? (Math.min(...yards) === Math.max(...yards) ? ` (${Math.min(...yards)} yd)` : ` (${Math.min(...yards)}–${Math.max(...yards)} yd)`) : '';
  let target = 'the middle of the green, whatever the flag';
  let why = '';
  let fact = '';
  if (tagged >= LEAN_MIN_TAGGED && short / tagged >= DEPTH_LEAN_SHARE) {
    target = 'aim past the middle of the green';
    fact = `${short} of ${tagged} misses short`;
    why = `${short} of your ${tagged} misses here were short.`;
  } else if (tagged >= LEAN_MIN_TAGGED && long / tagged >= DEPTH_LEAN_SHARE) {
    target = 'aim at the front half of the green';
    fact = `${long} of ${tagged} misses long`;
    why = `${long} of your ${tagged} misses here were long.`;
  } else if (side) {
    const n = side === 'left' ? sum((h) => h.missLeft) : sum((h) => h.missRight);
    target = `favour the ${other(side)} side of the green`;
    fact = `${n} of ${tagged} misses ${side}`;
    why = `${n} of your ${tagged} misses here were ${side}.`;
  }
  const facts = [`${one(stake)} over par a round`];
  if (tried > 0) facts.push(`greens ${hit} of ${tried}`);
  if (fact) facts.push(fact);
  const coach = `Par 3s${range}: ${facts.join('; ')}. Plan: ${target}.`;
  const player = `Par 3s: ${target === 'the middle of the green, whatever the flag' ? 'aim at the middle of the green, whatever the flag' : target}.${why ? ` ${why}` : ` You've hit ${hit} of ${tried} greens on them here.`}`;
  return { kind: 'par3', holes: holes.map((h) => h.holeNumber), stake, coach, player };
}

function greensLine(input: CoursePlanInput): CoursePlanLine | null {
  const rounds = new Set(input.roundIds);
  const withPutts = new Set<string>();
  let three = 0;
  const seen = new Set<string>();
  for (const h of input.holes) {
    if (!rounds.has(h.roundId) || h.putts == null) continue;
    const k = key(h.roundId, h.holeNumber);
    if (seen.has(k)) continue;
    seen.add(k);
    withPutts.add(h.roundId);
    if (h.putts >= 3) three += 1;
  }
  if (withPutts.size < COURSE_PLAN_MIN_ROUNDS) return null;
  const here = three / withPutts.size;
  if (here < GREENS_MIN_RATE) return null;
  const known = input.elsewhere && input.elsewhere.rounds >= COURSE_PLAN_MIN_ROUNDS ? input.elsewhere : null;
  const there = known ? known.threePutts / known.rounds : null;
  if (there != null && here - there < GREENS_MIN_GAP) return null;
  const stake = there != null ? here - there : here;
  const coach = `Greens: ${one(here)} three-putts a round here${there != null ? ` (${one(there)} elsewhere)` : ''}. Plan: a lag ladder before the round.`;
  const player = `Greens: a lag ladder before you play here. You've averaged ${one(here)} three-putts a round on these greens${there != null ? `, ${one(there)} elsewhere` : ''}.`;
  return { kind: 'greens', holes: [], stake, coach, player };
}

/**
 * The plan for one player on one course, or `too_few` below three rounds.
 * Lines under a stroke a round are left out; the rest are ranked by stake.
 */
export function buildCoursePlan(input: CoursePlanInput): CoursePlan {
  const history = buildHoleHistory(input);
  const scored = new Set(input.holes.filter((h) => h.score != null && h.score > 0 && input.roundIds.includes(h.roundId)).map((h) => h.roundId));
  const rounds = scored.size;
  if (rounds < COURSE_PLAN_MIN_ROUNDS) return { status: 'too_few', courseName: input.courseName, rounds };
  const candidates = [...teeLines(history), par3Line(history), greensLine(input)].filter((l): l is CoursePlanLine => l != null && l.stake >= MIN_STAKE);
  const lines = candidates.sort((a, b) => b.stake - a.stake).slice(0, COURSE_PLAN_MAX_LINES);
  const thin = rounds < COURSE_PLAN_SOLID_ROUNDS;
  const thinLine = thin ? `${rounds} rounds is a thin history; treat this as a reminder, not a read.` : null;
  const none = `Nothing here costs a stroke a round yet across ${rounds} rounds: no hole, par 3 or green stands out.`;
  return {
    status: 'plan',
    courseName: input.courseName,
    rounds,
    thin,
    lines,
    coach: { title: `Course plan: ${input.courseName} · from ${rounds} rounds here`, lines: lines.length ? lines.map((l) => l.coach) : [none], thinLine },
    player: {
      title: `At ${input.courseName}`,
      lines: lines.map((l) => l.player),
      thinLine: thin ? `From your ${rounds} rounds here, so take it as a reminder, not a read.` : null,
      emptyLine: lines.length ? null : `Nothing here has cost you a stroke a round yet across your ${rounds} rounds.`,
    },
  };
}

export interface CoursePlanRoundRow {
  courseId: string | null;
  courseName: string | null;
  roundDate: string;
}

export interface CoursePlanCourse {
  courseId: string;
  name: string;
  rounds: number;
  lastPlayed: string;
}

/** Courses the player has at least three countable rounds on, most played first, then most recent. */
export function eligibleCourses(rounds: readonly CoursePlanRoundRow[]): CoursePlanCourse[] {
  const by = new Map<string, CoursePlanCourse>();
  for (const r of rounds) {
    if (!r.courseId) continue;
    const c = by.get(r.courseId);
    if (!c) {
      by.set(r.courseId, { courseId: r.courseId, name: r.courseName?.trim() || 'This course', rounds: 1, lastPlayed: r.roundDate });
      continue;
    }
    c.rounds += 1;
    if (r.roundDate > c.lastPlayed) {
      c.lastPlayed = r.roundDate;
      if (r.courseName?.trim()) c.name = r.courseName.trim();
    }
  }
  return [...by.values()].filter((c) => c.rounds >= COURSE_PLAN_MIN_ROUNDS).sort((a, b) => b.rounds - a.rounds || b.lastPlayed.localeCompare(a.lastPlayed));
}
