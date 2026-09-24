/**
 * BaseballHelm web fonts.
 *
 * GolfHelm / Fairway loads NO web fonts: display, body and numerals all ride
 * the Apple SF system stack (src/styles/design-tokens.css `--fw-font-*`).
 * Fragment Mono was retired 2026-09-23 (owner decision: numbers use SF with
 * tabular figures, no slashed zero), and the root layout no longer registers
 * Geist / DM Sans / Playfair, so the golf app ships zero font bytes.
 *
 * `next/font` calls run at module scope, so every importer of this module
 * pulls every font declared here. Import it ONLY from BaseballHelm layouts
 * (src/app/baseball/layout.tsx); a golf import would re-ship these faces to
 * the golf app.
 */
import { Fraunces, Space_Grotesk } from 'next/font/google';
import { GeistMono } from 'geist/font/mono';

/**
 * Fraunces — the editorial serif (`font-serif`), single weight 600 + latin
 * subset to keep the file under 35KB. Baseball eyebrows / dialog titles.
 */
export const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['600'],
  variable: '--font-fraunces',
  display: 'swap',
});

/**
 * Space Grotesk — the BaseballHelm "Living Annual" display + number face.
 * One athletic grotesk carries both player names/hero numerals AND the stat
 * figures (tabular-nums), per founder direction (2026-07-01). Exposed as
 * `--font-space-grotesk` → `font-annual`.
 */
export const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

/** Geist Mono — BaseballHelm's code-like identifiers (`font-mono`). */
export const geistMono = GeistMono;

/**
 * CSS that defines the font variables on `:root` for the lifetime of the
 * layout that renders it.
 *
 * `next/font`'s `.variable` class only scopes the variable to the element it
 * is put on, and a nested layout cannot put a class on <html>. A wrapper div
 * would miss everything Radix portals into <body> (dialogs, popovers,
 * toasts), so the variables are declared on :root instead. Render with
 * `dangerouslySetInnerHTML`: the family names contain quotes that React would
 * escape as text children.
 */
export function rootFontVariablesCss(
  fonts: ReadonlyArray<{ variable: string; family: string }>,
): string {
  return `:root{${fonts.map((f) => `${f.variable}:${f.family};`).join('')}}`;
}

/** The BaseballHelm font variables, ready for `rootFontVariablesCss`. */
export const baseballFontVariables = [
  { variable: '--font-fraunces', family: fraunces.style.fontFamily },
  { variable: '--font-space-grotesk', family: spaceGrotesk.style.fontFamily },
  { variable: '--font-geist-mono', family: geistMono.style.fontFamily },
] as const;
