import type { ChRound } from './season';
import { mean, type summarizePlayer } from './season';
import { recordedPutts } from './round-scope';
import type { ChRoundCache } from './stats-common';

/**
 * The four parts of the game as rates and a per-round figure over a window of rounds (Player Home's legs, and the
 * stat line of Coach Home's "The team's game"). Pure, and a leaf module: Player Home and Coach Home both read it, and
 * Coach Home's loader cannot import Player Home's without a cycle. `data/player-home.ts` re-exports it.
 */

/** Points in a leg's spark line. */
export const LEG_TREND = 7;
export type ChLegKey = 'tee' | 'approach' | 'short' | 'putting';

export interface ChPlayerLeg {
  key: ChLegKey;
  /** "Off the tee" */
  label: string;
  /** "Fairways hit" */
  stat: string;
  /** Over the last LEG_WINDOW rounds; null with nothing logged. */
  value: number | null;
  unit: '%' | '';
  digits: number;
  lowerIsBetter: boolean;
  /** Strokes gained per round in this leg (three or more rounds with it); null otherwise. */
  sg: number | null;
  /** The Tour's average for the stat where golf_pga_standards has one; null draws no mark. */
  bench: number | null;
  /** Oldest to newest, one value per round, up to seven. */
  trend: number[];
  /** One plain line from the same rounds, or null. */
  note: string | null;
}

export const LEG_LABELS: Record<ChLegKey, [string, string]> = {
  tee: ['Off the tee', 'Fairways hit'],
  approach: ['Approach', 'Greens in regulation'],
  short: ['Short game', 'Scrambling'],
  putting: ['Putting', 'Putts per round'],
};

type Pick = { made: number; total: number } | null;

/** The four parts of the game over the window: a weighted rate (never a mean of percentages), a per-round trend, and one line. */
export function legRows(window: ChRound[], cache: Map<string, ChRoundCache>, bench: Map<string, number> | null, sg: ReturnType<typeof summarizePlayer>['sgLegs']): ChPlayerLeg[] {
  const oldestFirst = [...window].reverse();
  const rateOf = (pick: (r: ChRound) => Pick) => {
    let made = 0;
    let total = 0;
    for (const r of window) {
      const p = pick(r);
      if (p && p.total > 0) {
        made += p.made;
        total += p.total;
      }
    }
    return { value: total ? (made / total) * 100 : null, made, total };
  };
  const trendOf = (pick: (r: ChRound) => Pick) =>
    oldestFirst
      .map(pick)
      .filter((p): p is { made: number; total: number } => !!p && p.total > 0)
      .map((p) => (p.made / p.total) * 100)
      .slice(-LEG_TREND);
  const fairways = (r: ChRound): Pick => {
    const c = cache.get(r.id);
    if (r.total_fairways_hit != null && r.total_fairways) return { made: r.total_fairways_hit, total: r.total_fairways };
    return c?.fairways_hit != null && c.fairways_total ? { made: c.fairways_hit, total: c.fairways_total } : null;
  };
  const greens = (r: ChRound): Pick => (r.total_gir != null && r.total_gir_possible ? { made: r.total_gir, total: r.total_gir_possible } : null);
  const scrambles = (r: ChRound): Pick => {
    const c = cache.get(r.id);
    return c?.scrambles_converted != null && c.scramble_attempts ? { made: c.scrambles_converted, total: c.scramble_attempts } : null;
  };
  const n = window.length;
  const tee = rateOf(fairways);
  const gir = rateOf(greens);
  const scr = rateOf(scrambles);
  // Putts as Stats counts them: a round written 0 putts has none recorded (recordedPutts, the cache's `cachedPutts` rule).
  const putts = window.map((r) => recordedPutts(r.total_putts)).filter((v): v is number => v != null);
  const threes = window.map((r) => cache.get(r.id)?.three_putts).filter((v): v is number => typeof v === 'number');
  const sand = window.reduce(
    (a, r) => {
      const c = cache.get(r.id);
      return c?.sand_attempts && c.sand_saves != null ? { saves: a.saves + c.sand_saves, att: a.att + c.sand_attempts } : a;
    },
    { saves: 0, att: 0 },
  );
  const rounds = (k: number) => `${k} ${k === 1 ? 'round' : 'rounds'}`;
  const row = (key: ChLegKey, value: number | null, unit: '%' | '', digits: number, lowerIsBetter: boolean, legSg: number | null, benchValue: number | null, trend: number[], note: string | null): ChPlayerLeg => ({
    key,
    label: LEG_LABELS[key][0],
    stat: LEG_LABELS[key][1],
    value,
    unit,
    digits,
    lowerIsBetter,
    sg: legSg,
    bench: benchValue,
    trend,
    note,
  });
  return [
    row('tee', tee.value, '%', 0, false, sg.tee, bench?.get('fairway_pct') ?? null, trendOf(fairways), tee.total ? `${tee.made} of ${tee.total} fairways in the last ${rounds(n)}` : null),
    row('approach', gir.value, '%', 0, false, sg.approach, bench?.get('gir_pct') ?? null, trendOf(greens), gir.total ? `${gir.made} of ${gir.total} greens in the last ${rounds(n)}` : null),
    row(
      'short',
      scr.value,
      '%',
      0,
      false,
      sg.around,
      bench?.get('scrambling_pct') ?? null,
      trendOf(scrambles),
      scr.total ? [`Up and down ${scr.made} of ${scr.total}`, sand.att ? `sand saves ${sand.saves} of ${sand.att}` : null].filter(Boolean).join(' · ') : null,
    ),
    row(
      'putting',
      mean(putts),
      '',
      1,
      true,
      sg.putting,
      bench?.get('putts_per_round') ?? null,
      window
        .map((r) => recordedPutts(r.total_putts))
        .filter((v): v is number => v != null)
        .reverse()
        .slice(-LEG_TREND),
      threes.length ? `${(threes.reduce((a, b) => a + b, 0) / threes.length).toFixed(1)} three-putts a round` : null,
    ),
  ];
}

