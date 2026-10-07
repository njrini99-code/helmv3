/**
 * Team sparkline built from each player's own recent rounds.
 *
 * The coach dashboard's KPI sparklines (and the delta chip computed from the
 * same series) used to take the team's latest 5 rounds, whoever played them.
 * Point to point, that compared different players — one 68 then one 81 read
 * as a 13-stroke collapse — so the chip swung with who happened to post last.
 *
 * Here point k (k = 0 newest) is the mean of every eligible player's k-th most
 * recent value, so each step compares players with themselves. A player needs
 * at least `minPerPlayer` values to be eligible (the dashboard's trend gate is
 * 3 points), which keeps one-round players from moving the line.
 */
export interface PlayerSeriesRound {
  player_id: string;
  value: number | null;
}

/**
 * @param rounds newest-first rounds for the whole team
 * @returns up to `count` points, oldest → newest (the sparkline contract)
 */
export function buildPerPlayerSparkline(
  rounds: readonly PlayerSeriesRound[],
  count = 5,
  minPerPlayer = 3,
): number[] {
  const byPlayer = new Map<string, number[]>();
  for (const r of rounds) {
    if (r.value == null || !Number.isFinite(r.value)) continue;
    const arr = byPlayer.get(r.player_id);
    if (arr) arr.push(r.value);
    else byPlayer.set(r.player_id, [r.value]);
  }
  const eligible = [...byPlayer.values()].filter((v) => v.length >= minPerPlayer);
  if (eligible.length === 0) return [];

  const points: number[] = [];
  for (let k = 0; k < count; k++) {
    const kth = eligible.filter((v) => v.length > k).map((v) => v[k]!);
    if (kth.length === 0) break;
    points.push(Number((kth.reduce((a, b) => a + b, 0) / kth.length).toFixed(1)));
  }
  return points.reverse();
}
