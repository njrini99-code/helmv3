import type { ChReviewHole, ChRoundReview } from './round-review-shape';
import { formatToPar } from '../lib/format';

/**
 * The player's 30-second debrief on a round (CoachHelm chs-30; supercharge 04 example 9 and layout 3): one number that moved
 * against the player's own average, the top open read with one line on what this round did to it, the round's counted facts in
 * one line, and one next step. Pure: the round, the player's earlier rounds and the read go in, words come out. Every line is a
 * count or an average of what was recorded; a part the data cannot say is null and the screen drops its line. Nothing here is a
 * read of its own: a fact of one round is said as a count ("both came after a tee shot into the rough"), never as a pattern.
 *
 * Drawn only with `coachhelm_reads_v1_copy` on and only for the player's own round (the loader sets `debrief`); off, the review
 * is what it was.
 */

/** One earlier completed, countable round of the same length, as `golf_rounds` stores its totals. */
export interface ChDebriefHistoryRow {
  total_putts: number | null;
  total_fairways_hit: number | null;
  total_fairways: number | null;
  total_gir: number | null;
  total_gir_possible: number | null;
  score_to_par: number | null;
}

/** The player's top open read, as the loader found it (the Board's own ranking over the visible rows). */
export interface ChDebriefReadInput {
  id: string;
  title: string;
  /** `evidence.metric`. */
  metric: string | null;
  /** `evidence.your_value`: the player's value in the read, in the metric's own unit. */
  yourValue: number | null;
}

/** What the next step can be, best first: the read's attached drill, else the focus area the player is working on. */
export interface ChDebriefNextInput {
  drill: { title: string; minutes: number | null } | null;
  focus: string | null;
}

export interface ChDebriefInputs {
  history: readonly ChDebriefHistoryRow[];
  read: ChDebriefReadInput | null;
  next: ChDebriefNextInput | null;
}

export interface ChDebrief {
  /** "30 putts" and "Your average over your last 12 rounds: 32.1." Null when nothing moved by a full spread of the player's own. */
  moved: { value: string; line: string; tone: 'gain' | 'loss' } | null;
  /** The top open read and what this round did to it; `change` is null when the round cannot speak to the read's measure. */
  read: { id: string; title: string; change: string | null } | null;
  /** "Two doubles or worse (holes 7 and 14); both came after a tee shot right into the rough." */
  facts: string | null;
  /** "Lag ladder · 12 min", or the focus area's title. */
  next: string | null;
}

/** Fewest earlier rounds an average is said over. */
export const DEBRIEF_MIN_HISTORY = 3;
/** Newest earlier rounds the average is taken over. */
export const DEBRIEF_HISTORY_MAX = 20;
/** How far, in the player's own spread (standard deviations), a number has to sit from their average to have moved. */
export const DEBRIEF_MOVED_Z = 1;

const COUNT = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const countWord = (n: number) => COUNT[n] ?? String(n);
const fix1 = (v: number) => v.toFixed(1);
const pctOf = (hit: number, of: number) => Math.round((hit / of) * 100);
/** "7, 14" and "4, 9 and 16". */
const holeList = (ns: readonly number[]) => (ns.length <= 2 ? ns.join(ns.length === 2 ? ' and ' : '') : `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`);

function meanSd(xs: readonly number[]): { mean: number; sd: number } {
  const mean = xs.reduce((a, x) => a + x, 0) / xs.length;
  const v = xs.reduce((a, x) => a + (x - mean) ** 2, 0) / Math.max(1, xs.length - 1);
  return { mean, sd: Math.sqrt(v) };
}

interface Candidate {
  /** This round's value. */
  x: number;
  /** The same measure on each earlier round that has it. */
  past: number[];
  lowerIsBetter: boolean;
  value: string;
  said: (mean: number) => string;
}

/**
 * The one number that moved: of putts, score to par, fairways and greens, the one furthest from the player's own average in their
 * own spread, when it is at least `DEBRIEF_MOVED_Z` spreads away and the average stands on `DEBRIEF_MIN_HISTORY` rounds. Either
 * way counts as moved; the tone says which.
 */
export function movedNumber(r: ChRoundReview, history: readonly ChDebriefHistoryRow[]): ChDebrief['moved'] {
  const rows = history.slice(0, DEBRIEF_HISTORY_MAX);
  const over = (n: number) => `Your average over your last ${n} rounds`;
  const cands: Candidate[] = [];
  if (r.putts != null)
    cands.push({
      x: r.putts,
      past: rows.map((h) => h.total_putts).filter((v): v is number => v != null),
      lowerIsBetter: true,
      value: `${r.putts} putts`,
      said: (m) => `: ${fix1(m)}.`,
    });
  if (r.toPar != null)
    cands.push({
      x: r.toPar,
      past: rows.map((h) => h.score_to_par).filter((v): v is number => v != null),
      lowerIsBetter: true,
      value: `${formatToPar(r.toPar)} to par`,
      said: (m) => `: ${formatToPar(Number(m.toFixed(1)))}.`,
    });
  if (r.fairways && r.fairways.of > 0)
    cands.push({
      x: pctOf(r.fairways.hit, r.fairways.of),
      past: rows.filter((h) => h.total_fairways && h.total_fairways > 0).map((h) => pctOf(h.total_fairways_hit ?? 0, h.total_fairways as number)),
      lowerIsBetter: false,
      value: `${r.fairways.hit} of ${r.fairways.of} fairways`,
      said: (m) => `: ${Math.round(m)}% of fairways (${pctOf(r.fairways!.hit, r.fairways!.of)}% today).`,
    });
  if (r.greens && r.greens.of > 0)
    cands.push({
      x: pctOf(r.greens.hit, r.greens.of),
      past: rows.filter((h) => h.total_gir_possible && h.total_gir_possible > 0).map((h) => pctOf(h.total_gir ?? 0, h.total_gir_possible as number)),
      lowerIsBetter: false,
      value: `${r.greens.hit} of ${r.greens.of} greens`,
      said: (m) => `: ${Math.round(m)}% of greens (${pctOf(r.greens!.hit, r.greens!.of)}% today).`,
    });
  let best: { c: Candidate; z: number; mean: number; n: number } | null = null;
  for (const c of cands) {
    if (c.past.length < DEBRIEF_MIN_HISTORY) continue;
    const { mean, sd } = meanSd(c.past);
    if (!(sd > 0)) continue;
    const z = Math.abs(c.x - mean) / sd;
    if (z >= DEBRIEF_MOVED_Z && (!best || z > best.z)) best = { c, z, mean, n: c.past.length };
  }
  if (!best) return null;
  const better = best.c.lowerIsBetter ? best.c.x < best.mean : best.c.x > best.mean;
  return { value: best.c.value, line: over(best.n) + best.c.said(best.mean), tone: better ? 'gain' : 'loss' };
}

const LIE_SAID: Record<string, string> = { rough: 'into the rough', sand: 'into a bunker', penalty: 'into a penalty area' };

/** The tee shot on a par 4 or 5, when it is recorded and finished off the fairway in a lie the facts line can name. */
function teeMissOf(h: ChReviewHole): { lie: string; side: string | null } | null {
  if (h.par == null || h.par < 4) return null;
  const tee = h.shots.find((s) => s.n === 1 && s.kind === 'Tee');
  if (!tee) return null;
  const lie = tee.penalty ? 'penalty' : tee.lie;
  if (!LIE_SAID[lie]) return null;
  const side = tee.miss?.match(/\b(left|right)\b/)?.[1] ?? null;
  return { lie, side };
}

/**
 * The round's counted facts in one line: the holes at double bogey or worse, and, when every one of them (two or more) began with
 * a tee shot into the same trouble, that, as a count of this round. With no double, the three-putts; with neither, that it had none.
 * Null without holes scored.
 */
export function roundFacts(holes: readonly ChReviewHole[]): string | null {
  const scored = holes.filter((h) => h.score != null && h.par != null);
  if (scored.length === 0) return null;
  const doubles = scored.filter((h) => (h.score as number) - (h.par as number) >= 2).map((h) => h.n);
  if (doubles.length > 0) {
    const head = `${countWord(doubles.length)} ${doubles.length === 1 ? 'double bogey or worse' : 'doubles or worse'} (${doubles.length === 1 ? `hole ${doubles[0]}` : `holes ${holeList(doubles)}`})`;
    if (doubles.length < 2) return `${head}.`;
    const misses = doubles.map((n) => teeMissOf(scored.find((h) => h.n === n) as ChReviewHole));
    const first = misses[0];
    const same = first && misses.every((m) => m && m.lie === first.lie);
    if (!same || !first) return `${head}.`;
    const side = misses.every((m) => m?.side === first.side) ? first.side : null;
    const who = doubles.length === 2 ? 'both' : `all ${countWord(doubles.length).toLowerCase()}`;
    return `${head}; ${who} came after a tee shot ${side ? `${side} ` : ''}${LIE_SAID[first.lie]}.`;
  }
  const withPutts = scored.filter((h) => h.putts != null);
  if (withPutts.length === 0) return 'No doubles or worse.';
  const threes = withPutts.filter((h) => (h.putts as number) >= 3).map((h) => h.n);
  if (threes.length === 0) return 'No doubles or worse and no three-putts.';
  return `No doubles or worse; ${threes.length === 1 ? `a three-putt on hole ${threes[0]}` : `three-putts on holes ${holeList(threes)}`}.`;
}

/** This round's value of the read's measure, said beside the read's own; only measures one round's card can say. */
function roundValueOf(metric: string, holes: readonly ChReviewHole[]): { today: string; value: number; read: (v: number) => string } | null {
  const scored = holes.filter((h) => h.score != null && h.par != null);
  const par = metric.match(/^scoring_par_([345])$/);
  if (par) {
    const p = Number(par[1]);
    const hs = scored.filter((h) => h.par === p);
    if (hs.length === 0) return null;
    const avg = hs.reduce((a, h) => a + (h.score as number), 0) / hs.length;
    return { today: `Par ${p}s today: ${fix1(avg)} a hole`, value: avg, read: (v) => `${fix1(v)} in the read` };
  }
  if (metric === 'penalty_rate_per_round') {
    if (scored.length === 0) return null;
    const n = scored.reduce((a, h) => a + h.penalties, 0);
    return { today: `Penalty strokes today: ${n}`, value: n, read: (v) => `${fix1(v)} a round in the read` };
  }
  if (metric === 'big_number_rate') {
    if (scored.length === 0) return null;
    const n = scored.filter((h) => (h.score as number) - (h.par as number) >= 2).length;
    const pct = (n / scored.length) * 100;
    return { today: `Doubles or worse today: ${n} of ${scored.length} holes (${Math.round(pct)}%)`, value: pct, read: (v) => `${Math.round(v)}% in the read` };
  }
  return null;
}

/** Lower is better for every measure `roundValueOf` reads. */
export function readChange(read: ChDebriefReadInput, holes: readonly ChReviewHole[]): string | null {
  if (!read.metric || read.yourValue == null) return null;
  const v = roundValueOf(read.metric, holes);
  if (!v) return null;
  const d = v.value - read.yourValue;
  const way = Math.abs(d) < 0.05 ? 'This round leaves it where it was.' : d < 0 ? 'This round moves it the right way; one round does not decide it.' : 'This round moves it the wrong way; one round does not decide it.';
  return `${v.today}, against ${v.read(read.yourValue)}. ${way}`;
}

function nextOf(n: ChDebriefNextInput | null): string | null {
  if (n?.drill?.title.trim()) return [n.drill.title.trim(), n.drill.minutes ? `${n.drill.minutes} min` : null].filter(Boolean).join(' · ');
  return n?.focus?.trim() || null;
}

/** The debrief, or null when it has nothing to say (the review then keeps its recap block). */
export function buildDebrief(r: ChRoundReview, inputs: ChDebriefInputs): ChDebrief | null {
  const holes = r.holesError ? [] : r.holes;
  const d: ChDebrief = {
    moved: movedNumber(r, inputs.history),
    read: inputs.read ? { id: inputs.read.id, title: inputs.read.title, change: readChange(inputs.read, holes) } : null,
    facts: roundFacts(holes),
    next: nextOf(inputs.next),
  };
  return d.moved || d.read || d.facts || d.next ? d : null;
}
