import { Instrument_Sans, JetBrains_Mono } from 'next/font/google';

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
  variable: '--ch-font-jetbrains',
});

export const clubhouseFontVariables = `${instrumentSans.variable} ${jetbrainsMono.variable}`;
