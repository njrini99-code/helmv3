import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { tokenHex, type Theme } from './_tokens';

/**
 * The player file's card heads are the deep green title bar (look-09). What sits in a head must take the bar's inks: the
 * "Only you" label kept the card's dark secondary ink there, 1.23:1 on the green (the presentation gate, 24 Nov 2026).
 */
const root = postcss.parse(readFileSync(join(process.cwd(), 'src/clubhouse/styles/coachhelm-file.css'), 'utf8'));
const color = (selector: string): string | undefined => {
  let found: string | undefined;
  root.walkRules((r) => {
    if (r.selectors.includes(selector)) r.walkDecls('color', (d) => { found = d.value; });
  });
  return found;
};
const lum = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};

describe('player file card head inks', () => {
  it('the "Only you" label takes the bar ink, and outranks its own card ink', () => {
    // `.ch-hf .vis` sets the card's ink on the label itself, so the bar's `small` rule alone never reaches it.
    expect(color('.ch-hf .vis')).toBe('var(--ch-hf-a-ink-2)');
    expect(color('.ch-hf .card > .card__h .vis')).toBe('var(--ch-feature-ink-2)');
  });

  it('the bar ink holds 4.5:1 on the bar in both themes', () => {
    for (const theme of ['light', 'dark'] as Theme[]) {
      const [hi, lo] = [lum(tokenHex('ch-feature-ink-2', theme)), lum(tokenHex('ch-feature-bg', theme))].sort((x, y) => y - x);
      expect((hi! + 0.05) / (lo! + 0.05), theme).toBeGreaterThanOrEqual(4.5);
    }
  });
});
