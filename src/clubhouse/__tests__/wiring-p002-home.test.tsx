import { LazyMotion, domAnimation } from 'motion/react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * P002 wiring audit (2026-10-17): the first run's Invite players opens Roster's invite sheet (`?invite=1`, which Roster
 * reads once), on desktop and on the phone, rather than only the Roster page.
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard' }));

import type { ChCoachHome } from '../data/home';
import { PREVIEW_HOME } from '../preview/fixtures';
import { CoachHome } from '../screens/home/CoachHome';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';

const EMPTY: ChCoachHome = {
  ...PREVIEW_HOME,
  week: { ...PREVIEW_HOME.week, agenda: [], days: PREVIEW_HOME.week.days.map((d) => ({ ...d, eventCount: 0, hasCompetition: false })) },
  latestRounds: { rounds: [], error: false, holesError: false },
  leaderboard: { rows: [], scorecards: 0, rosterSize: 0, error: false },
  phone: { next: null, today: [], form: null, weekNote: null },
};

const wrap = () =>
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <CoachHome data={EMPTY} now={new Date().toISOString()} />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );

describe('P002 · 20103 first run: Invite players opens the invite sheet', () => {
  const realMatchMedia = window.matchMedia;
  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });
  const media = (phone: boolean) =>
    ((q: string) => ({
      matches: phone && q === '(max-width: 820px)',
      media: q,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as never;

  it.each([
    ['desktop', false],
    ['phone', true],
  ])('%s: the link is /golf/dashboard/roster?invite=1', (_, phone) => {
    window.matchMedia = media(phone);
    wrap();
    expect(screen.getByRole('link', { name: 'Invite players' }).getAttribute('href')).toBe('/golf/dashboard/roster?invite=1');
  });
});
