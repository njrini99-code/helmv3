/**
 * @vitest-environment jsdom
 *
 * E-8 (audit 2026-11-19): Back and Forward on the desk crossfade as a tap does, 120 ms out and 180 ms in together on the
 * view-transition tokens (owner decision 3, A10); under Reduce Motion both sides take 180 ms; Animations off swaps.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Call = { el: HTMLElement; keyframes: Keyframe[]; options: KeyframeAnimationOptions };
let calls: Call[] = [];

async function load() {
  vi.resetModules();
  return import('../nav-motion');
}

beforeEach(() => {
  calls = [];
  document.documentElement.removeAttribute('data-motion');
  document.documentElement.style.setProperty('--ch-dur-vt-out', '120ms');
  document.documentElement.style.setProperty('--ch-dur-vt-in', '180ms');
  document.documentElement.style.setProperty('--ch-dur-vt-fade', '180ms');
  document.documentElement.style.setProperty('--ch-ease-vt-out', 'cubic-bezier(0.4, 0, 1, 1)');
  document.documentElement.style.setProperty('--ch-ease-vt-in', 'cubic-bezier(0.22, 1, 0.36, 1)');
  document.body.innerHTML = `
    <div class="ch-root" data-ui="clubhouse">
      <div id="ch-content" class="ch-frame-route"><p>Round</p></div>
    </div>`;
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('prefers-reduced-motion') ? reduce : false, addEventListener() {}, removeEventListener() {} }));
  HTMLElement.prototype.animate = vi.fn(function (this: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    calls.push({ el: this, keyframes, options });
    return { cancel: vi.fn(), finished: new Promise(() => {}) } as unknown as Animation;
  }) as unknown as HTMLElement['animate'];
  history.replaceState(null, '', '/golf/dashboard/rounds/r1');
});
let reduce = false;
afterEach(() => {
  reduce = false;
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

async function back() {
  const nav = await load();
  nav.chNavShown('/golf/dashboard/rounds/r1');
  history.replaceState(null, '', '/golf/dashboard/rounds');
  window.dispatchEvent(new PopStateEvent('popstate'));
  await new Promise((r) => requestAnimationFrame(r));
  return nav;
}

describe('desk Back and Forward crossfade (E-8)', () => {
  it('the page left fades out over 120 ms as the page come back to fades in over 180 ms, together', async () => {
    await back();
    const out = calls.find((c) => c.el.classList.contains('ch-frame-fading'))!;
    const into = calls.find((c) => c.el.id === 'ch-content')!;
    expect(out.options).toMatchObject({ duration: 120, easing: 'cubic-bezier(0.4, 0, 1, 1)' });
    expect(into.options).toMatchObject({ duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    expect(out.keyframes).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    expect(into.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(out.el.getAttribute('aria-hidden')).toBe('true');
    expect((out.el as HTMLElement & { inert: boolean }).inert).toBe(true);
  });

  it('under Reduce Motion both sides take 180 ms', async () => {
    reduce = true;
    await back();
    // (A module loaded by an earlier test still listens: every fade it draws is the same.)
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls.every((c) => c.options.duration === 180)).toBe(true);
  });

  it('a view transition of the root (a theme keyframe) does not stop it; only the page\'s own crossfade does', async () => {
    const running = (pseudo: string) => [{ effect: { pseudoElement: pseudo } }] as unknown as Animation[];
    (document as Document & { getAnimations: () => Animation[] }).getAnimations = () => running('::view-transition-old(root)');
    await back();
    expect(calls.some((c) => c.el.classList.contains('ch-frame-fading'))).toBe(true);
    calls = [];
    // The first fade's copy waits on a finish the fake never gives: take it away by hand.
    document.querySelectorAll('.ch-frame-fading').forEach((e) => e.remove());
    (document as Document & { getAnimations: () => Animation[] }).getAnimations = () => running('::view-transition-old(ch-page)');
    await back();
    expect(calls).toHaveLength(0);
    expect(document.querySelector('.ch-frame-fading')).toBeNull();
    delete (document as Partial<Document> & { getAnimations?: unknown }).getAnimations;
  });

  it('Animations off swaps', async () => {
    document.documentElement.setAttribute('data-motion', 'off');
    await back();
    expect(calls).toHaveLength(0);
    expect(document.querySelector('.ch-frame-fading')).toBeNull();
  });
});
