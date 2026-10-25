/**
 * @vitest-environment jsdom
 *
 * C1 (rows 2 and 89): a phone drill-in is drawn by the live page sliding over a copy of the page it left, on the smooth
 * spring, so a finger can take it mid-flight (`grabPush`) and a Back can reverse it from where it stands
 * (`takeRunningPush`). The copy stays beneath the pushed page (`underFor`) for a swipe back to uncover.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chSpringCurve } from '../motion';

type Fake = { currentTime: number; cancel: ReturnType<typeof vi.fn>; finished: Promise<void> };
let anims: Fake[] = [];
const curve = chSpringCurve('smooth');

async function load() {
  vi.resetModules();
  return import('../nav-motion');
}

beforeEach(() => {
  anims = [];
  document.documentElement.removeAttribute('data-ch-nav');
  document.documentElement.removeAttribute('data-motion');
  document.body.innerHTML = `
    <div class="ch-root" data-ui="clubhouse">
      <nav class="ch-strip"><a href="/golf/dashboard/roster">Roster</a></nav>
      <div id="ch-content" class="ch-frame-route"><a id="go" href="/golf/dashboard/roster/p1">Ava</a></div>
    </div>`;
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(max-width: 820px)', addEventListener() {}, removeEventListener() {} }));
  HTMLElement.prototype.animate = vi.fn(function () {
    const a: Fake = { currentTime: 0, cancel: vi.fn(), finished: new Promise<void>(() => {}) };
    anims.push(a);
    return a as unknown as Animation;
  }) as unknown as HTMLElement['animate'];
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

async function pushed() {
  const nav = await load();
  nav.chNavShown('/golf/dashboard/roster');
  document.getElementById('go')!.addEventListener('click', (e) => e.preventDefault());
  // The capture listener reads the tap before the link's own handler would.
  document.getElementById('go')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  nav.chNavShown('/golf/dashboard/roster/p1');
  return nav;
}

describe('the grabbable push (C1)', () => {
  it('slides the live page in over a copy of the page it left, and keeps the copy beneath it', async () => {
    const nav = await pushed();
    expect(anims).toHaveLength(2);
    expect(document.getElementById('ch-content')!.hasAttribute('data-ch-pushing')).toBe(true);
    const under = nav.underFor('/golf/dashboard/roster/p1');
    expect(under).toMatchObject({ over: '/golf/dashboard/roster/p1', under: '/golf/dashboard/roster' });
    expect(under!.layer.isConnected).toBe(true);
    expect(under!.layer.getAttribute('aria-hidden')).toBe('true');
  });

  it('a finger takes it where it stands: the slide stops and the page is left there', async () => {
    const nav = await pushed();
    for (const a of anims) a.currentTime = curve.ms * 0.3;
    const grab = nav.grabPush()!;
    const share = curve.ease(0.3);
    expect(grab.share).toBeCloseTo(share, 5);
    expect(anims.every((a) => a.cancel.mock.calls.length === 1)).toBe(true);
    expect(document.getElementById('ch-content')!.style.translate).toBe(`${nav.cssNum((1 - share) * window.innerWidth)}px 0`);
    // Taken once: nothing is left running to take again.
    expect(nav.grabPush()).toBeNull();
  });

  it('a Back mid-push reverses from where it stood and lets the copy go', async () => {
    const nav = await pushed();
    for (const a of anims) a.currentTime = curve.ms * 0.5;
    const layer = nav.underFor('/golf/dashboard/roster/p1')!.layer;
    const share = nav.takeRunningPush();
    expect(share).toBeCloseTo(curve.ease(0.5), 5);
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThan(1);
    expect(layer.isConnected).toBe(false);
    expect(document.getElementById('ch-content')!.hasAttribute('data-ch-pushing')).toBe(false);
  });

  it('not with Animations off: the page just swaps', async () => {
    document.documentElement.setAttribute('data-motion', 'off');
    const nav = await pushed();
    expect(anims).toHaveLength(0);
    expect(nav.underFor('/golf/dashboard/roster/p1')).toBeNull();
  });
});
