import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The three goals share a phone card's width, so "Now 72 · target 69" takes two lines (103pt at 390). Unbalanced, the
 * second line was a lone "69", "ft" or "75%".
 */
describe('a goal’s line under its ring', () => {
  it('shares its words between its two lines', () => {
    const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/stats-redesign.css'), 'utf8');
    const at = css.indexOf('\n.ch-shs-rings small {');
    expect(at).toBeGreaterThan(-1);
    expect(css.slice(at, css.indexOf('}', at))).toContain('text-wrap: balance');
  });
});
