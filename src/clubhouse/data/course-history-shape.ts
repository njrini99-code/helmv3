import { meanSe, diffSe, POOLED_SD, sampleSd } from '../lib/stats-signal';
import type { ChPlayHole } from './stats-extra';

/*
 * P-7: how one course treats one player, worked out from their rounds there. Each figure carries its sample and is said
 * only past its floor and its noise (P-7 4.1.3), so a small sample never reads as a pattern. Pure: no Supabase, no React.
 */

/**
 * The spread of one hole's score to par when the player's own can't be measured yet: production's within-player round
 * spread (`POOLED_SD.score`, 3.6) over √18, about 0.85. It errs toward plain tiles.
 */
export const FALLBACK_HOLE_SD = POOLED_SD.score / Math.sqrt(18);
/** The player's own pooled within-hole spread replaces the fallback from this many degrees of freedom. */
export const OWN_HOLE_SD_MIN_DF = 30;
/** A hole's average shows from two plays; it takes colour only from five (`FLOORS.score.early`), past two standard errors. */
export const HOLE_SHOW = 2;
export const HOLE_EARLY = 5;
export const HOLE_TINT_Z = 2;
/**
 * A three-hole stretch is said from five 18-hole rounds with every hole scored, and only past 2.6 standard errors of its
 * excess: about six independent three-hole windows, so Bonferroni at 5% two-sided asks 2.64.
 */
export const STRETCH_MIN_ROUNDS = 5;
export const STRETCH_Z = 2.6;
/** "How it plays for you" needs three rounds each side; a difference inside one SE reads "about the same" only when that SE is a shot or less. */
export const COMPARE_MIN_ROUNDS = 3;
export const SAME_MAX_SE = 1;
/** The average arc needs two complete rounds; its spread band, five. */
export const ARC_MIN_ROUNDS = 2;
export const ARC_BAND_MIN_ROUNDS = 5;

export type ChHoleTint = 'u2' | 'u1' | 'l' | 'o1' | 'o2';

export interface ChHolePlay {
  score: number;
  par: number;
  putts: number | null;
  gir: boolean | null;
  fairway: boolean | null;
  roundId: string;
  date: string;
}

export interface ChHoleStats {
  /** Plays of the hole. */
  n: number;
  /** Average score to par, from two plays; one play is the score itself, untoned. */
  avg: number | null;
  /** Standard error of `avg`: the hole spread (`ownHoleSd`) over √n. */
  se: number | null;
  tint: ChHoleTint;
  state: 'none' | 'once' | 'early' | 'ok';
  /** Lowest score to par played here. */
  best: number | null;
  /** Fairways hit of par 4 and 5 plays with the field recorded, and greens in regulation of plays with it recorded. */
  fairways: [number, number];
  greens: [number, number];
  /** Putts per play, over plays with putts recorded; null under two. */
  putts: number | null;
}

/**
 * The player's pooled within-hole spread at this course: each hole's plays about that hole's own mean, pooled over the
 * holes. Used from 30 degrees of freedom; under that, or when it measures nothing, the fallback.
 */
export function ownHoleSd(byHole: ReadonlyArray<readonly ChHolePlay[]>): number {
  let ss = 0;
  let df = 0;
  for (const plays of byHole) {
    if (plays.length < 2) continue;
    const tp = plays.map((p) => p.score - p.par);
    const m = tp.reduce((a, d) => a + d, 0) / tp.length;
    ss += tp.reduce((a, d) => a + (d - m) ** 2, 0);
    df += tp.length - 1;
  }
  if (df < OWN_HOLE_SD_MIN_DF) return FALLBACK_HOLE_SD;
  const sd = Math.sqrt(ss / df);
  return sd > 0.05 ? sd : FALLBACK_HOLE_SD;
}

/**
 * One hole's figures here. A tile takes colour only from five plays and past two standard errors of par: tier 1, then
 * tier 2 at half a stroke or more; under par is the red family, over par amber (D-42). From two to four plays it is an
 * early read on the level fill, never coloured (the "muted, no semantic colour" contract of `stats-signal.ts`).
 */
export function holeStats(plays: readonly ChHolePlay[], sd: number = FALLBACK_HOLE_SD): ChHoleStats {
  const n = plays.length;
  const tp = plays.map((p) => p.score - p.par);
  const avg = n ? tp.reduce((a, d) => a + d, 0) / n : null;
  const se = n ? sd / Math.sqrt(n) : null;
  let tint: ChHoleTint = 'l';
  if (avg != null && se != null && n >= HOLE_EARLY && Math.abs(avg) >= HOLE_TINT_Z * se) {
    tint = avg < 0 ? (avg <= -0.5 ? 'u2' : 'u1') : avg >= 0.5 ? 'o2' : 'o1';
  }
  const fw = plays.filter((p) => p.par >= 4 && p.fairway != null);
  const gr = plays.filter((p) => p.gir != null);
  const pu = plays.filter((p) => typeof p.putts === 'number' && p.putts > 0);
  return {
    n,
    avg,
    se,
    tint,
    state: n === 0 ? 'none' : n === 1 ? 'once' : n < HOLE_EARLY ? 'early' : 'ok',
    best: n ? Math.min(...tp) : null,
    fairways: [fw.filter((p) => p.fairway).length, fw.length],
    greens: [gr.filter((p) => p.gir).length, gr.length],
    putts: pu.length >= HOLE_SHOW ? pu.reduce((a, p) => a + (p.putts as number), 0) / pu.length : null,
  };
}

export interface ChStretch {
  /** First hole of the three (holes by number: a course's 13 is the same hole whatever the start). */
  from: number;
  /**
   * Strokes a round over (or under) the player's own usual for three holes here: each round's three holes less 3/18 of
   * that round's score to par, averaged. "Holes 13 to 15 · 1.4 a round over your usual".
   */
  avg: number;
  se: number;
}

/**
 * The three holes in a row that cost the most here against the player's own average, and the best three, from 18-hole
 * rounds with every hole scored. Measuring the excess over the round (not raw strokes to par) keeps a player who is over
 * par everywhere from seeing every stretch as costly; the standard error is their own spread of that excess. Said from
 * five rounds and only past `STRETCH_Z` standard errors, the bar that holds across the sixteen windows looked at.
 */
export function stretches(rounds: readonly (readonly ChPlayHole[])[]): { worst: ChStretch | null; best: ChStretch | null } {
  const full = rounds.filter((r) => r.length === 18 && r.every((h) => h.score != null));
  const n = full.length;
  if (n < STRETCH_MIN_ROUNDS) return { worst: null, best: null };
  const byNumber = full.map((r) => {
    const m = new Map(r.map((h) => [h.n, (h.score as number) - h.par]));
    return Array.from({ length: 18 }, (_, i) => m.get(i + 1) ?? 0);
  });
  const totals = byNumber.map((r) => r.reduce((a, d) => a + d, 0));
  let worst: ChStretch | null = null;
  let best: ChStretch | null = null;
  for (let from = 1; from <= 16; from++) {
    const d = byNumber.map((r, i) => r[from - 1]! + r[from]! + r[from + 1]! - (3 / 18) * totals[i]!);
    const avg = d.reduce((a, x) => a + x, 0) / n;
    const sd = sampleSd(d);
    // Rounds that repeat a stretch to the shot measure no spread: the three-hole fallback, so a coincidence never reads as certain.
    const se = (sd != null && sd > 0.05 ? sd : FALLBACK_HOLE_SD * Math.sqrt(3)) / Math.sqrt(n);
    if (avg > STRETCH_Z * se && (!worst || avg > worst.avg)) worst = { from, avg, se };
    if (avg < -STRETCH_Z * se && (!best || avg < best.avg)) best = { from, avg, se };
  }
  return { worst, best };
}

/**
 * Whether the course plays harder or easier for the player than their other courses: the difference of mean score to par
 * per 18-hole round, here against elsewhere, said only when it is at least one standard error of the difference (the
 * player's own spread from five rounds, the pooled 3.6 before). Inside one SE it is "about the same" only when the SE is a
 * shot or less; a wider one has not seen enough to say, so it is "No clear difference yet" (`'unclear'`).
 */
export function playsCompared(here: readonly number[], elsewhere: readonly number[]): { diff: number; se: number; words: 'harder' | 'easier' | 'same' | 'unclear' } | { needs: 'here' | 'elsewhere' } {
  if (here.length < COMPARE_MIN_ROUNDS) return { needs: 'here' };
  if (elsewhere.length < COMPARE_MIN_ROUNDS) return { needs: 'elsewhere' };
  const m = (xs: readonly number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;
  const diff = m(here) - m(elsewhere);
  const se = diffSe(meanSe([...here], 'score'), meanSe([...elsewhere], 'score')) ?? Infinity;
  return { diff, se, words: Math.abs(diff) < se ? (se <= SAME_MAX_SE ? 'same' : 'unclear') : diff > 0 ? 'harder' : 'easier' };
}

/**
 * The average running score to par after each hole, 1..18, across 18-hole rounds here with every hole scored (a round with a
 * gap is left out; `rounds` says how many were used). The spread (one SD each side) only from five rounds.
 */
export function averageArc(rounds: readonly (readonly ChPlayHole[])[]): { mean: number[]; sd: number[] | null; rounds: number } | null {
  const full = rounds.filter((r) => r.length === 18 && r.every((h) => h.score != null));
  if (full.length < ARC_MIN_ROUNDS) return null;
  const cums = full.map((r) => {
    const sorted = [...r].sort((a, b) => a.n - b.n);
    let c = 0;
    return sorted.map((h) => (c += (h.score as number) - h.par));
  });
  const n = cums.length;
  const mean = Array.from({ length: 18 }, (_, i) => cums.reduce((a, c) => a + c[i]!, 0) / n);
  const sd =
    n >= ARC_BAND_MIN_ROUNDS
      ? mean.map((mu, i) => Math.sqrt(cums.reduce((a, c) => a + (c[i]! - mu) ** 2, 0) / (n - 1)))
      : null;
  return { mean, sd, rounds: n };
}

/** A hole of the card a nine is matched against: its par and, when the card has one, its yardage. */
export type ChCardHole = { par: number; yards: number | null };

/** Yardages within this many yards are the same hole (tee boxes move a little day to day). */
const NINE_YARDS_SLACK = 10;

/**
 * Which nine a nine-hole round was, when its holes (stored 1 to 9 whichever nine was played) can be placed on the card:
 * the tee card (`golf_course_tee_holes`) or the player's own 18-hole rounds here. A side matches when every par agrees
 * and every yardage both have is within the slack; the side is named only when exactly one side matches, preferring a
 * match that compared yardages. Otherwise null, and the round is left out of hole figures. Read-only: nothing a player
 * records changes.
 */
export function nineOf(holes: readonly { n: number; par: number; yards?: number | null }[], card: ReadonlyMap<number, ChCardHole> | null): 'front' | 'back' | null {
  if (!card || holes.length === 0 || holes.some((h) => h.n < 1 || h.n > 9)) return null;
  const side = (offset: number): { ok: boolean; yards: number } => {
    let yards = 0;
    for (const h of holes) {
      const c = card.get(h.n + offset);
      if (!c || c.par !== h.par) return { ok: false, yards: 0 };
      if (h.yards != null && c.yards != null) {
        if (Math.abs(h.yards - c.yards) > NINE_YARDS_SLACK) return { ok: false, yards: 0 };
        yards++;
      }
    }
    return { ok: true, yards };
  };
  const front = side(0);
  const back = side(9);
  if (front.ok && !back.ok) return 'front';
  if (back.ok && !front.ok) return 'back';
  if (front.ok && back.ok && front.yards !== back.yards) return front.yards > back.yards ? 'front' : 'back';
  return null;
}
