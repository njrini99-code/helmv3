import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Phone sign in, sheet up for the keyboard (2026-10-14, Playwright WebKit on the preview): the strip of course left
 * above the sheet is pine, and the wordmark kept its daylight inks (near-black "Golf", green "Helm") on it; the line
 * over the course rode up with the closing window and crossed the wordmark while it faded.
 */
const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/auth.css'), 'utf8');

function rule(selector: string): string {
  const start = css.lastIndexOf(`${selector} {`);
  expect(start, `${selector} rule`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('}', start));
}

describe('sign in: the wordmark over the course with the sheet up', () => {
  it('takes the dark-sky inks', () => {
    expect(rule(".ch-au[data-kb='up'] .ch-au-mark span")).toMatch(/color:\s*var\(--ch-au-ivory\)/);
    expect(rule(".ch-au[data-kb='up'] .ch-au-mark b")).toMatch(/color:\s*var\(--ch-hero-mint\)/);
  });

  it('is clear of the line over the course, which leaves early in the rise', () => {
    expect(rule(".ch-au[data-kb='up'] .ch-au-say")).toMatch(/transition-duration:\s*calc\(var\(--ch-au-t-kb\)\s*\/\s*3\)/);
  });
});
