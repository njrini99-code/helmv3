import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

/**
 * The page is the ivory light over a deeper linen, and the cards are ivory paper on it (DESIGN_LANGUAGE law 2).
 * Nick, 15 Nov 2026 (production audit WHITE-00 to WHITE-11): "Ivory cards, deeper page". The flat #f2f0e9 page of
 * 11 Nov (#2497) and its near-white #fffefb cards (1.09:1) covered 50 to 73% of a phone screen in white; the call
 * brings back the Oct 21 canvas layers (d0f467a73) over a linen about #e8e3d5, with cards about #faf7ef at 1.20:1 and
 * nothing white. One paint (`--ch-page-paint`) serves the phone page, a pushed screen, a crash screen and the page
 * copies that slide during a push, so one walk through the app crosses one page.
 */
const read = (f: string) => readFileSync(join(process.cwd(), 'src/clubhouse/styles', f), 'utf8');
const tokens = postcss.parse(read('tokens.css'));
const shell = postcss.parse(read('shell.css'));

/** Every declaration of a token, with whether it sits in the dark theme or behind a media query. */
const values = (name: string) => {
  const out: { value: string; dark: boolean }[] = [];
  tokens.walkDecls(name, (d) => {
    const rule = d.parent as postcss.Rule;
    if (rule.parent?.type === 'atrule') return; // phone, contrast and transparency blocks are checked separately
    out.push({ value: d.value.trim().toLowerCase(), dark: rule.selector.includes("data-fw-theme='dark'") });
  });
  return out;
};
const lightValue = (name: string) => values(name).find((v) => !v.dark)?.value;
const darkValue = (name: string) => values(name).find((v) => v.dark)?.value ?? lightValue(name);

/** Resolves a light or dark token to a hex through var() chains. */
const resolve = (name: string, dark: boolean, depth = 0): string => {
  const v = (dark ? darkValue(name) : lightValue(name)) ?? '';
  const ref = v.match(/^var\((--ch-[\w-]+)\)$/);
  if (ref && depth < 8) return resolve(ref[1]!, dark, depth + 1);
  return v;
};
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

/** Background declarations of rules whose subject is the canvas, the app, a pushed screen or a layer drawn on one. */
const pageBackgrounds = () => {
  const out: { selector: string; value: string; media: string }[] = [];
  shell.walkRules(/\.ch-(canvas|app|pscreen)\b/, (rule) => {
    const media = rule.parent?.type === 'atrule' ? (rule.parent as postcss.AtRule).params : '';
    for (const selector of rule.selectors.map((s) => s.trim().replace(/\s+/g, ' '))) {
      if (!/\.ch-(canvas|app|pscreen)(\[[^\]]*\])*(::before|::after)?$/.test(selector)) continue;
      rule.walkDecls(/^background$/, (d) => {
        out.push({ selector, value: d.value.replace(/\s+/g, ' ').trim(), media });
      });
    }
  });
  return out;
};
const PHONE = /max-width: 820px/;
const DESKTOP = /min-width: 821px/;

describe('the page: ivory light over a deeper linen', () => {
  it('--ch-workspace is the linen, #e8e3d5 by day and #131814 at night (audit S1.1)', () => {
    expect(values('--ch-workspace')).toEqual([
      { value: '#e8e3d5', dark: false },
      { value: '#131814', dark: true },
    ]);
  });

  it('--ch-bg-page is the same linen by day and the recessed #111512 at night (audit S1.2)', () => {
    expect(values('--ch-bg-page')).toEqual([
      { value: '#e8e3d5', dark: false },
      { value: '#111512', dark: true },
    ]);
  });

  it('--ch-grouped-bg reads the linen in both themes, with no value of its own', () => {
    expect(values('--ch-grouped-bg').map((v) => v.value)).toEqual(['var(--ch-workspace)', 'var(--ch-workspace)']);
  });

  it('no phone-only page, card or ivory value comes back', () => {
    tokens.walkAtRules('media', (at) => {
      if (!PHONE.test(at.params)) return;
      at.walkDecls(/^--ch-(workspace|bg-page|grouped-bg|bg-surface|card-bg|ivory-\d+|page-paint)$/, (d) => {
        throw new Error(`a phone block redefines ${d.prop}: ${d.value}`);
      });
    });
  });

  it('--ch-page-paint is the light, the paper tint and the linen, defined once', () => {
    expect(values('--ch-page-paint')).toEqual([{ value: 'var(--ch-light-canvas), var(--ch-light-paper), var(--ch-workspace)', dark: false }]);
  });

  it('the phone page and a pushed screen paint the page, and the app behind them is paper over the linen', () => {
    const bg = pageBackgrounds().filter((b) => PHONE.test(b.media));
    // The last phone rule for each wins; it must be the page paint.
    const last = (re: RegExp) => bg.filter((b) => re.test(b.selector)).at(-1)?.value;
    expect(last(/\.ch-canvas$/)).toBe('var(--ch-page-paint)');
    expect(last(/\.ch-pscreen$/)).toBe('var(--ch-page-paint)');
    expect(last(/\.ch-app$/)).toBe('var(--ch-light-paper), var(--ch-workspace)');
  });

  it('the desktop canvas paints the light, a sidebar bleed, the paper and the linen, scrolling with the page, under a mist', () => {
    const canvas = pageBackgrounds().filter((b) => DESKTOP.test(b.media) && /\.ch-canvas$/.test(b.selector)).at(-1)?.value ?? '';
    expect(canvas.startsWith('var(--ch-light-canvas) local, linear-gradient(90deg,'), canvas).toBe(true);
    expect(canvas.endsWith(') local, var(--ch-light-paper), var(--ch-workspace)'), canvas).toBe(true);
    let mist = 0;
    shell.walkRules(/\.ch-canvas::before$/, () => {
      mist++;
    });
    expect(mist).toBe(1);
  });

  it('no canvas, app or pushed-screen rule paints a flat page colour alone', () => {
    // The 11 Nov regression: `background: var(--ch-grouped-bg)` on the canvas flattened the light away.
    for (const b of pageBackgrounds()) {
      expect(b.value, `${b.selector} { background: ${b.value} }`).not.toMatch(/^var\(--ch-(grouped-bg|bg-page|workspace)\)$/);
    }
  });

  it('a page copy that slides during a push or a pop paints the page, so no flat band crosses the screen', () => {
    const copies: string[] = [];
    shell.walkRules(/\.ch-frame-(route|popping|under)/, (rule) => {
      rule.walkDecls('background', (d) => {
        copies.push(d.value.trim());
      });
    });
    // Three since the motion fix (#2537) retired the view-transition slide and its `html[data-ch-nav] .ch-frame-route`
    // rule: the pop copy, the copy under a push and the page sliding over it. Each still paints the page.
    expect(copies.length).toBeGreaterThanOrEqual(3);
    for (const v of copies) expect(v).toBe('var(--ch-page-paint)');
  });
});

describe('ivory cards on the linen, nothing white', () => {
  it('the card is ivory paper #faf7ef, 1.20:1 on the page by day (Nick, 15 Nov)', () => {
    expect(resolve('--ch-card-bg', false)).toBe('#faf7ef');
    expect(resolve('--ch-bg-surface', false)).toBe('#faf7ef');
    expect(ratio(resolve('--ch-card-bg', false), resolve('--ch-workspace', false))).toBeGreaterThanOrEqual(1.19);
  });

  it('tiles and wells inside a card are #f1ede2', () => {
    expect(resolve('--ch-bg-subtle', false)).toBe('#f1ede2');
    expect(resolve('--ch-well-bg-flat', false)).toBe('#f1ede2');
  });

  it.each(['--ch-card-bg', '--ch-bg-surface', '--ch-bg-elevated', '--ch-sheet-bg', '--ch-chart-paper', '--ch-bubble-theirs-bg', '--ch-raised-bg', '--ch-ivory-0', '--ch-ivory-25', '--ch-ivory-50'])(
    '%s is not white by day (every channel under 252, the audit counts 247 and up as near-white coverage)',
    (name) => {
      const hex = resolve(name, false);
      expect(hex, name).toMatch(/^#[0-9a-f]{6}$/);
      expect(Math.max(...rgb(hex)), `${name} ${hex}`).toBeLessThan(253);
      expect(Math.min(...rgb(hex)), `${name} ${hex}`).toBeLessThan(247);
    },
  );

  it('at night the card is #212722 and lifts off the page', () => {
    expect(resolve('--ch-card-bg', true)).toBe('#212722');
    expect(ratio(resolve('--ch-card-bg', true), resolve('--ch-workspace', true))).toBeGreaterThan(1.1);
  });
});
