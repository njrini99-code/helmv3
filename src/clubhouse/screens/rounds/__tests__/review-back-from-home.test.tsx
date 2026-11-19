import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, cleanup } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'motion/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Audit 2026-11-18 (P2): a coach who opened a round from Home saw "Stats" on the review's Back. Home's round links say
 * where they came from (`?from=home`), the route hands it on, and Back is named Home on the phone and the desktop.
 */
const phoneBack: Array<{ label: string }> = [];
vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/golf/dashboard/rounds/x' }));
vi.mock('../../../shell/phone-chrome', async (orig) => ({
  ...(await orig<object>()),
  PhoneTop: ({ back }: { back?: { label: string } }) => {
    if (back) phoneBack.push(back);
    return null;
  },
}));

import { PREVIEW_REVIEW_COACH } from '../../../preview/fixtures-round-review';
import { ToastProvider } from '../../../ui/Toast';
import { RoundReview } from '../RoundReview';
import { roundHref } from '../../home/player-links';

afterEach(() => {
  cleanup();
  phoneBack.length = 0;
  vi.unstubAllGlobals();
});

const tree = (fromHome: boolean) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        <RoundReview review={PREVIEW_REVIEW_COACH} fromHome={fromHome} />
      </div>
    </ToastProvider>
  </LazyMotion>
);

describe('a round opened from Home names its Back Home (audit 2026-11-18)', () => {
  it('Home’s round links say where they came from', () => {
    const id = '0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d';
    expect(roundHref(id, 'coach')).toBe(`/golf/dashboard/rounds/${id}?from=home`);
  });

  it('the desktop Back reads Home and goes there; without it a coach’s still goes to the player’s Stats', () => {
    const back = (fromHome: boolean) => {
      const a = /<a[^>]*class="ch-rv-back"[^>]*>[\s\S]*?<\/a>/.exec(renderToString(tree(fromHome)))?.[0] ?? '';
      return [a.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').trim(), /href="([^"]*)"/.exec(a)?.[1]?.replace(/&amp;/g, '&') ?? ''];
    };
    expect(back(true)).toEqual(['Home', '/golf/dashboard']);
    expect(back(false)[0]).toBe(PREVIEW_REVIEW_COACH.playerName);
  });

  it('the phone bar’s Back reads Home, not Stats', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} }));
    render(tree(true));
    expect(phoneBack.at(-1)?.label).toBe('Home');
    phoneBack.length = 0;
    cleanup();
    render(tree(false));
    expect(phoneBack.at(-1)?.label).toBe('Stats');
  });

  it('the dashboard route reads ?from=home and hands it to the review', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/golf/(dashboard)/dashboard/rounds/[id]/page.tsx'), 'utf8');
    expect(page).toContain("fromHome={query?.from === 'home'}");
    const route = readFileSync(join(process.cwd(), 'src/clubhouse/routes/round-review.tsx'), 'utf8');
    expect(route).toContain('fromHome={fromHome}');
  });
});
