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

  it('is the ring and two soft layers, by day and at night (audit spec S1.5; depth pass, Nick 27 Nov 2026)', () => {
    // Ivory paper on the linen: one hairline edge, a contact shadow and one ambient fall; no lit inset rim, no sun drift
    // and no third ambient layer (the 5-layer recipe from depth.css's sheet read as a floating panel on every card).
    // 27 Nov ("more depth, more modern premium look"): the same two layers, set to read.
    const [day, night] = decls('--ch-elevation-card');
    expect(day).toBe('0 0 0 1px var(--ch-card-ring), 0 1px 2px rgb(28 25 18 / 0.07), 0 6px 16px -6px rgb(28 25 18 / 0.14)');
    expect(drops(day!)).toEqual(['1px 2px 0.07', '6px 16px -6px 0.14']);
    expect(day).not.toMatch(/inset|--ch-light-(rim|drift)/);
    // At night the card is lighter than its page and casts as well, so the step reads by tone and by shadow.
    expect(night).toBe('0 0 0 1px var(--ch-card-ring), 0 1px 2px rgb(0 0 0 / 0.28), 0 6px 16px -6px rgb(0 0 0 / 0.44)');
    expect(drops(night!)).toEqual(['1px 2px 0.28', '6px 16px -6px 0.44']);
    expect(night).not.toMatch(/inset/);
  });

  it('keeps raised a clear step above the card, by day and at night', () => {
    const alpha = (shadow: string) => Math.max(...drops(shadow).map((d) => Number(d.split(' ').pop())));
    const reach = (shadow: string) => Math.max(...drops(shadow).map((d) => Number(d.split(' ')[1]!.replace('px', ''))));
    const cards = decls('--ch-elevation-card');
    const raised = decls('--ch-elevation-raised');
    expect(raised).toHaveLength(2);
    raised.forEach((r, i) => {
      expect(alpha(r), `theme ${i}`).toBeGreaterThan(alpha(cards[i]!));
      expect(reach(r), `theme ${i}`).toBeGreaterThan(reach(cards[i]!));
      expect(drops(r), `theme ${i}`).toHaveLength(2);
    });
  });

  it('casts the same drops with no ring or lit edge on a dark or branded surface, by day and at night', () => {
    const casts = decls('--ch-elevation-cast');
    const cards = decls('--ch-elevation-card');
    expect(casts).toHaveLength(2);
    casts.forEach((cast, i) => {
      expect(drops(cast)).toEqual(drops(cards[i]!));
      expect(cast).not.toMatch(/inset|0 0 0 1px/);
    });
  });

  it("edges a tinted icon well with the card's own ring, inset (depth pass, 27 Nov 2026)", () => {
    expect(decls('--ch-icon-well-edge')).toEqual(['inset 0 0 0 1px var(--ch-card-ring)']);
    const shell = read('src/clubhouse/styles/shell.css');
    for (const sel of ['.ch-more__ic', '.ch-tsw__ic']) {
      let edge: string | undefined;
      postcss.parse(shell).walkRules((r) => {
        if (r.selector === sel && r.parent?.type === 'root') r.walkDecls('box-shadow', (d) => void (edge = d.value));
      });
      expect(edge, sel).toBe('var(--ch-icon-well-edge)');
    }
  });

  it('is the only depth a shared Surface rule sets', () => {
    for (const file of ['ui.css', 'shell.css', 'base.css', 'controls.css']) {
      postcss.parse(read('src/clubhouse/styles', file)).walkRules(/\.ch-surface(?![\w-]*__)/, (rule) => {
        rule.walkDecls('box-shadow', (d) => {
          const ok = d.value === 'var(--ch-elevation-card)' || d.value === 'var(--ch-card-shadow)' || (rule.selector.includes('.ch-surface--flat') && /^0 0 0 1px var\(--ch-border-subtle\)$/.test(d.value));
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

  it('sits on the card elevation, one of the three (MOTION-AND-VISUAL 4.6): no green cast of its own, by day or at night', () => {
    expect(decls('--ch-feature-shadow')).toEqual(['var(--ch-elevation-feature)']);
    expect(decls('--ch-elevation-feature')).toEqual(['var(--ch-elevation-card)']);
  });
});
