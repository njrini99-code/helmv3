import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

/**
 * The page is one flat colour (DESIGN_LANGUAGE law 2: #F2F0E9 by day, #0E120F at night; no radial light, paper tint or
 * wash behind content). Design review, 10 Nov 2026: a pushed phone screen drew rgb(237 233 223) and the desktop canvas
 * rgb(245 240 228) under a green gradient, so one walk through the app crossed three page colours. The three names a
 * page colour has had (`--ch-grouped-bg`, `--ch-workspace`, `--ch-bg-page`) now hold one value per theme.
 */
const read = (f: string) => readFileSync(join(process.cwd(), 'src/clubhouse/styles', f), 'utf8');
const tokens = postcss.parse(read('tokens.css'));
const values = (name: string) => {
  const out: { value: string; dark: boolean }[] = [];
  tokens.walkDecls(name, (d) => {
    const rule = d.parent as postcss.Rule;
    out.push({ value: d.value.trim().toLowerCase(), dark: rule.selector.includes("data-fw-theme='dark'") });
  });
  return out;
};

describe('one flat page colour', () => {
  it.each(['--ch-grouped-bg', '--ch-workspace'])('%s is #f2f0e9 by day and #0e120f at night, with no phone-only value', (name) => {
    expect(values(name)).toEqual([
      { value: '#f2f0e9', dark: false },
      { value: '#0e120f', dark: true },
    ]);
  });

  it('--ch-bg-page is the same page by day, with no phone-only value', () => {
    // At night it stays #111512 for now: the 0.12 hairline (owner decision 6) is held at 1.33 on this token and reads
    // 1.328 on #0e120f. The page itself, a pushed screen and the canvas read --ch-grouped-bg in both themes.
    expect(values('--ch-bg-page')).toEqual([
      { value: '#f2f0e9', dark: false },
      { value: '#111512', dark: true },
    ]);
  });

  const shell = postcss.parse(read('shell.css'));
  it('no canvas, app or pushed-screen rule paints a light, a paper tint or a gradient', () => {
    let seen = 0;
    shell.walkRules(/\.ch-(canvas|app|pscreen)\b/, (rule) => {
      // Only a rule whose subject is the canvas, the app or a pushed screen itself (or a layer drawn on one).
      if (!rule.selectors.some((s) => /\.ch-(canvas|app|pscreen)(\[[^\]]*\])*(::before|::after)?$/.test(s.trim()))) return;
      rule.walkDecls(/^background(-image)?$/, (d) => {
        seen++;
        expect(d.value, `${rule.selector} { ${d.prop}: ${d.value} }`).not.toMatch(/--ch-light-(canvas|paper)|radial-gradient|linear-gradient/);
      });
    });
    expect(seen).toBeGreaterThan(2);
  });

  it('the phone page, the desktop canvas and a pushed screen all read the page colour', () => {
    const flat: string[] = [];
    shell.walkRules((rule) => {
      rule.walkDecls('background', (d) => {
        if (d.value === 'var(--ch-grouped-bg)') flat.push(rule.selector.replace(/\s+/g, ' '));
      });
    });
    expect(flat.some((s) => /\.ch-pscreen$/.test(s))).toBe(true);
    expect(flat.filter((s) => /\.ch-canvas$/.test(s)).length).toBeGreaterThanOrEqual(2);
  });

  it('the desktop canvas has no mist layer', () => {
    shell.walkRules(/\.ch-canvas::before/, (rule) => {
      throw new Error(`a layer is drawn behind the canvas: ${rule.selector}`);
    });
  });
});
