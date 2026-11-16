import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

/**
 * Live beads go out from par (MOTION-AND-VISUAL 4.7, DESIGN_LANGUAGE "Under par is the gain"): a birdie is the lighter
 * gain step and an eagle or better the full gain fill. Both are filled discs with no numeral, so if they read one fill a
 * coach can't tell a birdie from an eagle on the live board (Codex review on #2542).
 */
const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8');
const flat = (v: string) => v.replace(/\s+/g, ' ').trim();

/** Every value a declaration takes in the rules whose selector is exactly `selector`. */
const ruleDecls = (css: string, selector: string, prop: string): string[] => {
  const out: string[] = [];
  postcss.parse(css).walkRules((rule) => {
    if (rule.selector.trim() !== selector) return;
    rule.walkDecls(prop, (d) => {
      out.push(flat(d.value));
    });
  });
  return out;
};

/** Every declaration of a custom property anywhere in the sheet, in order. */
const decls = (css: string, name: string): string[] => {
  const out: string[] = [];
  postcss.parse(css).walkDecls(name, (d) => {
    out.push(flat(d.value));
  });
  return out;
};

describe('live beads: birdie and eagle stay two marks', () => {
  const live = read('src/clubhouse/styles/live.css');
  const tokens = read('src/clubhouse/styles/tokens.css');

  it('paints a birdie with the birdie step and an eagle with the full gain fill', () => {
    expect(ruleDecls(live, ".ch-lv-bead[data-kind='birdie']", 'background')).toEqual(['var(--ch-score-birdie-fill)']);
    expect(ruleDecls(live, ".ch-lv-bead[data-kind='birdie']", '--ch-lv-ink')).toEqual(['var(--ch-score-birdie-fill)']);
    expect(ruleDecls(live, ".ch-lv-bead[data-kind='eagle']", 'background')).toEqual(['var(--ch-live-bead-eagle)']);
    expect(decls(live, '--ch-live-bead-eagle')).toEqual(['var(--ch-score-eagle-fill)']);
  });

  it('keeps the birdie step its own colour in both themes', () => {
    const birdie = decls(tokens, '--ch-score-birdie-fill');
    expect(birdie.length).toBeGreaterThanOrEqual(2);
    for (const value of birdie) {
      expect(value).not.toMatch(/--ch-score-(eagle|under)-fill|--ch-chart-gain-fill/);
    }
    expect(decls(tokens, '--ch-score-eagle-fill')).toEqual(['var(--ch-chart-gain-fill)']);
  });
});
