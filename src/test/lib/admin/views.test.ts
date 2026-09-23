/**
 * The `?view=` contract, pinned.
 *
 * `src/lib/admin/views.ts` states three rules in prose. Prose does not fail a
 * build. Each rule below has a real regression behind it — a default view that
 * emitted `?view=production` would give every consolidated tab two canonical
 * URLs (breaking `activeMatch` and every bookmark), an unknown view that threw
 * would turn a stale link into a 500, and a switch that dropped the other
 * params is precisely what makes a segmented control feel lossy.
 */
import { describe, it, expect } from 'vitest';
import {
  ADMIN_VIEWS,
  defaultView,
  hrefForView,
  hrefWithView,
  isViewHost,
  parseView,
  parseViewFrom,
  USER_DETAIL_VIEWS,
  type AdminViewHost,
} from '@/lib/admin/views';

const HOSTS = Object.keys(ADMIN_VIEWS) as AdminViewHost[];

describe('admin view vocabulary', () => {
  it('registers at least two views per host (a one-view host needs no rail)', () => {
    for (const host of HOSTS) {
      expect(ADMIN_VIEWS[host].length, `${host} has fewer than two views`).toBeGreaterThan(1);
    }
  });

  it('view keys are unique within a host and URL-safe', () => {
    for (const host of HOSTS) {
      const views = ADMIN_VIEWS[host] as readonly string[];
      expect(new Set(views).size, `${host} repeats a view key`).toBe(views.length);
      for (const view of views) expect(view).toMatch(/^[a-z][a-z-]*$/);
    }
  });

  it('every host key is a real /admin pathname', () => {
    for (const host of HOSTS) {
      expect(host.startsWith('/admin/')).toBe(true);
      expect(isViewHost(host)).toBe(true);
    }
    expect(isViewHost('/admin/nope')).toBe(false);
  });
});

describe('RULE 1 — the default view emits no param', () => {
  it('hrefForView(default) is the bare pathname', () => {
    for (const host of HOSTS) {
      expect(hrefForView(host, defaultView(host))).toBe(host);
    }
  });

  it('a non-default view does emit the param', () => {
    for (const host of HOSTS) {
      for (const view of (ADMIN_VIEWS[host] as readonly string[]).slice(1)) {
        expect(hrefForView(host, view as never)).toBe(`${host}?view=${view}`);
      }
    }
  });

  it('a passed-through view param is never duplicated', () => {
    const href = hrefForView('/admin/golf', 'journey', { view: 'production' });
    expect(href).toBe('/admin/golf?view=journey');
    expect(href.match(/view=/g)).toHaveLength(1);
  });
});

describe('RULE 2 — an unknown view falls back, never throws', () => {
  it('unknown, empty, missing and array values all resolve to the default', () => {
    for (const host of HOSTS) {
      const fallback = defaultView(host);
      expect(parseView(host, 'not-a-view')).toBe(fallback);
      expect(parseView(host, '')).toBe(fallback);
      expect(parseView(host, undefined)).toBe(fallback);
      expect(parseView(host, [])).toBe(fallback);
      // A duplicated ?view= key arrives as an array; the first value wins.
      expect(parseView(host, ['nope', fallback])).toBe(fallback);
    }
  });

  it('a registered view round-trips through parse', () => {
    for (const host of HOSTS) {
      for (const view of ADMIN_VIEWS[host] as readonly string[]) {
        expect(parseView(host, view)).toBe(view);
        expect(parseView(host, [view])).toBe(view);
      }
    }
  });
});

describe('RULE 3 — every other query param survives a view switch', () => {
  it('keeps unrelated params, including repeated keys', () => {
    const href = hrefForView('/admin/errors', 'sources', {
      window: '24h',
      sport: ['golf', 'baseball'],
      view: 'list',
      dropped: undefined,
    });
    const url = new URL(href, 'https://example.test');
    expect(url.pathname).toBe('/admin/errors');
    expect(url.searchParams.get('window')).toBe('24h');
    expect(url.searchParams.getAll('sport')).toEqual(['golf', 'baseball']);
    expect(url.searchParams.get('view')).toBe('sources');
    expect(url.searchParams.has('dropped')).toBe(false);
  });

  it('switching back to the default keeps the other params and drops only view', () => {
    const href = hrefForView('/admin/teams', 'pulse', { sort: 'most-errors', view: 'ekg' });
    expect(href).toBe('/admin/teams?sort=most-errors');
  });
});

describe('dynamic-route helpers', () => {
  it('parseViewFrom mirrors parseView', () => {
    expect(parseViewFrom(USER_DETAIL_VIEWS, 'journey')).toBe('journey');
    expect(parseViewFrom(USER_DETAIL_VIEWS, 'bogus')).toBe('overview');
    expect(parseViewFrom(USER_DETAIL_VIEWS, undefined)).toBe('overview');
  });

  it('hrefWithView obeys rules 1 and 3 on a resolved dynamic path', () => {
    expect(hrefWithView('/admin/users/abc', 'overview', USER_DETAIL_VIEWS)).toBe('/admin/users/abc');
    expect(hrefWithView('/admin/users/abc', 'journey', USER_DETAIL_VIEWS, { tab: 'sessions' })).toBe(
      '/admin/users/abc?tab=sessions&view=journey',
    );
  });
});
