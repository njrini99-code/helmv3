/**
 * One canvas colour from cold start to first paint.
 *
 * The page canvas is the `--fw-color-canvas` token (src/styles/design-tokens.css,
 * light in :root, dark in the `.dark` block). Places that can't read CSS
 * carry a copy of it:
 *   - the iOS FwColorCanvas colour asset (LaunchScreen.storyboard + the
 *     GolfBridgeViewController view/webView/scrollView background),
 *   - the storyboard's inline namedColor fallback,
 *   - capacitor.config.ts SplashScreen / ios backgroundColor (and the
 *     generated ios/App/App/capacitor.config.json),
 *   - the theme-color fallback in src/lib/golf/theme.ts,
 *   - the ThemeScript pre-paint theme-color (src/components/golf/theme/ThemeScript.tsx),
 *   - public/offline.html, which renders with no app CSS.
 * If the token changes and a copy doesn't, the launch shows a visible colour
 * step (a flash in dark mode). This test fails first, naming the stale copy.
 * The splash PNGs in Splash.imageset are binary and are not checked here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

type RGB = [number, number, number];

/** OKLCH → sRGB (0–255), per Björn Ottosson's OKLab reference matrices. */
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
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
    return Math.round(v * 255);
  }) as RGB;
}

function parseOklch(value: string): RGB {
  const m = value.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/);
  if (!m) throw new Error(`--fw-color-canvas is not a plain oklch() value: ${value}`);
  return oklchToRgb(Number(m[1]), Number(m[2]), Number(m[3]));
}

const hexToRgb = (hex: string): RGB => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
};

/** Within one step per channel (OKLCH → 8-bit rounding). */
function expectClose(actual: RGB, expected: RGB, where: string) {
  const off = actual.some((c, i) => Math.abs(c - expected[i]!) > 1);
  expect(off, `${where}: rgb(${actual}) should match --fw-color-canvas rgb(${expected})`).toBe(false);
}

const tokens = read('src/styles/design-tokens.css');
const canvasDecl = /--fw-color-canvas:\s*([^;]+);/;
const lightToken = parseOklch(tokens.match(canvasDecl)![1]!);
const darkStart = tokens.search(/^\.dark,?\s*$/m);
const darkToken = parseOklch(tokens.slice(darkStart).match(canvasDecl)![1]!);

describe('--fw-color-canvas copies stay in sync', () => {
  it('parses both token values', () => {
    expect(darkStart).toBeGreaterThan(0);
  });

  it('iOS FwColorCanvas colour asset (any + dark)', () => {
    const json = JSON.parse(read('ios/App/App/Assets.xcassets/FwColorCanvas.colorset/Contents.json'));
    const toRgb = (c: { components: Record<string, string> }): RGB =>
      (['red', 'green', 'blue'] as const).map((k) => parseInt(c.components[k]!, 16)) as RGB;
    const any = json.colors.find((c: { appearances?: unknown }) => !c.appearances);
    const dark = json.colors.find((c: { appearances?: { value: string }[] }) =>
      c.appearances?.some((a) => a.value === 'dark'),
    );
    expectClose(toRgb(any.color), lightToken, 'FwColorCanvas (Any)');
    expectClose(toRgb(dark.color), darkToken, 'FwColorCanvas (Dark)');
  });

  it('LaunchScreen.storyboard uses the asset, and its inline fallback matches', () => {
    const sb = read('ios/App/App/Base.lproj/LaunchScreen.storyboard');
    expect(sb).toContain('<color key="backgroundColor" name="FwColorCanvas"/>');
    const m = sb.match(/<namedColor name="FwColorCanvas">\s*<color red="([\d.]+)" green="([\d.]+)" blue="([\d.]+)"/);
    expect(m).not.toBeNull();
    expectClose([1, 2, 3].map((i) => Math.round(Number(m![i]) * 255)) as RGB, lightToken, 'storyboard namedColor');
  });

  it('GolfBridgeViewController reads the asset', () => {
    expect(read('ios/App/App/GolfBridgeViewController.swift')).toContain('UIColor(named: "FwColorCanvas")');
  });

  it('capacitor.config.ts and the generated iOS config use the light canvas', () => {
    const ts = read('capacitor.config.ts');
    const json = JSON.parse(read('ios/App/App/capacitor.config.json'));
    const splash = ts.match(/SplashScreen:\s*{[^}]*backgroundColor:\s*'(#[0-9A-Fa-f]{6})'/);
    const ios = ts.match(/ios:\s*{[^}]*backgroundColor:\s*'(#[0-9A-Fa-f]{6})'/);
    expectClose(hexToRgb(splash![1]!), lightToken, 'capacitor.config.ts SplashScreen');
    expectClose(hexToRgb(ios![1]!), lightToken, 'capacitor.config.ts ios');
    expectClose(hexToRgb(json.plugins.SplashScreen.backgroundColor), lightToken, 'capacitor.config.json SplashScreen');
    expectClose(hexToRgb(json.ios.backgroundColor), lightToken, 'capacitor.config.json ios');
  });

  it('theme.ts fallback theme-color', () => {
    const m = read('src/lib/golf/theme.ts').match(/THEME_COLOR = \{ dark: '(#[0-9a-fA-F]{6})', light: '(#[0-9a-fA-F]{6})' \}/);
    expectClose(hexToRgb(m![1]!), darkToken, 'theme.ts THEME_COLOR.dark');
    expectClose(hexToRgb(m![2]!), lightToken, 'theme.ts THEME_COLOR.light');
  });

  it('ThemeScript pre-paint theme-color (dark + light)', () => {
    const m = read('src/components/golf/theme/ThemeScript.tsx').match(/d\?'(#[0-9a-fA-F]{6})':'(#[0-9a-fA-F]{6})'/);
    expect(m).not.toBeNull();
    expectClose(hexToRgb(m![1]!), darkToken, 'ThemeScript theme-color dark');
    expectClose(hexToRgb(m![2]!), lightToken, 'ThemeScript theme-color light');
  });

  it('public/offline.html canvas (light + dark)', () => {
    const html = read('public/offline.html');
    const all = [...html.matchAll(/--canvas:\s*(#[0-9A-Fa-f]{6})/g)].map((m) => m[1]);
    expect(all).toHaveLength(2);
    expectClose(hexToRgb(all[0]!), lightToken, 'offline.html light --canvas');
    expectClose(hexToRgb(all[1]!), darkToken, 'offline.html dark --canvas');
    expect(read('ios/App/App/public/offline.html')).toBe(html);
  });
});
