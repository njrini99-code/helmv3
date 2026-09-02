/**
 * Seed/demo `golf_teams` rows that ship with real-looking roster data.
 *
 * `golf_teams` has no `is_demo`/demo flag column (checked against
 * `src/lib/types/database.ts` before writing this file), so these two are
 * matched by id, not by a `name ILIKE '%demo%'` filter — a name-substring
 * match risks a false positive against a real program whose name happens to
 * contain "demo". Verified live in production 2026-08-21:
 *
 *   select id, name from golf_teams where name ilike '%demo%';
 *   -- returned exactly these two rows and no others; both share the same
 *   -- created_at timestamp, confirming a single seed-script origin.
 *
 * Used to exclude these two teams from platform totals + activation KPIs
 * (audit finding F2, 2026-08-20) while keeping them visible-but-flagged on
 * the People tab so the owner can still see they exist.
 */
export const DEMO_TEAM_IDS: ReadonlySet<string> = new Set([
  '6ecdd1a6-63fe-4beb-b094-00118f334163', // Demo University Golf
  '8a162bfc-c98f-923b-e847-d80d7803acb2', // Demo University Golf (Pat)
]);

export function isDemoTeamId(teamId: string): boolean {
  return DEMO_TEAM_IDS.has(teamId);
}
