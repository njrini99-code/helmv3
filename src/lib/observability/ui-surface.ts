import * as Sentry from '@sentry/nextjs';

/**
 * Which product UI an error was raised under, for the Bridge's Clubhouse-only views (owner, 2026-11-17: "Bridge
 * should just be clubhouse only").
 *
 * Clubhouse is the only GolfHelm coach and player UI since Fairway was retired (2026-11-14), so an error raised while
 * serving a golf coach or player is a Clubhouse error. Three writers record it as `ui: 'clubhouse'`:
 *  - the browser, through `chReport` (src/clubhouse/lib/track.ts) and, for any other client report from a Clubhouse
 *    page, the /api/log-error route (`uiSurfaceForPath` on the reported route);
 *  - a server read, through `chLogServer` (explicit tag) or, for every other server log, `ambientUiSurface()` below,
 *    which `server-error-logger` consults when the caller passed no `ui` tag;
 *  - Next's `onRequestError` hook (src/instrumentation.ts), from the failed request's own path;
 *  - background golf work (a cron, the job queue, a webhook, or work left running after its request), through
 *    `ambientIsBackgroundWork()` below: server-error-logger tags a golf warning or error from there, because the person
 *    it failed for is a golf coach or player. Before this, the same push failure was tagged when it ran inside a
 *    Clubhouse request and hidden from the Bridge when the queue ran it.
 *
 * Telemetry only: nothing here decides what a person sees, and every function answers null rather than throw.
 */

export const CLUBHOUSE_UI = 'clubhouse' as const;
export type UiSurface = typeof CLUBHOUSE_UI;

function pathnameOf(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  try {
    // A full URL (Sentry's normalizedRequest.url, a Referer) or a bare path both work; the base only fills a path in.
    return new URL(value, 'http://bridge.invalid').pathname;
  } catch {
    return null;
  }
}

/**
 * Whether a page address is drawn by Clubhouse. Every address under /golf is (the dashboard, the entrance pages,
 * onboarding, joining a team, a staff invitation, and /golf itself, which only routes into them), except the golf
 * admin pages under /golf/admin. The preview app (/clubhouse-preview) is not linked from the product and is left out.
 */
export function isClubhousePath(value: string | null | undefined): boolean {
  const path = pathnameOf(value);
  if (!path) return false;
  if (path !== '/golf' && !path.startsWith('/golf/')) return false;
  return !(path === '/golf/admin' || path.startsWith('/golf/admin/'));
}

/** `isClubhousePath` as a tag value: 'clubhouse' or null. */
export function uiSurfaceForPath(value: string | null | undefined): UiSurface | null {
  return isClubhousePath(value) ? CLUBHOUSE_UI : null;
}

/**
 * The UI a request was serving, from its own address and, for an API route, the page that called it.
 *
 * A server action posts to the page it was called from, so the request path is the Clubhouse page. An API route
 * (CoachHelm's chat stream, an upload) has its own /api address; the Referer the browser sends names the page that
 * fetched it. The Referer is read for /api requests only, so an admin page opened from a Clubhouse tab is not tagged.
 * A cron or a webhook has no Clubhouse Referer and stays untagged.
 */
export function uiSurfaceForRequest(request: {
  url?: string | null;
  referer?: string | string[] | null;
}): UiSurface | null {
  const path = pathnameOf(request.url ?? null);
  if (path && isClubhousePath(path)) return CLUBHOUSE_UI;
  if (path && (path === '/api' || path.startsWith('/api/'))) {
    const referer = Array.isArray(request.referer) ? request.referer[0] : request.referer;
    return uiSurfaceForPath(referer ?? null);
  }
  return null;
}

interface IsolationScopeDataLike {
  tags?: Record<string, unknown>;
  sdkProcessingMetadata?: {
    normalizedRequest?: { url?: string; headers?: Record<string, string | string[] | undefined> };
  };
}

/**
 * The current request's UI, read from Sentry's isolation scope: the `ui` tag `tagClubhouseRequest` (src/clubhouse/
 * gate.ts) sets on every Clubhouse render, else the request Sentry recorded for this isolation scope (its address and
 * Referer, through `uiSurfaceForRequest`). An in-memory read: no I/O, and null outside a request or on any failure
 * (a partial Sentry mock in a test included).
 */
export function ambientUiSurface(): UiSurface | null {
  try {
    const data = Sentry.getIsolationScope().getScopeData() as IsolationScopeDataLike;
    if (data.tags?.ui === CLUBHOUSE_UI) return CLUBHOUSE_UI;
    const request = data.sdkProcessingMetadata?.normalizedRequest;
    if (!request) return null;
    return uiSurfaceForRequest({ url: request.url ?? null, referer: request.headers?.referer ?? null });
  } catch {
    return null;
  }
}

/** Routes that serve no page a person has open: scheduled jobs, the job queue and inbound webhooks. */
const BACKGROUND_ROUTE_PREFIXES = ['/api/cron', '/api/jobs', '/api/webhooks'] as const;

/**
 * Whether the code logging right now serves no page: no request is recorded for this isolation scope (a job, work that
 * outlived its request), or the request is a cron, queue or webhook route. A page or an admin request answers false,
 * and so does any failure to read the scope, so a partial Sentry mock never tags anything.
 */
export function ambientIsBackgroundWork(): boolean {
  try {
    const data = Sentry.getIsolationScope().getScopeData() as IsolationScopeDataLike;
    const path = pathnameOf(data.sdkProcessingMetadata?.normalizedRequest?.url ?? null);
    if (!path) return true;
    return BACKGROUND_ROUTE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  } catch {
    return false;
  }
}
