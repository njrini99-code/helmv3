import { permanentRedirect } from 'next/navigation';

/**
 * `/golf/dashboard/my-development` — LEGACY, permanently redirected.
 *
 * Player Development is now the `development` drill of the Player CoachHelm
 * Spine & Stage home (spec §5.3) — the stage IS the nav, so this standalone
 * route no longer renders its own page. `surface-registry.ts`'s
 * `my-development-tab` entry is `legacy: true, hidden: true` and points its
 * canonical href here-onward at `/golf/dashboard/coachhelm?view=development`.
 */
export default function MyDevelopmentRedirect(): never {
  permanentRedirect('/golf/dashboard/coachhelm?view=development');
}
