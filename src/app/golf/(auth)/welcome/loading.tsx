import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Loading UI for /golf/welcome.
 *
 * This used to render `FormPageSkeleton` — the legacy cream form skeleton, with
 * input rows and a submit-button block, for a screen that is a single greeting
 * and has no form on it. Entering the welcome screen therefore painted a form
 * silhouette, then a bare gradient, then the greeting: the same "different
 * skeleton, then it switches back" flash reported on the dashboard.
 *
 * The welcome screen's own first frame is just its page wash — the greeting
 * comes off the local clock and needs no network, and everything else fades in
 * on top — so the honest placeholder is that wash and nothing else. The wash
 * itself (`min-h-[100svh] bg-canvas bg-canvas-gradient`) matches the `Suspense`
 * fallback `page.tsx` renders around `WelcomeContent` (page.tsx:471-481) byte
 * for byte, so the hand-off between this route boundary and that inner one
 * repaints nothing.
 *
 * `aria-busy="true"` plus an `sr-only` label (not `aria-label`, which would
 * suppress the span's text from the accessible-name computation) is the
 * pattern this sweep verified elsewhere for a fallback with no visible copy —
 * see `dashboard/alerts/loading.tsx`.
 */
export default function GolfWelcomeLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={fairwayScope('min-h-[100svh] bg-canvas bg-canvas-gradient')}
    >
      <span className="sr-only">Loading…</span>
    </div>
  );
}
