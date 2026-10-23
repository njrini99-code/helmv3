import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The look-and-feel pass (2026-10-22, mot-04 to mot-07): the rules only a stylesheet can hold. Placeholder text reads
 * on one token in both themes, the weights stay on the scale's rungs, and the phone player's name wraps rather than
 * losing its surname to an ellipsis.
 */
const dir = join(process.cwd(), 'src/clubhouse/styles');
const read = (f: string) => readFileSync(join(dir, f), 'utf8');
const tokens = read('tokens.css');

describe('placeholder text', () => {
  it('has its own token in the light and the dark theme', () => {
    const dark = tokens.indexOf("html[data-fw-theme='dark'] [data-ui='clubhouse'] {");
    expect(dark).toBeGreaterThan(-1);
    expect(tokens.slice(0, dark)).toMatch(/--ch-text-placeholder:\s*#[0-9a-f]{6};/i);
    expect(tokens.slice(dark)).toMatch(/--ch-text-placeholder:\s*#[0-9a-f]{6};/i);
  });

  it('never sits on a faint ink: every placeholder reads at the placeholder token or darker', () => {
    const readable = ['--ch-text-placeholder', '--ch-text-tertiary', '--ch-ink-500'];
    const faint: string[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.css'))) {
      for (const b of read(f).split('}').filter((x) => /::placeholder[^{]*\{/.test(x))) {
        const color = /(?:^|[\s;{])color:\s*([^;]+);/.exec(b)?.[1];
        if (color && !readable.some((t) => color === `var(${t})`)) faint.push(`${f}: ${color}`);
      }
    }
    expect(faint).toEqual([]);
  });
});

describe('weights', () => {
  it('stay on 400, 500, 600 and 700 outside the sign-in pages', () => {
    const off: string[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.css') && x !== 'auth.css')) {
      for (const m of read(f).matchAll(/font(?:-weight)?:\s*(\d{3})\b/g)) {
        if (!['100', '200', '300', '400', '500', '600', '700', '800', '900'].includes(m[1] ?? '')) off.push(`${f}: ${m[0]}`);
      }
    }
    expect(off).toEqual([]);
  });
});

describe('the type scale (mot-08, owner-approved 2026-10-23)', () => {
  it('every text size up to 36px sits on one of the 11 steps', () => {
    const steps = [11, 12, 13, 14, 15, 16, 17, 20, 22, 28, 34];
    const size = String.raw`(?:calc\(\s*([\d.]+)\s*\*\s*var\(--ch-type-k\)\s*\)|([\d.]+)px)`;
    const decl = new RegExp(String.raw`(?:font-size:\s*|(?:^|[;{\s])(?:font|--ch-type-[a-z0-9-]+):\s*(?:(?:italic|normal|\d{3})\s+)*)` + size, 'gm');
    const off: string[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.css'))) {
      for (const m of read(f).matchAll(decl)) {
        const n = parseFloat(m[1] ?? m[2] ?? '');
        if (n > 0 && n <= 36 && !steps.includes(n)) off.push(`${f}: ${m[0].trim()}`);
      }
    }
    expect(off).toEqual([]);
  });
});

describe('the phone player name', () => {
  it('wraps to two balanced lines instead of an ellipsis', () => {
    const stats = read('stats.css');
    const at = stats.indexOf('  .ch-spm-head h1 {');
    const body = stats.slice(at, stats.indexOf('}', at));
    expect(body).toMatch(/-webkit-line-clamp:\s*2/);
    expect(body).toMatch(/text-wrap:\s*balance/);
    expect(body).not.toMatch(/white-space:\s*nowrap/);
    expect(body).not.toMatch(/text-overflow:\s*ellipsis/);
  });
});
