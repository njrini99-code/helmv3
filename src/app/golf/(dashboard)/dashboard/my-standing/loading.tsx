import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for `/golf/dashboard/my-standing`.
 *
 * DELIBERATELY EMPTY — this route renders nothing.
 *
 * `page.tsx` here (my-standing/page.tsx:1-20) is a pure `permanentRedirect`
 * shim: My Standing stopped being a standalone surface and is now the
 * `standing` drill of the Player CoachHelm Spine & Stage home
 * (`.claude/rules/golf-feature-ownership.md` — "My Standing" →
 * `…/coachhelm?view=standing`). `next.config.mjs` additionally intercepts
 * `/golf/dashboard/my-standing` at the framework routing layer before this
 * segment ever renders; this component is only a fallback for anything the
 * config layer misses.
 *
 * The previous version of this file drew a full masthead + 3-category
 * StandingStrip grid — a real fabricated screen for a route that no longer
 * renders one. Fixed to the same near-empty shape as the verified-correct
 * reference for this case, `dashboard/alerts/loading.tsx`. `bg-canvas`
 * alone keeps the warm ground continuous if the redirect is ever slow
 * enough to paint.
 */
export default function Loading() {
  return (
    <div
      className={fairwayScope('min-h-full bg-canvas')}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Redirecting…</span>
    </div>
  );
}
