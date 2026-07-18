/**
 * Bug #949 #6 — the "Rounds this week" KpiTile used to pass an unconditional
 * `delta={roundsThisWeek - roundsLastWeek}` alongside a `trendData` series
 * that can genuinely be shorter than 2 points (a new team's first week live,
 * or any week `roundsByWeek`'s 12-week window hasn't filled yet). StatTile's
 * own sparkline only renders once its trend series has 2+ finite points, but
 * `delta` had no matching gate — so the TrendChip arrow rendered ALONE, with
 * no sparkline beneath it, whenever the week-history was thin. Gating the
 * delta on the SAME 2-point floor keeps the arrow and its sparkline paired:
 * neither renders without the other.
 *
 * Lives outside page.tsx: the admin-gate coverage tripwire requires every
 * export of a page/layout/actions file to reach the gate, and this is a pure
 * presentation helper.
 */
export function honestRoundsDelta(
  roundsByWeek: ReadonlyArray<unknown>,
  roundsThisWeek: number,
  roundsLastWeek: number,
): number | undefined {
  return roundsByWeek.length >= 2 ? roundsThisWeek - roundsLastWeek : undefined;
}
