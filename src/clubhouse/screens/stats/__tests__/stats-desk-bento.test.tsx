import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'motion/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn(), hapticScrub: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/golf/dashboard/stats' }));
vi.mock('@/app/golf/actions/development', () => ({ createFocusArea: vi.fn(), acceptFocusArea: vi.fn(), declineFocusArea: vi.fn() }));

import type { ChPlayerProfile } from '../../../data/stats-player';
import { PREVIEW_PLAYER_SUGGESTED, PREVIEW_TEAM_STATS } from '../../../preview/fixtures-stats';
import { ToastProvider } from '../../../ui/Toast';
import { StatsPlayer } from '../StatsPlayer';

/**
 * Desktop My stats (stats-home, "Desktop"): the phone's rebuilt cards as a bento, and the chosen card's drill beside them. The cards
 * and the drills are the phone's own components (their figures and states are tested there); these tests pin what the desk adds:
 * which page a desktop browser gets, that a card changes the pane without a push, and that nothing is drawn twice or for the wrong viewer.
 */
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
const coachView = (over: Partial<ChPlayerProfile> = {}): ChPlayerProfile => ({ ...PREVIEW_PLAYER_SUGGESTED, viewer: 'coach', ...over });
const pane = () => document.querySelector<HTMLElement>('.ch-shs-desk__det');
const cards = () => [...document.querySelectorAll<HTMLElement>('[data-ch="stats-card"]')];
const title = () => pane()?.querySelector('.ch-shs-desk__dett')?.textContent ?? null;

beforeEach(() => {
  window.location.hash = '';
});
afterEach(cleanup);

describe('desktop My stats is the bento with its drill beside it', () => {
  it('a desktop browser gets the cards and one drill pane, not the tabbed tables', async () => {
    render(shell(<StatsPlayer data={self()} coachId={null} />));
    await waitFor(() => expect(cards().length).toBeGreaterThan(3));
    expect(screen.queryByRole('tablist', { name: 'Profile sections' })).toBeNull();
    expect(document.querySelector('.ch-zn')).toBeNull();
    expect(document.querySelector('main.ch-st.is-desk.ch-st--shs')).not.toBeNull();
    // No phone bar and no pushed screen on a desk.
    expect(document.querySelector('.ch-pscreen')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'My stats' })).toBeTruthy();
  });

  it('the pane rests on Scoring; choosing a card changes the pane in place, with no push and no hash', async () => {
    const pushes = vi.spyOn(window.history, 'pushState');
    render(shell(<StatsPlayer data={self()} coachId={null} />));
    await waitFor(() => expect(pane()).not.toBeNull());
    expect(title()).toBe('Scoring');
    const rounds = await waitFor(() => {
      const c = cards().find((x) => x.dataset.go === 'rounds');
      if (!c) throw new Error('the rounds card is not drawn yet');
      return c;
    });
    fireEvent.click(within(rounds).getAllByRole('button')[0]!);
    await waitFor(() => expect(title()).toBe('Rounds'));
    expect(document.querySelector<HTMLElement>('.ch-shs--desk')?.dataset.chShsOpen).toBe('rounds');
    expect(pushes).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');
    // The summary stays in reach while a drill shows: nothing is made inert on a desk.
    expect(document.querySelector('.ch-shs-desk__sum')?.closest('[inert]')).toBeNull();
    pushes.mockRestore();
  });

  it('the window switch carries its whole labels, and the head carries no figure', async () => {
    render(shell(<StatsPlayer data={self()} coachId={null} />));
    await waitFor(() => expect(cards().length).toBeGreaterThan(3));
    const head = document.querySelector<HTMLElement>('.ch-shs-dhead')!;
    // One number, one place: scoring average, strokes gained and the round count live in their cards, never in the head too.
    expect(head.querySelector('.ch-num')).toBeNull();
    expect(head.textContent).not.toMatch(/\d\d\.\d/);
    expect(document.querySelector('.ch-shs-dctl')).not.toBeNull();
    expect(document.querySelector('.ch-shs-ctl')).toBeNull();
  });

  it('a player sees no coach action and no teammate; a coach gets the way back and the three actions', async () => {
    const own = render(shell(<StatsPlayer data={self()} coachId={null} />));
    await waitFor(() => expect(cards().length).toBeGreaterThan(3));
    expect(screen.queryByText('Team stats')).toBeNull();
    expect(screen.queryByText('Message')).toBeNull();
    expect(screen.queryByText('Add focus area')).toBeNull();
    const html = document.body.innerHTML;
    for (const name of PREVIEW_TEAM_STATS.players.map((p) => p.name).filter((n) => n !== self().name)) expect(html).not.toContain(name);
    own.unmount();
    render(shell(<StatsPlayer data={coachView()} coachId="coach-1" />));
    await waitFor(() => expect(cards().length).toBeGreaterThan(3));
    expect(screen.getByRole('heading', { level: 1, name: coachView().name })).toBeTruthy();
    expect(screen.getByText('Team stats')).toBeTruthy();
    expect(screen.getByText('Message')).toBeTruthy();
  });

  it('a failed read keeps the page honest: the failure across the cards’ place, and the pane on the one card left', async () => {
    render(shell(<StatsPlayer data={self({ roundsError: true })} coachId={null} />));
    await waitFor(() => expect(pane()).not.toBeNull());
    // No figure card is drawn from rounds that did not load; Development's card does not read them, and the pane is its drill.
    expect(cards().map((c) => c.dataset.go)).toEqual(['goals']);
    expect(title()).not.toBe('Scoring');
    expect(document.querySelector<HTMLElement>('.ch-shs--desk')?.dataset.chShsOpen).toBe('goals');
  });

  it('the tabbed tables are still there when asked for, which is what paper prints', async () => {
    render(shell(<StatsPlayer layout="tabs" data={self()} coachId={null} />));
    expect(screen.getByRole('tablist', { name: 'Profile sections' })).toBeTruthy();
    expect(document.querySelector('.ch-shs--desk')).toBeNull();
  });
});
