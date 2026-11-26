import type { Breadcrumb } from '@/components/fairway';
import { navEntryForPath } from './admin-nav';

/** Sub-route leaf labels the Breadcrumb trail can't derive from ADMIN_NAV
 *  (dynamic `[id]`/`[fingerprint]` segments render as "Detail" instead of
 *  the raw id/uuid). */
const SUBROUTE_LABELS: Record<string, string> = {
  tracer: 'Tracer',
  'view-as': 'View as',
  // titleCaseSegment would render this "Self Heal"; the product name is one
  // hyphenated word.
  'self-heal': 'Self-heal',
};

/** Dynamic-route segments (uuids, opaque ids) are never surfaced verbatim. */
function isOpaqueIdSegment(segment: string): boolean {
  return /^[0-9a-f-]{8,}$/i.test(segment) || segment.length > 24;
}

/** `ben-leah` → `Ben Leah`, `thread` → `Thread`. Raw URL segments only —
 *  `isOpaqueIdSegment` screens ids out before this is ever reached. */
function titleCaseSegment(segment: string): string {
  return segment
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * The top bar's trail. The tab is the nav entry that owns the path (longest
 * match, `navEntryForPath`), so `/admin/clubhouse/codes/70603` reads
 * "Bridge › Codes › 70603", not "Bridge › Pages › codes › 70603".
 *
 * Each intermediate crumb links to ITS OWN prefix. It used to link every one
 * of them to the full current pathname, so on `/admin/users/<id>/view-as` the
 * "Detail" crumb was a link to the page you were already on instead of back
 * to the user.
 */
export function computeBreadcrumbs(pathname: string): readonly Breadcrumb[] {
  const tab = navEntryForPath(pathname);
  // No nav entry owns this path — today that is /admin/thread/<entity>/<id>,
  // the destination of every entity link in the console (and an explicit
  // detail leaf in nav-covers-every-route.test.ts). The LEAF crumb is also the
  // phone header's standing title and the header's aria-label, so the old
  // single "Bridge" crumb made those routes announce themselves with the
  // Overview tab's own name. Derive the section from the first path segment.
  if (!tab) {
    const first = pathname.split('/').filter(Boolean)[1];
    if (!first || isOpaqueIdSegment(first)) return [{ label: 'Bridge', href: '/admin' }];
    return [
      { label: 'Bridge', href: '/admin' },
      { label: SUBROUTE_LABELS[first] ?? titleCaseSegment(first) },
    ];
  }

  const rest = pathname.slice(tab.href.length).split('/').filter(Boolean);
  const crumbs: Breadcrumb[] = [
    { label: 'Bridge', href: '/admin' },
    { label: tab.label, href: rest.length > 0 ? tab.href : undefined },
  ];
  let prefix: string = tab.href;
  rest.forEach((segment, i) => {
    prefix = `${prefix}/${segment}`;
    const isLast = i === rest.length - 1;
    const readable = decode(segment);
    const label = SUBROUTE_LABELS[segment] ?? (isOpaqueIdSegment(readable) ? 'Detail' : readable);
    crumbs.push({ label, href: isLast ? undefined : prefix });
  });
  return crumbs;
}
