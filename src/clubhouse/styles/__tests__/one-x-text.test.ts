import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// W1 (owner, 12 Nov 2026: ship it): on 1x screens only, body text 450, medium 560, 12px labels at 13. Retina is unchanged.
const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/tokens.css'), 'utf8');
const block = css.match(/@media \(max-resolution: 1\.5dppx\) \{\s*\[data-ui='clubhouse'\] \{([^}]*)\}\s*\}/)?.[1] ?? '';
const decl = (src: string, name: string) => src.match(new RegExp(`${name}: ([^;]+);`))?.[1];

describe('text on a 1x screen (W1)', () => {
  it('only a 1x screen gets the firmer weights', () => {
    expect(block).not.toBe('');
    for (const step of [12, 13, 14, 15]) {
      expect(decl(block, `--ch-type-${step}`)).toMatch(/^450 /);
      expect(decl(block, `--ch-type-${step}-medium`)).toMatch(/^560 /);
    }
  });
  it('12px labels are 13px there, and nothing else changes size', () => {
    expect(decl(block, '--ch-type-12')).toContain('calc(13 * var(--ch-type-k))');
    for (const step of [13, 14, 15]) expect(decl(block, `--ch-type-${step}`)).toContain(`calc(${step} * var(--ch-type-k))`);
  });
  it('Retina keeps the designed weights (the base tokens are untouched)', () => {
    const base = css.slice(0, css.indexOf('@media (max-resolution: 1.5dppx)'));
    expect(decl(base, '--ch-type-14')).toMatch(/^400 calc\(14 /);
    expect(decl(base, '--ch-type-12')).toMatch(/^400 calc\(12 /);
  });
});
