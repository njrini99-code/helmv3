/**
 * Redact credentials embedded in a URL before it reaches error_logs,
 * admin_events, or Sentry.
 *
 * Two shapes are in production today:
 *   - path-segment tokens: /api/calendar/(coach|feeds)/<bearer>
 *   - query-string tokens: /api/crm/unsubscribe?c=<id>&t=<hmac>
 * Both are live credentials; both were being persisted verbatim.
 *
 * Pure string transform — no throwing, no allocation on the common path.
 * Returns the input unchanged when nothing matches.
 */
const PATH_TOKEN_ROUTES = /\/api\/calendar\/(coach|feeds)\/[^/?#]+/g;
const QUERY_SECRET_KEYS = /([?&])(t|token|secret|key|sig|signature)=[^&#]*/gi;

export function redactSensitiveUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url
    .replace(PATH_TOKEN_ROUTES, (_m, kind: string) => `/api/calendar/${kind}/[redacted]`)
    .replace(QUERY_SECRET_KEYS, (_m, sep: string, key: string) => `${sep}${key}=[redacted]`);
}
