import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** A11: changing the Stats window dims the page only after a 150ms beat; leaving the busy state clears at once. */

const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/stats.css'), 'utf8');
const rule = (selector: string) => {
  const at = css.indexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThanOrEqual(0);
  return css.slice(at, css.indexOf('}', at));
};
const tokens = readFileSync(join(process.cwd(), 'src/clubhouse/styles/tokens.css'), 'utf8');
/** A delay in ms, reading a `var(--ch-dur-*)` token from tokens.css. */
const ms = (body: string) => {
  const raw = body.match(/transition-delay:\s*([^;]+);/)?.[1]?.trim();
  if (!raw) return 0;
  const v = raw.startsWith('var(') ? tokens.match(new RegExp(`${raw.slice(4, -1)}:\\s*([^;]+);`))?.[1]?.trim() ?? '' : raw;
  const m = v.match(/^([\d.]+)(ms|s)$/);
  return m ? Number(m[1]) * (m[2] === 's' ? 1000 : 1) : 0;
};

describe('the Stats busy dim waits a beat (A11)', () => {
  it('desktop and phone dim only after 150ms or more', () => {
    expect(ms(rule(".ch-st[aria-busy='true']"))).toBeGreaterThanOrEqual(150);
    expect(ms(rule(".ch-st.is-phone[aria-busy='true'] .ch-stm > :not(.ch-stm-head):not(.ch-spm-head):not(.ch-stm-controls)"))).toBeGreaterThanOrEqual(150);
  });

  it('the base rules have no delay, so the page clears at once when the figures land', () => {
    expect(ms(rule('.ch-st'))).toBe(0);
    expect(ms(rule('.ch-st.is-phone .ch-stm > *'))).toBe(0);
  });
});
