/**
 * Display fonts — kept separate from the root layout so downstream surfaces
 * can import the CSS variable hook without re-triggering the root layout's
 * compilation.
 *
 * Fraunces is loaded with a single weight (600) and single subset (latin) to
 * keep the shipped font file under 35KB. It's used ONLY on hero-card titles
 * and the large strokes-impact numerals — body + nav type stays on DM Sans
 * (our existing sans). Rule 9 of the Insight Delivery design contract.
 */
import { Fraunces, Fragment_Mono } from 'next/font/google';
import localFont from 'next/font/local';

export const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['600'],
  variable: '--font-fraunces',
  display: 'swap',
});

/* ============================================================================
 * Fairway design-system fonts (ADDITIVE — FOUNDATION)
 * ----------------------------------------------------------------------------
 * The locked "Fairway" type system (ui-intelligence/DESIGN-SYSTEM.md §3):
 *   - Display / headings → Fraunces (variable: opsz + wght, SOFT warmth dial,
 *     WONK pinned 0) — editorial soft-serif.
 *   - UI / body          → General Sans (variable, self-hosted from Fontshare;
 *     NOT on Google Fonts) — humanist sans.
 *   - Numeric / ledger   → Fragment Mono — true monospace for code-like data.
 *
 * These expose NEW, namespaced CSS variables (--font-fairway-display /
 * --font-fairway-sans / --font-fairway-mono) and DO NOT touch the existing
 * active body font. The current app keeps DM Sans / Geist exactly as-is; only
 * redesigned Fairway components opt into these via the design-tokens vars
 * (--fw-font-*) or the `font-fw-*` Tailwind utilities.
 *
 * Self-hosted via next/font → zero layout shift, no external request.
 * ========================================================================== */

// Display — Fraunces as a true VARIABLE font, so opsz/wght/SOFT are tunable.
// (Distinct from the single-weight `fraunces` export above, which other code
// already relies on via --font-fraunces — left untouched.) WONK is pinned to 0
// in CSS via font-variation-settings so wonky glyphs never auto-trigger.
export const frauncesDisplay = Fraunces({
  subsets: ['latin'],
  weight: 'variable',
  axes: ['SOFT', 'opsz'],
  variable: '--font-fairway-display',
  display: 'swap',
});

// Numeric / ledger — Fragment Mono (single weight 400 is all the family ships).
export const fragmentMono = Fragment_Mono({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-fairway-mono',
  display: 'swap',
});

// Body / UI — General Sans, self-hosted variable woff2 (weight axis 200–700)
// downloaded from Fontshare into public/fonts/. A single variable file covers
// every weight with zero CLS. `adjustFontFallback` is left at its default so
// next/font emits a metric-matched system fallback.
export const generalSans = localFont({
  src: [
    {
      path: '../../public/fonts/GeneralSans-Variable.woff2',
      weight: '200 700',
      style: 'normal',
    },
  ],
  variable: '--font-fairway-sans',
  display: 'swap',
});
