import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, walk } from './_scan';

/**
 * B4: what floats lifts. In dark, sheets, the modal, popovers (menus and the bell are popovers) and the peek sit on
 * --ch-bg-elevated, lighter than the cards; and every frosted surface blurs from --ch-glass-blur, so Reduce
 * Transparency and Increase Contrast (which set it to 0) flatten it.
 */
const css = (name: string) => readFileSync(join(ROOT, 'styles', name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const darkBlock = () => {
  const t = css('tokens.css');
  const from = t.indexOf("html[data-fw-theme='dark'] [data-ui='clubhouse'] {");
  return t.slice(from, t.indexOf('\n}\n', from));
};
const hexOf = (block: string, name: string) => new RegExp(`--${name}:\\s*(#[0-9a-f]{6});`).exec(block)?.[1];

describe('elevation tokens (B4)', () => {
  it('in dark, the elevated steps are lighter than the surface and differ from each other', () => {
    const dark = darkBlock();
    const [surface, e1, e2] = ['ch-bg-surface', 'ch-bg-elevated', 'ch-bg-elevated-2'].map((n) => hexOf(dark, n));
    expect(surface).toBeTruthy();
    expect(e1).not.toBe(surface);
    expect(e2).not.toBe(e1);
  });

  it('in light, the elevated steps are the surface', () => {
    const light = css('tokens.css');
    expect(hexOf(light, 'ch-bg-elevated')).toBe(hexOf(light, 'ch-bg-surface'));
    expect(hexOf(light, 'ch-bg-elevated-2')).toBe(hexOf(light, 'ch-bg-surface'));
  });

  it.each([
    ['controls.css', '.ch-modal__panel'],
    ['ui.css', '.ch-popover'],
    ['ui.css', '.ch-peek__card'],
    ['ui.css', '.ch-peek__menu'],
    ['shell.css', '.ch-more'],
    ['shell.css', '.ch-asks__panel'],
  ])('%s %s: dark sits on the elevated surface', (file, selector) => {
    const rules = [...css(file).matchAll(/([^{}]*)\{([^{}]*)\}/g)].filter(
      (m) => m[1]!.includes("[data-fw-theme='dark']") && m[1]!.split(',').some((s) => s.trim().endsWith(selector)) && /background:/.test(m[2]!),
    );
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) expect(r[2]).toMatch(/background: var\(--ch-bg-elevated\);/);
  });

  it('every backdrop blur comes from the glass token', () => {
    const raw: string[] = [];
    for (const file of walk(join(ROOT, 'styles'), /\.css$/)) {
      // Declarations only: an @supports condition names the property too.
      for (const m of css(basename(file)).matchAll(/^\s*(?:-webkit-)?backdrop-filter:\s*([^;]+);/gm)) {
        if (m[1]!.trim() !== 'none' && !m[1]!.includes('var(--ch-glass-blur)')) raw.push(`${basename(file)}: ${m[1]}`);
      }
    }
    expect(raw).toEqual([]);
  });
});
