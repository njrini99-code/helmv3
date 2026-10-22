import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The team leg grid's bars, zero line and median tick are graphics that carry data, so they hold 3:1 (WCAG 1.4.11)
 * on every surface a cell can sit on, and the signed numbers hold 4.5:1 (1.4.3). The ratios are computed from the
 * values in tokens.css (light and dark), so a token change that breaks them fails here.
 */
const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/tokens.css'), 'utf8');
const split = css.indexOf("html[data-fw-theme='dark'] [data-ui='clubhouse'] {");
const blocks = { light: css.slice(0, split), dark: css.slice(split, css.indexOf('@media (max-width: 820px)', split)) };

type Rgb = [number, number, number];
const hex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
const token = (theme: 'light' | 'dark', name: string): Rgb => {
  const m = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(blocks[theme]);
  if (!m) throw new Error(`${name} is not a hex token in the ${theme} block`);
  return hex(m[1]!);
};
const over = (fg: Rgb, a: number, bg: Rgb): Rgb => fg.map((c, i) => c * a + bg[i]! * (1 - a)) as Rgb;
const lum = ([r, g, b]: Rgb) => {
  const f = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
export const ratio = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

describe.each(['light', 'dark'] as const)('leg grid contrast, %s', (theme) => {
  const t = (n: string) => token(theme, n);
  const cell = t('--ch-ivory-25');
  // The cell, the chosen column (4%/7% green), the worst-loss wash (8%) and both together (10%).
  const green = t('--ch-green-600');
  const loss = t('--ch-chart-loss');
  const surfaces: Record<string, Rgb> = {
    cell,
    'chosen column': over(green, theme === 'light' ? 0.04 : 0.07, cell),
    'worst loss': over(loss, 0.08, cell),
    'chosen + worst': over(loss, 0.1, over(green, theme === 'light' ? 0.04 : 0.07, cell)),
    'row hover': over(theme === 'light' ? [110, 98, 62] : [205, 187, 142], theme === 'light' ? 0.05 : 0.06, cell),
  };

  it.each(Object.entries(surfaces))('bars, zero line and median tick hold 3:1 on %s', (_name, bg) => {
    for (const [what, fg] of [
      ['gain bar', t('--ch-chart-gain')],
      ['loss bar', loss],
      ['zero line', t('--ch-ink-600')],
      ['median tick', t('--ch-ink-700')],
    ] as const) {
      expect(ratio(fg, bg), `${what} on ${_name}`).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(Object.entries(surfaces))('the signed numbers hold 4.5:1 on %s', (_name, bg) => {
    expect(ratio(t('--ch-chart-gain'), bg), 'gain number').toBeGreaterThanOrEqual(4.5);
    expect(ratio(t('--ch-chart-loss-on-tint'), bg), 'loss number').toBeGreaterThanOrEqual(4.5);
  });
});
