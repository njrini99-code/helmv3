import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { titleOnScroll } from '../shell/large-title';

/** Clubhouse refresh, PR 2 and 3: every rule sits under `[data-ch-refresh='on']`, which the app root always carries (the flag is retired). */

const css = (f: string) => readFileSync(join(process.cwd(), 'src/clubhouse/styles', f), 'utf8');
const scopedRules = (f: string) => {
  const rules: { selector: string; props: Record<string, string> }[] = [];
  postcss.parse(css(f)).walkRules((r) => {
    if (!r.selector.includes("[data-ch-refresh='on']")) return;
    const props: Record<string, string> = {};
    r.walkDecls((d) => {
      props[d.prop] = d.value;
    });
    rules.push({ selector: r.selector, props });
  });
  return rules;
};

describe('the refreshed shell', () => {
  it('sticky controls are clear over the lit page, and take its paper and linen once the page scrolls under them', () => {
    // Nick, 15 Nov 2026 (audit WHITE-00): the ivory light is back on the page, so a sticky bar painted one flat colour
    // would cut a band across it. At rest the bar shows the page; scrolled, it carries the paper over the linen.
    const rules = scopedRules('shell.css').filter((r) => /:is\(\[data-ch-sticky-controls\], \.ch-stickybar\)/.test(r.selector));
    const rest = rules.find((r) => !r.selector.includes('[data-scrolled]'));
    const scrolled = rules.find((r) => r.selector.includes(':has(.ch-topbar[data-scrolled])'));
    expect(rest?.props.background).toBe('transparent');
    expect(scrolled?.props.background).toBe('var(--ch-light-paper), var(--ch-workspace)');
    for (const r of rules) expect(r.props.background ?? '').not.toBe('var(--ch-grouped-bg)');
  });

  it('a feature card is flat at the token, so no scoped rule has to flatten it', () => {
    // The flag is retired, so the flat green lives in tokens.css (styles/__tests__/depth.test.ts pins its value) and
    // the scoped override that used to flatten a radial token is gone.
    expect(scopedRules('ui.css').filter((r) => r.props['--ch-feature-bg'])).toEqual([]);
    expect(css('tokens.css')).toMatch(/--ch-feature-bg: var\(--ch-green-800\);/);
    expect(css('tokens.css')).not.toMatch(/--ch-feature-bg:[^;]*gradient/);
  });
});

describe('titleOnScroll', () => {
  it('shrinks to 86% and fades to 10% over the first 56px', () => {
    expect(titleOnScroll(0, false)).toEqual({ scale: 1, opacity: 1 });
    const end = titleOnScroll(56, false);
    expect(end.scale).toBeCloseTo(0.86);
    expect(end.opacity).toBeCloseTo(0.1);
    expect(titleOnScroll(500, false)).toEqual(end);
  });
  it('fades only under Reduce Motion', () => {
    const end = titleOnScroll(56, true);
    expect(end.scale).toBe(1);
    expect(end.opacity).toBeCloseTo(0.1);
  });
  it('holds still on a bounce above the top', () => {
    expect(titleOnScroll(-20, false)).toEqual({ scale: 1, opacity: 1 });
  });
});
