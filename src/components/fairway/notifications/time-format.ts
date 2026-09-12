/**
 * Pure relative-time + full-date formatting for the notifications feed.
 * Mirrors FairwayWhatsNew's timeAgo/fullDateTime pattern (coarse buckets,
 * locale-aware full date for the <time> title/aria-label).
 */

/**
 * `nowMs` is REQUIRED — no `Date.now()` default. "3m ago" vs "just now" is
 * wall-clock-dependent, so a caller reading the real clock directly here
 * could render one label on the server and a different one on the client's
 * first paint (React #418). Every call site owns a mount-gated `now` and
 * passes it explicitly; there is no safe internal fallback to default to.
 */
export function relativeTimeFrom(iso: string, nowMs: number): string {
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
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/**
 * Explicit `en-US` + `timeZone: 'UTC'` (with the zone spelled out via
 * `timeZoneName`) rather than the runtime's ambient locale/zone: an implicit
 * locale/zone renders differently on the server than on the client and is a
 * confirmed prior production #418 incident (see FairwayWhatsNew). This
 * component tree has no team timezone available, so UTC is the explicit,
 * deterministic fallback — labelled, not silently substituted for local time.
 */
export function fullDateTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}
