import { meanSe, diffSe } from '../lib/stats-signal';
import type { ChPlayHole } from './stats-extra';

/*
 * P-7: how one course treats one player, worked out from their rounds there. Each figure carries its sample and is said
 * only past its floor and its noise (P-7 4.1.3), so a small sample never reads as a pattern. Pure: no Supabase, no React.
 */

/**
 * The spread of one hole's score to par for one player, in strokes. Inferred (a typical college player's per-hole SD), not
 * measured: re-estimate from data after launch; the owner may tune it.
 */
export const POOLED_HOLE_SD = 0.9;
/** A hole's average shows from two plays and is an early read under five. */
export const HOLE_SHOW = 2;
export const HOLE_EARLY = 5;
/** A three-hole stretch needs three 18-hole rounds with hole scores here; so does "how it plays for you", each side. */
export const STRETCH_MIN_ROUNDS = 3;
export const COMPARE_MIN_ROUNDS = 3;
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
  /** Standard error of `avg`: POOLED_HOLE_SD over √n. */
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
 * One hole's figures here. The tint is level within one standard error of par (or under the floor), tier 1 past it and
 * tier 2 at half a stroke or more: under par is the red family, over par amber (D-42).
 */
export function holeStats(plays: readonly ChHolePlay[]): ChHoleStats {
  const n = plays.length;
  const tp = plays.map((p) => p.score - p.par);
  const avg = n ? tp.reduce((a, d) => a + d, 0) / n : null;
  const se = n ? POOLED_HOLE_SD / Math.sqrt(n) : null;
  let tint: ChHoleTint = 'l';
  if (avg != null && se != null && n >= HOLE_SHOW && Math.abs(avg) > se) {
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
  /** Average strokes to par over the three holes, per round. */
  avg: number;
  se: number;
}

/**
 * The three holes in a row that cost the most here, and the best three, from 18-hole rounds with every hole scored. Each is
 * said only when it is clear of its noise (0.9 · √3 / √n) and comes from at least three rounds.
 */
export function stretches(rounds: readonly (readonly ChPlayHole[])[]): { worst: ChStretch | null; best: ChStretch | null } {
  const full = rounds.filter((r) => r.length === 18 && r.every((h) => h.score != null));
  const n = full.length;
  if (n < STRETCH_MIN_ROUNDS) return { worst: null, best: null };
  const se = (POOLED_HOLE_SD * Math.sqrt(3)) / Math.sqrt(n);
  const byNumber = full.map((r) => {
    const m = new Map(r.map((h) => [h.n, (h.score as number) - h.par]));
    return Array.from({ length: 18 }, (_, i) => m.get(i + 1) ?? 0);
  });
  let worst: ChStretch | null = null;
  let best: ChStretch | null = null;
  for (let from = 1; from <= 16; from++) {
    const avg = byNumber.reduce((a, r) => a + r[from - 1]! + r[from]! + r[from + 1]!, 0) / n;
    if (!worst || avg > worst.avg) worst = { from, avg, se };
    if (!best || avg < best.avg) best = { from, avg, se };
  }
  return {
    worst: worst && worst.avg > se ? worst : null,
    best: best && best.avg < -se ? best : null,
  };
}

/**
 * Whether the course plays harder or easier for the player than their other courses: the difference of mean score to par
 * per 18-hole round, here against elsewhere, said only when it is at least one standard error of the difference (the
 * player's own spread from five rounds, the pooled 3.6 before).
 */
export function playsCompared(here: readonly number[], elsewhere: readonly number[]): { diff: number; se: number; words: 'harder' | 'easier' | 'same' } | { needs: 'here' | 'elsewhere' } {
  if (here.length < COMPARE_MIN_ROUNDS) return { needs: 'here' };
  if (elsewhere.length < COMPARE_MIN_ROUNDS) return { needs: 'elsewhere' };
  const m = (xs: readonly number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;
  const diff = m(here) - m(elsewhere);
  const se = diffSe(meanSe([...here], 'score'), meanSe([...elsewhere], 'score')) ?? Infinity;
  return { diff, se, words: Math.abs(diff) < se ? 'same' : diff > 0 ? 'harder' : 'easier' };
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
