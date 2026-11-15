/**
 * The `prefetch` a nav link takes: off for the page already on screen, Next's default for every other.
 *
 * MAC-12 (production audit 2026-11-15: "each screen requests its own URL twice"). Next prefetches every `<Link>` that comes
 * within 200px of the viewport, with no exception for the current address (next 16.4, client/components/links.js). The
 * page a document load renders is not in Next's segment cache (a dynamic page's payload is not written there), so the
 * prefetch of a link to it asks the server for the page again: its head at least (segment-cache/scheduler.js,
 * `pingRouteTreeAndIncludeDynamicData` on `route.root.head`). The sidebar's current item and the section strip's current
 * pill (always in the document, shut just above the top bar) are such links on every top-level screen. A tap on either
 * never needs a prefetch (a retap pops or scrolls to the top), so nothing is lost. Read from the code, not yet confirmed
 * in a network panel: a phone pass should show one request for the page's own address after this.
 */
export function navLinkPrefetch(href: string, pathname: string, search = ''): false | undefined {
  const bare = href.split('#')[0] ?? '';
  const [path = '', query] = bare.split('?');
  const norm = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p);
  if (norm(path) !== norm(pathname)) return undefined;
  if (query === undefined) return false;
  return query === search.replace(/^\?/, '') ? false : undefined;
}
