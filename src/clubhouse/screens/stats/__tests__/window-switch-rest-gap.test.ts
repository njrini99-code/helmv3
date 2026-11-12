import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/stats-redesign.css'), 'utf8');
const rule = (selector: string) => {
  const at = css.indexOf(`\n${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
};

/**
 * Phone premium sweep (12 Nov 2026): on a phone, Team stats' window switch is the page's first line (its title is for
 * screen readers) and sat 2px under the sheet's top edge, where every other page's first line stands clear. As the first
 * line it takes a top margin; a sticky box's margin is not kept once it sticks, so the stuck band is as it was. The
 * skeleton's switch is its first line too, so loading and loaded draw it in one place.
 */
describe('Stats’ window switch at rest stands clear of the sheet’s edge', () => {
  it('as the first line it takes a 16px top margin', () => {
    expect(rule('.ch-shs .ch-shs-ctl:first-child')).toMatch(/margin-top:\s*var\(--ch-space-4\);/);
  });

  it('stuck, it is the same sticky band under the bar', () => {
    const sticky = rule('.ch-shs .ch-shs-ctl');
    expect(sticky).toMatch(/position:\s*sticky;/);
    expect(sticky).toMatch(/padding:\s*2px var\(--ch-page-x-phone\) 8px;/);
  });

  it('the skeleton draws its switch as its first line, as the team page does', () => {
    const skel = readFileSync(join(process.cwd(), 'src/clubhouse/screens/stats/ShsSkeleton.tsx'), 'utf8');
    expect(skel).toMatch(/\{head && \([\s\S]*?\)\}\s*<div className="ch-shs-ctl" inert>/);
  });
});
