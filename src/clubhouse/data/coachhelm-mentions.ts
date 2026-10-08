import { ALL_METRIC_SPECS } from '@/lib/coachhelm/v3/chat/metrics-catalog';

/**
 * What the Ask composer's `@` picker offers beside the roster (Clubhouse P013, CH-13821): the stats CoachHelm can read.
 *
 * The list is the agent's own closed metric catalog (`metrics-catalog.ts`), so a stat the coach can mention is one the
 * model can measure; nothing is fetched for it. A pick puts `@Greens in regulation` into the text, where the coach
 * reads it, the same as a player's name: the model gets the words, never an id.
 */

export interface ChAskStat {
  id: string;
  label: string;
}

/** The catalog's metrics in its own order (scoring, strokes gained, ball striking, short game, putting, penalties). */
export const ASK_STATS: readonly ChAskStat[] = ALL_METRIC_SPECS.map((s) => ({ id: s.id, label: s.label }));

/** The parts of a metric id a coach might type (`gir`, `sg`, `putts`), without the unit suffixes every rate shares. */
function idWords(id: string): string[] {
  return id.split('_').filter((w) => w !== 'pct' && w.length > 1);
}

/**
 * Stats matching the `@fragment`, none already mentioned, in catalog order. A match is a label containing the fragment
 * or a word of the metric id starting with it, so `@gir` finds Greens in regulation and `@sg` the strokes gained rows.
 */
export function matchStats(stats: readonly ChAskStat[], query: string, mentioned: string): ChAskStat[] {
  const q = query.trim().toLowerCase();
  return stats
    .filter((s) => !mentioned.includes(`@${s.label}`))
    .filter((s) => !q || s.label.toLowerCase().includes(q) || idWords(s.id).some((w) => w.startsWith(q)));
}
