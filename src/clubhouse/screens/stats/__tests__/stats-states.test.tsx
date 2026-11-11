import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn(), hapticScrub: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, useSearchParams: () => new URLSearchParams(), usePathname: () => '/golf/dashboard/stats' }));
vi.mock('@/app/golf/actions/development', () => ({ createFocusArea: vi.fn(), acceptFocusArea: vi.fn(), declineFocusArea: vi.fn() }));

import { PREVIEW_PLAYER_SHS_SELF, previewShsPlayer } from '../../../preview/fixtures-stats-redesign';
import { PREVIEW_TEAM_STATS } from '../../../preview/fixtures-stats';
import { ShsPlayerSkeleton, ShsTeamSkeleton } from '../ShsSkeleton';
import { filterFor } from '../../../data/stats-filter';
import { asDesktop, asPhone, cards, painted, resetAddress, showPlayer, showTeam } from './_shs-harness';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);

beforeEach(() => {
  router.refresh.mockClear();
  asPhone();
  resetAddress();
});
afterEach(() => {
  cleanup();
  asDesktop();
});

/** Stats-home criteria 93 to 95. */
describe('loading', () => {
  it('My stats keeps a card per loaded card, each at its loaded height for the reader’s Text Size, and is busy with its label', () => {
    render(<ShsPlayerSkeleton />);
    const main = document.querySelector('main')!;
    expect(main.getAttribute('aria-busy')).toBe('true');
    expect(main.getAttribute('aria-label')).toBe('Loading stats');
    const heads = [...document.querySelectorAll('.ch-shs-skel-card h3')].map((h) => h.textContent);
    expect(heads).toEqual(['Scoring average', 'What changed', 'At a glance', 'Strokes gained', 'Off the tee', 'Approach', expect.any(String), 'Putting', 'Round by round', 'Goals and focus areas']);
    for (const c of document.querySelectorAll<HTMLElement>('.ch-shs-skel-card')) expect(parseFloat(/calc\((\d+)/.exec(c.style.height)?.[1] ?? '')).toBeGreaterThan(100);
    expect([...document.querySelectorAll('.ch-shs-sech')].map((h) => h.textContent)).toEqual(['Overview', 'Your game', 'Rounds', 'Development']);
  });

  it('the window switch is the real control on the address’s choice, held inert, and the bars are hidden from assistive tech', () => {
    render(<ShsPlayerSkeleton filter={filterFor('season')} />);
    const ctl = document.querySelector('.ch-shs-ctl')!;
    expect(ctl.hasAttribute('inert')).toBe(true);
    // Not a grey bar standing in for the switch: the control itself, so nothing changes shape when the figures land.
    expect(ctl.querySelector('.ch-shs-skel, .ch-shs-skel-seg')).toBeNull();
    expect([...ctl.querySelectorAll('[role="radio"]')].map((r) => r.getAttribute('aria-label') ?? r.textContent)).toEqual(['Last 5', 'Last 10', 'Last 20', 'Season', 'Qualifiers', 'All time']);
    expect(ctl.querySelector('[role="radio"][aria-checked="true"]')!.textContent).toBe('Season');
    const bars = document.querySelectorAll('.ch-shs-skel');
    expect(bars.length).toBeGreaterThan(5);
    for (const b of bars) expect(b.getAttribute('aria-hidden')).toBe('true');
  });

  it('the green card waits plain: its title, no bar and no sheen on the green', () => {
    render(<ShsPlayerSkeleton />);
    const feature = document.querySelector('.ch-shs-skel-card.ch-shs-feature')!;
    expect(feature.querySelector('h3')!.textContent).toBe('Scoring average');
    expect(feature.querySelectorAll('.ch-shs-skel')).toHaveLength(0);
  });

  it('Team Stats keeps CH-4401 on the container', () => {
    render(<ShsTeamSkeleton />);
    expect(document.querySelector('main')!.getAttribute('data-ch-code')).toBe('CH-4401');
    expect(document.querySelector('main')!.getAttribute('aria-busy')).toBe('true');
    expect([...document.querySelectorAll('.ch-shs-sech')].map((h) => h.textContent)).toEqual(['Overview', 'Team game', 'Players']);
  });
});

/** Criteria 97 and 98. */
describe('My stats failed', () => {
  const failed = { ...PREVIEW_PLAYER_SHS_SELF, roundsError: true };

  it('says CH-5201 in the drawn words', async () => {
    showPlayer(failed);
    await waitFor(() => expect(code('CH-5201')).not.toBeNull());
    expect(code('CH-5201')!.getAttribute('role')).toBe('alert');
    expect(code('CH-5201')!.textContent).toContain('Rounds didn’t load');
    expect(code('CH-5201')!.textContent).toContain('Posted rounds are safe. Every figure that reads them would be incomplete, so they’re hidden. Try again.');
  });

  it('keeps the switch live and Development, and no other card', async () => {
    showPlayer(failed);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Development' })).toBeTruthy());
    expect(cards()).toEqual(['goals']);
    expect(document.querySelector('.ch-shs-ctl')!.hasAttribute('inert')).toBe(false);
    expect(document.querySelector('[data-ch="stats-window-seg"]')).not.toBeNull();
    expect(screen.queryByRole('heading', { name: 'Overview' })).toBeNull();
  });

  it('Try again refreshes once; a second tap while it loads does nothing', async () => {
    showPlayer(failed);
    const retry = await waitFor(() => {
      const b = document.querySelector<HTMLElement>('[data-ch="stats-retry"]');
      expect(b).not.toBeNull();
      return b!;
    });
    fireEvent.click(retry);
    fireEvent.click(retry);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(retry).toHaveProperty('disabled', true);
  });
});

/** Criteria 21 and 22. */
describe('My stats empty and early', () => {
  it('no rounds: the first-run card, only Development keeps its section', async () => {
    showPlayer(previewShsPlayer('empty')!);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Development' })).toBeTruthy());
    expect(screen.getByRole('heading', { name: 'Your stats start with your first round' })).toBeTruthy();
    expect([...document.querySelectorAll('.ch-shs-sech')].map((h) => h.textContent)).toEqual(['Development']);
  });

  it('a window with nothing in it is not a first run', async () => {
    showPlayer(previewShsPlayer('filterempty')!);
    await waitFor(() => expect(code('CH-5320')).not.toBeNull());
    expect(screen.queryByRole('heading', { name: 'Your stats start with your first round' })).toBeNull();
  });

  it('under three rounds: the note shows and no strokes gained pill or figure renders (criterion 91)', async () => {
    showPlayer(previewShsPlayer('one')!);
    await waitFor(() => expect(code('CH-5305')).not.toBeNull());
    expect(code('CH-5305')!.textContent).toMatch(/^From 1 round\./);
    await painted('sg');
    expect(document.querySelector('[data-go="sg"]')!.textContent).toContain('Strokes gained shows from 3 rounds');
    expect(document.querySelectorAll('[data-go="sg"] .ch-shs-pill')).toHaveLength(0);
    expect(document.querySelectorAll('.ch-shs-feature .ch-shs-pill')).toHaveLength(0);
  });

  it('one round: the chart is an image, not a slider', async () => {
    showPlayer(previewShsPlayer('one')!);
    await painted('scoring');
    expect(document.querySelector('[data-ch="stats-hero-chart"]')!.getAttribute('role')).toBe('img');
  });
});

/** Criteria 53, 99 and 100. */
describe('Team Stats states', () => {
  it('failed: one card, CH-4201 in the drawn words, no figure', async () => {
    showTeam({ ...PREVIEW_TEAM_STATS, roundsError: true });
    await waitFor(() => expect(code('CH-4201')).not.toBeNull());
    expect(code('CH-4201')!.textContent).toContain('Team rounds didn’t load');
    expect(code('CH-4201')!.textContent).toContain('Every figure would be incomplete, so none is shown.');
    expect(cards()).toEqual([]);
    expect(document.querySelectorAll('.ch-shs-sech')).toHaveLength(0);
  });

  it('a second tap on Try again does nothing', async () => {
    showTeam({ ...PREVIEW_TEAM_STATS, roundsError: true });
    const retry = await waitFor(() => {
      const b = document.querySelector<HTMLElement>('[data-ch="stats-retry"]');
      expect(b).not.toBeNull();
      return b!;
    });
    fireEvent.click(retry);
    fireEvent.click(retry);
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('no team rounds: no sections and no summary cards', async () => {
    showTeam({ ...PREVIEW_TEAM_STATS, roundCount: 0, days: [], filterOptions: { ...PREVIEW_TEAM_STATS.filterOptions, total: 0, rounds: [], courses: [] } });
    await waitFor(() => expect(document.querySelector('.ch-shs-empty')).not.toBeNull());
    expect(cards()).toEqual([]);
    expect(document.querySelectorAll('.ch-shs-sech')).toHaveLength(0);
  });

  it('two round days: the partial note, and the trend still draws', async () => {
    const days = (PREVIEW_TEAM_STATS.days ?? []).filter((d) => d.score != null).slice(0, 2);
    expect(days).toHaveLength(2);
    showTeam({ ...PREVIEW_TEAM_STATS, days });
    await painted('tscore');
    expect(document.querySelector('.ch-shs-few')!.textContent).toMatch(/^From 2 round days\./);
  });
});
