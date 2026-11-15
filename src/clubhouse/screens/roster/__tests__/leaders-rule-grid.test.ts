import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/roster.css'), 'utf8');
const WIDE = '@media (min-width: 1193px) and ((min-height: 501px) or (pointer: fine)) {';
/** The wide desk's block that places the leaders' rule. */
const wide = () => {
  let at = css.indexOf(WIDE);
  while (at > -1 && !css.slice(at, css.indexOf('\n}\n', at)).includes('.ch-rs-ldrs__rule')) at = css.indexOf(WIDE, at + 1);
  expect(at, 'the wide desk block for the rule').toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('\n}\n', at));
};
const rule = (block: string, selector: string) => {
  const at = block.indexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  return block.slice(at, block.indexOf('}', at));
};

/**
 * C5 (WebKit pass, 12 Nov): on a 1920 desk the season card was 200px wide and its class bar, Freshmen and Top five ran
 * past its edge. The top grid flows by column with one named track (the card's, 320px and up), and W24's rule spanned
 * `1 / -1`, which in that grid is the card's track alone: the line took it and pushed the card into a 200px track.
 */
describe('Roster’s top row on a wide desk: the season card keeps its track', () => {
  it('the cards stay in the first row, the leaders’ rule in the second under the leaders', () => {
    const block = wide();
    expect(rule(block, "  [data-ch-crh='on'].ch-rsd .ch-rs-top > .ch-rs-tcard,\n  [data-ch-crh='on'].ch-rsd .ch-rs-top .ch-rs-ldr")).toContain('grid-row: 1');
    const line = rule(block, "  [data-ch-crh='on'].ch-rsd .ch-rs-top > .ch-rs-ldrs__rule");
    expect(line).toContain('grid-row: 2');
    expect(line).toContain('grid-column: 2');
    expect(line).not.toContain('1 / -1');
  });

  it('the card’s own track is still the first, at 320px and up', () => {
    expect(css).toMatch(/\.ch-rsd \.ch-rs-top \{\s*display: grid;\s*grid-auto-columns: minmax\(200px, 1fr\);\s*grid-auto-flow: column;\s*grid-template-columns: minmax\(320px, 1\.2fr\);/);
  });
});
