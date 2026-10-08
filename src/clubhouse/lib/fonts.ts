import { Instrument_Sans, Instrument_Serif, JetBrains_Mono } from 'next/font/google';

/**
 * Clubhouse type: Instrument Sans (variable weight and width) for everything,
 * JetBrains Mono for kbd only. Exposed as CSS variables on the Clubhouse root
 * so the tokens can read them; nothing outside the root sees them.
 */
export const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  weight: 'variable',
  axes: ['wdth'],
  display: 'swap',
  variable: '--ch-font-instrument',
});

/** Display serif for page titles and greetings (owner, 2026-10-06: "expensive, Masters, old money"); Instrument Sans's
 *  own serif companion, so the two share proportions. Headlines only, never body or data. */
export const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--ch-font-instrument-serif',
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500'],
  display: 'swap',
  variable: '--ch-font-jetbrains',
});

export const clubhouseFontVariables = `${instrumentSans.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable}`;
