import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route-level loading fallback for `/golf/dashboard/my-development`.
 *
 * This route is now a synchronous `permanentRedirect` stub (see page.tsx) —
 * Player Development moved to the `development` drill of the Player CoachHelm
 * Spine & Stage home at `/golf/dashboard/coachhelm?view=development`, a
 * completely different shell/layout with no correspondence to this route's
 * old masthead+goals+focus-area shape. Some in-app links still point at this
 * legacy path (client-side navigations can briefly show this fallback while
 * the redirect's RSC payload resolves), so this stays a minimal, neutral,
 * content-agnostic placeholder rather than a stale shape-matched skeleton for
 * a page that no longer renders here.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={fairwayScope('flex min-h-[40vh] w-full items-center justify-center bg-canvas')}
    >
      <span className="sr-only">Loading…</span>
    </div>
  );
}
