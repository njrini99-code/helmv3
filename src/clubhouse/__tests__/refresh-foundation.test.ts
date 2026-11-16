import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { CH_LARGE_TITLE_RANGE, titleOnScroll } from '../shell/large-title';

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
  // Production audit 2026-11-15 (S4.3, MOT-06): an iOS large title scrolls with the content and is never scaled.
  it('fades to 10% over the first 52px, and never scales', () => {
    expect(titleOnScroll(0)).toBe(1);
    expect(titleOnScroll(CH_LARGE_TITLE_RANGE)).toBeCloseTo(0.1);
    expect(CH_LARGE_TITLE_RANGE).toBe(52);
    expect(titleOnScroll(500)).toBeCloseTo(0.1);
  });
  it('holds still on a bounce above the top', () => {
    expect(titleOnScroll(-20)).toBe(1);
  });
  it('fades on the scroll timeline in CSS where Safari has one, with no scale anywhere', () => {
    const shell = css('shell.css');
    expect(shell).toMatch(/@supports \(animation-timeline: scroll\(\)\)[\s\S]*?\.ch-large-title[\s\S]*?animation-timeline: scroll\(root block\);[\s\S]*?animation-range: 0px 52px;/);
    // One keyframe for both titles (MOTION-AND-VISUAL 3.3): the large title ends at 0.1, the bar's title at --ch-lt-to: 1.
    expect(shell).toMatch(/@keyframes ch-lt-under \{\s*to \{\s*opacity: var\(--ch-lt-to, 0\.1\);\s*\}\s*\}/);
  });
});
