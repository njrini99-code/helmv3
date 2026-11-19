/**
 * A promise rejected with a `<link rel="stylesheet">`'s own `error` Event, and the sheet's address.
 *
 * React keeps a promise on every stylesheet link it inserts (react-dom `acquireResource`: `onload = resolve, onerror =
 * reject`) and only awaits it when a later render waits on that sheet. A sheet that fails, or whose load the browser
 * cancels, so rejects with nothing to catch it: the console's "Unhandled Promise Rejection: [object Event]" (audit
 * 2026-11-19, coach Home, two tabs tapped 80 ms apart; WebKit cancels a sheet still loading when the page goes away).
 * The global handler (error-logging.ts) names it instead: a stylesheet that did not load, with its address. Anything
 * else, an Event from an image or a script included, is not this and goes on as before.
 */
export function stylesheetLoadFailureHref(reason: unknown): string | null {
  if (typeof Event === 'undefined' || typeof HTMLLinkElement === 'undefined') return null;
  if (!(reason instanceof Event) || reason.type !== 'error') return null;
  const link = reason.target;
  if (!(link instanceof HTMLLinkElement)) return null;
  if (!link.relList.contains('stylesheet')) return null;
  return link.href || link.getAttribute('href') || '';
}
