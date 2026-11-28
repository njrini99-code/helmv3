import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

/**
 * Chart marks hold 3:1 against what they sit on (WCAG 1.4.11), found by the charts thread's painted-pixel pass on
 * 16 Nov 2026: the loss fill on the pale chart track, CoachHelm's stations and coins once they step back off the hole,
 * and the hollow early coin on the green stage.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
type Rgb = [number, number, number];
const hex = (h: string): Rgb => {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const linear = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const lum = (h: string) => {
  const [r, g, b] = hex(h);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
};
const ratio = (a: string, b: string) => {
  const hi = Math.max(lum(a), lum(b));
  const lo = Math.min(lum(a), lum(b));
  return (hi + 0.05) / (lo + 0.05);
};
const mix = (fg: string, bg: string, a: number) => {
  const [f, b] = [hex(fg), hex(bg)];
  return '#' + f.map((v, i) => Math.round(a * v + (1 - a) * b[i as 0 | 1 | 2]).toString(16).padStart(2, '0')).join('');
};

/** The first value a custom property takes in the sheet (the light theme's `:root`). */
const firstDecl = (css: string, name: string) => {
  let v: string | undefined;
  postcss.parse(css).walkDecls(name, (d) => {
    v ??= d.value.trim();
  });
  return v!;
};
const ruleDecl = (css: string, selector: string, prop: string) => {
  let v: string | undefined;
  postcss.parse(css).walkRules((r) => {
    if (r.selector.trim() !== selector) return;
    r.walkDecls(prop, (d) => {
      v = d.value.trim();
    });
  });
  return v;
};

describe('chart marks hold 3:1 on what they sit on', () => {
  const tokens = read('src/clubhouse/styles/tokens.css');
  const team = read('src/clubhouse/styles/coachhelm-team.css');

  it('paints a loss bar that reads on the card and on the track', () => {
    const fill = firstDecl(tokens, '--ch-chart-loss-fill');
    expect(ratio(fill, firstDecl(tokens, '--ch-chart-track'))).toBeGreaterThanOrEqual(3);
    expect(ratio(fill, firstDecl(tokens, '--ch-bg-surface'))).toBeGreaterThanOrEqual(3);
    expect(ratio(fill, firstDecl(tokens, '--ch-chart-gain-fill'))).toBeGreaterThanOrEqual(3);
  });

  it('keeps a station and a coin readable off the hole, on the lightest stage green', () => {
    const stage = '#0f4430';
    const station = Number(ruleDecl(team, '.ch-htb .hole.offh .stn', 'opacity'));
    const coin = Number(ruleDecl(team, '.ch-htb .hole.offh .scn circle', 'opacity'));
    expect(ratio(mix(firstDecl(tokens, '--ch-feature-loss'), stage, station), stage)).toBeGreaterThanOrEqual(3);
    expect(ratio(mix(firstDecl(tokens, '--ch-feature-ink'), stage, coin), stage)).toBeGreaterThanOrEqual(3);
  });

  it('rings a hollow early coin in the full feature ink', () => {
    expect(ruleDecl(team, '.ch-htb .scn.early circle', 'stroke')).toBe('var(--ch-feature-ink)');
  });
});

describe('the scoring mix and control edges hold 3:1 (depth and contrast pass, 27 Nov 2026)', () => {
  const tokens = read('src/clubhouse/styles/tokens.css');
  const stats = read('src/clubhouse/styles/stats.css');
  const card = firstDecl(tokens, '--ch-bg-surface');
  const page = firstDecl(tokens, '--ch-bg-page');

  it('paints a bogey segment that reads on the card, with its numeral at 4.5:1', () => {
    const bogey = firstDecl(tokens, '--ch-chart-bogey').split(/\s/)[0]!;
    expect(ratio(bogey, card)).toBeGreaterThanOrEqual(3.3);
    expect(ratio(firstDecl(tokens, '--ch-ink-950'), bogey)).toBeGreaterThanOrEqual(4.5);
  });

  it("edges the quiet par segment in the control border, not the 1.3:1 ledger hairline", () => {
    expect(ruleDecl(stats, '.ch-sv-mix-seg.is-par', 'box-shadow')).toBe('inset 0 0 0 1px var(--ch-border-control)');
  });

  it('keeps the control border at 3:1 or better on the page and the card, with room to spare', () => {
    const border = firstDecl(tokens, '--ch-border-control').split(/\s/)[0]!;
    expect(ratio(border, page)).toBeGreaterThanOrEqual(3.3);
    expect(ratio(border, card)).toBeGreaterThanOrEqual(3.3);
  });
});
