/**
 * Fairway token contrast floor (CON-09).
 *
 * Owner direction 2026-09-23: keep the warm cream / dark cream and the depth,
 * but raise contrast everywhere and make green the contrasting colour. This
 * test holds every ink token to WCAG 2.2 AA against every cream surface it can
 * land on, in light and dark, computed straight from
 * src/styles/design-tokens.css (OKLCH → sRGB, same maths as
 * canvas-color-sync.test.ts). A token retune that drops a pair below its floor
 * fails here, naming the pair, before it reaches a screen.
 *
 * Floors: 4.5:1 for text (1.4.3), 3:1 for control borders, icons and focus
 * indicators (1.4.11).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type RGB = [number, number, number];

const css = readFileSync(join(process.cwd(), 'src/styles/design-tokens.css'), 'utf8');

/** The declarations inside the first `{…}` block that starts at `start`. */
function blockDecls(start: number): Map<string, string> {
  const open = css.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) {
      end = i;
      break;
    }
  }
  const body = css.slice(open + 1, end).replace(/\/\*[\s\S]*?\*\//g, '');
  const out = new Map<string, string>();
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out.set(m[1]!, m[2]!.trim());
  return out;
}

const light = blockDecls(css.search(/^:root\s*\{/m));
const dark = blockDecls(css.search(/^\.dark,?\s*$/m));

function oklchToRgb(L: number, C: number, h: number): RGB {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return lin.map((x) => {
    const c = Math.min(1, Math.max(0, x));
    return Math.round((c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) * 255);
  }) as RGB;
}

interface Colour {
  rgb: RGB;
  alpha: number;
}

/** Resolve a token to a colour in a theme (dark falls back to :root). */
function resolve(name: string, theme: 'light' | 'dark', seen = 0): Colour {
  const raw = (theme === 'dark' ? dark.get(name) : undefined) ?? light.get(name);
  if (!raw) throw new Error(`${name} is not defined`);
  if (seen > 8) throw new Error(`${name}: var() cycle`);
  const ref = raw.match(/^var\((--[\w-]+)\)$/);
  if (ref) return resolve(ref[1]!, theme, seen + 1);
  const ok = raw.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)$/);
  if (ok) return { rgb: oklchToRgb(+ok[1]!, +ok[2]!, +ok[3]!), alpha: ok[4] ? +ok[4] : 1 };
  const rgb = raw.match(/^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*([\d.]+))?\s*\)$/);
  if (rgb) return { rgb: [+rgb[1]!, +rgb[2]!, +rgb[3]!], alpha: rgb[4] ? +rgb[4] : 1 };
  throw new Error(`${name}: unsupported colour ${raw}`);
}

const over = (fg: Colour, bg: RGB): RGB =>
  fg.rgb.map((c, i) => Math.round(c * fg.alpha + bg[i]! * (1 - fg.alpha))) as RGB;

const luminance = ([r, g, b]: RGB) => {
  const f = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a: RGB, b: RGB) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/** Every oklch() stop in the page gradient (what actually paints under text). */
function gradientStops(theme: 'light' | 'dark'): RGB[] {
  const raw = (theme === 'dark' ? dark.get('--fw-gradient-canvas') : undefined) ?? light.get('--fw-gradient-canvas')!;
  return [...raw.matchAll(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/g)].map((m) =>
    oklchToRgb(+m[1]!, +m[2]!, +m[3]!),
  );
}

const SURFACES = [
  '--fw-color-canvas',
  '--fw-color-surface',
  '--fw-color-surface-tint',
  '--fw-color-surface-sunken',
  '--fw-color-elevated',
];

function surfaces(theme: 'light' | 'dark'): Array<[string, RGB]> {
  return [
    ...SURFACES.map((s) => [s, resolve(s, theme).rgb] as [string, RGB]),
    ...gradientStops(theme).map((rgb, i) => [`gradient stop ${i}`, rgb] as [string, RGB]),
  ];
}

/** [ink token, floor] measured against every cream surface + gradient stop. */
const ON_SURFACES: Array<[string, number]> = [
  ['--fw-color-text-primary', 4.5],
  ['--fw-color-text-secondary', 4.5],
  ['--fw-color-text-tertiary', 4.5],
  ['--fw-color-accent-ink', 4.5],
  // accent-700 is the legacy green-ink step (485 `text-accent-700` uses).
  ['--fw-color-accent-700', 4.5],
  ['--fw-color-success-ink', 4.5],
  ['--fw-color-danger-ink', 4.5],
  ['--fw-color-warning-text', 4.5],
  ['--fw-color-border-control', 3],
  ['--fw-color-border-focus', 3],
  ['--fw-color-nav-icon', 3],
  // Chart marks that carry data (CON-08).
  ['--fw-viz-seq-5', 3],
  ['--fw-viz-div-neg', 3],
  ['--fw-viz-div-pos', 3],
];

/** [ink, background, floor] — fixed pairings. */
const PAIRS: Array<[string, string, number]> = [
  ['--fw-color-text-on-accent-fill', '--fw-color-accent-fill', 4.5],
  ['--fw-color-text-on-accent-fill', '--fw-color-accent-fill-hover', 4.5],
  ['--fw-color-text-on-accent', '--fw-color-accent-650', 4.5],
  ['--fw-color-text-on-accent', '--fw-color-accent-750', 4.5],
  ['--fw-color-accent-ink', '--fw-color-accent-wash', 4.5],
  ['--fw-color-text-primary', '--fw-color-accent-wash', 4.5],
  ['--fw-color-success-ink', '--fw-color-success-bg', 4.5],
  ['--fw-color-danger-ink', '--fw-color-danger-bg', 4.5],
  ['--fw-color-warning-ink', '--fw-color-warning-bg', 4.5],
];

describe.each(['light', 'dark'] as const)('Fairway token contrast (%s)', (theme) => {
  it.each(ON_SURFACES)('%s clears %s:1 on every cream surface', (token, floor) => {
    const ink = resolve(token, theme);
    for (const [name, bg] of surfaces(theme)) {
      const r = ratio(over(ink, bg), bg);
      expect(r, `${token} on ${name} = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(floor);
    }
  });

  it.each(PAIRS)('%s on %s clears %s:1', (fg, bg, floor) => {
    const b = resolve(bg, theme).rgb;
    const r = ratio(over(resolve(fg, theme), b), b);
    expect(r, `${fg} on ${bg} = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(floor);
  });

  it('the card lifts off the page (surface vs canvas separation)', () => {
    const r = ratio(resolve('--fw-color-surface', theme).rgb, resolve('--fw-color-canvas', theme).rgb);
    expect(r, `surface vs canvas = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(1.15);
  });

  it('the selected-segment wash reads as a distinct green state on the track', () => {
    const track = resolve('--fw-color-surface-sunken', theme).rgb;
    const wash = resolve('--fw-color-accent-wash', theme).rgb;
    expect(ratio(wash, track)).toBeGreaterThanOrEqual(theme === 'light' ? 1.1 : 1.3);
  });
});
