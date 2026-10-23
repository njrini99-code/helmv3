import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, walk } from './_scan';

/**
 * CONS-35: stacking on one ladder (tokens.css --ch-z-*). A z-index is a step, a step's near neighbour (a step plus or
 * minus a few, for "just under the sticky bar"), or a local 0 to 5 inside one component. The literals left from before
 * the ladder only fall: each moves to a step once what it stacks against is checked, so no order changes by accident.
 */
const LADDER = { raised: 10, panel: 30, sticky: 40, dock: 50, popover: 60, overlay: 80, sheet: 90, toast: 100, skip: 110 };
const LEFT = 7;

function zValues(): Array<{ file: string; value: string }> {
  const out: Array<{ file: string; value: string }> = [];
  for (const file of walk(join(ROOT, 'styles'), /\.css$/)) {
    const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of src.matchAll(/(?:^|[\s;{])z-index:\s*([^;]+);/g)) out.push({ file: basename(file), value: m[1]!.trim() });
  }
  return out;
}
const onLadder = (v: string) =>
  /^var\(--ch-z-[a-z]+\)$/.test(v) ||
  /^calc\(var\(--ch-z-[a-z]+\) [+-] (?:[1-9]|1[01])\)$/.test(v) ||
  /^-?[0-5]$/.test(v) ||
  v === 'auto' ||
  v === 'inherit';

describe('z-index ladder (CONS-35)', () => {
  it('the ladder is in tokens.css, in order', () => {
    const tokens = readFileSync(join(ROOT, 'styles/tokens.css'), 'utf8');
    for (const [name, z] of Object.entries(LADDER)) expect(tokens).toContain(`--ch-z-${name}: ${z};`);
  });

  it('the skip links sit above a toast', () => {
    for (const [file, sel] of [['shell.css', '.ch-skip {'], ['auth.css', '.ch-au-skip {']] as const) {
      const css = readFileSync(join(ROOT, 'styles', file), 'utf8');
      expect(css.slice(css.indexOf(sel), css.indexOf('}', css.indexOf(sel)))).toMatch(/z-index: var\(--ch-z-skip\);/);
    }
  });

  it(`literals off the ladder only fall (${LEFT} left)`, () => {
    const off = zValues().filter((z) => !onLadder(z.value));
    expect(off.length, off.map((z) => `${z.file}: ${z.value}`).join('\n')).toBeLessThanOrEqual(LEFT);
  });
});
