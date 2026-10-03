import { LazyMotion, domAnimation } from 'framer-motion';
import { act, cleanup, render, screen } from '@testing-library/react';
import { Suspense, startTransition, use, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The premise of CoachHelm's view switch (routes/coachhelm.tsx, perf 2026-10-01): when the next view is not ready, a transition keeps
 * the view that is on screen if the Suspense that holds it is the same one (same place, no key), and draws the fallback over it if
 * the boundary is new (keyed by view, as the page used to be). The route's views are server components behind Next's router, which
 * runs a navigation as a transition; this is React's own rule, with the server taken out.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(cleanup);

// The router's push is the page's own navigation; the rapid-switching tests below stand a view change in for it.
const nav = vi.hoisted(() => ({ push: (_href: string) => {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: (href: string) => nav.push(href), refresh: () => {}, replace: () => {} }), usePathname: () => '/golf/dashboard/coachhelm' }));
vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/use-phone', () => ({ useChPhone: () => false, CH_PHONE_QUERY: '(max-width: 820px)' }));

import { PLAYER_HELM_HREF, type PlayerHelmView } from '../data/coachhelm-views-shape';
import { PlayerHelmTabs } from '../screens/coachhelm/views/PlayerHelmTabs';
import { useViewSwitch } from '../screens/coachhelm/use-view-switch';

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function View({ read }: { read: Promise<string> }) {
  return <p data-testid="view">{use(read)}</p>;
}

function Harness({ keyed, reads }: { keyed: boolean; reads: Record<string, Promise<string>> }) {
  const [view, setView] = useState('board');
  return (
    <div>
      <button type="button" onClick={() => startTransition(() => setView('profile'))}>
        switch
      </button>
      <Suspense key={keyed ? view : undefined} fallback={<p data-testid="skeleton">skeleton</p>}>
        <View read={reads[view]!} />
      </Suspense>
    </div>
  );
}

async function run(keyed: boolean) {
  // A read already answered, as the view on screen is: React reads its value without suspending.
  const board = Object.assign(Promise.resolve('Board'), { status: 'fulfilled', value: 'Board' }) as Promise<string>;
  const profile = deferred<string>();
  render(<Harness keyed={keyed} reads={{ board, profile: profile.promise }} />);
  await act(async () => {});
  expect(screen.getByTestId('view').textContent).toBe('Board');
  await act(async () => {
    screen.getByRole('button', { name: 'switch' }).click();
  });
  const during = { skeleton: screen.queryByTestId('skeleton') !== null, view: screen.queryByTestId('view')?.textContent ?? null };
  await act(async () => profile.resolve('Profile'));
  return { during, after: screen.getByTestId('view').textContent };
}

describe('a switch of view, as React runs it', () => {
  it('one Suspense in one place keeps the view on screen until the next is ready, then swaps once', async () => {
    const { during, after } = await run(false);
    expect(during).toEqual({ skeleton: false, view: 'Board' });
    expect(after).toBe('Profile');
  });

  it('a Suspense keyed by view draws the skeleton over it (the old page): the premise of not keying it', async () => {
    const { during } = await run(true);
    expect(during.skeleton).toBe(true);
  });
});


/**
 * Rapid switching through `useViewSwitch` (owner rule 4, 2026-10-01): the tabs follow the last tap at once, the view on screen stays
 * (dimmed, busy) until the last choice's view is ready, an earlier choice's view that lands late changes nothing, and tapping back to
 * the view on screen sends the page back to it. The router is replaced by a view change inside the same transition `go` starts, and
 * each view is its own component (keyed), as in the page.
 */
describe('rapid switching between the player’s views', () => {
  const resolvedRead = (v: string) => Object.assign(Promise.resolve(v), { status: 'fulfilled', value: v }) as Promise<string>;
  const order: PlayerHelmView[] = ['board', 'profile', 'standing', 'deep-dive'];

  function View({ view, read }: { view: PlayerHelmView; read: Promise<string> }) {
    const text = use(read);
    const sw = useViewSwitch<PlayerHelmView>(view, (v) => PLAYER_HELM_HREF[v]);
    drawn.push(view);
    return (
      <main data-testid="view" data-view={view} aria-busy={sw.pending || undefined}>
        <PlayerHelmTabs active={sw.shown} onGo={sw.go} />
        <p>{text}</p>
      </main>
    );
  }
  function Page({ reads }: { reads: Record<PlayerHelmView, Promise<string>> }) {
    const [current, setCurrent] = useState<PlayerHelmView>('board');
    nav.push = (href) => setCurrent(order.find((v) => PLAYER_HELM_HREF[v] === href) ?? 'board');
    return (
      <LazyMotion features={domAnimation}>
        <div className="ch-root" data-ui="clubhouse">
          <Suspense fallback={<p data-testid="skeleton">skeleton</p>}>
            <View key={current} view={current} read={reads[current]} />
          </Suspense>
        </div>
      </LazyMotion>
    );
  }
  let drawn: PlayerHelmView[] = [];
  const checked = () => (screen.getByRole('radiogroup', { name: 'CoachHelm view' }).querySelector('[aria-checked="true"]')?.textContent ?? '').trim();
  const tap = async (label: string) =>
    act(async () => {
      screen.getByRole('radio', { name: label }).click();
    });
  async function setup() {
    drawn = [];
    const later = { profile: deferred<string>(), standing: deferred<string>(), 'deep-dive': deferred<string>() };
    const reads = { board: resolvedRead('Board'), profile: later.profile.promise, standing: later.standing.promise, 'deep-dive': later['deep-dive'].promise };
    render(<Page reads={reads} />);
    await act(async () => {});
    return later;
  }

  it('board, profile, standing, deep dive in quick taps: the tabs follow the last tap, the board stays on screen busy, and only the last view is drawn when it is ready', async () => {
    const later = await setup();
    await tap('Game profile');
    await tap('Standing');
    await tap('Deep dive');
    expect(checked()).toBe('Deep dive');
    expect(screen.getByTestId('view').getAttribute('data-view')).toBe('board');
    expect(screen.getByTestId('view').getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByTestId('skeleton')).toBeNull();
    // An earlier choice that lands late changes nothing: the last choice is the one that is waited for.
    await act(async () => later.profile.resolve('Profile'));
    await act(async () => later.standing.resolve('Standing'));
    expect(screen.getByTestId('view').getAttribute('data-view')).toBe('board');
    expect(checked()).toBe('Deep dive');
    await act(async () => later['deep-dive'].resolve('Deep dive'));
    expect(screen.getByTestId('view').getAttribute('data-view')).toBe('deep-dive');
    expect(screen.getByTestId('view').getAttribute('aria-busy')).toBeNull();
    expect(checked()).toBe('Deep dive');
    expect(drawn).not.toContain('profile');
    expect(drawn).not.toContain('standing');
  });

  it('the last tap wins whichever order the views land in (the last view first, then the earlier ones)', async () => {
    const later = await setup();
    await tap('Game profile');
    await tap('Standing');
    await tap('Deep dive');
    await act(async () => later['deep-dive'].resolve('Deep dive'));
    expect(screen.getByTestId('view').getAttribute('data-view')).toBe('deep-dive');
    await act(async () => later.standing.resolve('Standing'));
    await act(async () => later.profile.resolve('Profile'));
    expect(screen.getByTestId('view').getAttribute('data-view')).toBe('deep-dive');
    expect(checked()).toBe('Deep dive');
  });

  it('tapping back to the view on screen while another loads sends the page back to it: the board, not the view that was loading', async () => {
    const later = await setup();
    await tap('Game profile');
    expect(checked()).toBe('Game profile');
    await tap('Board');
    expect(checked()).toBe('Board');
    await act(async () => later.profile.resolve('Profile'));
    expect(screen.getByTestId('view').getAttribute('data-view')).toBe('board');
    expect(screen.getByTestId('view').getAttribute('aria-busy')).toBeNull();
    expect(checked()).toBe('Board');
  });
});
