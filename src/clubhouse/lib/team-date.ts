/**
 * One Clubhouse date style (P015 D4), "Friday 6 November", on the team's clock wherever a team is known: Home's hero and the welcome say
 * the same day (HOME-S10). Without a zone (no team yet, or its read failed) it is the viewer's own clock.
 */
export function teamDateLabel(now: Date, tz?: string | null): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', ...(tz ? { timeZone: tz } : {}) }).format(now);
}
