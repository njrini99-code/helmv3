import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Owner, 2026-10-29: "fix the motion and thinking animation… it should be a lot smoother". Ask's working state moves only
 * on the compositor: the avatar's wheel turns (transform), on the working beat, while CoachHelm works. MOTION-AND-VISUAL
 * 3.1 and 3.12 (2026-11-15): that wheel is the thread's one loop; the step dot's breath, the step rise, the new turn's rise
 * and the streamed paragraph's fade are gone, and the wheel's keyframes live in styles/motion.css. The words themselves
 * hold still in readable ink; the old shimmer repainted them every frame. The loop stops for reduced motion and for
 * Settings > Animations off (both forms of the attribute).
 */
const css = readFileSync(join(__dirname, '..', 'styles/coachhelm-thread.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const motion = readFileSync(join(__dirname, '..', 'styles/motion.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The body of the block opened by `head` (a media query or a selector list), braces balanced. */
function block(head: string, from = 0, text = css): string {
  const at = text.indexOf(head, from);
  if (at < 0) return '';
  let i = text.indexOf('{', at) + 1;
  const start = i;
  for (let depth = 1; depth > 0 && i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') depth -= 1;
  }
  return text.slice(start, i - 1);
}
const keyframes = (name: string) => block(`@keyframes ${name} `, 0, motion);
const LOOPS = ['.ch-th-mark.is-working .ch-th-mk'];

describe('Ask working motion is smooth and respects motion settings', () => {
  it('animates only transform and opacity, and keeps no keyframes of its own', () => {
    const props = [...keyframes('ch-th-turn').matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
    expect(props).toEqual(['transform']);
    expect(css).not.toMatch(/@keyframes/);
  });

  it('the wheel is the one loop, on the working beat (3.1)', () => {
    const loops = [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)].filter((m) => /\binfinite\b/.test(m[2]!));
    expect(loops.map((m) => m[1]!.trim())).toEqual(['.ch-th-mark.is-working .ch-th-mk']);
    expect(loops[0]![2]).toMatch(/animation: ch-th-turn var\(--ch-dur-typing\) var\(--ch-ease-typing\) infinite;/);
    expect(css).not.toMatch(/animation:[^;]*\bch-th-(?:dot|step|rise|in)\b/);
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
