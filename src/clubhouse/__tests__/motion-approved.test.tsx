/**
 * The motion set the owner approved on 2026-10-08: the page drawing back under a pushed screen (CH-1618), a page
 * fading in over its skeleton (CH-1619), the switch thumb's stretch (CH-1620), wheel easing that leaves a trackpad
 * alone (CH-1621) and the app's pull to refresh (CH-1909, CH-1622, CH-1709). The rendered motion is sampled in WebKit
 * (P001 VERIFY.md); these pin the mechanics.
 */
import { act, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useEffect, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const haptics = vi.hoisted(() => ({ haptic: vi.fn(), hapticScrub: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const prefs = vi.hoisted(() => ({ showAnimations: true }));
vi.mock('../lib/haptics', () => haptics);
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard' }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: prefs.showAnimations, updatePreferences: vi.fn() }) }));

import { chTrackpadGesture } from '../lib/smooth-scroll';
import { PhoneScreen } from '../shell/PhoneScreen';
import { PullToRefresh } from '../shell/PullToRefresh';
import { RouteFrame } from '../shell/RouteFrame';
import { CH_UNDERLAY_SHIFT, PhoneChromeProvider, placeUnderlay, underlayParts, usePhoneChromeState } from '../shell/phone-chrome';

/** matchMedia answering the phone layout, and reduced motion when asked. */
function media({ phone = true, reduce = false }: { phone?: boolean; reduce?: boolean } = {}) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: (query.includes('max-width: 820px') && phone) || (query.includes('prefers-reduced-motion: reduce') && reduce),
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

beforeEach(() => {
  haptics.haptic.mockClear();
  router.refresh.mockClear();
  prefs.showAnimations = true;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('CH-1618 the page draws back under a pushed screen', () => {
  /** The shell's phone layout: bars, the offline banner, and a page whose screens sit beside its list. */
  function shellDom() {
    document.body.innerHTML = `
      <div class="ch-root" data-ui="clubhouse">
        <div class="ch-app">
          <div class="ch-canvas" id="ch-canvas">
            <header class="ch-topbar"></header>
            <div class="ch-offline"></div>
            <div class="ch-frame-route" id="ch-content">
              <main class="page">
                <div class="list"></div>
                <dialog class="sheet"></dialog>
                <section class="ch-pscreen"></section>
              </main>
            </div>
          </div>
        </div>
        <nav class="ch-tabbar"></nav>
      </div>`;
    const q = (s: string) => document.querySelector<HTMLElement>(s)!;
    return { q };
  }

  it('moves the bars and every part of the page that holds no screen, never a screen, its ancestors or a dialog', () => {
    const { q } = shellDom();
    const parts = underlayParts();
    expect(parts).toEqual(expect.arrayContaining([q('.ch-tabbar'), q('.ch-topbar'), q('.ch-offline'), q('.list')]));
    for (const still of ['.ch-pscreen', '.ch-frame-route', 'main.page', '.sheet', '.ch-canvas']) expect(parts).not.toContain(q(still));
  });

  it('draws back a quarter of the width at full progress, in proportion on the way, and clears at rest', () => {
    const { q } = shellDom();
    const parts = underlayParts();
    placeUnderlay(parts, 1);
    expect(CH_UNDERLAY_SHIFT).toBe(0.24);
    expect(q('.list').style.translate).toBe('-24.000vw 0');
    expect(q('.ch-topbar').style.willChange).toBe('transform');
    placeUnderlay(parts, 0.5);
    expect(q('.ch-tabbar').style.translate).toBe('-12.000vw 0');
    placeUnderlay(parts, 0);
    for (const el of parts) {
      expect(el.style.translate).toBe('');
      expect(el.style.willChange).toBe('');
    }
  });

  function Pushed({ children }: { children: ReactNode }) {
    return <PhoneChromeProvider>{children}</PhoneChromeProvider>;
  }
  function Probe({ seen }: { seen: (pushed: boolean) => void }) {
    const { pushed } = usePhoneChromeState();
    useEffect(() => seen(pushed));
    return null;
  }

  it('holds the page back while a screen is up, and lets go when it leaves', () => {
    const seen = vi.fn();
    const view = render(
      <Pushed>
        <Probe seen={seen} />
        <PhoneScreen labelledBy="t">
          <h1 id="t">Thread</h1>
        </PhoneScreen>
      </Pushed>,
    );
    expect(seen).toHaveBeenLastCalledWith(true);
    view.rerender(
      <Pushed>
        <Probe seen={seen} />
      </Pushed>,
    );
    expect(seen).toHaveBeenLastCalledWith(false);
  });

  it('a covered screen draws back and dims with the page; with reduced motion it holds still', () => {
    const view = render(
      <Pushed>
        <PhoneScreen labelledBy="t" covered>
          <h1 id="t">Thread</h1>
        </PhoneScreen>
      </Pushed>,
    );
    expect(view.container.querySelector('.ch-pscreen')!.hasAttribute('data-ch-covered')).toBe(true);
    view.unmount();
    prefs.showAnimations = false;
    const still = render(
      <Pushed>
        <PhoneScreen labelledBy="t2" covered>
          <h1 id="t2">Thread</h1>
        </PhoneScreen>
      </Pushed>,
    );
    expect(still.container.querySelector('.ch-pscreen')!.hasAttribute('data-ch-covered')).toBe(false);
  });

  it('dims through a scrim over the bars and under every screen, and a covered screen through its own veil', () => {
    const shell = readFileSync(join(process.cwd(), 'src/clubhouse/styles/shell.css'), 'utf8');
    expect(shell).toMatch(/\.ch-pscrim \{\s*position: fixed;\s*inset: 0;\s*z-index: calc\(var\(--ch-z-sticky\) \+ 5\);/);
    expect(shell).toMatch(/\.ch-pscreen\[data-ch-covered\]::after \{\s*opacity: 1;/);
    expect(shell).toMatch(/html\[data-ch-ua-pop\] \.ch-pscreen::after \{\s*transition: none;/);
  });
});

describe('CH-1619 a page fades in over its route skeleton', () => {
  // Keyed apart, as a Suspense boundary keeps its fallback and its content: React never reuses one for the other.
  const skeleton = (
    <main key="skeleton" aria-busy="true" aria-label="Loading roster">
      <span className="ch-skel" />
    </main>
  );
  function fadeSpy() {
    const play = vi.fn();
    const pause = vi.fn();
    const animate = vi.fn(() => ({ play, pause }) as unknown as Animation);
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, writable: true, value: animate });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(performance.now());
      return 0;
    });
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    return { animate, play, pause };
  }
  const flush = () => act(async () => await Promise.resolve());

  it('never on the first paint of the page the document loaded', async () => {
    vi.resetModules();
    const { RouteFrame: Fresh } = await import('../shell/RouteFrame');
    const { animate } = fadeSpy();
    const view = render(<Fresh routeKey="a">{skeleton}</Fresh>);
    view.rerender(
      <Fresh routeKey="a">
        <main key="page">Roster</main>
      </Fresh>,
    );
    await flush();
    expect(animate).not.toHaveBeenCalled();
    view.unmount();
  });

  // Native-feel audit 2026-10-08 (P0-2, P0-3): the fade runs only once the skeleton has shown and the page crossfade is
  // over (the 300ms hold plus the 180ms fade), so the page never fades twice at once.
  it('after a navigation, once, over the press beat, opacity only, started when the page can paint', async () => {
    const { animate, play, pause } = fadeSpy();
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const view = render(
      <RouteFrame routeKey="home">
        <main>Home</main>
      </RouteFrame>,
    );
    view.rerender(<RouteFrame routeKey="roster">{skeleton}</RouteFrame>);
    now += 480;
    view.rerender(
      <RouteFrame routeKey="roster">
        <main key="page">Roster</main>
      </RouteFrame>,
    );
    await flush();
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate).toHaveBeenCalledWith([{ opacity: 0 }, { opacity: 1 }], { duration: 110, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    expect(pause).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(1);
    // An update inside the page afterwards never fades it again.
    view.rerender(
      <RouteFrame routeKey="roster">
        <main key="page">Roster, refreshed</main>
        <aside>More</aside>
      </RouteFrame>,
    );
    await flush();
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('not at all with reduced motion or Animations off', async () => {
    prefs.showAnimations = false;
    const { animate } = fadeSpy();
    const view = render(
      <RouteFrame routeKey="home">
        <main>Home</main>
      </RouteFrame>,
    );
    view.rerender(<RouteFrame routeKey="roster">{skeleton}</RouteFrame>);
    view.rerender(
      <RouteFrame routeKey="roster">
        <main key="page">Roster</main>
      </RouteFrame>,
    );
    await flush();
    expect(animate).not.toHaveBeenCalled();
  });

  describe('a skeleton waits 300ms with the old page up (native-feel audit 2026-10-08, P0-2)', () => {
    const hold = () => document.documentElement.hasAttribute('data-ch-vt-hold');
    function withViewTransitions() {
      Object.defineProperty(document, 'startViewTransition', { configurable: true, writable: true, value: vi.fn() });
      return () => delete (document as { startViewTransition?: unknown }).startViewTransition;
    }

    it('holds while the skeleton is up and lets go, without a second fade, when the page arrives first', async () => {
      const restore = withViewTransitions();
      const { animate } = fadeSpy();
      let now = 1000;
      vi.spyOn(performance, 'now').mockImplementation(() => now);
      const view = render(
        <RouteFrame routeKey="home">
          <main>Home</main>
        </RouteFrame>,
      );
      expect(hold()).toBe(false);
      view.rerender(<RouteFrame routeKey="roster">{skeleton}</RouteFrame>);
      expect(hold()).toBe(true);
      now += 120;
      view.rerender(
        <RouteFrame routeKey="roster">
          <main key="page">Roster</main>
        </RouteFrame>,
      );
      await flush();
      expect(hold()).toBe(false);
      expect(animate).not.toHaveBeenCalled();
      view.unmount();
      restore();
    });

    it('never on a hard load, and lets go when the route changes again', async () => {
      const restore = withViewTransitions();
      fadeSpy();
      vi.resetModules();
      const { RouteFrame: Fresh } = await import('../shell/RouteFrame');
      const view = render(<Fresh routeKey="a">{skeleton}</Fresh>);
      expect(hold()).toBe(false);
      view.unmount();
      const nav = render(
        <RouteFrame routeKey="home">
          <main>Home</main>
        </RouteFrame>,
      );
      nav.rerender(<RouteFrame routeKey="roster">{skeleton}</RouteFrame>);
      expect(hold()).toBe(true);
      nav.rerender(
        <RouteFrame routeKey="calendar">
          <main key="cal">Calendar</main>
        </RouteFrame>,
      );
      expect(hold()).toBe(false);
      nav.unmount();
      restore();
    });

    it('the skeleton and the old page wait the same 300ms, on a navigation only', () => {
      const base = readFileSync(join(process.cwd(), 'src/clubhouse/styles/base.css'), 'utf8');
      const tokens = readFileSync(join(process.cwd(), 'src/clubhouse/styles/tokens.css'), 'utf8');
      const shell = readFileSync(join(process.cwd(), 'src/clubhouse/styles/shell.css'), 'utf8');
      expect(tokens).toContain('--ch-dur-vt-hold: 300ms;');
      expect(base).toMatch(/html\[data-ch-vt-hold\] \[data-ui='clubhouse'\] main\[aria-busy='true'\]\[aria-label\^='Loading'\] \{\s*animation-delay: var\(--ch-dur-vt-hold\);/);
      expect(shell).toMatch(/html\[data-ch-vt-hold\]:has\(\[data-ui='clubhouse'\]\)::view-transition-old\(ch-page\) \{\s*animation-delay: var\(--ch-dur-vt-hold\);/);
      // A hard load's skeleton shows at once.
      expect(tokens).toContain('--ch-skel-delay: 0ms;');
    });
  });
});

describe('the bars never fade or move during a page change (native-feel audit 2026-10-08, P0-3)', () => {
  const shell = readFileSync(join(process.cwd(), 'src/clubhouse/styles/shell.css'), 'utf8');
  it('names the top bar and tab bar, shows their new state at once and hides the old', () => {
    expect(shell).toMatch(/\[data-ui='clubhouse'\] \.ch-topbar \{\s*view-transition-name: ch-topbar;/);
    expect(shell).toMatch(/\[data-ui='clubhouse'\] \.ch-tabbar \{\s*view-transition-name: ch-tabbar;/);
    for (const bar of ['ch-topbar', 'ch-tabbar']) {
      expect(shell).toContain(`html:has([data-ui='clubhouse'])::view-transition-group(${bar})`);
      expect(shell).toContain(`html:has([data-ui='clubhouse'])::view-transition-new(${bar})`);
      expect(shell).toContain(`html:has([data-ui='clubhouse'])::view-transition-old(${bar})`);
    }
    expect(shell).toMatch(/::view-transition-new\(ch-tabbar\) \{\s*animation: none;/);
    expect(shell).toMatch(/::view-transition-old\(ch-tabbar\) \{\s*display: none;/);
  });
});

describe('CH-1620 the switch thumb stretches while held', () => {
  const controls = readFileSync(join(process.cwd(), 'src/clubhouse/styles/controls.css'), 'utf8');

  it('by a fifth of its width toward its travel, on the scale property, never its width', () => {
    const held = /@media \(prefers-reduced-motion: no-preference\) \{\s*\.ch-switch:not\(\.is-disabled\):not\(\.is-busy\):active \.ch-switch__thumb \{\s*scale: 1\.2 1;/;
    expect(controls).toMatch(held);
    // Off it grows from its left edge; on, from the track's inner right edge, whatever size a page draws the track.
    expect(controls).toMatch(/\.ch-switch__thumb \{[^}]*transform-origin: left center;/);
    expect(controls).toMatch(/input:checked \+ \.ch-switch__track \.ch-switch__thumb \{[^}]*transform-origin: calc\(100cqw - 4px\) center;/);
    expect(controls).toMatch(/\.ch-switch__track \{[^}]*container-type: inline-size;/);
    expect(controls).not.toMatch(/transition:[^;]*\bwidth\b[^;]*;[^}]*\.ch-switch__thumb/);
  });

  it('is off with Animations off, as the press is', () => {
    expect(controls).toMatch(/\[data-motion='off'\] \.ch-switch:not\(\.is-disabled\):not\(\.is-busy\):active \.ch-switch__thumb \{\s*scale: none;/);
  });
});

describe('CH-1621 a Mac trackpad scrolls natively', () => {
  const wheel = (deltaY: number, timeStamp: number, deltaX = 0, deltaMode = 0) => {
    const e = new WheelEvent('wheel', { deltaY, deltaX, deltaMode });
    Object.defineProperty(e, 'timeStamp', { value: timeStamp });
    return e;
  };
  function onMac(mac: boolean) {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue(mac ? 'MacIntel' : 'Win32');
  }

  it('whole-pixel or sideways deltas are a trackpad; fractional line steps are a notched wheel', () => {
    onMac(true);
    expect(chTrackpadGesture()(wheel(12, 100))).toBe(true);
    expect(chTrackpadGesture()(wheel(0, 100, 3))).toBe(true);
    expect(chTrackpadGesture()(wheel(4.000244140625, 100))).toBe(false);
    expect(chTrackpadGesture()(wheel(3, 100, 0, 1))).toBe(false);
  });

  it('the first event decides for the whole gesture; a pause starts a new one', () => {
    onMac(true);
    const fromTrackpad = chTrackpadGesture();
    expect(fromTrackpad(wheel(4.000244140625, 100))).toBe(false);
    expect(fromTrackpad(wheel(8, 140))).toBe(false);
    expect(fromTrackpad(wheel(6, 400))).toBe(true);
    expect(fromTrackpad(wheel(2.5, 420))).toBe(true);
  });

  it('off the Mac every wheel eases, as before', () => {
    onMac(false);
    expect(chTrackpadGesture()(wheel(12, 100))).toBe(false);
  });
});

describe('CH-1909 pull to refresh in the iPhone app', () => {
  /** A phone page at its top in the shell, with the pull mounted. */
  function app({ inApp = true }: { inApp?: boolean } = {}) {
    if (inApp) document.body.classList.add('capacitor', 'capacitor-ios');
    document.body.innerHTML = `
      <div class="ch-root" data-ui="clubhouse">
        <div class="ch-canvas" id="ch-canvas"><header class="ch-topbar"></header><div class="ch-frame-route" id="ch-content"><main class="page"><p class="row">Row</p></main></div></div>
        <div class="host"></div>
      </div>`;
    const host = document.querySelector<HTMLElement>('.host')!;
    const view = render(<PullToRefresh pathname="/golf/dashboard" />, { container: host });
    const row = document.querySelector<HTMLElement>('.row')!;
    const route = document.getElementById('ch-content')!;
    return { view, row, route, band: () => document.querySelector<HTMLElement>('.ch-ptr') };
  }
  /** A touch as WebKit sends it, on `target`, at `y`. */
  function touch(target: Element, type: string, y: number, x = 100) {
    const e = new Event(type, { bubbles: true, cancelable: true });
    const list = type === 'touchend' ? [] : [{ clientX: x, clientY: y, identifier: 1 }];
    Object.defineProperties(e, { touches: { value: list }, changedTouches: { value: [{ clientX: x, clientY: y, identifier: 1 }] } });
    act(() => {
      target.dispatchEvent(e);
    });
    return e;
  }
  function pull(target: Element, travel: number, { dy = 1 }: { dy?: number } = {}) {
    touch(target, 'touchstart', 300);
    const moves: Event[] = [];
    for (let i = 1; i <= 12; i++) moves.push(touch(target, 'touchmove', 300 + dy * (travel * i) / 12));
    touch(target, 'touchend', 300 + dy * travel);
    return moves;
  }

  it('draws nothing and listens to nothing in a browser: Safari keeps its own pull', () => {
    media();
    const { band, row } = app({ inApp: false });
    expect(band()).toBeNull();
    const moves = pull(row, 200);
    expect(moves.some((m) => m.defaultPrevented)).toBe(false);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('past the trigger: the medium haptic once, one refresh, the spinner turning, the page held at it', () => {
    media({ reduce: true });
    const { band, row, route } = app();
    expect(band()!.dataset.state).toBe('rest');
    const moves = pull(row, 220);
    expect(moves.every((m) => m.defaultPrevented)).toBe(true);
    expect(haptics.haptic).toHaveBeenCalledTimes(1);
    expect(haptics.haptic).toHaveBeenCalledWith('commit');
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(band()!.dataset.state).toBe('spin');
    // Reduced motion: let go, it settles at the spinner at once.
    expect(route.style.translate).toBe('0 52.00px');
  });

  it('short of the trigger it springs home with no refresh and no haptic', () => {
    media({ reduce: true });
    const { band, row, route } = app();
    pull(row, 40);
    expect(router.refresh).not.toHaveBeenCalled();
    expect(haptics.haptic).not.toHaveBeenCalled();
    expect(route.style.translate).toBe('');
    expect(band()!.dataset.state).toBe('rest');
  });

  it('a first move up the page, or sideways, stays native', () => {
    media();
    const { row } = app();
    expect(pull(row, 120, { dy: -1 }).some((m) => m.defaultPrevented)).toBe(false);
    touch(row, 'touchstart', 300, 100);
    const sideways = touch(row, 'touchmove', 302, 140);
    touch(row, 'touchend', 302, 140);
    expect(sideways.defaultPrevented).toBe(false);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('never starts below the top of the page, under a pushed screen, in a full-screen flow or from the bar', () => {
    media();
    const { row } = app();
    const root = document.querySelector('.ch-root')!;
    root.setAttribute('data-phone-immersive', '');
    expect(pull(row, 220).some((m) => m.defaultPrevented)).toBe(false);
    root.removeAttribute('data-phone-immersive');
    root.setAttribute('data-phone-notabs', '');
    expect(pull(row, 220).some((m) => m.defaultPrevented)).toBe(false);
    root.removeAttribute('data-phone-notabs');
    expect(pull(document.querySelector('.ch-topbar')!, 220).some((m) => m.defaultPrevented)).toBe(false);
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(40);
    expect(pull(row, 220).some((m) => m.defaultPrevented)).toBe(false);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('goes home once the read has landed and the spinner has shown its minimum', () => {
    vi.useFakeTimers();
    media({ reduce: true });
    const { band, row, route } = app();
    pull(row, 220);
    expect(route.style.translate).toBe('0 52.00px');
    act(() => vi.advanceTimersByTime(700));
    expect(route.style.translate).toBe('');
    expect(band()!.dataset.state).toBe('rest');
  });
});
