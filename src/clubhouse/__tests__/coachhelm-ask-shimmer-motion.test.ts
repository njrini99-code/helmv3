import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * P013, the 2026-10-28 polish pass: Ask's working words shimmer (`.ch-th-shine`, a band of ink across text drawn with
 * background-clip). They stop for reduced motion and for Settings > Animations off (both forms of the attribute, as the
 * other Clubhouse loops do), and turn to solid ink for Increase Contrast and forced colours.
 */
const css = readFileSync(join(__dirname, '..', 'styles/coachhelm-thread.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The body of the block opened by `head` (a media query or a selector list), braces balanced. */
function block(head: string): string {
  const at = css.indexOf(head);
  if (at < 0) return '';
  let i = css.indexOf('{', at) + 1;
  const start = i;
  for (let depth = 1; depth > 0 && i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') depth -= 1;
  }
  return css.slice(start, i - 1);
}
const still = /\.ch-th-shine\s*\{[^}]*animation: none;[^}]*background: none;[^}]*-webkit-text-fill-color: currentColor;/;

describe('Ask shimmer respects motion and contrast settings', () => {
  it('the shimmer animates by default', () => {
    expect(css).toMatch(/\.ch-th-shine \{[^}]*animation: ch-th-shine var\(--ch-dur-shimmer\) linear infinite;/);
  });

  it('stops, and stays readable, under prefers-reduced-motion', () => {
    const media = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\)/g)].map((m) => block(css.slice(m.index!, m.index! + 60)));
    expect(media.some((b) => still.test(b))).toBe(true);
  });

  it('stops under Animations off, on both forms of the attribute', () => {
    const rule = /([^{}]*)\{([^{}]*)\}/g;
    const off = [...css.matchAll(rule)].find((m) => /data-motion='off'/.test(m[1]!) && /\.ch-th-shine/.test(m[1]!));
    expect(off).toBeDefined();
    expect(off![1]).toContain("[data-ui='clubhouse'][data-motion='off'] .ch-th-shine");
    expect(off![1]).toContain("[data-motion='off'] [data-ui='clubhouse'] .ch-th-shine");
    expect(off![2]).toMatch(/animation: none;/);
    expect(off![2]).toMatch(/-webkit-text-fill-color: currentColor;/);
  });

  it('is solid primary ink under Increase Contrast and forced colours', () => {
    const b = block('@media (prefers-contrast: more), (forced-colors: active)');
    expect(b).toMatch(still);
    expect(b).toMatch(/color: var\(--ch-text-primary\);/);
  });
});
