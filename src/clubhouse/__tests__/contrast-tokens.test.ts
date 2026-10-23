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
