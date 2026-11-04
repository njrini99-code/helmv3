// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CH_FADE_MS } from '../lib/motion';
import { pressScaleOptIn } from '../lib/press';

/** Clubhouse refresh, PR 1: the additive tokens, read from the stylesheet. Contrast is WCAG 2's. */

const tokens = readFileSync(join(process.cwd(), 'src/clubhouse/styles/tokens.css'), 'utf8');
const darkBlock = tokens.slice(tokens.indexOf("html[data-fw-theme='dark'] [data-ui='clubhouse'] {"));
const read = (css: string, name: string): string => {
  const m = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!m) throw new Error(`no hex for ${name}`);
  return m[1]!;
};
const light = (name: string) => read(tokens, name);
const refreshDark = tokens.slice(tokens.indexOf("html[data-fw-theme='dark'] [data-ch-refresh='on'] {"));
const dark = (name: string) => (/^--ch-chart-(gain|loss)-fill$/.test(name) ? read(refreshDark, name) : read(darkBlock, name));

const lum = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

describe.each([
  ['light', light],
  ['dark', dark],
] as const)('refresh tokens, %s', (_, t) => {
  it.each(['--ch-gain', '--ch-loss', '--ch-flag'])('%s reads at least 4.5:1 on the page and the card', (ink) => {
    expect(contrast(t(ink), t('--ch-grouped-bg'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t(ink), t('--ch-card-bg'))).toBeGreaterThanOrEqual(4.5);
  });
  it.each(['--ch-chart-gain-fill', '--ch-chart-loss-fill', '--ch-chart-flat'])('%s holds 3:1 on its track', (fill) => {
    expect(contrast(t(fill), t('--ch-chart-track'))).toBeGreaterThanOrEqual(3);
  });
  it.each(['--ch-yr-sr', '--ch-yr-jr', '--ch-yr-so', '--ch-yr-fr'])('white on %s reads at least 4.5:1', (fill) => {
    expect(contrast('#ffffff', t(fill))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('refresh motion tokens', () => {
  it('the reduced crossfade equals CH_FADE_MS', () => {
    expect(tokens).toContain(`--ch-dur-crossfade-rm: ${CH_FADE_MS}ms;`);
  });
  it('a route push moves the page behind as far as a stack push', () => {
    expect(tokens).toContain('--ch-vt-parallax: -24%;');
    expect(tokens).not.toContain('--ch-vt-parallax: -30%;');
  });
  it('the settle spring has its CSS curve', () => {
    expect(tokens).toMatch(/--ch-ease-spring-settle: linear\(0, 0\.0429,/);
    expect(tokens).toContain('--ch-dur-spring-settle: 417ms;');
  });
});

describe('pressScaleOptIn', () => {
  const el = (v: string | null) => {
    const d = document.createElement('div');
    if (v != null) d.setAttribute('data-ch-press-scale', v);
    return d;
  };
  it('reads a card’s flat scale and refuses what is not one', () => {
    expect(pressScaleOptIn(el('.97'))).toBe(0.97);
    expect(pressScaleOptIn(el(null))).toBeNull();
    expect(pressScaleOptIn(null)).toBeNull();
    for (const bad of ['', 'x', '0', '1', '1.2']) expect(pressScaleOptIn(el(bad))).toBeNull();
  });
});
