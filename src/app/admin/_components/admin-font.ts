import { Instrument_Sans } from 'next/font/google';

/**
 * The admin's face: Instrument Sans, the one Clubhouse sets everything in (src/clubhouse/lib/fonts.ts), loaded here
 * as the admin's own copy because Clubhouse exposes its font variables only on the Clubhouse root. The variable is
 * read by admin-ivory.css (--fw-font-sans) and the spaces (bridge-space.css).
 */
export const adminSans = Instrument_Sans({
  subsets: ['latin'],
  weight: 'variable',
  axes: ['wdth'],
  display: 'swap',
  variable: '--bridge-font-sans',
});
