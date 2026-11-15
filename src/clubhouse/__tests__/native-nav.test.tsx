
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));

import { chNavCrossfades, chTapTiming, classifyNav, takeRunningPush } from '../lib/nav-motion';
import { CH_PUSH_MS } from '../lib/motion';
import { prefetchAllowed } from '../shell/use-prefetch-tabs';

const css = (f: string) => readFileSync(join(process.cwd(), 'src/clubhouse/styles', f), 'utf8');
const TABS = ['/golf/dashboard', '/golf/dashboard/coachhelm', '/golf/dashboard/calendar', '/golf/dashboard/stats'];

afterEach(() => vi.restoreAllMocks());

describe('which way a phone navigation moves', () => {
  it('a tab change neither pushes nor pops, wherever it starts', () => {
    expect(classifyNav({ from: '/golf/dashboard', to: '/golf/dashboard/calendar', tabRoots: TABS, tabBar: true })).toBe('fade');
    // From inside a drill-in, the tab bar's Home is a tab change, not a Back, though Home's path is above it.
    expect(classifyNav({ from: '/golf/dashboard/roster', to: '/golf/dashboard', tabRoots: TABS, tabBar: true })).toBe('fade');
  });

  it('a drill-in pushes: a More row, a link into a detail, a sibling opened from More', () => {
    expect(classifyNav({ from: '/golf/dashboard', to: '/golf/dashboard/roster', tabRoots: TABS })).toBe('push');
    expect(classifyNav({ from: '/golf/dashboard/calendar', to: '/golf/dashboard/settings#set-help', tabRoots: TABS })).toBe('push');
    expect(classifyNav({ from: '/golf/dashboard/messages', to: '/golf/dashboard/roster', tabRoots: TABS })).toBe('push');
    expect(classifyNav({ from: '/golf/dashboard/qualifiers', to: '/golf/dashboard/qualifiers/abc', tabRoots: TABS })).toBe('push');
  });

  it('a link up to the page above pops; a link onto a tab root from a page swaps', () => {
    expect(classifyNav({ from: '/golf/dashboard/qualifiers/abc', to: '/golf/dashboard/qualifiers', tabRoots: TABS })).toBe('pop');
    expect(classifyNav({ from: '/golf/dashboard/stats', to: '/golf/dashboard/calendar', tabRoots: TABS })).toBe('fade');
  });

  it('Back from a pushed page pops, Forward onto one pushes, and Back between tabs swaps', () => {
    expect(classifyNav({ from: '/golf/dashboard/roster', to: '/golf/dashboard', tabRoots: TABS, back: true })).toBe('pop');
    expect(classifyNav({ from: '/golf/dashboard', to: '/golf/dashboard/roster', tabRoots: TABS, back: true })).toBe('push');
    expect(classifyNav({ from: '/golf/dashboard/calendar', to: '/golf/dashboard', tabRoots: TABS, back: true })).toBe('fade');
  });

  it('the same page (a pushed screen inside it, a hash) never moves', () => {
    expect(classifyNav({ from: '/golf/dashboard/roster', to: '/golf/dashboard/roster/', tabRoots: TABS, back: true })).toBe('fade');
  });
});

describe('a section switch swaps at once, with no view transition (mot-03; production audit 2026-11-15, S4.4, S4.8)', () => {
  const shell = css('shell.css');

  function tap(container: string, href: string) {
    document.body.innerHTML = `<div data-ui="clubhouse"><nav class="${container}"><a href="${href}">Go</a></nav></div>`;
    const a = document.querySelector('a')!;
    a.addEventListener('click', (e) => e.preventDefault());
    a.click();
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('a tab bar or sidebar item never crossfades; any other desktop link does', () => {
    tap('ch-strip', '/golf/dashboard/calendar');
    expect(chNavCrossfades()).toBe(false);
    tap('ch-nav', '/golf/dashboard/stats');
    expect(chNavCrossfades()).toBe(false);
    // jsdom has no phone media query: this is the desktop, where a drill-in crossfades.
    tap('ch-page-links', '/golf/dashboard/roster');
    expect(chNavCrossfades()).toBe(true);
  });

  // MOTION-AND-VISUAL 3.3 and 3.11: on a phone with motion on a section switch swaps at once; under Reduce Motion it
  // becomes the 180 ms crossfade, like a push and a pop.
  it('on a phone a section switch swaps at once, and under Reduce Motion crossfades like any other page change', () => {
    let reduce = false;
    vi.mocked(window.matchMedia).mockImplementation(
      (query: string) =>
        ({ matches: query === '(prefers-reduced-motion: reduce)' ? reduce : query.includes('max-width: 820px'), media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }) as unknown as MediaQueryList,
    );
    tap('ch-strip', '/golf/dashboard/calendar');
    expect(chNavCrossfades()).toBe(false);
    tap('ch-page-links', '/golf/dashboard/roster');
    expect(chNavCrossfades()).toBe(false);
    reduce = true;
    tap('ch-strip', '/golf/dashboard/stats');
    expect(chNavCrossfades()).toBe(true);
    tap('ch-page-links', '/golf/dashboard/roster');
    expect(chNavCrossfades()).toBe(true);
  });

  it('marks nothing on <html> (MOT-20), and the shell keeps no tab or fade-through rules', () => {
    tap('ch-strip', '/golf/dashboard/calendar');
    expect(document.documentElement.hasAttribute('data-ch-tab')).toBe(false);
    expect(shell).not.toContain('data-ch-tab');
    expect(css('tokens.css')).not.toContain('--ch-dur-vt-gap');
  });
});

describe('the push and the pop (S4.1)', () => {
  const shell = css('shell.css');
  const tokens = css('tokens.css');

  it('ride the reveal beat on the one curve, with a third of parallax under a 0.075 black dim', () => {
    expect(CH_PUSH_MS).toBe(520);
    expect(chTapTiming().timing).toEqual({ duration: 520, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' });
    expect(chTapTiming().curve.ease(0.5)).toBeGreaterThan(0.9);
    expect(tokens).toContain('--ch-ease-ios: cubic-bezier(0.32, 0.72, 0, 1);');
    expect(tokens).toContain('--ch-push-parallax: -30%;');
    expect(tokens).toContain('--ch-push-dim: rgb(0 0 0 / 0.075);');
  });

  it('drawn by the live page over a copy (C1), never by a view transition; promoted and edged only while it moves', () => {
    expect(shell).not.toMatch(/ch-vt-pop|ch-vt-push|data-ch-nav/);
    // The copy beneath sits under the page that slides over it; both under the bars.
    expect(shell).toMatch(/\.ch-root\.ch-frame-under \{\s*z-index: calc\(var\(--ch-z-sticky\) - 2\);/);
    expect(shell).toMatch(/\.ch-frame-route\[data-ch-pushing\] \{\s*position: relative;\s*z-index: calc\(var\(--ch-z-sticky\) - 1\);/);
    const page = shell.slice(shell.indexOf('.ch-frame-route[data-ch-pushing] {'));
    const rule = page.slice(0, page.indexOf('}'));
    expect(rule).toContain('box-shadow: -1px 0 0 var(--ch-card-ring);');
    expect(rule).toContain('will-change: transform;');
    const under = shell.slice(shell.indexOf('.ch-root.ch-frame-under {'));
    expect(under.slice(0, under.indexOf('}'))).toContain('will-change: transform;');
  });

  it('only on a phone, with the iOS-animated Back still instant', () => {
    const at = shell.indexOf('.ch-root.ch-frame-under {');
    expect(shell.slice(shell.lastIndexOf('@media', at), at)).toContain('@media (max-width: 820px)');
    expect(shell).toMatch(/html\[data-ch-ua-pop\]:has\(\[data-ui='clubhouse'\]\)::view-transition-old\(\*\)/);
  });
});

describe('Back during a push (look-and-feel pass 2026-10-22, mot-04)', () => {
  type Fake = { effect: { pseudoElement: string }; playState: string; animationName?: string; currentTime: number; finish: () => void };
  const real = document.getAnimations;

  function running(list: Fake[]) {
    Object.defineProperty(document, 'getAnimations', { configurable: true, value: () => list });
  }

  afterEach(() => {
    Object.defineProperty(document, 'getAnimations', { configurable: true, value: real });
  });

  it('pops from the whole width when no push is moving', () => {
    running([]);
    expect(takeRunningPush()).toBe(1);
  });

  it('treats a running fade (a pop or a tab switch) as done', () => {
    const finish = vi.fn();
    running([{ effect: { pseudoElement: '::view-transition-new(ch-page)' }, playState: 'running', animationName: 'ch-vt-in', currentTime: 40, finish }]);
    expect(takeRunningPush()).toBe(1);
    expect(finish).toHaveBeenCalled();
  });
});

describe('the tab prefetch', () => {
  it('is skipped offline and with Data Saver', () => {
    expect(prefetchAllowed({ onLine: true } as Navigator)).toBe(true);
    expect(prefetchAllowed({ onLine: false } as Navigator)).toBe(false);
    expect(prefetchAllowed({ onLine: true, connection: { saveData: true } } as unknown as Navigator)).toBe(false);
    expect(prefetchAllowed(undefined)).toBe(false);
  });
});
