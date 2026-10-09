import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Swap audit F-38: the phone figure size rule also caught the caption under each figure, drawing "Last 3" at 26px. */
const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/home.css'), 'utf8');

describe('phone Home figures are tabular (final design review, 2026-10-08)', () => {
  it('sets .ch-num tabular again after the font shorthands ("+3", "+0.3", "3:30 – 5:00 PM"), last and phone only', () => {
    const last = /@media \(max-width: 820px\) {\s*\.ch-hm :is\(\.ch-num, \.ch-hm-form__figs dd\.ch-num\) {\s*font-variant-numeric: tabular-nums;\s*font-feature-settings: 'tnum';\s*}\s*}\s*$/;
    expect(css).toMatch(last);
  });
});

describe('player Home phone figures', () => {
  it('sizes the figure, not its caption', () => {
    expect(css).not.toMatch(/\.ch-ph-game\.is-phone \.ch-ph-figs dd\s*{/);
    expect(css).toMatch(/\.ch-ph-game\.is-phone \.ch-ph-figs dd:not\(\.ch-ph-figs__m\)\s*{/);
  });
});
