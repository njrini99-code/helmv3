/**
 * Public player profile — tab keyboard contract + back navigation.
 *
 * The tab strip is hand-built rather than a Fairway <Segmented> (see the
 * comment above it in PlayerProfileClient.tsx: Segmented renders a full
 * `motion.span`, which throws under the `(public)` group's
 * `<LazyMotion strict>`). Hand-building it means the WAI-ARIA `tabs` keyboard
 * contract Segmented would have supplied is ours to keep working, so it is
 * asserted here rather than assumed.
 *
 * Back navigation is covered because the fallback target is a correctness
 * question, not a cosmetic one: /baseball/dashboard/discover is a recruiting
 * route and recruiting is sunset (product-modules.ts), so a coach sent there
 * is immediately bounced to /command-center by requireRecruitingCoachRoute.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';

vi.mock('framer-motion', () => {
  const passthrough = new Proxy(
    {},
    {
      get: (_target, prop) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({ children, initial: _i, animate: _a, variants: _v, transition: _t, style, ...rest }: any) =>
          React.createElement(prop as string, { ...rest, style }, children),
    },
  );
  return {
    m: passthrough,
    motion: passthrough,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    LazyMotion: ({ children }: any) => children,
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
    useReducedMotion: () => true,
    useScroll: () => ({ scrollY: { get: () => 0, on: () => () => {} } }),
    useTransform: () => 0,
  };
});

const routerPush = vi.hoisted(() => vi.fn());
const routerBack = vi.hoisted(() => vi.fn());

// The global setup mock returns a NEW router object per call, so its spies can
// never be inspected. Override it here with stable ones.
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: routerPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: routerBack,
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/baseball/player/player-1',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: 'player-1' }),
}));

vi.mock('@/app/baseball/actions/watchlist', () => ({
  toggleWatchlistPlayer: vi.fn().mockResolvedValue({ success: true, action: 'added' }),
}));

vi.mock('@/components/ui/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { PlayerProfileClient } from '../PlayerProfileClient';
import { makeProps } from './player-fixture';

const TAB_NAMES = [/Overview/, /Videos/, /Stats & Metrics|Stats/, /Team History/, /Awards/];

function tabs() {
  return TAB_NAMES.map((name) => screen.getByRole('tab', { name }));
}

describe('public player profile — tab strip keyboard contract', () => {
  beforeEach(() => {
    routerPush.mockClear();
    routerBack.mockClear();
  });

  it('keeps exactly one tab in the page tab-order (roving tabindex)', () => {
    render(<PlayerProfileClient {...makeProps()} />);
    const [overview, videos] = tabs();
    expect(overview).toHaveAttribute('tabindex', '0');
    expect(videos).toHaveAttribute('tabindex', '-1');
    // Not "every tab is reachable with Tab" — a tablist is ONE tab stop.
    expect(tabs().filter((t) => t.getAttribute('tabindex') === '0')).toHaveLength(1);
  });

  it('ArrowRight moves selection and focus to the next tab', async () => {
    render(<PlayerProfileClient {...makeProps()} />);
    const [overview, videos] = tabs();
    overview!.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(videos).toHaveFocus();
    expect(videos).toHaveAttribute('aria-selected', 'true');
    expect(overview).toHaveAttribute('aria-selected', 'false');
  });

  it('ArrowLeft wraps from the first tab to the last', async () => {
    render(<PlayerProfileClient {...makeProps()} />);
    const all = tabs();
    all[0]!.focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(all[all.length - 1]).toHaveFocus();
    expect(all[all.length - 1]).toHaveAttribute('aria-selected', 'true');
  });

  it('Home and End jump to the first and last tab', async () => {
    render(<PlayerProfileClient {...makeProps()} />);
    const all = tabs();
    all[2]!.focus();
    await userEvent.keyboard('{End}');
    expect(all[all.length - 1]).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{Home}');
    expect(all[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('the panel is labelled by whichever tab is selected', async () => {
    render(<PlayerProfileClient {...makeProps()} />);
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('aria-labelledby', 'pp-tab-overview');
    // Focusable, so a keyboard user lands in the panel they just chose.
    expect(panel).toHaveAttribute('tabindex', '0');

    await userEvent.click(screen.getByRole('tab', { name: /Awards/ }));
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'pp-tab-achievements');
  });
});

describe('public player profile — hero actions', () => {
  beforeEach(() => {
    routerPush.mockClear();
    routerBack.mockClear();
  });

  it('shows no coach actions to an anonymous visitor', () => {
    render(<PlayerProfileClient {...makeProps()} />);
    expect(screen.queryByRole('button', { name: /watchlist/i })).not.toBeInTheDocument();
  });

  it('offers a coach exactly one action, and it is not a dead control', () => {
    render(<PlayerProfileClient {...makeProps({ isCoachViewing: true })} />);
    expect(screen.getByRole('button', { name: 'Add to Watchlist' })).toBeInTheDocument();
    // The inert "Message" pill and its phone-only overflow menu clone had no
    // onClick and no href; there is still no compose-to-player route to give
    // them, so they must stay gone rather than come back as decoration.
    expect(screen.queryByRole('button', { name: /message/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /more profile actions/i })).not.toBeInTheDocument();
  });

  it('prefers real history when the visitor arrived from another page', async () => {
    window.history.pushState({}, '', '/baseball/player/player-1');
    render(<PlayerProfileClient {...makeProps({ isCoachViewing: true })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(routerBack).toHaveBeenCalled();
    expect(routerPush).not.toHaveBeenCalled();
  });
});

describe('public player profile — self-view disclosure', () => {
  it('warns the athlete that a non-activated profile is invisible to coaches', () => {
    render(
      <PlayerProfileClient
        {...makeProps({
          isSelfViewing: true,
          player: { ...makeProps().player, recruiting_activated: false },
        })}
      />,
    );
    expect(screen.getByText('Only you can see this page right now')).toBeInTheDocument();
  });

  it('stays quiet for a visitor who is not the athlete', () => {
    render(
      <PlayerProfileClient
        {...makeProps({ player: { ...makeProps().player, recruiting_activated: false } })}
      />,
    );
    expect(screen.queryByText('Only you can see this page right now')).not.toBeInTheDocument();
  });
});
