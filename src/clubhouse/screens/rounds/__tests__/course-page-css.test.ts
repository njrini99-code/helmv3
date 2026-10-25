import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss, { type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

// P-7 4.1.6 and 4.5.6, as the 2026-10-25 changelog has them: the course page uses the phone page tokens, and no rule draws
// a left accent (a transparent spacer draws nothing, so it is allowed).
const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/rounds.css'), 'utf8');
const rule = (selector: string) => {
  const at = css.indexOf(`\n${selector} {`);
  return at < 0 ? null : css.slice(at, css.indexOf('}', at));
};

describe('course page styles', () => {
  it('pads .ch-ch with the phone page tokens, no literal side padding and no 428 px query', () => {
    const ch = rule('.ch-ch')!;
    expect(ch).toContain('padding: var(--ch-page-top-phone) var(--ch-page-x-phone) var(--ch-page-bottom-phone)');
    expect(css).not.toMatch(/@media \(min-width: 428px\)\s*{\s*\.ch-ch\s*{/);
    expect(rule('.ch-ch-sec')).toContain('margin-top: var(--ch-gap-section-phone)');
  });

  it('the course page draws no left border, and the review’s Tot column keeps its transparent spacer', () => {
    const course = css.slice(css.indexOf('\n.ch-ch {'));
    const lefts = [...course.matchAll(/border-left:\s*([^;]+);/g)].map((m) => m[1]!.trim());
    for (const v of lefts) expect(v === '0' || v === 'none' || /transparent/.test(v)).toBe(true);
    expect(css).toMatch(/\.ch-rv-nine td:last-child\s*{\s*border-left: 2px solid transparent;/);
  });

  // Review blocker 1: the phone gate and the fit lost to the data-view rule on specificity, so at 414 px and wider (where
  // the fit still says 'map') neither view showed. jsdom applies no CSS, so the cascade is checked here.
  it('the phone gate and the fit outrank the data-view rule that hides a view, so one view always shows', () => {
    const root = postcss.parse(css);
    // Classes and attributes only (these selectors hold no ids or elements); a descendant combinator adds nothing.
    const weight = (sel: string) => (sel.match(/\.[\w-]+|\[[^\]]+\]/g) ?? []).length;
    const hides: { sel: string; at: number }[] = [];
    const shows: { sel: string; at: number; scope: string }[] = [];
    root.walkRules((r: Rule) => {
      const parent = r.parent?.type === 'atrule' ? (r.parent as postcss.AtRule) : null;
      const scope = parent ? `${parent.name} ${parent.params}` : '';
      const display = r.nodes.find((d) => d.type === 'decl' && d.prop === 'display') as postcss.Declaration | undefined;
      if (!display) return;
      for (const sel of r.selectors) {
        if (!/\.ch-hmap-(listv|mapv|switch)\b/.test(sel)) continue;
        const at = r.source!.start!.offset;
        if (!parent && display.value === 'none') hides.push({ sel, at });
        if (scope === 'container ch-hmap (max-width: 22.9em)' || scope === 'media (max-width: 599px)') shows.push({ sel, at, scope });
      }
    });
    expect(hides.length).toBeGreaterThan(0);
    expect(shows.filter((s) => /\.ch-hmap-listv\b/.test(s.sel)).map((s) => s.scope).sort()).toEqual([
      'container ch-hmap (max-width: 22.9em)',
      'media (max-width: 599px)',
    ]);
    for (const s of shows) {
      for (const h of hides) {
        expect(weight(s.sel), `${s.sel} (${s.scope}) vs ${h.sel}`).toBeGreaterThanOrEqual(weight(h.sel));
        expect(s.at, `${s.sel} comes after ${h.sel}`).toBeGreaterThan(h.at);
      }
    }
  });
});
