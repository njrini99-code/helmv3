/**
 * The sign-in family's two layout fixes from the WebKit sweep (12 Nov, 390 and 1440): a notice's action goes under its words,
 * lined up with them (beside them it squeezed "This account already belongs to another program…" into four short lines), and
 * the password's four needs sit two by two (as a wrapped row they broke three and one, "A symbol" alone).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/auth.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (sel: string) => {
  const at = css.indexOf(`\n${sel} {`);
  expect(at, sel).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
};

describe('auth notices and the password needs', () => {
  it('a notice wraps, its words take the row beside the icon, and its action sits under them, lined up', () => {
    expect(rule('.ch-au-notice')).toMatch(/flex-wrap: wrap;/);
    expect(rule('.ch-au-notice p')).toMatch(/flex: 1 1 calc\(100% - var\(--ch-space-8\)\);/);
    expect(rule('.ch-au-notice > .ch-btn')).toMatch(/margin-inline-start: var\(--ch-space-6\);/);
  });

  it('the four password needs are a two-column grid, never three and one', () => {
    expect(rule('.ch-au-rules')).toMatch(/display: grid;/);
    expect(rule('.ch-au-rules')).toMatch(/grid-template-columns: repeat\(2, max-content\);/);
  });
});
