import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Production audit 2026-11-15, S3.1 "one progress indicator, no infinite ambient loops":
 * - MOT-14: Ask keeps one moving progress sign while it works, the island's turning ring on the running step
 *   (`.mk .arc`). The text shimmer, the breathing dots, the skeleton sweep, the sending capsule, the artifact scan, the open
 *   slot's pulse and the island's passing light are gone; what they marked is drawn still.
 * - MAC-15 / H393-007, then MOTION-AND-VISUAL 3.1 and 3.12 (owner, 15 Nov): the CoachHelm ball has no rings at all. Its
 *   only loop is its thinking state, which is CoachHelm working: the working indicator on the working beat.
 * - MOT-15: no keyframe in these files animates `filter` or `background-position`.
 */
const read = (f: string) => readFileSync(join(__dirname, '..', 'styles', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const ask = read('coachhelm-ask-v2.css');
const ball = read('coachhelm-ball.css');
const shell = read('shell.css');

/** Every flat rule `selector { body }` in a stylesheet (keyframe steps and media bodies included as their own rules). */
const rules = (css: string) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1]!.trim(), body: m[2]! }));

/** The body of `@keyframes name`, braces balanced. */
function keyframes(css: string, name: string): string {
  const at = css.indexOf(`@keyframes ${name} `);
  if (at < 0) return '';
  let i = css.indexOf('{', at) + 1;
  const start = i;
  for (let depth = 1; depth > 0 && i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') depth -= 1;
  }
  return css.slice(start, i - 1);
}
const names = (css: string) => [...css.matchAll(/@keyframes ([\w-]+)/g)].map((m) => m[1]!);

describe('ambient loops (production audit 2026-11-15)', () => {
  it('Ask runs one infinite loop: the running step’s turning ring', () => {
    const loops = rules(ask).filter((r) => /\binfinite\b/.test(r.body));
    expect(loops.map((r) => r.sel)).toEqual([':is(.ch-isl, .ch-ak-isl) .mk .arc']);
    expect(loops[0]!.body).toMatch(/animation: ch-spinner-turn /);
    // A finished or stopped step's ring stands still.
    expect(rules(ask).some((r) => r.sel.includes('.mk.is-rest .arc') && r.sel.includes('.mk.is-stopped .arc') && /animation: none/.test(r.body))).toBe(true);
  });

  it('the shimmer, breathing dots, sweeps, capsule, scan, slot pulse and passing light are gone from Ask', () => {
    for (const name of ['ch-ak-breath', 'ch-ak-shim', 'ch-ak-sweep', 'ch-ak-capsule', 'ch-ak-scan', 'ch-ak-slot', 'ch-isl-light']) expect(ask, name).not.toContain(name);
    expect(ask).not.toMatch(/background-clip: text/);
    expect(rules(ask).find((r) => r.sel === '.ch-ak-live')?.body).not.toMatch(/animation/);
  });

  it('the ball has no rings and no keyframes of its own; it loops only while thinking, on the working beat', () => {
    expect(ball).not.toMatch(/ch-ball__rip|ch-ball-ripple/);
    expect(names(ball)).toEqual([]);
    const loops = rules(ball).filter((x) => /\binfinite\b/.test(x.body));
    expect(loops.map((r) => r.sel)).toEqual(['.ch-ball.is-thinking .ch-ball__dots']);
    expect(loops[0]!.body).toMatch(/animation: ch-working var\(--ch-dur-typing\) var\(--ch-ease-typing\) infinite;/);
  });

  it('no keyframe here animates filter or background-position', () => {
    for (const [file, css] of [['coachhelm-ask-v2.css', ask], ['coachhelm-ball.css', ball], ['shell.css', shell]] as const) {
      for (const name of names(css)) expect(keyframes(css, name), `${file} ${name}`).not.toMatch(/(^|[\s;{])(filter|background-position)\s*:/);
    }
  });
});
