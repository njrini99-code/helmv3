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

export const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['600'],
  variable: '--font-fraunces',
  display: 'swap',
});

/* ============================================================================
 * Fairway design-system fonts (ADDITIVE — FOUNDATION)
 * ----------------------------------------------------------------------------
 * The locked "Fairway" type system:
 *   - Display / headings → Apple SF Pro Display system stack (no webfont).
 *   - UI / body          → Apple SF Pro Text system stack (no webfont).
 *   - Numeric / ledger   → Fragment Mono — true monospace for code-like data.
 *
 * The display + sans roles ride the native Apple system stack (defined inline
 * in src/styles/design-tokens.css `--fw-font-display` / `--fw-font-sans` and
 * the `font-fw-display` / `font-fw-sans` Tailwind utilities), so the UI reads
 * like a native Apple app and ships zero font bytes for those roles. Only the
 * numeric role loads a webfont, exposing the namespaced `--font-fairway-mono`
 * CSS variable. It DOES NOT touch the existing active body font — the current
 * app keeps DM Sans / Geist exactly as-is; only redesigned Fairway components
 * opt into the role via the design-tokens var (--fw-font-mono) or the
 * `font-fw-mono` Tailwind utility.
 *
 * Self-hosted via next/font → zero layout shift, no external request.
 * ========================================================================== */

// Numeric / ledger — Fragment Mono (single weight 400 is all the family ships).
export const fragmentMono = Fragment_Mono({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-fairway-mono',
  display: 'swap',
});
