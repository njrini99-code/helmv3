import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A goal with nothing to measure from is written as its line, "Now 72 · target 69", which can take two lines on a phone.
 * Unbalanced, the second line was a lone "69", "ft" or "75%".
 */
describe('a goal’s line in its row', () => {
  it('shares its words between its two lines', () => {
    const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/stats-redesign.css'), 'utf8');
    const at = css.indexOf('\n.ch-shs-goalrows small {');
    expect(at).toBeGreaterThan(-1);
    expect(css.slice(at, css.indexOf('}', at))).toContain('text-wrap: balance');
  });
});
