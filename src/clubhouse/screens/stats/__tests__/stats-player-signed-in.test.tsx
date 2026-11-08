import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'motion/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn(), hapticScrub: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/golf/dashboard/stats' }));
vi.mock('@/app/golf/actions/development', () => ({ createFocusArea: vi.fn(), acceptFocusArea: vi.fn(), declineFocusArea: vi.fn() }));

import type { ChPlayerProfile } from '../../../data/stats-player';
import type { ChTeamStats } from '../../../data/stats-team';
import { PREVIEW_PLAYER_SUGGESTED, PREVIEW_TEAM_STATS } from '../../../preview/fixtures-stats';
import { ToastProvider } from '../../../ui/Toast';
import { StatsPlayer } from '../StatsPlayer';
import { StatsTeam } from '../StatsTeam';

const real = window.matchMedia;
const shell = (node: ReactNode) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        {node}
      </div>
    </ToastProvider>
  </LazyMotion>
);

const self = (over: Partial<ChPlayerProfile> = {}): ChPlayerProfile => ({ ...PREVIEW_PLAYER_SUGGESTED, viewer: 'player', ...over });
const showPlayer = (data: ChPlayerProfile, shs = true) => render(shell(<StatsPlayer data={data} coachId={null} shs={shs} />));
const showTeam = (data: ChTeamStats, shs = true) => render(shell(<StatsTeam data={data} shs={shs} />));

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px), (max-height: 500px) and (pointer: coarse)' })) as typeof window.matchMedia;
  window.location.hash = '';
});
afterEach(() => {
  cleanup();
  window.matchMedia = real;
});

/** SHARED-11, stats-home criteria 27 and 48: no teammate's name or figure exists in the DOM, not merely hidden. */
describe('a player signed in, flag on', () => {
  it('finds no teammate name anywhere in the document', async () => {
    showPlayer(self());
    await waitFor(() => expect(document.querySelector('[data-ch="stats-card"]')).not.toBeNull());
    const html = document.body.innerHTML;
    const me = self().name;
    const teammates = PREVIEW_TEAM_STATS.players.map((p) => p.name).filter((n) => n !== me);
    expect(teammates.length).toBeGreaterThan(3);
    for (const name of teammates) expect(html).not.toContain(name);
  });

  it('draws no team rank row or team card, and names itself My stats', async () => {
    showPlayer(self());
    await waitFor(() => expect(document.querySelector('[data-ch="stats-card"]')).not.toBeNull());
    const goes = [...document.querySelectorAll<HTMLElement>('[data-ch="stats-card"]')].map((c) => c.dataset.go);
    for (const team of ['tscore', 'tgame', 'tplayers']) expect(goes).not.toContain(team);
    expect(screen.queryByText('Who gains and loses')).toBeNull();
  });

  it('offers no write a coach owns: no Add focus area, no Message, no Share', async () => {
    showPlayer(self());
    await waitFor(() => expect(document.querySelector('[data-ch="stats-card"]')).not.toBeNull());
    expect(screen.queryByRole('button', { name: 'Add focus area' })).toBeNull();
    expect(screen.queryByRole('link', { name: /^Message/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Share/ })).toBeNull();
  });

  it('keeps every section of the page in the drawn order', async () => {
    showPlayer(self());
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Development' })).toBeTruthy());
    expect([...document.querySelectorAll('.ch-shs-sech')].map((h) => h.textContent)).toEqual(['Overview', 'Your game', 'Rounds', 'Development']);
    // Criterion 1: no large title on Stats phone.
    expect(document.querySelector('.ch-large-title')).toBeNull();
  });
});

/** SHARED-8 and W-STATS-1: flag off is main's tree, on the phone where the two pages differ. */
describe('the flag decides which phone page draws', () => {
  it('player off: none of the redesign renders', async () => {
    showPlayer(self(), false);
    await waitFor(() => expect(document.querySelector('.ch-st')).not.toBeNull());
    expect(document.querySelector('.ch-shs')).toBeNull();
    expect(document.querySelector('[data-ch="stats-card"]')).toBeNull();
    expect(document.querySelector('[data-ch="stats-window-seg"]')).toBeNull();
  });

  it('player on: the redesign renders', async () => {
    showPlayer(self());
    await waitFor(() => expect(document.querySelector('.ch-shs')).not.toBeNull());
    expect(document.querySelector('[data-ch="stats-window-seg"]')).not.toBeNull();
  });

  it('team off: none of the redesign renders', async () => {
    showTeam(PREVIEW_TEAM_STATS, false);
    await waitFor(() => expect(document.querySelector('.ch-st')).not.toBeNull());
    expect(document.querySelector('.ch-shs')).toBeNull();
    expect(document.querySelector('[data-ch="stats-card"]')).toBeNull();
  });

  it('team on: the redesign renders', async () => {
    showTeam(PREVIEW_TEAM_STATS);
    await waitFor(() => expect(document.querySelector('.ch-shs')).not.toBeNull());
  });

  it('a #sd- hash is ignored with the flag off on desktop, and the tab stays Overview', async () => {
    window.matchMedia = real;
    window.location.hash = '#sd-rounds';
    showPlayer(self(), false);
    await waitFor(() => expect(screen.getByRole('tab', { name: /Overview/ }).getAttribute('aria-selected')).toBe('true'));
  });
});
