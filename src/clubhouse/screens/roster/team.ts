import type { ChTeammate } from '../../data/roster-player';

export const SORT_HCP = 'hcp' as const;
export type TeamSort = 'name' | 'class' | typeof SORT_HCP;

const lastName = (n: string) => n.split(' ').slice(-1)[0] ?? n;
/** Ascending, with missing values last. */
const nullsLast = (a: number | null, b: number | null) => (a == null ? (b == null ? 0 : 1) : b == null ? -1 : a - b);

/** Name by surname; class with the seniors first; handicap lowest first. Ties fall back to the name. */
export function sortTeammates(list: ChTeammate[], sort: TeamSort): ChTeammate[] {
  const byName = (a: ChTeammate, b: ChTeammate) => lastName(a.name).localeCompare(lastName(b.name)) || a.name.localeCompare(b.name);
  return [...list].sort((a, b) =>
    sort === 'class' ? nullsLast(a.gradYear, b.gradYear) || byName(a, b) : sort === SORT_HCP ? nullsLast(a.handicap, b.handicap) || byName(a, b) : byName(a, b),
  );
}
