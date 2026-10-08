import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The phone's reach and press rules that only a stylesheet can hold (P001: CH-1815, CH-1617). WebKit measured them at
 * 390px on 2026-10-08 (every key 44 by 44); these keep the rules that give those numbers from drifting.
 */
const read = (f: string) => readFileSync(join(process.cwd(), 'src/clubhouse/styles', f), 'utf8');
const shell = read('shell.css');
const controls = read('controls.css');
const ui = read('ui.css');
const tokens = read('tokens.css');

/** The bodies of every rule whose selector (or the last selector of its list) is this one, in order. */
function rules(css: string, selector: string): string[] {
  const out: string[] = [];
  for (let i = css.indexOf(`${selector} {`); i > -1; i = css.indexOf(`${selector} {`, i + 1)) out.push(css.slice(i, css.indexOf('}', i)));
  return out;
}
/** The first such rule that sets this property. */
function withProp(css: string, selector: string, prop: string): string {
  const body = rules(css, selector).find((b) => new RegExp(`(?:^|[\\s;{])${prop}:`).test(b));
  expect(body, `${selector} { ${prop} }`).toBeDefined();
  return body!;
}
const px = (body: string, prop: string) => Number(new RegExp(`(?:^|[\\s;{])${prop}:\\s*(-?\\d+)px`).exec(body)?.[1]);

describe('CH-1815 every phone key reaches 44 by 44', () => {
  it("a pushed screen's bar has the shell bar's 44px row, so its back link and text action sit in it", () => {
    // 50px under the status bar with 6px below the row and no hairline: a 44px row, as the shell bar's.
    expect(Number(/--ch-phone-topbar-h:\s*(\d+)px/.exec(tokens)?.[1])).toBe(50);
    expect(withProp(shell, '  .ch-pbar', 'padding')).toMatch(/padding:\s*env\(safe-area-inset-top\) 8px 6px 16px/);
    expect(withProp(shell, "[data-ui='clubhouse'] .ch-pbar", 'border-bottom')).toMatch(/border-bottom:\s*0/);
    expect(withProp(shell, "[data-ui='clubhouse'] .ch-topbar", 'border-bottom')).toMatch(/border-bottom:\s*0/);
    expect(px(withProp(shell, '.ch-pbar__back', 'height'), 'height')).toBe(44);
    expect(px(withProp(shell, '.ch-pbar__text', 'height'), 'height')).toBe(44);
  });

  it('the hero bell is a 44px key drawn as the 40px disc, where it was', () => {
    const bell = withProp(shell, '.ch-root[data-phone-hero] .ch-topbar .ch-bell', 'width');
    expect(px(bell, 'width')).toBe(44);
    expect(px(bell, 'height')).toBe(44);
    expect(bell).toMatch(/border:\s*2px solid transparent/);
    expect(bell).toMatch(/background-clip:\s*padding-box/);
    expect(px(bell, 'margin')).toBe(-2);
  });

  it('CH-1806 the hero bell shows keyboard focus as a champagne ring off the disc, with no shadow of its own', () => {
    const focus = withProp(shell, '.ch-root[data-phone-hero] .ch-topbar .ch-bell:focus-visible', 'outline');
    expect(focus).toMatch(/outline:\s*2px solid var\(--ch-champagne-300\)/);
    expect(focus).toMatch(/outline-offset:\s*0/);
    expect(focus).not.toMatch(/box-shadow/);
  });

  it("a sheet's close reaches 44 inside its header, which clips, even with a title alone", () => {
    const close = withProp(controls, '.ch-modal__head .ch-iconbtn::before', 'inset');
    const m = /inset:\s*-(\d+)px -(\d+)px -(\d+)px/.exec(close)!;
    const top = Number(m[1]);
    const side = Number(m[2]);
    const bottom = Number(m[3]);
    const key = px(withProp(ui, '.ch-btn--sm', 'height'), 'height');
    expect(key + top + bottom).toBeGreaterThanOrEqual(44);
    expect(key + 2 * side).toBeGreaterThanOrEqual(44);
    // The header's padding around the close is all the reach it can have: the header scrolls, so it clips.
    const below = Number(/padding:\s*\d+px \d+px (\d+)px \d+px/.exec(withProp(controls, '.ch-modal__head', 'padding'))![1]);
    expect(bottom).toBeLessThanOrEqual(below);
    expect(top).toBeLessThanOrEqual(px(withProp(controls, '.ch-modal__head', 'padding-top'), 'padding-top'));
  });

  it('the search field carries its own 44px reach and 16px text, with its input and clear key above the reach', () => {
    expect(withProp(controls, '.ch-search', 'position')).toMatch(/position:\s*relative/);
    expect(withProp(controls, '.ch-search::after', 'inset')).toMatch(/inset:\s*min\(0px, calc\(50% - 22px\)\) 0/);
    const input = withProp(controls, '.ch-search input', 'z-index');
    expect(input).toMatch(/z-index:\s*1/);
    expect(px(input, 'font-size')).toBe(16);
    // Positioned by its own rule, not the .ch-root hit-area rule, so a field in a portaled sheet keeps its clear key on top.
    const clear = withProp(controls, '.ch-search .ch-search__x', 'z-index');
    expect(clear).toMatch(/position:\s*relative/);
    expect(clear).toMatch(/z-index:\s*1/);
  });
});

describe('CH-1617 choices and the feature card answer a press without scaling', () => {
  for (const selector of ['.ch-seg__b:not(.is-on):active', ".ch-pill:not([aria-pressed='true']):active"])
    it(`${selector} tints after the press delay`, () => {
      const r = withProp(controls, selector, 'background');
      expect(r).toMatch(/background:\s*var\(--ch-ledger-row-press\)/);
      expect(r).toMatch(/transition-delay:\s*var\(--ch-dur-press-delay\)/);
      expect(r).not.toMatch(/scale|transform/);
    });

  it('the segment tint comes in over the press beat', () => {
    expect(withProp(controls, '.ch-seg__b', 'transition')).toMatch(/background var\(--ch-dur-press\) var\(--ch-ease\)/);
  });

  it('the linked feature card lays a shade over its green and never scales', () => {
    expect(ui).not.toMatch(/\.ch-feat\.is-link:active\s*\{[^}]*scale/);
    expect(withProp(ui, '.ch-feat.is-link:active::after', 'opacity')).toMatch(/opacity:\s*1/);
    expect(withProp(ui, '.ch-feat.is-link::after', 'pointer-events')).toMatch(/pointer-events:\s*none/);
  });
});
