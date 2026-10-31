import { LazyMotion, domAnimation } from 'motion/react';
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
import { dimmedAt, resetViewSwitchForTests, useViewSwitch } from '../screens/coachhelm/use-view-switch';

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
  const order: PlayerHelmView[] = ['board', 'standing', 'deep-dive'];

  function View({ view, read }: { view: PlayerHelmView; read: Promise<string> }) {
    const text = use(read);
    const sw = useViewSwitch<PlayerHelmView>(view, (v) => PLAYER_HELM_HREF[v]);
    drawn.push(view);
    return (
      <main data-testid="view" data-view={view} aria-busy={sw.pending || undefined} {...sw.enter}>
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
    resetViewSwitchForTests();
    const later = { standing: deferred<string>(), 'deep-dive': deferred<string>() };
    const reads = { board: resolvedRead('Board'), standing: later.standing.promise, 'deep-dive': later['deep-dive'].promise };
    render(<Page reads={reads} />);
    await act(async () => {});
    return later;
  }

  it('board, standing, deep dive in quick taps: the tabs follow the last tap, the board stays on screen busy, and only the last view is drawn when it is ready', async () => {
    const later = await setup();
    await tap('Standing');
    await tap('Deep dive');
    expect(checked()).toBe('Deep dive');
    expect(screen.getByTestId('view').getAttribute('data-view')).toBe('board');
    expect(screen.getByTestId('view').getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByTestId('skeleton')).toBeNull();
    // An earlier choice that lands late changes nothing: the last choice is the one that is waited for.
    await act(async () => later.standing.resolve('Standing'));
    expect(screen.getByTestId('view').getAttribute('data-view')).toBe('board');
    expect(checked()).toBe('Deep dive');
    await act(async () => later['deep-dive'].resolve('Deep dive'));
    expect(screen.getByTestId('view').getAttribute('data-view')).toBe('deep-dive');
    expect(screen.getByTestId('view').getAttribute('aria-busy')).toBeNull();
    expect(checked()).toBe('Deep dive');
    expect(drawn).not.toContain('standing');
  });

  it('the last tap wins whichever order the views land in (the last view first, then the earlier ones)', async () => {
    const later = await setup();
    await tap('Standing');
    await tap('Deep dive');
    await act(async () => later['deep-dive'].resolve('Deep dive'));
    expect(screen.getByTestId('view').getAttribute('data-view')).toBe('deep-dive');
    await act(async () => later.standing.resolve('Standing'));
    expect(screen.getByTestId('view').getAttribute('data-view')).toBe('deep-dive');
    expect(checked()).toBe('Deep dive');
  });

  it('tapping back to the view on screen while another loads sends the page back to it: the board, not the view that was loading', async () => {
    const later = await setup();
    await tap('Standing');
    expect(checked()).toBe('Standing');
    await tap('Board');
    expect(checked()).toBe('Board');
    await act(async () => later.standing.resolve('Standing'));
    expect(screen.getByTestId('view').getAttribute('data-view')).toBe('board');
    expect(screen.getByTestId('view').getAttribute('aria-busy')).toBeNull();
    expect(checked()).toBe('Board');
  });
});


/**
 * The view that lands from a switch settles in (owner, 2026-10-29: the transition between the tabs was abrupt): it is marked to
 * enter from the opacity the view it replaces had dimmed to, so the two are one cross-fade. Never on a hard load, never after a tap
 * back to the view on screen, and the mark is dropped after the beat so a part drawn again later does not settle a second time.
 */
describe('the view that lands from a switch', () => {
  const resolvedRead = (v: string) => Object.assign(Promise.resolve(v), { status: 'fulfilled', value: v }) as Promise<string>;
  const order: PlayerHelmView[] = ['board', 'standing', 'deep-dive'];
  function View({ view, read }: { view: PlayerHelmView; read: Promise<string> }) {
    const text = use(read);
    const sw = useViewSwitch<PlayerHelmView>(view, (v) => PLAYER_HELM_HREF[v]);
    return (
      <main data-testid="view" data-view={view} aria-busy={sw.pending || undefined} {...sw.enter}>
        <PlayerHelmTabs active={sw.shown} onGo={sw.go} />
        <p>{text}</p>
      </main>
    );
  }
  function Page({ reads, start = 'board' }: { reads: Record<PlayerHelmView, Promise<string>>; start?: PlayerHelmView }) {
    const [current, setCurrent] = useState<PlayerHelmView>(start);
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
  const main = () => screen.getByTestId('view');
  const tap = async (label: string) =>
    act(async () => {
      screen.getByRole('radio', { name: label }).click();
    });

  it('is not marked on a hard load: the page is drawn as the server drew it', async () => {
    resetViewSwitchForTests();
    render(<Page reads={{ board: resolvedRead('Board'), standing: resolvedRead('Standing'), 'deep-dive': resolvedRead('Deep dive') }} />);
    await act(async () => {});
    expect(main().hasAttribute('data-ch-enter')).toBe(false);
  });

  it('is marked to enter from where the dim had reached, and the mark is dropped after the beat', async () => {
    resetViewSwitchForTests();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const standing = deferred<string>();
      render(<Page reads={{ board: resolvedRead('Board'), standing: standing.promise, 'deep-dive': resolvedRead('Deep dive') }} />);
      await act(async () => {});
      await tap('Standing');
      expect(main().getAttribute('data-view')).toBe('board');
      expect(main().hasAttribute('data-ch-enter')).toBe(false);
      await act(async () => standing.resolve('Standing'));
      expect(main().getAttribute('data-view')).toBe('standing');
      expect(main().hasAttribute('data-ch-enter')).toBe(true);
      const from = Number(main().style.getPropertyValue('--ch-enter-from'));
      expect(from).toBeGreaterThanOrEqual(0.55);
      expect(from).toBeLessThanOrEqual(1);
      await act(async () => {
        vi.advanceTimersByTime(400);
      });
      expect(main().hasAttribute('data-ch-enter')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a tap back to the view on screen leaves nothing to settle: the next page that mounts is not marked', async () => {
    resetViewSwitchForTests();
    const standing = deferred<string>();
    const { unmount } = render(<Page reads={{ board: resolvedRead('Board'), standing: standing.promise, 'deep-dive': resolvedRead('Deep dive') }} />);
    await act(async () => {});
    await tap('Standing');
    await tap('Board');
    await act(async () => standing.resolve('Standing'));
    expect(main().getAttribute('data-view')).toBe('board');
    expect(main().hasAttribute('data-ch-enter')).toBe(false);
    unmount();
    render(<Page start="standing" reads={{ board: resolvedRead('Board'), standing: resolvedRead('Standing'), 'deep-dive': resolvedRead('Deep dive') }} />);
    await act(async () => {});
    expect(main().hasAttribute('data-ch-enter')).toBe(false);
  });

  it('starts from the dim’s own curve: full at the tap, 0.55 once the quick beat has run, never lighter later', () => {
    expect(dimmedAt(0)).toBe(1);
    expect(dimmedAt(90)).toBeLessThan(0.6);
    expect(dimmedAt(90)).toBeGreaterThan(0.55);
    expect(dimmedAt(180)).toBeCloseTo(0.55, 5);
    expect(dimmedAt(5000)).toBeCloseTo(0.55, 5);
  });
});
