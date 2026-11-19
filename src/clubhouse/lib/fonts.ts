import { Instrument_Sans, JetBrains_Mono, Norican } from 'next/font/google';
import localFont from 'next/font/local';

/**
 * Clubhouse type: Instrument Sans (variable weight and width) for everything,
 * JetBrains Mono for kbd only. Exposed as CSS variables on the Clubhouse root
 * so the tokens can read them; nothing outside the root sees them. No serif:
 * titles moved to the sans (owner, 2026-10-07) and `--ch-font-serif` resolves
 * to it (tokens.css), so no serif face is loaded.
 */
export const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  weight: 'variable',
  axes: ['wdth'],
  display: 'swap',
  variable: '--ch-font-instrument',
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500'],
  display: 'swap',
  // Only the desktop's key hints use it, so a phone never fetches it ahead of the page (B8).
  preload: false,
  variable: '--ch-font-jetbrains',
});

/** The sidebar's script wordmark, "Golfhelm" (owner, 2026-10-16: "a cursive thing of script" after the sign in). The
 *  brand is on every page, so it is preloaded and the word never swaps in from a fallback. Norican, a script with
 *  real weight (owner, 2026-10-16, picked from twelve: the thin Great Vibes "looks trash" at sidebar size). */
export const norican = Norican({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--ch-font-script',
});

/** L-091: the middle dot alone, from Instrument Sans with room on both sides (its own dot has no side bearings, so
 *  "4 rounds · avg 74.7" set the dot against the words). First in `--ch-font-sans`, limited to U+00B7, so every other
 *  character still comes from Instrument Sans. Two faces of about 1.4 KB, so a bold line keeps a bold dot (lib/fonts/README.md). */
export const separator = localFont({
  src: [
    { path: './fonts/ch-separator-400.otf', weight: '100 549', style: 'normal' },
    { path: './fonts/ch-separator-700.otf', weight: '550 900', style: 'normal' },
  ],
  display: 'swap',
  declarations: [{ prop: 'unicode-range', value: 'U+00B7' }],
  adjustFontFallback: false,
  fallback: [],
  variable: '--ch-font-separator',
});

export const clubhouseFontVariables = `${separator.variable} ${instrumentSans.variable} ${jetbrainsMono.variable} ${norican.variable}`;
