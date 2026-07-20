import { permanentRedirect } from 'next/navigation';

/**
 * `/golf/dashboard/my-game-profile` — LEGACY, permanently redirected.
 *
 * Game Profile is now the `profile` drill of the Player CoachHelm Spine &
 * Stage home (spec §5.3) — the stage IS the nav, so this standalone route no
 * longer renders its own page. `surface-registry.ts`'s `my-game-profile-tab`
 * entry is `legacy: true, hidden: true` and points its canonical href
 * here-onward at `/golf/dashboard/coachhelm?view=profile`.
 */
export default function MyGameProfileRedirect(): never {
  permanentRedirect('/golf/dashboard/coachhelm?view=profile');
}
