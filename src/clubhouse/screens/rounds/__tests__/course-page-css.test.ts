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
        if (/^container ch-hmap \(max-width: (15\.2|22\.9)em\)$/.test(scope)) shows.push({ sel, at, scope });
      }
    });
    expect(hides.length).toBeGreaterThan(0);
    expect(shows.filter((s) => /\.ch-hmap-listv\b/.test(s.sel)).map((s) => s.scope).sort()).toEqual([
      'container ch-hmap (max-width: 15.2em)',
      'container ch-hmap (max-width: 22.9em)',
    ]);
    for (const s of shows) {
      for (const h of hides) {
        expect(weight(s.sel), `${s.sel} (${s.scope}) vs ${h.sel}`).toBeGreaterThanOrEqual(weight(h.sel));
        expect(s.at, `${s.sel} comes after ${h.sel}`).toBeGreaterThan(h.at);
      }
    }
  });

  // Owner call 2, settled as version (b): a phone shows the map six across, no longer the List alone.
  it('a phone no longer hides the map: six across fits from 15.2 em, nine across keeps its 22.9 em fit from 600 px', () => {
    const root = postcss.parse(css);
    const at = (r: postcss.Node) => {
      const p = r.parent?.type === 'atrule' ? (r.parent as postcss.AtRule) : null;
      return p ? `${p.name} ${p.params}` : '';
    };
    let wideFit: postcss.AtRule | null = null;
    root.walkAtRules('container', (r) => {
      if (r.params === 'ch-hmap (max-width: 22.9em)') wideFit = r;
    });
    expect(wideFit).not.toBeNull();
    expect(at(wideFit!)).toBe('media (min-width: 600px)');
    // 6 tiles of 2.07 em + 4 px and 5 gaps of 4 px, at the section's 16 px: 15.17 em.
    expect((6 * (2.07 * 16 + 4) + 5 * 4) / 16).toBeLessThanOrEqual(15.2);
    root.walkRules((r: Rule) => {
      if (!r.selectors.some((s) => /\.ch-hmap-mapv\b/.test(s))) return;
      expect(at(r), r.selector).not.toBe('media (max-width: 599px)');
    });
  });

  it('on a phone the map is one grid of six columns, each tile at least 56 px tall, with a seam before 10 and no left accent', () => {
    const root = postcss.parse(css);
    const phone: Record<string, Record<string, string>> = {};
    root.walkAtRules('media', (m) => {
      if (m.params !== '(max-width: 599px)') return;
      m.walkRules((r) => {
        for (const sel of r.selectors) {
          phone[sel] = { ...phone[sel] };
          r.walkDecls((d) => {
            phone[sel]![d.prop] = d.value;
          });
        }
      });
    });
    expect(phone['.ch-hmap__grid']).toMatchObject({ display: 'grid', 'grid-template-columns': 'repeat(6, minmax(0, 1fr))', gap: 'var(--ch-space-1)' });
    expect(phone['.ch-hmap__grid > .ch-hmap__row']).toMatchObject({ display: 'contents' });
    expect(phone['.ch-hmap__grid > .ch-hmap__cap']).toMatchObject({ display: 'none' });
    expect(phone['.ch-hmap__sum']).toMatchObject({ display: 'flex', 'grid-column': '1 / -1' });
    expect(phone['.ch-hmap-t']).toMatchObject({ height: 'auto', 'min-height': '56px' });
    expect(phone['.ch-hmap__steps']).toMatchObject({ display: 'none' });
    const seam = phone[".ch-hmap-t[data-hole='10']::after"]!;
    expect(seam.width).toBe('var(--ch-hairline-w)');
    for (const decls of Object.values(phone)) {
      expect(Object.keys(decls)).not.toContain('border-left');
      for (const v of Object.values(decls)) expect(v).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i);
    }
    // The phone block comes after the base rules it overrides (the steppers' display: flex lost to nothing before).
    expect(css.indexOf('\n@media (max-width: 599px) {')).toBeGreaterThan(css.indexOf('\n.ch-hmap__steps {'));
    // From 414 a phone tile is 60 tall, as the 9-across tile was.
    expect(css).toMatch(/@media \(min-width: 414px\) and \(max-width: 599px\) {\s*\.ch-hmap-t {\s*min-height: 60px;/);
  });
});
