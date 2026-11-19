/**
 * @vitest-environment jsdom
 *
 * C1 (rows 2 and 89): a phone drill-in is drawn by the live page sliding over a copy of the page it left, over 520ms on
 * the one curve (production audit 2026-11-15, S4.1), so a finger can take it mid-flight (`grabPush`) and a Back can reverse it from where it stands
 * (`takeRunningPush`). The copy stays beneath the pushed page (`underFor`) for a swipe back to uncover.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CH_PUSH_MS, CH_EASE_IOS, chBezier } from '../motion';

type Fake = { currentTime: number; cancel: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn>; play: ReturnType<typeof vi.fn>; finished: Promise<void>; land?: () => void };
let anims: Fake[] = [];
const curve = { ms: CH_PUSH_MS, ease: chBezier(CH_EASE_IOS) };

async function load() {
  vi.resetModules();
  return import('../nav-motion');
}

beforeEach(() => {
  anims = [];
  document.documentElement.removeAttribute('data-motion');
  document.body.innerHTML = `
    <div class="ch-root" data-ui="clubhouse">
      <nav class="ch-strip"><a href="/golf/dashboard/roster">Roster</a></nav>
      <div id="ch-content" class="ch-frame-route"><a id="go" href="/golf/dashboard/roster/p1">Ava</a></div>
    </div>`;
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(max-width: 820px), (max-height: 500px) and (pointer: coarse)', addEventListener() {}, removeEventListener() {} }));
  HTMLElement.prototype.animate = vi.fn(function () {
    let land = () => {};
    const finished = new Promise<void>((r) => (land = r));
    const a: Fake = { currentTime: 0, cancel: vi.fn(), pause: vi.fn(), play: vi.fn(), finished, land };
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
  // The copy is taken in the frame after the tap, once the press state has painted.
  await new Promise((r) => requestAnimationFrame(r));
  nav.chNavShown('/golf/dashboard/roster/p1');
  return nav;
}

describe('the grabbable push (C1)', () => {
  it('slides the live page in over a copy of the page it left, and keeps the copy beneath it', async () => {
    const nav = await pushed();
    // The page, the copy, and the veil that dims the copy: transform and opacity, no filter.
    expect(anims).toHaveLength(3);
    const frames = vi.mocked(HTMLElement.prototype.animate).mock.calls.flatMap((c) => c[0] as Keyframe[]);
    expect(new Set(frames.flatMap((f) => Object.keys(f)))).toEqual(new Set(['transform', 'opacity']));
    expect(document.getElementById('ch-content')!.hasAttribute('data-ch-pushing')).toBe(true);
    // Created paused at their first frame and played in the next one (S4.1): the commit's frame lays out the new page.
    expect(anims.every((a) => a.pause.mock.calls.length === 1 && a.play.mock.calls.length === 0)).toBe(true);
    await new Promise((r) => requestAnimationFrame(r));
    expect(anims.every((a) => a.play.mock.calls.length === 1)).toBe(true);
    // 520ms on the one curve; the page beneath draws back a third.
    const opts = vi.mocked(HTMLElement.prototype.animate).mock.calls.map((c) => c[1] as KeyframeAnimationOptions);
    expect(opts.every((o) => o.duration === 520 && o.easing === 'cubic-bezier(0.32, 0.72, 0, 1)')).toBe(true);
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

  describe('the page sliding in takes no taps until it lands (E-2, F-02)', () => {
    const page = () => document.getElementById('ch-content')!;
    it('is marked for the push and unmarked when the push ends', async () => {
      await pushed();
      expect(page().hasAttribute('data-ch-arriving')).toBe(true);
      anims[0]!.land!();
      await Promise.resolve();
      await Promise.resolve();
      expect(page().hasAttribute('data-ch-arriving')).toBe(false);
    });
    it('no descendant takes a tap either, whatever its own pointer-events; only the page is marked, so the bar\'s Back stays live', () => {
      const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/shell.css'), 'utf8');
      // A control that sets pointer-events: auto (Qualifiers' "Play round" key, qualifiers.css) would otherwise take it.
      expect(css).toMatch(/\.ch-frame-route\[data-ch-arriving\],\s*\[data-ui='clubhouse'\] \.ch-frame-route\[data-ch-arriving\] \* \{[^}]*pointer-events: none !important;/);
      expect(css).not.toMatch(/\.ch-topbar[^{]*\[data-ch-arriving\]/);
    });
    it('is unmarked when a Back takes the push', async () => {
      const nav = await pushed();
      nav.takeRunningPush();
      expect(page().hasAttribute('data-ch-arriving')).toBe(false);
    });
    it('is unmarked when a finger takes the push', async () => {
      const nav = await pushed();
      nav.grabPush();
      expect(page().hasAttribute('data-ch-arriving')).toBe(false);
    });
  });

  it('not with Animations off: the page just swaps', async () => {
    document.documentElement.setAttribute('data-motion', 'off');
    const nav = await pushed();
    expect(anims).toHaveLength(0);
    expect(nav.underFor('/golf/dashboard/roster/p1')).toBeNull();
  });
});
