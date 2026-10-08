/**
 * Pure relative-time + full-date formatting for the notifications feed.
 * Mirrors FairwayWhatsNew's timeAgo/fullDateTime pattern (coarse buckets,
 * locale-aware full date for the <time> title/aria-label).
 */

/**
 * Fixed locale + zone for every absolute date here. This feed is rendered in
 * the server HTML (PERF-03 seeding), and `toLocale*String(undefined, ...)` uses
 * the runtime's locale and zone — UTC on Vercel, the phone's zone in the
 * hydrating client — so the two printed different days for any item 7+ days old
 * (React #418 on /golf/dashboard, 31 rows 2026-10-01..06). Every production
 * team is America/New_York (see the golf timezone helper).
 */
const FEED_LOCALE = 'en-US';
const FEED_TIME_ZONE = 'America/New_York';

export function relativeTimeFrom(iso: string, nowMs: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const secs = Math.max(0, Math.round((nowMs - t) / 1000));
  if (secs < 45) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(t).toLocaleDateString(FEED_LOCALE, { month: 'short', day: 'numeric', timeZone: FEED_TIME_ZONE });
}

export function fullDateTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t).toLocaleString(FEED_LOCALE, {
    timeZone: FEED_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
