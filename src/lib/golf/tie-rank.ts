/**
 * Competition ranking with shared positions ("1, T2, T2, 4") for leaderboards
 * whose values print at a fixed precision (NUMC-05). Two players whose values
 * round to the same printed number share a position and both show "T".
 *
 * Pure. The caller sorts first; this only labels the order it is given.
 */

export interface RankLabel {
  /** 1-based competition rank. */
  rank: number;
  /** True when another entry shares this rank. */
  tied: boolean;
  /** "1", "T2". */
  label: string;
}

export function competitionRankLabels(sortedValues: readonly number[], decimals = 1): RankLabel[] {
  const f = 10 ** decimals;
  const keys = sortedValues.map((v) => Math.round(v * f));
  const ranks: number[] = [];
  keys.forEach((k, i) => {
    ranks.push(i > 0 && keys[i - 1] === k ? ranks[i - 1]! : i + 1);
  });
  return ranks.map((rank, i) => {
    const tied = keys.some((k, j) => j !== i && k === keys[i]);
    return { rank, tied, label: tied ? `T${rank}` : String(rank) };
  });
}
