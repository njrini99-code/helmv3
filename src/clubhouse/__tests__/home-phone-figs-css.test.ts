import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Swap audit F-38: the phone figure size rule also caught the caption under each figure, drawing "Last 3" at 26px. */
const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/home.css'), 'utf8');

describe('player Home phone figures', () => {
  it('sizes the figure, not its caption', () => {
    expect(css).not.toMatch(/\.ch-ph-game\.is-phone \.ch-ph-figs dd\s*{/);
    expect(css).toMatch(/\.ch-ph-game\.is-phone \.ch-ph-figs dd:not\(\.ch-ph-figs__m\)\s*{/);
  });
});
