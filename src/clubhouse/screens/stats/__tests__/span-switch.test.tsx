import '../../../__tests__/dialog-polyfill';
import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * "This season | All time" (data/span.ts): the switch on Home, Team stats and a player's Stats. The choice lives in the address
 * (`?range=all`), so it survives a reload and can be shared; the season is the default and writes nothing.
 */

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, useSearchParams: () => new URLSearchParams() }));
vi.mock('@/app/golf/actions/development', () => ({ createFocusArea: vi.fn() }));
vi.mock('@/app/golf/actions/stats-data', () => ({ getDetailedStats: vi.fn(), getSprayChartData: vi.fn() }));

import { filterFor, parseFilter, withScope, withSpan, type ChFilter } from '../../../data/stats-filter';
import { HomeSpanSwitch, spanHref } from '../../home/HomeSpanSwitch';
import { PREVIEW_PLAYER, PREVIEW_TEAM_STATS } from '../../../preview/fixtures-stats';
import { CrumbProvider } from '../../../shell/crumbs';
import { ToastProvider } from '../../../ui/Toast';
import { StatsPlayer } from '../StatsPlayer';
import { StatsTeam } from '../StatsTeam';
import { Form } from '../../home/HomePhone';
import type { ChTeamForm } from '../../../data/home';
import type { ChTeamStats } from '../../../data/stats-team';
import type { ChPlayerProfile } from '../../../data/stats-player';

const shell = (node: React.ReactNode) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <CrumbProvider>
        <div className="ch-root" data-ui="clubhouse">
          {node}
        </div>
      </CrumbProvider>
    </ToastProvider>
  </LazyMotion>
);
const team = (filter: ChFilter): ChTeamStats => ({ ...PREVIEW_TEAM_STATS, window: filter.window, filter });
const player = (filter: ChFilter): ChPlayerProfile => ({ ...PREVIEW_PLAYER, window: filter.window, filter });
const radio = (name: string) => screen.queryByRole('radio', { name });
const lastPush = () => router.push.mock.calls.at(-1) as [string, { scroll: boolean }] | undefined;

beforeEach(() => {
  router.push.mockReset();
  window.history.replaceState(null, '', '/golf/dashboard');
});
afterEach(cleanup);

describe('the address for a span', () => {
  it('All time sets ?range=all and keeps the rest; the season removes it and writes nothing for the default', () => {
    expect(spanHref('/golf/dashboard', '', 'all')).toBe('/golf/dashboard?range=all');
    expect(spanHref('/golf/dashboard', 'tab=x&range=all', 'season')).toBe('/golf/dashboard?tab=x');
    expect(spanHref('/golf/dashboard', 'range=all', 'season')).toBe('/golf/dashboard');
    expect(spanHref('/golf/dashboard', 'tab=x', 'all')).toBe('/golf/dashboard?tab=x&range=all');
  });
});

describe('Home’s switch', () => {
  it('shows the span the page was read on, and the default by default: "Last 10", what Team scoring reads (F-0002, never "This season")', () => {
    render(shell(<HomeSpanSwitch span="season" />));
    expect(radio('This season')).toBeNull();
    expect(radio('Last 10')!.getAttribute('aria-checked')).toBe('true');
    expect(radio('All time')!.getAttribute('aria-checked')).toBe('false');
    cleanup();
    render(shell(<HomeSpanSwitch span="all" />));
    expect(radio('All time')!.getAttribute('aria-checked')).toBe('true');
  });

  it('choosing All time goes to ?range=all on this page, keeping its other params; choosing Last 10 goes back without it', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/golf/dashboard?tab=x');
    const { rerender } = render(shell(<HomeSpanSwitch span="season" />));
    await user.click(radio('All time')!);
    expect(lastPush()).toEqual(['/golf/dashboard?tab=x&range=all', { scroll: false }]);
    // The page answers on the new address; the same switch, now on All time.
    window.history.replaceState(null, '', '/golf/dashboard?tab=x&range=all');
    rerender(shell(<HomeSpanSwitch span="all" />));
    await user.click(radio('Last 10')!);
    expect(lastPush()).toEqual(['/golf/dashboard?tab=x', { scroll: false }]);
  });
});

describe('Team stats’ switch', () => {
  it('one control answers "which rounds": the windows of the season, then All time, in one radio group', () => {
    render(shell(<StatsTeam data={team(filterFor('last10'))} />));
    const group = screen.getByRole('radiogroup', { name: 'Rounds shown' });
    expect([...group.querySelectorAll('[role="radio"]')].map((r) => r.getAttribute('aria-label') ?? r.textContent)).toEqual(['Last 5', 'Last 10', 'Last 20', 'Season', 'Qualifiers', 'All time']);
    expect(screen.getAllByRole('radiogroup', { name: 'Rounds shown' })).toHaveLength(1);
    // The season is the default: a window is lit and All time is not; the old second switch is gone.
    expect(radio('Last 10')!.getAttribute('aria-checked')).toBe('true');
    expect(radio('All time')!.getAttribute('aria-checked')).toBe('false');
    expect(radio('This season')).toBeNull();
  });

  it('choosing All time pushes ?range=all, and keeps the window the address names', async () => {
    const user = userEvent.setup();
    render(shell(<StatsTeam data={team(filterFor('last10'))} />));
    await user.click(radio('All time')!);
    expect(lastPush()).toEqual(['/golf/dashboard/stats?range=all', { scroll: false }]);
    cleanup();
    render(shell(<StatsTeam data={team(filterFor('qualifiers'))} />));
    await user.click(radio('All time')!);
    expect(lastPush()![0]).toBe('/golf/dashboard/stats?window=qualifiers&range=all');
  });

  it('on All time the row says so and no window is lit (All time has no window); choosing a window comes back to the season on it', async () => {
    const user = userEvent.setup();
    render(shell(<StatsTeam data={team(withSpan(filterFor('qualifiers'), 'all'))} />));
    expect(radio('All time')!.getAttribute('aria-checked')).toBe('true');
    for (const name of ['Last 5', 'Last 10', 'Last 20', 'Season', 'Qualifiers']) expect(radio(name)!.getAttribute('aria-checked')).toBe('false');
    await user.click(radio('Qualifiers')!);
    // The window chosen, and the param is gone.
    expect(lastPush()).toEqual(['/golf/dashboard/stats?window=qualifiers', { scroll: false }]);
    await user.click(radio('Last 20')!);
    expect(lastPush()![0]).not.toContain('range=all');
  });

  it('a window chosen after All time keeps ?range=all (the filter carries it through every change)', () => {
    const all = withSpan(filterFor('last10'), 'all');
    const href = '/golf/dashboard/stats?' + new URLSearchParams({ window: 'season', range: 'all' }).toString();
    expect(parseFilter(Object.fromEntries(new URL(href, 'https://x.test').searchParams))).toEqual(withScope(all, 'season'));
    expect(withScope(all, 'last20').span).toBe('all');
  });
});

describe('a player’s Stats switch', () => {
  it('choosing All time pushes ?range=all with the player; the season takes it off', async () => {
    const user = userEvent.setup();
    render(shell(<StatsPlayer data={player(filterFor('season'))} coachId="c1" />));
    expect(radio('Season')!.getAttribute('aria-checked')).toBe('true');
    expect(screen.getAllByRole('radiogroup', { name: 'Rounds shown' })).toHaveLength(1);
    await user.click(radio('All time')!);
    expect(lastPush()![0]).toBe(`/golf/dashboard/stats?player=${PREVIEW_PLAYER.id}&window=season&range=all`);
    cleanup();
    render(shell(<StatsPlayer data={player(withSpan(filterFor('season'), 'all'))} coachId="c1" />));
    expect(radio('All time')!.getAttribute('aria-checked')).toBe('true');
    expect(radio('Last 10')!.getAttribute('aria-checked')).toBe('false');
    await user.click(radio('Season')!);
    expect(lastPush()![0]).toBe(`/golf/dashboard/stats?player=${PREVIEW_PLAYER.id}&window=season`);
  });
});

describe('Coach Home’s Team scoring card', () => {
  const form: ChTeamForm = {
    avg: 75.6, delta: null, line: [75, 76, 75.5], roundsThisWeek: 2, basis: { rounds: 13, from: '2024-03-01', to: '2026-10-14', girRounds: 13, puttsRounds: 13 },
    gir: { pct: 60, delta: null }, putts: { avg: 31, delta: null },
  };
  it('names the window it shows: each player’s last 10 by default, every round on All time', () => {
    render(shell(<Form form={form} />));
    expect(screen.getByText(/each player’s last 10/)).not.toBeNull();
    // F-0002: the pill names the same window as the figure under it.
    expect(radio('Last 10')!.getAttribute('aria-checked')).toBe('true');
    cleanup();
    render(shell(<Form form={{ ...form, span: 'all' }} />));
    expect(screen.getByText(/every round, all time/)).not.toBeNull();
    expect(radio('All time')!.getAttribute('aria-checked')).toBe('true');
  });
});
