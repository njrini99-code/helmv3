import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Mat1 / CC-1 (premium plan batch 5): Clubhouse has one bar material. Every backdrop filter in a page stylesheet is the
// token recipe, `none`, or the message scrim's own blur; a bespoke blur or saturation (the old new-round dock's 1.7x and
// 170%) fails here.
const dir = join(__dirname, '..', 'styles');
const ALLOWED = [/^var\(--ch-glass-filter\)$/, /^none$/, /^blur\(var\(--ch-scrim-blur-msg, var\(--ch-glass-blur\)\)\) saturate\(var\(--ch-scrim-saturate-msg, 120%\)\)$/];

describe('one glass recipe (Mat1)', () => {
  it('every backdrop filter is the bar material, none, or the scrim', () => {
    const bad: string[] = [];
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.css') && n !== 'tokens.css')) {
      // A feature query (`@supports … (backdrop-filter: blur(1px))`) is a test, not a declaration.
      const css = readFileSync(join(dir, f), 'utf8').replace(/@supports[^{]*\{/g, '{');
      for (const m of css.matchAll(/(?<![\w-])(?:-webkit-)?backdrop-filter:\s*([^;}]+)/g)) {
        const v = m[1]!.trim();
        if (!ALLOWED.some((re) => re.test(v))) bad.push(`${f}: ${v}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('the recipe is the glass blur and saturation tokens', () => {
    const tokens = readFileSync(join(dir, 'tokens.css'), 'utf8');
    expect(tokens).toMatch(/--ch-glass-filter: blur\(var\(--ch-glass-blur\)\) saturate\(var\(--ch-glass-saturate\)\);/);
  });
});
