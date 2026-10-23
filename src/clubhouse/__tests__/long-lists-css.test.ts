import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from './_scan';

/** B8: the long lists draw only what is near the screen, and the mono face (desktop key hints only) is not preloaded. */
const css = (f: string) => readFileSync(join(ROOT, 'styles', f), 'utf8');

describe('long lists and fonts (B8)', () => {
  it.each([
    ['messages.css', '.ch-ms-row.is-hit'],
    ['rounds.css', '.ch-rd-grp'],
  ])('%s %s skips its off-screen work with an intrinsic size', (file, sel) => {
    const s = css(file);
    const at = s.lastIndexOf(`${sel} {`);
    const rule = s.slice(at, s.indexOf('}', at));
    expect(rule).toMatch(/content-visibility: auto;/);
    expect(rule).toMatch(/contain-intrinsic-size: auto \d+px;/);
  });

  it('JetBrains Mono is not preloaded', () => {
    const fonts = readFileSync(join(ROOT, 'lib/fonts.ts'), 'utf8');
    expect(fonts.slice(fonts.indexOf('JetBrains_Mono({'), fonts.indexOf('});', fonts.indexOf('JetBrains_Mono({')))).toMatch(/preload: false/);
  });
});
