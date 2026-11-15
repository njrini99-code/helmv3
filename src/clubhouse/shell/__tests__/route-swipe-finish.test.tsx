/**
 * @vitest-environment jsdom
 *
 * MOTION-AND-VISUAL 3.3: a pushed route page let go by the back swipe finishes from where it is, over 520 ms times the
 * share of the way still to go with a 35% floor, on the iOS curve: off to the right edge past the mark, home short of it.
 * No haptic marks the swipe, as on iOS (3.3, 3.10).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const haptics = vi.hoisted(() => ({ haptic: vi.fn(), hapticScrub: vi.fn() }));
vi.mock('../../lib/haptics', () => haptics);
vi.mock('@/lib/utils/capacitor', () => ({ isNativeApp: () => false }));

type Fake = { currentTime: number; cancel: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn>; play: ReturnType<typeof vi.fn>; finished: Promise<void> };
type Call = { el: Element; keyframes: Keyframe[]; options: KeyframeAnimationOptions };
let calls: Call[] = [];
let anims: Fake[] = [];

beforeEach(() => {
  calls = [];
  anims = [];
  haptics.haptic.mockClear();
  document.documentElement.removeAttribute('data-motion');
  document.body.innerHTML = `
    <div class="ch-root" data-ui="clubhouse">
      <header class="ch-topbar"><button type="button" class="ch-pbar__back">Roster</button></header>
      <nav class="ch-strip"><a href="/golf/dashboard/roster">Roster</a></nav>
      <div id="ch-content" class="ch-frame-route"><a id="go" href="/golf/dashboard/roster/p1">Ava</a></div>
    </div>`;
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(max-width: 820px), (max-height: 500px) and (pointer: coarse)', addEventListener() {}, removeEventListener() {} }));
  HTMLElement.prototype.animate = vi.fn(function (this: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    calls.push({ el: this, keyframes, options });
    // The push's own slide is over (its time at the end), but never reports finished, so the finger takes it at rest.
    const a: Fake = { currentTime: 520, cancel: vi.fn(), pause: vi.fn(), play: vi.fn(), finished: new Promise<void>(() => {}) };
    anims.push(a);
    return a as unknown as Animation;
  }) as unknown as HTMLElement['animate'];
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

/** Fresh modules for each test (nav-motion keeps the copies beneath in module state), React included. */
async function setup() {
  vi.resetModules();
  const [{ render }, nav, { useRouteSwipe }] = await Promise.all([import('@testing-library/react'), import('../../lib/nav-motion'), import('../use-route-swipe')]);
  nav.chNavShown('/golf/dashboard/roster');
  const go = document.getElementById('go')!;
  go.addEventListener('click', (e) => e.preventDefault());
  go.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  await new Promise((r) => requestAnimationFrame(r));
  nav.chNavShown('/golf/dashboard/roster/p1');
  function Probe() {
    useRouteSwipe(true, 'p1');
    return null;
  }
  render(<Probe />);
  calls = [];
  return nav;
}

function touch(type: 'touchstart' | 'touchmove' | 'touchend', x: number, at: number) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : [{ clientX: x, clientY: 400, identifier: 1 }] });
  Object.defineProperty(ev, 'timeStamp', { value: at });
  document.getElementById('ch-content')!.dispatchEvent(ev);
}

/** A finger from the edge to `x`, slowly (no flick), then let go. */
function swipe(x: number) {
  let t = 1000;
  touch('touchstart', 8, t);
  for (let i = 1; i <= 4; i++) touch('touchmove', 8 + ((x - 8) * i) / 4, (t += 120));
  touch('touchend', 0, (t += 300));
}

const W = () => window.innerWidth;
const page = () => document.getElementById('ch-content')!;

describe('a pushed route page let go by the back swipe (MOTION-AND-VISUAL 3.3)', () => {
  it('past half the width it goes off over 520 ms times the width left, on the iOS curve', async () => {
    await setup();
    const at = Math.round(W() * 0.7);
    swipe(at);
    const off = calls.find((c) => c.el === page());
    expect(off).toBeDefined();
    // The page has come the finger's travel from where it landed (8 px in).
    expect(off!.options.duration).toBe(Math.round(520 * Math.max(0.35, 1 - (at - 8) / W())));
    expect(off!.options.easing).toBe('cubic-bezier(0.32, 0.72, 0, 1)');
    // The copy beneath and its dim ride the same timing.
    expect(calls).toHaveLength(3);
    expect(calls.every((c) => c.options.duration === off!.options.duration && c.options.easing === off!.options.easing)).toBe(true);
    expect(haptics.haptic).not.toHaveBeenCalled();
  });

  it('short of half it goes home over 520 ms times the way it had come, 35% floor, on the same curve', async () => {
    await setup();
    const at = Math.round(W() * 0.42);
    swipe(at);
    const home = calls.find((c) => c.el === page());
    expect(home).toBeDefined();
    expect(home!.keyframes.at(-1)).toMatchObject({ translate: '0px 0' });
    expect(home!.options.duration).toBe(Math.round(520 * ((at - 8) / W())));
    expect(home!.options.easing).toBe('cubic-bezier(0.32, 0.72, 0, 1)');
    expect(haptics.haptic).not.toHaveBeenCalled();
  });

  it('a short drag home still takes the floor, 182 ms', async () => {
    await setup();
    swipe(Math.round(W() * 0.12));
    const home = calls.find((c) => c.el === page());
    expect(home!.options.duration).toBe(182);
  });

  it('crossing the mark and back fires no haptic', async () => {
    await setup();
    let t = 1000;
    touch('touchstart', 8, t);
    touch('touchmove', 20, (t += 16));
    touch('touchmove', W() * 0.7, (t += 16));
    touch('touchmove', W() * 0.3, (t += 16));
    touch('touchmove', W() * 0.8, (t += 16));
    expect(haptics.haptic).not.toHaveBeenCalled();
  });
});
