import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Owner, 2026-10-29: "fix the motion and thinking animation… it should be a lot smoother". Ask's working state moves only
 * on the compositor: the avatar's wheel turns (transform) and the current step's dot breathes (transform and opacity).
 * The words themselves hold still in readable ink; the old shimmer repainted them every frame. Every loop stops for
 * reduced motion and for Settings > Animations off (both forms of the attribute).
 */
const css = readFileSync(join(__dirname, '..', 'styles/coachhelm-thread.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The body of the block opened by `head` (a media query or a selector list), braces balanced. */
function block(head: string, from = 0): string {
  const at = css.indexOf(head, from);
  if (at < 0) return '';
  let i = css.indexOf('{', at) + 1;
  const start = i;
  for (let depth = 1; depth > 0 && i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') depth -= 1;
  }
  return css.slice(start, i - 1);
}
const keyframes = (name: string) => block(`@keyframes ${name} `);
const LOOPS = ['.ch-th-mark.is-working .ch-th-mk', '.ch-th-dot::before'];

describe('Ask working motion is smooth and respects motion settings', () => {
  it('animates only transform and opacity', () => {
    for (const name of ['ch-th-turn', 'ch-th-dot', 'ch-th-step', 'ch-th-rise', 'ch-th-in']) {
      const props = [...keyframes(name).matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
      expect(props.length, name).toBeGreaterThan(0);
      expect(props.every((p) => p === 'transform' || p === 'opacity'), `${name}: ${props.join(', ')}`).toBe(true);
    }
  });

  it('the live words never shimmer', () => {
    expect(css).not.toMatch(/background-clip: text/);
    expect(block('.ch-th-live {')).toMatch(/color: var\(--ch-text-secondary\);/);
  });

  it('every loop stops under prefers-reduced-motion and under Animations off', () => {
    const reduced = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\)/g)].map((m) => block('@media (prefers-reduced-motion: reduce)', m.index!));
    const rules = [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)];
    for (const sel of LOOPS) {
      expect(reduced.some((b) => b.includes(sel) && /animation: none;/.test(b)), sel).toBe(true);
      const off = rules.find((m) => m[1]!.includes(`[data-ui='clubhouse'][data-motion='off'] ${sel}`));
      expect(off?.[1], sel).toContain(`[data-motion='off'] [data-ui='clubhouse'] ${sel}`);
      expect(off?.[2], sel).toMatch(/animation: none;/);
    }
  });

  it('the live words are solid primary ink under Increase Contrast and forced colours', () => {
    expect(block('@media (prefers-contrast: more), (forced-colors: active)')).toMatch(/\.ch-th-live\s*\{[^}]*color: var\(--ch-text-primary\);/);
  });
});
