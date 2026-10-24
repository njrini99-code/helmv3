import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from './_scan';

/**
 * B2: the spacing scale. A stylesheet on the MIGRATED list sets padding, margin and gaps only on the scale's steps
 * (`--ch-space-*` in tokens.css: 0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48px), or through a token. A 1px offset is a
 * hairline, not spacing, and scroll margins are not spacing either. Screens join the list as they move.
 */
const MIGRATED = ['whats-new.css', 'popup-lab.css', 'base.css', 'coachhelm-brief.css', 'coachhelm-track.css', 'goals.css'];
const SCALE = new Set([0, 1, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48]);

describe('spacing scale (B2)', () => {
  it('the scale and the reading widths are tokens', () => {
    const tokens = readFileSync(join(ROOT, 'styles/tokens.css'), 'utf8');
    for (const [name, px] of [['0_5', 2], ['1', 4], ['1_5', 6], ['2', 8], ['3', 12], ['4', 16], ['5', 20], ['6', 24], ['8', 32], ['10', 40], ['12', 48]] as const) {
      expect(tokens).toContain(`--ch-space-${name}: ${px}px;`);
    }
    expect(tokens).toMatch(/--ch-measure-text: 68ch;/);
  });

  it('the phone gutter is one token, 16 and 20 on a large phone (owner, 2026-10-24, decision 5; OQ-63)', () => {
    // Corrected: this pinned the B2 placeholder (--ch-phone-gutter at today's 20) while OQ-63 was open. Decision 5
    // answered it on --ch-page-x-phone itself, so the placeholder alias is gone; page-spacing.test.ts pins the rest.
    const tokens = readFileSync(join(ROOT, 'styles/tokens.css'), 'utf8');
    expect(tokens).toContain('--ch-page-x-phone: var(--ch-space-4);');
    expect(tokens).toMatch(/@media \(min-width: 414px\)[\s\S]*?--ch-page-x-phone: var\(--ch-space-5\);/);
    expect(tokens).not.toContain('--ch-phone-gutter');
  });

  it.each(MIGRATED)('%s spaces only on the scale', (name) => {
    const file = join(ROOT, 'styles', name);
    const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const off: string[] = [];
    for (const m of src.matchAll(/(?:^|[\s;{])((?:padding|margin|gap|row-gap|column-gap)(?:-[a-z-]+)?):\s*([^;]+);/g)) {
      for (const [, v] of m[2]!.matchAll(/(-?\d+(?:\.\d+)?)px/g)) if (!SCALE.has(Math.abs(Number(v)))) off.push(`${relative(ROOT, file)}: ${m[1]}: ${m[2]}`);
    }
    expect(off).toEqual([]);
  });

  it('What’s new stops its lines at a reading width', () => {
    const css = readFileSync(join(ROOT, 'styles/whats-new.css'), 'utf8');
    expect(css.slice(css.indexOf('.ch-wn-meta {'), css.indexOf('}', css.indexOf('.ch-wn-meta {')))).toMatch(/max-width: var\(--ch-measure-text\);/);
  });
});
