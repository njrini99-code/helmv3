import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/tournaments-compare.css'), 'utf8');
const rule = (selector: string) => {
  const at = css.indexOf(`${selector} {`);
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
};
const px = (selector: string, prop: string) => Number(new RegExp(`${prop}:\\s*(-?\\d+)px`).exec(rule(selector))?.[1]);

describe('the comparison timeline’s season names', () => {
  it('stand in a band over the plot, never inside it under that season’s dots', () => {
    const name = rule('.ch-tour-cmp-tl__season em');
    expect(name).toMatch(/bottom:\s*calc\(100% \+ 2px\)/);
    expect(name).not.toMatch(/\btop:/);
    // The band is the plot's own offset from the track's top; an 11px name on its tight line fits in it.
    expect(px('.ch-tour-cmp-tl__plot', 'top')).toBe(14);
  });

  it('everything under the plot keeps its distance from it', () => {
    const plotTop = px('.ch-tour-cmp-tl__plot', 'top');
    const plotEnd = plotTop + px('.ch-tour-cmp-tl__plot', 'height');
    // The event marks hang 18 over the plot's foot; the range bar, its ends and the months follow it.
    expect(px('.ch-tour-cmp-tl__mk', 'top')).toBe(plotEnd - 18);
    expect(px('.ch-tour-cmp-tl__sel', 'top')).toBe(plotEnd + 2);
    expect(px('.ch-tour-cmp-tl__axis', 'top')).toBe(plotEnd + 6);
    expect(px('.ch-tour-cmp-tl__thumb', 'top')).toBe(plotEnd + 9);
    expect(px('.ch-tour-cmp-tl__lab', 'top')).toBe(plotEnd + 28);
    expect(px('.ch-tour-cmp-tl__track', 'height')).toBe(plotEnd + 48);
  });
});
