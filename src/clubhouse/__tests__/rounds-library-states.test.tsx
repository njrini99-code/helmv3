import { LazyMotion, domAnimation } from 'framer-motion';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Rounds library's page states (owner rules, 2026-10-01): a refresh that fails keeps the last good library and says it may be out
 * of date (rule 2), and a refresh in flight keeps the page and says it is updating. The filters and the way back from a review are in
 * the second half of this file (rule 8).
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const refreshing = vi.hoisted(() => ({ now: false, refresh: vi.fn() }));
vi.mock('../lib/use-refresh', () => ({ useRefresh: () => ({ refresh: refreshing.refresh, refreshing: refreshing.now }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }), usePathname: () => '/golf/dashboard/rounds', useSearchParams: () => new URLSearchParams() }));
vi.mock('@/app/golf/actions/golf', () => ({ deleteInProgressRound: vi.fn() }));
vi.mock('@/lib/utils/emergency-save', () => ({ clearEmergencySave: vi.fn(), markRoundDiscarded: vi.fn() }));

import { RoundsLibrary } from '../screens/rounds/RoundsLibrary';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';
import type { ChRoundsLibrary } from '../data/rounds-shape';
import { PREVIEW_ROUNDS, PREVIEW_ROUNDS_FAILED, PREVIEW_ROUNDS_IDLE, PREVIEW_ROUNDS_UNFINISHED_FAILED } from '../preview/fixtures-rounds';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`) as HTMLElement | null;
const lib = (data: ChRoundsLibrary, playerId = 'p1') => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        <RoundsLibrary data={data} playerId={playerId} writes={{ discard: vi.fn(() => Promise.resolve({ success: true })) }} />
      </div>
    </ToastProvider>
  </LazyMotion>
);
const rows = () => screen.getAllByRole('link').filter((l) => /^\/golf\/dashboard\/rounds\/a0000000-/.test(l.getAttribute('href') ?? ''));

beforeEach(() => {
  refreshing.now = false;
  refreshing.refresh.mockClear();
});

describe('Rounds library: a failed refresh keeps the old library (rule 2)', () => {
  it('CH-11213 the same player: a refresh that fails keeps the rounds, the season and the card, and says they may be out of date, with Try again', async () => {
    const user = userEvent.setup();
    const { rerender } = render(lib(PREVIEW_ROUNDS));
    const before = rows().length;
    expect(before).toBeGreaterThan(0);
    rerender(lib({ ...PREVIEW_ROUNDS_FAILED, season: PREVIEW_ROUNDS_FAILED.season }));
    expect(code('CH-11213')!.textContent).toMatch(/Your rounds may be out of date.*last time/);
    expect(rows()).toHaveLength(before);
    expect(screen.getByText('In progress')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Season scoring' })).toBeTruthy();
    // Neither the error nor an empty copy replaces them.
    expect(code('CH-11201')).toBeNull();
    expect(code('CH-11301')).toBeNull();
    expect(screen.queryByText('No rounds yet')).toBeNull();
    await user.click(within(code('CH-11213')!).getByRole('button', { name: 'Try again' }));
    expect(refreshing.refresh).toHaveBeenCalledTimes(1);
  });

  it('CH-11213 the next refresh that lands takes the new library and drops the notice', () => {
    const { rerender } = render(lib(PREVIEW_ROUNDS_IDLE));
    rerender(lib(PREVIEW_ROUNDS_FAILED));
    expect(code('CH-11213')).not.toBeNull();
    rerender(lib(PREVIEW_ROUNDS));
    expect(code('CH-11213')).toBeNull();
    expect(code('CH-11201')).toBeNull();
    expect(screen.getByText('In progress')).toBeTruthy();
  });

  it('CH-11213 a failed in-progress read on refresh keeps the old card (not CH-11202), and the old list with it', () => {
    const { rerender } = render(lib(PREVIEW_ROUNDS));
    rerender(lib(PREVIEW_ROUNDS_UNFINISHED_FAILED));
    expect(code('CH-11213')).not.toBeNull();
    expect(code('CH-11202')).toBeNull();
    expect(screen.getByText('In progress')).toBeTruthy();
  });

  it('CH-11201 a first load that fails is the error, never an old figure and never the stale notice', () => {
    render(lib(PREVIEW_ROUNDS_FAILED));
    expect(code('CH-11201')).not.toBeNull();
    expect(code('CH-11213')).toBeNull();
    expect(rows()).toHaveLength(0);
  });

  it('CH-11201 another player’s failed load never shows the first player’s rounds under their name', () => {
    const { rerender } = render(lib(PREVIEW_ROUNDS, 'p1'));
    rerender(lib(PREVIEW_ROUNDS_FAILED, 'p2'));
    expect(code('CH-11201')).not.toBeNull();
    expect(code('CH-11213')).toBeNull();
    expect(rows()).toHaveLength(0);
    expect(screen.queryByRole('searchbox')).toBeNull();
  });
});

describe('Rounds library: a refresh in flight (rule 2)', () => {
  it('CH-11410 keeps the page and says it is updating, on the page and not as a skeleton; nothing says it when it is not', () => {
    const { rerender } = render(lib(PREVIEW_ROUNDS));
    expect(code('CH-11410')).toBeNull();
    expect(screen.getByRole('main').getAttribute('aria-busy')).toBeNull();
    refreshing.now = true;
    rerender(lib(PREVIEW_ROUNDS));
    expect(code('CH-11410')!.textContent).toBe('Updating…');
    expect(screen.getByRole('main').getAttribute('aria-busy')).toBe('true');
    expect(rows().length).toBeGreaterThan(0);
  });

  it('CH-11213 the retry says Trying again and does nothing on a second tap while it runs', async () => {
    const user = userEvent.setup();
    const { rerender } = render(lib(PREVIEW_ROUNDS));
    rerender(lib(PREVIEW_ROUNDS_FAILED));
    refreshing.now = true;
    rerender(lib(PREVIEW_ROUNDS_FAILED));
    const btn = within(code('CH-11213')!).getByRole('button', { name: 'Trying again' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    await user.click(btn);
    expect(refreshing.refresh).not.toHaveBeenCalled();
  });
});
