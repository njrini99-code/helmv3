import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * P-7 7.5: the course page's hole map. The tile text holds 4.5:1 on every tint (ink-900 for the average, ink-600 for the
 * number and par), the 1 px rings and the selection ring hold 3:1 against the page surface, and the "most to gain" dot
 * holds 3:1 on the strongest over-par tint. Computed from tokens.css, light and dark.
 */
const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/tokens.css'), 'utf8');
const split = css.indexOf("html[data-fw-theme='dark'] [data-ui='clubhouse'] {");
const blocks = { light: css.slice(0, split), dark: css.slice(split, css.indexOf('@media (max-width: 820px)', split)) };

type Rgb = [number, number, number];
const hex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
/** A token's hex, following one `var(--x)` alias within the same block, then the light block. */
const token = (theme: 'light' | 'dark', name: string): Rgb => {
  for (const block of theme === 'dark' ? [blocks.dark, blocks.light] : [blocks.light]) {
    const m = new RegExp(`\\s${name}:\\s*([^;]+);`).exec(block);
    if (!m) continue;
    const v = m[1]!.trim();
    if (v.startsWith('#')) return hex(v);
    const alias = /^var\((--[a-z0-9-]+)\)$/.exec(v);
    if (alias) return token(theme, alias[1]!);
  }
  throw new Error(`${name} has no hex value in the ${theme} tokens`);
};
const lum = ([r, g, b]: Rgb) => {
  const f = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

describe.each(['light', 'dark'] as const)('hole map contrast, %s', (theme) => {
  const t = (n: string) => token(theme, n);
  const tints = ['--ch-hm-under-2', '--ch-hm-under-1', '--ch-hm-level', '--ch-hm-over-1', '--ch-hm-over-2'];

  it.each(tints)('tile text holds 4.5:1 on %s', (tint) => {
    expect(ratio(t('--ch-ink-900'), t(tint))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t('--ch-ink-600'), t(tint))).toBeGreaterThanOrEqual(4.5);
  });

  it('the rings and the selection hold 3:1 against the surface', () => {
    for (const ring of ['--ch-hm-ring-under', '--ch-hm-ring-level', '--ch-hm-ring-over', '--ch-green-600']) {
      expect(ratio(t(ring), t('--ch-bg-surface')), ring).toBeGreaterThanOrEqual(3);
    }
  });

  it('the most-to-gain dot holds 3:1 on the strongest over tint', () => {
    expect(ratio(t('--ch-chart-loss'), t('--ch-hm-over-2'))).toBeGreaterThanOrEqual(3);
  });
});
