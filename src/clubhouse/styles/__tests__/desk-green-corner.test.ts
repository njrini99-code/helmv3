import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss, { type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

/**
 * The desk's page is the one from before the Nov 11 release train (Nick, 15 Nov 2026: "Whatever gradient matched that had
 * the green upper left corner and the ivory that's what needs to be reinstated"): the ivory light across the canvas top,
 * the sidebar's green bleeding into its left edge and a green mist in its top-left corner. The top bar went solid on
 * 10 Nov so nothing scrolled under it stays legible, and that solid bar covered the corner; it is clear at rest (nothing is
 * under it then) and solid once the canvas scrolls under it, and Reduce Transparency keeps it solid.
 */
const shell = readFileSync(join(process.cwd(), 'src/clubhouse/styles/shell.css'), 'utf8');
const flat = (v: string) => v.replace(/\s+/g, ' ').trim();
const DESK = '(min-width: 821px) and ((min-height: 501px) or (pointer: fine))';

/** Every rule whose selector list holds `selector`, with the media query around it ('' when none). */
const rulesFor = (selector: string): { media: string; rule: Rule }[] => {
  const out: { media: string; rule: Rule }[] = [];
  postcss.parse(shell).walkRules((rule) => {
    if (!rule.selectors.map((s) => s.trim()).includes(selector)) return;
    const parent = rule.parent;
    const media = parent && parent.type === 'atrule' ? flat((parent as postcss.AtRule).params) : '';
    out.push({ media, rule });
  });
  return out;
};
const value = (rule: Rule, prop: string) => {
  let v: string | undefined;
  rule.walkDecls(prop, (d) => {
    v = flat(d.value);
  });
  return v;
};

describe('the desk keeps the green corner and the ivory light', () => {
  it('paints the canvas with the light, the sidebar bleed and the green mist in its top left', () => {
    const canvas = rulesFor('.ch-canvas').find((r) => r.media === DESK);
    expect(canvas).toBeDefined();
    const bg = value(canvas!.rule, 'background') ?? '';
    expect(bg).toContain('var(--ch-light-canvas)');
    expect(bg).toContain('linear-gradient(90deg, rgb(11 58 37 / 0.04)');
    expect(bg).toContain('var(--ch-workspace)');
    const mist = rulesFor('.ch-canvas::before').find((r) => r.media === DESK);
    expect(mist).toBeDefined();
    expect(value(mist!.rule, 'background')).toContain('radial-gradient(100% 100% at 0% 0%, rgb(11 58 37 / 0.22)');
    // G1 option A (owner, 19 Nov 2026): the mist ends before the page head. It fills only the margin left of the content,
    // at most 240px, by the same left edge the page mains and the top bar use; its old bottom-right glow is gone.
    expect(value(mist!.rule, 'width')).toBe('min(240px, calc(max(0px, calc((100vw - var(--ch-sidebar-w) - var(--ch-measure-wide)) / 2)) + var(--ch-page-gutter)))');
    expect(value(mist!.rule, 'background')).not.toContain('at 100% 100%');
  });

  it('leaves the top bar clear at rest and solid once the canvas scrolls under it', () => {
    const bar = rulesFor('.ch-topbar').find((r) => r.media === DESK && value(r.rule, 'background')?.startsWith('color-mix('));
    expect(bar).toBeDefined();
    const rest = rulesFor('.ch-topbar:not([data-scrolled])').filter((r) => r.media === DESK);
    expect(rest.map((r) => value(r.rule, 'background'))).toContain('transparent');
    const night = rulesFor("html[data-fw-theme='dark'] .ch-topbar:not([data-scrolled])").filter((r) => r.media === DESK);
    expect(night.map((r) => value(r.rule, 'background'))).toContain('transparent');
  });

  it('keeps the bar solid under Reduce Transparency, at rest too', () => {
    for (const selector of [
      ':root .ch-topbar:not([data-scrolled])',
      ':root[data-reduce-transparency] .ch-topbar:not([data-scrolled])',
      "html[data-fw-theme='dark'] .ch-topbar:not([data-scrolled])",
    ]) {
      const solid = rulesFor(selector).filter((r) => value(r.rule, 'background') === 'var(--ch-workspace)');
      expect(solid.length, selector).toBeGreaterThan(0);
    }
  });
});
