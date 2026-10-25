/**
 * L10, the phone shell feels native (docs/clubhouse/phone/shell-gestures.md): the edge swipe back bound to a pushed
 * screen, the dock a non-immersive push keeps, and the stand-in bar's action. The state machine alone is in
 * edge-swipe.test.tsx; the rendered motion is sampled in WebKit (P001 VERIFY.md).
 */
import { act, render, screen } from '@testing-library/react';
import { useRef, type MutableRefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const haptics = vi.hoisted(() => ({ haptic: vi.fn(), hapticScrub: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }));
const app = vi.hoisted(() => ({ native: false, role: 'coach' as 'coach' | 'player' | null }));
vi.mock('../../lib/haptics', () => haptics);
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/roster' }));
vi.mock('@/lib/utils/capacitor', () => ({ isNativeApp: () => app.native }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: true, updatePreferences: vi.fn() }) }));
vi.mock('../context', () => ({ useClubhouseRole: () => app.role }));

import { PhoneScreen } from '../PhoneScreen';
import { PhoneChromeProvider, PushedTopStandIn, standInAction, usePhoneChromeState } from '../phone-chrome';
import { useEdgeSwipeBack, type EdgeExitHold } from '../use-edge-swipe';

const W = 390;

/** matchMedia answering reduced motion when asked. */
function media({ reduce = false }: { reduce?: boolean } = {}) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query.includes('prefers-reduced-motion: reduce') && reduce,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}

/** A touch event the way WebKit sends one: touches with client coordinates, cancelable, on the element. */
function touch(el: Element, type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel', x: number, y: number, at: number) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  const list = type === 'touchend' || type === 'touchcancel' ? [] : [{ clientX: x, clientY: y, identifier: 1 }];
  Object.defineProperty(ev, 'touches', { value: list });
  Object.defineProperty(ev, 'timeStamp', { value: at });
  let prevented = false;
  const original = ev.preventDefault.bind(ev);
  ev.preventDefault = () => {
    prevented = true;
    original();
  };
  act(() => {
    el.dispatchEvent(ev);
  });
  return { prevented: () => prevented };
}

/** The shell's page parts around a screen, so the page drawing back can be read. */
function shell(children: React.ReactNode) {
  return (
    <div className="ch-root" data-ui="clubhouse">
      <div className="ch-canvas" id="ch-canvas">
        <header className="ch-topbar" data-testid="topbar" />
        <main data-testid="page">page</main>
        {children}
      </div>
    </div>
  );
}

function Harness({ reduced = false, enabled = true, exit, onBack }: { reduced?: boolean; enabled?: boolean; exit: MutableRefObject<EdgeExitHold>; onBack: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useEdgeSwipeBack(ref, { enabled, reduced, exit });
  return shell(
    <section ref={ref} className="ch-pscreen" data-testid="screen">
      <button type="button" className="ch-pbar__back" onClick={onBack}>
        Roster
      </button>
    </section>,
  );
}

let now = 10_000;
const exitHold = (): MutableRefObject<EdgeExitHold> => ({ current: { holding: false, done: vi.fn(), present: true } });

beforeEach(() => {
  now = 10_000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return { x: 0, y: 0, left: 0, top: 0, right: W, bottom: 844, width: W, height: 844, toJSON: () => ({}) } as DOMRect;
  });
  haptics.haptic.mockClear();
  app.native = false;
  app.role = 'coach';
  media();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = '';
  delete (window as unknown as { webkit?: unknown }).webkit;
  delete (window as unknown as { __helmNativeSwipe?: boolean }).__helmNativeSwipe;
  window.history.replaceState(null, '', '/');
});

describe('the edge swipe on a pushed screen', () => {
  function mount(props: Partial<{ reduced: boolean; enabled: boolean }> = {}) {
    const exit = exitHold();
    const onBack = vi.fn();
    render(<Harness exit={exit} onBack={onBack} {...props} />);
    const el = screen.getByTestId('screen');
    return { el, exit, onBack, page: screen.getByTestId('page'), bar: screen.getByTestId('topbar') };
  }
  /** A landed finger past the entry spring, then moved to x with a small drift in y. */
  function swipeTo(el: Element, x: number, { from = 8, steps = 4, dt = 40 }: { from?: number; steps?: number; dt?: number } = {}) {
    now += 600;
    touch(el, 'touchstart', from, 400, now);
    let last = touch(el, 'touchmove', from + 1, 400, now);
    for (let i = 1; i <= steps; i++) {
      now += dt;
      last = touch(el, 'touchmove', from + ((x - from) * i) / steps, 402, now);
    }
    return last;
  }

  it('follows the finger and draws the page back with it, the same parallax as the pop', () => {
    const { el, page, bar } = mount();
    const move = swipeTo(el, 108);
    expect(move.prevented()).toBe(true);
    expect(el.style.translate).toBe('100px 0');
    // A quarter of the share the pop uses (progress 100 / 390), from fully drawn back at rest.
    const shift = parseFloat(page.style.translate);
    expect(shift).toBeCloseTo(-24 * (1 - 100 / W), 1);
    expect(bar.style.translate).toBe(page.style.translate);
  });

  it('vertical scroll wins when the touch starts vertical: nothing moves and the page may scroll', () => {
    const { el, page } = mount();
    now += 600;
    touch(el, 'touchstart', 8, 300, now);
    const down = touch(el, 'touchmove', 10, 340, now + 16);
    const more = touch(el, 'touchmove', 90, 380, now + 32);
    expect(down.prevented()).toBe(false);
    expect(more.prevented()).toBe(false);
    expect(el.style.translate).toBe('');
    expect(page.style.translate).toBe('');
  });

  it('starts only within the left 20px', () => {
    const { el } = mount();
    const move = swipeTo(el, 200, { from: 24 });
    expect(move.prevented()).toBe(false);
    expect(el.style.translate).toBe('');
  });

  it('lets go past 35% and the screen leaves on its own spring while its Back runs', () => {
    const { el, exit, onBack, page } = mount();
    swipeTo(el, 170);
    now += 200;
    touch(el, 'touchend', 0, 0, now);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(exit.current.holding).toBe(true);
    expect(el.style.translate).toBe(`${W}px 0`);
    expect(el.style.transition).toMatch(/^translate \d+ms linear\(/);
    // The page is left where it is for PhoneUnderlay to carry home from there on the same spring.
    expect(parseFloat(page.style.translate)).toBeLessThan(0);
    // The exit is handed back once the screen has gone.
    act(() => {
      el.dispatchEvent(Object.assign(new Event('transitionend', { bubbles: true }), { propertyName: 'translate' }));
    });
    expect(exit.current.holding).toBe(false);
    expect(exit.current.done).toHaveBeenCalledTimes(1);
  });

  it('lets go short of 35% slowly and it springs back: no Back, the page returns to drawn back', () => {
    const { el, exit, onBack } = mount();
    swipeTo(el, 100);
    now += 300;
    touch(el, 'touchend', 0, 0, now);
    expect(onBack).not.toHaveBeenCalled();
    expect(exit.current.holding).toBe(false);
    expect(el.style.translate).toBe('');
    expect(el.style.transition).toMatch(/^translate \d+ms linear\(/);
  });

  it('a quick flick from a short way pops it', () => {
    const { el, onBack } = mount();
    swipeTo(el, 70, { steps: 3, dt: 10 });
    now += 4;
    touch(el, 'touchend', 0, 0, now);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('ticks the selection haptic as the commit mark is crossed, and again crossing back', () => {
    const { el } = mount();
    now += 600;
    touch(el, 'touchstart', 8, 400, now);
    touch(el, 'touchmove', 20, 400, now + 16);
    expect(haptics.haptic).not.toHaveBeenCalled();
    touch(el, 'touchmove', 160, 400, now + 32);
    expect(haptics.haptic).toHaveBeenCalledTimes(1);
    expect(haptics.haptic).toHaveBeenLastCalledWith('select');
    touch(el, 'touchmove', 170, 400, now + 48);
    expect(haptics.haptic).toHaveBeenCalledTimes(1);
    touch(el, 'touchmove', 100, 400, now + 64);
    expect(haptics.haptic).toHaveBeenCalledTimes(2);
  });

  it('is off while a sheet or dialog is open, and on a round tracking route', () => {
    const { el } = mount();
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.appendChild(dialog);
    expect(swipeTo(el, 150).prevented()).toBe(false);
    expect(el.style.translate).toBe('');
    dialog.remove();
    window.history.replaceState(null, '', '/golf/dashboard/rounds/continue/abc');
    expect(swipeTo(el, 150).prevented()).toBe(false);
    window.history.replaceState(null, '', '/golf/dashboard/roster');
    expect(swipeTo(el, 150).prevented()).toBe(true);
  });

  it('in the iOS app it runs only once the shell says the native swipe is off', () => {
    app.native = true;
    const { el } = mount();
    expect(swipeTo(el, 150).prevented()).toBe(false);
    (window as unknown as { webkit: unknown }).webkit = { messageHandlers: { helmNav: { postMessage: vi.fn() } } };
    expect(swipeTo(el, 150).prevented()).toBe(false);
    (window as unknown as { __helmNativeSwipe?: boolean }).__helmNativeSwipe = true;
    expect(swipeTo(el, 150).prevented()).toBe(false);
    (window as unknown as { __helmNativeSwipe?: boolean }).__helmNativeSwipe = false;
    expect(swipeTo(el, 150).prevented()).toBe(true);
  });

  it('waits out the screen’s own entry spring, and takes no touch while the screen is leaving', () => {
    const { el, exit } = mount();
    touch(el, 'touchstart', 8, 400, now + 100);
    expect(touch(el, 'touchmove', 60, 402, now + 120).prevented()).toBe(false);
    touch(el, 'touchend', 0, 0, now + 140);
    exit.current.present = false;
    expect(swipeTo(el, 150).prevented()).toBe(false);
  });

  it('needs the screen’s own Back: a form’s Cancel is not one', () => {
    const exit = exitHold();
    function Form() {
      const ref = useRef<HTMLElement>(null);
      useEdgeSwipeBack(ref, { enabled: true, reduced: false, exit });
      return (
        <section ref={ref} data-testid="screen">
          <button type="button" className="ch-pbar__back is-text">
            Cancel
          </button>
        </section>
      );
    }
    render(<Form />);
    const el = screen.getByTestId('screen');
    now += 600;
    touch(el, 'touchstart', 8, 400, now);
    expect(touch(el, 'touchmove', 80, 402, now + 16).prevented()).toBe(false);
  });

  it('a touch the system takes (iOS’s own swipe) puts everything back at once', () => {
    const { el, page } = mount();
    swipeTo(el, 90);
    expect(el.style.translate).toBe('82px 0');
    touch(el, 'touchcancel', 0, 0, now + 10);
    expect(el.style.translate).toBe('');
    expect(parseFloat(page.style.translate)).toBeCloseTo(-24, 1);
  });

  it('with reduced motion nothing follows the finger, and a commit pops it at once', () => {
    const { el, onBack, page } = mount({ reduced: true });
    const move = swipeTo(el, 170);
    expect(move.prevented()).toBe(true);
    expect(el.style.translate).toBe('');
    expect(page.style.translate).toBe('');
    now += 200;
    touch(el, 'touchend', 0, 0, now);
    expect(onBack).toHaveBeenCalledTimes(1);
    onBack.mockClear();
    swipeTo(el, 60);
    now += 300;
    touch(el, 'touchend', 0, 0, now);
    expect(onBack).not.toHaveBeenCalled();
  });

  it('a Back that is refused brings the screen home again', () => {
    const exit = exitHold();
    const refused = vi.fn();
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'] });
    render(<Harness exit={exit} onBack={refused} />);
    const el = screen.getByTestId('screen');
    swipeTo(el, 170);
    now += 200;
    touch(el, 'touchend', 0, 0, now);
    expect(exit.current.holding).toBe(true);
    // The screen is still present two frames later: nothing took it away.
    act(() => {
      vi.advanceTimersByTime(40);
    });
    expect(exit.current.holding).toBe(false);
    expect(el.style.translate).toBe('');
  });

  it('a screen that goes before its exit spring ends leaves no timer or frame behind, and hands the exit back once', () => {
    const exit = exitHold();
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'] });
    const view = render(<Harness exit={exit} onBack={vi.fn()} />);
    swipeTo(screen.getByTestId('screen'), 170);
    now += 200;
    touch(screen.getByTestId('screen'), 'touchend', 0, 0, now);
    expect(exit.current.holding).toBe(true);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(exit.current.holding).toBe(false);
    expect(exit.current.done).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(exit.current.done).toHaveBeenCalledTimes(1);
  });

  it('is off when not enabled (a covered screen)', () => {
    const { el } = mount({ enabled: false });
    expect(swipeTo(el, 150).prevented()).toBe(false);
  });
});

describe('in the iOS app a pushed screen holds the swipe for the web gesture (helmNav { webSwipe })', () => {
  /** The claim is posted once the commit is over (a microtask). */
  const settle = () => act(async () => {
    await Promise.resolve();
  });
  const bridge = () => {
    const postMessage = vi.fn();
    (window as unknown as { webkit: unknown }).webkit = { messageHandlers: { helmNav: { postMessage } } };
    return postMessage;
  };
  const webSwipe = (post: ReturnType<typeof vi.fn>) => post.mock.calls.map(([body]) => (body as { webSwipe?: boolean }).webSwipe);

  it('posts true while the screen is up and false once it has gone', async () => {
    app.native = true;
    const post = bridge();
    const view = render(<Harness exit={exitHold()} onBack={vi.fn()} />);
    await settle();
    expect(webSwipe(post)).toEqual([true]);
    view.unmount();
    await settle();
    expect(webSwipe(post)).toEqual([true, false]);
  });

  it('a PhoneScreen with a chevron Back holds it; covered, it hands it to the screen above', async () => {
    app.native = true;
    const post = bridge();
    const bar = (label: string) => (
      <button type="button" className="ch-pbar__back">
        {label}
      </button>
    );
    const view = render(
      <PhoneChromeProvider>
        {shell(
          <PhoneScreen labelledBy="a">
            {bar('Roster')}
            <h1 id="a">A</h1>
          </PhoneScreen>,
        )}
      </PhoneChromeProvider>,
    );
    await settle();
    expect(webSwipe(post)).toEqual([true]);
    view.rerender(
      <PhoneChromeProvider>
        {shell(
          <>
            <PhoneScreen labelledBy="a" covered>
              {bar('Roster')}
              <h1 id="a">A</h1>
            </PhoneScreen>
            <PhoneScreen labelledBy="b">
              {bar('Chat')}
              <h1 id="b">B</h1>
            </PhoneScreen>
          </>,
        )}
      </PhoneChromeProvider>,
    );
    await settle();
    // Handed over in one commit: the shell's own swipe never came back on in between.
    expect(webSwipe(post)).toEqual([true]);
    view.unmount();
    await settle();
    expect(webSwipe(post)).toEqual([true, false]);
  });

  it('claims nothing outside the app (no bridge), even with Capacitor saying it is native', async () => {
    app.native = true;
    const win = window as unknown as { __helmWebSwipeResync?: () => void };
    delete win.__helmWebSwipeResync;
    const view = render(<Harness exit={exitHold()} onBack={vi.fn()} />);
    await settle();
    // A claim installs the shell's resync hook; with no bridge there was none to make.
    expect(win.__helmWebSwipeResync).toBeUndefined();
    view.unmount();
    await settle();
    expect(win.__helmWebSwipeResync).toBeUndefined();
  });

  it('a screen with no chevron Back (a form’s Cancel) leaves the native swipe alone', async () => {
    app.native = true;
    const post = bridge();
    const exit = exitHold();
    function Form() {
      const ref = useRef<HTMLElement>(null);
      useEdgeSwipeBack(ref, { enabled: true, reduced: false, exit });
      return (
        <section ref={ref}>
          <button type="button" className="ch-pbar__back is-text">
            Cancel
          </button>
        </section>
      );
    }
    const view = render(<Form />);
    await settle();
    view.unmount();
    await settle();
    expect(post).not.toHaveBeenCalled();
  });

  it('a covered (not enabled) screen does not hold it', async () => {
    app.native = true;
    const post = bridge();
    render(<Harness exit={exitHold()} onBack={vi.fn()} enabled={false} />);
    await settle();
    expect(post).not.toHaveBeenCalled();
  });
});

/** What the shell reads from the chrome. */
function Probe() {
  const s = usePhoneChromeState();
  return <output data-testid="state">{JSON.stringify({ immersive: s.immersive, dockKept: s.dockKept })}</output>;
}
const state = () => JSON.parse(screen.getByTestId('state').textContent ?? '{}') as { immersive: boolean; dockKept: boolean };

describe('a push keeps the dock unless it is immersive (NATIVE_FEEL P2-3)', () => {
  function push(props: Partial<React.ComponentProps<typeof PhoneScreen>> = {}, extra?: React.ReactNode) {
    return render(
      <PhoneChromeProvider>
        <Probe />
        {shell(
          <>
            <PhoneScreen labelledBy="t" {...props}>
              <h1 id="t">Profile</h1>
            </PhoneScreen>
            {extra}
          </>,
        )}
      </PhoneChromeProvider>,
    );
  }

  it('a profile or details push keeps the dock: the top bar stands down, the dock stays', () => {
    push();
    expect(state()).toEqual({ immersive: true, dockKept: true });
    expect(document.querySelector('.ch-pscreen')?.hasAttribute('data-ch-keeps-dock')).toBe(true);
  });

  it('a screen with a composer is immersive: the dock goes with it', () => {
    push({ keyboardAware: true });
    expect(state()).toEqual({ immersive: true, dockKept: false });
    expect(document.querySelector('.ch-pscreen')?.hasAttribute('data-ch-keeps-dock')).toBe(false);
  });

  it('immersive can be asked for, or declined by a keyboard-aware screen', () => {
    push({ immersive: true });
    expect(state().dockKept).toBe(false);
  });

  it('a keyboard-aware screen can opt out of immersive', () => {
    push({ keyboardAware: true, immersive: false });
    expect(state()).toEqual({ immersive: true, dockKept: true });
  });

  it('with an immersive screen over a plain one the dock goes', () => {
    render(
      <PhoneChromeProvider>
        <Probe />
        {shell(
          <>
            <PhoneScreen labelledBy="a">
              <h1 id="a">A</h1>
            </PhoneScreen>
            <PhoneScreen labelledBy="b" keyboardAware>
              <h1 id="b">B</h1>
            </PhoneScreen>
          </>,
        )}
      </PhoneChromeProvider>,
    );
    expect(state()).toEqual({ immersive: true, dockKept: false });
  });

  it('nothing is held once the screen is gone', () => {
    const view = push();
    view.rerender(
      <PhoneChromeProvider>
        <Probe />
        {shell(null)}
      </PhoneChromeProvider>,
    );
    expect(state()).toEqual({ immersive: false, dockKept: false });
  });

  it('stops short of the Resume round accessory by what it covers, and by nothing without one', () => {
    const resume = document.createElement('a');
    resume.className = 'ch-resume';
    // Its own property (a spy on it would be the prototype's, shared with the screen).
    resume.getBoundingClientRect = () => ({ x: 12, y: 770, left: 12, top: 770, right: 378, bottom: 818, width: 366, height: 48, toJSON: () => ({}) }) as DOMRect;
    render(
      <PhoneChromeProvider>
        {shell(
          <PhoneScreen labelledBy="t">
            <h1 id="t">Profile</h1>
          </PhoneScreen>,
        )}
      </PhoneChromeProvider>,
    );
    const el = document.querySelector<HTMLElement>('.ch-pscreen')!;
    expect(el.style.getPropertyValue('--ch-pscreen-dock')).toBe('0px');
    const dock = document.createElement('div');
    dock.className = 'ch-dock';
    dock.appendChild(resume);
    document.querySelector('.ch-root')!.appendChild(dock);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    // The screen is 844 tall in this DOM; the accessory starts at 770: 74 plus 8 clear.
    expect(el.style.getPropertyValue('--ch-pscreen-dock')).toBe('82px');
  });
});

describe('the stand-in bar draws the action the page will', () => {
  const top = (title: string, form = false) => ({ back: 'Back', title, form });

  it('knows the always-there actions from the address’s bar', () => {
    expect(standInAction(top('Player stats'), 'coach')?.label).toBe('Share');
    expect(standInAction(top('Qualifier'), 'coach')?.label).toBe('Qualifier actions');
    expect(standInAction(top('Qualifier'), 'player')).toBeNull();
    // A form's submit joins with the form; a page with no action has none.
    expect(standInAction(top('New qualifier', true), 'coach')).toBeNull();
    expect(standInAction(top('Round'), 'coach')).toBeNull();
  });

  it('renders it in the action’s place as a picture of the key: hidden from assistive tech and not pressable', () => {
    const { container } = render(<PushedTopStandIn top={top('Player stats')} />);
    const key = container.querySelector('.ch-pbar__right [data-ch-standin]');
    expect(key).not.toBeNull();
    expect(key?.getAttribute('aria-hidden')).toBe('true');
    expect(key?.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('button.ch-pbar__icon')).toBeNull();
  });

  it('keeps the right slot empty where the page has no action', () => {
    const { container } = render(<PushedTopStandIn top={top('Round')} />);
    expect(container.querySelector('.ch-pbar__right')?.children).toHaveLength(0);
  });
});
