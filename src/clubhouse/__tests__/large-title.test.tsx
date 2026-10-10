import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CH_LARGE_TITLES, findLargeTitle, isTucked, usePhoneLargeTitle, watchLargeTitle } from '../shell/large-title';

/**
 * Phone large titles (owner 2026-10-08, the cardless phone pass): the bar's title waits while the page's own large
 * title is in view and fades in once it has scrolled under the bar; the bar's scroll edge shows once anything has.
 * WebKit at 390px measured the behaviour on eight screens (the PR's check script); these hold the logic and the CSS.
 */

type IOCallback = (entries: Array<Pick<IntersectionObserverEntry, 'isIntersecting' | 'boundingClientRect' | 'rootBounds'>>) => void;
const observers: Array<{ cb: IOCallback; targets: Element[]; options?: IntersectionObserverInit; disconnected: boolean }> = [];

class FakeIO {
  private rec: (typeof observers)[number];
  constructor(cb: IOCallback, options?: IntersectionObserverInit) {
    this.rec = { cb, targets: [], options, disconnected: false };
    observers.push(this.rec);
  }
  observe(el: Element) {
    this.rec.targets.push(el);
  }
  disconnect() {
    this.rec.disconnected = true;
  }
  unobserve() {}
  takeRecords() {
    return [];
  }
}

const live = () => observers.filter((o) => !o.disconnected);
const report = (isIntersecting: boolean, bottom: number) =>
  live().at(-1)!.cb([{ isIntersecting, boundingClientRect: { bottom } as DOMRect, rootBounds: { top: 94 } as DOMRect }]);

function mount(page: string) {
  document.body.innerHTML = `<div class="ch-root" data-ui="clubhouse"><div class="ch-canvas" id="ch-canvas"><header class="ch-topbar"></header><main>${page}</main></div></div>`;
  return { bar: document.querySelector<HTMLElement>('.ch-topbar')!, canvas: document.getElementById('ch-canvas')! };
}

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal('IntersectionObserver', FakeIO);
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('findLargeTitle', () => {
  it("finds the page's large title by its own title class", () => {
    const { canvas } = mount('<div class="ch-rsm-head"><p class="ch-rsm-title" aria-hidden="true">Roster</p></div>');
    expect(findLargeTitle(canvas)?.textContent).toBe('Roster');
  });
  it('takes the opt-in attribute', () => {
    const { canvas } = mount('<h1 data-ch-large-title="">Anything</h1>');
    expect(findLargeTitle(canvas)?.textContent).toBe('Anything');
  });
  it('skips a visually hidden heading, a pushed screen and a dialog', () => {
    const { canvas } = mount(
      '<h1 class="ch-sr-only" data-ch-large-title="">Hidden</h1><div class="ch-pscreen"><p class="ch-rsm-title">Pushed</p></div><dialog open><p class="ch-recm-title">Sheet</p></dialog>',
    );
    expect(findLargeTitle(canvas)).toBeNull();
  });
  it("leaves a page's content heading alone (Calendar's month, a round's course)", () => {
    const { canvas } = mount('<header class="ch-intro ch-calm-head"><h2 class="ch-intro__title ch-calm-title">October</h2></header><h1>Finley GC</h1>');
    expect(findLargeTitle(canvas)).toBeNull();
  });
});

describe('isTucked', () => {
  it('is tucked only once the title has gone up under the bar', () => {
    expect(isTucked({ isIntersecting: true, boundingClientRect: { bottom: 140 } as DOMRect }, 94)).toBe(false);
    expect(isTucked({ isIntersecting: false, boundingClientRect: { bottom: 80 } as DOMRect }, 94)).toBe(true);
    // Below the fold is not under the bar.
    expect(isTucked({ isIntersecting: false, boundingClientRect: { bottom: 1200 } as DOMRect }, 94)).toBe(false);
  });
});

describe('watchLargeTitle', () => {
  it("marks the bar tucked as the title scrolls under it, and back as it returns, measured from the bar's bottom", () => {
    const { bar, canvas } = mount('<header class="ch-stm-head"><h1>Team stats</h1></header>');
    vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({ bottom: 94 } as DOMRect);
    const stop = watchLargeTitle(bar, canvas);
    expect(live()).toHaveLength(1);
    expect(live()[0]!.targets[0]?.textContent).toBe('Team stats');
    expect(live()[0]!.options?.rootMargin).toBe('-94px 0px 0px 0px');
    expect(bar.hasAttribute('data-large-title')).toBe(false);
    report(false, 60);
    expect(bar.getAttribute('data-large-title')).toBe('tucked');
    report(true, 120);
    expect(bar.hasAttribute('data-large-title')).toBe(false);
    stop();
    expect(live()).toHaveLength(0);
  });

  it('finds the title again when the page swaps, starting the new page untucked', async () => {
    const { bar, canvas } = mount('<p class="ch-setm-title">Settings</p>');
    const stop = watchLargeTitle(bar, canvas);
    report(false, 10);
    expect(bar.getAttribute('data-large-title')).toBe('tucked');
    canvas.querySelector('main')!.innerHTML = '<div class="ch-recm-page"><p class="ch-recm-title">Recruiting</p></div>';
    await Promise.resolve();
    expect(bar.hasAttribute('data-large-title')).toBe(false);
    expect(live()).toHaveLength(1);
    expect(live()[0]!.targets[0]?.textContent).toBe('Recruiting');
    // A page with no large title: nothing is observed and the bar keeps its title.
    canvas.querySelector('main')!.innerHTML = '<h1>Messages</h1>';
    await Promise.resolve();
    expect(live()).toHaveLength(0);
    expect(bar.hasAttribute('data-large-title')).toBe(false);
    stop();
  });

  it('shows the scroll edge once content has scrolled under the bar, and tears down clean', () => {
    const { bar, canvas } = mount('<p class="ch-rsm-title">Roster</p>');
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 1;
    });
    const stop = watchLargeTitle(bar, canvas);
    expect(bar.hasAttribute('data-scrolled')).toBe(false);
    Object.defineProperty(window, 'scrollY', { value: 40, configurable: true });
    window.dispatchEvent(new Event('scroll'));
    expect(bar.hasAttribute('data-scrolled')).toBe(true);
    report(false, 20);
    stop();
    expect(bar.hasAttribute('data-scrolled')).toBe(false);
    expect(bar.hasAttribute('data-large-title')).toBe(false);
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    raf.mockRestore();
  });
});

describe('usePhoneLargeTitle', () => {
  const media = (matches: boolean) =>
    vi.stubGlobal('matchMedia', (q: string) => ({ matches, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }));

  it('watches on the phone', () => {
    mount('<p class="ch-rsm-title">Roster</p>');
    media(true);
    const { unmount } = renderHook(() => {
      const ref = useRef<HTMLElement | null>(document.querySelector<HTMLElement>('.ch-topbar'));
      usePhoneLargeTitle(ref);
    });
    expect(live()).toHaveLength(1);
    unmount();
    expect(live()).toHaveLength(0);
  });
  it('never runs on desktop', () => {
    mount('<p class="ch-rsm-title">Roster</p>');
    media(false);
    renderHook(() => {
      const ref = useRef<HTMLElement | null>(document.querySelector<HTMLElement>('.ch-topbar'));
      usePhoneLargeTitle(ref);
    });
    expect(observers).toHaveLength(0);
  });
});

describe('the CSS that hides and fades the bar title', () => {
  const shell = readFileSync(join(process.cwd(), 'src/clubhouse/styles/shell.css'), 'utf8');
  const block = shell.slice(shell.indexOf('/* Phone large titles'), shell.indexOf('/* The More sheet'));

  it("names every large title the hook watches in its first-paint :has(), phone only, never on the hero's bar", () => {
    expect(block).toMatch(/^\/\* Phone large titles[\s\S]*?\*\/\n@media \(max-width: 820px\) \{/);
    const has = block.slice(block.indexOf(':has('), block.indexOf('.ch-topbar:not('));
    for (const sel of CH_LARGE_TITLES) expect(has, sel).toContain(sel);
    expect(has).toContain(':not(.ch-sr-only, .ch-pscreen *, dialog *)');
    expect(block).toContain("[data-ui='clubhouse']:not([data-phone-hero]):has(");
    expect(block).toMatch(/\.ch-topbar:not\(\[data-large-title='tucked'\]\)\s*:is\(\.ch-topbar__ptitle, \.ch-topbar__pslot > \.ch-pbar__title, \.ch-topbar__pstand \.ch-pbar__title\) \{\s*opacity: 0;\s*translate: 0 3px;/);
  });
  it('fades on opacity and translate at the quick duration, and swaps at once with reduced motion or Animations off', () => {
    expect(block).toMatch(/transition:\s*opacity var\(--ch-dur-quick\) var\(--ch-ease\),\s*translate var\(--ch-dur-quick\) var\(--ch-ease\);/);
    expect(block).not.toMatch(/transition:[^;]*\b(transform|top|height|visibility|display)\b/);
    expect(block).toMatch(/\[data-ui='clubhouse'\]\[data-motion='off'\] \.ch-topbar :is\([^)]*\) \{\s*transition: none;/);
    expect(block).toMatch(/@media \(max-width: 820px\) and \(prefers-reduced-motion: reduce\) \{[\s\S]*?transition: none;/);
  });
  it("draws the scroll edge on ::before (::after is the sheet's lip), only once scrolled", () => {
    expect(block).toMatch(/\.ch-topbar::before \{[^}]*opacity: 0;/);
    expect(block).toMatch(/\[data-ui='clubhouse'\]:not\(\[data-phone-hero\]\) \.ch-topbar\[data-scrolled\]::before \{\s*opacity: 1;/);
  });
});

describe('the More sheet is native inset grouped rows on the phone', () => {
  const shell = readFileSync(join(process.cwd(), 'src/clubhouse/styles/shell.css'), 'utf8');
  const block = shell.slice(shell.indexOf('/* The More sheet'));
  it('flat groups, label-inset hairlines and plain icons, phone only', () => {
    expect(block).toMatch(/^\/\* The More sheet[\s\S]*?\*\/\n@media \(max-width: 820px\) \{/);
    expect(block).toMatch(/\.ch-more__list,\s*\.ch-more__me \{[^}]*box-shadow: none;/);
    expect(block).toMatch(/\.ch-more__row \+ \.ch-more__row::before \{[^}]*left: 54px;/);
    expect(block).toMatch(/\.ch-more__row\[aria-current='true'\] \.ch-more__ic \{[^}]*background: none;/);
  });
});
