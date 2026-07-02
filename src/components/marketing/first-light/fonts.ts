/**
 * fonts.ts — Fraunces for the First Light landing surface (display /
 * serif moments only — docs/LANDING_ENTRY_WORLD_DESIGN.md decision #1).
 *
 * A dedicated `next/font/google` load, separate from `src/lib/fonts.ts`'s
 * single-weight-600 `fraunces` export (used by the BaseballHelm Living
 * Annual kit). The landing surface needs a wider weight range across nine
 * moments (eyebrow-adjacent serif accents down to a hero display weight),
 * so moments import THIS module rather than reaching into `@/lib/fonts` or
 * touching the root layout / tailwind.config (out of scope for this lane —
 * see CONTRACTS.md).
 *
 * No italic style is loaded: per feedback_helm_no_italic_accent_word, Helm
 * marketing headlines never italicize a single accent word. Moments should
 * lean on weight/size/color for emphasis instead of `font-style: italic`.
 */
import { Fraunces } from 'next/font/google';

export const flFraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal'],
  display: 'swap',
  variable: '--fl-font-serif',
});
