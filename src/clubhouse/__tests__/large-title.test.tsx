import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CH_BAR_TITLE_RANGE, CH_LARGE_TITLES, barTitleOnScroll, findLargeTitle, titleOnScroll, usePhoneLargeTitle, watchCanvasScroll, watchLargeTitle } from '../shell/large-title';

/**
 * Phone large titles (owner 2026-10-08, the cardless phone pass): the bar's title is hidden at rest while the page has
 * its own large title, and fades in from 36 to 52px of scroll as the large title goes under the bar (MOTION-AND-VISUAL
 * 3.3); the bar's scroll edge shows once anything has scrolled. WebKit at 390px measured the first-paint hiding on eight
 * screens (the earlier PR's check script); these hold the logic and the CSS.
 */

/** The phone's bar with a pushed title (`title`), and the page under it. */
function mount(page: string, title = '<div class="ch-topbar__pslot"><h1 class="ch-pbar__title" tabindex="-1">Team stats</h1></div>') {
  document.body.innerHTML = `<div class="ch-root" data-ui="clubhouse"><div class="ch-canvas" id="ch-canvas"><header class="ch-topbar">${title}</header><main>${page}</main></div></div>`;
  return { bar: document.querySelector<HTMLElement>('.ch-topbar')!, canvas: document.getElementById('ch-canvas')! };
}

const barTitle = () => document.querySelector<HTMLElement>('.ch-topbar .ch-pbar__title')!;
const scrollTo = (y: number) => {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
  window.dispatchEvent(new Event('scroll'));
};

beforeEach(() => {
  // jsdom has no scroll timeline: the script's fallback runs, as on Safari before 26.
  vi.stubGlobal('CSS', { supports: () => false });
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    // Runs the frame at once; 0 so the next scroll asks for a frame again.
    cb(0);
    return 0;
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  document.body.innerHTML = '';
});

describe('findLargeTitle', () => {
  it("finds the page's large title by the one large-title class (owner decision 4, CONS-27)", () => {
    const { canvas } = mount('<div class="ch-rsm-head"><p class="ch-large-title" aria-hidden="true" data-ch-large-title="">Roster</p></div>');
    expect(findLargeTitle(canvas)?.textContent).toBe('Roster');
  });
  it('is one selector, the class, and no screen title class is a large title on its own', () => {
    expect(CH_LARGE_TITLES).toEqual(['.ch-large-title']);
    const { canvas } = mount('<p class="ch-rsm-title">Roster</p><div class="ch-stm-head"><h1>Team stats</h1></div><h1 data-ch-large-title="">Bare</h1>');
    expect(findLargeTitle(canvas)).toBeNull();
  });
  it('skips a visually hidden heading, a pushed screen and a dialog', () => {
    const { canvas } = mount(
      '<h1 class="ch-sr-only ch-large-title">Hidden</h1><div class="ch-pscreen"><p class="ch-large-title">Pushed</p></div><dialog open><p class="ch-large-title">Sheet</p></dialog>',
    );
    expect(findLargeTitle(canvas)).toBeNull();
  });
  it("leaves a page's content heading alone (Calendar's month, a round's course)", () => {
    const { canvas } = mount('<header class="ch-intro ch-calm-head"><h2 class="ch-intro__title ch-calm-title">October</h2></header><h1>Finley GC</h1>');
    expect(findLargeTitle(canvas)).toBeNull();
  });
});

describe('barTitleOnScroll (MOTION-AND-VISUAL 3.3)', () => {
  it('is 0 at rest and until 36px, 1 from 52px, linear between, with no curve', () => {
    expect(CH_BAR_TITLE_RANGE).toEqual({ from: 36, to: 52 });
    expect(barTitleOnScroll(0)).toBe(0);
    expect(barTitleOnScroll(-20)).toBe(0);
    expect(barTitleOnScroll(36)).toBe(0);
    expect(barTitleOnScroll(40)).toBeCloseTo(0.25);
    expect(barTitleOnScroll(44)).toBeCloseTo(0.5);
    expect(barTitleOnScroll(52)).toBe(1);
    expect(barTitleOnScroll(400)).toBe(1);
  });
  it('comes in over the last third of the large title going under, so the name never shows twice at rest', () => {
    // At 36px the large title is already most of the way out.
    expect(titleOnScroll(CH_BAR_TITLE_RANGE.from)).toBeLessThan(0.4);
    expect(barTitleOnScroll(CH_BAR_TITLE_RANGE.from)).toBe(0);
  });
});

describe('watchLargeTitle (older Safari: the scroll fades the titles from script)', () => {
  it("fades the bar's title in from 36 to 52px of scroll and the large title out over 0 to 52px", () => {
    const { bar, canvas } = mount('<header class="ch-stm-head"><p class="ch-large-title">Team stats</p></header>');
    const large = canvas.querySelector<HTMLElement>('main .ch-large-title')!;
    const stop = watchLargeTitle(bar, canvas);
    expect(barTitle().style.opacity).toBe('0');
    expect(large.style.opacity).toBe('');
    scrollTo(20);
    expect(barTitle().style.opacity).toBe('0');
    expect(Number(large.style.opacity)).toBeCloseTo(titleOnScroll(20));
    scrollTo(44);
    expect(Number(barTitle().style.opacity)).toBeCloseTo(0.5);
    scrollTo(80);
    expect(barTitle().style.opacity).toBe('1');
    expect(Number(large.style.opacity)).toBeCloseTo(0.1);
    scrollTo(0);
    expect(barTitle().style.opacity).toBe('0');
    expect(large.style.opacity).toBe('');
    stop();
    expect(barTitle().style.opacity).toBe('');
  });

  it("never writes the bar's section switcher, which always shows (owner, 2026-10-16)", () => {
    const { bar, canvas } = mount(
      '<p class="ch-large-title">Roster</p>',
      '<div class="ch-topbar__pslot"><div class="ch-pbar__title"><div class="ch-sw">Roster</div></div></div>',
    );
    const stop = watchLargeTitle(bar, canvas);
    scrollTo(10);
    expect(barTitle().style.opacity).toBe('');
    stop();
  });

  it('finds the title again when the page swaps, and hands the bar title back on a page with none', async () => {
    const { bar, canvas } = mount('<p class="ch-large-title">Settings</p>');
    const stop = watchLargeTitle(bar, canvas);
    scrollTo(44);
    expect(Number(barTitle().style.opacity)).toBeCloseTo(0.5);
    canvas.querySelector('main')!.innerHTML = '<div class="ch-recm-page"><p class="ch-large-title">Recruiting</p></div>';
    await Promise.resolve();
    expect(Number(barTitle().style.opacity)).toBeCloseTo(0.5);
    // A page with no large title: the bar keeps its title, at full strength from the stylesheet.
    canvas.querySelector('main')!.innerHTML = '<h1>Messages</h1>';
    await Promise.resolve();
    expect(barTitle().style.opacity).toBe('');
    scrollTo(10);
    expect(barTitle().style.opacity).toBe('');
    stop();
  });

  it('shows the scroll edge once content has scrolled under the bar, and tears down clean', () => {
    const { bar, canvas } = mount('<p class="ch-large-title">Roster</p>');
    const stop = watchLargeTitle(bar, canvas);
    expect(bar.hasAttribute('data-scrolled')).toBe(false);
    scrollTo(40);
    expect(bar.hasAttribute('data-scrolled')).toBe(true);
    stop();
    expect(bar.hasAttribute('data-scrolled')).toBe(false);
    expect(canvas.querySelector<HTMLElement>('main .ch-large-title')!.style.opacity).toBe('');
    expect(barTitle().style.opacity).toBe('');
    scrollTo(60);
    expect(bar.hasAttribute('data-scrolled')).toBe(false);
  });

  it('leaves both fades to CSS where Safari has a scroll timeline, and still marks the scroll edge', () => {
    vi.stubGlobal('CSS', { supports: (q: string) => q === 'animation-timeline: scroll()' });
    const { bar, canvas } = mount('<p class="ch-large-title">Roster</p>');
    const stop = watchLargeTitle(bar, canvas);
    scrollTo(44);
    expect(bar.hasAttribute('data-scrolled')).toBe(true);
    expect(barTitle().style.opacity).toBe('');
    expect(canvas.querySelector<HTMLElement>('main .ch-large-title')!.style.opacity).toBe('');
    stop();
  });
});

describe('watchCanvasScroll (row 41, desktop)', () => {
  it("marks the bar scrolled from the canvas's own scroll, not the window's, and tears down clean", () => {
    const { bar, canvas } = mount('<p>Roster</p>');
    const stop = watchCanvasScroll(bar, canvas);
    expect(bar.hasAttribute('data-scrolled')).toBe(false);
    Object.defineProperty(window, 'scrollY', { value: 40, configurable: true });
    window.dispatchEvent(new Event('scroll'));
    expect(bar.hasAttribute('data-scrolled')).toBe(false);
    Object.defineProperty(canvas, 'scrollTop', { value: 40, configurable: true });
    canvas.dispatchEvent(new Event('scroll'));
    expect(bar.hasAttribute('data-scrolled')).toBe(true);
    Object.defineProperty(canvas, 'scrollTop', { value: 0, configurable: true });
    canvas.dispatchEvent(new Event('scroll'));
    expect(bar.hasAttribute('data-scrolled')).toBe(false);
    Object.defineProperty(canvas, 'scrollTop', { value: 40, configurable: true });
    canvas.dispatchEvent(new Event('scroll'));
    stop();
    expect(bar.hasAttribute('data-scrolled')).toBe(false);
    canvas.dispatchEvent(new Event('scroll'));
    expect(bar.hasAttribute('data-scrolled')).toBe(false);
  });
});

describe('usePhoneLargeTitle', () => {
  const media = (matches: boolean) =>
    vi.stubGlobal('matchMedia', (q: string) => ({ matches, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }));

  it('watches on the phone', () => {
    const { bar } = mount('<p class="ch-large-title">Roster</p>');
    media(true);
    const { unmount } = renderHook(() => {
      const ref = useRef<HTMLElement | null>(document.querySelector<HTMLElement>('.ch-topbar'));
      usePhoneLargeTitle(ref);
    });
    scrollTo(44);
    expect(bar.hasAttribute('data-scrolled')).toBe(true);
    expect(Number(barTitle().style.opacity)).toBeCloseTo(0.5);
    unmount();
    expect(bar.hasAttribute('data-scrolled')).toBe(false);
    expect(barTitle().style.opacity).toBe('');
  });
  it('never watches the large title on desktop, only the canvas scroll edge', () => {
    const { bar, canvas } = mount('<p class="ch-large-title">Roster</p>');
    media(false);
    const { unmount } = renderHook(() => {
      const ref = useRef<HTMLElement | null>(document.querySelector<HTMLElement>('.ch-topbar'));
      usePhoneLargeTitle(ref);
    });
    scrollTo(44);
    expect(barTitle().style.opacity).toBe('');
    expect(canvas.querySelector<HTMLElement>('main .ch-large-title')!.style.opacity).toBe('');
    Object.defineProperty(canvas, 'scrollTop', { value: 30, configurable: true });
    canvas.dispatchEvent(new Event('scroll'));
    expect(bar.hasAttribute('data-scrolled')).toBe(true);
    unmount();
    expect(bar.hasAttribute('data-scrolled')).toBe(false);
  });
});

describe('the CSS that hides and fades the bar title', () => {
  const shell = readFileSync(join(process.cwd(), 'src/clubhouse/styles/shell.css'), 'utf8');
  const block = shell.slice(shell.indexOf('/* Phone large titles'), shell.indexOf('/* The More sheet'));

  it("names every large title the hook watches in its first-paint :has(), phone only, never on the hero's bar", () => {
    expect(block).toMatch(/^\/\* Phone large titles[\s\S]*?\*\/\n@media \(max-width: 820px\)[^{]*\{/);
    const has = block.slice(block.indexOf(':has('), block.indexOf('.ch-topbar\n'));
    for (const sel of CH_LARGE_TITLES) expect(has, sel).toContain(sel);
    expect(has).toContain(':not(.ch-sr-only, .ch-pscreen *, dialog *)');
    expect(block).toContain("[data-ui='clubhouse']:not([data-phone-hero]):has(");
    // Hidden at rest; the scroll alone brings it in (MOTION-AND-VISUAL 3.3), so it has no transition of its own to lag behind.
    expect(block).toMatch(/\.ch-topbar\s*:is\(\.ch-topbar__pslot > \.ch-pbar__title, \.ch-topbar__pstand \.ch-pbar__title\):not\(:has\(\.ch-sw\)\) \{\s*opacity: 0;\s*transition: none;\s*\}/);
    expect(block).not.toContain('data-large-title');
  });
  it("fades the bar's title in from 36 to 52px on the scroll timeline where Safari has one (MOTION-AND-VISUAL 3.3)", () => {
    const supports = block.slice(block.indexOf('@supports (animation-timeline: scroll())'), block.indexOf("[data-ui='clubhouse'] .ch-topbar::before"));
    expect(supports).toContain(':not(:has(.ch-sw))');
    expect(supports).toMatch(/\{\s*--ch-lt-to: 1;\s*animation: ch-lt-under linear both;\s*animation-timeline: scroll\(root block\);\s*animation-range: 36px 52px;\s*\}/);
    // The large title's own fade shares the one keyframe, from 1 to its 0.1.
    expect(shell).toMatch(/@keyframes ch-lt-under \{\s*to \{\s*opacity: var\(--ch-lt-to, 0\.1\);\s*\}\s*\}/);
  });
  it("never hides the bar's section switcher, whatever the page draws under it (owner, 2026-10-16)", () => {
    // Home's green hero swaps its own title in place; any other rule that fades the section title out is the old hiding.
    const rules = shell.split('}').filter((r) => /opacity: 0;/.test(r) && r.includes('.ch-topbar__ptitle'));
    for (const rule of rules) expect(/(?<!:not\()\[data-phone-hero\]/.test(rule), rule.slice(0, 160)).toBe(true);
    // Roster, Settings, Qualifiers and Recruiting hold the switcher in their own bar title: it is never the one hidden.
    const pushed = shell.split('}').filter((r) => /opacity: 0;/.test(r) && r.includes('.ch-pbar__title'));
    expect(pushed.length).toBeGreaterThan(0);
    for (const rule of pushed) expect(rule, rule.slice(0, 160)).toContain(':not(:has(.ch-sw))');
    expect(shell).not.toContain('data-switch-quiet');
  });
  it('sets the one large title on the large-title role, phone only, and nothing else in the stylesheets sets it (owner decision 4)', () => {
    expect(block).toMatch(/\[data-ui='clubhouse'\] \.ch-large-title \{\s*margin: 0;\s*font: var\(--ch-type-large-title\);\s*letter-spacing: var\(--ch-track-large-title\);\s*font-variation-settings: var\(--ch-wdth-dense\);\s*color: var\(--ch-title-ink\);/);
    const tokens = readFileSync(join(process.cwd(), 'src/clubhouse/styles/tokens.css'), 'utf8');
    // The title's ink is one token (owner, 11 Nov 2026: page titles are near-black on every page): the deepest forest step by day, the Ledger's ink at night.
    expect(tokens).toMatch(/--ch-title-ink: var\(--ch-green-900\);/);
    expect(tokens).toMatch(/--ch-title-ink: var\(--ch-ledger-ink\);/);
    // MOTION-AND-VISUAL 4.3: 34/41 700 on the phone, 30/36 700 on the desktop.
    expect(tokens).toMatch(/--ch-type-large-title: 700 calc\(34 \* var\(--ch-type-k\)\)\/calc\(41 \* var\(--ch-type-k\)\) var\(--ch-font-sans\);/);
    expect(tokens).toMatch(/--ch-type-large-title: 700 calc\(30 \* var\(--ch-type-k\)\)\/calc\(36 \* var\(--ch-type-k\)\) var\(--ch-font-sans\);/);
    // The screens' old title rules are gone: no stylesheet styles a large title by its own class any more.
    const dir = join(process.cwd(), 'src/clubhouse/styles');
    const old = /\.ch-(rsm|recm|setm)-title\s*\{[^}]*font:|\.ch-hl-h__t\s*\{[^}]*font: var\(--ch-type-34-strong\)|\.ch-stm-head h1\s*\{[^}]*font:|\.ch-ms-rail__title h1\s*\{[^}]*font: var\(--ch-type-34-strong\)/;
    for (const f of ['roster.css', 'recruiting.css', 'settings.css', 'coachhelm.css', 'stats.css']) {
      expect(old.test(readFileSync(join(dir, f), 'utf8')), f).toBe(false);
    }
    // Only page titles read the role: the phone's one large title and the desktop page heads (the shell's hero, Classes,
    // Qualifiers and Rounds), never a card's heading (a card hero title is the title role).
    const all = ['shell.css', 'roster.css', 'recruiting.css', 'settings.css', 'coachhelm.css', 'stats.css', 'hub.css', 'classes.css', 'messages.css', 'qualifiers.css', 'rounds.css'];
    const users = all.filter((f) => readFileSync(join(dir, f), 'utf8').includes('var(--ch-type-large-title)'));
    expect(users).toEqual(['shell.css', 'classes.css', 'qualifiers.css', 'rounds.css']);
  });
  it('fades on opacity and translate at the quick duration, and swaps at once with reduced motion or Animations off', () => {
    expect(block).toMatch(/transition:\s*opacity var\(--ch-dur-quick\) var\(--ch-ease\),\s*translate var\(--ch-dur-quick\) var\(--ch-ease\);/);
    expect(block).not.toMatch(/transition:[^;]*\b(transform|top|height|visibility|display)\b/);
    expect(block).toMatch(/\[data-ui='clubhouse'\]\[data-motion='off'\] \.ch-topbar :is\([^)]*\) \{\s*transition: none;/);
    expect(block).toMatch(/@media \(max-width: 820px\) and \(prefers-reduced-motion: reduce\)[^{]*\{[\s\S]*?transition: none;/);
  });
  // Nick, 20 Nov 2026 ("no contrast"): the phone bar ends on its own hard edge; the green fade under it read as a muddy
  // band over the cards, so it no longer shows when scrolled. ::after stays the sheet's lip.
  it('draws no scroll shade under the phone bar, scrolled or not', () => {
    expect(block).toMatch(/\.ch-topbar::before \{[^}]*opacity: 0;/);
    expect(block).toMatch(/\[data-ui='clubhouse'\]:not\(\[data-phone-hero\]\) \.ch-topbar\[data-scrolled\]::before \{\s*opacity: 0;/);
  });
});

describe('the More sheet is native inset grouped rows on the phone', () => {
  const shell = readFileSync(join(process.cwd(), 'src/clubhouse/styles/shell.css'), 'utf8');
  const block = shell.slice(shell.indexOf('/* The More sheet'));
  it('flat groups, label-inset hairlines and plain icons, phone only', () => {
    expect(block).toMatch(/^\/\* The More sheet[\s\S]*?\*\/\n@media \(max-width: 820px\)[^{]*\{/);
    expect(block).toMatch(/\.ch-more__list,\s*\.ch-more__me \{[^}]*box-shadow: none;/);
    expect(block).toMatch(/\.ch-more__row \+ \.ch-more__row::before \{[^}]*left: 54px;/);
    expect(block).toMatch(/\.ch-more__row\[aria-current='true'\] \.ch-more__ic \{[^}]*background: none;/);
  });
});
