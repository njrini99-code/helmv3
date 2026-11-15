import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * F-0019 (audit, 13 Nov 2026, coach phone): This week was a card holding three cards, each drawn with a ring and, while unseen, a
 * 2px green outline, in a sideways row. Every tile took the height of the one with a picture, and its byline was pushed to the
 * bottom, so "Distance control with 7 to 9 iron" had its title at the top, its byline at the bottom and nothing between.
 * Now: one container (the section's card), tiles as plain wells with no ring or outline, each as tall as its own words, an unseen
 * tile marked by a small dot after its byline.
 */
const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/coachhelm-team.css'), 'utf8');
const rule = (selector: string): string => {
  const at = css.indexOf(`\n${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
};

describe('This week’s tiles (F-0019)', () => {
  it('the row lets each tile keep its own height', () => {
    expect(rule('.ch-htb .tiles')).toMatch(/align-items:\s*flex-start;/);
  });

  it('a tile is a well inside the card, with no ring, no outline and no minimum height', () => {
    const tile = rule('.ch-htb .tile');
    expect(tile).not.toMatch(/box-shadow/);
    expect(tile).not.toMatch(/min-height/);
    expect(tile).toMatch(/background:\s*var\(--ch-well-bg-flat\);/);
    expect(css).not.toMatch(/\.ch-htb \.tile\.new \{[^}]*box-shadow/);
  });

  it('the byline follows the words instead of sinking to the tile’s foot', () => {
    expect(rule('.ch-htb .tile .tm')).not.toMatch(/margin-top:\s*auto/);
  });

  it('an unseen tile is marked by a dot, never a border or a rail', () => {
    const dot = rule('.ch-htb .tile.new .tm::after');
    expect(dot).toMatch(/border-radius:\s*50%/);
    expect(dot).not.toMatch(/border(-left)?:/);
  });
});
