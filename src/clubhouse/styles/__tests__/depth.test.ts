import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

/**
 * Depth is one card and one feature card (owner: "lit faces, soft contact and ambient shadows, restrained";
 * design/handoff/depth.css is the reference). Two card shadows under one name put two kinds of card on one page (design
 * review, 10 Nov 2026), so every card name reads the one recipe and no shared rule writes another.
 */
const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8');
const tokens = read('src/clubhouse/styles/tokens.css');
const flat = (v: string) => v.replace(/\s+/g, ' ').trim();
/** Every declaration of a custom property in tokens.css, in order. */
const decls = (name: string): string[] => {
  const out: string[] = [];
  postcss.parse(tokens).walkDecls(name, (d) => {
    out.push(flat(d.value));
  });
  return out;
};
/** A shadow layer as "y blur spread alpha", whatever its x offset and colour syntax. */
const drops = (shadow: string) =>
  postcss.list
    .comma(shadow)
    .filter((l) => !/\binset\b/.test(l) && !/0 0 0 1px/.test(l))
    .map((l) => {
      const alpha = l.match(/\/\s*\.?([\d.]+)\s*\)/)?.[0].replace(/[^\d.]/g, '') ?? '';
      const geometry = l.replace(/(?:rgba?|var|calc)\((?:[^()]|\([^()]*\))*\)/g, ' ').match(/-?[\d.]+px/g) ?? [];
      return `${geometry.slice(-3).join(' ')} ${Number(alpha.startsWith('.') ? `0${alpha}` : alpha)}`;
    });

describe('the one card', () => {
  it('is defined once by day and once at night, and every card name reads it', () => {
    expect(decls('--ch-elevation-card')).toHaveLength(2);
    for (const alias of ['--ch-card-shadow', '--ch-card-shadow-flat', '--ch-crh-card-shadow', '--ch-elevation-reading', '--ch-elevation-lifted']) {
      expect(decls(alias), alias).toEqual(['var(--ch-elevation-card)']);
    }
  });

  it('takes its three drops from depth.css’s sheet, with the card’s own ring and a lit top edge', () => {
    const sheet = read('design/handoff/depth.css').match(/--dp-sheet-shadow:([^;]+);/)?.[1] ?? '';
    // depth.css: contact 0 1px 2px .06, near 0 6px 14px -6px .12, ambient 0 22px 40px -22px .22.
    expect(drops(sheet)).toEqual(['1px 2px 0.06', '6px 14px -6px 0.12', '22px 40px -22px 0.22']);
    const card = decls('--ch-elevation-card')[0]!;
    expect(drops(card)).toEqual(drops(sheet));
    expect(card).toContain('0 0 0 1px var(--ch-card-ring)');
    expect(card).toMatch(/^inset var\(--ch-light-rim-x\) 1px 0 var\(--ch-light-rim\)/);
  });

  it('casts the same drops with no ring or lit edge on a dark or branded surface', () => {
    const cast = decls('--ch-elevation-cast')[0]!;
    expect(drops(cast)).toEqual(drops(decls('--ch-elevation-card')[0]!));
    expect(cast).not.toMatch(/inset|0 0 0 1px/);
  });

  it('is the only depth a shared Surface rule sets', () => {
    for (const file of ['ui.css', 'shell.css', 'base.css', 'controls.css']) {
      postcss.parse(read('src/clubhouse/styles', file)).walkRules(/\.ch-surface(?![\w-]*__)/, (rule) => {
        rule.walkDecls('box-shadow', (d) => {
          const ok = d.value === 'var(--ch-card-shadow)' || d.value === 'var(--ch-feature-shadow)' || (rule.selector.includes('.ch-surface--flat') && /^0 0 0 1px var\(--ch-border-subtle\)$/.test(d.value));
          expect(ok, `${file}: ${rule.selector} { box-shadow: ${d.value} }`).toBe(true);
        });
      });
    }
  });
});

describe('the one feature card', () => {
  it('is flat: no radial light, by day or at night (DESIGN_LANGUAGE 4 and 9, SHARED-2)', () => {
    expect(decls('--ch-feature-bg')).toEqual(['var(--ch-green-800)']);
    for (const file of ['ui.css', 'shell.css', 'base.css', 'controls.css']) {
      postcss.parse(read('src/clubhouse/styles', file)).walkDecls('--ch-feature-bg', (d) => {
        throw new Error(`${file} overrides --ch-feature-bg: ${d.value}`);
      });
    }
  });

  it('has one shadow, a green cast with no ring and no white edge by day', () => {
    expect(decls('--ch-feature-shadow')).toEqual(['var(--ch-elevation-feature)']);
    const [day, night] = decls('--ch-elevation-feature');
    expect(day).toBe('0 1px 2px rgb(8 43 28 / 0.2), 0 14px 30px -18px rgb(8 43 28 / 0.6)');
    // Night: shadows carry little on a dark page, so a faint green ring marks the edge.
    expect(night).toContain('0 0 0 1px');
  });
});
