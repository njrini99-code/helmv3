// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readDynamicTypeScale, useChDynamicType } from '../lib/dynamic-type';
import { typeScaleValue } from '../lib/type-scale';
import { TYPE_SCALE_BOOT } from '../shell/TypeScaleScript';

/**
 * Phone premium sweep (12 Nov 2026): the server renders Clubhouse at type scale 1, and lib/dynamic-type.ts read the
 * iPhone's Text Size at hydration, so off the default size every word on the page resized in one frame on each cold
 * load. TypeScaleScript stamps the scale before first paint; its maths must be the library's, size for size, and the
 * hook must then change nothing.
 */
const root = document.documentElement;
const stamped = () => root.style.getPropertyValue('--ch-type-scale');
const boot = () => new Function(TYPE_SCALE_BOOT)();

/** A phone whose `-apple-system-body` reads `px` (WebKit's Text Size), or a desk (`coarse: false`). */
function device(px: number, { coarse = true }: { coarse?: boolean } = {}) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(pointer: coarse)' ? coarse : false, media: q, addEventListener() {}, removeEventListener() {} }));
  // jsdom has no system fonts: the probe's `font` keeps what it was given, and its computed size is the reading.
  const proto = CSSStyleDeclaration.prototype;
  const had = Object.getOwnPropertyDescriptor(proto, 'font');
  Object.defineProperty(proto, 'font', {
    configurable: true,
    get(this: { __font?: string }) {
      return this.__font ?? '';
    },
    set(this: { __font?: string }, v: string) {
      this.__font = v;
    },
  });
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, pseudo?: string | null) =>
    el instanceof HTMLElement && el.style.font === '-apple-system-body' ? ({ fontSize: `${px}px` } as unknown as CSSStyleDeclaration) : real(el, pseudo),
  );
  return () => {
    if (had) Object.defineProperty(proto, 'font', had);
    else delete (proto as unknown as Record<string, unknown>).font;
  };
}

let restore: (() => void) | null = null;
beforeEach(() => {
  window.history.replaceState(null, '', '/golf/dashboard/stats');
  root.style.removeProperty('--ch-type-scale');
});
afterEach(() => {
  cleanup();
  restore?.();
  restore = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  root.style.removeProperty('--ch-type-scale');
});

function Clubhouse() {
  useChDynamicType();
  return null;
}

describe('TypeScaleScript: the first frame is already at the iPhone’s Text Size', () => {
  it.each([14, 15, 16, 17, 19, 21, 23])('stamps what the library reads at a %ipx body', (px) => {
    restore = device(px);
    boot();
    const want = readDynamicTypeScale(document);
    expect(stamped()).toBe(want == null ? '' : typeScaleValue(want));
  });

  it('clamps below the smallest step and above XXL as the library does', () => {
    for (const px of [12, 26]) {
      restore = device(px);
      boot();
      expect(stamped()).toBe(typeScaleValue(readDynamicTypeScale(document)!));
      restore();
      restore = null;
      vi.restoreAllMocks();
      root.style.removeProperty('--ch-type-scale');
    }
  });

  it('hydration changes nothing: the hook writes the value the script stamped', () => {
    restore = device(21);
    boot();
    const before = stamped();
    expect(before).not.toBe('');
    render(<Clubhouse />);
    expect(stamped()).toBe(before);
  });

  it('only on the Clubhouse’s own pages, and only on a touch screen', () => {
    restore = device(21);
    window.history.replaceState(null, '', '/golf/login');
    boot();
    expect(stamped()).toBe('');
    window.history.replaceState(null, '', '/clubhouse-preview/home');
    boot();
    expect(stamped()).not.toBe('');
    root.style.removeProperty('--ch-type-scale');
    restore();
    restore = device(21, { coarse: false });
    window.history.replaceState(null, '', '/golf/dashboard');
    boot();
    expect(stamped()).toBe('');
  });
});
