import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// G4 (preview grade): Roster's class bar drew Freshmen in red, which D-42 keeps for under par, the pin flag and
// destructive actions. Roster now sets its own Freshmen tone; the shared token is untouched.

const read = (p: string) => readFileSync(join(process.cwd(), 'src/clubhouse', p), 'utf8');
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

describe('G4 Freshmen are not red on Roster', () => {
  const css = read('styles/roster.css');
  // The tone is a token (tokens only, no hex in a screen's CSS): light in the base block, dark in the dark block.
  const tokens = read('styles/tokens.css');
  const darkAt = tokens.indexOf("html[data-fw-theme='dark'] [data-ui='clubhouse'] {");
  const light = tokens.slice(0, darkAt).match(/--ch-yr-fr-roster: (#[0-9a-f]{6});/)?.[1];
  const dark = tokens.slice(darkAt).match(/--ch-yr-fr-roster: (#[0-9a-f]{6});/)?.[1];

  it('scopes its own tone to Roster, light and dark', () => {
    expect(darkAt).toBeGreaterThan(0);
    expect(light).toBeDefined();
    expect(dark).toBeDefined();
    expect(css).toMatch(/\n:is\(\.ch-rs, \.ch-rsm\) \{\s*--ch-yr-fr: var\(--ch-yr-fr-roster\);/);
    expect(css).not.toMatch(/--ch-yr-fr: #/);
  });

  it('leaves the shared token as it was', () => {
    expect(read('styles/tokens.css')).toContain('--ch-yr-fr: #9a4a35;');
  });

  it.each([['light', () => light!], ['dark', () => dark!]])('the %s tone is not red-led and holds white text at 4.5:1', (_, get) => {
    const hex = get();
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    expect(r > g && r > b).toBe(false);
    expect(1.05 / (lum(hex) + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
});
