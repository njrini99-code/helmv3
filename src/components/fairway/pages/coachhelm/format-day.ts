/**
 * `YYYY-MM-DD` (or any ISO string; only the date part is read) to "Aug 31",
 * pinned to UTC so the server and the client format the same day. Shared by
 * the development stage, the ladder rows and the goal rows.
 */
export function formatDay(day: string): string {
  const d = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
