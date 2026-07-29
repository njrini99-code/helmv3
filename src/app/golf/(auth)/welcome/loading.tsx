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
 * on top — so the honest placeholder is that wash and nothing else.
 */
export default function GolfWelcomeLoading() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={fairwayScope('min-h-[100svh] bg-canvas bg-canvas-gradient')}
    />
  );
}
