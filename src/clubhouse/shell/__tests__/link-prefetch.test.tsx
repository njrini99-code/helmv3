import { cleanup, render } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'motion/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * MAC-12 (production audit 2026-11-15): each screen requested its own address twice. Next prefetches every visible
 * `<Link>`, the current address included, and a document load's page is not in its segment cache, so the nav link to
 * the page on screen asked the server for it again. Those links now take `prefetch={false}`; every other keeps Next's
 * default.
 */
const links = vi.hoisted(() => [] as Array<{ href: string; prefetch?: boolean | null }>);
vi.mock('next/link', () => ({
  default: ({ href, prefetch, children, scroll: _scroll, ...rest }: { href: string; prefetch?: boolean | null; scroll?: boolean; children?: ReactNode }) => {
    links.push({ href, prefetch });
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
  useLinkStatus: () => ({ pending: false }),
}));
const router = vi.hoisted(() => ({ push: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/contexts/notification-badge-context', () => ({ useNotificationBadges: () => ({}) }));
vi.mock('../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../use-prefetch-tabs', () => ({ usePrefetchTabs: () => undefined, useIdleRowsAhead: () => undefined }));

import { navLinkPrefetch } from '../link-prefetch';
import { PREVIEW_SHELL } from '../../preview/fixtures';
import { SectionSwitchProvider } from '../section-switch';
import { SectionStrip } from '../SectionStrip';

describe('navLinkPrefetch', () => {
  it('is off for the page on screen, trailing slash or not', () => {
    expect(navLinkPrefetch('/golf/dashboard/stats', '/golf/dashboard/stats')).toBe(false);
    expect(navLinkPrefetch('/golf/dashboard/stats/', '/golf/dashboard/stats')).toBe(false);
    expect(navLinkPrefetch('/golf/dashboard', '/golf/dashboard/')).toBe(false);
  });

  it('is Next’s default for every other page, a deeper one included', () => {
    expect(navLinkPrefetch('/golf/dashboard/calendar', '/golf/dashboard/stats')).toBeUndefined();
    expect(navLinkPrefetch('/golf/dashboard/stats', '/golf/dashboard/stats/team')).toBeUndefined();
    expect(navLinkPrefetch('/golf/dashboard', '/golf/dashboard/stats')).toBeUndefined();
  });

  it('a link with a query is the page on screen only with the same query; a hash never matters', () => {
    expect(navLinkPrefetch('/golf/dashboard/coachhelm?view=ask', '/golf/dashboard/coachhelm', 'view=ask')).toBe(false);
    expect(navLinkPrefetch('/golf/dashboard/coachhelm?view=ask', '/golf/dashboard/coachhelm', '?view=ask')).toBe(false);
    expect(navLinkPrefetch('/golf/dashboard/coachhelm?view=ask', '/golf/dashboard/coachhelm', '')).toBeUndefined();
    expect(navLinkPrefetch('/golf/dashboard/settings#set-help', '/golf/dashboard/settings')).toBe(false);
  });
});

const original = { animate: Element.prototype.animate, getAnimations: Element.prototype.getAnimations };
beforeEach(() => {
  links.length = 0;
  Element.prototype.animate = vi.fn(() => ({ cancel: vi.fn(), onfinish: null, finished: Promise.resolve() }) as unknown as Animation) as never;
  Element.prototype.getAnimations = () => [];
});
afterEach(() => {
  cleanup();
  Element.prototype.animate = original.animate;
  Element.prototype.getAnimations = original.getAnimations;
});

describe('the section strip', () => {
  it('prefetches every section but the one on screen', () => {
    render(
      <LazyMotion features={domAnimation}>
        {/* eslint-disable-next-line jsx-a11y/aria-role -- role is a component prop, not an ARIA role */}
        <SectionSwitchProvider pathname="/golf/dashboard/calendar" role="coach" shell={PREVIEW_SHELL}>
          {/* eslint-disable-next-line jsx-a11y/aria-role -- role is a component prop, not an ARIA role */}
          <SectionStrip pathname="/golf/dashboard/calendar" role="coach" />
        </SectionSwitchProvider>
      </LazyMotion>,
    );
    const pills = links.filter((l) => l.href.startsWith('/golf/dashboard'));
    expect(pills.length).toBeGreaterThan(2);
    const current = pills.filter((l) => l.href === '/golf/dashboard/calendar');
    expect(current.length).toBeGreaterThan(0);
    expect(current.every((l) => l.prefetch === false)).toBe(true);
    expect(pills.filter((l) => l.href !== '/golf/dashboard/calendar').every((l) => l.prefetch === undefined)).toBe(true);
  });
});
