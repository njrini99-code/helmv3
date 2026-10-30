import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A18 and A27: placeholders on their token, no-data marks and the brass eyebrow above 4.5:1, and the Track's disabled
 * button readable. Contrast is WCAG 2's, from the tokens and rules as written.
 */

const STYLES = join(process.cwd(), 'src/clubhouse/styles');
const css = (f: string) => readFileSync(join(STYLES, f), 'utf8');
const tokens = css('tokens.css');

type RGB = [number, number, number];
const hex = (h: string): RGB => {
  const s = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) as RGB;
};
const lum = ([r, g, b]: RGB) => {
  const c = [r, g, b].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const contrast = (a: RGB, b: RGB) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};
const over = (fg: RGB, a: number, bg: RGB): RGB => fg.map((v, i) => v * a + bg[i]! * (1 - a)) as RGB;
/** A token's hex in the light root (first definition) or the dark block (the first after `[data-fw-theme='dark']`). */
const token = (name: string, theme: 'light' | 'dark'): string => {
  const from = theme === 'light' ? 0 : tokens.indexOf("[data-fw-theme='dark']");
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(tokens.slice(from));
  if (!m) throw new Error(`--${name} (${theme}) is not a hex`);
  return m[1]!;
};

describe('placeholders sit on their token (A18)', () => {
  it('every ::placeholder rule uses --ch-text-placeholder, but the phone To line on the bare page (tertiary)', () => {
    const rules = readdirSync(STYLES)
      .filter((f) => f.endsWith('.css'))
      .flatMap((f) => [...css(f).matchAll(/([^{}]*::placeholder[^{}]*)\{([^{}]*)\}/g)].map((m) => ({ f, sel: m[1]!.trim(), body: m[2]! })));
    expect(rules.length).toBeGreaterThan(10);
    for (const r of rules) {
      const ok = r.sel.includes('.ch-msp-to__in') ? /var\(--ch-text-tertiary\)/ : /var\(--ch-text-placeholder\)/;
      expect(r.body, `${r.f} ${r.sel}`).toMatch(ok);
    }
  });

  it('the token reads at 4.5:1 or more on a field (the surface), light and dark', () => {
    for (const theme of ['light', 'dark'] as const) {
      expect(contrast(hex(token('ch-text-placeholder', theme)), hex(token('ch-bg-surface', theme))), theme).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('no-data marks and the eyebrow (A18)', () => {
  it('a hole not played and an empty plate use the tertiary ink, not ink-300', () => {
    expect(css('ui.css')).toMatch(/\.ch-score--empty \{[^}]*color: var\(--ch-text-tertiary\)/);
    expect(css('qualifiers.css')).toMatch(/\.ch-qf-plate\.is-none \{[^}]*color: var\(--ch-text-tertiary\)/);
  });

  it('the header eyebrow is the Ledger eyebrow, 4.5:1 or more on the page', () => {
    expect(css('hero-tones.css')).toMatch(/--ch-hero-brass: var\(--ch-ledger-eyebrow\)/);
    expect(contrast(hex(token('ch-ledger-eyebrow', 'light')), hex(token('ch-bg-page', 'light')))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the Track's disabled button is readable (A27)", () => {
  const track = css('rounds-track.css');
  it('light: its text on its fill reaches 4.5:1', () => {
    const m = /\.ch-rt-bar__go:disabled \{\s*background: (#[0-9a-f]{6});[\s\S]*?color: (#[0-9a-f]{6});/.exec(track)!;
    expect(contrast(hex(m[2]!), hex(m[1]!))).toBeGreaterThanOrEqual(4.5);
  });

  it('the phone, on green: the muted ink over its translucent fill reaches 4.5:1', () => {
    expect(track).toMatch(/\.ch-rt-bar__go:disabled \{\s*background: rgb\(244 238 221 \/ 0\.16\);\s*color: var\(--ch-on-green-ink-muted\);/);
    const green = hex(token('ch-green-900', 'light'));
    const fill = over([244, 238, 221], 0.16, green);
    const ink = /--ch-on-green-ink-muted:\s*rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)/.exec(tokens)!;
    const text = over([Number(ink[1]), Number(ink[2]), Number(ink[3])], Number(ink[4]), fill);
    expect(contrast(text, fill)).toBeGreaterThanOrEqual(4.5);
  });

  it('dark: ink-500 on ivory-200 reaches 4.5:1', () => {
    expect(contrast(hex(token('ch-ink-500', 'dark')), hex(token('ch-ivory-200', 'dark')))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('ink on the elevated surfaces (B4)', () => {
  it('primary, secondary and tertiary ink read at 4.5:1 or more on both dark elevated steps', () => {
    for (const bg of ['ch-bg-elevated', 'ch-bg-elevated-2']) {
      for (const ink of ['ch-ink-900', 'ch-ink-700', 'ch-ink-600']) {
        expect(contrast(hex(token(ink, 'dark')), hex(token(bg, 'dark'))), `${ink} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('the primary key at night (B21, X-6)', () => {
  it('ivory words read at 4.5:1 or more on every stop of the face, and the face stands off the page at 3:1', () => {
    const rule = /:where\(html\[data-fw-theme='dark'\]\) \.ch-btn--primary \{\s*background: linear-gradient\(180deg, (#[0-9a-f]{6}) 0%, (#[0-9a-f]{6}) 50%, #[0-9a-f]{6} 50%, (#[0-9a-f]{6}) 100%\)/.exec(css('ui.css'));
    expect(rule).not.toBeNull();
    const ivory = hex(token('ch-text-on-accent', 'dark'));
    for (const stop of rule!.slice(1, 4)) expect(contrast(ivory, hex(stop!)), stop).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hex(rule![2]!), hex(token('ch-bg-page', 'dark')))).toBeGreaterThanOrEqual(3);
  });
});

describe('Increase Contrast (B15)', () => {
  const block = tokens.slice(tokens.indexOf('@media (prefers-contrast: more)'));
  const lightMore = block.slice(0, block.indexOf("html[data-fw-theme='dark']"));
  const darkMore = block.slice(block.indexOf("html[data-fw-theme='dark']"));
  const more = (b: string, name: string) => new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(b)?.[1];

  it('tertiary ink reads at 7:1 or more on the page', () => {
    expect(lightMore).toMatch(/--ch-text-tertiary: var\(--ch-ink-600\);/);
    expect(darkMore).toMatch(/--ch-text-tertiary: var\(--ch-ink-600\);/);
    expect(contrast(hex(token('ch-ink-600', 'light')), hex(token('ch-bg-page', 'light')))).toBeGreaterThanOrEqual(7);
    expect(contrast(hex(token('ch-ink-600', 'dark')), hex(token('ch-bg-page', 'dark')))).toBeGreaterThanOrEqual(7);
  });

  it('chart ink is stronger than at rest, and 4.5:1 or more on the paper and the page', () => {
    for (const [theme, b] of [['light', lightMore], ['dark', darkMore]] as const) {
      for (const name of ['ch-chart-gain', 'ch-chart-loss', 'ch-chart-flag']) {
        const v = more(b, name);
        expect(v, `${theme} ${name}`).toBeTruthy();
        for (const bg of ['ch-chart-paper', 'ch-bg-page']) {
          const paper = hex(token(bg, theme));
          expect(contrast(hex(v!), paper), `${theme} ${name} on ${bg}`).toBeGreaterThanOrEqual(4.5);
          expect(contrast(hex(v!), paper)).toBeGreaterThan(contrast(hex(token(name, theme)), paper));
        }
      }
    }
  });
});

describe('hairlines a touch darker (owner, 2026-10-24, decision 6)', () => {
  /** A border token's ink and alpha in the light root or the dark block. */
  const rgba = (name: string, theme: 'light' | 'dark'): [RGB, number] => {
    const from = theme === 'light' ? 0 : tokens.indexOf("[data-fw-theme='dark']");
    const m = new RegExp(`--${name}:\\s*rgb\\((\\d+) (\\d+) (\\d+) / ([\\d.]+)\\)`).exec(tokens.slice(from));
    if (!m) throw new Error(`--${name} (${theme}) is not an rgb with alpha`);
    return [[Number(m[1]), Number(m[2]), Number(m[3])], Number(m[4])];
  };

  it('the hairline is 0.10 in light and 0.12 at night, and still reads as a hairline on the page and on a card', () => {
    const [lightInk, lightA] = rgba('ch-border-hairline', 'light');
    const [darkInk, darkA] = rgba('ch-border-hairline', 'dark');
    expect(lightA).toBe(0.1);
    expect(darkA).toBe(0.12);
    // A separator is decoration (WCAG 1.4.11 does not ask 3:1 of it); these hold it visibly darker than at 0.07 / 0.08
    // (1.15 and 1.20 to 1.23) and well under Increase Contrast's line.
    for (const bg of ['ch-bg-page', 'ch-bg-surface'] as const) {
      const light = hex(token(bg, 'light'));
      const dark = hex(token(bg, 'dark'));
      expect(contrast(over(lightInk, lightA, light), light), `light on ${bg}`).toBeGreaterThanOrEqual(1.2);
      expect(contrast(over(darkInk, darkA, dark), dark), `dark on ${bg}`).toBeGreaterThanOrEqual(1.33);
    }
  });

  it('Increase Contrast still draws the hairline stronger in both themes', () => {
    const ic = tokens.slice(tokens.indexOf('@media (prefers-contrast: more)'));
    const icLight = Number(/--ch-border-hairline: rgb\(28 25 18 \/ ([\d.]+)\)/.exec(ic)![1]);
    const icDark = Number(/--ch-border-hairline: rgb\(237 231 216 \/ ([\d.]+)\)/.exec(ic)![1]);
    expect(icLight).toBeGreaterThan(rgba('ch-border-hairline', 'light')[1]);
    expect(icDark).toBeGreaterThan(rgba('ch-border-hairline', 'dark')[1]);
  });
});

describe('the Ask thread at night: the avatar mark and a chosen visual row (2026-10-28)', () => {
  const thread = css('coachhelm-thread.css').replace(/\/\*[\s\S]*?\*\//g, '');
  /** The token a rule reads for `prop`, from the rule whose selector list holds exactly `sel`. */
  const reads = (sel: string, prop: string) => {
    const body = [...thread.matchAll(/([^{}]*)\{([^{}]*)\}/g)].find((m) => m[1]!.split(',').some((s) => s.trim() === sel))?.[2] ?? '';
    const m = new RegExp(`${prop}:[^;]*var\\(--([\\w-]+)\\)`).exec(body);
    if (!m) throw new Error(`${sel} sets no ${prop} token`);
    return m[1]!;
  };
  const dark = (s: string) => `:where(html[data-fw-theme='dark']) ${s}`;

  it('the wheel and the ball read at 3:1 or more on the night sheet (non-text marks)', () => {
    const sheet = hex(token('ch-sheet-bg', 'dark'));
    for (const [sel, prop] of [['.ch-th-mk-helm', 'stroke'], ['.ch-th-mk-ball', 'fill']] as const) {
      const ink = reads(dark(sel), prop);
      expect(contrast(hex(token(ink, 'dark')), sheet), sel).toBeGreaterThanOrEqual(3);
    }
  });

  it('a chosen visual row is ringed at 3:1 or more on the night card', () => {
    const ring = reads(dark('.ch-th-va__row.is-on'), 'box-shadow');
    expect(ring).toBe('ch-selected-ink');
    // --ch-selected-ink is the green-700 step, which the dark block redefines.
    expect(tokens).toMatch(/--ch-selected-ink: var\(--ch-green-700\);/);
    const card = hex(token('ch-bg-subtle', 'dark'));
    expect(contrast(hex(token('ch-green-700', 'dark')), card)).toBeGreaterThanOrEqual(3);
    // Its fill alone is within a shade of the card: why the ring is needed.
    expect(contrast(hex(token('ch-bg-selected', 'dark')), card)).toBeLessThan(1.5);
  });

  it('light keeps its deep-green mark and its unringed selected fill', () => {
    expect(reads('.ch-th-mk-helm', 'stroke')).toBe('ch-green-800');
    expect(reads('.ch-th-mk-ball', 'fill')).toBe('ch-green-800');
    expect(reads('.ch-th-va__row.is-on', 'background')).toBe('ch-selected-bg');
    expect(contrast(hex(token('ch-green-800', 'light')), hex(token('ch-sheet-bg', 'light')))).toBeGreaterThanOrEqual(3);
  });
});

// ── Audit 2026-10-29 (fix plan PR 3): the night contrast token pass ───────────────────────────────────────────────────
// APCA-W3 0.0.98G-4g Lc (|Lc| used), ported from the audit's tools/contrast/contrast.mjs: #888 on #fff is Lc 63.1.
// Owner decision 1 (default): Lc 75 for neutral body ink, Lc 60 for coloured figures, meta and eyebrows.
const sRGBtoY = ([r, g, b]: RGB) => {
  const t = (c: number) => Math.pow(c / 255, 2.4);
  return 0.2126729 * t(r) + 0.7151522 * t(g) + 0.072175 * t(b);
};
const apcaLc = (fg: RGB, bg: RGB): number => {
  const bc = 0.022;
  const bx = 1.414;
  let yt = sRGBtoY(fg);
  let yb = sRGBtoY(bg);
  yt = yt > bc ? yt : yt + Math.pow(bc - yt, bx);
  yb = yb > bc ? yb : yb + Math.pow(bc - yb, bx);
  if (Math.abs(yb - yt) < 0.0005) return 0;
  let o: number;
  if (yb > yt) {
    const s = (Math.pow(yb, 0.56) - Math.pow(yt, 0.57)) * 1.14;
    o = s < 0.1 ? 0 : s - 0.027;
  } else {
    const s = (Math.pow(yb, 0.65) - Math.pow(yt, 0.62)) * 1.14;
    o = s > -0.1 ? 0 : s + 0.027;
  }
  return Math.abs(o * 100);
};

const LIGHT_BLOCK = tokens.slice(0, tokens.indexOf("html[data-fw-theme='dark'] [data-ui='clubhouse'] {"));
const DARK_BLOCK = (() => {
  const from = tokens.indexOf("html[data-fw-theme='dark'] [data-ui='clubhouse'] {");
  return tokens.slice(from, tokens.indexOf('\n}', from));
})();
/** A token's value in a theme: the dark block first at night, else the light root; `var()` chains are followed. */
const raw = (name: string, theme: 'light' | 'dark'): string => {
  const re = new RegExp(`--${name}:\\s*([^;]+);`);
  const v = (theme === 'dark' ? re.exec(DARK_BLOCK) : null) ?? re.exec(LIGHT_BLOCK);
  if (!v) throw new Error(`--${name} is not defined`);
  return v[1]!.trim();
};
const deref = (value: string, theme: 'light' | 'dark'): string => value.replace(/var\(--([\w-]+)\)/g, (_, n: string) => deref(raw(n, theme), theme));
const ink = (name: string, theme: 'light' | 'dark'): RGB => {
  const v = deref(raw(name, theme), theme);
  if (!/^#[0-9a-fA-F]{6}$/.test(v)) throw new Error(`--${name} (${theme}) resolves to ${v}, not a hex`);
  return hex(v);
};
/** The hex stops of a gradient written with tokens or literals. */
const stops = (gradient: string, theme: 'light' | 'dark'): RGB[] => [...deref(gradient, theme).matchAll(/#[0-9a-fA-F]{6}/g)].map((m) => hex(m[0]));
const rule = (file: string, selector: string): string => {
  const src = css(file);
  const at = src.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`${file}: no rule ${selector}`);
  return src.slice(at, src.indexOf('}', at));
};
const NIGHT_SURFACES = ['ch-bg-page', 'ch-workspace', 'ch-bg-surface', 'ch-ivory-25', 'ch-bg-elevated', 'ch-bg-elevated-2'];

describe('F-0005: the zone number coin is deep green in both themes', () => {
  it('ivory on every stop reads 4.5:1 and Lc 75', () => {
    const bg = /background:\s*(linear-gradient\([^;]+\));/.exec(rule('ui.css', '.ch-zn__n'))![1]!;
    for (const theme of ['light', 'dark'] as const) {
      const on = ink('ch-on-fill-50', theme);
      for (const s of stops(bg, theme)) {
        expect(contrast(on, s), `${theme}`).toBeGreaterThanOrEqual(4.5);
        expect(apcaLc(on, s), `${theme}`).toBeGreaterThanOrEqual(75);
      }
    }
  });
});

describe('F-0062: the big zone figure and quiet meta at night', () => {
  it('the dark .ch-znbig gradient reads Lc 60 at both stops on its zone', () => {
    const m = /:where\(html\[data-fw-theme='dark'\]\) \.ch-znbig:not\(\.is-gain, \.is-loss\) \{\s*background: (linear-gradient\([^;]+\));/.exec(css('ui.css'));
    expect(m, 'a dark .ch-znbig rule').not.toBeNull();
    for (const s of stops(m![1]!, 'dark')) expect(apcaLc(s, ink('ch-ivory-25', 'dark'))).toBeGreaterThanOrEqual(60);
  });

  it('dark ink-500 reaches Lc 59 on the page and the surface', () => {
    for (const bg of ['ch-bg-page', 'ch-bg-surface']) expect(apcaLc(ink('ch-ink-500', 'dark'), ink(bg, 'dark')), bg).toBeGreaterThanOrEqual(59);
  });
});

describe('F-0041: body ink reaches Lc 75 (neutral) on every surface', () => {
  it('dark: secondary ink Lc 75 and tertiary Lc 60 on every night surface; the ramp keeps its order', () => {
    for (const bg of NIGHT_SURFACES) {
      expect(apcaLc(ink('ch-ink-700', 'dark'), ink(bg, 'dark')), `ink-700 on ${bg}`).toBeGreaterThanOrEqual(75);
      expect(apcaLc(ink('ch-ink-600', 'dark'), ink(bg, 'dark')), `ink-600 on ${bg}`).toBeGreaterThanOrEqual(60);
    }
    const page = ink('ch-bg-page', 'dark');
    const lc = ['ch-ink-900', 'ch-ink-700', 'ch-ink-600', 'ch-ink-500'].map((n) => apcaLc(ink(n, 'dark'), page));
    expect([...lc].sort((a, b) => b - a)).toEqual(lc);
  });

  it('light: secondary ink Lc 75 and the loss ink Lc 70 on the page', () => {
    expect(apcaLc(ink('ch-ink-700', 'light'), ink('ch-bg-page', 'light'))).toBeGreaterThanOrEqual(75);
    expect(apcaLc(ink('ch-chart-loss', 'light'), ink('ch-bg-page', 'light'))).toBeGreaterThanOrEqual(70);
  });

  it('the top bar crumbs and search text are body size, so secondary', () => {
    expect(rule('shell.css', '.ch-topbar__crumbs')).toMatch(/color: var\(--ch-text-secondary\)/);
    expect(rule('shell.css', '.ch-topbar__search')).toMatch(/color: var\(--ch-text-secondary\)/);
  });
});

describe('F-0043: the tab labels at night', () => {
  it('idle and chosen tab ink reach Lc 75 on the workspace, the page and the surface', () => {
    for (const bg of ['ch-workspace', 'ch-bg-page', 'ch-bg-surface']) {
      expect(apcaLc(ink('ch-tab-ink', 'dark'), ink(bg, 'dark')), `idle on ${bg}`).toBeGreaterThanOrEqual(75);
      expect(apcaLc(ink('ch-tab-ink-selected', 'dark'), ink(bg, 'dark')), `chosen on ${bg}`).toBeGreaterThanOrEqual(75);
    }
  });
});

describe('F-0015: the tab count numeral at night', () => {
  it('the idle and chosen counts reach Lc 75 on both stops of their wells', () => {
    const stats = css('stats.css');
    const idle = /:where\(html\[data-fw-theme='dark'\]\) \.ch-tab-t__n \{([^}]*)\}/.exec(stats)![1]!;
    const sel = /:where\(html\[data-fw-theme='dark'\]\) \.ch-tab-t\[aria-selected='true'\] \.ch-tab-t__n \{([^}]*)\}/.exec(stats)![1]!;
    const color = (body: string) => /color: var\(--([\w-]+)\)/.exec(body)?.[1];
    expect(color(idle), 'the idle count names its ink').toBeTruthy();
    expect(color(sel), 'the chosen count names its ink').toBeTruthy();
    for (const s of stops(/background: (linear-gradient\([^;]+\));/.exec(idle)![1]!, 'dark')) expect(apcaLc(ink(color(idle)!, 'dark'), s)).toBeGreaterThanOrEqual(75);
    for (const s of stops(/background: (linear-gradient\([^;]+\));/.exec(sel)![1]!, 'dark')) expect(apcaLc(ink(color(sel)!, 'dark'), s)).toBeGreaterThanOrEqual(75);
  });

  it('the phone count follows Text Size (no fixed px)', () => {
    expect(css('stats.css')).not.toMatch(/\.ch-tab-t__n,[^{]*\{\s*font-size: 12px;/);
  });
});

describe('F-0035: the Ledger eyebrow', () => {
  const GOLDEN = [0xe8, 0xb4, 0x6a] as RGB;
  it('light: 5.5:1 on the page and the workspace, and Lc 60 there and under the golden-hour tint', () => {
    const eb = ink('ch-ledger-eyebrow', 'light');
    for (const bg of ['ch-bg-page', 'ch-workspace']) {
      expect(contrast(eb, ink(bg, 'light')), bg).toBeGreaterThanOrEqual(5.5);
      expect(apcaLc(eb, ink(bg, 'light')), bg).toBeGreaterThanOrEqual(60);
    }
    expect(apcaLc(eb, over(GOLDEN, 0.07, ink('ch-bg-page', 'light')))).toBeGreaterThanOrEqual(60);
  });
  it('dark: Lc 60 on the page, the workspace and the surface', () => {
    for (const bg of ['ch-bg-page', 'ch-workspace', 'ch-bg-surface']) expect(apcaLc(ink('ch-ledger-eyebrow', 'dark'), ink(bg, 'dark')), bg).toBeGreaterThanOrEqual(60);
  });
});

describe('F-0036: the N keycap on a primary key at night', () => {
  it('sinks into the face: ivory reads 4.5:1 on every stop, and Home has no override', () => {
    const r = rule('ui.css', ":where(html[data-fw-theme='dark']) :is(.ch-btn--primary, .ch-btn--ink) .ch-btn__kbd");
    expect(r).toMatch(/background: rgb\(0 0 0 \/ 0\.18\)/);
    expect(r).toMatch(/color: var\(--ch-on-green-ink\)/);
    const face = /:where\(html\[data-fw-theme='dark'\]\) \.ch-btn--primary \{\s*background: (linear-gradient\([^;]+\))/.exec(css('ui.css'))![1]!;
    for (const s of stops(face, 'dark')) expect(contrast(ink('ch-on-green-ink', 'dark'), over([0, 0, 0], 0.18, s))).toBeGreaterThanOrEqual(4.5);
    expect(css('home.css')).not.toMatch(/\.ch-btn--primary \.ch-btn__kbd \{/);
  });
});

describe('F-0037: the strokes-gained board callouts sit on a solid deep green', () => {
  it('the halo is green-900 and at least 7px wide on the end callout and Best', () => {
    for (const sel of ['.ch-st[data-canopy] .ch-sgt__callout', '.ch-st[data-canopy] .ch-sgt__best text']) {
      const r = rule('stats.css', sel);
      expect(r, sel).toMatch(/stroke: var\(--ch-green-900\)/);
      expect(Number(/stroke-width: (\d+)px/.exec(r)?.[1] ?? 0), sel).toBeGreaterThanOrEqual(7);
    }
  });
});

describe('F-0038: the struck old time on Home’s Next row', () => {
  it('the row detail is not faded, and the struck time takes its line’s ink', () => {
    expect(rule('home.css', '.ch-h-agenda__row.is-next .ch-h-agenda__b')).not.toMatch(/opacity/);
    expect(rule('home.css', '.ch-h-agenda__row.is-next .ch-was')).toMatch(/color: inherit/);
  });
  it('green-700 on the row tint reads 4.5:1 in both themes and Lc 60 at night', () => {
    for (const theme of ['light', 'dark'] as const) {
      const tint = over(ink('ch-green-600', theme), 0.06, ink('ch-workspace', theme));
      expect(contrast(ink('ch-green-700', theme), tint), theme).toBeGreaterThanOrEqual(4.5);
    }
    expect(apcaLc(ink('ch-green-700', 'dark'), over(ink('ch-green-600', 'dark'), 0.06, ink('ch-workspace', 'dark')))).toBeGreaterThanOrEqual(60);
  });
});

describe('F-0039: the Calendar inspector’s Next row', () => {
  it('meta ink is a token, the nested row recesses, and both read 4.5:1 and Lc 70', () => {
    const cal = css('calendar.css');
    expect(cal).not.toMatch(/#bfd5c6/);
    expect(rule('calendar.css', '.ch-in__nb')).toMatch(/color: var\(--ch-on-green-ink-meta\)/);
    expect(rule('calendar.css', '.ch-in__today .ch-in__next')).toMatch(/background: rgb\(0 0 0 \/ 0\.18\)/);
    for (const theme of ['light', 'dark'] as const) {
      const plate = over([0xb9, 0xcb, 0xea], 0.06, ink('ch-green-fill-700', theme));
      const row = over([0, 0, 0], 0.18, plate);
      const meta = ink('ch-on-green-ink-meta', theme);
      expect(contrast(meta, row), theme).toBeGreaterThanOrEqual(4.5);
      expect(apcaLc(meta, row), theme).toBeGreaterThanOrEqual(70);
      expect(contrast(ink('ch-stage-ink', theme), over([255, 255, 255], 0.14, row)), `${theme} time chip`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('F-0040: the chosen switcher segment at night', () => {
  it('ivory reaches 4.5:1 and Lc 75 on every stop of the dark --ch-seg-on-bg', () => {
    const on = ink('ch-seg-on-ink', 'dark');
    for (const s of stops(raw('ch-seg-on-bg', 'dark'), 'dark')) {
      expect(contrast(on, s)).toBeGreaterThanOrEqual(4.5);
      expect(apcaLc(on, s)).toBeGreaterThanOrEqual(75);
    }
  });
  it('the chosen qualifier filter’s count is not faded', () => {
    const q = css('qualifiers.css');
    for (const m of q.matchAll(/\.ch-qf-pill\[aria-pressed='true'\] span \{([^}]*)\}/g)) expect(m[1]).not.toMatch(/opacity/);
  });
});

describe('opacity under 1 never fades text (fix plan PR 3, shared root 4)', () => {
  // A rule that sets ink or type and fades it. Fading text makes its contrast depend on whatever is behind it; use an ink
  // token instead. Disabled controls are exempt. KNOWN lists the ones found on 2026-10-30 outside the audit's findings:
  // it may only shrink.
  const KNOWN = new Set([
    'calendar.css .ch-cg__title span',
    'classes.css .ch-cl-card__week em',
    "messages.css .ch-msp-chip[aria-pressed='true'] span",
    'roster.css .ch-rs-em__x',
    'rounds.css .ch-rd-strip span.is-played em',
    'shell.css .ch-nav__section',
    'shell.css .ch-sidebar .ch-nav__section',
    'stats.css .ch-fws__z em',
  ]);
  it('no rule that sets color or font fades below 1, but a disabled state', () => {
    const found: string[] = [];
    for (const f of readdirSync(STYLES).filter((x) => x.endsWith('.css'))) {
      const src = css(f).replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const sel = m[1]!.trim().replace(/\s+/g, ' ');
        const o = /(?<![-\w])opacity:\s*([\d.]+)/.exec(m[2]!);
        if (!o || Number(o[1]) === 0 || Number(o[1]) >= 1) continue;
        if (!/(?<![-\w])(color|font|font-size):/.test(m[2]!)) continue;
        if (/:disabled|\[disabled\]|aria-disabled/.test(sel)) continue;
        const id = `${f} ${sel.split(',').pop()!.trim()}`;
        if (!KNOWN.has(id)) found.push(id);
      }
    }
    expect(found).toEqual([]);
  });
});
