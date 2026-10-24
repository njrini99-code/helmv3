import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, walk } from './_scan';

/**
 * CONS-35: stacking on one ladder (tokens.css --ch-z-*). A z-index is a step, a step's near neighbour (a step plus or
 * minus 1 to 5, for "just under the sticky bar"), or a local -1 to 5 inside one component. Nothing is off the ladder:
 * each old literal moved to a step once what it stacks against was checked (scripts/clubhouse/check.mjs holds the
 * same rule).
 */
const LADDER = { raised: 10, panel: 30, sticky: 40, dock: 50, popover: 60, overlay: 80, sheet: 90, toast: 100, skip: 110 };
const LEFT = 0;

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
  /^calc\(var\(--ch-z-[a-z]+\) [+-] [1-5]\)$/.test(v) ||
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

  it(`nothing is off the ladder (${LEFT} left)`, () => {
    const off = zValues().filter((z) => !onLadder(z.value));
    expect(off.map((z) => `${z.file}: ${z.value}`)).toEqual([]);
    expect(off.length).toBe(LEFT);
  });

  const zOf = (file: string, selector: string) => {
    const css = readFileSync(join(ROOT, 'styles', file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const at = css.indexOf(`${selector} {`);
    expect(at, `${file} ${selector}`).toBeGreaterThanOrEqual(0);
    return /z-index: ([^;]+);/.exec(css.slice(at, css.indexOf('}', at)))?.[1];
  };

  it('a menu is a popover a step over the popovers, so the bell’s filter menu opens above the bell', () => {
    expect(zOf('controls.css', '.ch-menu')).toBe('calc(var(--ch-z-popover) + 1)');
    expect(zOf('shell.css', '.ch-bellp')).toBe('var(--ch-z-popover)');
    expect(zOf('messages.css', '.ch-rx')).toBe('var(--ch-z-popover)');
  });

  it('the dock kept over a pushed screen is one over the screen, not over the popovers', () => {
    expect(zOf('shell.css', '  .ch-pscreen')).toBe('var(--ch-z-dock)');
    expect(zOf('shell.css', '  .ch-root:has(.ch-pscreen[data-ch-keeps-dock]) .ch-dock')).toBe('calc(var(--ch-z-dock) + 1)');
  });
});
