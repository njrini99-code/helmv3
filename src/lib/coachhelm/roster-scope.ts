/**
 * Keep only rows that belong to the current active roster (audit row 5).
 * Team-scoped insight rows outlive a player's roster membership; an action
 * queue must not show them. Rows with no player (team roll-ups) are kept.
 */
export function rosterScopedRows<T extends { player_id: string | null }>(
  rows: readonly T[],
  rosterPlayerIds: readonly string[],
): T[] {
  const roster = new Set(rosterPlayerIds);
  return rows.filter((row) => !row.player_id || roster.has(row.player_id));
}
