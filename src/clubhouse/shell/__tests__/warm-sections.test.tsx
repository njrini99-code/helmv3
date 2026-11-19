import { cleanup, render } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'motion/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * E-3 (audit 2026-11-19, F-15): a revisit to a section paints real content in its first frame. Tournaments (behind
 * golf_tournaments_v1) was left out of the strip's fetch ahead, because the strip filtered the switch's sections again
 * without the features; CoachHelm, which may never be fetched ahead (CH-R1), keeps what it showed for 30 s instead.
 */
vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _p, scroll: _s, ...rest }: { href: string; prefetch?: unknown; scroll?: unknown; children?: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useLinkStatus: () => ({ pending: false }),
}));
const router = vi.hoisted(() => ({ push: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, redirect: vi.fn() }));
vi.mock('@/contexts/notification-badge-context', () => ({ useNotificationBadges: () => ({}) }));
vi.mock('../../lib/haptics', () => ({ haptic: vi.fn() }));
const tabs = vi.hoisted(() => ({ calls: [] as Array<{ tabs: readonly string[]; sections: readonly string[] }> }));
vi.mock('../use-prefetch-tabs', () => ({
  usePrefetchTabs: (t: readonly string[], _c: string, s: readonly string[] = []) => void tabs.calls.push({ tabs: t, sections: s }),
  useIdleRowsAhead: () => undefined,
  CH_TAB_FRESH_MS: 30_000,
}));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: vi.fn() }));
vi.mock('@/clubhouse/routes/coachhelm', () => ({ ClubhouseCoachHelmRoute: () => null }));

import { PREVIEW_SHELL } from '../../preview/fixtures';
import { SectionSwitchProvider } from '../section-switch';
import { SectionStrip } from '../SectionStrip';
import { CH_TAB_FRESH_MS } from '../use-prefetch-tabs';

const original = Element.prototype.animate;
beforeEach(() => {
  tabs.calls.length = 0;
  Element.prototype.animate = vi.fn(() => ({ cancel: vi.fn(), onfinish: null, finished: Promise.resolve() }) as unknown as Animation) as never;
});
afterEach(() => {
  cleanup();
  Element.prototype.animate = original;
});

describe('sections kept warm (E-3)', () => {
  it('the strip fetches Tournaments ahead when the team has it', () => {
    const shell = { ...PREVIEW_SHELL, tournaments: true };
    render(
      <LazyMotion features={domAnimation}>
        {/* eslint-disable-next-line jsx-a11y/aria-role -- role is a component prop, not an ARIA role */}
        <SectionSwitchProvider pathname="/golf/dashboard" role="coach" shell={shell}>
          {/* eslint-disable-next-line jsx-a11y/aria-role -- role is a component prop, not an ARIA role */}
          <SectionStrip pathname="/golf/dashboard" role="coach" />
        </SectionSwitchProvider>
      </LazyMotion>,
    );
    expect(tabs.calls.at(-1)?.sections).toContain('/golf/dashboard/tournaments');
  });

  it('CoachHelm keeps the board it showed for 30 s, the Clubhouse freshness window', async () => {
    const page = await import('@/app/golf/(dashboard)/dashboard/coachhelm/page');
    expect(page.unstable_dynamicStaleTime * 1000).toBe(CH_TAB_FRESH_MS);
  });
});
