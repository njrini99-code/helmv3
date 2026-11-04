import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Stats-home criterion 113, as a rule check on the stylesheet: jsdom has no layout, so these assert the inset each undersized control
 * declares, not a measured box. The measured check needs a browser (the lane's capture); this holds the rules between captures.
 */
const css = readFileSync(resolve(process.cwd(), 'src/clubhouse/styles/stats-redesign.css'), 'utf8');

function rule(selector: string): string {
  const at = css.indexOf(`${selector} {`);
  expect(at, `no rule for ${selector}`).toBeGreaterThanOrEqual(0);
  return css.slice(at, css.indexOf('}', at));
}

describe('hit areas reach 44', () => {
  it.each([
    ['window segment', '.ch-shs-ctl .ch-seg__b::before', 'inset: -6px 0;'],
    ['filter', '.ch-shs-ctl .ch-sf__open::before', 'inset: -2px;'],
    ['feature chevron', '.ch-shs-dlink::before', 'inset: -10px;'],
    ['Try again', '.ch-shs-btn::before', 'inset: -4px 0;'],
  ])('%s', (_name, selector, inset) => {
    const r = rule(selector);
    expect(r).toContain("content: ''");
    expect(r).toContain('position: absolute');
    expect(r).toContain(inset);
  });
});
