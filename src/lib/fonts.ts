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
import { Fraunces } from 'next/font/google';

export const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['600'],
  variable: '--font-fraunces',
  display: 'swap',
});
