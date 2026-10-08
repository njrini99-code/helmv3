/**
 * Anchored URL patterns for distributed-tracing header propagation.
 *
 * Sentry matches a string target anywhere in a URL and Datadog matches a
 * string as a prefix, so a bare 'localhost' or 'https://project.supabase.co'
 * would also match look-alike hosts such as
 * https://project.supabase.co.evil.com and send trace headers there. Every
 * target the browser SDKs use is built here as a fully anchored regex.
 */

/** http(s)://localhost or 127.0.0.1, any port, then a path or the end. */
export const LOCALHOST_TRACE_TARGET = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/;

/** Matches exactly this origin and its paths, nothing that merely starts with it. */
export function originPattern(origin: string): RegExp {
  const escaped = origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}(?:/|$)`);
}

/** The anchored pattern for a configured URL's origin, or null when it does not parse. */
export function originPatternFromUrl(url: string | undefined): RegExp | null {
  try {
    return originPattern(new URL(url ?? '').origin);
  } catch {
    return null;
  }
}
