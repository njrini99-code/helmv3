import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for /golf/admin/crm.
 *
 * What it covers: the window between the streamed shell arriving and this
 * segment's payload arriving. That gap IS the admin session check —
 * /golf/admin/layout.tsx awaits `getUserResilient` plus the admin-role read
 * before the segment renders — so "Checking admin session…" is the literal
 * truth, and the single centered spinner row is deliberately cheap.
 *
 * What it does NOT need to shape-match any more: CRMPage's `sessionReady`
 * state now starts `true` (page.tsx), because the server layout already
 * verified this request. The page's first paint is therefore the real shell
 * (rail, topbar, tab content with its own loading skeletons), not a second
 * "checking session" spinner, and the coach/template fetches start on mount.
 *
 * Why not reserve the settled two-column geometry here: React 19.2 reveals
 * streamed Suspense content on the next animation frame, and a hidden tab
 * gets none, so whatever this file renders is exactly what a background tab
 * shows until it is viewed. A spinner with an honest label is the right
 * thing to leave on screen for that.
 */
export default function Loading() {
  return (
    <div
      className={fairwayScope('min-h-dvh bg-canvas flex items-center justify-center')}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Checking admin session…</span>
      <div aria-hidden="true" className="flex items-center gap-3 text-sm text-text-secondary">
        <span className="h-4 w-4 rounded-full border-2 border-border-strong border-t-accent-500 animate-spin" />
        Checking admin session…
      </div>
    </div>
  );
}
