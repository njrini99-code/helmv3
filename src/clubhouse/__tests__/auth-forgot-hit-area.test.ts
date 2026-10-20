import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Swap audit F-28: on the phone, "Forgot password?" below Sign in was
 * `position: static`, so its absolutely positioned 44px hit area (`::after`)
 * sized itself to the sign-in sheet and took taps meant for Sign in. The link
 * must anchor its own hit area.
 */
const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/auth.css'), 'utf8');

function phoneRule(selector: string): string {
  const start = css.lastIndexOf(`${selector} {`);
  expect(start, `${selector} rule`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('}', start));
}

describe('sign-in: the phone "Forgot password?" hit area', () => {
  it('is anchored to the link, not the sheet', () => {
    const rule = phoneRule('.ch-au-forgot--below');
    expect(rule).toMatch(/position:\s*relative/);
    expect(rule).not.toMatch(/position:\s*static/);
  });

  it('stays inside the gap above it', () => {
    const gap = Number(/margin:\s*(\d+)px/.exec(phoneRule('.ch-au-forgot--below'))?.[1]);
    const reach = Math.abs(Number(/inset:\s*-(\d+)px/.exec(phoneRule('.ch-au-forgot--below::after'))?.[1]));
    expect(reach).toBeLessThan(gap);
  });
});
