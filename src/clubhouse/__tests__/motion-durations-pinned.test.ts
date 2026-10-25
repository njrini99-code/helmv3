import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The live Clubhouse duration set, decided 2026-10-18 (complete-and-elevate pass, owner delegation): the code is
 * the truth, and `.claude/rules/clubhouse.md` (D-64) and `docs/clubhouse/CHECKLIST_TEMPLATE.md` say the same.
 * The 2026-10-12 note reported two competing duration sets; what had actually drifted was the rule text, which
 * still said skeletons wait 150ms while the code moved the wait into the page transition's 300ms hold. A change
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

  it('the page fade-through: 120ms out, a gap as long as the out, 220ms in, skeleton held 300ms', () => {
    expect(token('ch-dur-vt-out')).toBe('120ms');
    expect(token('ch-dur-vt-gap')).toBe('var(--ch-dur-vt-out)');
    expect(token('ch-dur-vt-in')).toBe('220ms');
    expect(token('ch-dur-vt-hold')).toBe('300ms');
  });

  it('the Stats busy dim holds off 150ms (A11), named in the rules and the checklist', () => {
    expect(token('ch-dur-busy-delay')).toBe('150ms');
    for (const doc of ['.claude/rules/clubhouse.md', 'docs/clubhouse/CHECKLIST_TEMPLATE.md']) {
      expect(readFileSync(join(process.cwd(), doc), 'utf8'), doc).toMatch(/busy dim holds off 150 ms/);
    }
  });

  it('skeletons show at once (the wait lives in the transition hold, not a skeleton delay)', () => {
    expect(token('ch-skel-delay')).toBe('0ms');
  });

  it('the smooth spring settles in 462ms where linear() is supported (pushes and sheets)', () => {
    expect(css).toMatch(/--ch-dur-spring-smooth:\s*462ms;/);
    expect(css).toMatch(/--ch-dur-vt-push:\s*462ms;/);
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
      expect(doc).toMatch(/300\s*ms/);
      expect(doc).toMatch(/462\s*ms/);
      expect(doc).not.toMatch(/wait 150\s*ms/i);
    }
  });
});
