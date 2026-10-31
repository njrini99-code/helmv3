/**
 * The season a calendar date falls in: 1 August of its year from August on, else of the year before. String arithmetic on
 * a YYYY-MM-DD date with no zone, because a round date is already a calendar date (P-7 4.2.4). The season that is turning
 * now needs the team's zone and comes from `seasonStartDate(now, zone)` in `data/season.ts`.
 */
export function seasonStartOfDay(date: string): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return `${month >= 8 ? year : year - 1}-08-01`;
}

/**
 * A season's label from any date in it: "2026–27" for every date from 1 Aug 2026 to 31 Jul 2027, with an en dash and
 * two digits of the second year. The one format for a season everywhere in Clubhouse (F-0002): the season shown now is
 * `currentSeasonLabel(now, zone)` in `data/season.ts`.
 */
export function seasonLabelOf(date: string): string {
  const start = Number(seasonStartOfDay(date).slice(0, 4));
  return `${start}–${String((start + 1) % 100).padStart(2, '0')}`;
}
