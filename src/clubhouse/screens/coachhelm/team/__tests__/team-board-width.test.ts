import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The Team board on a big screen (owner's preview, 11 Nov 2026, 1920 wide: "this screen is uhh very large"). The board had no
 * width of its own and grew with the window; it now stops at the wide measure, from the left edge every page shares.
 * Measured on the dev server: 1408px from x 400 at 1920, unchanged at 1440 and 1180.
 */
const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/coachhelm-team.css'), 'utf8');
const rule = (selector: string): string => {
  const at = css.indexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
};

describe('the Team board on a desk', () => {
  it('stops at the wide measure, on the shared left edge', () => {
    const desk = rule('  .ch-htb.is-desk');
    expect(desk).toContain('max-width: calc(var(--ch-measure-wide) + 48px)');
    expect(desk).toContain('margin-inline: max(0px, calc((100vw - var(--ch-sidebar-w) - var(--ch-measure-wide)) / 2)) auto');
  });
});
