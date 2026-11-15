import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from './_scan';

/** F-0021 (phone, 44pt) and F-0022 (desktop pointer, 24px): the controls the audit found short reach their target. */
const css = (f: string) => readFileSync(join(ROOT, 'styles', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
/** The bodies of every `@media (<query>) {…}` block in a sheet, joined. */
function blocks(src: string, query: string): string {
  const out: string[] = [];
  let at = src.indexOf(`@media (${query})`);
  while (at !== -1) {
    let depth = 0;
    let i = src.indexOf('{', at);
    const start = i + 1;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}' && --depth === 0) break;
    }
    out.push(src.slice(start, i));
    at = src.indexOf(`@media (${query})`, i);
  }
  return out.join('\n');
}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const rule = (src: string, sel: string, decl: string) => new RegExp(`${esc(sel)}\\s*\\{[^}]*${esc(decl)}`).test(src);

describe('phone targets reach 44pt (F-0021)', () => {
  it('a select is drawn at 44 on the phone, like a text field', () => {
    expect(rule(blocks(css('controls.css'), 'max-width: 820px'), '.ch-root .ch-select select', 'height: 44px')).toBe(true);
    expect(rule(blocks(css('stats.css'), 'max-width: 820px'), '.ch-sv-tr__menu .ch-select select', 'height: 44px')).toBe(true);
  });
  it.each(['.ch-hs-ld__why'])('%s takes the shared 44pt reach', (sel) => {
    const phone = blocks(css('controls.css'), 'max-width: 820px');
    expect(phone).toMatch(new RegExp(`:where\\([^)]*${esc(sel)}[^)]*\\)::after`));
  });
  it('the all:unset buttons position themselves, so the reach has a box to grow from', () => {
    expect(rule(css('coachhelm-standing.css'), '.ch-hs-ld__why', 'position: relative')).toBe(true);
  });
  it('the new-event title is 44 tall on the phone', () => {
    expect(rule(blocks(css('calendar.css'), 'max-width: 820px'), '.ch-ed__title', 'min-height: 44px')).toBe(true);
  });
});

describe('desktop pointer targets reach 24px (F-0022)', () => {
  const fine = blocks(css('ui.css'), 'pointer: fine');
  it.each(['.ch-hw-more', '.ch-tr__link', '.ch-tour-cmp-div'])('%s grows to 24 under a mouse', (sel) => {
    expect(fine).toMatch(new RegExp(`:where\\([^)]*${esc(sel)}[^)]*\\)::after\\s*\\{[^}]*inset: min\\(0px, calc\\(50% - 12px\\)\\)`));
  });
  it('the timeline thumb grows through ::before (its ::after is the dot)', () => {
    expect(fine).toMatch(/\.ch-tour-cmp-tl__thumb::before\s*\{[^}]*inset: min\(0px, calc\(50% - 12px\)\)/);
  });
  it('a month chip is at least 24 tall', () => {
    expect(rule(css('calendar.css'), '.ch-mo__ev', 'min-height: 24px')).toBe(true);
  });
});

/** The value of `prop` in the first rule whose whole selector is `sel` (comments stripped). */
function decl(src: string, sel: string, prop: string): string {
  const body = new RegExp(`(?:^|[}\\s])${esc(sel)}\\s*\\{([^}]*)\\}`, 'm').exec(src)?.[1] ?? '';
  return new RegExp(`(?:^|;|\\s)${esc(prop)}:\\s*([^;]+);`).exec(body)?.[1]?.trim() ?? '';
}
/**
 * A strip length in px: `100%` is `pct` and `--ch-wks-gap-max` is `max` (else its fallback). Only the forms the strip
 * uses: calc, clamp, min, max, + - * / and px.
 */
function len(expr: string, pct: number, max?: number, gap?: string): number {
  const js = expr
    .replace(/var\(--ch-wks-gap\)/g, `(${gap ?? 'NaN'})`)
    .replace(/var\(--ch-wks-gap-max, ([\d.]+)px\)/g, (_, d: string) => String(max ?? Number(d)))
    .replace(/100%/g, `(${pct})`)
    .replace(/(\d)px/g, '$1')
    .replace(/calc\(/g, '(')
    .replace(/clamp\(/g, '__clamp(')
    .replace(/\bmin\(/g, 'Math.min(')
    .replace(/\bmax\(/g, 'Math.max(');
  expect(js).toMatch(/^[\d\s.+\-*/(),_A-Za-z]*$/);
  return new Function('__clamp', `return ${js};`)((lo: number, v: number, hi: number) => Math.min(Math.max(lo, v), hi)) as number;
}

/**
 * F-0017 (audit 13 Nov 2026, TO-01): at 375 wide the week strip's days were 43 wide (Home: a 327 strip with a 4px gap;
 * Team Hub: about 313 with 2px). The gap gives up its width before a day goes under 44, and the chosen plate still lands on
 * the day it marks.
 */
describe('week strip days stay 44 wide at 375 (F-0017)', () => {
  const ui = css('ui.css');
  // The day's floor is the 44 pt target token; read its value so the arithmetic below runs on numbers.
  const target = /--ch-target-min:\s*([^;]+);/.exec(css('tokens.css'))?.[1]?.trim() ?? '';
  const sized = (v: string) => v.replaceAll('var(--ch-target-min)', target);
  const gap = sized(decl(ui, '.ch-wks', '--ch-wks-gap'));

  it('the grid spaces its days by the shrinking gap', () => {
    expect(target).toBe('44px');
    expect(gap).not.toBe('');
    expect(decl(ui, '.ch-wks', 'column-gap')).toBe('var(--ch-wks-gap)');
  });

  it.each([
    [313, 2],
    [316, 2],
    [320, 2],
    [327, 4],
    [343, 2],
    [358, 4],
  ])('a %ipx strip (gap up to %ipx) draws seven days of 44 or more', (w, max) => {
    const g = len(gap, w, max);
    expect(g).toBeGreaterThanOrEqual(0);
    expect(g).toBeLessThanOrEqual(max);
    expect((w - 6 * g) / 7).toBeGreaterThanOrEqual(44 - 1e-9);
    // A strip with room keeps its whole gap.
    if (w >= 7 * 44 + 6 * max) expect(g).toBeCloseTo(max);
  });

  it('the chosen plate covers each day exactly, at every width', () => {
    const sel = '.ch-wks[data-chosen]::before';
    expect(decl(ui, sel, 'transform')).toBe('translateX(calc(var(--ch-wks-at, 0) * 100%))');
    const clip = sized(/^inset\(0 0 0 (.+) round var\(--ch-radius-md\)\)$/.exec(decl(ui, sel, 'clip-path'))?.[1] ?? '');
    expect(clip).not.toBe('');
    for (const w of [313, 316, 320, 343, 390]) {
      const g = len(gap, w);
      const day = (w - 6 * g) / 7;
      const left = len(decl(ui, sel, 'left'), w, undefined, gap);
      const width = len(decl(ui, sel, 'width'), w, undefined, gap);
      const cut = len(clip, width);
      for (let i = 0; i < 7; i++) {
        expect(left + i * width + cut).toBeCloseTo(i * (day + g), 6);
        expect(left + (i + 1) * width).toBeCloseTo(i * (day + g) + day, 6);
      }
      // The slack lies before the strip, never after it, so a paging strip gains no scroll width.
      expect(left + 7 * width).toBeLessThanOrEqual(w + 1e-9);
    }
  });

  it("Home widens its strip's gap through the variable, so its gap gives way too", () => {
    const home = css('home.css');
    expect(decl(home, ".ch-hm[data-ch-crh='on'] .ch-hm-week", '--ch-wks-gap-max')).toBe('4px');
    expect(decl(home, ".ch-hm[data-ch-crh='on'] .ch-hm-week", 'gap')).toBe('');
  });
});

/** F-0023 (TO-01): the sign-in footer links reach 44 each way, whatever Text Size draws them at. */
describe('sign-in footer links reach 44pt (F-0023)', () => {
  const auth = css('auth.css');
  it('"Terms" and "Privacy" are at least 44 wide, their words centred', () => {
    expect(rule(auth, '.ch-au-legal a', 'min-width: 44px')).toBe(true);
    expect(rule(auth, '.ch-au-legal a', 'justify-content: center')).toBe(true);
  });
  it('"Create an account" reaches 44 tall however small its line', () => {
    expect(decl(auth, '.ch-au-foot > span:not(.ch-au-legal) a::after', 'inset')).toBe('min(-14px, calc(50% - 22px)) -8px');
  });
});

/** F-0018 (WCAG 2.5.8): desktop text links are at least 24 tall, by block padding that moves nothing. */
describe('desktop text links reach 24px (F-0018)', () => {
  it("Home's team-legs names: inline, so block padding grows the box and not the line", () => {
    const desk = blocks(css('home.css'), 'min-width: 821px');
    expect(rule(desk, '.ch-hm-legs__a', 'padding-block: 4px')).toBe(true);
  });
  it('a round in the Rounds list: padding paid back by an equal negative margin', () => {
    const r = css('rounds.css');
    expect(decl(r, '.ch-trd-open', 'padding-block')).toBe('4px');
    expect(decl(r, '.ch-trd-open', 'margin-block')).toBe('-4px');
  });
});
