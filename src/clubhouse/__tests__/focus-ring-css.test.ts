import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from './_scan';

/**
 * F-0044: a button's focus ring is a box-shadow (`.ch-root .ch-btn:focus-visible`, ui.css). A hover rule that sets its
 * own box-shadow would take the ring away while the pointer rests on a focused button, so each one skips a focused button.
 */
describe('the focus ring survives hover', () => {
  it('no .ch-btn hover rule sets a box-shadow on a focused button', () => {
    const bad: string[] = [];
    const dir = join(ROOT, 'styles');
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.css'))) {
      const src = readFileSync(join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of src.matchAll(/([^{}]*\.ch-btn[^{}]*:hover[^{}]*)\{([^}]*)\}/g)) {
        if (!/box-shadow/.test(m[2]!)) continue;
        for (const sel of m[1]!.split(',')) if (/:hover/.test(sel) && !/:not\(:focus-visible\)/.test(sel)) bad.push(`${f}: ${sel.trim()}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
