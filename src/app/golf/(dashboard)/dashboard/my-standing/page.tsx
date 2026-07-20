import { permanentRedirect } from 'next/navigation';

/**
 * `/golf/dashboard/my-standing` — LEGACY, permanently redirected.
 *
 * Standing is now the `standing` drill of the Player CoachHelm Spine & Stage
 * home (spec §5.3) — the stage IS the nav, so this standalone route no
 * longer renders its own page. `surface-registry.ts`'s `my-standing-tab`
 * entry is `legacy: true, hidden: true` and points its canonical href
 * here-onward at `/golf/dashboard/coachhelm?view=standing`.
 */
export default function MyStandingRedirect(): never {
  permanentRedirect('/golf/dashboard/coachhelm?view=standing');
}
