import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CH_SPRING_SETTLE_MS } from '../lib/motion';

/**
 * The live Clubhouse duration set, decided 2026-10-18 (complete-and-elevate pass, owner delegation): the code is
 * the truth, and `.claude/rules/clubhouse.md` (D-64) and `docs/clubhouse/CHECKLIST_TEMPLATE.md` say the same.
 * The 2026-10-12 note reported two competing duration sets; what had actually drifted was the rule text, which
 * still said skeletons wait 150ms while the code moved the wait into the page transition's 300ms hold (since
 * halved to 150ms and kept only for a crossfade: production audit 2026-11-15, S4.4). A change
 * here is a design decision: change the rules and the checklist in the same commit.
 */
const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/tokens.css'), 'utf8');

/** The first definition is the root one; reduced-motion and Animations-off overrides come later in the file. */
function token(name: string, source = css): string {
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(source);
  if (!m) throw new Error(`--${name} is not defined`);
  return m[1]!.trim();
}

describe('Clubhouse motion durations (D-64 as built)', () => {
  it('the five D-64 steps', () => {
    expect(['press', 'quick', 'base', 'release', 'reveal'].map((s) => token(`ch-dur-${s}`))).toEqual(['110ms', '180ms', '260ms', '280ms', '520ms']);
  });

  // Production audit 2026-11-15 (S4.4, S4.8): no phone fade-through. A phone page change with motion on swaps, pushes or
  // pops on the live page; only the desktop crossfades (owner decision 3, OQ-14 / A10), 120ms out and 180ms in together.
  it('the desktop crossfade: 120ms out and 180ms in together, no gap; a crossfade onto a skeleton holds 150ms', () => {
    expect(token('ch-dur-vt-out')).toBe('120ms');
    expect(token('ch-dur-vt-in')).toBe('180ms');
    expect(token('ch-dur-vt-hold')).toBe('150ms');
    expect(css).not.toContain('--ch-dur-vt-gap');
    expect(css).not.toContain("@media (min-width: 821px) and ((min-height: 501px) or (pointer: fine)) {\n  html:has([data-ui='clubhouse']) {");
  });

  it('the push and the pop: the reveal beat on the one curve, a third of parallax under a 0.075 dim (S4.1)', () => {
    expect(token('ch-ease-ios')).toBe('cubic-bezier(0.32, 0.72, 0, 1)');
    expect(token('ch-push-parallax')).toBe('-30%');
    expect(token('ch-push-dim')).toBe('rgb(0 0 0 / 0.075)');
    expect(css).not.toMatch(/--ch-(dur|ease)-vt-push|--ch-vt-parallax/);
  });

  it('the Stats busy dim holds off 150ms (A11), named in the rules and the checklist', () => {
    expect(token('ch-dur-busy-delay')).toBe('150ms');
    for (const doc of ['.claude/rules/clubhouse.md', 'docs/clubhouse/CHECKLIST_TEMPLATE.md']) {
      expect(readFileSync(join(process.cwd(), doc), 'utf8'), doc).toMatch(/busy dim holds off 150 ms/);
    }
  });

  it('skeletons show at once, whole (the only wait is a crossfade\'s hold, not a skeleton delay)', () => {
    expect(css).not.toContain('--ch-skel-delay');
  });

  // Production audit 2026-11-15 (S3.1, MOT-08): CSS has no spring curves or spring durations; a one-shot entry rides the one
  // curve on a D-64 beat. The smooth spring runs in script only (what can be retargeted or thrown), and settles in 462ms.
  it('CSS has no spring durations; the script smooth spring settles in 462ms', () => {
    expect(css).not.toMatch(/--ch-dur-spring-[a-z]+:\s*[1-9]\d*ms;/);
    expect(css).not.toContain('linear(0, ');
    expect(CH_SPRING_SETTLE_MS).toBe(462);
  });

  it('the loops: shimmer 1.9s, live pulse 2.8s, sweep 900ms', () => {
    expect([token('ch-dur-shimmer'), token('ch-dur-live'), token('ch-dur-sweep')]).toEqual(['1.9s', '2.8s', '900ms']);
  });

  it('Animations off zeroes every one of them', () => {
    const off = css.slice(css.indexOf("[data-motion='off']") >= 0 ? css.indexOf("[data-motion='off']") : css.indexOf('[data-motion="off"]'));
    for (const name of ['ch-dur-press', 'ch-dur-quick', 'ch-dur-base', 'ch-dur-release', 'ch-dur-reveal', 'ch-dur-spring-smooth', 'ch-dur-shimmer', 'ch-dur-live', 'ch-dur-sweep']) {
      expect(token(name, off), name).toBe('0ms');
    }
  });

  it('the rules and the checklist name the same set', () => {
    const rules = readFileSync(join(process.cwd(), '.claude/rules/clubhouse.md'), 'utf8');
    const checklist = readFileSync(join(process.cwd(), 'docs/clubhouse/CHECKLIST_TEMPLATE.md'), 'utf8');
    for (const doc of [rules, checklist]) {
      expect(doc).toMatch(/120\s*ms out/);
      expect(doc).toMatch(/180\s*ms in/);
      expect(doc).toMatch(/back 150\s*ms/);
      expect(doc).toMatch(/520\s*ms on the one curve/);
      expect(doc).toMatch(/462\s*ms/);
      expect(doc).not.toMatch(/fade(s)? through/i);
      expect(doc).not.toMatch(/wait 150\s*ms/i);
    }
  });
});
