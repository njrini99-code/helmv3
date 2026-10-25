import { plural } from '../lib/plural';
/*
 * P-7 4.2.7: two rounds at one course, hole by hole. Pure: no Supabase, no React.
 */


export interface ChCompareCard {
  id: string;
  /** yyyy-mm-dd. */
  date: string;
  score: number;
  /** Strokes on holes 1..18. */
  scores: number[];
  pars: number[];
}

export interface ChCompareResult {
  /** Running to par after each hole, for each round. */
  cumA: number[];
  cumB: number[];
  /** Per hole: which round was better there (a lower score), or level. */
  cells: Array<{ n: number; a: number; b: number; better: 'a' | 'b' | 'level' }>;
  /** "Oct 3 was 6 shots worse · most on 13 to 15 (+4)". */
  summary: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
const shortDate = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
const cum = (c: ChCompareCard) => {
  let t = 0;
  return c.scores.map((s, i) => (t += s - c.pars[i]!));
};

/** `a` against `b`: the cells, both arcs, and where the difference came from (the three holes in a row that moved it most). */
export function compareRounds(a: ChCompareCard, b: ChCompareCard): ChCompareResult {
  const cells = a.scores.map((s, i) => ({ n: i + 1, a: s, b: b.scores[i]!, better: s < b.scores[i]! ? ('a' as const) : s > b.scores[i]! ? ('b' as const) : ('level' as const) }));
  const diff = a.scores.map((s, i) => s - b.scores[i]!);
  const total = diff.reduce((x, d) => x + d, 0);
  const da = shortDate(a.date);
  let summary: string;
  if (total === 0) summary = `${da} and ${shortDate(b.date)} were level`;
  else {
    const worse = total > 0;
    // The stretch that moved it most in the direction of the total.
    let best: { from: number; sum: number } | null = null;
    for (let from = 1; from <= 16; from++) {
      const sum = diff[from - 1]! + diff[from]! + diff[from + 1]!;
      if (Math.sign(sum) === Math.sign(total) && (!best || Math.abs(sum) > Math.abs(best.sum))) best = { from, sum };
    }
    const shots = Math.abs(total);
    summary = `${da} was ${plural(shots, 'shot')} ${worse ? 'worse' : 'better'}`;
    if (best) summary += ` · most on ${best.from} to ${best.from + 2} (${best.sum > 0 ? '+' : '−'}${Math.abs(best.sum)})`;
  }
  return { cumA: cum(a), cumB: cum(b), cells, summary };
}
