import { playOrder } from '@/lib/golf/round-session/play-order';
import { formatFixed, formatPct, formatSigned } from '../lib/format';
import { recordedPutts } from './round-scope';

/*
 * P-7: four figures a round's holes say beyond its score (the review's "What the round says"), and the player's usual for
 * each, read from their recent rounds. A figure the round cannot support is null or an honest zero ("no bogeys to bounce
 * back from"), never a guess. Pure: no Supabase, no React.
 */

export interface ChPlayHole {
  /** Hole number, 1..18. */
  n: number;
  par: number;
  score: number | null;
  putts: number | null;
  gir: boolean | null;
  fairway: boolean | null;
  /** The hole's yardage on this card, when the loader read it (the course page's detail). */
  yards?: number | null;
}

/** The usual needs this many rounds behind it, and putts per green hit this many greens (P-7 4.1.3). */
export const USUAL_MIN_ROUNDS = 5;
export const USUAL_MIN_GREENS = 20;
/** Putts per green hit for one round needs this many greens hit with putts recorded. */
export const ROUND_MIN_GREENS = 3;

/**
 * The holes in the order they were played: a round started on 10 is 10..18 then 1..9 (`playOrder`, the round engine's
 * own). Holes missing from the card are left out; with no start hole the order is hole number.
 */
export function holesInPlayOrder(holes: readonly ChPlayHole[], startHole: number | null): ChPlayHole[] {
  const byNumber = [...holes].sort((a, b) => a.n - b.n);
  const total = byNumber.length ? Math.max(...byNumber.map((h) => h.n)) : 0;
  if (!startHole || total < 2) return byNumber;
  const at = new Map(byNumber.map((h) => [h.n, h]));
  return playOrder(total, startHole)
    .map((i) => at.get(i + 1))
    .filter((h): h is ChPlayHole => !!h);
}

const toPar = (h: ChPlayHole): number | null => (h.score == null ? null : h.score - h.par);

/**
 * Bounce-back: a chance is a hole over par followed, in play order, by a scored hole; it is made when that next hole is
 * par or better. The last hole played is never a chance.
 */
export function bounceBack(order: readonly ChPlayHole[]): { made: number; chances: number } {
  let made = 0;
  let chances = 0;
  for (let i = 0; i < order.length - 1; i++) {
    const d = toPar(order[i]!);
    const next = toPar(order[i + 1]!);
    if (d == null || d < 1 || next == null) continue;
    chances++;
    if (next <= 0) made++;
  }
  return { made, chances };
}

/** Putts on the greens hit in regulation, over those greens; the value is null under three greens with putts. */
export function puttsPerGir(holes: readonly ChPlayHole[]): { putts: number; greens: number; value: number | null } {
  let putts = 0;
  let greens = 0;
  for (const h of holes) {
    const p = recordedPutts(h.putts);
    if (h.gir !== true || p == null) continue;
    putts += p;
    greens++;
  }
  return { putts, greens, value: greens >= ROUND_MIN_GREENS ? putts / greens : null };
}

/** The last three holes played and their total to par; null when any of them has no score. */
export function closingThree(order: readonly ChPlayHole[]): { holes: [number, number, number]; toPar: number } | null {
  if (order.length < 3) return null;
  const last = order.slice(-3);
  const ds = last.map(toPar);
  if (ds.some((d) => d == null)) return null;
  return { holes: [last[0]!.n, last[1]!.n, last[2]!.n], toPar: (ds as number[]).reduce((a, d) => a + d, 0) };
}

/** Holes scored double bogey or worse. */
export function bigNumbers(holes: readonly ChPlayHole[]): number {
  return holes.filter((h) => (toPar(h) ?? 0) >= 2).length;
}

export interface ChBaseline {
  rounds: number;
  bounce: { made: number; chances: number };
  ppg: { putts: number; greens: number };
  /** Each round's closing three to par. */
  closing: number[];
  /** Each round's big numbers. */
  big: number[];
}

/** The figures summed over the usual's rounds (the caller passes the last 20 countable 18-hole rounds before this one). */
export function baseline(rounds: readonly (readonly ChPlayHole[])[], startHoles: readonly (number | null)[]): ChBaseline {
  const out: ChBaseline = { rounds: rounds.length, bounce: { made: 0, chances: 0 }, ppg: { putts: 0, greens: 0 }, closing: [], big: [] };
  rounds.forEach((holes, i) => {
    const order = holesInPlayOrder(holes, startHoles[i] ?? null);
    const b = bounceBack(order);
    out.bounce.made += b.made;
    out.bounce.chances += b.chances;
    const p = puttsPerGir(holes);
    out.ppg.putts += p.putts;
    out.ppg.greens += p.greens;
    const c = closingThree(order);
    if (c) out.closing.push(c.toPar);
    out.big.push(bigNumbers(holes));
  });
  return out;
}

const avg = (xs: readonly number[]): number | null => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null);

/**
 * The usual in words, for the caption under each figure ("Usually 44% · 20 rounds"). Null for a figure under its floor,
 * which then shows the round's own value alone.
 */
export function baselineWords(b: ChBaseline): { bounce: string | null; ppg: string | null; closing: string | null; big: string | null } {
  if (b.rounds < USUAL_MIN_ROUNDS) return { bounce: null, ppg: null, closing: null, big: null };
  const of = ` · ${b.rounds} rounds`;
  const closing = b.closing.length >= USUAL_MIN_ROUNDS ? avg(b.closing) : null;
  return {
    bounce: b.bounce.chances > 0 ? `Usually ${formatPct((b.bounce.made / b.bounce.chances) * 100)}${of}` : null,
    ppg: b.ppg.greens >= USUAL_MIN_GREENS ? `Usually ${formatFixed(b.ppg.putts / b.ppg.greens, 2)}${of}` : null,
    closing: closing == null ? null : `Usually ${formatSigned(closing)}${of}`,
    big: `Usually ${formatFixed(avg(b.big), 1)} a round${of}`,
  };
}
