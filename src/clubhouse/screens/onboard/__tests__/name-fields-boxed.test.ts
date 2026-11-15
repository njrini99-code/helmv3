import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// G19 (preview grade): onboarding's name fields were underlines while every other field is a box. They take the box:
// the same surface, ring, radius and focus halo as .ch-ox-input.
const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/onboard.css'), 'utf8');
const rule = (sel: string) => css.match(new RegExp(`\\n${sel.replace(/[.[\]()]/g, '\\$&')} \\{[^}]*\\}`))?.[0] ?? '';

describe('G19 the name fields are boxes', () => {
  it('draws the name input as the onboarding box, not an underline', () => {
    const big = rule('.ch-ox-big input');
    const box = rule('.ch-ox-input');
    expect(big).not.toContain('border-bottom');
    for (const part of ['border-radius: var(--ch-radius-md)', 'background: var(--ch-bg-surface)', 'box-shadow: inset 0 0 0 1px var(--ch-border-control)']) {
      expect(big).toContain(part);
      expect(box).toContain(part);
    }
  });

  it('focus and error draw as the box does', () => {
    expect(rule('.ch-ox-big input:focus')).toContain('var(--ch-focus-halo)');
    expect(rule('.ch-ox-big[data-invalid] input')).toContain('var(--ch-danger-600)');
  });

  it('no underline rule is left anywhere for the names, dark included', () => {
    expect(css).not.toMatch(/\.ch-ox-big[^{]*\{[^}]*border-bottom/);
  });
});
