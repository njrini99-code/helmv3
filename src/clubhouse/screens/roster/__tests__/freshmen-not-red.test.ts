import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// G4 (preview grade): Roster's class bar drew Freshmen in red, which D-42 keeps for under par, the pin flag and
// destructive actions. Roster now mixes its own Freshmen tone from the year tokens; the shared token is untouched.

const read = (p: string) => readFileSync(join(process.cwd(), 'src/clubhouse', p), 'utf8');
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const lum = ([r, g, b]: number[]) => {
  const c = [r!, g!, b!].map((v) => v / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};

describe('G4 Freshmen are not red on Roster', () => {
  const css = read('styles/roster.css');
  const tokens = read('styles/tokens.css');
  const mix = css.match(/:is\(\.ch-rs, \.ch-rsm\) \{\s*--ch-rs-fr: color-mix\(in srgb, var\(--ch-yr-jr\) (\d+)%, var\(--ch-yr-fr\)\);/);
  const all = (name: string) => [...tokens.matchAll(new RegExp(`${name}: (#[0-9a-f]{6});`, 'g'))].map((m) => m[1]!);
  const [jrLight, jrDark] = all('--ch-yr-jr');
  const [frLight, frDark] = all('--ch-yr-fr');
  const mixed = (jr: string, fr: string) => {
    const p = Number(mix![1]) / 100;
    const a = rgb(jr);
    const b = rgb(fr);
    return a.map((v, i) => Math.round(v * p + b[i]! * (1 - p)));
  };

  it('mixes its own tone from the year tokens, with no raw colour, and hands it down inside Roster', () => {
    expect(mix).not.toBeNull();
    expect(css).toMatch(/:is\(\.ch-rs, \.ch-rsm\) \* \{\s*--ch-yr-fr: var\(--ch-rs-fr\);/);
    expect(css).not.toMatch(/--ch-yr-fr: #/);
  });

  it('leaves the shared token as it was', () => {
    expect(tokens).toContain('--ch-yr-fr: #9a4a35;');
  });

  it.each([
    ['light', () => mixed(jrLight!, frLight!)],
    ['dark', () => mixed(jrDark!, frDark!)],
  ])('the %s tone is not red-led and holds white text at 4.5:1', (_, get) => {
    const [r, g, b] = get();
    expect(r! > g! && r! > b!).toBe(false);
    expect(1.05 / (lum([r!, g!, b!]) + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
});
